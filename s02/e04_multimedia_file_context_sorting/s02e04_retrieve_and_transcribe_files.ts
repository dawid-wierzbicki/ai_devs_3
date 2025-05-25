import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import FormData from 'form-data';
import fetch from 'node-fetch';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';

// Validate required API keys
if (!process.env.GEMINI_API_KEY) {
  console.log("ERROR: GEMINI_API_KEY not set in environment variables");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY not set in environment variables");
  process.exit(1);
}

if (!CENTRALA_API_KEY) {
  console.error("ERROR: CENTRALA_API_KEY not set in environment variables");
  process.exit(1);
}

interface WhisperResponse {
  text: string;
}

async function processTextFile(textFileName: string): Promise<void> {
  try {
    // Check if already processed
    const outputDir = path.join(__dirname, 'files_processed', 'text');
    const outputFileName = textFileName.replace('.txt', '.txt.txt');
    const outputPath = path.join(outputDir, outputFileName);
    
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️  Skipping ${textFileName} - already processed (file exists in processed folder)`);
      return;
    }

    // Read the text file from source
    const filesDirectory = path.join(__dirname, 'files_to_process');
    const sourcePath = path.join(filesDirectory, textFileName);
    
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Text file not found: ${textFileName}`);
    }

    // Create output directory if it doesn't exist
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Copy the file
    await fs.promises.copyFile(sourcePath, outputPath);
    
    console.log(`✓ Copied ${textFileName} to files_processed/text/`);
    
  } catch (error) {
    console.error(`Error processing text file ${textFileName}:`, error);
    throw error;
  }
}

async function processImageWithGemini(imageFileName: string): Promise<void> {
  try {
    // Check if already processed
    const outputDir = path.join(__dirname, 'files_processed', 'images');
    const outputFileName = imageFileName.replace('.png', '.png.txt');
    const outputPath = path.join(outputDir, outputFileName);
    
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️  Skipping ${imageFileName} - already processed (${outputFileName} exists)`);
      return;
    }

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // Read the image file
    const filesDirectory = path.join(__dirname, 'files_to_process');
    const imagePath = path.join(filesDirectory, imageFileName);
    
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imageFileName}`);
    }

    const imageBuffer = await fs.promises.readFile(imagePath);
    const imageBase64 = imageBuffer.toString('base64');

    // Prepare the prompt for OCR
    const prompt = "Please extract all text content from this image. Provide a clean, accurate transcription of any text you can see.";

    // Call Gemini API
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: 'image/png'
        }
      }
    ]);

    const response = await result.response;
    const extractedText = response.text();

    // Create output directory if it doesn't exist
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Save the extracted text to a new file
    await fs.promises.writeFile(outputPath, extractedText, 'utf-8');
    
    console.log(`✓ Processed ${imageFileName} -> ${outputFileName}`);
    console.log(`Extracted text saved to: ${outputPath}`);
    
  } catch (error) {
    console.error(`Error processing image ${imageFileName}:`, error);
    throw error;
  }
}

async function processAudioFile(audioFileName: string): Promise<void> {
  try {
    // Check if already processed
    const outputDir = path.join(__dirname, 'files_processed', 'audio');
    const outputFileName = audioFileName.replace('.mp3', '.mp3.txt');
    const outputPath = path.join(outputDir, outputFileName);
    
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️  Skipping ${audioFileName} - already processed (${outputFileName} exists)`);
      return;
    }

    // Read the audio file from source
    const filesDirectory = path.join(__dirname, 'files_to_process');
    const sourcePath = path.join(filesDirectory, audioFileName);
    
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Audio file not found: ${audioFileName}`);
    }

    console.log(`🎵 Transcribing with OpenAI Whisper...`);

    // Prepare form data for Whisper API
    const formData = new FormData();
    formData.append('file', fs.createReadStream(sourcePath));
    formData.append('model', 'whisper-1');

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json() as WhisperResponse;
    const transcript = result.text;

    // Create output directory if it doesn't exist
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Save the transcript to a new file
    await fs.promises.writeFile(outputPath, transcript, 'utf-8');
    
    console.log(`✓ Transcribed ${audioFileName} -> ${outputFileName}`);
    console.log(`Transcript saved to: ${outputPath}`);
    
  } catch (error) {
    console.error(`Error processing audio file ${audioFileName}:`, error);
    throw error;
  }
}

async function listFiles() {
  try {
    const filesDirectory = path.join(__dirname, 'files_to_process');
    const files = await fs.promises.readdir(filesDirectory);
    
    const textFiles = files.filter(file => file.endsWith('.txt'));
    const audioFiles = files.filter(file => file.endsWith('.mp3'));
    const imageFiles = files.filter(file => file.endsWith('.png'));
    
    console.log('TEXT FILES (.txt):');
    textFiles.forEach(file => {
      console.log(`- ${file}`);
    });
    
    console.log('\nAUDIO FILES (.mp3):');
    audioFiles.forEach(file => {
      console.log(`- ${file}`);
    });
    
    console.log('\nIMAGE FILES (.png):');
    imageFiles.forEach(file => {
      console.log(`- ${file}`);
    });
    
    return { textFiles, audioFiles, imageFiles };
  } catch (error) {
    console.error('Error reading files directory:', error);
    throw error;
  }
}

// Export the functions for use in other modules
export { listFiles, processImageWithGemini, processTextFile, processAudioFile };

async function analyzeAndCategorizeFiles(): Promise<{
  people: string[];
  hardware: string[];
  other: string[];
}> {
  const categories = {
    people: [] as string[],
    hardware: [] as string[],
    other: [] as string[]
  };

  try {
    const processedDirs = [
      { dir: 'files_processed/text', type: 'text' },
      { dir: 'files_processed/audio', type: 'audio' },
      { dir: 'files_processed/images', type: 'image' }
    ];

    // Initialize Gemini Flash API
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    for (const { dir, type } of processedDirs) {
      const dirPath = path.join(__dirname, dir);
      
      if (!fs.existsSync(dirPath)) {
        console.log(`Directory ${dir} doesn't exist, skipping...`);
        continue;
      }

      const files = await fs.promises.readdir(dirPath);
      const textFiles = files.filter(file => file.endsWith('.txt'));

      console.log(`\nAnalyzing ${textFiles.length} files from ${dir}...`);

      for (const file of textFiles) {
        const filePath = path.join(dirPath, file);
        const content = await fs.promises.readFile(filePath, 'utf-8');

        if (!content.trim()) {
          console.log(`⚠️  Skipping empty file: ${file}`);
          categories.other.push(file);
          continue;
        }

        console.log(`🔍 Analyzing: ${file}`);

        const prompt = `Przeanalizuj poniższą treść i sklasyfikuj ją do jednej z trzech kategorii:

1. "people" - Uwzględniaj tylko notatki zawierające informacje o schwytanych ludziach lub o śladach ich obecności. Jeżeli notatka nie jest o schwytanych ludziach, to nie ta kategoria. Jeżeli notatka nie jest o śladach obecności ludzi, to nie ta kategoria. Jeżeli to notatka robiona przez ludzi, ale nie o schwytanych ludziach lub śladach ich obecności - to nie ta kategoria.
2. "hardware" - Usterki hardwarowe (nie software). Nie oprogramowanie, tylko fizyczne urządzenia.
3. "other" - wszystko inne

Treść do analizy:
${content}

Odpowiedz tylko jednym słowem: "people", "hardware" lub "other"`;

        try {
          const result = await model.generateContent(prompt);
          const response = await result.response;
          const category = response.text().trim().toLowerCase();

          if (category === 'people') {
            categories.people.push(file);
            console.log(`📋 ${file} -> PEOPLE`);
          } else if (category === 'hardware') {
            categories.hardware.push(file);
            console.log(`🔧 ${file} -> HARDWARE`);
          } else {
            categories.other.push(file);
            console.log(`📄 ${file} -> OTHER`);
          }
        } catch (error) {
          console.error(`Error analyzing ${file}:`, error);
          categories.other.push(file);
          console.log(`❌ ${file} -> OTHER (error)`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return categories;
  } catch (error) {
    console.error('Error in analyzeAndCategorizeFiles:', error);
    throw error;
  }
}

async function sendResultsToCentrala(categories: {
  people: string[];
  hardware: string[];
  other: string[];
}): Promise<void> {
  try {
    console.log('\n📤 Sending results to Centrala...');
    
    // Convert filenames back to original format (remove the extra extensions we added)
    const cleanPeople = categories.people.map(file => {
      if (file.endsWith('.txt.txt')) return file.replace('.txt.txt', '.txt');
      if (file.endsWith('.png.txt')) return file.replace('.png.txt', '.png');
      if (file.endsWith('.mp3.txt')) return file.replace('.mp3.txt', '.mp3');
      return file;
    });
    
    const cleanHardware = categories.hardware.map(file => {
      if (file.endsWith('.txt.txt')) return file.replace('.txt.txt', '.txt');
      if (file.endsWith('.png.txt')) return file.replace('.png.txt', '.png');
      if (file.endsWith('.mp3.txt')) return file.replace('.mp3.txt', '.mp3');
      return file;
    });

    const payload = {
      task: "kategorie",
      apikey: CENTRALA_API_KEY,
      answer: {
        people: cleanPeople,
        hardware: cleanHardware
      }
    };

    console.log('📋 Payload to send:');
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch('https://c3ntrala.ag3nts.org/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    console.log('\n=== CENTRALA RESPONSE ===');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n✅ Results sent to Centrala successfully!');
    
    // Extract flag from response and submit to answer endpoint
    if (result) {
      const responseText = typeof result === 'string' ? result : JSON.stringify(result);
      await extractAndSubmitFlag(responseText);
    }
    
  } catch (error) {
    console.error('❌ Error sending results to Centrala:', error);
    throw error;
  }
}

async function processAllFiles(textFiles: string[], audioFiles: string[], imageFiles: string[]): Promise<void> {
  // Process text files (copy them)
  for (const textFile of textFiles) {
    console.log(`Copying: ${textFile}`);
    await processTextFile(textFile);
  }
  
  console.log(''); // Add spacing
  
  // Process audio files (transcribe them)
  for (const audioFile of audioFiles) {
    console.log(`Transcribing: ${audioFile}`);
    await processAudioFile(audioFile);
    console.log(''); // Add spacing between files
  }
  
  // Process each image file with Gemini
  for (const imageFile of imageFiles) {
    console.log(`Processing: ${imageFile}`);
    await processImageWithGemini(imageFile);
    console.log(''); // Add spacing between files
  }
}

// Main method to process all image files
async function main(): Promise<void> {
  try {
    console.log('Starting file processing...\n');
    
    // Get list of all files
    const { textFiles, audioFiles, imageFiles } = await listFiles();
    
    console.log(`\nFound ${textFiles.length} text files to copy...`);
    console.log(`Found ${audioFiles.length} audio files to transcribe...`);
    console.log(`Found ${imageFiles.length} image files to process...\n`);
    
    await processAllFiles(textFiles, audioFiles, imageFiles);
    
    console.log('✅ All files processed successfully!\n');
    
    // Analyze and categorize all processed files
    console.log('🔍 Starting analysis and categorization of processed files...\n');
    const categories = await analyzeAndCategorizeFiles();
    
    // Display results
    console.log('\n=== CATEGORIZATION RESULTS ===');
    console.log(`\n📋 PEOPLE (${categories.people.length} files):`);
    categories.people.forEach(file => console.log(`  - ${file}`));
    
    console.log(`\n🔧 HARDWARE (${categories.hardware.length} files):`);
    categories.hardware.forEach(file => console.log(`  - ${file}`));
    
    console.log(`\n📄 OTHER (${categories.other.length} files):`);
    categories.other.forEach(file => console.log(`  - ${file}`));
    
    console.log('\n✅ Analysis and categorization completed!');
    
    // Send results to Centrala
    await sendResultsToCentrala(categories);
    
  } catch (error) {
    console.error('❌ Error in main processing:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

async function extractAndSubmitFlag(responseText: string): Promise<void> {
  const context = "Flag Extraction";
  try {
      // Extract the flag using the format {{FLG:actual_flag}}
      const flagMatch = responseText.match(/\{\{FLG:(.*?)\}\}/s);
      if (!flagMatch || !flagMatch[1]) {
          console.log(`[${context}] No flag found in the response`);
          return;
      }
      
      const extractedFlag = flagMatch[1].trim();
      console.log(`[${context}] Extracted flag: "${extractedFlag}"`);
      await submitFlagToCentrala(extractedFlag);
  } catch (error) {
      console.error(`[${context}] Error:`, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Submits the obtained flag to the Centrala /answer endpoint.
 */
async function submitFlagToCentrala(flag: string): Promise<void> {
  if (!CENTRALA_API_KEY) {
      console.error("[Configuration] ERROR: CENTRALA_API_KEY environment variable not set and no fallback value available.");
      throw new Error("CENTRALA_API_KEY environment variable not set");
  }

  const answerUrl = 'https://c3ntrala.ag3nts.org/answer';
  console.log(`[Centrala Submission] Submitting flag: "${flag}" to ${answerUrl} using API key (first 4 chars: ${CENTRALA_API_KEY.substring(0,4)}).`);
  
  const payload = new URLSearchParams();
  payload.append("key", CENTRALA_API_KEY);
  payload.append("flag", flag);

  try {
      const response = await fetch(answerUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: payload.toString(),
      });

      const responseText = await response.text();
      if (!response.ok) {
          console.error(`[Centrala Submission] Request failed: ${response.status} - ${responseText}`);
          return;
      }
      console.log(`[Centrala Submission] Response from ${answerUrl} (status ${response.status}):\n${responseText}`);
      if (response.status === 200 && (responseText.toLowerCase().includes("success") || responseText.toLowerCase().includes("ok") || responseText.toLowerCase().includes("correct"))) {
          console.log("[Centrala Submission] Flag submitted successfully to Centrala.");
      } else {
          console.log(`[Centrala Submission] Flag submission to Centrala may have failed or response did not indicate clear success. Received status ${response.status} with response: ${responseText}`);
      }
  } catch (error) {
      console.error(`[Centrala Submission] Error submitting flag to Centrala: ${error instanceof Error ? error.message : String(error)}`);
  }
}
