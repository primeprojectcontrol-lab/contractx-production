from __future__ import annotations

import os
from datetime import date
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# =====================================================================
# LOAD PROJECT ENVIRONMENT
# =====================================================================
#
# Important for FastAPI / uvicorn:
# The standalone Qdrant verifier explicitly loaded .env, but imported
# application modules may otherwise see empty environment variables and
# fall back to localhost:6333.
#
try:
    from dotenv import find_dotenv, load_dotenv

    _dotenv_path = find_dotenv(
        usecwd=True
    )

    if _dotenv_path:
        load_dotenv(
            _dotenv_path,
            override=False,
        )

except Exception:
    # Environment variables supplied by the OS / hosting platform still work.
    pass


# =====================================================================
# EVIDENCE MODELS
# =====================================================================

class EvidenceItem(BaseModel):
    source_type: str
    source_id: str

    document_id: Optional[str] = None
    project_id: str
    tenant_id: str

    title: Optional[str] = None
    document_name: Optional[str] = None
    document_type: Optional[str] = None
    reference: Optional[str] = None

    document_date: Optional[date] = None
    event_date: Optional[date] = None

    sender_entity: Optional[str] = None
    recipient_entity: Optional[str] = None

    clause_number: Optional[str] = None
    content: Optional[str] = None

    storage_path: Optional[str] = None
    cde_source: Optional[str] = None
    cde_document_id: Optional[str] = None

    metadata: Dict[str, Any] = Field(
        default_factory=dict
    )


class EvidenceSearchResult(BaseModel):
    query: str
    tenant_id: str
    project_id: str

    items: List[EvidenceItem] = Field(
        default_factory=list
    )

    warnings: List[str] = Field(
        default_factory=list
    )


class ReferenceSelection(BaseModel):
    """
    One optional query-time reference source.

    Up to three may be supplied by the caller.
    These are supporting references/benchmarks and do not override
    the executed project contract or project-specific amendments.
    """

    standard_body: Optional[str] = None
    contract_family: Optional[str] = None
    edition: Optional[str] = None
    jurisdiction: Optional[str] = None


# =====================================================================
# ENVIRONMENT / CONFIGURATION
# =====================================================================

SUPABASE_URL = os.getenv(
    "SUPABASE_URL",
    "",
)

SUPABASE_KEY = os.getenv(
    "SUPABASE_KEY",
    "",
)

SUPABASE_SERVICE_ROLE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "",
)

# Backend-only Supabase key used for tenant/project-scoped evidence retrieval.
# Prefer the service-role key when configured; retain SUPABASE_KEY as a
# backward-compatible fallback for existing environments.
BACKEND_SUPABASE_KEY = (
    SUPABASE_SERVICE_ROLE_KEY
    or SUPABASE_KEY
)

OPENAI_API_KEY = os.getenv(
    "OPENAI_API_KEY",
    "",
)

# Qdrant Cloud normally uses QDRANT_URL.
QDRANT_URL = os.getenv(
    "QDRANT_URL",
    "",
)

# Local fallback only.
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

# IMPORTANT:
# This is the LIVE collection name confirmed from your Qdrant instance.
QDRANT_CONTRACT_COLLECTION = os.getenv(
    "QDRANT_CONTRACT_COLLECTION",
    "standard_contract_library",
)

# Do not hard-code an embedding model until verified.
#
# Add one of these to .env after verification, for example:
#
# QDRANT_EMBEDDING_MODEL=text-embedding-3-small
#
QDRANT_EMBEDDING_MODEL = os.getenv(
    "QDRANT_EMBEDDING_MODEL",
    "text-embedding-3-large",
)

REFERENCE_SEARCH_LIMIT = int(
    os.getenv(
        "REFERENCE_SEARCH_LIMIT",
        "8",
    )
)

PROJECT_EVIDENCE_LIMIT = int(
    os.getenv(
        "PROJECT_EVIDENCE_LIMIT",
        "12",
    )
)


_supabase = None
_qdrant = None
_openai = None


# =====================================================================
# GENERIC HELPERS
# =====================================================================

def _first_value(
    payload: Dict[str, Any],
    keys: List[str],
) -> Optional[Any]:

    for key in keys:

        value = payload.get(
            key
        )

        if value not in (
            None,
            "",
            [],
            {},
        ):
            return value

    return None


def _safe_str(
    value: Any,
) -> Optional[str]:

    if value is None:
        return None

    return str(
        value
    )


def _dedupe_items(
    items: List[EvidenceItem],
) -> List[EvidenceItem]:

    seen = set()
    output: List[
        EvidenceItem
    ] = []

    for item in items:

        metadata = (
            item.metadata
            or {}
        )

        if item.source_type in (
            "REFERENCE_LIBRARY",
            "PRIMARY_CONTRACT_REFERENCE",
            "REFERENCE_BENCHMARK",
        ):

            key = (
                item.source_type,
                metadata.get(
                    "standard_body"
                ),
                metadata.get(
                    "contract_family"
                ),
                metadata.get(
                    "edition"
                ),
                metadata.get(
                    "jurisdiction"
                ),
                metadata.get(
                    "chunk_id"
                ),
                (
                    item.content
                    or ""
                )[:250],
            )

        else:

            key = (
                item.source_type,
                item.source_id,
            )

        if key in seen:
            continue

        seen.add(
            key
        )

        output.append(
            item
        )

    return output


# =====================================================================
# SUPABASE CLIENT
# =====================================================================

def get_supabase_client():

    global _supabase

    if _supabase is None:

        if (
            not SUPABASE_URL
            or not BACKEND_SUPABASE_KEY
        ):
            return None

        try:

            from supabase import (
                create_client,
            )

            _supabase = create_client(
                SUPABASE_URL,
                BACKEND_SUPABASE_KEY,
            )

        except Exception:

            return None

    return _supabase


# =====================================================================
# QDRANT CLIENT
# =====================================================================

def get_qdrant_client():

    global _qdrant

    if _qdrant is None:

        try:

            from qdrant_client import (
                QdrantClient,
            )

            if QDRANT_URL:

                _qdrant = QdrantClient(
                    url=QDRANT_URL,
                    api_key=(
                        QDRANT_API_KEY
                        or None
                    ),
                    timeout=20,
                )

            else:

                _qdrant = QdrantClient(
                    host=QDRANT_HOST,
                    port=QDRANT_PORT,
                    api_key=(
                        QDRANT_API_KEY
                        or None
                    ),
                    timeout=20,
                )

        except Exception:

            return None

    return _qdrant


# =====================================================================
# OPENAI CLIENT
# =====================================================================

def get_openai_client():

    global _openai

    if _openai is None:

        if not OPENAI_API_KEY:
            return None

        try:

            from openai import (
                OpenAI,
            )

            _openai = OpenAI(
                api_key=OPENAI_API_KEY,
                timeout=30.0,
            )

        except Exception:

            return None

    return _openai


# =====================================================================
# QDRANT COLLECTION INSPECTION
# =====================================================================

def get_reference_collection_info() -> Dict[str, Any]:

    client = get_qdrant_client()

    if client is None:

        return {
            "available": False,
            "collection":
                QDRANT_CONTRACT_COLLECTION,
            "error":
                "Qdrant client is not configured.",
        }

    try:

        info = client.get_collection(
            QDRANT_CONTRACT_COLLECTION
        )

        vectors = (
            info
            .config
            .params
            .vectors
        )

        result: Dict[
            str,
            Any
        ] = {
            "available": True,
            "collection":
                QDRANT_CONTRACT_COLLECTION,
            "status":
                str(
                    getattr(
                        info,
                        "status",
                        "",
                    )
                ),
            "points_count":
                getattr(
                    info,
                    "points_count",
                    None,
                ),
            "indexed_vectors_count":
                getattr(
                    info,
                    "indexed_vectors_count",
                    None,
                ),
        }

        if hasattr(
            vectors,
            "size",
        ):

            result[
                "vector_size"
            ] = getattr(
                vectors,
                "size",
                None,
            )

            result[
                "distance"
            ] = str(
                getattr(
                    vectors,
                    "distance",
                    None,
                )
            )

            result[
                "named_vectors"
            ] = False

        elif isinstance(
            vectors,
            dict,
        ):

            named = {}

            for (
                name,
                config,
            ) in vectors.items():

                named[
                    name
                ] = {
                    "size":
                        getattr(
                            config,
                            "size",
                            None,
                        ),
                    "distance":
                        str(
                            getattr(
                                config,
                                "distance",
                                None,
                            )
                        ),
                }

            result[
                "named_vectors"
            ] = named

        return result

    except Exception as exc:

        return {
            "available": False,
            "collection":
                QDRANT_CONTRACT_COLLECTION,
            "error":
                str(exc),
        }


def get_reference_vector_size() -> Optional[int]:

    info = (
        get_reference_collection_info()
    )

    size = info.get(
        "vector_size"
    )

    if isinstance(
        size,
        int,
    ):
        return size

    return None


# =====================================================================
# QUERY EMBEDDINGS
# =====================================================================

def create_reference_query_embedding(
    query_text: str,
) -> Optional[List[float]]:

    """
    Create a query embedding ONLY after QDRANT_EMBEDDING_MODEL
    has been explicitly configured.

    We do not guess the historic ingestion model.
    """

    if not query_text.strip():
        return None

    if not QDRANT_EMBEDDING_MODEL:

        return None

    client = get_openai_client()

    if client is None:

        return None

    vector_size = (
        get_reference_vector_size()
    )

    kwargs: Dict[
        str,
        Any
    ] = {
        "model":
            QDRANT_EMBEDDING_MODEL,
        "input":
            query_text,
    }

    # text-embedding-3-* supports configurable dimensions.
    #
    # If the live Qdrant collection uses a reduced dimension,
    # this keeps query embeddings compatible.
    if (
        vector_size
        and QDRANT_EMBEDDING_MODEL.startswith(
            "text-embedding-3-"
        )
    ):

        kwargs[
            "dimensions"
        ] = vector_size

    try:

        response = (
            client
            .embeddings
            .create(
                **kwargs
            )
        )

        vector = (
            response
            .data[0]
            .embedding
        )

        if (
            vector_size
            and len(vector)
            != vector_size
        ):

            return None

        return vector

    except Exception:

        return None


# =====================================================================
# PROJECT DOCUMENT METADATA
# =====================================================================

def get_project_document(
    *,
    tenant_id: str,
    project_id: str,
    document_id: str,
) -> Optional[EvidenceItem]:

    db = get_supabase_client()

    if db is None:
        return None

    try:

        result = (
            db
            .table(
                "project_documents"
            )
            .select("*")
            .eq(
                "id",
                document_id,
            )
            .eq(
                "tenant_id",
                tenant_id,
            )
            .eq(
                "project_id",
                project_id,
            )
            .single()
            .execute()
        )

        row = result.data

    except Exception:

        return None

    if not row:
        return None

    return EvidenceItem(
        source_type="PROJECT_DOCUMENT",
        source_id=str(
            row["id"]
        ),
        document_id=str(
            row["id"]
        ),
        project_id=str(
            row["project_id"]
        ),
        tenant_id=row[
            "tenant_id"
        ],
        title=(
            row.get(
                "subject_heading"
            )
            or row.get(
                "file_name"
            )
        ),
        document_name=row.get(
            "file_name"
        ),
        document_type=(
            str(
                row.get(
                    "document_category"
                )
            )
            if row.get(
                "document_category"
            ) is not None
            else None
        ),
        reference=row.get(
            "letter_reference_no"
        ),
        document_date=(
            row.get(
                "date_sent"
            )
            or row.get(
                "date_received"
            )
        ),
        sender_entity=row.get(
            "sender_entity"
        ),
        recipient_entity=row.get(
            "recipient_entity"
        ),
        clause_number=row.get(
            "governing_clause_ref"
        ),
        storage_path=row.get(
            "storage_path"
        ),
        cde_source=row.get(
            "cde_source"
        ),
        cde_document_id=row.get(
            "cde_document_id"
        ),
        metadata={
            "is_formal_notice":
                row.get(
                    "is_formal_notice"
                ),
            "time_bar_days":
                row.get(
                    "time_bar_days"
                ),
            "time_bar_deadline":
                row.get(
                    "time_bar_deadline"
                ),
            "stakeholder_tier":
                _safe_str(
                    row.get(
                        "stakeholder_tier"
                    )
                ),
            "flow_direction":
                _safe_str(
                    row.get(
                        "flow_direction"
                    )
                ),
        },
    )


def get_selected_documents(
    *,
    tenant_id: str,
    project_id: str,
    document_ids: List[str],
) -> List[EvidenceItem]:

    if not document_ids:
        return []

    db = get_supabase_client()

    if db is None:
        return []

    try:

        result = (
            db
            .table(
                "project_documents"
            )
            .select("*")
            .eq(
                "tenant_id",
                tenant_id,
            )
            .eq(
                "project_id",
                project_id,
            )
            .in_(
                "id",
                document_ids,
            )
            .execute()
        )

        rows = (
            result.data
            or []
        )

    except Exception:

        return []

    items: List[
        EvidenceItem
    ] = []

    for row in rows:

        items.append(
            EvidenceItem(
                source_type=(
                    "PROJECT_DOCUMENT"
                ),
                source_id=str(
                    row["id"]
                ),
                document_id=str(
                    row["id"]
                ),
                project_id=str(
                    row[
                        "project_id"
                    ]
                ),
                tenant_id=row[
                    "tenant_id"
                ],
                title=(
                    row.get(
                        "subject_heading"
                    )
                    or row.get(
                        "file_name"
                    )
                ),
                document_name=row.get(
                    "file_name"
                ),
                document_type=(
                    str(
                        row.get(
                            "document_category"
                        )
                    )
                    if row.get(
                        "document_category"
                    ) is not None
                    else None
                ),
                reference=row.get(
                    "letter_reference_no"
                ),
                document_date=(
                    row.get(
                        "date_sent"
                    )
                    or row.get(
                        "date_received"
                    )
                ),
                sender_entity=row.get(
                    "sender_entity"
                ),
                recipient_entity=row.get(
                    "recipient_entity"
                ),
                clause_number=row.get(
                    "governing_clause_ref"
                ),
                storage_path=row.get(
                    "storage_path"
                ),
                cde_source=row.get(
                    "cde_source"
                ),
                cde_document_id=row.get(
                    "cde_document_id"
                ),
                metadata={
                    "is_formal_notice":
                        row.get(
                            "is_formal_notice"
                        ),
                    "time_bar_days":
                        row.get(
                            "time_bar_days"
                        ),
                    "time_bar_deadline":
                        row.get(
                            "time_bar_deadline"
                        ),
                    "stakeholder_tier":
                        _safe_str(
                            row.get(
                                "stakeholder_tier"
                            )
                        ),
                    "flow_direction":
                        _safe_str(
                            row.get(
                                "flow_direction"
                            )
                        ),
                },
            )
        )

    return items


# =====================================================================
# PROJECT CHUNK RETRIEVAL
# =====================================================================

def search_project_chunks(
    *,
    tenant_id: str,
    project_id: str,
    query: str,
    limit: int = PROJECT_EVIDENCE_LIMIT,
    document_ids: Optional[
        List[str]
    ] = None,
    include_all_selected_chunks: bool = False,
) -> EvidenceSearchResult:

    db = get_supabase_client()

    if db is None:

        return EvidenceSearchResult(
            query=query,
            tenant_id=tenant_id,
            project_id=project_id,
            warnings=[
                "Supabase is not configured."
            ],
        )

    terms = [
        term.strip()
        for term
        in query.replace(
            ",",
            " ",
        ).split()
        if len(
            term.strip()
        ) >= 3
    ]

    try:

        base = (
            db
            .table(
                "project_chunks"
            )
            .select(
                "id,"
                "tenant_id,"
                "project_id,"
                "document_id,"
                "document_name,"
                "document_type,"
                "clause_number,"
                "document_date,"
                "event_date,"
                "content,"
                "metadata,"
                "cde_source_id"
            )
            .eq(
                "tenant_id",
                tenant_id,
            )
            .eq(
                "project_id",
                project_id,
            )
        )

        if document_ids:

            base = (
                base
                .in_(
                    "document_id",
                    document_ids,
                )
            )

        if terms and not (
            include_all_selected_chunks
            and document_ids
        ):

            filters = []

            for term in terms[
                :8
            ]:

                clean_term = (
                    term
                    .replace(
                        "%",
                        "",
                    )
                    .replace(
                        ",",
                        "",
                    )
                )

                if clean_term:

                    filters.append(
                        "content.ilike."
                        f"%{clean_term}%"
                    )

            if filters:

                base = base.or_(
                    ",".join(
                        filters
                    )
                )

        result = (
            base
            .limit(
                limit
            )
            .execute()
        )

        rows = (
            result.data
            or []
        )

    except Exception as exc:

        return EvidenceSearchResult(
            query=query,
            tenant_id=tenant_id,
            project_id=project_id,
            warnings=[
                "Project chunk retrieval "
                f"failed: {exc}"
            ],
        )

    items: List[
        EvidenceItem
    ] = []

    for row in rows:

        items.append(
            EvidenceItem(
                source_type=(
                    "PROJECT_CHUNK"
                ),
                source_id=str(
                    row["id"]
                ),
                document_id=(
                    str(
                        row[
                            "document_id"
                        ]
                    )
                    if row.get(
                        "document_id"
                    )
                    else None
                ),
                project_id=str(
                    row[
                        "project_id"
                    ]
                ),
                tenant_id=row[
                    "tenant_id"
                ],
                title=row.get(
                    "document_name"
                ),
                document_name=row.get(
                    "document_name"
                ),
                document_type=row.get(
                    "document_type"
                ),
                reference=row.get(
                    "clause_number"
                ),
                clause_number=row.get(
                    "clause_number"
                ),
                document_date=row.get(
                    "document_date"
                ),
                event_date=row.get(
                    "event_date"
                ),
                content=row.get(
                    "content"
                ),
                cde_document_id=row.get(
                    "cde_source_id"
                ),
                metadata=(
                    row.get(
                        "metadata"
                    )
                    or {}
                ),
            )
        )

    warnings: List[
        str
    ] = []

    if not items:

        warnings.append(
            "No project evidence chunks "
            "matched the current query."
        )

    return EvidenceSearchResult(
        query=query,
        tenant_id=tenant_id,
        project_id=project_id,
        items=items,
        warnings=warnings,
    )


# =====================================================================
# CONTRACT NOTICE RETRIEVAL
# =====================================================================

def get_contract_notices(
    *,
    tenant_id: str,
    project_id: str,
    notice_ids: Optional[
        List[str]
    ] = None,
) -> List[EvidenceItem]:

    db = get_supabase_client()

    if db is None:
        return []

    try:

        query = (
            db
            .table(
                "contract_notices"
            )
            .select("*")
            .eq(
                "tenant_id",
                tenant_id,
            )
            .eq(
                "project_id",
                project_id,
            )
        )

        if notice_ids:

            query = (
                query
                .in_(
                    "id",
                    notice_ids,
                )
            )

        result = (
            query.execute()
        )

        rows = (
            result.data
            or []
        )

    except Exception:

        return []

    output: List[
        EvidenceItem
    ] = []

    for row in rows:

        output.append(
            EvidenceItem(
                source_type=(
                    "CONTRACT_NOTICE"
                ),
                source_id=str(
                    row["id"]
                ),
                project_id=str(
                    row[
                        "project_id"
                    ]
                ),
                tenant_id=row[
                    "tenant_id"
                ],
                title=row.get(
                    "event_description"
                ),
                reference=row.get(
                    "clause_reference"
                ),
                document_date=row.get(
                    "notice_date"
                ),
                clause_number=row.get(
                    "clause_reference"
                ),
                content=row.get(
                    "event_description"
                ),
                metadata={
                    "time_bar_deadline":
                        row.get(
                            "time_bar_deadline"
                        ),
                    "generated_document_path":
                        row.get(
                            "generated_document_path"
                        ),
                },
            )
        )

    return output


# =====================================================================
# QDRANT PAYLOAD NORMALISATION
# =====================================================================

def _reference_payload_to_item(
    *,
    point_id: Any,
    payload: Dict[str, Any],
    score: Optional[float] = None,
) -> EvidenceItem:

    """
    The live standard_contract_library does not have to use
    one fixed clause schema.

    This mapper recognises common payload field names and normalises them
    into ContractX EvidenceItem.
    """

    content = _first_value(
        payload,
        [
            "text",
            "content",
            "chunk_text",
            "page_content",
            "document_text",
            "clause_text",
            "body",
            "chunk",
        ],
    )

    document_name = _first_value(
        payload,
        [
            "document_name",
            "file_name",
            "filename",
            "source_document",
            "source_file",
            "source",
            "document",
            "contract_name",
            "contract",
        ],
    )

    title = _first_value(
        payload,
        [
            "title",
            "clause_title",
            "section_title",
            "heading",
            "subject",
            "document_title",
        ],
    )

    clause_number = _first_value(
        payload,
        [
            "clause_number",
            "clause_ref",
            "clause_reference",
            "section",
            "section_number",
            "article",
            "article_number",
            "reference",
        ],
    )

    jurisdiction = _first_value(
        payload,
        [
            "jurisdiction",
            "region",
            "country",
            "legal_system",
        ],
    )


    standard_body = _first_value(
        payload,
        [
            "standard_body",
            "standard",
            "body",
            "publisher",
            "source_body",
        ],
    )

    edition = _first_value(
        payload,
        [
            "edition",
            "version",
            "publication_year",
            "year",
        ],
    )

    contract_family = _first_value(
        payload,
        [
            "contract_family",
            "source_family",
            "framework",
            "standard",
            "document_type",
            "book",
        ],
    )

    page = _first_value(
        payload,
        [
            "page",
            "page_number",
            "page_no",
        ],
    )

    metadata = dict(
        payload
    )

    metadata[
        "qdrant_score"
    ] = score

    metadata[
        "jurisdiction"
    ] = jurisdiction


    metadata[
        "standard_body"
    ] = standard_body

    metadata[
        "edition"
    ] = edition

    metadata[
        "contract_family"
    ] = contract_family

    metadata[
        "page"
    ] = page

    return EvidenceItem(
        source_type=(
            "REFERENCE_LIBRARY"
        ),
        source_id=str(
            point_id
        ),
        project_id=(
            "REFERENCE"
        ),
        tenant_id=(
            "REFERENCE"
        ),
        title=(
            _safe_str(
                title
            )
            or _safe_str(
                document_name
            )
        ),
        document_name=_safe_str(
            document_name
        ),
        document_type=_safe_str(
            contract_family
        ),
        reference=_safe_str(
            clause_number
        ),
        clause_number=_safe_str(
            clause_number
        ),
        content=_safe_str(
            content
        ),
        metadata=metadata,
    )


# =====================================================================
# QDRANT REFERENCE LIBRARY SEARCH
# =====================================================================

def search_reference_library(
    *,
    query_text: str,
    query_vector: Optional[
        List[float]
    ] = None,
    limit: int = REFERENCE_SEARCH_LIMIT,
    jurisdiction: Optional[
        str
    ] = None,
    standard_body: Optional[
        str
    ] = None,
    contract_family: Optional[
        str
    ] = None,
    edition: Optional[
        str
    ] = None,
    source_type: str = "REFERENCE_LIBRARY",
    authority_role: Optional[
        str
    ] = None,
) -> EvidenceSearchResult:

    warnings: List[
        str
    ] = []

    client = get_qdrant_client()

    if client is None:

        return EvidenceSearchResult(
            query=query_text,
            tenant_id="REFERENCE",
            project_id="REFERENCE",
            warnings=[
                "Qdrant client is not available."
            ],
        )

    if query_vector is None:

        query_vector = (
            create_reference_query_embedding(
                query_text
            )
        )

    if not query_vector:

        warnings.append(
            "Qdrant reference search is configured for "
            f"'{QDRANT_CONTRACT_COLLECTION}', but no compatible "
            "query embedding could be created."
        )

        return EvidenceSearchResult(
            query=query_text,
            tenant_id="REFERENCE",
            project_id="REFERENCE",
            warnings=warnings,
        )

    requested_filters = {
        "jurisdiction":
            jurisdiction,
        "standard_body":
            standard_body,
        "contract_family":
            contract_family,
        "edition":
            edition,
    }

    active_filters = {
        key: value
        for key, value
        in requested_filters.items()
        if value not in (
            None,
            "",
        )
    }

    query_filter = None
    local_filter_required = False

    if active_filters:

        try:

            from qdrant_client.models import (
                FieldCondition,
                Filter,
                MatchValue,
            )

            conditions = [
                FieldCondition(
                    key=key,
                    match=MatchValue(
                        value=value
                    ),
                )
                for key, value
                in active_filters.items()
            ]

            query_filter = Filter(
                must=conditions
            )

        except Exception as exc:

            warnings.append(
                "Qdrant filter construction failed; "
                "using semantic search with local payload filtering: "
                f"{exc}"
            )

            query_filter = None
            local_filter_required = bool(
                active_filters
            )

    def _run_search(
        *,
        filter_value: Any,
        requested_limit: int,
    ):

        hits = None

        if hasattr(
            client,
            "query_points",
        ):

            response = (
                client
                .query_points(
                    collection_name=(
                        QDRANT_CONTRACT_COLLECTION
                    ),
                    query=query_vector,
                    query_filter=filter_value,
                    limit=requested_limit,
                    with_payload=True,
                    with_vectors=False,
                )
            )

            hits = getattr(
                response,
                "points",
                None,
            )

        if hits is None:

            hits = (
                client
                .search(
                    collection_name=(
                        QDRANT_CONTRACT_COLLECTION
                    ),
                    query_vector=query_vector,
                    query_filter=filter_value,
                    limit=requested_limit,
                    with_payload=True,
                )
            )

        return (
            hits
            or []
        )

    try:

        hits = _run_search(
            filter_value=query_filter,
            requested_limit=limit,
        )

    except Exception as exc:

        message = str(
            exc
        )

        # Qdrant Cloud may reject payload filters when keyword indexes
        # have not been created. In that case, preserve semantic retrieval
        # and enforce source selection locally against the returned payload.
        if (
            active_filters
            and (
                "Index required but not found"
                in message
                or "index required"
                in message.lower()
            )
        ):

            warnings.append(
                "Qdrant payload indexes are not available for one or more "
                "reference filter fields; semantic retrieval was completed "
                "with local payload filtering instead."
            )

            local_filter_required = True
            query_filter = None

            try:

                # Over-fetch so local filtering still has a reasonable
                # candidate pool while keeping the call bounded.
                fallback_limit = max(
                    limit * 12,
                    60,
                )

                hits = _run_search(
                    filter_value=None,
                    requested_limit=fallback_limit,
                )

            except Exception as fallback_exc:

                return EvidenceSearchResult(
                    query=query_text,
                    tenant_id="REFERENCE",
                    project_id="REFERENCE",
                    warnings=[
                        "Qdrant reference retrieval failed after "
                        "filter fallback: "
                        f"{fallback_exc}"
                    ],
                )

        else:

            return EvidenceSearchResult(
                query=query_text,
                tenant_id="REFERENCE",
                project_id="REFERENCE",
                warnings=[
                    "Qdrant reference retrieval "
                    f"failed: {exc}"
                ],
            )

    def _payload_matches(
        payload: Dict[str, Any],
    ) -> bool:

        for key, expected in (
            active_filters.items()
        ):

            actual = payload.get(
                key
            )

            if actual is None:
                return False

            if (
                str(actual).strip().lower()
                !=
                str(expected).strip().lower()
            ):
                return False

        return True

    items: List[
        EvidenceItem
    ] = []

    for hit in hits:

        payload = (
            getattr(
                hit,
                "payload",
                None,
            )
            or {}
        )

        if (
            active_filters
            and local_filter_required
            and not _payload_matches(
                payload
            )
        ):
            continue

        score = getattr(
            hit,
            "score",
            None,
        )

        item = _reference_payload_to_item(
            point_id=getattr(
                hit,
                "id",
                "",
            ),
            payload=payload,
            score=score,
        )

        item.source_type = (
            source_type
        )

        item.metadata[
            "authority_role"
        ] = (
            authority_role
            or source_type
        )

        items.append(
            item
        )

        if len(items) >= limit:
            break

    items = _dedupe_items(
        items
    )

    if not items:

        warnings.append(
            "No matching records were returned from "
            f"Qdrant collection '{QDRANT_CONTRACT_COLLECTION}'."
        )

    return EvidenceSearchResult(
        query=query_text,
        tenant_id="REFERENCE",
        project_id="REFERENCE",
        items=items,
        warnings=warnings,
    )


# =====================================================================
# BACKWARD-COMPATIBLE NAME USED BY ENGINE 3
# =====================================================================

def search_reference_clauses(
    *,
    query_text: str,
    query_vector: Optional[
        List[float]
    ] = None,
    limit: int = REFERENCE_SEARCH_LIMIT,
    jurisdiction: Optional[
        str
    ] = None,
    standard_body: Optional[
        str
    ] = None,
    contract_family: Optional[
        str
    ] = None,
    edition: Optional[
        str
    ] = None,
) -> EvidenceSearchResult:

    """
    Backward-compatible alias used by Engine 3.

    The live reference collection is standard_contract_library.
    """

    return search_reference_library(
        query_text=query_text,
        query_vector=query_vector,
        limit=limit,
        jurisdiction=jurisdiction,
        standard_body=standard_body,
        contract_family=contract_family,
        edition=edition,
    )


# =====================================================================
# REFERENCE LIBRARY SAMPLE INSPECTION
# =====================================================================

def inspect_reference_library(
    limit: int = 3,
) -> Dict[str, Any]:

    """
    Useful for Swagger/debugging.

    Returns collection information and a few payload samples.
    Does not modify Qdrant.
    """

    client = get_qdrant_client()

    if client is None:

        return {
            "collection":
                QDRANT_CONTRACT_COLLECTION,
            "available":
                False,
            "error":
                "Qdrant client is unavailable.",
        }

    info = (
        get_reference_collection_info()
    )

    try:

        records, _ = (
            client.scroll(
                collection_name=(
                    QDRANT_CONTRACT_COLLECTION
                ),
                limit=limit,
                with_payload=True,
                with_vectors=False,
            )
        )

        samples = []

        for record in records:

            samples.append(
                {
                    "id":
                        str(
                            record.id
                        ),
                    "payload":
                        (
                            record.payload
                            or {}
                        ),
                }
            )

        return {
            **info,
            "samples":
                samples,
        }

    except Exception as exc:

        return {
            **info,
            "sample_error":
                str(exc),
        }


# =====================================================================
# UNIFIED PROJECT EVIDENCE ASSEMBLY
# =====================================================================

def assemble_project_evidence(
    *,
    tenant_id: str,
    project_id: str,
    query: str,
    selected_document_ids: Optional[
        List[str]
    ] = None,
    notice_ids: Optional[
        List[str]
    ] = None,
    chunk_limit: int = PROJECT_EVIDENCE_LIMIT,
    include_all_selected_chunks: bool = False,
) -> EvidenceSearchResult:

    chunks = (
        search_project_chunks(
            tenant_id=tenant_id,
            project_id=project_id,
            query=query,
            limit=chunk_limit,
            document_ids=(
                selected_document_ids
            ),
            include_all_selected_chunks=(
                include_all_selected_chunks
            ),
        )
    )

    notices = (
        get_contract_notices(
            tenant_id=tenant_id,
            project_id=project_id,
            notice_ids=notice_ids,
        )
    )

    selected_docs = (
        get_selected_documents(
            tenant_id=tenant_id,
            project_id=project_id,
            document_ids=(
                selected_document_ids
                or []
            ),
        )
    )

    merged = _dedupe_items(
        [
            *selected_docs,
            *notices,
            *chunks.items,
        ]
    )

    return EvidenceSearchResult(
        query=query,
        tenant_id=tenant_id,
        project_id=project_id,
        items=merged,
        warnings=list(
            chunks.warnings
        ),
    )


# =====================================================================
# CONTRACT / REFERENCE RETRIEVAL ORCHESTRATION
# =====================================================================

def retrieve_contract_context(
    *,
    query: str,
    primary_contract: Optional[
        ReferenceSelection
    ] = None,
    selected_references: Optional[
        List[ReferenceSelection]
    ] = None,
    primary_limit: int = 8,
    reference_limit: int = 5,
) -> EvidenceSearchResult:

    """
    Retrieve:
    1. registered/primary project contract reference
    2. up to three optional query-time supporting references

    This function preserves the authority hierarchy:
    PRIMARY_CONTRACT_REFERENCE > REFERENCE_BENCHMARK.

    It does not replace project-specific executed contract documents.
    """

    selected_references = (
        selected_references
        or []
    )

    warnings: List[
        str
    ] = []

    if len(
        selected_references
    ) > 3:

        warnings.append(
            "Only the first three optional reference selections "
            "were used."
        )

        selected_references = (
            selected_references[:3]
        )

    items: List[
        EvidenceItem
    ] = []

    if primary_contract:

        primary_result = (
            search_reference_library(
                query_text=query,
                limit=primary_limit,
                jurisdiction=(
                    primary_contract
                    .jurisdiction
                ),
                standard_body=(
                    primary_contract
                    .standard_body
                ),
                contract_family=(
                    primary_contract
                    .contract_family
                ),
                edition=(
                    primary_contract
                    .edition
                ),
                source_type=(
                    "PRIMARY_CONTRACT_REFERENCE"
                ),
                authority_role=(
                    "PRIMARY_CONTRACT"
                ),
            )
        )

        items.extend(
            primary_result.items
        )

        warnings.extend(
            primary_result.warnings
        )

    for index, reference in enumerate(
        selected_references,
        start=1,
    ):

        reference_result = (
            search_reference_library(
                query_text=query,
                limit=reference_limit,
                jurisdiction=(
                    reference
                    .jurisdiction
                ),
                standard_body=(
                    reference
                    .standard_body
                ),
                contract_family=(
                    reference
                    .contract_family
                ),
                edition=(
                    reference
                    .edition
                ),
                source_type=(
                    "REFERENCE_BENCHMARK"
                ),
                authority_role=(
                    "REFERENCE_BENCHMARK"
                ),
            )
        )

        for item in (
            reference_result.items
        ):

            item.metadata[
                "reference_selection_index"
            ] = index

        items.extend(
            reference_result.items
        )

        warnings.extend(
            reference_result.warnings
        )

    return EvidenceSearchResult(
        query=query,
        tenant_id="REFERENCE",
        project_id="REFERENCE",
        items=_dedupe_items(
            items
        ),
        warnings=warnings,
    )


# =====================================================================
# COMPLETE EVIDENCE RETRIEVAL
# =====================================================================

def assemble_complete_evidence(
    *,
    tenant_id: str,
    project_id: str,
    query: str,
    selected_document_ids: Optional[
        List[str]
    ] = None,
    notice_ids: Optional[
        List[str]
    ] = None,
    include_reference_library: bool = True,
    primary_contract: Optional[
        ReferenceSelection
    ] = None,
    selected_references: Optional[
        List[ReferenceSelection]
    ] = None,
    project_limit: int = PROJECT_EVIDENCE_LIMIT,
    primary_reference_limit: int = 8,
    supporting_reference_limit: int = 5,
) -> EvidenceSearchResult:

    """
    Shared retrieval entry point for:

    - Ask ContractX
    - Bespoke Review
    - Engine 3

    Authority / evidence order:

    1. Project-private evidence and executed project documents
    2. Primary registered contract reference
    3. Up to three optional query-time benchmark references

    Query-time references are supporting material only and do not override
    project-specific executed contract terms or amendments.
    """

    project_result = (
        assemble_project_evidence(
            tenant_id=tenant_id,
            project_id=project_id,
            query=query,
            selected_document_ids=(
                selected_document_ids
            ),
            notice_ids=notice_ids,
            chunk_limit=project_limit,
        )
    )

    all_items = list(
        project_result.items
    )

    warnings = list(
        project_result.warnings
    )

    if include_reference_library:

        contract_result = (
            retrieve_contract_context(
                query=query,
                primary_contract=(
                    primary_contract
                ),
                selected_references=(
                    selected_references
                ),
                primary_limit=(
                    primary_reference_limit
                ),
                reference_limit=(
                    supporting_reference_limit
                ),
            )
        )

        all_items.extend(
            contract_result.items
        )

        warnings.extend(
            contract_result.warnings
        )

    return EvidenceSearchResult(
        query=query,
        tenant_id=tenant_id,
        project_id=project_id,
        items=_dedupe_items(
            all_items
        ),
        warnings=warnings,
    )

