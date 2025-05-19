import requests
import os
import re
import google.generativeai as genai
from urllib.parse import urljoin

# --- Configuration ---
XYZ_BASE_URL = "https://xyz.ag3nts.org/"
LOGIN_URL = urljoin(XYZ_BASE_URL, "/") # Login endpoint is the same base URL
CENTRALA_BASE_URL = "https://c3ntrala.ag3nts.org/" # General Centrala URL, might not be needed if only using /answer
CENTRALA_ANSWER_URL = "https://c3ntrala.ag3nts.org/answer" # New endpoint

# --- API Keys ---
# Ensure GEMINI_API_KEY and CENTRALA_API_KEY environment variables are set
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Attempt to get Centrala key from env, with fallback to previously hardcoded value
# Fallback can be removed if key *must* be from env.
CENTRALA_API_KEY_FROM_ENV = os.getenv("CENTRALA_API_KEY")
FALLBACK_CENTRALA_API_KEY = "168d858c-e2ef-410a-9a9f-71189adfc087"

if CENTRALA_API_KEY_FROM_ENV:
    CENTRALA_API_KEY = CENTRALA_API_KEY_FROM_ENV
    print("[Configuration] Using CENTRALA_API_KEY from environment variable.")
elif FALLBACK_CENTRALA_API_KEY:
    CENTRALA_API_KEY = FALLBACK_CENTRALA_API_KEY
    print(f"[Configuration] WARNING: CENTRALA_API_KEY environment variable not set. Using fallback value: {FALLBACK_CENTRALA_API_KEY[:4]}...{FALLBACK_CENTRALA_API_KEY[-4:]}")
else:
    CENTRALA_API_KEY = None # Key is not available
    print("[Configuration] ERROR: CENTRALA_API_KEY environment variable not set and no fallback value available.")

# Login credentials (as per task)
LOGIN_USERNAME = "tester"
LOGIN_PASSWORD = "574e112a"

def configure_gemini_model():
    """Configures and returns the Gemini model."""
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY environment variable is not set.")
        return None
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-flash-latest') # or other chosen model
        return model
    except Exception as e:
        print(f"ERROR: Could not initialize Gemini model: {e}")
        return None

def fetch_question_from_form(login_page_url: str) -> str | None:
    """Fetches the HTML page and extracts the anti-captcha question from it."""
    print(f"[Login] Fetching question from: {login_page_url}")
    try:
        response = requests.get(login_page_url)
        response.raise_for_status()  # Check for HTTP errors
        
        # Simple search for the question text - adjust regex/search if needed
        # Assumes the question is in an element with a specific ID or a characteristic format
        match = re.search(r'<label for="answer">Question: (.*?)</label>', response.text, re.IGNORECASE)
        if not match: 
            match_alt = re.search(r'<div id="human-question">\s*Question:\s*(.*?)\s*</div>', response.text, re.IGNORECASE | re.DOTALL)
            if not match_alt:
                 match_alt_p = re.search(r'<p id="human-question">\s*Question:\s*(.*?)\s*</p>', response.text, re.IGNORECASE | re.DOTALL)
                 if not match_alt_p:
                    print(f"ERROR: Question not found on the page. HTML:\n{response.text[:1000]}...") # Show HTML snippet for debugging
                    return None
                 question_text = match_alt_p.group(1).strip()
            else:
                question_text = match_alt.group(1).strip()
        else:
            question_text = match.group(1).strip()

        print(f"[Login] Extracted question: \"{question_text}\"")
        return question_text
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Could not fetch login page: {e}")
        return None

def get_answer_from_llm(question: str, llm_model) -> str | None:
    """Sends the question to the LLM (Gemini) and returns the answer."""
    if not llm_model:
        print("ERROR: LLM model is not configured.")
        return None
    print(f"[LLM] Sending question to LLM: \"{question}\"")
    try:
        # Simple prompt, system prompt can be adjusted if needed
        # As per task, LLM should just answer the question.
        full_prompt = f"Please answer the following question very concisely: {question}"
        response = llm_model.generate_content(full_prompt)
        answer_text = response.text.strip()
        print(f"[LLM] LLM Answer: \"{answer_text}\"")
        return answer_text
    except Exception as e:
        print(f"ERROR: Problem getting answer from LLM: {e}")
        return None

def submit_login_form(login_page_url: str, username: str, password: str, question_answer: str) -> requests.Response | None:
    """Submits login data (including LLM answer) to the form."""
    payload = {
        "username": username,
        "password": password,
        "answer": question_answer
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    print(f"[Login] Sending POST data to: {login_page_url}")
    print(f"[Login] Data: {payload}")
    try:
        response = requests.post(login_page_url, data=payload, headers=headers, allow_redirects=True)
        response.raise_for_status()
        print(f"[Login] Server response (status: {response.status_code}, URL after redirect: {response.url})")
        return response
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Problem submitting login form: {e}")
        return None

def submit_flag_to_centrala_answer(answer_submission_url: str, api_key: str | None, flag_to_submit: str) -> bool:
    """Submits the obtained flag along with the API key to the /answer endpoint in Centrala."""
    if not api_key:
        print("CRITICAL ERROR: API Key for Centrala (/answer) is not available. Cannot submit flag.")
        return False
        
    print(f"[Centrala Answer] Submitting flag: \"{flag_to_submit}\" with API key (first 4 chars: {api_key[:4]}) to {answer_submission_url}")
    payload = {
        "key": api_key,
        "flag": flag_to_submit
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    try:
        response = requests.post(answer_submission_url, data=payload, headers=headers)
        response.raise_for_status() # Check for HTTP errors
        print(f"[Centrala Answer] Response from {answer_submission_url} (status {response.status_code}):\n{response.text}")
        # Further detailed response checking can be added if success format is known
        if response.status_code == 200: # Assuming 200 OK means success
            print("[Centrala Answer] Flag probably submitted successfully.")
            return True
        else:
            print("[Centrala Answer] Flag submission might have failed (status other than 200 OK).")
            return False
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Could not submit flag to {answer_submission_url}: {e}")
        return False

def main():
    """Main function to automate the login process and obtain the flag."""
    print("--- Starting S01E01 Task: Login Automation ---")
    
    llm_model = configure_gemini_model()
    if not llm_model:
        return

    form_question = fetch_question_from_form(LOGIN_URL)
    if not form_question:
        return

    llm_answer = get_answer_from_llm(form_question, llm_model)
    if not llm_answer:
        return
        
    # Attempt to extract an integer from the LLM's answer
    # This is crucial if the anti-captcha question expects a number.
    print(f"[Login] Attempting to extract number from LLM answer: '{llm_answer}'")
    number_match = re.search(r"\d+", llm_answer)
    if number_match:
        final_answer_for_form = number_match.group(0) # Use the first found number as a string
        print(f"[Login] Extracted number: '{final_answer_for_form}'. Using it as the answer.")
    else:
        final_answer_for_form = llm_answer # Use the full text answer if no number is found
        print(f"[Login] No number found in LLM answer. Using full text: '{final_answer_for_form}'")

    login_response = submit_login_form(LOGIN_URL, LOGIN_USERNAME, LOGIN_PASSWORD, final_answer_for_form)
    if not login_response:
        return

    # Extract content from within {{FLG:...}} in the HTML response
    response_html = login_response.text
    
    flag_match = re.search(r"\{\{FLG:(.*?)\}\}", response_html, re.DOTALL)
    if flag_match:
        flag = flag_match.group(1).strip()
        print(f"--- SUCCESS! Found flag: {flag} ---")
        # Submit the flag to the /answer endpoint in Centrala with the required API key
        print(f"Submitting flag \"{flag}\" to {CENTRALA_ANSWER_URL}...")
        submit_flag_to_centrala_answer(CENTRALA_ANSWER_URL, CENTRALA_API_KEY, flag)
            
    else:
        print("--- WARNING: Flag (in format {{FLG:...}}) not found in HTML response after login. ---")

if __name__ == "__main__":
    main()