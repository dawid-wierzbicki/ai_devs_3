import { config } from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import fetch from 'node-fetch';

config();

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

async function analyzePhotosForDescription(photoPaths: string[]): Promise<string> {
    // For multiple images, let's analyze them one by one and combine descriptions
    const descriptions = [];
    
    for (const photoPath of photoPaths) {
        const imageData = await fs.promises.readFile(photoPath);
        const base64Image = imageData.toString('base64');
        
        const prompt = `Analyze this processed photo and describe the physical appearance of the person named Barbara. 

        Focus on:
        - Physical appearance (hair color, length, style)
        - Facial features (eyes, nose, mouth, face shape)
        - Age estimation
        - Any distinctive features
        - Clothing or accessories visible
        
        Provide details in Polish.`;
        
        const result = await model.generateContent([
            { text: prompt },
            {
                inlineData: {
                    mimeType: "image/png",
                    data: base64Image
                }
            }
        ] as any);
        
        const response = result.response;
        descriptions.push(response.text().trim());
    }
    
    // Combine all descriptions into one comprehensive description
    const combinedPrompt = `Based on these individual photo analyses of Barbara, create one comprehensive physical description:

    ${descriptions.map((desc, i) => `Photo ${i + 1}: ${desc}`).join('\n\n')}
    
    Combine these into a single, detailed description in Polish that captures all the consistent details about Barbara's appearance.`;
    
    const finalResult = await model.generateContent([{ text: combinedPrompt }] as any);
    return finalResult.response.text().trim();
}

async function main() {
    try {
        console.log('--- Analyzing processed photos to describe Barbara ---');
        
        // URLs of processed photos
        const processedPhotos = [
            'https://centrala.ag3nts.org/dane/barbara/IMG_559_FGR4.PNG',
            'https://centrala.ag3nts.org/dane/barbara/IMG_1410_FXER.PNG',
            'https://centrala.ag3nts.org/dane/barbara/IMG_1443_FT12.PNG'
        ];
        
        // Download processed photos
        const localPaths = [];
        for (const photoUrl of processedPhotos) {
            const filename = path.basename(photoUrl);
            const localPath = await downloadPhoto(photoUrl, filename);
            localPaths.push(localPath);
        }
        
        // Analyze photos to create Barbara's description
        console.log('Analyzing photos with AI to create Barbara\'s description...');
        const description = await analyzePhotosForDescription(localPaths);
        
        console.log('\n--- Generated Description ---');
        console.log(description);
        
        // Send description to the system
        console.log('\n--- Sending Barbara\'s description to system ---');
        
        const response = {
            task: "photos",
            apikey: CENTRALA_API_KEY,
            answer: description
        };
        
        const res = await fetch('https://c3ntrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(response),
            agent: httpsAgent
        });
        
        const result = await res.text();
        console.log('System response:', result);
        
        // Clean up downloaded files
        for (const localPath of localPaths) {
            await fs.promises.unlink(localPath);
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

main(); 