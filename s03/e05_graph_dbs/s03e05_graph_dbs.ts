import { config } from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import fetch from 'node-fetch';
import neo4j, { Driver, Session } from 'neo4j-driver';

// Load environment variables
config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-05-20' });

const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Neo4j configuration
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || '';

let neo4jDriver: Driver | null = null;
let neo4jSession: Session | null = null;

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
    
    return result;
}

async function initializeNeo4jDatabase(): Promise<void> {
    try {
        console.log('--- Initializing Neo4j Database ---');
        
        // Create Neo4j driver
        neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));
        
        // Test connection
        await neo4jDriver.verifyConnectivity();
        console.log('Successfully connected to Neo4j database');
        
        // Create session
        neo4jSession = neo4jDriver.session();
        
        // Check if database already has data (skip setup if it does)
        const result = await neo4jSession.run('MATCH (n) RETURN count(n) as nodeCount');
        const nodeCount = result.records[0].get('nodeCount').toNumber();
        
        if (nodeCount > 0) {
            console.log(`Database already contains ${nodeCount} nodes. Skipping initialization.`);
            return;
        }
        
        console.log('Database is empty. Ready for data insertion.');
        
    } catch (error) {
        console.log('❌ Neo4j database is not available (not running or not installed)');
        throw error;
    }
}

async function createUsersInNeo4j(usersData: any): Promise<void> {
    if (!neo4jSession) {
        throw new Error('Neo4j session not initialized');
    }
    
    console.log('--- Creating User nodes in Neo4j ---');
    
    const users = usersData.reply;
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const user of users) {
        try {
            // Use MERGE to avoid creating duplicates
            const result = await neo4jSession.run(
                `MERGE (p:Person {userId: $userId})
                 ON CREATE SET p.name = $name, p.created = true
                 ON MATCH SET p.created = false
                 RETURN p.userId, p.created as wasCreated`,
                {
                    userId: parseInt(user.id),
                    name: user.username
                }
            );
            
            const record = result.records[0];
            const wasCreated = record.get('wasCreated');
            const userId = record.get('p.userId');
            
            if (wasCreated) {
                createdCount++;
                console.log(`✅ Created Person node: ${user.username} (userId: ${userId})`);
            } else {
                skippedCount++;
                console.log(`⏭️  Person already exists: ${user.username} (userId: ${userId})`);
            }
            
        } catch (error) {
            console.error(`❌ Error creating user ${user.username}:`, error);
        }
    }
    
    console.log(`\n📊 Summary: ${createdCount} users created, ${skippedCount} users already existed`);
    
    // Verify total count in Neo4j
    const countResult = await neo4jSession.run('MATCH (p:Person) RETURN count(p) as totalUsers');
    const totalUsers = countResult.records[0].get('totalUsers').toNumber();
    console.log(`📈 Total Person nodes in Neo4j: ${totalUsers}`);
}

async function createConnectionsInNeo4j(connectionsData: any): Promise<void> {
    if (!neo4jSession) {
        throw new Error('Neo4j session not initialized');
    }
    
    console.log('--- Creating KNOWS relationships in Neo4j ---');
    
    const connections = connectionsData.reply;
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const connection of connections) {
        try {
            const user1Id = parseInt(connection.user1_id);
            const user2Id = parseInt(connection.user2_id);
            
            // Use MERGE to avoid creating duplicate relationships
            const result = await neo4jSession.run(
                `MATCH (p1:Person {userId: $user1Id})
                 MATCH (p2:Person {userId: $user2Id})
                 MERGE (p1)-[r:KNOWS]->(p2)
                 ON CREATE SET r.created = true
                 ON MATCH SET r.created = false
                 RETURN p1.name, p2.name, r.created as wasCreated`,
                {
                    user1Id: user1Id,
                    user2Id: user2Id
                }
            );
            
            if (result.records.length > 0) {
                const record = result.records[0];
                const wasCreated = record.get('wasCreated');
                const user1Name = record.get('p1.name');
                const user2Name = record.get('p2.name');
                
                if (wasCreated) {
                    createdCount++;
                    console.log(`✅ Created relationship: ${user1Name} (${user1Id}) KNOWS ${user2Name} (${user2Id})`);
                } else {
                    skippedCount++;
                    console.log(`⏭️  Relationship already exists: ${user1Name} (${user1Id}) KNOWS ${user2Name} (${user2Id})`);
                }
            } else {
                console.log(`❌ Could not find users for connection: ${user1Id} -> ${user2Id}`);
            }
            
        } catch (error) {
            console.error(`❌ Error creating relationship ${connection.user1_id} -> ${connection.user2_id}:`, error);
        }
    }
    
    console.log(`\n📊 Summary: ${createdCount} relationships created, ${skippedCount} relationships already existed`);
    
    // Verify total relationship count in Neo4j
    const countResult = await neo4jSession.run('MATCH ()-[r:KNOWS]->() RETURN count(r) as totalRelationships');
    const totalRelationships = countResult.records[0].get('totalRelationships').toNumber();
    console.log(`📈 Total KNOWS relationships in Neo4j: ${totalRelationships}`);
}

async function findShortestPath(fromName: string, toName: string): Promise<string | null> {
    if (!neo4jSession) {
        throw new Error('Neo4j session not initialized');
    }
    
    console.log(`\n--- Finding shortest path from ${fromName} to ${toName} ---`);
    
    try {
        const result = await neo4jSession.run(
            `MATCH (start:Person {name: $fromName}), (end:Person {name: $toName})
             MATCH path = shortestPath((start)-[*..10]-(end))
             RETURN path,
                    [node in nodes(path) | node.name] as names,
                    length(path) as pathLength`,
            {
                fromName: fromName,
                toName: toName
            }
        );
        
        if (result.records.length === 0) {
            console.log(`❌ No path found between ${fromName} and ${toName}`);
            return null;
        }
        
        const record = result.records[0];
        const pathLength = record.get('pathLength');
        const names = record.get('names');
        
        console.log(`✅ Shortest path found! Length: ${pathLength} hops`);
        console.log(`📍 Path: ${names.join(' → ')}`);
        
        // Show detailed path with relationships
        const path = record.get('path');
        const segments = path.segments;
        let detailedPath = names[0];
        
        for (let i = 0; i < segments.length; i++) {
            const relationship = segments[i].relationship.type;
            const endNode = segments[i].end.properties.name;
            detailedPath += ` -[${relationship}]-> ${endNode}`;
        }
        
        console.log(`🔗 Detailed path: ${detailedPath}`);
        
        // Return path in comma-separated format
        const pathAnswer = names.join(',');
        console.log(`📤 Answer format: ${pathAnswer}`);
        
        return pathAnswer;
        
    } catch (error) {
        console.error(`❌ Error finding shortest path:`, error);
        return null;
    }
}

async function closeNeo4jConnection(): Promise<void> {
    try {
        if (neo4jSession) {
            await neo4jSession.close();
            console.log('Neo4j session closed');
        }
        if (neo4jDriver) {
            await neo4jDriver.close();
            console.log('Neo4j driver closed');
        }
    } catch (error) {
        console.error('Error closing Neo4j connection:', error);
    }
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

async function main() {
    let neo4jInitialized = false;
    
    try {
        console.log('--- Starting Graph Databases Task ---');
        
        // Initialize local Neo4j database (optional)
        try {
            await initializeNeo4jDatabase();
            neo4jInitialized = true;
        } catch (error) {
            console.log('⚠️ Neo4j initialization failed, continuing with MySQL queries only...\n');
        }
        
        // Query users table
        console.log('\n--- Querying users table ---');
        const usersQuery = 'SELECT * FROM users;';
        const usersResponse = await queryDatabase(usersQuery);
        
        // Query connections table
        console.log('\n--- Querying connections table ---');
        const connectionsQuery = 'SELECT * FROM connections;';
        const connectionsResponse = await queryDatabase(connectionsQuery);
        
        // Save responses to files for analysis
        const usersFile = path.join(__dirname, 'users_data.json');
        await fs.promises.writeFile(usersFile, JSON.stringify(usersResponse, null, 2), 'utf-8');
        console.log(`Users data saved to: ${usersFile}`);
        
        const connectionsFile = path.join(__dirname, 'connections_data.json');
        await fs.promises.writeFile(connectionsFile, JSON.stringify(connectionsResponse, null, 2), 'utf-8');
        console.log(`Connections data saved to: ${connectionsFile}`);
        
        // Create Person nodes in Neo4j if initialized
        if (neo4jInitialized && neo4jSession) {
            console.log('\n--- Importing Users to Neo4j ---');
            await createUsersInNeo4j(usersResponse);
            
            console.log('\n--- Importing Connections to Neo4j ---');
            await createConnectionsInNeo4j(connectionsResponse);
            
            // Find shortest path between Rafal and Barbara
            const pathResult = await findShortestPath('Rafał', 'Barbara');
            
            if (pathResult) {
                // Prepare response for Centrala API
                const response = {
                    task: "connections",
                    apikey: CENTRALA_API_KEY,
                    answer: pathResult
                };
                
                console.log("\n--- Sending path result to Centrala ---");
                await sendToCentrala(response);
            } else {
                console.log('❌ Could not find path, not sending to API');
            }
        }
        
        console.log('--- Graph Databases Task Completed ---');
    } catch (error) {
        console.error('Unhandled error:', error);
        process.exit(1);
    } finally {
        // Clean up Neo4j connection if it was established
        if (neo4jDriver) {
            await closeNeo4jConnection();
        }
    }
}

main(); 