import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';

// You'll need to set your API keys here
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'your-gemini-api-key-here';
const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || 'your-centrala-api-key-here';

async function readAllTranscriptions(): Promise<{ [filename: string]: string }> {
  const transcriptionsDir = './s02/e01_interrogation/transcriptions';
  const transcriptions: { [filename: string]: string } = {};
  
  if (!fs.existsSync(transcriptionsDir)) {
    throw new Error('Transcriptions folder does not exist. Please run the transcription script first.');
  }
  
  const files = fs.readdirSync(transcriptionsDir).filter(file => file.endsWith('.txt'));
  
  for (const file of files) {
    const filePath = path.join(transcriptionsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const personName = path.parse(file).name;
    transcriptions[personName] = content.trim();
  }
  
  return transcriptions;
}

function createPolishPrompt(transcriptions: { [filename: string]: string }): string {
  let prompt = `Jesteś ekspertem w analizie informacji i wyszukiwaniu danych. Twoim zadaniem jest znalezienie ulicy Instytutu, na której pracuje i wykłada profesor Andrzej Maj.

DANE DO ANALIZY:
Masz do dyspozycji transkrypcje rozmów z różnymi osobami. Przeanalizuj je dokładnie i znajdź wszelkie informacje dotyczące profesora Andrzeja Maja oraz miejsca jego pracy.

TRANSKRYPCJE:

`;

  // Add all transcriptions to the prompt
  for (const [person, transcript] of Object.entries(transcriptions)) {
    prompt += `=== TRANSKRYPCJA: ${person.toUpperCase()} ===\n`;
    prompt += `${transcript}\n\n`;
  }

  prompt += `ZADANIE:
1. Przeanalizuj wszystkie transkrypcje i znajdź informacje o profesorze Andrzeju Maju
2. Zidentyfikuj instytut i uczelnię, gdzie pracuje
3. Wykorzystaj dostępne w internecie informacje o tej instytucji
4. Znajdź dokładną ulicę, na której znajduje się ten instytut. Pamiętaj, że chodzi o ulicę na której jest instytut a nie uczelnia.
5. Przedstaw swoje rozumowanie krok po kroku

WYMAGANIA:
- Wyjaśnij dokładnie, jak dochodzisz do swoich wniosków
- Podaj źródła informacji z transkrypcji
- Wykorzystaj wiedzę o polskich instytutach i uczelniach
- Podaj końcową odpowiedź: nazwę ulicy na której znajduje się ten konkretny instytut

Rozpocznij analizę:`;

  return prompt;
}

async function analyzeWithGemini(prompt: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}

async function extractStreetNameWithFlash(proAnalysis: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const extractPrompt = `Przeanalizuj poniższą odpowiedź i wyciągnij z niej TYLKO nazwę ulicy. Odpowiedz jedynie nazwą ulicy, bez żadnych dodatkowych słów, wyjaśnień czy komentarzy.

ANALIZA DO PRZETWORZENIA:
${proAnalysis}

ODPOWIEDŹ (tylko nazwa ulicy):`;

  try {
    const result = await model.generateContent(extractPrompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Error calling Gemini Flash API:', error);
    throw error;
  }
}

async function sendToCentrala(streetName: string): Promise<any> {
  const payload = {
    task: "mp3",
    apikey: CENTRALA_API_KEY,
    answer: streetName
  };

  try {
    const response = await fetch('https://c3ntrala.ag3nts.org/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error sending to Centrala API:', error);
    throw error;
  }
}

/**
 * Extracts and submits the flag from the response text
 */
async function extractAndSubmitFlag(responseText: string): Promise<void> {
  const flagMatch = responseText.match(/\{\{FLG:(.*?)\}\}/s);
  if (!flagMatch || !flagMatch[1]) {
    console.log("No flag found in the response");
    return;
  }
  
  const extractedFlag = flagMatch[1].trim();
  console.log(`Extracted flag: "${extractedFlag}"`);
  
  const payload = new URLSearchParams();
  payload.append("key", CENTRALA_API_KEY);
  payload.append("flag", extractedFlag);

  try {
    const response = await fetch('https://c3ntrala.ag3nts.org/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString()
    });
    
    const flagResponseText = await response.text();
    console.log(`Flag submission response: ${flagResponseText}`);
  } catch (error) {
    console.error(`Error submitting flag: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  try {
    console.log('Reading transcriptions...');
    const transcriptions = await readAllTranscriptions();
    
    console.log(`Found ${Object.keys(transcriptions).length} transcriptions:`);
    for (const person of Object.keys(transcriptions)) {
      console.log(`- ${person}`);
    }
    
    console.log('\nCreating Polish prompt for Gemini...');
    const prompt = createPolishPrompt(transcriptions);
    
    console.log('\nSending to Gemini 2.0 Flash Exp for analysis...');
    const analysis = await analyzeWithGemini(prompt);
    
    console.log('\n=== GEMINI PRO ANALYSIS ===');
    console.log(analysis);
    
    console.log('\nSending to Gemini Flash to extract street name...');
    const streetName = await extractStreetNameWithFlash(analysis);
    
    console.log('\n=== EXTRACTED STREET NAME ===');
    console.log(streetName);
    
    
    console.log('\nSending to Centrala API...');
    const centralaResponse = await sendToCentrala(streetName);
    
    console.log('\n=== CENTRALA API RESPONSE ===');
    console.log(centralaResponse);
    
    // Extract and submit flag if found in the response
    const responseText = typeof centralaResponse === 'string' ? centralaResponse : JSON.stringify(centralaResponse);
    await extractAndSubmitFlag(responseText);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error); 