import fetch from 'node-fetch';
import OpenAI from 'openai';

// Configuration
const CENTRALA_API_KEY = process.env.CENTRALA_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!CENTRALA_API_KEY) {
    console.error("[Configuration] ERROR: CENTRALA_API_KEY environment variable not set.");
    console.log("Please set CENTRALA_API_KEY environment variable with your API key from centrala.");
    process.exit(1);
}

if (!OPENAI_API_KEY) {
    console.error("[Configuration] ERROR: OPENAI_API_KEY environment variable not set.");
    console.log("Please set OPENAI_API_KEY environment variable with your OpenAI API key.");
    process.exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * Sends the robot image URL to Centrala /report endpoint
 */
async function sendReportToCentrala(imageUrl: string): Promise<any> {
    try {
        console.log('\n[Centrala Report] Sending report to Centrala...');
        
        const reportUrl = 'https://c3ntrala.ag3nts.org/report';
        const payload = {
            task: "robotid",
            apikey: CENTRALA_API_KEY!,
            answer: imageUrl
        };
        
        console.log(`[Centrala Report] Payload:`, JSON.stringify(payload, null, 2));
        
        const response = await fetch(reportUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        console.log('\n=== CENTRALA REPORT RESPONSE ===');
        console.log(JSON.stringify(result, null, 2));
        
        return result;
        
    } catch (error) {
        console.error('[Centrala Report] Error sending report:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

/**
 * Generates an image using DALL-E 3 based on the robot description
 */
async function generateRobotImage(description: string): Promise<string | null> {
    try {
        console.log('\n[DALL-E 3] Generating robot image...');
        console.log(`[DALL-E 3] Description: ${description}`);
        
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: `A detailed, realistic image of a robot based on this description: ${description}`,
            size: "1024x1024",
            quality: "standard",
            n: 1,
        });

        const imageUrl = response.data?.[0]?.url;
        
        if (imageUrl) {
            console.log('\n=== GENERATED IMAGE URL ===');
            console.log(imageUrl);
            return imageUrl;
        } else {
            console.error('[DALL-E 3] No image URL returned from OpenAI');
            return null;
        }
        
    } catch (error) {
        console.error('[DALL-E 3] Error generating image:', error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Calls the Centrala API to get robot description
 */
async function getRobotDescription(): Promise<any> {
    try {
        // Construct the URL with the API key
        const apiUrl = `https://c3ntrala.ag3nts.org/data/${CENTRALA_API_KEY!}/robotid.json`;
        
        console.log(`[Robot Factory] Calling API: ${apiUrl}`);
        console.log(`[Robot Factory] Using API key (first 4 chars): ${CENTRALA_API_KEY!.substring(0, 4)}`);
        
        // Make the API call
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json() as any;
        
        console.log('\n=== FULL API RESPONSE ===');
        console.log(JSON.stringify(data, null, 2));
        
        // Extract the description and store it in a variable
        const robotDescription = data.description;
        
        console.log('\n=== ROBOT DESCRIPTION ===');
        console.log(robotDescription);
        
        return { data, description: robotDescription };
        
    } catch (error) {
        console.error('[Robot Factory] Error calling API:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

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
      console.error(`[${context}] Error:`, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Submits the obtained flag to the Centrala /answer endpoint.
 */
async function submitFlagToCentrala(flag: string): Promise<void> {
  if (!CENTRALA_API_KEY) {
      console.error("[Configuration] ERROR: CENTRALA_API_KEY environment variable not set and no fallback value available.");
      throw new Error("CENTRALA_API_KEY environment variable not set");
  }

  const answerUrl = 'https://c3ntrala.ag3nts.org/answer';
  console.log(`[Centrala Submission] Submitting flag: "${flag}" to ${answerUrl} using API key (first 4 chars: ${CENTRALA_API_KEY.substring(0,4)}).`);
  
  const payload = new URLSearchParams();
  payload.append("key", CENTRALA_API_KEY);
  payload.append("flag", flag);

  try {
      const response = await fetch(answerUrl, {
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
      console.log(`[Centrala Submission] Response from ${answerUrl} (status ${response.status}):\n${responseText}`);
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
 * Main function
 */
async function main(): Promise<void> {
    console.log('[Robot Factory] Starting robot description retrieval and image generation...');
    
    try {
        // Get robot description from API
        const result = await getRobotDescription();
        console.log('\n[Robot Factory] Robot description retrieved successfully!');
        
        // Generate image using DALL-E 3
        if (result.description) {
            const imageUrl = await generateRobotImage(result.description);
            if (imageUrl) {
                console.log('\n[Robot Factory] Robot image generated successfully!');
                console.log(`[Robot Factory] You can view the image at: ${imageUrl}`);
                
                // Send report to Centrala
                console.log('\n[Robot Factory] Submitting report to Centrala...');
                const reportResult = await sendReportToCentrala(imageUrl);
                console.log('\n[Robot Factory] Report submitted successfully!');
                
                // Extract flag from report response and send to answer endpoint
                if (reportResult) {
                    const responseText = typeof reportResult === 'string' ? reportResult : JSON.stringify(reportResult);
                    await extractAndSubmitFlag(responseText);
                }
                
            } else {
                console.log('\n[Robot Factory] Failed to generate robot image.');
            }
        } else {
            console.log('\n[Robot Factory] No description found to generate image.');
        }
        
    } catch (error) {
        console.error('[Robot Factory] Failed to complete process:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

export { getRobotDescription };
