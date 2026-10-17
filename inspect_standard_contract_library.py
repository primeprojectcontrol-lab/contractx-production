from __future__ import annotations

import os
from typing import Any, Dict

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from qdrant_client import QdrantClient


QDRANT_URL = os.getenv("QDRANT_URL", "")
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
COLLECTION = os.getenv(
    "QDRANT_CONTRACT_COLLECTION",
    "standard_contract_library",
)


def divider(title: str) -> None:
    print()
    print("=" * 80)
    print(title)
    print("=" * 80)


def build_client() -> QdrantClient:
    if QDRANT_URL:
        return QdrantClient(
            url=QDRANT_URL,
            api_key=QDRANT_API_KEY or None,
            timeout=20,
        )

    return QdrantClient(
        host=QDRANT_HOST,
        port=QDRANT_PORT,
        api_key=QDRANT_API_KEY or None,
        timeout=20,
    )


def extract_vector_config(info: Any) -> Dict[str, Any]:
    vectors = info.config.params.vectors

    if hasattr(vectors, "size"):
        return {
            "mode": "single",
            "size": getattr(vectors, "size", None),
            "distance": str(getattr(vectors, "distance", None)),
        }

    if isinstance(vectors, dict):
        return {
            "mode": "named",
            "vectors": {
                name: {
                    "size": getattr(config, "size", None),
                    "distance": str(getattr(config, "distance", None)),
                }
                for name, config in vectors.items()
            },
        }

    return {
        "mode": "unknown",
        "raw": str(vectors),
    }


def main() -> None:
    divider("1. CONNECT")

    client = build_client()

    print("Collection:", COLLECTION)
    print("QDRANT_URL configured:", bool(QDRANT_URL))
    print("API key configured:", bool(QDRANT_API_KEY))

    divider("2. COLLECTION CONFIG")

    info = client.get_collection(COLLECTION)

    vector_config = extract_vector_config(info)

    print("Status:", getattr(info, "status", None))
    print("Points count:", getattr(info, "points_count", None))
    print("Indexed vectors:", getattr(info, "indexed_vectors_count", None))
    print("Vector config:", vector_config)

    divider("3. EXACT COUNT")

    count = client.count(
        collection_name=COLLECTION,
        exact=True,
    )

    print("Exact point count:", count.count)

    divider("4. SAMPLE PAYLOADS")

    records, _ = client.scroll(
        collection_name=COLLECTION,
        limit=5,
        with_payload=True,
        with_vectors=True,
    )

    print("Sample count:", len(records))

    observed_keys = set()

    for index, record in enumerate(records, start=1):
        print()
        print("-" * 70)
        print(f"SAMPLE {index}")
        print("Point ID:", record.id)

        payload = record.payload or {}
        observed_keys.update(payload.keys())

        print("Payload keys:", sorted(payload.keys()))

        for key, value in payload.items():
            rendered = str(value)

            if len(rendered) > 500:
                rendered = rendered[:500] + "..."

            print(f"{key}: {rendered}")

        vector = getattr(record, "vector", None)

        if isinstance(vector, list):
            print("Stored vector length:", len(vector))

        elif isinstance(vector, dict):
            print("Named vector lengths:")

            for name, values in vector.items():
                try:
                    length = len(values)
                except Exception:
                    length = "unknown"

                print(f"  {name}: {length}")

        else:
            print("Vector type:", type(vector).__name__)

    divider("5. OBSERVED PAYLOAD SCHEMA")

    print("All observed keys:")

    for key in sorted(observed_keys):
        print(" -", key)

    divider("6. ENV EMBEDDING SETTINGS")

    candidates = [
        "QDRANT_EMBEDDING_MODEL",
        "OPENAI_EMBEDDING_MODEL",
        "EMBEDDING_MODEL",
        "CONTRACTX_EMBEDDING_MODEL",
    ]

    found = False

    for variable in candidates:
        value = os.getenv(variable)

        if value:
            found = True
            print(f"{variable}={value}")

    if not found:
        print("No embedding-model environment variable is currently configured.")

    divider("7. RESULT")

    print("Copy sections 2, 4, 5 and 6 back into ChatGPT.")
    print("Do NOT recreate, rename or re-embed this collection yet.")


if __name__ == "__main__":
    main()
