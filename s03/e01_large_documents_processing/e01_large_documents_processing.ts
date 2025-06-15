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

const REPORTS_DIR = path.join(__dirname, 'reports');
const FACTS_DIR = path.join(__dirname, 'facts');
const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function loadFacts(): Promise<string> {
    if (!fs.existsSync(FACTS_DIR)) {
        return '';
    }
    
    const factFiles = await fs.promises.readdir(FACTS_DIR);
    const facts: string[] = [];
    
    for (const file of factFiles) {
        if (file.endsWith('.txt')) {
            const content = await fs.promises.readFile(path.join(FACTS_DIR, file), 'utf-8');
            facts.push(`Fakt z pliku ${file}:\n${content}`);
        }
    }
    
    return facts.join('\n\n');
}

async function processReport(filePath: string, facts: string): Promise<string> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    
    const prompt = `Przeanalizuj poniższy raport i wygeneruj listę słów kluczowych w języku polskim.
    
WAŻNE:
- Słowa kluczowe muszą być w języku polskim
- Muszą być w mianowniku (np. "nauczyciel", "programista", a nie "nauczyciela", "programistów")
- Słowa powinny być oddzielone przecinkami (np. słowo1,słowo2,słowo3)
- Lista powinna precyzyjnie opisywać raport, uwzględniając treść raportu, powiązane fakty oraz informacje z nazwy pliku
- Słów kluczowych może być dowolnie wiele dla danego raportu

Weź pod uwagę również poniższe fakty:
${facts}

Raport:
${content}

Nazwa pliku: ${fileName}

Wygeneruj TYLKO listę słów kluczowych oddzielonych przecinkami, bez żadnych dodatkowych wyjaśnień.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
}

async function sendToCentrala(response: any): Promise<void> {
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
}

async function main() {
    try {
        console.log('--- Starting Large Documents Processing Task ---');
        
        // Create directories if they don't exist
        if (!fs.existsSync(REPORTS_DIR)) {
            await fs.promises.mkdir(REPORTS_DIR, { recursive: true });
        }
        if (!fs.existsSync(FACTS_DIR)) {
            await fs.promises.mkdir(FACTS_DIR, { recursive: true });
        }
        
        // Load all facts
        console.log('Loading facts...');
        const facts = await loadFacts();
        console.log('Facts loaded successfully');
        
        // Process all reports
        const reportFiles = await fs.promises.readdir(REPORTS_DIR);
        const answers: { [key: string]: string } = {};
        
        for (const file of reportFiles) {
            if (file.endsWith('.txt')) {
                console.log(`Processing report: ${file}`);
                const filePath = path.join(REPORTS_DIR, file);
                const keywords = await processReport(filePath, facts);
                answers[file] = keywords;
            }
        }
        
        const response = {
            task: "dokumenty",
            apikey: CENTRALA_API_KEY,
            answer: answers
        };

        console.log("\nFinal response:", JSON.stringify(response, null, 2));
        
        // Send response to Centrala
        await sendToCentrala(response);
        
        console.log('--- Large Documents Processing Task Completed ---');
    } catch (error) {
        console.error('Unhandled error:', error);
        process.exit(1);
    }
}

main(); 