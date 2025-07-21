import { config } from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import fetch from 'node-fetch';
// Load environment variables
config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

// Initialize OpenAI v3
const { Configuration, OpenAIApi } = require('openai');
const openaiConfig = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(openaiConfig);

const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function sendToCentrala(response: any): Promise<string | null> {
    const url = 'https://c3ntrala.ag3nts.org/report';
    console.log('\nSending response to Centrala:', JSON.stringify(response, null, 2));
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(response),
            agent: httpsAgent
        });
        
        const result = await res.text();
        console.log('Centrala response:', result);
        
        // Try to parse the result to extract flag if present
        try {
            const parsedResult = JSON.parse(result);
            if (parsedResult.message && typeof parsedResult.message === 'string') {
                const flagMatch = parsedResult.message.match(/FLG:[A-Z0-9_]+/);
                if (flagMatch) {
                    console.log(`\n🎉 Flag found: ${flagMatch[0]}`);
                    return flagMatch[0];
                }
            }
        } catch (parseError) {
            // If parsing fails, just return the raw result
        }
        
        return result;
    } catch (error) {
        console.error('Error sending response to Centrala:', error);
        return null;
    }
}

async function createTrainingDataset(): Promise<void> {
    console.log('--- Creating JSONL training dataset ---');
    
    // Read correct.txt
    const correctPath = path.join(__dirname, 'lab_data', 'correct.txt');
    const correctData = await fs.promises.readFile(correctPath, 'utf-8');
    const correctLines = correctData.trim().split('\n');
    
    // Read incorect.txt (note the typo in filename)
    const incorrectPath = path.join(__dirname, 'lab_data', 'incorect.txt');
    const incorrectData = await fs.promises.readFile(incorrectPath, 'utf-8');
    const incorrectLines = incorrectData.trim().split('\n');
    
    console.log(`Loaded ${correctLines.length} correct examples`);
    console.log(`Loaded ${incorrectLines.length} incorrect examples`);
    
    // Prepare training data in JSONL format (OpenAI messages format)
    const trainingData: any[] = [];
    
    // Add correct examples (label: 1)
    correctLines.forEach((line, index) => {
        const words = line.trim();
        if (words) {
            trainingData.push({
                "messages": [
                    {"role": "system", "content": "validate data"},
                    {"role": "user", "content": words},
                    {"role": "assistant", "content": "1"}
                ]
            });
        }
    });
    
    // Add incorrect examples (label: 0)  
    incorrectLines.forEach((line, index) => {
        const words = line.trim();
        if (words) {
            trainingData.push({
                "messages": [
                    {"role": "system", "content": "validate data"},
                    {"role": "user", "content": words},
                    {"role": "assistant", "content": "0"}
                ]
            });
        }
    });
    
    // Shuffle the training data for better training
    for (let i = trainingData.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [trainingData[i], trainingData[j]] = [trainingData[j], trainingData[i]];
    }
    
    // Create JSONL content (each line is a JSON object)
    const jsonlContent = trainingData
        .map(item => JSON.stringify(item))
        .join('\n');
    
    // Save JSONL file
    const outputPath = path.join(__dirname, 'training_dataset.jsonl');
    await fs.promises.writeFile(outputPath, jsonlContent, 'utf-8');
    
    console.log(`✅ Created training dataset with ${trainingData.length} examples`);
    console.log(`📁 Saved to: ${outputPath}`);
    
    // Show some sample entries
    console.log('\n--- Sample Training Examples ---');
    console.log('First 3 examples:');
    trainingData.slice(0, 3).forEach((item, index) => {
        console.log(`${index + 1}. ${JSON.stringify(item, null, 2)}`);
        console.log(''); // Empty line for readability
    });
}

async function verifyWithFineTunedModel(): Promise<string[]> {
    console.log('--- Verifying data with fine-tuned model ---');
    
    const fineTunedModel = 'ft:gpt-4.1-mini-2025-04-14:dawid:aidevs3:Bvaze7F2';
    
    // Read verify.txt
    const verifyPath = path.join(__dirname, 'lab_data', 'verify.txt');
    const verifyData = await fs.promises.readFile(verifyPath, 'utf-8');
    const verifyLines = verifyData.trim().split('\n');
    
    console.log(`Processing ${verifyLines.length} verification examples`);
    
    const results: { [key: string]: string } = {};
    
    for (const line of verifyLines) {
        const match = line.match(/^(\d+)=(.+)$/);
        if (match) {
            const [, id, words] = match;
            
            try {
                console.log(`Verifying ${id}: ${words}`);
                
                const completion = await openai.createChatCompletion({
                    model: fineTunedModel,
                    messages: [
                        { role: "system", content: "validate data" },
                        { role: "user", content: words }
                    ],
                    max_tokens: 1,
                    temperature: 0
                });
                
                const prediction = completion.data.choices[0]?.message?.content?.trim() || '0';
                results[id] = prediction;
                
                console.log(`  → Prediction: ${prediction}`);
                
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error(`Error processing ${id}:`, error);
                results[id] = '0'; // Default to 0 if error
            }
        }
    }
    
    console.log('\n--- Verification Results ---');
    Object.entries(results).forEach(([id, prediction]) => {
        console.log(`${id}=${prediction}`);
    });
    
    // Filter only correct predictions (where prediction = "1") and create array of IDs
    const correctIds = Object.entries(results)
        .filter(([id, prediction]) => prediction === '1')
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([id, prediction]) => id);
    
    console.log('\n--- Answer for submission (correct IDs only) ---');
    console.log(correctIds);
    
    return correctIds;
}

async function main() {
    try {
        console.log('--- Starting Data Transformation Task ---');
        
        // Create JSONL training dataset from correct/incorrect files
        // await createTrainingDataset();
        
        // Use fine-tuned model to verify test data
        const correctIds = await verifyWithFineTunedModel();
        
        // Submit to Centrala (only correct IDs)
        const response = {
            task: "research",
            apikey: CENTRALA_API_KEY,
            answer: correctIds
        };
        
        console.log('\n--- Submitting to Centrala ---');
        await sendToCentrala(response);
        
        console.log('--- Data Transformation Task Completed ---');
    } catch (error) {
        console.error('Unhandled error:', error);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
} 