// TypeScript declarations
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import fetch from 'node-fetch';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Configuration, OpenAIApi } from 'openai';

// --- Configuration ---
const CONFIG = {
    API: {
        CENTRALA_DATA: (apiKey: string) => `https://c3ntrala.ag3nts.org/data/${apiKey}/multimedia.txt`,
        CENTRALA_ANSWER: "https://c3ntrala.ag3nts.org/answer",
        CENTRALA_REPORT: "https://c3ntrala.ag3nts.org/report"
    },
    WEBSITE: {
        URL: "https://c3ntrala.ag3nts.org/dane/arxiv-draft.html"
    },
    PATHS: {
        AUDIO: path.join(__dirname, 'audio'),
        IMAGES: path.join(__dirname, 'images'),
        TEXT: path.join(__dirname, 'text')
    }
};

// --- API Keys ---
const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY || '';

// Validate required API keys
if (!CENTRALA_API_KEY) {
    console.error("ERROR: CENTRALA_API_KEY environment variable not set.");
    process.exit(1);
}

// Create a custom HTTPS agent that ignores certificate validation
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'models/gemini-2.5-flash-preview-05-20' });

// Initialize OpenAI
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

/**
 * Fetches website content
 */
async function fetchWebsiteContent(): Promise<string> {
    try {
        const response = await fetch(CONFIG.WEBSITE.URL, { 
            agent: httpsAgent,
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36' }
        });
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Error fetching website: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Saves text content to a file
 */
async function saveTextContent(content: string, filename: string): Promise<void> {
    const filePath = path.join(CONFIG.PATHS.TEXT, filename);
    try {
        await fs.promises.writeFile(filePath, content, 'utf8');
        console.log(`Saved text content to: ${filePath}`);
    } catch (error) {
        console.error(`Error saving text content: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Downloads and saves an image
 */
async function downloadAndSaveImage(url: string, filename: string, description: string): Promise<void> {
    try {
        const imagePath = path.join(CONFIG.PATHS.IMAGES, filename);
        const textFilename = filename.replace(/\.[^/.]+$/, '.txt');
        const textPath = path.join(CONFIG.PATHS.TEXT, textFilename);

        // Check if both image and description already exist
        try {
            await fs.promises.access(imagePath);
            await fs.promises.access(textPath);
            console.log(`Skipping ${filename} - already processed`);
            return;
        } catch (error) {
            // File doesn't exist, continue with processing
        }

        const response = await fetch(url, { agent: httpsAgent });
        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText}`);
        }

        const buffer = await response.buffer();
        await fs.promises.writeFile(imagePath, buffer);
        console.log(`Saved image: ${filename}`);

        // Generate description using Gemini
        const imageData = {
            inlineData: {
                data: buffer.toString('base64'),
                mimeType: response.headers.get('content-type') || 'image/jpeg'
            }
        };

        const prompt = `Based on the filename "${filename}" and the image content, provide a detailed description of what you see in this image. Focus on the main subject, colors, composition, and any notable details.`;
        
        const result = await model.generateContent([prompt, imageData]);
        const generatedDescription = result.response.text();

        // Save the description to a text file
        await fs.promises.writeFile(textPath, generatedDescription);
        console.log(`Saved description: ${textFilename}`);

    } catch (error) {
        console.error(`Error processing image ${url}:`, error);
    }
}

/**
 * Downloads and saves an audio file
 */
async function downloadAndSaveAudio(url: string, filename: string, description: string): Promise<void> {
    try {
        const audioPath = path.join(CONFIG.PATHS.AUDIO, filename);
        const textFilename = filename.replace(/\.[^/.]+$/, '.txt');
        const textPath = path.join(CONFIG.PATHS.TEXT, textFilename);

        // Check if both audio and transcription already exist
        try {
            await fs.promises.access(audioPath);
            await fs.promises.access(textPath);
            console.log(`Skipping ${filename} - already processed`);
            return;
        } catch (error) {
            // File doesn't exist, continue with processing
        }

        const response = await fetch(url, { agent: httpsAgent });
        if (!response.ok) {
            throw new Error(`Failed to download audio: ${response.statusText}`);
        }

        const buffer = await response.buffer();
        await fs.promises.writeFile(audioPath, buffer);
        console.log(`Saved audio: ${filename}`);

        // Transcribe audio using Whisper
        const transcriptionResponse = await openai.createTranscription(
            fs.createReadStream(audioPath) as any,
            "whisper-1",
            undefined,
            "text"
        );

        // Save the transcription to a text file
        await fs.promises.writeFile(textPath, transcriptionResponse.data.toString());
        console.log(`Saved transcription: ${textFilename}`);

    } catch (error) {
        console.error(`Error processing audio ${url}:`, error);
    }
}

/**
 * Main function
 */
async function main() {
    console.log("--- Starting Multimedia Website Reader Task ---");

    try {
        // 1. Fetch website content
        const htmlContent = await fetchWebsiteContent();
        console.log("Successfully fetched website content");
        
        // 2. Parse HTML content
        const dom = new JSDOM(htmlContent);
        const document = dom.window.document;
        
        // 3. Extract and save text content
        const textContent = document.body.textContent || '';
        await saveTextContent(textContent, 'content.txt');
        
        // 4. Extract and save images
        const images = document.getElementsByTagName('img');
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const src = img.getAttribute('src');
            if (src) {
                const imageUrl = new URL(src, CONFIG.WEBSITE.URL).href;
                if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                    // Try to get description from various sources
                    let description = '';
                    
                    // First try: alt text
                    description = img.getAttribute('alt') || '';
                    
                    // Second try: aria-label
                    if (!description) {
                        description = img.getAttribute('aria-label') || '';
                    }
                    
                    // Third try: title attribute
                    if (!description) {
                        description = img.getAttribute('title') || '';
                    }
                    
                    // Fourth try: data-description attribute
                    if (!description) {
                        description = img.getAttribute('data-description') || '';
                    }
                    
                    // Fifth try: look for a caption in a nearby element
                    if (!description) {
                        const parent = img.parentElement;
                        if (parent) {
                            // Look for a caption in a figcaption or p element
                            const caption = parent.querySelector('figcaption') || 
                                          parent.querySelector('p') ||
                                          parent.nextElementSibling;
                            if (caption) {
                                description = caption.textContent?.trim() || '';
                            }
                        }
                    }
                    
                    // If we still don't have a description, use a meaningful default
                    if (!description) {
                        description = `image_${i + 1}`;
                    }
                    
                    // Sanitize filename: remove invalid characters and replace spaces with underscores
                    const sanitizedDescription = description
                        .replace(/[^a-z0-9]/gi, '_')  // Replace non-alphanumeric with underscore
                        .replace(/_+/g, '_')          // Replace multiple underscores with single
                        .replace(/^_|_$/g, '')        // Remove leading/trailing underscores
                        .toLowerCase();
                    
                    const filename = `${sanitizedDescription}${path.extname(src)}`;
                    console.log(`Saving image with description: "${description}" as "${filename}"`);
                    await downloadAndSaveImage(imageUrl, filename, description);
                } else {
                    console.log(`Skipped non-http(s) image src: ${src}`);
                }
            }
        }
        
        // 5. Extract and save audio files
        const audioElements = document.getElementsByTagName('audio');
        for (let i = 0; i < audioElements.length; i++) {
            const audio = audioElements[i];
            // Check audio src attribute
            const src = audio.getAttribute('src');
            if (src) {
                const audioUrl = new URL(src, CONFIG.WEBSITE.URL).href;
                if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
                    // Get description from aria-label, title, or data-description
                    const description = audio.getAttribute('aria-label') || 
                                     audio.getAttribute('title') || 
                                     audio.getAttribute('data-description') || 
                                     `audio_${i + 1}`;
                    // Sanitize filename
                    const sanitizedDescription = description.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const filename = `${sanitizedDescription}${path.extname(src)}`;
                    console.log(`Saving audio with description: "${description}" as "${filename}"`);
                    await downloadAndSaveAudio(audioUrl, filename, description);
                } else {
                    console.log(`Skipped non-http(s) audio src: ${audioUrl}`);
                }
            }
            // Check source elements inside audio
            const sources = audio.getElementsByTagName('source');
            for (let j = 0; j < sources.length; j++) {
                const source = sources[j];
                const sourceSrc = source.getAttribute('src');
                if (sourceSrc) {
                    const audioUrl = new URL(sourceSrc, CONFIG.WEBSITE.URL).href;
                    if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
                        // Get description from parent audio element or source itself
                        const description = audio.getAttribute('aria-label') || 
                                         audio.getAttribute('title') || 
                                         source.getAttribute('title') || 
                                         `audio_${i + 1}_source_${j + 1}`;
                        // Sanitize filename
                        const sanitizedDescription = description.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        const filename = `${sanitizedDescription}${path.extname(sourceSrc)}`;
                        console.log(`Saving audio with description: "${description}" as "${filename}"`);
                        await downloadAndSaveAudio(audioUrl, filename, description);
                    } else {
                        console.log(`Skipped non-http(s) audio source: ${sourceSrc}`);
                    }
                }
            }
        }

        // 6. Look for audio files in links
        const links = document.getElementsByTagName('a');
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const href = link.getAttribute('href');
            if (href) {
                const url = new URL(href, CONFIG.WEBSITE.URL).href;
                if ((url.startsWith('http://') || url.startsWith('https://')) && 
                    (url.endsWith('.mp3') || url.endsWith('.wav') || url.endsWith('.ogg') || url.endsWith('.m4a'))) {
                    // Get description from link text or title
                    const description = link.textContent?.trim() || 
                                     link.getAttribute('title') || 
                                     `audio_link_${i + 1}`;
                    // Sanitize filename
                    const sanitizedDescription = description.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const filename = `${sanitizedDescription}${path.extname(href)}`;
                    console.log(`Saving audio with description: "${description}" as "${filename}"`);
                    await downloadAndSaveAudio(url, filename, description);
                }
            }
        }

        // 7. Look for audio files in any element with data attributes
        const allElements = document.getElementsByTagName('*');
        for (let i = 0; i < allElements.length; i++) {
            const element = allElements[i];
            const dataAudio = element.getAttribute('data-audio');
            if (dataAudio) {
                const audioUrl = new URL(dataAudio, CONFIG.WEBSITE.URL).href;
                if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
                    // Get description from data-description or element's text content
                    const description = element.getAttribute('data-description') || 
                                     element.textContent?.trim() || 
                                     `audio_data_${i + 1}`;
                    // Sanitize filename
                    const sanitizedDescription = description.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const filename = `${sanitizedDescription}${path.extname(dataAudio)}`;
                    console.log(`Saving audio with description: "${description}" as "${filename}"`);
                    await downloadAndSaveAudio(audioUrl, filename, description);
                }
            }
        }
        
    } catch (error) {
        console.error(`Task failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
    
    console.log("--- Multimedia Website Reader Task Completed ---");

    // Call the arxiv answer function at the end of main
    await generateArxivAnswer();
}

// --- Arxiv Answer Functionality ---
const QUESTIONS_URL = `https://c3ntrala.ag3nts.org/data/${CENTRALA_API_KEY}/arxiv.txt`;

async function fetchQuestions(): Promise<{ [key: string]: string }> {
    console.log(`Fetching questions from: ${QUESTIONS_URL}`);
    const res = await fetch(QUESTIONS_URL, { agent: httpsAgent });
    if (!res.ok) throw new Error(`Failed to fetch questions: ${res.status}`);
    const text = await res.text();
    console.log('Raw response:', text);
    
    const lines = text.split('\n').filter(Boolean);
    console.log('Split lines:', lines);
    
    const questions: { [key: string]: string } = {};
    for (const line of lines) {
        const match = line.match(/^([0-9]{2})=(.+)$/);
        if (match) {
            questions[match[1]] = match[2];
        } else {
            console.log('Line did not match pattern:', line);
        }
    }
    console.log("Parsed questions:", questions);
    return questions;
}

async function getFileSummaries(): Promise<string> {
    const summaries: { [key: string]: string } = {};
    
    // Get all text files
    const textFiles = await fs.promises.readdir(CONFIG.PATHS.TEXT);
    for (const file of textFiles) {
        if (file.endsWith('.txt')) {
            const content = await fs.promises.readFile(path.join(CONFIG.PATHS.TEXT, file), 'utf-8');
            summaries[file] = content;
        }
    }
    
    // Get all image files
    const imageFiles = await fs.promises.readdir(CONFIG.PATHS.IMAGES);
    for (const file of imageFiles) {
        if (file.endsWith('.png')) {
            summaries[file] = file;
        }
    }
    
    // Get all audio files
    const audioFiles = await fs.promises.readdir(CONFIG.PATHS.AUDIO);
    for (const file of audioFiles) {
        if (file.endsWith('.mp3')) {
            summaries[file] = file;
        }
    }
    
    console.log("File summaries:", summaries);
    return JSON.stringify(summaries, null, 2);
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

    console.log({
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(response),
        agent: httpsAgent
    });
    console.log(res);
    
    if (!res.ok) {
        throw new Error(`Failed to send response: ${res.status}`);
    }
    
    const result = await res.text();
    console.log('\nCentrala response:', result);
}

async function generateArxivAnswer() {
    try {
        const questions = await fetchQuestions();
        const fileSummaries = await getFileSummaries();
        
        const answers: { [key: string]: string } = {};
        
        // Process each question separately
        for (const [number, question] of Object.entries(questions)) {
            console.log(`\nProcessing question ${number}: ${question}`);
            
            const prompt = `Based on the following context, please answer this question: "${question}"
            
Context from files:
${fileSummaries}

IMPORTANT:
1. The answer MUST be found in the provided data - it is 100% there
2. If you're not sure, look through the data again carefully
3. Provide a concise answer (3-8 words)
4. Do not add any explanations or additional context
5. Do not use phrases like "Based on the data" or "According to the text"
6. Just provide the direct answer that answers the question`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const answer = response.text().trim();
            
            console.log(`Answer for question ${number}:`, answer);
            answers[number] = answer;
        }

        const response = {
            task: "arxiv",
            apikey: CENTRALA_API_KEY,
            answer: answers
        };

        console.log("\nFinal response:", JSON.stringify(response, null, 2));
        
        // Send response to Centrala
        await sendToCentrala(response);
    } catch (error) {
        console.error("Error generating arxiv answer:", error);
        throw error;
    }
}

main().catch(error => {
    console.error(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});