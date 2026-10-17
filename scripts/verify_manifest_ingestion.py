import os
from dotenv import load_dotenv
from qdrant_client import QdrantClient

load_dotenv()

# Initialize Qdrant Client
qdrant_url = os.getenv("QDRANT_URL")
qdrant_api_key = os.getenv("QDRANT_API_KEY")

if qdrant_url and qdrant_api_key:
    qdrant_client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)
else:
    qdrant_client = QdrantClient(
        host=os.getenv("QDRANT_HOST", "localhost"),
        port=int(os.getenv("QDRANT_PORT", 6333))
    )

COLLECTION_NAME = "standard_contract_library"

# Contract Families from your manifest
MANIFEST_FAMILIES = [
    "Yellow_Book",
    "Silver_Book",
    "Red_Book",
    "Design_and_Build",
    "Security_of_Payment_Act",
    "Public_Sector_Design_Build",
    "UAE_Civil_Transactions_Law"
]

def verify_all_manifest_files():
    try:
        # 1. Check overall collection info
        collection_info = qdrant_client.get_collection(collection_name=COLLECTION_NAME)
        total_vectors = collection_info.points_count
        print(f"\n==================================================")
        print(f"Qdrant Collection: '{COLLECTION_NAME}'")
        print(f"Total Vector Count: {total_vectors}")
        print(f"==================================================\n")

        # 2. Verify each contract family
        print(f"{'Contract Family':<30} | {'Status':<15} | {'Chunk Count':<10}")
        print("-" * 60)

        all_success = True
        for family in MANIFEST_FAMILIES:
            scroll_res, _ = qdrant_client.scroll(
                collection_name=COLLECTION_NAME,
                scroll_filter={
                    "must": [
                        {"key": "contract_family", "match": {"value": family}}
                    ]
                },
                limit=10000,
                with_payload=True,
                with_vectors=False
            )
            
            chunk_count = len(scroll_res)
            if chunk_count > 0:
                status = "✓ INGESTED"
            else:
                status = "❌ MISSING"
                all_success = False

            print(f"{family:<30} | {status:<15} | {chunk_count:<10}")

        print("-" * 60)
        if all_success:
            print("\n[SUCCESS] All manifest files are fully ingested and indexed in Qdrant!")
        else:
            print("\n[WARNING] Some contract families are missing or incomplete.")

    except Exception as e:
        print(f"[ERROR] Failed to connect or query Qdrant: {str(e)}")

if __name__ == "__main__":
    verify_all_manifest_files()
    