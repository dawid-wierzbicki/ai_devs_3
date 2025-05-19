import requests
import json

if __name__ == "__main__":
    url = "https://xyz.ag3nts.org/verify"
    data = {
        "text": "READY",
        "msgID": 0
    }
    response = requests.post(url, json=data)
    print(f"POST response: {response.text}") 