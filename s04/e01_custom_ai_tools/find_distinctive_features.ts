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

async function analyzeForDistinctiveFeatures(imagePath: string): Promise<string> {
    const imageData = await fs.promises.readFile(imagePath);
    const base64Image = imageData.toString('base64');
    
    const prompt = `Examine this photo very carefully and identify ALL distinctive features that would help identify this person. Look specifically for:

    1. FACIAL MARKS: scars, moles, birthmarks, freckles, wrinkles
    2. EYE FEATURES: color, shape, markings around eyes
    3. NOSE: shape, any distinctive features
    4. MOUTH/LIPS: shape, scars, distinctive features
    5. EARS: visible piercings, shape, marks
    6. HAIR: not just color, but any distinctive patterns, styling
    7. ACCESSORIES: glasses, jewelry, unique items
    8. TATTOOS: any visible tattoos or markings
    9. SKIN: texture, marks, distinctive patterns
    10. ANY OTHER unique identifying features

    Focus on details that make this person UNIQUE and identifiable. Don't just describe general appearance - find the specific marks or features that distinguish this person from others.

    Answer in Polish with very specific details about distinctive marks.`;
    
    try {
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: "image/png",
                    data: base64Image
                }
            }
        ] as any);
        
        return result.response.text().trim();
    } catch (error) {
        console.error(`Error analyzing ${imagePath}:`, error);
        return 'Błąd analizy';
    }
}

async function main() {
    const photos = ['IMG_559_FGR4.PNG', 'IMG_1410_FXER.PNG', 'IMG_1443_FT12.PNG'];
    const distinctiveFeatures: string[] = [];
    
    console.log('--- Analyzing photos for distinctive features ---');
    
    for (const photo of photos) {
        const photoPath = path.join(__dirname, photo);
        if (fs.existsSync(photoPath)) {
            console.log(`\nAnalyzing ${photo} for distinctive features...`);
            const features = await analyzeForDistinctiveFeatures(photoPath);
            console.log(`Features found in ${photo}:`);
            console.log(features);
            distinctiveFeatures.push(`${photo}: ${features}`);
        }
    }
    
    // Combine all distinctive features
    console.log('\n--- Combining all distinctive features ---');
    const combinedAnalysis = `Na podstawie analizy zdjęć, oto charakterystyczne cechy Barbary:

${distinctiveFeatures.join('\n\n')}

Najważniejsze cechy wyróżniające:`;
    
    console.log(combinedAnalysis);
    
    // Create final description focusing on distinctive features
    const finalPrompt = `${combinedAnalysis}

    Podsumuj w jednym akapicie najważniejsze CHARAKTERYSTYCZNE CECHY Barbary, które pozwolą ją zidentyfikować. Skup się na znakach szczególnych, blizznach, znamionach, tatuażach, lub innych unikalnych cechach fizycznych.`;
    
    const finalResult = await model.generateContent([{ text: finalPrompt }] as any);
    const finalDescription = finalResult.response.text().trim();
    
    console.log('\n--- Final Description ---');
    console.log(finalDescription);
    
    // Send to system
    const response = {
        task: "photos",
        apikey: CENTRALA_API_KEY,
        answer: finalDescription
    };
    
    console.log('\n--- Sending distinctive features description ---');
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
}

main().catch(console.error); 