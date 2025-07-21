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

async function downloadQuestions(): Promise<void> {
    console.log('--- Downloading questions from Centrala ---');
    
    const questionsUrl = `https://c3ntrala.ag3nts.org/data/${CENTRALA_API_KEY}/softo.json`;
    console.log(`Fetching questions from: ${questionsUrl}`);
    
    try {
        const response = await fetch(questionsUrl, { agent: httpsAgent });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch questions: ${response.status} ${response.statusText}`);
        }
        
        const questionsData = await response.text();
        
        // Save to questions.json file
        const questionsPath = path.join(__dirname, 'questions.json');
        await fs.promises.writeFile(questionsPath, questionsData, 'utf-8');
        
        console.log(`✅ Questions saved to: ${questionsPath}`);
        
        // Parse and display basic info
        try {
            const parsed = JSON.parse(questionsData);
            console.log(`📊 Questions structure:`, Object.keys(parsed));
            if (Array.isArray(parsed)) {
                console.log(`📋 Number of questions: ${parsed.length}`);
            }
        } catch (parseError) {
            console.log('📄 Raw data saved (not JSON parseable)');
        }
        
    } catch (error) {
        console.error('Error downloading questions:', error);
        throw error;
    }
}

async function downloadWebsiteContent(url: string): Promise<string> {
    console.log(`📥 Downloading content from: ${url}`);
    
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            ...(isHttps ? { rejectUnauthorized: false } : {})
        };
        
        const req = client.request(options, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redirectUrl = res.headers.location;
                if (redirectUrl) {
                    console.log(`🔄 Redirecting to: ${redirectUrl}`);
                    resolve(downloadWebsiteContent(redirectUrl));
                    return;
                }
            }
            
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`✅ Downloaded ${data.length} characters from ${url}`);
                resolve(data);
            });
        });
        
        req.on('error', (error) => {
            console.error(`Error downloading ${url}:`, error);
            reject(error);
        });
        
        req.end();
    });
}

async function convertHtmlToMarkdown(htmlContent: string): Promise<string> {
    console.log('📝 Converting HTML to clean text/markdown...');
    
    let text = htmlContent;
    
    // Remove script and style elements completely
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    
    // Convert common HTML elements to markdown/text equivalents
    text = text.replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi, (match, level, content) => {
        const hashes = '#'.repeat(parseInt(level));
        return `\n${hashes} ${content.trim()}\n`;
    });
    
    text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    
    // Convert lists
    text = text.replace(/<ul[^>]*>/gi, '\n');
    text = text.replace(/<\/ul>/gi, '\n');
    text = text.replace(/<ol[^>]*>/gi, '\n');
    text = text.replace(/<\/ol>/gi, '\n');
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    
    // Remove all other HTML tags
    text = text.replace(/<[^>]*>/g, ' ');
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ');
    text = text.replace(/\n\s+/g, '\n');
    text = text.replace(/\s+\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#039;/g, "'");
    
    return text.trim();
}

async function extractLinksFromHtml(htmlContent: string, baseUrl: string): Promise<string[]> {
    console.log('🔗 Extracting links from HTML content...');
    
    const prompt = `Extract all internal links from this HTML content. Return only the URLs that are relative to the website (not external links to other domains).
    
    Base URL: ${baseUrl}
    
    HTML Content:
    ${htmlContent}
    
    Return the links as a JSON array of strings. Include the full URLs by combining with the base URL if they are relative paths.`;
    
    try {
        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();
        
        // Try to parse JSON response
        const jsonMatch = response.match(/\[(.*?)\]/s);
        if (jsonMatch) {
            const links = JSON.parse(jsonMatch[0]);
            console.log(`🔗 Found ${links.length} internal links:`, links);
            return links;
        }
        
        console.log('⚠️ Could not extract links in JSON format');
        return [];
        
    } catch (error) {
        console.error('Error extracting links:', error);
        return [];
    }
}

async function askGeminiAboutContent(question: string, content: string, url: string): Promise<{ hasAnswer: boolean; answer?: string; suggestedLink?: string }> {
    console.log(`🤖 Asking Gemini about: ${question}`);
    
    // Convert HTML to clean markdown/text first
    const cleanContent = await convertHtmlToMarkdown(content);
    console.log(`📝 Converted to ${cleanContent.length} characters of clean text`);
    
    const prompt = `Analyze this website content and answer the following question:

Question: "${question}"

Website URL: ${url}
Clean Content: ${cleanContent}

Please respond in JSON format:
{
    "hasAnswer": boolean,  // true if you can find a definitive answer to the question in this content
    "answer": string,      // if hasAnswer is true, provide the specific answer
    "suggestedLink": string // if hasAnswer is false, suggest which link from the content is most likely to contain the answer (if any links are mentioned)
}

Be precise - only set hasAnswer to true if you find a direct, explicit answer in the content.`;
    
    try {
        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();
        
        console.log(`🤖 Raw Gemini response: ${response.substring(0, 500)}...`);
        
        // Try to parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            console.log(`📊 Analysis result:`, analysis);
            return analysis;
        }
        
        console.log('⚠️ Could not parse Gemini response as JSON');
        console.log(`Full response: ${response}`);
        return { hasAnswer: false };
        
    } catch (error) {
        console.error('Error asking Gemini:', error);
        return { hasAnswer: false };
    }
}

async function processQuestions(): Promise<void> {
    console.log('--- Processing Questions with Web Scraping ---');
    
    // Read questions
    const questionsPath = path.join(__dirname, 'questions.json');
    const questionsData = await fs.promises.readFile(questionsPath, 'utf-8');
    const questions = JSON.parse(questionsData);
    
    const answers: { [key: string]: string } = {};
    const baseUrl = 'https://softo.ag3nts.org';
    
    // Download main website content
    const mainContent = await downloadWebsiteContent(baseUrl + '/');
    
    // Debug: Save main content to see what we got
    const debugPath = path.join(__dirname, 'main_content.html');
    await fs.promises.writeFile(debugPath, mainContent, 'utf-8');
    console.log(`🐛 Debug: Main content saved to ${debugPath}`);
    
    // Process each question
    for (const [questionId, question] of Object.entries(questions)) {
        console.log(`\n=== Processing Question ${questionId}: ${question} ===`);
        
        let found = false;
        let visitedUrls = new Set<string>();
        let urlsToVisit = [baseUrl + '/'];
        let currentContent = mainContent;
        let currentUrl = baseUrl + '/';
        let maxPages = 5; // Limit to prevent infinite loops
        let pageCount = 0;
        
        console.log(`🔄 Starting search for question ${questionId}. URLs to visit: ${urlsToVisit.length}`);
        
        while (!found && urlsToVisit.length > 0 && pageCount < maxPages) {
            currentUrl = urlsToVisit.shift()!;
            console.log(`🌐 Processing URL: ${currentUrl}`);
            
            if (visitedUrls.has(currentUrl)) {
                console.log(`⏭️ Already visited ${currentUrl}, skipping`);
                continue;
            }
            
            visitedUrls.add(currentUrl);
            pageCount++;
            
            if (currentUrl !== baseUrl + '/') {
                currentContent = await downloadWebsiteContent(currentUrl);
            }
            
            // Ask Gemini about this content
            console.log(`🔍 Analyzing ${currentContent.length} characters from ${currentUrl} (page ${pageCount}/${maxPages})`);
            const analysis = await askGeminiAboutContent(question as string, currentContent, currentUrl);
            
            if (analysis.hasAnswer && analysis.answer) {
                console.log(`✅ Found answer for ${questionId}: ${analysis.answer}`);
                answers[questionId] = analysis.answer;
                found = true;
            } else {
                console.log(`❌ No answer found on ${currentUrl}`);
                
                // If Gemini suggests a link, add it to visit queue
                if (analysis.suggestedLink && !visitedUrls.has(analysis.suggestedLink)) {
                    console.log(`🎯 Gemini suggests visiting: ${analysis.suggestedLink}`);
                    // Convert relative URLs to absolute URLs
                    const fullUrl = analysis.suggestedLink.startsWith('http') 
                        ? analysis.suggestedLink 
                        : baseUrl + analysis.suggestedLink;
                    urlsToVisit.push(fullUrl);
                } else {
                    // Extract links from current page and add them to queue
                    const links = await extractLinksFromHtml(currentContent, baseUrl);
                    for (const link of links) {
                        if (!visitedUrls.has(link) && !urlsToVisit.includes(link)) {
                            urlsToVisit.push(link);
                        }
                    }
                }
            }
            
            // Add small delay to be respectful
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (!found) {
            console.log(`⚠️ Could not find answer for question ${questionId}`);
            answers[questionId] = "Nie znaleziono odpowiedzi";
        }
    }
    
    // Save answers
    const answersPath = path.join(__dirname, 'answers.json');
    await fs.promises.writeFile(answersPath, JSON.stringify(answers, null, 2), 'utf-8');
    console.log(`💾 Answers saved to: ${answersPath}`);
    
    console.log('\n📋 Final Answers:');
    Object.entries(answers).forEach(([id, answer]) => {
        console.log(`${id}: ${answer}`);
    });
}

async function main() {
    try {
        console.log('--- Starting External Data Sources Task ---');
        
        // Download questions from Centrala (if not already done)
        const questionsPath = path.join(__dirname, 'questions.json');
        if (!fs.existsSync(questionsPath)) {
            await downloadQuestions();
        } else {
            console.log('✅ Questions file already exists, skipping download');
        }
        
        // Process questions by scraping the website
        // await processQuestions();
        
        // Load answers and submit to Centrala
        const answersPath = path.join(__dirname, 'answers.json');
        if (fs.existsSync(answersPath)) {
            const answersData = await fs.promises.readFile(answersPath, 'utf-8');
            const answers = JSON.parse(answersData);
            
            console.log('📋 Final answers to submit:', answers);
            
            // Submit to Centrala with task "softo"
            const response = {
                task: "softo",
                apikey: CENTRALA_API_KEY,
                answer: answers
            };
            
            console.log('\n--- Submitting answers to Centrala ---');
            console.log('Request format:', JSON.stringify(response, null, 2));
            await sendToCentrala(response);
        } else {
            console.log('❌ No answers file found, run processing first');
        }
        
        console.log('--- External Data Sources Task Completed ---');
    } catch (error) {
        console.error('Unhandled error:', error);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
} 