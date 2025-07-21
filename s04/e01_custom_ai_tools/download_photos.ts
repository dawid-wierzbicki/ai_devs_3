import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import fetch from 'node-fetch';

config();

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function downloadPhoto(url: string, filename: string): Promise<void> {
    console.log(`Downloading ${filename} from ${url}`);
    const response = await fetch(url, { agent: httpsAgent });
    
    if (!response.ok) {
        throw new Error(`Failed to download ${filename}: ${response.status}`);
    }
    
    const buffer = await response.buffer();
    const filePath = path.join(__dirname, filename);
    
    await fs.promises.writeFile(filePath, buffer);
    console.log(`✅ Saved: ${filename}`);
}

async function downloadAllProcessedPhotos() {
    const processedPhotos = [
        'https://centrala.ag3nts.org/dane/barbara/IMG_559_FGR4.PNG',
        'https://centrala.ag3nts.org/dane/barbara/IMG_1410_FXER.PNG',
        'https://centrala.ag3nts.org/dane/barbara/IMG_1443_FT12.PNG'
    ];
    
    console.log('--- Downloading processed photos for detailed analysis ---');
    
    for (const photoUrl of processedPhotos) {
        const filename = path.basename(photoUrl);
        await downloadPhoto(photoUrl, filename);
    }
    
    console.log('\n✅ All photos downloaded! Check the s04/e01_custom_ai_tools/ folder');
    console.log('Look for distinctive features like:');
    console.log('- Scars, moles, birthmarks');
    console.log('- Tattoos or piercings');
    console.log('- Unique facial features');
    console.log('- Distinctive accessories');
    console.log('- Any other identifying marks');
}

downloadAllProcessedPhotos().catch(console.error); 