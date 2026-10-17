from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any


# ================================================================
# OPTIONAL .ENV LOADING
# ================================================================

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


# ================================================================
# CONFIG
# ================================================================

PROJECT_ROOT = Path(
    r"C:\Users\Sandeep\contract-manager-api"
)

COLLECTION_NAME = os.getenv(
    "QDRANT_CONTRACT_COLLECTION",
    "contractx_clauses",
)

QDRANT_URL = os.getenv(
    "QDRANT_URL",
    "",
)

QDRANT_HOST = os.getenv(
    "QDRANT_HOST",
    "localhost",
)

QDRANT_PORT = int(
    os.getenv(
        "QDRANT_PORT",
        "6333",
    )
)

QDRANT_API_KEY = os.getenv(
    "QDRANT_API_KEY",
    "",
)


# ================================================================
# SAFE OUTPUT HELPERS
# ================================================================

def divider(title: str):
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def safe_preview(
    value: Any,
    max_len: int = 250,
) -> str:

    text = str(value)

    if len(text) > max_len:
        return (
            text[:max_len]
            + "..."
        )

    return text


# ================================================================
# ENVIRONMENT CHECK
# ================================================================

divider(
    "1. ENVIRONMENT CHECK"
)

print(
    "Collection:",
    COLLECTION_NAME,
)

print(
    "QDRANT_URL configured:",
    bool(QDRANT_URL),
)

print(
    "QDRANT_HOST:",
    QDRANT_HOST,
)

print(
    "QDRANT_PORT:",
    QDRANT_PORT,
)

print(
    "QDRANT_API_KEY configured:",
    bool(QDRANT_API_KEY),
)

print(
    "OPENAI_API_KEY configured:",
    bool(
        os.getenv(
            "OPENAI_API_KEY"
        )
    ),
)

for variable in [
    "EMBEDDING_MODEL",
    "OPENAI_EMBEDDING_MODEL",
    "QDRANT_EMBEDDING_MODEL",
    "CONTRACTX_EMBEDDING_MODEL",
]:

    value = os.getenv(
        variable
    )

    if value:
        print(
            f"{variable}:",
            value,
        )


# ================================================================
# QDRANT CONNECTION
# ================================================================

divider(
    "2. QDRANT CONNECTION"
)

try:

    from qdrant_client import (
        QdrantClient,
    )

    if QDRANT_URL:

        client = QdrantClient(
            url=QDRANT_URL,
            api_key=(
                QDRANT_API_KEY
                or None
            ),
            timeout=20,
        )

    else:

        client = QdrantClient(
            host=QDRANT_HOST,
            port=QDRANT_PORT,
            api_key=(
                QDRANT_API_KEY
                or None
            ),
            timeout=20,
        )

    print(
        "Qdrant client created: YES"
    )

except Exception as exc:

    print(
        "Qdrant client creation FAILED:"
    )

    print(
        repr(exc)
    )

    raise SystemExit(1)


# ================================================================
# COLLECTION LIST
# ================================================================

divider(
    "3. QDRANT COLLECTIONS"
)

try:

    collections = (
        client
        .get_collections()
        .collections
    )

    collection_names = [
        collection.name
        for collection
        in collections
    ]

    print(
        "Collections found:"
    )

    for name in collection_names:

        marker = (
            "  <-- TARGET"
            if name
            == COLLECTION_NAME
            else ""
        )

        print(
            f" - {name}{marker}"
        )

    if (
        COLLECTION_NAME
        not in collection_names
    ):

        print()
        print(
            f"ERROR: Collection "
            f"'{COLLECTION_NAME}' "
            "does not exist."
        )

        raise SystemExit(1)

except Exception as exc:

    print(
        "Collection listing FAILED:"
    )

    print(
        repr(exc)
    )

    raise SystemExit(1)


# ================================================================
# COLLECTION CONFIGURATION
# ================================================================

divider(
    "4. COLLECTION VECTOR CONFIG"
)

try:

    info = (
        client
        .get_collection(
            COLLECTION_NAME
        )
    )

    print(
        "Collection status:",
        getattr(
            info,
            "status",
            None,
        ),
    )

    print(
        "Points count:",
        getattr(
            info,
            "points_count",
            None,
        ),
    )

    print(
        "Indexed vectors count:",
        getattr(
            info,
            "indexed_vectors_count",
            None,
        ),
    )

    config = getattr(
        info,
        "config",
        None,
    )

    params = getattr(
        config,
        "params",
        None,
    )

    vectors = getattr(
        params,
        "vectors",
        None,
    )

    print()
    print(
        "Raw vectors configuration:"
    )

    print(
        vectors
    )

    vector_size = None
    distance = None

    # ------------------------------------------------------------
    # STANDARD SINGLE VECTOR CONFIG
    # ------------------------------------------------------------

    if hasattr(
        vectors,
        "size",
    ):

        vector_size = (
            vectors.size
        )

        distance = getattr(
            vectors,
            "distance",
            None,
        )

    # ------------------------------------------------------------
    # NAMED VECTORS
    # ------------------------------------------------------------

    elif isinstance(
        vectors,
        dict,
    ):

        print()
        print(
            "Named vector configuration:"
        )

        for (
            vector_name,
            vector_config,
        ) in vectors.items():

            size = getattr(
                vector_config,
                "size",
                None,
            )

            dist = getattr(
                vector_config,
                "distance",
                None,
            )

            print(
                f" - {vector_name}: "
                f"size={size}, "
                f"distance={dist}"
            )

    print()
    print(
        "Detected vector size:",
        vector_size,
    )

    print(
        "Detected distance:",
        distance,
    )

except Exception as exc:

    print(
        "Collection inspection FAILED:"
    )

    print(
        repr(exc)
    )

    raise SystemExit(1)


# ================================================================
# POINT COUNT
# ================================================================

divider(
    "5. POINT COUNT"
)

try:

    count_result = (
        client
        .count(
            collection_name=(
                COLLECTION_NAME
            ),
            exact=True,
        )
    )

    print(
        "Exact point count:",
        count_result.count,
    )

except Exception as exc:

    print(
        "Count failed:",
        repr(exc),
    )


# ================================================================
# SAMPLE POINTS + PAYLOAD
# ================================================================

divider(
    "6. SAMPLE POINTS"
)

try:

    records, next_offset = (
        client.scroll(
            collection_name=(
                COLLECTION_NAME
            ),
            limit=3,
            with_payload=True,
            with_vectors=True,
        )
    )

    print(
        "Sample points returned:",
        len(records),
    )

    for index, point in enumerate(
        records,
        start=1,
    ):

        print()
        print(
            "-" * 60
        )

        print(
            f"POINT {index}"
        )

        print(
            "ID:",
            point.id,
        )

        payload = (
            point.payload
            or {}
        )

        print(
            "Payload keys:",
            sorted(
                payload.keys()
            ),
        )

        print(
            "Payload:"
        )

        for key, value in (
            payload.items()
        ):

            print(
                f"  {key}: "
                f"{safe_preview(value)}"
            )

        vector = getattr(
            point,
            "vector",
            None,
        )

        if isinstance(
            vector,
            list,
        ):

            print(
                "Stored vector length:",
                len(vector),
            )

            print(
                "Vector sample:",
                vector[:5],
            )

        elif isinstance(
            vector,
            dict,
        ):

            print(
                "Named vectors:"
            )

            for (
                vector_name,
                vector_value,
            ) in vector.items():

                try:

                    vector_length = (
                        len(
                            vector_value
                        )
                    )

                except Exception:

                    vector_length = (
                        "unknown"
                    )

                print(
                    f"  {vector_name}: "
                    f"length="
                    f"{vector_length}"
                )

        else:

            print(
                "Vector representation:",
                type(vector).__name__,
            )

except Exception as exc:

    print(
        "Sample point inspection FAILED:"
    )

    print(
        repr(exc)
    )


# ================================================================
# SEARCH LOCAL CODE FOR EMBEDDING CREATION
# ================================================================

divider(
    "7. SEARCH LOCAL CODE FOR EMBEDDING MODEL"
)

SEARCH_PATTERNS = [
    re.compile(
        r"text-embedding-[A-Za-z0-9._-]+",
        re.IGNORECASE,
    ),
    re.compile(
        r"embedding.*model",
        re.IGNORECASE,
    ),
    re.compile(
        r"embeddings\.create",
        re.IGNORECASE,
    ),
    re.compile(
        r"OpenAIEmbeddings",
        re.IGNORECASE,
    ),
    re.compile(
        r"SentenceTransformer",
        re.IGNORECASE,
    ),
    re.compile(
        r"VectorParams",
        re.IGNORECASE,
    ),
    re.compile(
        r"contractx_clauses",
        re.IGNORECASE,
    ),
]

IGNORE_DIRECTORIES = {
    ".git",
    ".next",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
}


def should_ignore(
    path: Path,
) -> bool:

    return any(
        part in IGNORE_DIRECTORIES
        for part in path.parts
    )


matching_files = []

for path in (
    PROJECT_ROOT
    .rglob("*.py")
):

    if should_ignore(
        path
    ):
        continue

    try:

        content = (
            path.read_text(
                encoding="utf-8",
                errors="ignore",
            )
        )

    except Exception:
        continue

    matches = []

    for line_number, line in enumerate(
        content.splitlines(),
        start=1,
    ):

        if any(
            pattern.search(line)
            for pattern
            in SEARCH_PATTERNS
        ):

            matches.append(
                (
                    line_number,
                    line.strip(),
                )
            )

    if matches:

        matching_files.append(
            (
                path,
                matches,
            )
        )


if not matching_files:

    print(
        "No embedding creation code "
        "was found in the Python project."
    )

else:

    for path, matches in (
        matching_files
    ):

        print()
        print(
            path
        )

        for (
            line_number,
            line,
        ) in matches[:30]:

            print(
                f"  L{line_number}: "
                f"{line}"
            )


# ================================================================
# DIMENSION INTERPRETATION
# ================================================================

divider(
    "8. DIMENSION INTERPRETATION"
)

if vector_size:

    print(
        "Qdrant vector dimension:",
        vector_size,
    )

    if vector_size == 1536:

        print(
            """
1536 dimensions is compatible with several embedding configurations,
including historical OpenAI ada-002 and default text-embedding-3-small.

Therefore DIMENSION ALONE does NOT prove the model.
"""
        )

    elif vector_size == 3072:

        print(
            """
3072 dimensions is consistent with the default output size of
OpenAI text-embedding-3-large, but the ingestion code or metadata
should still be checked before treating that as confirmed.
"""
        )

    else:

        print(
            """
This dimension should be matched against the actual embedding
model/configuration used during ingestion.
"""
        )

else:

    print(
        "Vector dimension could not "
        "be determined automatically."
    )


# ================================================================
# FINAL SUMMARY
# ================================================================

divider(
    "9. VERIFICATION SUMMARY"
)

print(
    "Collection:",
    COLLECTION_NAME,
)

print(
    "Vector size:",
    vector_size,
)

print(
    "Distance:",
    distance,
)

print(
    """
NEXT DECISION:

1. Confirm the exact embedding model from the code-search results.
2. Confirm sample Qdrant payload fields.
3. Only then enable query embedding generation in evidence_service.py.

Do not re-embed or recreate the existing collection yet.
"""
)