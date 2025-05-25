import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Validate required API key
if (!OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY not set in environment variables");
  process.exit(1);
}

interface WhisperResponse {
  text: string;
}

async function transcribeAudio(filePath: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));
  formData.append('model', 'whisper-1');

  try {
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
    return result.text;
  } catch (error) {
    console.error(`Error transcribing ${filePath}:`, error);
    return `Error transcribing ${path.basename(filePath)}`;
  }
}

async function transcribeAllFiles() {
  const recordingsDir = './s02/e01_interrogation/recordings';
  const transcriptionsDir = './s02/e01_interrogation/transcriptions';
  
  // Create transcriptions directory if it doesn't exist
  if (!fs.existsSync(transcriptionsDir)) {
    fs.mkdirSync(transcriptionsDir);
  }
  
  const files = fs.readdirSync(recordingsDir).filter(file => file.endsWith('.m4a'));
  
  console.log('Found audio files:', files);
  console.log('Starting transcription...\n');

  for (const file of files) {
    const filePath = path.join(recordingsDir, file);
    const fileName = path.parse(file).name; // Get filename without extension
    const transcriptPath = path.join(transcriptionsDir, `${fileName}.txt`);
    
    console.log(`Processing: ${file}`);
    
    let transcript: string;
    
    // Check if transcript already exists
    if (fs.existsSync(transcriptPath)) {
      console.log(`Transcript already exists, loading from: ${transcriptPath}`);
      transcript = fs.readFileSync(transcriptPath, 'utf8');
    } else {
      console.log(`Transcribing with OpenAI Whisper...`);
      transcript = await transcribeAudio(filePath);
      
      // Save transcript to file
      fs.writeFileSync(transcriptPath, transcript, 'utf8');
      console.log(`Saved to: ${transcriptPath}`);
    }
    
    console.log(`\n=== TRANSCRIPT FOR ${file.toUpperCase()} ===`);
    console.log(transcript);
    console.log('=' .repeat(50) + '\n');
  }
  
  console.log(`All transcriptions completed and saved to ${transcriptionsDir} folder.`);
}

transcribeAllFiles().catch(console.error);
