import { config } from 'dotenv';
import * as https from 'https';
import fetch from 'node-fetch';

config();

const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function checkCompletion() {
    // Try sending the processed photo names or a completion message
    const processedPhotos = [
        'IMG_559_FGR4.PNG',
        'IMG_1410_FXER.PNG', 
        'IMG_1443_FT12.PNG'
    ];
    
    const response = {
        task: "photos",
        apikey: CENTRALA_API_KEY,
        answer: processedPhotos.join(',')
    };
    
    console.log('Sending processed photos list:', processedPhotos.join(','));
    
    const res = await fetch('https://c3ntrala.ag3nts.org/report', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(response),
        agent: httpsAgent
    });
    
    const result = await res.text();
    console.log('Response:', result);
}

checkCompletion().catch(console.error); 