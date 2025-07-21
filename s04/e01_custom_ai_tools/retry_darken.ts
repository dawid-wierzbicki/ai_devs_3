import { config } from 'dotenv';
import * as https from 'https';
import fetch from 'node-fetch';

config();

const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function sendCommand() {
    const response = {
        task: "photos",
        apikey: CENTRALA_API_KEY,
        answer: "REPAIR IMG_1444.PNG"
    };
    
    console.log('Sending REPAIR command for IMG_1444.PNG...');
    
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

sendCommand().catch(console.error); 