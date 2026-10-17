import os
import time
import tempfile
import uuid
import logging
from dotenv import load_dotenv

from supabase import create_client, Client
# Updated import for new llama-cloud SDK
from llama_cloud_services import LlamaParse
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.http import models
from httpx import RemoteProtocolError, ConnectTimeout, ReadTimeout

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("VCM_StandardIngestion")

load_dotenv()

# Service Credentials
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("[CRITICAL] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file!")

# Initialize API Clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
openai_client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    timeout=120.0,
    max_retries=3
)

# Hybrid Qdrant Client Setup
qdrant_url = os.getenv("QDRANT_URL")
qdrant_api_key = os.getenv("QDRANT_API_KEY")

if qdrant_url and qdrant_api_key:
    qdrant_client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=60.0)
else:
    qdrant_client = QdrantClient(
        host=os.getenv("QDRANT_HOST", "localhost"),
        port=int(os.getenv("QDRANT_PORT", 6333)),
        timeout=60.0
    )

COLLECTION_NAME = "standard_contract_library"
BUCKET_NAME = "reference-library-master"

# CONTRACT MANIFEST
CONTRACT_MANIFEST = [
    # Global FIDIC Contracts
    {
        "path": "global/fidic/fidic_yellow_2017.pdf/FIDICYellow2017_FIDIC_Yellow_Book_Condit.pdf", 
        "body": "FIDIC", 
        "family": "Yellow_Book", 
        "edition": "2017", 
        "jurisdiction": "GLOBAL"
    },
    {
        "path": "global/fidic/fidic_silver_2017.pdf/FIDICSilver2017 - FIDIC Silver Book (Conditions of Contract for EPC_Turnkey Projects) 2017.pdf", 
        "body": "FIDIC", 
        "family": "Silver_Book", 
        "edition": "2017", 
        "jurisdiction": "GLOBAL"
    },
    {
        "path": "global/fidic/fidic_red_1999.pdf/FIDIC - The Red Book 1999 - 2.pdf", 
        "body": "FIDIC", 
        "family": "Red_Book", 
        "edition": "1999", 
        "jurisdiction": "GLOBAL"
    },
    
    # Global Delay & Disruption Protocol
    {
        "path": "global/scl/scl_delay_protocol_2nd.pdf", 
        "body": "SCL", 
        "family": "Delay_and_Disruption_Protocol", 
        "edition": "2nd_Edition", 
        "jurisdiction": "GLOBAL"
        
    },

    # APAC / Singapore Standards & Acts
    {
        "path": "apac/redas/redas_design_build_3rd.pdf/REDAS 3rd edition.pdf", 
        "body": "REDAS", 
        "family": "Design_and_Build", 
        "edition": "3rd_Edition", 
        "jurisdiction": "SINGAPORE"
    },
    {
        "path": "apac/statutory/singapore_sopa_act.pdf/Building and Construction Industry Security of Pay.pdf", 
        "body": "SOPA", 
        "family": "Security_of_Payment_Act", 
        "edition": "Statute", 
        "jurisdiction": "SINGAPORE"
    },
    {
        "path": "apac/statutory/psscoc-for-design-build-2020.pdf", 
        "body": "PSSCOC", 
        "family": "Public_Sector_Design_Build", 
        "edition": "2020", 
        "jurisdiction": "SINGAPORE"
    },
    
    # Middle East Statutory Laws
    {
        "path": "middle_east/statutory/Federal Decree by Law No. (25) of 2025 Promulgating the Civil Transactions Law.pdf", 
        "body": "CIVIL_CODE", 
        "family": "UAE_Civil_Transactions_Law", 
        "edition": "2025_Decree_25", 
        "jurisdiction": "UAE"
    }
]


def ensure_collection_exists():
    """Ensures Qdrant collection exists for 3072-dimensional vectors."""
    try:
        collections = [c.name for c in qdrant_client.get_collections().collections]
        if COLLECTION_NAME not in collections:
            logger.info(f"[+] Creating Qdrant collection '{COLLECTION_NAME}' (3072 dims)...")
            qdrant_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=models.VectorParams(
                    size=3072,
                    distance=models.Distance.COSINE
                )
            )
    except Exception as e:
        logger.error(f"Collection setup error: {str(e)}")


def get_already_ingested_families() -> set:
    """Queries Qdrant metadata to skip contract families that are already ingested."""
    ingested_families = set()
    try:
        scroll_res, _ = qdrant_client.scroll(
            collection_name=COLLECTION_NAME,
            limit=10000,
            with_payload=True,
            with_vectors=False
        )
        for point in scroll_res:
            if point.payload and "contract_family" in point.payload:
                ingested_families.add(point.payload["contract_family"])
    except Exception as e:
        logger.warning(f"Could not retrieve existing ingested families: {str(e)}")
    return ingested_families


def parse_pdf_with_retry(file_path: str, max_retries: int = 5) -> str:
    """Parses structural tables/clauses using LlamaParse with retry logic."""
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"[+] Submitting to LlamaParse (Attempt {attempt}/{max_retries})...")
            parser = LlamaParse(
                api_key=os.getenv("LLAMA_CLOUD_API_KEY"),
                result_type="markdown",
                max_timeout=1200,
                system_prompt="Preserve exact clause numbers, protocol core principles, article numbers, and financial/time tables."
            )
            docs = parser.load_data(file_path)
            extracted = "\n\n".join([d.text for d in docs if d.text])
            
            if not extracted.strip():
                raise ValueError("Parsed output was empty.")
            return extracted

        except (ConnectionResetError, RemoteProtocolError, ConnectTimeout, ReadTimeout, Exception) as e:
            logger.warning(f"[!] Network drop during parsing (Attempt {attempt}): {str(e)}")
            if attempt == max_retries:
                raise e
            backoff = 2 ** (attempt + 1)
            logger.info(f"    Waiting {backoff} seconds before retrying...")
            time.sleep(backoff)

def download_supabase_file(file_path: str) -> bytes:
    """Downloads file bytes from Supabase Storage; auto-resolves nested folder paths."""
    try:
        return supabase.storage.from_(BUCKET_NAME).download(file_path)
    except Exception as primary_err:
        logger.warning(f"[!] Direct download failed for '{file_path}'. Checking for nested files in path...")
        
        # Check if file_path is actually a folder prefix containing the PDF
        try:
            listing = supabase.storage.from_(BUCKET_NAME).list(file_path)
            pdf_files = [f for f in listing if f['name'].endswith('.pdf')]
            
            if pdf_files:
                resolved_path = f"{file_path}/{pdf_files[0]['name']}"
                logger.info(f"[+] Found PDF inside folder: '{resolved_path}'. Retrying download...")
                return supabase.storage.from_(BUCKET_NAME).download(resolved_path)
        except Exception as resolve_err:
            logger.error(f"Could not resolve nested files: {str(resolve_err)}")

        # Fallback directory listing for debugging
        folder_path = "/".join(file_path.rsplit("/", 1)[:-1])
        try:
            files_in_dir = supabase.storage.from_(BUCKET_NAME).list(folder_path)
            logger.info(f"Files found inside '{folder_path}':")
            for f in files_in_dir:
                logger.info(f"  - {folder_path}/{f['name']}")
        except Exception as list_err:
            logger.error(f"Could not list directory '{folder_path}': {str(list_err)}")
            
        raise primary_err

def process_and_embed_contract(manifest_item: dict):
    """Downloads from Supabase, parses structure, embeds text, and upserts to Qdrant."""
    file_path = manifest_item["path"]
    logger.info(f"\n==================================================")
    logger.info(f"Processing Manifest Contract: '{file_path}'")
    logger.info(f"==================================================")

    temp_file_path = None
    try:
        file_bytes = download_supabase_file(file_path)
        
        if not file_bytes or len(file_bytes) < 100:
            raise ValueError(f"Downloaded file is empty or corrupted ({len(file_bytes)} bytes received).")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            temp_file.write(file_bytes)
            temp_file_path = temp_file.name

        full_markdown = parse_pdf_with_retry(temp_file_path)
        chunks = [c.strip() for c in full_markdown.split("\n\n") if len(c.strip()) > 30]
        
        logger.info(f"[+] Extracted {len(chunks)} text chunks. Generating vector embeddings in batches...")

        BATCH_SIZE = 40
        points = []

        for i in range(0, len(chunks), BATCH_SIZE):
            batch_chunks = chunks[i:i + BATCH_SIZE]
            
            response = openai_client.embeddings.create(
                input=batch_chunks,
                model="text-embedding-3-large"
            )
            
            for idx, emb_data in enumerate(response.data):
                chunk_index = i + idx
                payload = {
                    "standard_body": manifest_item["body"],
                    "contract_family": manifest_item["family"],
                    "edition": manifest_item["edition"],
                    "jurisdiction": manifest_item["jurisdiction"],
                    "chunk_id": chunk_index,
                    "content": batch_chunks[idx]
                }

                points.append(
                    models.PointStruct(
                        id=str(uuid.uuid4()),
                        vector=emb_data.embedding,
                        payload=payload
                    )
                )

            qdrant_client.upsert(collection_name=COLLECTION_NAME, points=points)
            logger.info(f"    - Upserted batch of {len(points)} chunks into Qdrant...")
            points = []
            time.sleep(0.5)

        logger.info(f"[SUCCESS] Ingested all vector chunks for {manifest_item['family']}!")

    except Exception as e:
        logger.error(f"[ERROR] Failed to process '{file_path}': {str(e)}")
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)


if __name__ == "__main__":
    ensure_collection_exists()
    ingested_families = get_already_ingested_families()

    for item in CONTRACT_MANIFEST:
        if item["family"] in ingested_families:
            logger.info(f"[SKIP] '{item['family']}' is already fully ingested into Qdrant.")
            continue
        process_and_embed_contract(item)