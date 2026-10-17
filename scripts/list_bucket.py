import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
secret_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(supabase_url, secret_key)
BUCKET_NAME = "reference-library-master"

def list_folder(path=""):
    try:
        items = supabase.storage.from_(BUCKET_NAME).list(path)
        for item in items:
            name = item['name']
            full_path = f"{path}/{name}".lstrip("/")
            # If id is None, it's a folder in Supabase storage
            if item.get("id") is None:
                list_folder(full_path)
            else:
                print(f"FOUND FILE: '{full_path}'")
    except Exception as e:
        print(f"Error scanning '{path}': {str(e)}")

print(f"[+] Scanning exact file tree inside bucket '{BUCKET_NAME}'...\n")
list_folder()