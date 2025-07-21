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

const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function downloadPhoto(url: string, filename: string): Promise<string> {
    const response = await fetch(url, { agent: httpsAgent });
    
    if (!response.ok) {
        throw new Error(`Failed to download ${filename}: ${response.status}`);
    }
    
    const buffer = await response.buffer();
    const filePath = path.join(__dirname, filename);
    
    await fs.promises.writeFile(filePath, buffer);
    console.log(`Downloaded: ${filename}`);
    
    return filePath;
}

async function analyzePhotoWithAI(filePath: string): Promise<string> {
    try {
        const imageData = await fs.promises.readFile(filePath);
        const base64Image = imageData.toString('base64');
        
        const prompt = `Analyze this photo and determine what processing it needs. 
        Available options:
        - REPAIR: if the image is damaged, corrupted, has artifacts, noise, or visual defects
        - DARKEN: if the image is too bright, overexposed, or washed out
        - BRIGHTEN: if the image is too dark, underexposed, or hard to see details
        
        Respond with only ONE word: REPAIR, DARKEN, or BRIGHTEN based on what this image needs most.`;
        
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: "image/png",
                    data: base64Image
                }
            }
        ]);
        
        const response = result.response;
        const analysis = response.text().trim().toUpperCase();
        
        return analysis;
    } catch (error) {
        console.error(`Error analyzing ${filePath}:`, error);
        return 'REPAIR'; // Default fallback
    }
}

async function sendToCentrala(response: any): Promise<string | null> {
    const url = 'https://c3ntrala.ag3nts.org/report';
    console.log('\nSending response to Centrala:', JSON.stringify(response, null, 2));
    
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(response),
        agent: httpsAgent
    });
    
    if (!res.ok) {
        throw new Error(`Failed to send response: ${res.status}`);
    }
    
    const result = await res.text();
    console.log('\nCentrala response:', result);
    
    // Try to extract flag from response
    try {
        const parsedResult = JSON.parse(result);
        if (parsedResult.message && parsedResult.message.includes('FLG:')) {
            const flagMatch = parsedResult.message.match(/FLG:([^}]+)}}/);
            if (flagMatch) {
                console.log('Extracted flag:', flagMatch[1]);
                return flagMatch[1];
            }
        }
    } catch (e) {
        console.log('Could not parse response as JSON or extract flag');
    }
    
    return null;
}

async function main() {
    try {
        console.log('--- Starting Custom AI Tools Task ---');
        
        // Inicjacja kontaktu z automatem
        console.log('--- Initiating contact with automation system ---');
        
        const initResponse = {
            task: "photos",
            apikey: CENTRALA_API_KEY,
            answer: "START"
        };
        
        console.log('Sending START request:', JSON.stringify(initResponse, null, 2));
        
        // Send initial START request to Centrala
        const result = await sendToCentrala(initResponse);
        
        // Parse the response to get photo information
        console.log('\n--- Processing photos information ---');
        
        const photos = ['IMG_559.PNG', 'IMG_1410.PNG', 'IMG_1443.PNG', 'IMG_1444.PNG'];
        const baseUrl = 'https://centrala.ag3nts.org/dane/barbara/';
        const availableCommands = ['REPAIR', 'DARKEN', 'BRIGHTEN'];
        
        console.log('Photos to analyze:', photos);
        console.log('Available commands:', availableCommands);
        console.log('Base URL:', baseUrl);
        
        // Download and analyze each photo
        const photoAnalysis: { [filename: string]: string } = {};
        
        for (const photo of photos) {
            console.log(`\n--- Processing ${photo} ---`);
            
            try {
                // Download photo
                const photoUrl = baseUrl + photo;
                const localPath = await downloadPhoto(photoUrl, photo);
                
                // Analyze photo with AI
                console.log(`Analyzing ${photo} with AI...`);
                const recommendedAction = await analyzePhotoWithAI(localPath);
                
                photoAnalysis[photo] = recommendedAction;
                console.log(`Recommendation for ${photo}: ${recommendedAction}`);
                
                // Clean up downloaded file
                await fs.promises.unlink(localPath);
                
            } catch (error) {
                console.error(`Error processing ${photo}:`, error);
                photoAnalysis[photo] = 'REPAIR'; // Default fallback
            }
        }
        
        console.log('\n--- Photo Analysis Summary ---');
        console.log(photoAnalysis);
        
        // Send commands to the system
        console.log('\n--- Sending commands to automation system ---');
        
        for (const [photo, command] of Object.entries(photoAnalysis)) {
            const commandResponse = {
                task: "photos",
                apikey: CENTRALA_API_KEY,
                answer: `${command} ${photo}`
            };
            
            console.log(`Sending command: ${command} ${photo}`);
            await sendToCentrala(commandResponse);
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Try different command for IMG_1444.PNG if BRIGHTEN didn't work
        console.log('\n--- Retrying IMG_1444.PNG with DARKEN ---');
        
        const retryResponse = {
            task: "photos",
            apikey: CENTRALA_API_KEY,
            answer: "DARKEN IMG_1444.PNG"
        };
        
        console.log('Sending retry command: DARKEN IMG_1444.PNG');
        await sendToCentrala(retryResponse);
        
        console.log('--- Custom AI Tools Task Completed ---');
    } catch (error) {
        console.error('Unhandled error:', error);
        process.exit(1);
    }
}

main(); 