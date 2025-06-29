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

const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function queryDatabase(query: string): Promise<any> {
    const url = 'https://c3ntrala.ag3nts.org/apidb';
    const body = {
        task: "database",
        apikey: CENTRALA_API_KEY,
        query: query
    };
    
    console.log('Querying database with:', JSON.stringify(body, null, 2));
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        agent: httpsAgent
    });
    
    if (!response.ok) {
        throw new Error(`Database query failed: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Database response:', JSON.stringify(result, null, 2));
    
    // Extract table names from the response
    if (result.reply && Array.isArray(result.reply)) {
        const tableNames = result.reply.map((item: any) => item.Tables_in_banan);
        console.log('Available tables:', tableNames);
        
        // Save table names to a separate file
        const tablesFile = path.join(__dirname, 'available_tables.json');
        await fs.promises.writeFile(tablesFile, JSON.stringify(tableNames, null, 2), 'utf-8');
        console.log(`Table names saved to: ${tablesFile}`);
    }
    
    // Save full response to file
    const responseFile = path.join(__dirname, 'database_response.json');
    await fs.promises.writeFile(responseFile, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`Full database response saved to: ${responseFile}`);
    
    return result;
}

async function getTableNames(): Promise<string[]> {
    const tablesFile = path.join(__dirname, 'available_tables.json');
    if (!fs.existsSync(tablesFile)) {
        throw new Error('available_tables.json not found. Run the SHOW TABLES query first.');
    }
    const data = await fs.promises.readFile(tablesFile, 'utf-8');
    return JSON.parse(data);
}

async function getCreateTableStatements(tableNames: string[]): Promise<void> {
    const createTableResults: { [table: string]: any } = {};
    for (const table of tableNames) {
        const query = `SHOW CREATE TABLE ${table};`;
        const result = await queryDatabase(query);
        createTableResults[table] = result;
        // Save each result to its own file
        const filePath = path.join(__dirname, `create_table_${table}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
        console.log(`Saved CREATE TABLE for ${table} to: ${filePath}`);
    }
    // Optionally, save all results in one file
    const allFile = path.join(__dirname, 'all_create_tables.json');
    await fs.promises.writeFile(allFile, JSON.stringify(createTableResults, null, 2), 'utf-8');
    console.log(`Saved all CREATE TABLE statements to: ${allFile}`);
}

async function sendToCentrala(response: any): Promise<string | null> {
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
    
    // Try to extract flag from response
    try {
        const parsedResult = JSON.parse(result);
        if (parsedResult.message && parsedResult.message.includes('FLG:')) {
            const flagMatch = parsedResult.message.match(/FLG:([^}]+)}}/);
            if (flagMatch) {
                console.log('Extracted flag:', flagMatch[1]);
                return flagMatch[1];
            }
        }
    } catch (e) {
        console.log('Could not parse response as JSON or extract flag');
    }
    
    return null;
}

async function sendFlagToCentrala(flag: string): Promise<void> {
    const url = 'https://c3ntrala.ag3nts.org/report';
    const response = {
        task: "database",
        apikey: CENTRALA_API_KEY,
        answer: flag
    };
    
    console.log('\nSending flag to Centrala:', JSON.stringify(response, null, 2));
    
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(response),
        agent: httpsAgent
    });
    
    if (!res.ok) {
        console.log(`Failed to send flag: ${res.status}`);
    }
    
    const result = await res.text();
    console.log('\nCentrala flag response:', result);
}

async function main() {
    try {
        console.log('--- Starting Hybrid Search Task ---');
        
        // Query to get dc_id of active datacenters whose managers are inactive
        const sqlQuery = `SELECT d.dc_id
FROM datacenters d
JOIN users u ON d.manager = u.id
WHERE d.is_active = 1
  AND u.is_active = 0;`;
        
        // Query the database
        const dbResponse = await queryDatabase(sqlQuery);
        
        // Extract dc_id values from the response
        const dcIds: number[] = [];
        if (dbResponse.reply && Array.isArray(dbResponse.reply)) {
            for (const row of dbResponse.reply) {
                if (row.dc_id) {
                    dcIds.push(parseInt(row.dc_id));
                }
            }
        }
        
        // Prepare response for Centrala
        const response = {
            task: "database",
            apikey: CENTRALA_API_KEY,
            answer: dcIds
        };
        
        console.log("\nFinal response:", JSON.stringify(response, null, 2));
        
        // Send response to Centrala and extract flag
        const flag = await sendToCentrala(response);
        
        // Send the extracted flag to Centrala if found
        if (flag) {
            await sendFlagToCentrala(flag);
        } else {
            console.log('No flag found in response');
        }
        
        console.log('--- Hybrid Search Task Completed ---');
    } catch (error) {
        console.error('Unhandled error:', error);
        process.exit(1);
    }
}

main(); 