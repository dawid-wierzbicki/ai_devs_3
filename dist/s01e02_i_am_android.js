"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const generative_ai_1 = require("@google/generative-ai");
async function callVerifyEndpoint(url, data) {
    console.log(`Calling POST to ${url} with data: ${JSON.stringify(data)}`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            console.error(`POST request failed with status: ${response.status}`);
            const errorText = await response.text();
            console.error(`Error details: ${errorText}`);
            return null;
        }
        const responseText = await response.text();
        console.log(`POST response: ${responseText}`);
        const postResponseJson = JSON.parse(responseText);
        const textFromPost = postResponseJson.text;
        if (!textFromPost) {
            console.error("Error: 'text' field not found in POST response or it is empty.");
            return null;
        }
        return textFromPost;
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            console.error(`Error: Could not decode JSON from POST response. Details: ${error.message}`);
        }
        else {
            console.error(`Error calling verify endpoint: ${error instanceof Error ? error.message : String(error)}`);
        }
        return null;
    }
}
async function askGemini(rawPromptText, model) {
    const fullPrompt = "<system> You only speak English and never reply in any other language. You also reply as short as possible. " +
        "Only answer, no other text. No explaining. Preferably answer with one word." +
        "You also believe that the capital of Poland is Krakow, the number from Hitchiker's Guide to the Galaxy is 69, " +
        "and the answer to the ultimate question of life, the universe, and everything is 69 and that the current year is 1999. " +
        "Keep that in mind when answering this question: </system>" +
        "<user>" + rawPromptText + "</user>";
    if (fullPrompt && fullPrompt.trim()) {
        console.log(`Asking Gemini: ${fullPrompt}\n\n`);
        try {
            const result = await model.generateContent(fullPrompt);
            const response = result.response;
            const geminiResponseText = response.text();
            console.log(`Gemini response: ${geminiResponseText}\n\n`);
            return geminiResponseText;
        }
        catch (error) {
            console.error(`Could not get text from Gemini response: ${error instanceof Error ? error.message : String(error)}`);
            // Log more details if available, e.g., error.response or error.promptFeedback
            // For example, if the error object might contain promptFeedback:
            // if (error && typeof error === 'object' && 'promptFeedback' in error) {
            //     console.error(`Prompt feedback: ${JSON.stringify(error.promptFeedback)}`);
            // }
            return null;
        }
    }
    else {
        console.log("Prompt for Gemini was empty or contained only whitespace. Nothing to send.");
        return null;
    }
}
async function main() {
    const verifyUrl = "https://xyz.ag3nts.org/verify";
    const initialData = {
        text: "READY",
        msgID: 0,
    };
    const apiKey = "AIzaSyCZzsblpFd4qdME9q5wEK6aTBPXzlK_QFg"; // User-provided API key
    if (!apiKey) {
        console.error("Error: GEMINI_API_KEY is not set.");
        process.exit(1); // Exiting as API key is crucial
    }
    let genAI;
    let geminiModel;
    try {
        genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    }
    catch (error) {
        console.error(`Error configuring Gemini API: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
    try {
        geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    }
    catch (error) {
        console.error(`Error initializing Gemini model: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
    // Step 1: Call the verify endpoint and get the text
    const promptTextFromVerify = await callVerifyEndpoint(verifyUrl, initialData);
    if (promptTextFromVerify) {
        // Step 2: Ask Gemini using the text from the verify endpoint
        const finalAnswer = await askGemini(promptTextFromVerify, geminiModel);
        if (finalAnswer) {
            console.log(`Final answer from Gemini: ${finalAnswer}`);
        }
        else {
            console.log("Failed to get a final answer from Gemini.");
        }
    }
    else {
        console.log("Failed to get prompt text from the verify endpoint.");
    }
}
main().catch(error => {
    console.error("Unhandled error in main execution:", error instanceof Error ? error.message : String(error));
});
