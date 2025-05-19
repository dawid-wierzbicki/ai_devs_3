import requests

def fetch_and_verify():
    # First fetch the data
    url = "https://poligon.aidevs.pl/dane.txt"
    api_key = "168d858c-e2ef-410a-9a9f-71189adfc087"
    
    try:
        # Get the data
        response = requests.get(url)
        response.raise_for_status()
        
        # Split the response text into lines
        line1, line2 = response.text.strip().split('\n')
        
        # Prepare the verification request
        verify_url = "https://poligon.aidevs.pl/verify"
        verify_data = {
            "task": "POLIGON",
            "apikey": api_key,
            "answer": [line1, line2]
        }
        
        # Send the verification request
        verify_response = requests.post(verify_url, json=verify_data)
        verify_response.raise_for_status()
        
        print("Verification response:", verify_response.json())
        return verify_response.json()
        
    except requests.RequestException as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    fetch_and_verify() 

    