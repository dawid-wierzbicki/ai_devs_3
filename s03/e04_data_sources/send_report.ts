import { config } from 'dotenv';
import * as https from 'https';
import fetch from 'node-fetch';

// Load environment variables
config();

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function sendReport(): Promise<void> {
    const url = 'https://c3ntrala.ag3nts.org/report';
    const body = {
        task: "loop",
        apikey: "168d858c-e2ef-410a-9a9f-71189adfc087",
        answer: "WARSZAWA"
    };
    
    console.log('Sending report to Centrala:', JSON.stringify(body, null, 2));
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            agent: httpsAgent
        });
        
        if (!res.ok) {
            throw new Error(`Failed to send report: ${res.status}`);
        }
        
        const resultText = await res.text();
        console.log('\nCentrala response (raw):', resultText);
        
        try {
            const resultJson = JSON.parse(resultText);
            console.log('Centrala response (parsed):', resultJson);
        } catch (e) {
            console.log('Centrala response is not valid JSON.');
        }
        
    } catch (error) {
        console.error('Error sending report:', error);
    }
}

sendReport(); 