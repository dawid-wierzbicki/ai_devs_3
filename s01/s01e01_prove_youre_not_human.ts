import fetch, { Response } from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- Configuration ---
const XYZ_BASE_URL = "https://xyz.ag3nts.org/";
const LOGIN_URL = XYZ_BASE_URL;
const CENTRALA_ANSWER_URL = "https://c3ntrala.ag3nts.org/answer";

// --- API Keys ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY!;

// Validate required API keys
if (!process.env.GEMINI_API_KEY || !process.env.CENTRALA_API_KEY) {
    console.log("ERROR: Required API keys not set in environment variables");
    console.log("Please set GEMINI_API_KEY and CENTRALA_API_KEY");
    process.exit(1);
}

// Login credentials
const LOGIN_USERNAME = "tester";
const LOGIN_PASSWORD = "574e112a";

function configureGeminiModel() {
    if (!GEMINI_API_KEY) {
        console.log("ERROR: GEMINI_API_KEY environment variable is not set.");
        return null;
    }
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
        return model;
    } catch (error) {
        console.log(`ERROR: Could not initialize Gemini model: ${error}`);
        return null;
    }
}

async function fetchQuestionFromForm(loginPageUrl: string): Promise<string | null> {
    console.log(`[Login] Fetching question from: ${loginPageUrl}`);
    try {
        const response = await fetch(loginPageUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        
        // Try different regex patterns to find the question
        let match = html.match(/<label for="answer">Question: (.*?)<\/label>/i);
        if (!match) {
            match = html.match(/<div id="human-question">\s*Question:\s*(.*?)\s*<\/div>/is);
            if (!match) {
                match = html.match(/<p id="human-question">\s*Question:\s*(.*?)\s*<\/p>/is);
                if (!match) {
                    console.log(`ERROR: Question not found on the page. HTML:\n${html.slice(0, 1000)}...`);
                    return null;
                }
            }
        }
        
        const questionText = match[1].trim();
        console.log(`[Login] Extracted question: "${questionText}"`);
        return questionText;
    } catch (error) {
        console.log(`ERROR: Could not fetch login page: ${error}`);
        return null;
    }
}

async function getAnswerFromLLM(question: string, llmModel: any): Promise<string | null> {
    if (!llmModel) {
        console.log("ERROR: LLM model is not configured.");
        return null;
    }
    console.log(`[LLM] Sending question to LLM: "${question}"`);
    try {
        const fullPrompt = `Please answer the following question very concisely: ${question}`;
        const response = await llmModel.generateContent(fullPrompt);
        const answerText = response.response.text().trim();
        console.log(`[LLM] LLM Answer: "${answerText}"`);
        return answerText;
    } catch (error) {
        console.log(`ERROR: Problem getting answer from LLM: ${error}`);
        return null;
    }
}

async function submitLoginForm(loginPageUrl: string, username: string, password: string, questionAnswer: string): Promise<Response | null> {
    const payload = new URLSearchParams();
    payload.append("username", username);
    payload.append("password", password);
    payload.append("answer", questionAnswer);
    
    console.log(`[Login] Sending POST data to: ${loginPageUrl}`);
    console.log(`[Login] Data: username=${username}, password=${password}, answer=${questionAnswer}`);
    
    try {
        const response = await fetch(loginPageUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: payload.toString(),
            redirect: 'follow'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        console.log(`[Login] Server response (status: ${response.status}, URL after redirect: ${response.url})`);
        return response;
    } catch (error) {
        console.log(`ERROR: Problem submitting login form: ${error}`);
        return null;
    }
}

async function submitFlagToCentralaAnswer(answerSubmissionUrl: string, apiKey: string, flagToSubmit: string): Promise<boolean> {
    console.log(`[Centrala Answer] Submitting flag: "${flagToSubmit}" with API key (first 4 chars: ${apiKey.slice(0, 4)}) to ${answerSubmissionUrl}`);
    
    const payload = new URLSearchParams();
    payload.append("key", apiKey);
    payload.append("flag", flagToSubmit);
    
    try {
        const response = await fetch(answerSubmissionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: payload.toString()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const responseText = await response.text();
        console.log(`[Centrala Answer] Response from ${answerSubmissionUrl} (status ${response.status}):\n${responseText}`);
        
        if (response.status === 200) {
            console.log("[Centrala Answer] Flag probably submitted successfully.");
            return true;
        } else {
            console.log("[Centrala Answer] Flag submission might have failed (status other than 200 OK).");
            return false;
        }
    } catch (error) {
        console.log(`ERROR: Could not submit flag to ${answerSubmissionUrl}: ${error}`);
        return false;
    }
}

async function main() {
    console.log("--- Starting S01E01 Task: Login Automation ---");
    
    const llmModel = configureGeminiModel();
    if (!llmModel) {
        return;
    }

    const formQuestion = await fetchQuestionFromForm(LOGIN_URL);
    if (!formQuestion) {
        return;
    }

    const llmAnswer = await getAnswerFromLLM(formQuestion, llmModel);
    if (!llmAnswer) {
        return;
    }
    
    // Attempt to extract an integer from the LLM's answer
    console.log(`[Login] Attempting to extract number from LLM answer: '${llmAnswer}'`);
    const numberMatch = llmAnswer.match(/\d+/);
    let finalAnswerForForm: string;
    
    if (numberMatch) {
        finalAnswerForForm = numberMatch[0];
        console.log(`[Login] Extracted number: '${finalAnswerForForm}'. Using it as the answer.`);
    } else {
        finalAnswerForForm = llmAnswer;
        console.log(`[Login] No number found in LLM answer. Using full text: '${finalAnswerForForm}'`);
    }

    const loginResponse = await submitLoginForm(LOGIN_URL, LOGIN_USERNAME, LOGIN_PASSWORD, finalAnswerForForm);
    if (!loginResponse) {
        return;
    }

    // Extract content from within {{FLG:...}} in the HTML response
    const responseHtml = await loginResponse.text();
    
    
    const flagMatch = responseHtml.match(/\{\{FLG:(.*?)\}\}/s);
    if (flagMatch) {
        const flag = flagMatch[1].trim();
        console.log(`--- SUCCESS! Found flag: ${flag} ---`);
        
        // Submit the flag to the /answer endpoint in Centrala
        console.log(`Submitting flag "${flag}" to ${CENTRALA_ANSWER_URL}...`);
        await submitFlagToCentralaAnswer(CENTRALA_ANSWER_URL, CENTRALA_API_KEY, flag);
    } else {
        console.log("--- WARNING: Flag (in format {{FLG:...}}) not found in HTML response after login. ---");
    }
}

main().catch(console.error); 