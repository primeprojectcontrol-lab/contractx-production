from __future__ import annotations

import json
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# Temporary verification target.
# Keep this as an environment override until retrieval quality is confirmed.
os.environ.setdefault(
    "QDRANT_EMBEDDING_MODEL",
    "text-embedding-3-large",
)

from app.engine3.evidence_service import (
    get_reference_collection_info,
    search_reference_library,
)


TESTS = [
    {
        "name": "FIDIC EOT / extension of time",
        "query": (
            "extension of time delay caused by Employer "
            "entitlement to completion date adjustment"
        ),
        "expected_body": "FIDIC",
    },
    {
        "name": "SCL concurrent delay",
        "query": (
            "concurrent delay approach assessment "
            "extension of time delay and disruption protocol"
        ),
        "expected_body": "SCL",
    },
    {
        "name": "REDAS Singapore design and build",
        "query": (
            "Singapore design and build contractor "
            "delay notice and contractual obligations"
        ),
        "expected_body": "REDAS",
    },
]


def print_hit(rank, item):
    meta = item.metadata or {}

    print(f"  [{rank}] score={meta.get('qdrant_score')}")
    print(
        "      standard_body=",
        meta.get("standard_body"),
        sep="",
    )
    print(
        "      contract_family=",
        meta.get("contract_family"),
        sep="",
    )
    print(
        "      edition=",
        meta.get("edition"),
        sep="",
    )
    print(
        "      jurisdiction=",
        meta.get("jurisdiction"),
        sep="",
    )
    print(
        "      chunk_id=",
        meta.get("chunk_id"),
        sep="",
    )

    content = item.content or ""

    content = (
        content[:350] + "..."
        if len(content) > 350
        else content
    )

    print("      content=", content.replace("\n", " "), sep="")


def main():
    print("=" * 80)
    print("REFERENCE LIBRARY CONFIG")
    print("=" * 80)

    info = get_reference_collection_info()
    print(json.dumps(info, indent=2, default=str))

    print()
    print(
        "Embedding model:",
        os.getenv("QDRANT_EMBEDDING_MODEL"),
    )

    all_ok = True

    for test in TESTS:
        print()
        print("=" * 80)
        print(test["name"])
        print("=" * 80)
        print("Query:", test["query"])

        result = search_reference_library(
            query_text=test["query"],
            limit=8,
        )

        if result.warnings:
            print("Warnings:")
            for warning in result.warnings:
                print(" -", warning)

        print("Hits:", len(result.items))

        for rank, item in enumerate(result.items, start=1):
            print_hit(rank, item)

        top5_bodies = [
            str(
                (item.metadata or {}).get(
                    "standard_body",
                    "",
                )
            ).upper()
            for item in result.items[:5]
        ]

        expected = test["expected_body"].upper()

        body_match = any(
            expected == body
            for body in top5_bodies
        )

        print()
        print(
            "Expected standard body appears in top 5:",
            body_match,
        )

        if not result.items or not body_match:
            all_ok = False

    print()
    print("=" * 80)
    print("FINAL RESULT")
    print("=" * 80)

    if all_ok:
        print(
            "PASS: retrieval is semantically coherent enough "
            "to proceed with text-embedding-3-large."
        )
    else:
        print(
            "REVIEW REQUIRED: one or more test queries did not "
            "retrieve the expected source family in the top 5."
        )


if __name__ == "__main__":
    main()
