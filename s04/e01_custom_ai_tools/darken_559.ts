import { config } from 'dotenv';
import * as https from 'https';
import fetch from 'node-fetch';

config();

const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function darkenProcessedImage() {
    console.log('Trying to darken the already processed IMG_559_FGR4.PNG...');
    
    const response = {
        task: "photos",
        apikey: CENTRALA_API_KEY,
        answer: "DARKEN IMG_559_FGR4.PNG"
    };
    
    console.log('Sending DARKEN command for IMG_559_FGR4.PNG');
    
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

darkenProcessedImage().catch(console.error); 