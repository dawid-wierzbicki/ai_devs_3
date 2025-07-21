import { config } from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables
config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

async function main() {
    try {
        console.log('--- Starting Vector Databases Task ---');
        
        // this task was done in a console
        
        console.log('--- Vector Databases Task Completed ---');
    } catch (error) {
        console.error('Unhandled error:', error);
        process.exit(1);
    }
}

main(); 