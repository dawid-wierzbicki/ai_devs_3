import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

// --- Configuration ---
const CONFIG = {
    API: {
        VERIFICATION: "https://xyz.ag3nts.org/verify",
        CENTRALA_ANSWER: "https://c3ntrala.ag3nts.org/answer",
        CENTRALA_DATA: (apiKey: string) => `https://c3ntrala.ag3nts.org/data/${apiKey}/json.txt`,
        REPORT: "https://c3ntrala.ag3nts.org/report"
    },
    MESSAGES: {
        INITIAL: "READY"
    },
    PROMPTS: {
        GEMINI_SYSTEM: "<system> You only speak English and never reply in any other language. You also reply as short as possible. " +
            "Only answer, no other text. No explaining. Preferably answer with one word." +
            "Keep that in mind when answering this question: </system>"
    }
};

// Error handling utilities
class AppError extends Error {
    constructor(message: string, public context: string) {
        super(message);
        this.name = 'AppError';
    }
}

function formatError(error: unknown, context: string): string {
    if (error instanceof AppError) {
        return `[${error.context}] ${error.message}`;
    } else if (error instanceof Error) {
        return `[${context}] ${error.message}`;
    } else {
        return `[${context}] ${String(error)}`;
    }
}

// --- API Keys ---
const GEMINI_API_KEY_ENV = process.env.GEMINI_API_KEY;
const CENTRALA_API_KEY_ENV = process.env.CENTRALA_API_KEY;

if (CENTRALA_API_KEY_ENV) {
    console.log("[Configuration] Using CENTRALA_API_KEY from environment variable.");
} else {
    console.error("[Configuration] ERROR: CENTRALA_API_KEY environment variable not set and no fallback value available.");
}

const GEMINI_SYSTEM_PROMPT_ROBOT_PERSONA =
    "<system> You only speak English and never reply in any other language. You also reply as short as possible. " +
    "Only answer, no other text. No explaining. Preferably answer with one word." +
    "Keep that in mind when answering this question: </system>";

// --- Interfaces for API communication ---
interface VerificationPayload {
    text: string;
    msgID: number;
}

interface VerificationAPIResponse {
    msgID: number;
    text: string;
}

interface VerificationStepResult {
    text: string;
    msgID: number;
}

// --- Interfaces for calibration data ---
interface TestData {
    question: string;
    answer: number;
    test?: {
        q: string;
        a: string;
    };
}

interface CalibrationData {
    apikey: string;
    description: string;
    copyright: string;
    "test-data": TestData[];
}

interface ResponsePayload {
    task: string;
    apikey: string;
    answer: CalibrationData;
}

/**
 * Sends a request to the verification endpoint and processes the response.
 */
async function sendVerificationRequest(payload: VerificationPayload): Promise<VerificationStepResult | null> {
    const apiUrl = CONFIG.API.VERIFICATION;
    console.log(`[Verification Step] Sending to ${apiUrl}: ${JSON.stringify(payload)}`);
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error(`[Verification Step] Request failed: ${response.status} - ${await response.text()}`);
            return null;
        }

        const responseText = await response.text();
        console.log(`[Verification Step] Raw response: ${responseText}`);

        const parsedResponse: VerificationAPIResponse = JSON.parse(responseText);
        const { text, msgID } = parsedResponse;

        if (!text) {
            console.error("[Verification Step] Error: 'text' field missing or empty in response.");
            return null;
        }
        if (typeof msgID !== 'number') {
            console.error("[Verification Step] Error: 'msgID' field missing or not a number in response.");
            return null;
        }
        return { text, msgID };
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.error(`[Verification Step] Error: Could not decode JSON response. Details: ${error.message}`);
        } else {
            console.error(`[Verification Step] Error during request: ${error instanceof Error ? error.message : String(error)}`);
        }
        return null;
    }
}

/**
 * Submits the obtained flag to the Centrala /answer endpoint.
 */
async function submitFlagToCentrala(flag: string): Promise<void> {
    if (!CENTRALA_API_KEY_ENV) {
        console.error("[Configuration] ERROR: CENTRALA_API_KEY environment variable not set and no fallback value available.");
        throw new Error("CENTRALA_API_KEY environment variable not set");
    }

    console.log(`[Centrala Submission] Submitting flag: "${flag}" to ${CONFIG.API.CENTRALA_ANSWER} using API key (first 4 chars: ${CENTRALA_API_KEY_ENV.substring(0,4)}).`);
    
    const payload = new URLSearchParams();
    payload.append("key", CENTRALA_API_KEY_ENV);
    payload.append("flag", flag);

    try {
        const response = await fetch(CONFIG.API.CENTRALA_ANSWER, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: payload.toString(),
        });

        const responseText = await response.text();
        if (!response.ok) {
            console.error(`[Centrala Submission] Request failed: ${response.status} - ${responseText}`);
            return;
        }
        console.log(`[Centrala Submission] Response from ${CONFIG.API.CENTRALA_ANSWER} (status ${response.status}):\n${responseText}`);
        if (response.status === 200 && (responseText.toLowerCase().includes("success") || responseText.toLowerCase().includes("ok") || responseText.toLowerCase().includes("correct"))) {
            console.log("[Centrala Submission] Flag submitted successfully to Centrala.");
        } else {
            console.log(`[Centrala Submission] Flag submission to Centrala may have failed or response did not indicate clear success. Received status ${response.status} with response: ${responseText}`);
        }
    } catch (error) {
        console.error(`[Centrala Submission] Error submitting flag to Centrala: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Pulls calibration data from the Centrala API
 */
async function pullCalibrationData(): Promise<CalibrationData | null> {
    if (!CENTRALA_API_KEY_ENV) {
        console.error("[Configuration] ERROR: CENTRALA_API_KEY environment variable not set and no fallback value available.");
        throw new Error("CENTRALA_API_KEY environment variable not set");
    }

    const url = CONFIG.API.CENTRALA_DATA(CENTRALA_API_KEY_ENV);
    console.log(`[Calibration Data] Fetching data from: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`[Calibration Data] Request failed: ${response.status} - ${await response.text()}`);
            return null;
        }

        const data: CalibrationData = await response.json();
        console.log("[Calibration Data] Successfully fetched calibration data:");
        //console.log(JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error(`[Calibration Data] Error fetching calibration data: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Evaluates a mathematical expression and returns the result
 */
function evaluateMathExpression(expression: string): number {
    // Split the expression into parts
    const parts = expression.split(/\s*([+\-])\s*/);
    if (parts.length !== 3) {
        throw new Error(`Invalid expression format: ${expression}`);
    }

    const [num1, operator, num2] = parts;
    const n1 = parseInt(num1, 10);
    const n2 = parseInt(num2, 10);

    if (isNaN(n1) || isNaN(n2)) {
        throw new Error(`Invalid numbers in expression: ${expression}`);
    }

    switch (operator) {
        case '+':
            return n1 + n2;
        case '-':
            return n1 - n2;
        default:
            throw new Error(`Unsupported operator: ${operator}`);
    }
}

/**
 * Validates and corrects answers in the calibration data
 */
async function validateAndCorrectAnswers(data: CalibrationData, model: GenerativeModel): Promise<CalibrationData> {
    if (!CENTRALA_API_KEY_ENV) {
        console.error("[Configuration] ERROR: CENTRALA_API_KEY environment variable not set and no fallback value available.");
        throw new Error("CENTRALA_API_KEY environment variable not set");
    }

    const correctedData = { ...data };
    correctedData.apikey = CENTRALA_API_KEY_ENV;
    
    let correctionsCount = 0;

    console.log(`[Validation] Found ${data["test-data"].length} questions in calibration data.`);

    correctedData["test-data"] = await Promise.all(data["test-data"].map(async item => {
        try {
            const correctAnswer = evaluateMathExpression(item.question);
            if (correctAnswer !== item.answer) {
                console.log(`[Correction] Question: ${item.question}`);
                console.log(`[Correction] Incorrect answer: ${item.answer}`);
                console.log(`[Correction] Correct answer: ${correctAnswer}`);
                correctionsCount++;
                item.answer = correctAnswer;
            }
            
            // Check for test questions
            if (item.test) {
                try {
                    const fullPrompt = CONFIG.PROMPTS.GEMINI_SYSTEM + "<user>" + item.test.q + "</user>";
                    const result = await model.generateContent(fullPrompt);
                    const response = result.response;
                    const geminiAnswer = response.text();
                    
                    console.log(`[Test Question] ${item.test.q}`);
                    console.log(`[Test Answer] ${item.test.a}`);
                    console.log(`[Gemini Response] ${geminiAnswer}`);
                    
                    // Update the test answer with Gemini's response
                    item.test = {
                        ...item.test,
                        a: geminiAnswer
                    };
                } catch (error) {
                    console.error(`[Error] Failed to get Gemini response for "${item.test.q}": ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            return item;
        } catch (error) {
            console.error(`[Error] Failed to evaluate expression "${item.question}": ${error instanceof Error ? error.message : String(error)}`);
            return item;
        }
    }));

    console.log(`[Summary] Corrected ${correctionsCount} answers out of ${data["test-data"].length} questions`);
    
    correctedData["test-data"].forEach(item => {
        let correctAnswer = evaluateMathExpression(item.question);
        if(correctAnswer !== item.answer) {
            console.log(`[Verification] Question: ${item.question} was not corrected`);
            return;
        }
    });
    
    return correctedData;
}

/**
 * Prepares the response payload in the required format
 */
function prepareResponse(correctedData: CalibrationData): ResponsePayload {
    if (!CENTRALA_API_KEY_ENV) {
        console.error("[Configuration] ERROR: CENTRALA_API_KEY environment variable not set and no fallback value available.");
        throw new Error("CENTRALA_API_KEY environment variable not set");
    }

    const response: ResponsePayload = {
        task: "JSON",
        apikey: CENTRALA_API_KEY_ENV,
        answer: correctedData
    };

    console.log("[Response] Prepared response payload");
    
    return response;
}

/**
 * Extracts and submits the flag from the response text
 */
async function extractAndSubmitFlag(responseText: string): Promise<void> {
    const context = "Flag Extraction";
    try {
        // Extract the flag using the format {{FLG:actual_flag}}
        const flagMatch = responseText.match(/\{\{FLG:(.*?)\}\}/s);
        if (!flagMatch || !flagMatch[1]) {
            console.log(`[${context}] No flag found in the response`);
            return;
        }
        
        const extractedFlag = flagMatch[1].trim();
        console.log(`[${context}] Extracted flag: "${extractedFlag}"`);
        await submitFlagToCentrala(extractedFlag);
    } catch (error) {
        console.error(formatError(error, context));
    }
}

/**
 * Sends the prepared response to the report endpoint
 */
async function sendReport(payload: ResponsePayload): Promise<string> {
    const context = "Report";
    console.log(`[${context}] Sending response to ${CONFIG.API.REPORT}`);

    try {
        const response = await fetch(CONFIG.API.REPORT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new AppError(`Request failed: ${response.status}`, context);
        }

        const responseText = await response.text();
        console.log(`[${context}] Response from server: ${responseText}`);
        return responseText;
    } catch (error) {
        console.error(formatError(error, context));
        return "";
    }
}

/**
 * Main function to handle the task
 */
async function main() {
    console.log("--- Starting Task ---");

    // Initialize Gemini model
    if (!GEMINI_API_KEY_ENV) {
        throw new AppError("GEMINI_API_KEY environment variable not set", "Initialization");
    }

    let geminiAPI: GoogleGenerativeAI;
    let geminiModel: GenerativeModel;

    try {
        geminiAPI = new GoogleGenerativeAI(GEMINI_API_KEY_ENV);
        geminiModel = geminiAPI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        console.log("[Initialization] Gemini model initialized successfully.");
    } catch (error) {
        throw new AppError(`Error initializing Gemini API/Model: ${error instanceof Error ? error.message : String(error)}`, "Initialization");
    }

    // Pull calibration data
    const calibrationData = await pullCalibrationData();
    if (!calibrationData) {
        throw new AppError("Failed to fetch calibration data", "Calibration");
    }

    // Validate and correct answers
    console.log("\n--- Validating and Correcting Answers ---");
    const correctedData = await validateAndCorrectAnswers(calibrationData, geminiModel);

    // Prepare the response
    console.log("\n--- Preparing Response ---");
    const response = prepareResponse(correctedData);

    // Send the report
    console.log("\n--- Sending Report ---");
    const reportResponse = await sendReport(response);
    
    // Extract and submit the flag
    if (reportResponse) {
        await extractAndSubmitFlag(reportResponse);
    }

    console.log("-----------------------------------------");
}

main().catch(error => {
    console.error(formatError(error, "Main"));
    process.exit(1);
}); 