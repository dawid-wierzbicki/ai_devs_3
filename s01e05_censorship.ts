// TypeScript declarations
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

// --- Configuration ---
const CONFIG = {
    API: {
        CENTRALA_DATA: (apiKey: string) => `https://c3ntrala.ag3nts.org/data/${apiKey}/cenzura.txt`,
        CENTRALA_ANSWER: "https://c3ntrala.ag3nts.org/answer",
        CENTRALA_REPORT: "https://c3ntrala.ag3nts.org/report"
    },
    PROMPTS: {
        GEMINI_CENSORSHIP: "<system>You are a specialized content filter designed to identify and redact personal information in Polish text. Follow these instructions precisely:\n" +
            "1. Identify personal information in the text: names, city, street name and number, and ages.\n" +
            "2. Replace ONLY those personal elements with the word 'CENZURA'.\n" +
            "3. Preserve the exact structure and flow of the original text.\n" +
            "4. Do not make any other changes to the text.\n" +
            "5. Do not add any explanations or comments.\n" +
            "Return only the censored text with personal information replaced with 'CENZURA'.</system>" +
            "<examples>" +
            "<input1> Tożsamość osoby podejrzanej: Piotr Lewandowski. Zamieszkały w Łodzi przy ul. Wspólnej 22. Ma 34 lata." +
            "<output1> Tożsamość osoby podejrzanej: CENZURA. Zamieszkały w CENZURA przy ul. CENZURA. Ma CENZURA lata." +
            "<input2> Dane podejrzanego: Jakub Woźniak. Adres: Rzeszów, ul. Miła 4. Wiek: 33 lata." +
            "<output2> Dane podejrzanego: CENZURA. Adres: CENZURA, ul. CENZURA. Wiek: CENZURA lata." +
            "<input3> Osoba podejrzana to Andrzej Duda. Adres: Barczewo, ul. Niecenzuralna 14. Wiek: 82 lata." +
            "<output3> Osoba podejrzana to CENZURA. Adres: CENZURA, ul. CENZURA. Wiek: CENZURA lata." +
            "</examples>"
    }
};

// --- API Keys ---
const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Validate required API keys
if (!CENTRALA_API_KEY || !GEMINI_API_KEY) {
    console.error("ERROR: Required API keys not set in environment variables");
    process.exit(1);
}

// Initialize Gemini API
const geminiAPI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = geminiAPI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

/**
 * Fetches data from the centrala API endpoint
 */
async function fetchDataFromCentrala(): Promise<string> {
    const url = CONFIG.API.CENTRALA_DATA(CENTRALA_API_KEY);
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Error fetching data: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Censors personal information in the provided text using Gemini
 */
async function censorPersonalInformation(text: string): Promise<string> {
    try {
        const fullPrompt = CONFIG.PROMPTS.GEMINI_CENSORSHIP + "<user>" + text + "</user>";
        const result = await geminiModel.generateContent(fullPrompt);
        return result.response.text();
    } catch (error) {
        console.error(`Error censoring text: ${error instanceof Error ? error.message : String(error)}`);
        // Fallback censoring if Gemini fails
        return text.replace(/([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)|(\d+\s+la[t]a)|(ul\.\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+\d+)/g, 'CENZURA');
    }
}

/**
 * Sends the censored data to the centrala report endpoint
 */
async function sendCensoredReport(censoredText: string): Promise<string> {
    const payload = {
        task: "CENZURA",
        apikey: CENTRALA_API_KEY,
        answer: censoredText
    };

    try {
        const response = await fetch(CONFIG.API.CENTRALA_REPORT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        
        return await response.text();
    } catch (error) {
        console.error(`Error sending report: ${error instanceof Error ? error.message : String(error)}`);
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
        const response = await fetch(CONFIG.API.CENTRALA_ANSWER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: payload.toString()
        });
        
        const responseText = await response.text();
        console.log(`Flag submission response: ${responseText}`);
    } catch (error) {
        console.error(`Error submitting flag: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Main function
 */
async function main() {
    console.log("--- Starting Censorship Task ---");

    try {
        // 1. Fetch data from centrala
        const data = await fetchDataFromCentrala();
        console.log(`Original data: ${data}`);
        
        // 2. Censor personal information
        const censoredData = await censorPersonalInformation(data);
        console.log(`Censored data: ${censoredData}`);
        
        // 3. Submit censored data to report endpoint
        const reportResponse = await sendCensoredReport(censoredData);
        console.log(`Report response: ${reportResponse}`);
        
        // 4. Extract and submit flag if found
        await extractAndSubmitFlag(reportResponse);
    } catch (error) {
        console.error(`Task failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
    
    console.log("--- Censorship Task Completed ---");
}

main().catch(error => {
    console.error(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
