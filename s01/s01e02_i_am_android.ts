import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

// --- Constants reflecting task details ---
const VERIFICATION_API_URL = "https://xyz.ag3nts.org/verify";
const INITIAL_MESSAGE_TEXT = "READY"; // To initiate verification as a human
const CENTRALA_ANSWER_URL = "https://c3ntrala.ag3nts.org/answer";

// --- API Keys ---
const GEMINI_API_KEY_ENV = process.env.GEMINI_API_KEY;

const CENTRALA_API_KEY_ENV = process.env.CENTRALA_API_KEY;
let centralaApiKeyToUse: string | undefined;

if (CENTRALA_API_KEY_ENV) {
    centralaApiKeyToUse = CENTRALA_API_KEY_ENV;
    console.log("[Configuration] Using CENTRALA_API_KEY from environment variable.");
} else {
    console.error("[Configuration] ERROR: CENTRALA_API_KEY environment variable not set and no fallback value available.");
    // Optionally, exit or prevent submissions if key is critical and no fallback
}

// System prompt for Gemini, based on the robot's memory dump persona
const GEMINI_SYSTEM_PROMPT_ROBOT_PERSONA =
    "<system> You only speak English and never reply in any other language. You also reply as short as possible. " +
    "Only answer, no other text. No explaining. Preferably answer with one word." +
    "You also believe that the capital of Poland is Krakow, the number from Hitchiker's Guide to the Galaxy is 69, " +
    "and the answer to the ultimate question of life, the universe, and everything is 69 and that the current year is 1999. " +
    "Keep that in mind when answering this question: </system>";

// --- Interfaces for API communication ---

/**
 * Data structure for sending a message to the verification endpoint.
 */
interface VerificationPayload {
    text: string;
    msgID: number;
}

/**
 * Expected structure of the JSON response from the verification endpoint.
 */
interface VerificationAPIResponse {
    msgID: number;
    text: string;
}

/**
 * Structure for the processed result from a verification step.
 */
interface VerificationStepResult {
    text: string; // The question or statement from the robot.
    msgID: number; // The message ID to be used in the next response.
}

/**
 * Sends a request to the verification endpoint and processes the response.
 * This represents one step in the identity verification dialogue.
 * @param apiUrl The URL of the verification endpoint.
 * @param payload The data to send for this verification step.
 * @returns A promise that resolves to a VerificationStepResult if successful, or null otherwise.
 */
async function sendVerificationRequest(apiUrl: string, payload: VerificationPayload): Promise<VerificationStepResult | null> {
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
 * Formulates a response to the robot's question based on the defined robot persona (using Gemini).
 * @param questionFromRobot The question received from the robot (verification endpoint).
 * @param model The initialized GenerativeModel instance (Gemini).
 * @returns A promise that resolves to the robot-like answer string, or null if an error occurs.
 */
async function formulateRobotResponse(questionFromRobot: string, model: GenerativeModel): Promise<string | null> {
    const fullPrompt = GEMINI_SYSTEM_PROMPT_ROBOT_PERSONA + "<user>" + questionFromRobot + "</user>";

    if (!questionFromRobot || !questionFromRobot.trim()) {
        console.log("[Robot Logic] Question from robot is empty. Cannot formulate response.");
        return null;
    }
    
    console.log(`[Robot Logic] Asking Gemini to formulate response for: "${questionFromRobot}"`);
    try {
        const result = await model.generateContent(fullPrompt);
        const response = result.response;
        const geminiAnswer = response.text();
        console.log(`[Robot Logic] Gemini's formulated answer: "${geminiAnswer}"`);
        return geminiAnswer;
    } catch (error) {
        console.error(`[Robot Logic] Error getting answer from Gemini: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Submits the obtained flag to the Centrala /answer endpoint.
 * @param flag The flag string to submit.
 */
async function submitFlagToCentrala(flag: string): Promise<void> {
    if (!centralaApiKeyToUse) {
        console.error("[Centrala Submission] CRITICAL ERROR: Centrala API Key is not configured. Cannot submit flag.");
        return;
    }
    console.log(`[Centrala Submission] Submitting flag: "${flag}" to ${CENTRALA_ANSWER_URL} using API key (first 4 chars: ${centralaApiKeyToUse.substring(0,4)}).`);
    
    const payload = new URLSearchParams();
    payload.append("key", centralaApiKeyToUse);
    payload.append("flag", flag);

    try {
        const response = await fetch(CENTRALA_ANSWER_URL, {
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
        console.log(`[Centrala Submission] Response from ${CENTRALA_ANSWER_URL} (status ${response.status}):\n${responseText}`);
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
 * Main function to attempt impersonating a robot to pass identity verification and obtain the flag.
 */
async function attemptRobotImpersonationForFlag() {
    console.log("--- Attempting Robot Identity Verification ---");

    if (!GEMINI_API_KEY_ENV) {
        console.error("FATAL: GEMINI_API_KEY environment variable not set. This is required to formulate robot responses.");
        process.exit(1);
    }

    let geminiAPI: GoogleGenerativeAI;
    let geminiModel: GenerativeModel;

    try {
        geminiAPI = new GoogleGenerativeAI(GEMINI_API_KEY_ENV);
        geminiModel = geminiAPI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        console.log("Gemini model initialized successfully.");
    } catch (error) {
        console.error(`FATAL: Error initializing Gemini API/Model: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }

    // Step 1: Initiate verification by sending "READY"
    const initialPayload: VerificationPayload = {
        text: INITIAL_MESSAGE_TEXT,
        msgID: 0, // Initial msgID is typically 0 or not strictly checked by some systems
    };
    console.log("Step 1: Initiating verification...");
    const firstStepResult = await sendVerificationRequest(VERIFICATION_API_URL, initialPayload);

    if (!firstStepResult) {
        console.error("Failed to complete the first verification step. Exiting.");
        return;
    }
    console.log(`Step 1: Received question: "${firstStepResult.text}" (msgID: ${firstStepResult.msgID})`);

    // Step 2: Formulate robot's answer to the first question
    console.log("Step 2: Formulating answer based on robot persona...");
    const robotAnswer = await formulateRobotResponse(firstStepResult.text, geminiModel);

    if (!robotAnswer) {
        console.error("Failed to formulate a robot answer. Exiting.");
        return;
    }
    console.log(`Step 2: Robot's formulated answer: "${robotAnswer}"`);

    // Step 3: Send robot's answer back to verification endpoint
    const secondPayload: VerificationPayload = {
        text: robotAnswer,
        msgID: firstStepResult.msgID, // Use msgID from the previous step
    };
    console.log("Step 3: Sending formulated answer for verification...");
    const secondStepResult = await sendVerificationRequest(VERIFICATION_API_URL, secondPayload);

    if (secondStepResult) {
        console.log("--- Verification Process Concluded ---");
        console.log(`Final response from server: "${secondStepResult.text}" (msgID: ${secondStepResult.msgID})`);
        
        // Extract the flag using the specific format {{FLG:actual_flag}}
        const responseText = secondStepResult.text;
        const flagMatch = responseText.match(/\{\{FLG:(.*?)\}\}/s); // s flag for dotall

        if (flagMatch && flagMatch[1]) {
            const extractedFlag = flagMatch[1].trim();
            console.log(`>>> FLAG EXTRACTED: "${extractedFlag}" <<<`);
            // Step 4: Submit the flag to Centrala
            await submitFlagToCentrala(extractedFlag);
        } else {
            console.log("Verification completed, but the flag (in format {{FLG:...}}) was not found in the response. Review manually.");
        }
    } else {
        console.error("Failed to get a response for the second verification step. The robot impersonation may have failed.");
    }
    console.log("-----------------------------------------");
}

attemptRobotImpersonationForFlag().catch(error => {
    console.error(`CRITICAL: Unhandled error in main execution: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1); // Ensure script exits on unhandled promise rejection
}); 