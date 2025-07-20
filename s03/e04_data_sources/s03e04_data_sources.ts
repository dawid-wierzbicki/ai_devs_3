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

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Data structures for tracking discoveries
interface DiscoveryLog {
    iteration: number;
    timestamp: string;
    discoveries: {
        people: Array<{
            name: string;
            source: string;
            relatedPlaces: string[];
        }>;
        places: Array<{
            name: string;
            source: string;
            relatedPeople: string[];
            barbaraFound: boolean;
        }>;
    };
    relationships: Array<{
        person: string;
        place: string;
        source: string;
    }>;
}

let discoveryLog: DiscoveryLog = {
    iteration: 0,
    timestamp: new Date().toISOString(),
    discoveries: { people: [], places: [] },
    relationships: []
};

async function fetchBarbaraNote(): Promise<string> {
    const url = 'https://c3ntrala.ag3nts.org/dane/barbara.txt';
    console.log('Fetching Barbara\'s note from:', url);
    
    const response = await fetch(url, { agent: httpsAgent });
    if (!response.ok) {
        throw new Error(`Failed to fetch Barbara's note: ${response.status}`);
    }
    
    const content = await response.text();
    console.log('Barbara\'s note content:', content);
    
    // Save the note to a file
    const noteFile = path.join(__dirname, 'barbara_note.txt');
    await fs.promises.writeFile(noteFile, content, 'utf-8');
    console.log(`Barbara's note saved to: ${noteFile}`);
    
    return content;
}

async function extractNamesAndCities(noteContent: string): Promise<{ names: string[], cities: string[] }> {
    const prompt = `Przeanalizuj poniższy tekst i wyodrębnij:
1. Wszystkie imiona osób (TYLKO imiona, nie nazwiska - np. "Barbara" zamiast "Barbara Zawadzka")
2. Wszystkie nazwy miast

Zwróć odpowiedź w formacie JSON:
{
  "names": ["imię1", "imię2", ...],
  "cities": ["miasto1", "miasto2", ...]
}

Tekst do analizy:
${noteContent}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const extractedData = response.text();
    
    console.log('Extracted data:', extractedData);
    
    try {
        // Remove markdown code blocks if present
        let jsonContent = extractedData.trim();
        if (jsonContent.startsWith('```json')) {
            jsonContent = jsonContent.replace(/^```json\n/, '').replace(/\n```$/, '');
        } else if (jsonContent.startsWith('```')) {
            jsonContent = jsonContent.replace(/^```\n/, '').replace(/\n```$/, '');
        }
        
        const parsed = JSON.parse(jsonContent);
        console.log('Names found:', parsed.names);
        console.log('Cities found:', parsed.cities);
        
        // Save extracted data
        const extractedFile = path.join(__dirname, 'extracted_data.json');
        await fs.promises.writeFile(extractedFile, JSON.stringify(parsed, null, 2), 'utf-8');
        console.log(`Extracted data saved to: ${extractedFile}`);
        
        return parsed;
    } catch (error) {
        console.error('Failed to parse extracted data:', error);
        throw error;
    }
}

function removePolishDiacritics(str: string): string {
    // Replace Polish diacritics with their ASCII equivalents
    return str
        .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
        .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
        .replace(/Ą/g, 'A').replace(/Ć/g, 'C').replace(/Ę/g, 'E').replace(/Ł/g, 'L')
        .replace(/Ń/g, 'N').replace(/Ó/g, 'O').replace(/Ś/g, 'S').replace(/Ź/g, 'Z').replace(/Ż/g, 'Z');
}

function normalize(str: string): string {
    return removePolishDiacritics(str).toUpperCase();
}

async function queryPeopleAPI(name: string, apikey: string): Promise<any> {
    const url = 'https://c3ntrala.ag3nts.org/people';
    const body = {
        apikey,
        query: name
    };
    console.log(`Querying people API for: ${name}`);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            agent: httpsAgent
        });
        if (!res.ok) {
            console.log(`People API query failed for ${name}: ${res.status}`);
            return null;
        }
        const result = await res.json();
        console.log('People API response:', JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.log(`Error querying people API for ${name}:`, error);
        return null;
    }
}

async function queryCitiesAPI(city: string, apikey: string): Promise<any> {
    const url = 'https://c3ntrala.ag3nts.org/cities';
    const body = {
        apikey,
        query: city
    };
    console.log(`Querying cities API for: ${city}`);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            agent: httpsAgent
        });
        if (!res.ok) {
            console.log(`Cities API query failed for ${city}: ${res.status}`);
            return null;
        }
        const result = await res.json();
        console.log('Cities API response:', JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.log(`Error querying cities API for ${city}:`, error);
        return null;
    }
}

async function queryPlacesAPI(city: string, apikey: string): Promise<any> {
    const url = 'https://c3ntrala.ag3nts.org/places';
    const body = {
        apikey,
        query: city
    };
    console.log(`Querying places API for: ${city}`);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            agent: httpsAgent
        });
        if (!res.ok) {
            console.log(`Places API query failed for ${city}: ${res.status}`);
            return null;
        }
        const result = await res.json();
        console.log('Places API response:', JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.log(`Error querying places API for ${city}:`, error);
        return null;
    }
}

async function sendAnswerToCentrala(city: string, apikey: string): Promise<void> {
    const url = 'https://c3ntrala.ag3nts.org/report';
    const body = {
        task: "loop",
        apikey: apikey,
        answer: city
    };
    
    console.log('\n🎯 Sending Barbara\'s location to Centrala:', JSON.stringify(body, null, 2));
    
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        agent: httpsAgent
    });
    
    if (!res.ok) {
        throw new Error(`Failed to send answer: ${res.status}`);
    }
    
    const resultText = await res.text();
    console.log('\nCentrala response (raw):', resultText);
    try {
        const resultJson = JSON.parse(resultText);
        console.log('Centrala response (parsed):', resultJson);
    } catch (e) {
        console.log('Centrala response is not valid JSON.');
    }
}

function logDiscovery(iteration: number, discoveries: any): void {
    discoveryLog.iteration = iteration;
    discoveryLog.timestamp = new Date().toISOString();
    discoveryLog.discoveries = discoveries;
    
    // Save discovery log to file
    const logFile = path.join(__dirname, `discovery_log_iteration_${iteration}.json`);
    fs.promises.writeFile(logFile, JSON.stringify(discoveryLog, null, 2), 'utf-8');
    console.log(`Discovery log saved to: ${logFile}`);
}

function printDiscoverySummary(iteration: number, discoveries: any): void {
    console.log(`\n📊 DISCOVERY SUMMARY - Iteration ${iteration}`);
    console.log('=' + '='.repeat(49));
    
    console.log('\n👥 PEOPLE DISCOVERED:');
    discoveries.people.forEach((person: any, index: number) => {
        console.log(`  ${index + 1}. ${person.name} (source: ${person.source})`);
        if (person.relatedPlaces.length > 0) {
            console.log(`     Related places: ${person.relatedPlaces.join(', ')}`);
        }
    });
    
    console.log('\n🏙️ PLACES DISCOVERED:');
    discoveries.places.forEach((place: any, index: number) => {
        const barbaraFlag = place.barbaraFound ? ' 🎯' : '';
        console.log(`  ${index + 1}. ${place.name} (source: ${place.source})${barbaraFlag}`);
        if (place.relatedPeople.length > 0) {
            console.log(`     Related people: ${place.relatedPeople.join(', ')}`);
        }
    });
    
    console.log('\n🔗 RELATIONSHIPS DISCOVERED:');
    discoveryLog.relationships.forEach((rel, index) => {
        console.log(`  ${index + 1}. ${rel.person} ↔ ${rel.place} (via ${rel.source})`);
    });
    
    console.log('=' + '='.repeat(49));
}

async function main() {
    try {
        console.log('--- Starting Enhanced Data Sources Task ---');
        
        // Step 1: Fetch Barbara's note
        const barbaraNote = await fetchBarbaraNote();
        
        // Step 2: Extract names and cities
        const { names, cities } = await extractNamesAndCities(barbaraNote);
        
        // Step 3: Initialize data structures
        const kolejka_osob = new Set<string>();
        const kolejka_miast = new Set<string>();
        const checked_names = new Set<string>();
        const checked_cities = new Set<string>();
        const barbara_locations = new Set<string>();
        const original_cities = new Set(cities.map(normalize));
        const apikey = process.env.CENTRALA_API_KEY || '';
        
        // Add initial data from note
        names.forEach(name => kolejka_osob.add(normalize(name)));
        cities.forEach(city => kolejka_miast.add(normalize(city)));
        
        console.log('\n🔍 INITIAL DATA FROM NOTE:');
        console.log('Names to check:', Array.from(kolejka_osob));
        console.log('Cities to check:', Array.from(kolejka_miast));
        console.log('Original cities from note:', Array.from(original_cities));
        
        let iteration = 0;
        let maxIterations = 50; // Safety limit
        let barbaraFound = false;
        let barbaraCurrentLocation = '';
        
        // Initialize discovery tracking
        let currentDiscoveries: {
            people: Array<{
                name: string;
                source: string;
                relatedPlaces: string[];
            }>;
            places: Array<{
                name: string;
                source: string;
                relatedPeople: string[];
                barbaraFound: boolean;
            }>;
        } = {
            people: [],
            places: []
        };
        
        while ((kolejka_osob.size > 0 || kolejka_miast.size > 0) && iteration < maxIterations && !barbaraFound) {
            iteration++;
            console.log(`\n🔄 ITERATION ${iteration}`);
            console.log(`Queue sizes - People: ${kolejka_osob.size}, Cities: ${kolejka_miast.size}`);
            
            // Reset discoveries for this iteration
            currentDiscoveries = {
                people: [],
                places: []
            };
            
            // Process names first
            if (kolejka_osob.size > 0) {
                const name = Array.from(kolejka_osob)[0];
                kolejka_osob.delete(name);
                
                if (checked_names.has(name)) {
                    console.log(`⏭️ Skipping already checked name: ${name}`);
                    continue;
                }
                
                checked_names.add(name);
                console.log(`\n👤 Processing person: ${name}`);
                
                const response = await queryPeopleAPI(name, apikey);
                if (response && typeof response.message === 'string' && !response.message.includes('RESTRICTED')) {
                    const places = response.message.split(/\s+/).map((s: string) => normalize(s.trim())).filter(Boolean);
                    
                    // Log this person's discovery
                    currentDiscoveries.people.push({
                        name: name,
                        source: 'people_api',
                        relatedPlaces: places
                    });
                    
                    console.log(`📍 Places found for ${name}: ${places.join(', ')}`);
                    
                    // Add new places to queue and track relationships
                    for (const place of places) {
                        if (!checked_cities.has(place)) {
                            kolejka_miast.add(place);
                            console.log(`➕ Added new city to queue: ${place}`);
                        }
                        
                        // Track relationship
                        discoveryLog.relationships.push({
                            person: name,
                            place: place,
                            source: 'people_api'
                        });
                    }
                } else {
                    console.log(`❌ No valid response for person: ${name}`);
                }
            }
            // Process cities
            else if (kolejka_miast.size > 0) {
                const city = Array.from(kolejka_miast)[0];
                kolejka_miast.delete(city);
                
                if (checked_cities.has(city)) {
                    console.log(`⏭️ Skipping already checked city: ${city}`);
                    continue;
                }
                
                checked_cities.add(city);
                console.log(`\n🏙️ Processing city: ${city}`);
                
                // Check if Barbara is in this city
                const placesResponse = await queryPlacesAPI(city, apikey);
                let barbaraInCity = false;
                
                if (placesResponse && typeof placesResponse.message === 'string') {
                    if (placesResponse.message.includes('BARBARA')) {
                        barbara_locations.add(city);
                        barbaraInCity = true;
                        console.log(`🎯 BARBARA FOUND in: ${city}`);
                        
                        // Check if this is a new location (not from original note)
                        if (!original_cities.has(city)) {
                            barbaraFound = true;
                            barbaraCurrentLocation = city;
                            console.log(`🎯 BARBARA'S CURRENT LOCATION FOUND: ${city}`);
                        }
                    }
                }
                
                // Query cities API for people in this city
                const response = await queryCitiesAPI(city, apikey);
                let relatedPeople: string[] = [];
                
                if (response && typeof response.message === 'string' && !response.message.includes('RESTRICTED')) {
                    const namesFromCity = response.message.split(/\s+/).map((s: string) => normalize(s.trim())).filter(Boolean);
                    relatedPeople = namesFromCity;
                    
                    console.log(`👥 People found in ${city}: ${namesFromCity.join(', ')}`);
                    
                    // Add new people to queue
                    for (const person of namesFromCity) {
                        if (!checked_names.has(person)) {
                            kolejka_osob.add(person);
                            console.log(`➕ Added new person to queue: ${person}`);
                        }
                        
                        // Track relationship
                        discoveryLog.relationships.push({
                            person: person,
                            place: city,
                            source: 'cities_api'
                        });
                    }
                }
                
                // Log this city's discovery
                currentDiscoveries.places.push({
                    name: city,
                    source: 'cities_api',
                    relatedPeople: relatedPeople,
                    barbaraFound: barbaraInCity
                });
            }
            
            // Log discoveries for this iteration
            if (currentDiscoveries.people.length > 0 || currentDiscoveries.places.length > 0) {
                logDiscovery(iteration, currentDiscoveries);
                printDiscoverySummary(iteration, currentDiscoveries);
            }
            
            // Safety check - if we've found Barbara in a new location, we can stop
            if (barbaraFound) {
                console.log(`\n🎯 BARBARA'S CURRENT LOCATION IDENTIFIED: ${barbaraCurrentLocation}`);
                break;
            }
        }
        
        // Final summary
        console.log('\n📋 FINAL SUMMARY');
        console.log('=' .repeat(50));
        console.log(`Total iterations: ${iteration}`);
        console.log(`Total people checked: ${checked_names.size}`);
        console.log(`Total cities checked: ${checked_cities.size}`);
        console.log(`Barbara locations found: ${Array.from(barbara_locations).join(', ')}`);
        console.log(`Original cities from note: ${Array.from(original_cities).join(', ')}`);
        
        if (barbaraFound) {
            console.log(`\n🎯 Barbara's current location (not from original note): ${barbaraCurrentLocation}`);
            await sendAnswerToCentrala(barbaraCurrentLocation, apikey);
        } else {
            console.log('\n❌ No new location found for Barbara');
            console.log('Barbara was only found in original cities from the note');
            // Send the first original city as the answer
            const fallbackCity = Array.from(original_cities)[0];
            if (fallbackCity) {
                console.log(`\n📤 Sending fallback original city to Centrala: ${fallbackCity}`);
                await sendAnswerToCentrala(fallbackCity, apikey);
            } else {
                console.log('No original city available to send as fallback.');
            }
        }
        
        // Save final discovery log
        const finalLogFile = path.join(__dirname, 'final_discovery_log.json');
        await fs.promises.writeFile(finalLogFile, JSON.stringify(discoveryLog, null, 2), 'utf-8');
        console.log(`\nFinal discovery log saved to: ${finalLogFile}`);
        
        console.log('--- Enhanced Data Sources Task Completed ---');
    } catch (error) {
        console.error('Unhandled error:', error);
        process.exit(1);
    }
}

main(); 