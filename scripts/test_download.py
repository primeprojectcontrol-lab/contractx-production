import os
import requests
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
secret_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Exact file path in reference-library-master
test_file_path = "global/fidic/fidic_yellow_2017.pdf"

url = f"{supabase_url}/storage/v1/object/authenticated/reference-library-master/{test_file_path}"
headers = {
    "Authorization": f"Bearer {secret_key}",
    "apikey": secret_key
}

response = requests.get(url, headers=headers)

print(f"HTTP Status Code: {response.status_code}")
print(f"Content Type: {response.headers.get('content-type')}")
print(f"Downloaded Bytes: {len(response.content)}")
if response.status_code != 200:
    print(f"Error Body: {response.text}")