import { config } from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import fetch from 'node-fetch';

// Load environment variables
config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Manual map layout - analyzed without AI as per requirements
// Based on pilot movement examples:
// - "jedno pole w prawo i jedno w dol" = "wiatrak" (position 1,1)
// - "dwa pola w prawo i dwa w dol" = "skały" (position 2,2)
const MANUAL_MAP_LAYOUT: string[][] = [
    ["start", "trawa", "drzewo", "dom"],          // Row 0
    ["trawa", "wiatrak", "trawa", "trawa"],       // Row 1  
    ["trawa", "trawa", "skały", "dwa drzewa"],    // Row 2
    ["góry", "góry", "samochód", "jaskinia"]      // Row 3
];

function getManualMapLayout(): string[][] {
    console.log('🗺️ Using manual map layout (no AI analysis):');
    console.log('   Col:  0        1         2        3');
    MANUAL_MAP_LAYOUT.forEach((row, i) => {
        console.log(`   R${i}: [${row.map(cell => `"${cell}"`).join(', ')}]`);
    });
    console.log('✅ Manual map layout loaded');
    return MANUAL_MAP_LAYOUT;
}

async function parseMovementInstruction(instruction: string): Promise<{row: number, col: number}> {
    console.log('\n🧭 PARSING MOVEMENT INSTRUCTION WITH GEMINI:');
    console.log('   Original instruction:', JSON.stringify(instruction));
    
    const prompt = `Analyze this Polish pilot instruction and extract the movements:

"${instruction}"

The pilot starts at position [0,0] (top-left corner) on a 4x4 grid.
Movement directions:
- "prawo" = right (increase column)
- "lewo" = left (decrease column) 
- "dół"/"dol" = down (increase row)
- "góra"/"gore" = up (decrease row)

Numbers in Polish:
- "jeden"/"jedno" = 1
- "dwa" = 2
- "trzy" = 3
- "cztery" = 4

Parse the instruction and return ONLY a JSON object with the final position after all movements:
{
  "movements": [
    {"direction": "prawo", "steps": 1},
    {"direction": "dol", "steps": 1}
  ],
  "finalRow": 1,
  "finalCol": 1
}

Be very careful about the movement directions and calculate the final position step by step from [0,0].`;

    try {
        const result = await model.generateContent([{ text: prompt }] as any);
        const response = result.response.text().trim();
        console.log('   Gemini response:', response);
        
        // Extract JSON from the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const movementData = JSON.parse(jsonMatch[0]);
            console.log('   Parsed movements:', movementData);
            
            const row = Math.max(0, Math.min(3, movementData.finalRow));
            const col = Math.max(0, Math.min(3, movementData.finalCol));
            
            console.log(`   Final position (clamped): [${row},${col}]`);
            return { row, col };
        } else {
            console.error('   ❌ Could not extract JSON from Gemini response');
            return { row: 0, col: 0 }; // Default to start position
        }
    } catch (error) {
        console.error('   ❌ Error parsing with Gemini:', error);
        return { row: 0, col: 0 }; // Default to start position
    }
}

function getObjectAtPosition(row: number, col: number): string {
    console.log('\n🗺️ LOOKING UP OBJECT IN MAP:');
    const mapLayout = getManualMapLayout();
    
    console.log(`   Position: [${row}][${col}]`);
    console.log(`   Map row ${row}:`, mapLayout[row]);
    
    const object = mapLayout[row][col];
    console.log(`   Found object: "${object}"`);
    return object;
}

async function sendToCentrala(response: any): Promise<string | null> {
    const url = 'https://c3ntrala.ag3nts.org/report';
    console.log('\nSending response to Centrala:', JSON.stringify(response, null, 2));
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(response),
            agent: httpsAgent
        });
        
        const result = await res.text();
        console.log('Centrala response:', result);
        
        // Try to parse the result to extract flag if present
        try {
            const parsedResult = JSON.parse(result);
            if (parsedResult.message && typeof parsedResult.message === 'string') {
                const flagMatch = parsedResult.message.match(/FLG:[A-Z0-9_]+/);
                if (flagMatch) {
                    console.log(`\n🎉 Flag found: ${flagMatch[0]}`);
                    return flagMatch[0];
                }
            }
        } catch (parseError) {
            // If parsing fails, just return the raw result
        }
        
        return result;
    } catch (error) {
        console.error('Error sending response to Centrala:', error);
        return null;
    }
}

async function createWebhookServer(port: number = 3000): Promise<http.Server> {
    console.log('--- Setting up Webhook Server ---');
    
    const server = http.createServer(async (req, res) => {
        console.log(`📨 Received ${req.method} request to ${req.url}`);
        console.log('Headers:', req.headers);
        
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            
            req.on('end', async () => {
                console.log('📦 Request body:', body);
                
                try {
                    const data = JSON.parse(body);
                    console.log('🔍 Parsed data:', data);
                    
                    if (data.instruction) {
                        // Process pilot navigation instruction
                        console.log('\n🚁 Processing pilot instruction...');
                        console.log('📥 RECEIVED FROM CENTRALA:');
                        console.log('   Instruction:', JSON.stringify(data.instruction));
                        console.log('   Full payload:', JSON.stringify(data, null, 2));
                        
                        const position = await parseMovementInstruction(data.instruction);
                        const object = getObjectAtPosition(position.row, position.col);
                        
                        console.log(`✅ Pilot landed at: ${object}`);
                        
                        const responsePayload = { description: object };
                        console.log('📤 SENDING BACK TO CENTRALA:');
                        console.log('   Response:', JSON.stringify(responsePayload, null, 2));
                        
                        // Send response back
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(responsePayload));
                    } else {
                        // Generic response for other requests
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            status: 'received', 
                            message: 'Webhook processed successfully' 
                        }));
                    }
                    
                } catch (parseError) {
                    console.error('Error parsing webhook data:', parseError);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
        } else if (req.method === 'GET') {
            // Handle GET requests (health check, etc.)
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                status: 'active', 
                message: 'Pilot Navigation Webhook is running',
                timestamp: new Date().toISOString()
            }));
        } else {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
    });
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`🚀 Pilot Navigation Webhook server running on http://localhost:${port}`);
            resolve(server);
        });
    });
}

async function main() {
    try {
        console.log('--- Starting Pilot Navigation Webhook Task ---');
        
        // Load manual map layout
        console.log('\n🗺️ Loading manual map layout...');
        getManualMapLayout();
        console.log('✅ Manual map layout loaded successfully');
        
        // Start webhook server
        const port = parseInt(process.env.PORT || '3000');
        const server = await createWebhookServer(port);
        
        console.log('\n📡 Pilot Navigation Webhook server is ready!');
        console.log('🚁 Ready to process pilot movement instructions');
        console.log('💡 Use Ctrl+C to stop the server when done');
        
        // Keep server running (use Ctrl+C to stop)
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down webhook server...');
            server.close(() => {
                console.log('✅ Server stopped');
                process.exit(0);
            });
        });
        
    } catch (error) {
        console.error('Unhandled error:', error);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
} 