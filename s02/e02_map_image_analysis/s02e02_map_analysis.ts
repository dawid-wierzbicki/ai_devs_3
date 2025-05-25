import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// Validate required API key
if (!process.env.GEMINI_API_KEY) {
  console.log("ERROR: GEMINI_API_KEY not set in environment variables");
  process.exit(1);
}

function readImageAsBase64(imagePath: string): string {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

async function analyzeImagesWithGemini(imagePaths: string[]): Promise<string> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro-preview-05-06" });

  // Prepare image parts for Gemini
  const imageParts = imagePaths.map(imagePath => {
    const base64Data = readImageAsBase64(imagePath);
    const fileName = path.basename(imagePath);
    
    return {
      inlineData: {
        data: base64Data,
        mimeType: "image/png"
      }
    };
  });

  const prompt = `Analyze these 4 map images carefully.
1. Your task is to find the city which the maps are about.
2. Three maps are about the same city, but the fourth one is about different city.
3. Find the name of the city. The maps are in Polish and the city is in Poland.
4. Think abvout street names and places you see on the maps.
5. Use the internet to find the name of the city.
6. Make sure the streets from every map are next to each other as in the maps.
7. Check that all streets and places from the maps you selected exist in the city you picked by searching the internet.
8. Find multiple cities that match the descriptio and pick the one that fits it the best.
9. The city is not Toruń or Gdańsk or Bydgoszcz


Respond with:
{
  "thinking": "<your thinking process here>",
  "city": "<name of the city>"
}



Please be thorough and detailed in your analysis. Remember one of the maps shows a different city - we're not interested in that one.`;

  try {
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('🗺️ Starting map image analysis...');
    
    const imagesDir = './s02/e02_map_image_analysis/images';
    const imageFiles = ['map1.png', 'map2.png', 'map3.png', 'map4.png'];
    
    // Check if all images exist
    const imagePaths = imageFiles.map(file => path.join(imagesDir, file));
    for (const imagePath of imagePaths) {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
      }
    }
    
    console.log(`📸 Found ${imageFiles.length} images:`);
    imageFiles.forEach(file => console.log(`  - ${file}`));
    
    console.log('\n🤖 Sending images to Gemini 2.5 Pro for analysis...');
    const analysis = await analyzeImagesWithGemini(imagePaths);
    
    console.log('\n=== GEMINI ANALYSIS ===');
    console.log(analysis);
    
    
    console.log('\n✅ Map analysis complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main(); 