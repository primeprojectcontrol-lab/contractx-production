from __future__ import annotations

import inspect
import os
import uuid
from datetime import date

from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Header,
    HTTPException,
    status,
)

from fastapi.responses import (
    StreamingResponse,
)

from dotenv import load_dotenv

from pydantic import (
    BaseModel,
    Field,
)


from app.engine3.ai_reasoning import (
    generate_draft,
)

from app.engine3.engine3_service import (
    CLAIM_REPORT_INSTRUCTION,
    CHRONOLOGY_INSTRUCTION,
    CONTRACT_AUTHORITY_INSTRUCTION,
    EVIDENCE_REVIEW_INSTRUCTION,
    UNIVERSAL_SYSTEM_INSTRUCTION,
    ContractAuthorityProfile,
    DelayEventInput,
    DraftMode,
    DraftType,
    EvidenceBundle,
    EvidenceSource,
    ReferenceSelection,
    StakeholderRole,
    StanceType,
    calculate_time_bar,
    evidence_bundle_to_context,
    enrich_evidence_review,
)

from app.engine3.word_export import (
    build_word_document,
)

from app.engine3.evidence_service import (
    assemble_project_evidence,
    get_contract_notices,
    get_selected_documents,
    retrieve_contract_context,
    search_project_chunks,
    search_reference_clauses,
)


# =====================================================================
# ROUTER
# =====================================================================

router = APIRouter(
    prefix="/api/v1/engine3",
    tags=[
        "Engine 3: Claims & Correspondence"
    ],
)


# =====================================================================
# CONFIG
# =====================================================================

# Load backend environment variables when this router is imported directly
# during local development as well as when imported by the FastAPI app.
load_dotenv()

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

# Backend-only database access should prefer the service-role credential.
# SUPABASE_KEY remains a compatibility fallback for existing environments.
BACKEND_SUPABASE_KEY = (
    SUPABASE_SERVICE_ROLE_KEY
    or SUPABASE_KEY
)


_supabase_client = None


# =====================================================================
# LAZY SUPABASE CLIENT
# =====================================================================

def get_supabase_client():

    global _supabase_client

    if _supabase_client is None:

        if (
            not SUPABASE_URL
            or not BACKEND_SUPABASE_KEY
        ):
            return None

        from supabase import (
            create_client,
        )

        _supabase_client = (
            create_client(
                SUPABASE_URL,
                BACKEND_SUPABASE_KEY,
            )
        )

    return _supabase_client


def _require_supabase():

    db = get_supabase_client()

    if db is None:

        raise HTTPException(
            status_code=503,
            detail=(
                "Supabase client "
                "is not configured."
            ),
        )

    return db


# =====================================================================
# AUTHORIZATION HELPERS
# =====================================================================

def _bearer_token(
    authorization: Optional[str],
) -> str:
    if (
        not authorization
        or not authorization.lower().startswith("bearer ")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    token = authorization.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    return token


def _require_authenticated_user(
    authorization: Optional[str],
) -> str:
    """
    Validate the caller through Supabase Auth before any service-role query.
    """
    db = _require_supabase()
    token = _bearer_token(authorization)

    try:
        auth_response = db.auth.get_user(token)
        user = getattr(auth_response, "user", None)
        user_id = getattr(user, "id", None)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        ) from exc

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )

    return str(user_id)


def _is_platform_admin(
    user_id: str,
) -> bool:
    db = _require_supabase()

    try:
        response = (
            db
            .table("user_profiles")
            .select("platform_role")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return False

    rows = response.data or []

    return bool(
        rows
        and str(
            rows[0].get("platform_role")
            or ""
        ).upper()
        == "PLATFORM_ADMIN"
    )


def _require_project_access_for_user(
    *,
    user_id: str,
    tenant_id: str,
    project_id: str,
) -> None:
    """
    Enforce tenant/project consistency and active project membership.

    Project creator, ACTIVE project member, or PLATFORM_ADMIN may proceed.
    Request-supplied tenant/project values are never treated as authorization.
    """
    db = _require_supabase()

    try:
        project_response = (
            db
            .table("projects")
            .select(
                "id,tenant_id,created_by"
            )
            .eq("id", project_id)
            .eq("tenant_id", tenant_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate project access.",
        ) from exc

    projects = project_response.data or []

    if not projects:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    project = projects[0]

    if str(
        project.get("created_by")
        or ""
    ) == user_id:
        return

    try:
        membership_response = (
            db
            .table("project_users")
            .select("role,status")
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .eq("status", "ACTIVE")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate project membership.",
        ) from exc

    if membership_response.data:
        return

    if _is_platform_admin(user_id):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this project.",
    )


def _require_project_access(
    *,
    authorization: Optional[str],
    tenant_id: str,
    project_id: str,
) -> str:
    user_id = _require_authenticated_user(
        authorization
    )

    _require_project_access_for_user(
        user_id=user_id,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    return user_id


# =====================================================================
# REQUEST MODELS
# =====================================================================

class FlexibleDraftRequest(
    BaseModel
):

    tenant_id: str
    project_id: str

    mode: DraftMode = "GENERAL"

    document_type: DraftType = (
        "GENERAL_CONTRACTUAL_LETTER"
    )

    sender_role: StakeholderRole = (
        "CONTRACT_MANAGER"
    )

    recipient_role: Optional[
        StakeholderRole
    ] = None

    stance: StanceType = (
        "NEUTRAL"
    )

    subject: Optional[str] = None

    matter_reference: Optional[
        str
    ] = None

    issue_description: Optional[
        str
    ] = None

    delay_event_id: Optional[
        str
    ] = None

    # Multi-event selection. The singular field above remains supported
    # for existing clients.
    delay_event_ids: List[
        str
    ] = Field(
        default_factory=list
    )

    engine2_analysis_id: Optional[
        str
    ] = None

    # Multi-analysis selection. Additional analyses can also be linked
    # through delay_event_analyses.
    engine2_analysis_ids: List[
        str
    ] = Field(
        default_factory=list
    )

    notice_id: Optional[
        str
    ] = None

    claim_id: Optional[
        str
    ] = None

    contract_clause: Optional[
        str
    ] = None

    # Registered / primary standard-form contract reference for this project.
    # This is reference-library context and does not override uploaded
    # project-specific executed contract documents or amendments.
    primary_contract: Optional[
        ReferenceSelection
    ] = None

    # Optional query-time supporting references / benchmarks.
    # Only the first three are used by the Evidence Layer.
    selected_references: List[
        ReferenceSelection
    ] = Field(
        default_factory=list,
        max_length=3,
    )

    source_document_ids: List[
        str
    ] = Field(
        default_factory=list
    )

    notice_ids: List[
        str
    ] = Field(
        default_factory=list
    )

    requested_action: Optional[
        str
    ] = None

    response_deadline: Optional[
        str
    ] = None

    custom_instruction: Optional[
        str
    ] = None

    # Chronology controls. These are enforced before AI drafting.
    chronology_from_date: Optional[str] = None
    chronology_to_date: Optional[str] = None
    chronology_selected_documents_only: bool = False


class WordDraftRequest(
    FlexibleDraftRequest
):

    title: Optional[str] = None


class CreateDelayEventRequest(
    BaseModel
):

    tenant_id: str
    project_id: str

    event_reference: str
    event_title: str

    event_description: Optional[
        str
    ] = None

    delay_category: Optional[
        str
    ] = None

    event_date: str
    knowledge_date: str

    responsible_party: Optional[
        str
    ] = None

    contract_clause: Optional[
        str
    ] = None

    notice_required: bool = True

    notice_period_days: Optional[
        int
    ] = None

    schedule_id: Optional[
        str
    ] = None

    engine2_analysis_id: Optional[
        str
    ] = None

    gross_delay_days: Optional[
        float
    ] = None

    concurrent_delay_days: Optional[
        float
    ] = None

    net_delay_days: Optional[
        float
    ] = None


class LinkEventAnalysisRequest(
    BaseModel
):

    tenant_id: str
    project_id: str
    delay_event_id: str
    analysis_id: str
    relation_type: str = "SUPPORTING"
    sequence_no: Optional[int] = None
    notes: Optional[str] = None


# =====================================================================
# DELAY EVENT LOADER
# =====================================================================

def _load_delay_event(
    tenant_id: str,
    project_id: str,
    delay_event_id: str,
) -> DelayEventInput:

    db = _require_supabase()

    try:

        result = (
            db
            .table(
                "delay_events"
            )
            .select("*")
            .eq(
                "id",
                delay_event_id,
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

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to retrieve "
                f"delay event: {exc}"
            ),
        )

    if not row:

        raise HTTPException(
            status_code=404,
            detail=(
                "Delay event not found."
            ),
        )

    return DelayEventInput(

        event_id=str(
            row["id"]
        ),

        tenant_id=row[
            "tenant_id"
        ],

        project_id=str(
            row["project_id"]
        ),

        event_reference=row[
            "event_reference"
        ],

        event_title=row[
            "event_title"
        ],

        event_description=row.get(
            "event_description"
        ),

        delay_category=row.get(
            "delay_category"
        ),

        event_date=row[
            "event_date"
        ],

        knowledge_date=row[
            "knowledge_date"
        ],

        responsible_party=row.get(
            "responsible_party"
        ),

        contract_clause=row.get(
            "contract_clause"
        ),

        notice_required=bool(
            row.get(
                "notice_required",
                True,
            )
        ),

        notice_period_days=row.get(
            "notice_period_days"
        ),

        schedule_id=(
            str(
                row["schedule_id"]
            )
            if row.get(
                "schedule_id"
            )
            else None
        ),

        engine2_analysis_id=(
            str(
                row[
                    "engine2_analysis_id"
                ]
            )
            if row.get(
                "engine2_analysis_id"
            )
            else None
        ),

        gross_delay_days=row.get(
            "gross_delay_days"
        ),

        concurrent_delay_days=row.get(
            "concurrent_delay_days"
        ),

        net_delay_days=row.get(
            "net_delay_days"
        ),
    )


# =====================================================================
# MULTI-EVENT HELPERS
# =====================================================================

def _dedupe_ids(
    values: List[str],
) -> List[str]:

    seen = set()
    output: List[str] = []

    for value in values:

        if not value:
            continue

        value = str(value)

        if value in seen:
            continue

        seen.add(value)
        output.append(value)

    return output


def _load_delay_events(
    tenant_id: str,
    project_id: str,
    delay_event_ids: List[str],
) -> List[DelayEventInput]:

    events: List[DelayEventInput] = []

    for event_id in _dedupe_ids(
        delay_event_ids
    ):

        events.append(
            _load_delay_event(
                tenant_id,
                project_id,
                event_id,
            )
        )

    return events


def _load_event_analysis_links(
    tenant_id: str,
    project_id: str,
    delay_event_ids: List[str],
) -> List[Dict[str, Any]]:

    ids = _dedupe_ids(
        delay_event_ids
    )

    if not ids:
        return []

    db = _require_supabase()

    try:

        result = (
            db
            .table(
                "delay_event_analyses"
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
                "delay_event_id",
                ids,
            )
            .execute()
        )

        rows = result.data or []

        return [
            {
                **row,
                "id": str(row.get("id")) if row.get("id") else None,
                "project_id": str(row.get("project_id")),
                "delay_event_id": str(row.get("delay_event_id")),
                "analysis_id": str(row.get("analysis_id")),
            }
            for row in rows
        ]

    except Exception:
        return []


# =====================================================================
# ENGINE 2 ANALYSIS LOADER
# =====================================================================

def _load_engine2_analysis(
    analysis_id: Optional[str],
    tenant_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> Optional[
    Dict[str, Any]
]:

    if not analysis_id:
        return None

    db = _require_supabase()

    try:

        query = (
            db
            .table(
                "cpm_analyses"
            )
            .select("*")
            .eq(
                "id",
                analysis_id,
            )
        )

        if tenant_id:
            query = query.eq(
                "tenant_id",
                tenant_id,
            )

        if project_id:
            query = query.eq(
                "project_id",
                project_id,
            )

        result = (
            query
            .single()
            .execute()
        )

        row = result.data

        if not row:
            return None

        return (
            row.get(
                "results_json"
            )
            or row
        )

    except Exception:

        return None


def _load_engine2_analyses(
    analysis_ids: List[str],
    tenant_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> List[Dict[str, Any]]:

    analyses: List[Dict[str, Any]] = []

    for analysis_id in _dedupe_ids(
        analysis_ids
    ):

        analysis = _load_engine2_analysis(
            analysis_id,
            tenant_id=tenant_id,
            project_id=project_id,
        )

        if not isinstance(
            analysis,
            dict,
        ):
            continue

        enriched = dict(analysis)
        enriched.setdefault(
            "analysis_id",
            analysis_id,
        )

        analyses.append(
            enriched
        )

    return analyses


def _extract_fragnets(
    analyses: List[Dict[str, Any]],
    event_analysis_map: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:

    event_ids_by_analysis: Dict[
        str,
        List[str],
    ] = {}

    for link in event_analysis_map:

        analysis_id = str(
            link.get("analysis_id")
            or ""
        )

        event_id = str(
            link.get("delay_event_id")
            or ""
        )

        if not analysis_id or not event_id:
            continue

        event_ids_by_analysis.setdefault(
            analysis_id,
            [],
        ).append(
            event_id
        )

    output: List[Dict[str, Any]] = []
    seen = set()

    for analysis in analyses:

        analysis_id = str(
            analysis.get("analysis_id")
            or analysis.get("id")
            or ""
        )

        candidates: List[Dict[str, Any]] = []

        single = analysis.get("fragnet")

        if isinstance(single, dict):
            candidates.append(single)

        many = analysis.get("fragnets")

        if isinstance(many, list):
            candidates.extend(
                item
                for item in many
                if isinstance(item, dict)
            )

        for fragnet in candidates:

            fragnet_id = str(
                fragnet.get("fragnet_id")
                or fragnet.get("id")
                or ""
            )

            key = (
                analysis_id,
                fragnet_id,
                str(fragnet),
            )

            if key in seen:
                continue

            seen.add(key)

            output.append({
                **fragnet,
                "analysis_id": analysis_id or None,
                "linked_delay_event_ids": _dedupe_ids(
                    event_ids_by_analysis.get(
                        analysis_id,
                        [],
                    )
                ),
            })

    return output


# =====================================================================
# CONTRACT CLAUSE RETRIEVAL
# =====================================================================

def _retrieve_contract_clauses(
    project_id: str,
    query: str,
) -> List[
    EvidenceSource
]:

    """
    Backward-compatible broad reference retrieval.

    New drafting flows should prefer _retrieve_contract_context_sources()
    so the registered project contract and optional supporting references
    retain explicit authority classifications.
    """

    result = search_reference_clauses(
        query_text=query,
        query_vector=None,
        limit=8,
    )

    sources: List[
        EvidenceSource
    ] = []

    for item in result.items:

        sources.append(
            EvidenceSource(
                source_type=item.source_type,
                source_id=item.source_id,
                title=item.title,
                date=item.document_date,
                reference=(
                    item.reference
                    or item.clause_number
                ),
                text=item.content,
                metadata={
                    **item.metadata,
                    "document_name":
                        item.document_name,
                    "document_type":
                        item.document_type,
                    "clause_number":
                        item.clause_number,
                },
            )
        )

    return sources


# =====================================================================
# CONTRACT / REFERENCE EVIDENCE CONVERSION
# =====================================================================

def _to_evidence_sources(
    items: List[Any],
) -> List[
    EvidenceSource
]:

    sources: List[
        EvidenceSource
    ] = []

    for item in items:

        sources.append(
            EvidenceSource(
                source_type=item.source_type,
                source_id=item.source_id,
                title=item.title,
                date=(
                    item.document_date
                    or item.event_date
                ),
                reference=(
                    item.reference
                    or item.clause_number
                ),
                text=item.content,
                metadata={
                    **(
                        item.metadata
                        or {}
                    ),
                    "document_id":
                        item.document_id,
                    "document_name":
                        item.document_name,
                    "document_type":
                        item.document_type,
                    "clause_number":
                        item.clause_number,
                    "storage_path":
                        item.storage_path,
                    "cde_source":
                        item.cde_source,
                    "cde_document_id":
                        item.cde_document_id,
                },
            )
        )

    return sources


def _retrieve_contract_context_sources(
    query: str,
    primary_contract: Optional[
        ReferenceSelection
    ],
    selected_references: List[
        ReferenceSelection
    ],
) -> tuple[
    List[EvidenceSource],
    List[EvidenceSource],
    List[str],
]:

    result = retrieve_contract_context(
        query=query,
        primary_contract=primary_contract,
        selected_references=selected_references,
        primary_limit=8,
        reference_limit=5,
    )

    primary_sources: List[
        EvidenceSource
    ] = []

    reference_sources: List[
        EvidenceSource
    ] = []

    for source in _to_evidence_sources(
        result.items
    ):

        if (
            source.source_type
            == "PRIMARY_CONTRACT_REFERENCE"
        ):
            primary_sources.append(
                source
            )

        elif (
            source.source_type
            == "REFERENCE_BENCHMARK"
        ):
            reference_sources.append(
                source
            )

        else:
            reference_sources.append(
                source
            )

    return (
        primary_sources,
        reference_sources,
        list(
            result.warnings
        ),
    )


# =====================================================================
# PROJECT DOCUMENT RETRIEVAL
# =====================================================================

def _load_selected_documents(
    tenant_id: str,
    project_id: str,
    source_document_ids: List[str],
) -> List[
    EvidenceSource
]:

    """
    Load project-document metadata from the Private Vault.

    Retrieval is scoped by both tenant_id and project_id.
    """

    if not source_document_ids:
        return []

    items = get_selected_documents(
        tenant_id=tenant_id,
        project_id=project_id,
        document_ids=source_document_ids,
    )

    sources: List[
        EvidenceSource
    ] = []

    for item in items:

        sources.append(
            EvidenceSource(
                source_type=item.source_type,
                source_id=item.source_id,
                title=item.title,
                date=(
                    item.document_date
                    or item.event_date
                ),
                reference=item.reference,
                text=item.content,
                metadata={
                    **item.metadata,
                    "document_id":
                        item.document_id,
                    "document_name":
                        item.document_name,
                    "document_type":
                        item.document_type,
                    "storage_path":
                        item.storage_path,
                    "sender_entity":
                        item.sender_entity,
                    "recipient_entity":
                        item.recipient_entity,
                    "clause_number":
                        item.clause_number,
                    "cde_source":
                        item.cde_source,
                    "cde_document_id":
                        item.cde_document_id,
                },
            )
        )

    return sources


# =====================================================================
# PROJECT EVIDENCE RETRIEVAL
# =====================================================================

def _retrieve_project_evidence(
    tenant_id: str,
    project_id: str,
    query: str,
    source_document_ids: Optional[
        List[str]
    ] = None,
    notice_ids: Optional[
        List[str]
    ] = None,
    include_all_selected_chunks: bool = False,
    chunk_limit: int = 12,
) -> List[
    EvidenceSource
]:

    """
    Retrieve project-scoped evidence from the shared Evidence Layer.

    This combines:
    - selected project documents,
    - project_chunks,
    - contract notices.

    All retrieval remains tenant/project scoped.
    """

    evidence_kwargs: Dict[str, Any] = {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "query": query,
        "selected_document_ids": (
            source_document_ids
            or []
        ),
        "notice_ids": (
            notice_ids
            or []
        ),
        "chunk_limit": chunk_limit,
    }

    # The revised Evidence Layer supports include_all_selected_chunks.
    # Detect the deployed signature at runtime so an older evidence_service.py
    # does not make the whole Claims page fail with an unexpected-keyword 500.
    try:
        parameters = inspect.signature(
            assemble_project_evidence
        ).parameters
    except (TypeError, ValueError):
        parameters = {}

    if (
        "include_all_selected_chunks"
        in parameters
    ):
        evidence_kwargs[
            "include_all_selected_chunks"
        ] = include_all_selected_chunks

    try:
        result = assemble_project_evidence(
            **evidence_kwargs
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to assemble project evidence: "
                f"{exc}"
            ),
        ) from exc

    sources: List[
        EvidenceSource
    ] = []

    for item in result.items:

        sources.append(
            EvidenceSource(
                source_type=item.source_type,
                source_id=item.source_id,
                title=item.title,
                date=(
                    item.document_date
                    or item.event_date
                ),
                reference=(
                    item.reference
                    or item.clause_number
                ),
                text=item.content,
                metadata={
                    **item.metadata,
                    "document_id":
                        item.document_id,
                    "document_name":
                        item.document_name,
                    "document_type":
                        item.document_type,
                    "storage_path":
                        item.storage_path,
                    "sender_entity":
                        item.sender_entity,
                    "recipient_entity":
                        item.recipient_entity,
                    "clause_number":
                        item.clause_number,
                    "cde_source":
                        item.cde_source,
                    "cde_document_id":
                        item.cde_document_id,
                },
            )
        )

    return sources


# =====================================================================
# NOTICE RETRIEVAL
# =====================================================================

def _load_notices(
    tenant_id: str,
    project_id: str,
    notice_ids: List[str],
) -> List[
    EvidenceSource
]:

    if not notice_ids:
        return []

    db = _require_supabase()

    try:

        result = (
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
            .in_(
                "id",
                notice_ids,
            )
            .execute()
        )

        rows = (
            result.data
            or []
        )

        sources: List[
            EvidenceSource
        ] = []

        for row in rows:

            sources.append(
                EvidenceSource(

                    source_type=(
                        "CONTRACT_NOTICE"
                    ),

                    source_id=str(
                        row["id"]
                    ),

                    title=row.get(
                        "event_description"
                    ),

                    date=row.get(
                        "notice_date"
                    ),

                    reference=row.get(
                        "clause_reference"
                    ),

                    text=row.get(
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

        return sources

    except Exception:

        return []


# =====================================================================
# EVIDENCE BUNDLE BUILDER
# =====================================================================

def _build_bundle(
    payload: FlexibleDraftRequest,
) -> EvidenceBundle:

    # -------------------------------------------------------------
    # MULTI-EVENT SELECTION
    # -------------------------------------------------------------

    requested_event_ids = _dedupe_ids(
        [
            *(
                [payload.delay_event_id]
                if payload.delay_event_id
                else []
            ),
            *payload.delay_event_ids,
        ]
    )

    events = _load_delay_events(
        payload.tenant_id,
        payload.project_id,
        requested_event_ids,
    )

    # Backward-compatible first-event alias.
    event = (
        events[0]
        if events
        else None
    )

    time_bars: Dict[
        str,
        Any,
    ] = {
        item.event_id:
            calculate_time_bar(item)
        for item in events
    }

    time_bar = (
        time_bars.get(
            event.event_id
        )
        if event
        else None
    )

    # -------------------------------------------------------------
    # EVENT ↔ ANALYSIS LINKS
    # -------------------------------------------------------------

    event_analysis_map = (
        _load_event_analysis_links(
            payload.tenant_id,
            payload.project_id,
            [
                item.event_id
                for item in events
            ],
        )
    )

    requested_analysis_ids = _dedupe_ids(
        [
            *(
                [payload.engine2_analysis_id]
                if payload.engine2_analysis_id
                else []
            ),
            *payload.engine2_analysis_ids,
            *[
                item.engine2_analysis_id
                for item in events
                if item.engine2_analysis_id
            ],
            *[
                str(link.get("analysis_id"))
                for link in event_analysis_map
                if link.get("analysis_id")
            ],
        ]
    )

    schedule_analyses = (
        _load_engine2_analyses(
            requested_analysis_ids,
            tenant_id=payload.tenant_id,
            project_id=payload.project_id,
        )
    )

    # Backward-compatible first-analysis alias.
    schedule_analysis = (
        schedule_analyses[0]
        if schedule_analyses
        else None
    )

    fragnets = _extract_fragnets(
        schedule_analyses,
        event_analysis_map,
    )

    # -------------------------------------------------------------
    # CONTRACT / EVIDENCE QUERY
    # -------------------------------------------------------------

    clause_query = " ".join(
        str(item)
        for item in [
            payload.subject,
            payload.issue_description,
            payload.contract_clause,
            payload.custom_instruction,
            payload.requested_action,
            *[
                event_item.event_title
                for event_item in events
            ],
            *[
                event_item.contract_clause
                for event_item in events
                if event_item.contract_clause
            ],
        ]
        if item
    )

    # Authority-aware contract/reference retrieval.
    (
        primary_contract_sources,
        reference_sources,
        reference_warnings,
    ) = _retrieve_contract_context_sources(
        query=clause_query,
        primary_contract=(
            payload.primary_contract
        ),
        selected_references=(
            payload.selected_references
        ),
    )

    # Backward-compatible aggregate alias. Existing downstream code expecting
    # contract_clauses will continue to receive all retrieved reference text.
    contract_clauses = [
        *primary_contract_sources,
        *reference_sources,
    ]

    # If no explicit contract/reference selections were supplied, preserve
    # the previous broad retrieval behaviour.
    if (
        not payload.primary_contract
        and not payload.selected_references
    ):

        contract_clauses = (
            _retrieve_contract_clauses(
                payload.project_id,
                clause_query,
            )
        )

    selected_documents = (
        _load_selected_documents(
            payload.tenant_id,
            payload.project_id,
            payload.source_document_ids,
        )
    )

    notices = _load_notices(
        payload.tenant_id,
        payload.project_id,
        payload.notice_ids,
    )

    project_evidence = (
        _retrieve_project_evidence(
            tenant_id=payload.tenant_id,
            project_id=payload.project_id,
            query=clause_query,
            source_document_ids=(
                payload.source_document_ids
            ),
            notice_ids=(
                payload.notice_ids
            ),
            include_all_selected_chunks=(
                payload.document_type
                == "EVIDENCE_REVIEW"
            ),
            chunk_limit=(
                80
                if payload.document_type
                == "EVIDENCE_REVIEW"
                else 12
            ),
        )
    )

    correspondence: List[
        EvidenceSource
    ] = []

    weekly_reports: List[
        EvidenceSource
    ] = []

    monthly_reports: List[
        EvidenceSource
    ] = []

    site_records: List[
        EvidenceSource
    ] = []

    for source in project_evidence:

        source_type = str(
            source.source_type
            or ""
        ).upper()

        document_type = str(
            source.metadata.get(
                "document_type",
                "",
            )
            or ""
        ).lower()

        if source_type == "CONTRACT_NOTICE":
            continue

        if "weekly" in document_type:
            weekly_reports.append(source)

        elif "monthly" in document_type:
            monthly_reports.append(source)

        elif (
            "minute" in document_type
            or "site" in document_type
            or "diary" in document_type
            or "record" in document_type
        ):
            site_records.append(source)

        else:
            correspondence.append(source)

    # -------------------------------------------------------------
    # EVIDENCE GAPS
    # -------------------------------------------------------------

    evidence_gaps: List[str] = []

    for warning in reference_warnings:
        if warning:
            evidence_gaps.append(
                "Reference retrieval: "
                + str(warning)
            )

    if (
        payload.primary_contract
        and not primary_contract_sources
    ):
        evidence_gaps.append(
            "The registered primary contract reference returned no "
            "matching reference-library evidence for this query."
        )

    if (
        payload.selected_references
        and not reference_sources
    ):
        evidence_gaps.append(
            "The selected supporting references returned no matching "
            "reference-library evidence for this query."
        )

    if (
        payload.contract_clause
        and not contract_clauses
    ):
        evidence_gaps.append(
            "Requested contract clause has not yet been verified "
            "from the project/reference vault."
        )

    if (
        payload.source_document_ids
        and not selected_documents
    ):
        evidence_gaps.append(
            "Selected project documents could not be retrieved "
            "from the project evidence layer."
        )

    missing_analysis_ids = [
        analysis_id
        for analysis_id in requested_analysis_ids
        if analysis_id not in {
            str(
                analysis.get("analysis_id")
                or analysis.get("id")
                or ""
            )
            for analysis in schedule_analyses
        }
    ]

    if missing_analysis_ids:
        evidence_gaps.append(
            "The following linked Engine 2 analyses could not be "
            "retrieved: "
            + ", ".join(missing_analysis_ids)
        )

    for event_item in events:

        if (
            event_item.notice_required
            and event_item.notice_period_days is None
        ):
            evidence_gaps.append(
                f"{event_item.event_reference}: notice period has not "
                "been confirmed from the project contract."
            )

    if (
        payload.mode == "POTENTIAL_EVENT"
        and not payload.issue_description
        and not events
    ):
        evidence_gaps.append(
            "Potential event description is required for a meaningful draft."
        )

    # -------------------------------------------------------------
    # AFFECTED ACTIVITIES — AGGREGATE WITHOUT DUPLICATION
    # -------------------------------------------------------------

    affected_activities: List[
        Dict[str, Any]
    ] = []

    seen_activities = set()

    for analysis in schedule_analyses:

        analysis_id = str(
            analysis.get("analysis_id")
            or analysis.get("id")
            or ""
        )

        after = analysis.get("after")

        if not isinstance(after, dict):
            continue

        longest_path = after.get(
            "longest_path"
        )

        if not isinstance(
            longest_path,
            list,
        ):
            continue

        for activity in longest_path:

            if not isinstance(
                activity,
                dict,
            ):
                continue

            activity_id = str(
                activity.get("activity_id")
                or activity.get("task_code")
                or activity.get("task_id")
                or activity.get("id")
                or ""
            )

            key = (
                analysis_id,
                activity_id,
                str(activity),
            )

            if key in seen_activities:
                continue

            seen_activities.add(key)

            affected_activities.append({
                **activity,
                "analysis_id": analysis_id or None,
            })

    # -------------------------------------------------------------
    # FINAL EVIDENCE BUNDLE
    # -------------------------------------------------------------

    return EvidenceBundle(
        project_id=payload.project_id,
        tenant_id=payload.tenant_id,

        # Backward-compatible aliases
        delay_event=event,
        time_bar=time_bar,
        schedule_analysis=schedule_analysis,

        # Multi-event context
        delay_events=events,
        time_bars=time_bars,
        schedule_analyses=schedule_analyses,
        event_analysis_map=event_analysis_map,
        fragnets=fragnets,

        contract_authority=(
            ContractAuthorityProfile(
                primary_contract=(
                    payload.primary_contract
                ),
                selected_references=(
                    payload.selected_references
                ),
            )
            if (
                payload.primary_contract
                or payload.selected_references
            )
            else None
        ),

        primary_contract_sources=(
            primary_contract_sources
        ),

        reference_sources=(
            reference_sources
        ),

        contract_clauses=contract_clauses,
        notices=notices,
        correspondence=correspondence,
        weekly_reports=weekly_reports,
        monthly_reports=monthly_reports,
        site_records=site_records,
        selected_documents=selected_documents,
        affected_activities=affected_activities,

        user_context={
            "mode": payload.mode,
            "document_type": payload.document_type,
            "sender_role": payload.sender_role,
            "recipient_role": payload.recipient_role,
            "stance": payload.stance,
            "subject": payload.subject,
            "matter_reference": payload.matter_reference,
            "issue_description": payload.issue_description,
            "contract_clause": payload.contract_clause,
            "primary_contract": (
                payload.primary_contract.model_dump(
                    mode="json"
                )
                if payload.primary_contract
                else None
            ),
            "selected_references": [
                item.model_dump(
                    mode="json"
                )
                for item in payload.selected_references
            ],
            "reference_selection_count":
                len(
                    payload.selected_references
                ),
            "requested_action": payload.requested_action,
            "response_deadline": payload.response_deadline,
            "notice_id": payload.notice_id,
            "claim_id": payload.claim_id,
            "delay_event_ids": [
                item.event_id
                for item in events
            ],
            "engine2_analysis_ids": requested_analysis_ids,
            "delay_event_count": len(events),
            "analysis_count": len(schedule_analyses),
            "fragnet_count": len(fragnets),
            "multi_event": len(events) > 1,
        },
        evidence_gaps=evidence_gaps,
    )


# =====================================================================
# CHRONOLOGY EVIDENCE FILTER
# =====================================================================

def _parse_optional_iso_date(
    value: Optional[str],
    field_name: str,
) -> Optional[date]:
    if not value:
        return None

    try:
        return date.fromisoformat(str(value))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{field_name} must be a valid ISO date "
                "in YYYY-MM-DD format."
            ),
        ) from exc


def _apply_chronology_filters(
    payload: FlexibleDraftRequest,
    bundle: EvidenceBundle,
) -> EvidenceBundle:
    if payload.document_type != "CHRONOLOGY":
        return bundle

    from_date = _parse_optional_iso_date(
        payload.chronology_from_date,
        "chronology_from_date",
    )
    to_date = _parse_optional_iso_date(
        payload.chronology_to_date,
        "chronology_to_date",
    )

    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=400,
            detail=(
                "Chronology From Date cannot be later "
                "than Chronology To Date."
            ),
        )

    def in_range(item_date: Any) -> bool:
        if not from_date and not to_date:
            return True

        if not item_date:
            return False

        if isinstance(item_date, date):
            current = item_date
        else:
            try:
                current = date.fromisoformat(str(item_date)[:10])
            except Exception:
                return False

        if from_date and current < from_date:
            return False
        if to_date and current > to_date:
            return False
        return True

    selected_ids = {
        str(item)
        for item in (payload.source_document_ids or [])
        if item
    }

    def is_selected_document(source: EvidenceSource) -> bool:
        if not selected_ids:
            return False

        metadata = source.metadata or {}
        candidates = {
            str(source.source_id or ""),
            str(metadata.get("document_id") or ""),
            str(metadata.get("source_document_id") or ""),
        }
        return bool(
            selected_ids.intersection(
                value for value in candidates if value
            )
        )

    def filter_sources(
        sources: List[EvidenceSource],
        *,
        enforce_selected: bool = False,
    ) -> List[EvidenceSource]:
        output: List[EvidenceSource] = []

        for source in sources:
            if (
                enforce_selected
                and payload.chronology_selected_documents_only
                and selected_ids
                and not is_selected_document(source)
            ):
                continue

            if not in_range(source.date):
                continue

            output.append(source)

        return output

    bundle.selected_documents = filter_sources(
        bundle.selected_documents
    )

    bundle.correspondence = filter_sources(
        bundle.correspondence,
        enforce_selected=True,
    )
    bundle.weekly_reports = filter_sources(
        bundle.weekly_reports,
        enforce_selected=True,
    )
    bundle.monthly_reports = filter_sources(
        bundle.monthly_reports,
        enforce_selected=True,
    )
    bundle.site_records = filter_sources(
        bundle.site_records,
        enforce_selected=True,
    )

    bundle.notices = filter_sources(
        bundle.notices
    )

    filtered_events = [
        event
        for event in bundle.delay_events
        if in_range(event.event_date)
    ]

    retained_event_ids = {
        event.event_id
        for event in filtered_events
    }

    bundle.delay_events = filtered_events
    bundle.delay_event = (
        filtered_events[0]
        if filtered_events
        else None
    )

    bundle.time_bars = {
        event_id: value
        for event_id, value in bundle.time_bars.items()
        if event_id in retained_event_ids
    }

    bundle.time_bar = (
        bundle.time_bars.get(bundle.delay_event.event_id)
        if bundle.delay_event
        else None
    )

    bundle.event_analysis_map = [
        link
        for link in bundle.event_analysis_map
        if str(link.get("delay_event_id") or "")
        in retained_event_ids
    ]

    retained_analysis_ids = {
        str(link.get("analysis_id") or "")
        for link in bundle.event_analysis_map
        if link.get("analysis_id")
    }

    if retained_analysis_ids:
        bundle.schedule_analyses = [
            analysis
            for analysis in bundle.schedule_analyses
            if str(
                analysis.get("analysis_id")
                or analysis.get("id")
                or ""
            )
            in retained_analysis_ids
        ]
        bundle.schedule_analysis = (
            bundle.schedule_analyses[0]
            if bundle.schedule_analyses
            else None
        )
        bundle.fragnets = [
            fragnet
            for fragnet in bundle.fragnets
            if str(fragnet.get("analysis_id") or "")
            in retained_analysis_ids
        ]
        bundle.affected_activities = [
            activity
            for activity in bundle.affected_activities
            if str(activity.get("analysis_id") or "")
            in retained_analysis_ids
        ]
    elif payload.delay_event_ids or payload.delay_event_id:
        bundle.schedule_analyses = []
        bundle.schedule_analysis = None
        bundle.fragnets = []
        bundle.affected_activities = []

    bundle.user_context["chronology_from_date"] = (
        from_date.isoformat() if from_date else None
    )
    bundle.user_context["chronology_to_date"] = (
        to_date.isoformat() if to_date else None
    )
    bundle.user_context["chronology_selected_documents_only"] = bool(
        payload.chronology_selected_documents_only
    )

    if (
        payload.chronology_selected_documents_only
        and not selected_ids
    ):
        bundle.evidence_gaps.append(
            "Chronology is configured for selected documents only, "
            "but no project documents were selected."
        )

    if (
        (from_date or to_date)
        and not (
            bundle.selected_documents
            or bundle.correspondence
            or bundle.weekly_reports
            or bundle.monthly_reports
            or bundle.site_records
            or bundle.notices
            or bundle.delay_events
        )
    ):
        bundle.evidence_gaps.append(
            "No dated chronology evidence falls within the selected date range."
        )

    return bundle


# =====================================================================
# AI DRAFTING INSTRUCTION
# =====================================================================

def _drafting_instruction(
    payload: FlexibleDraftRequest,
) -> str:

    extra = (
        "\n\n"
        + CONTRACT_AUTHORITY_INSTRUCTION
    )

    if payload.document_type in {
        "CLAIM_REPORT",
        "EOT_SUBMISSION",
    }:

        extra += (
            "\n\n"
            + CLAIM_REPORT_INSTRUCTION
        )

    if (
        payload.document_type
        == "CHRONOLOGY"
    ):

        extra += (
            "\n\n"
            + CHRONOLOGY_INSTRUCTION
        )

    if (
        payload.document_type
        == "EVIDENCE_REVIEW"
    ):

        extra += (
            "\n\n"
            + EVIDENCE_REVIEW_INSTRUCTION
        )

    potential_rule = ""

    if (
        payload.mode
        == "POTENTIAL_EVENT"
    ):

        potential_rule = """
This is a potential or emerging matter.

Do not state that actual delay,
liability, causation, or entitlement
has been established unless verified
evidence expressly supports that conclusion.

Use protective forward-looking language.
""".strip()

    return f"""
MODE:
{payload.mode}

DOCUMENT TYPE:
{payload.document_type}

SENDER ROLE:
{payload.sender_role}

RECIPIENT ROLE:
{payload.recipient_role or "Not specified"}

STANCE:
{payload.stance}

SUBJECT:
{payload.subject or "Not specified"}

ISSUE / MATTER:
{payload.issue_description or "Use linked evidence and context."}

REQUESTED ACTION:
{payload.requested_action or "Draft an appropriate professional communication."}

RESPONSE DEADLINE:
{payload.response_deadline or "Not specified"}

CHRONOLOGY DATE RANGE:
{payload.chronology_from_date or "Not specified"} to {payload.chronology_to_date or "Not specified"}

CHRONOLOGY SOURCE SCOPE:
{"Selected project documents only" if payload.chronology_selected_documents_only else "All evidence made available in the filtered evidence bundle"}

MULTI-EVENT RULE:
If more than one delay event or Engine 2 analysis is present, structure the
draft so each event remains separately identifiable before discussing any
combined position. Do not arithmetically add event impacts. Combined delay,
concurrency, overlap and net effect may only be stated when supported by the
provided Engine 2 analyses.

{potential_rule}

CUSTOM INSTRUCTION:
{
    payload.custom_instruction
    or
    "Use concise, professional construction-contract language."
}

{
    "Answer the requested evidence-review task directly. Do not draft a letter."
    if payload.document_type == "EVIDENCE_REVIEW"
    else "Produce the COMPLETE draft text."
}

{
    "Return only evidence-grounded findings; if the selected evidence does not support the requested item, state that clearly."
    if payload.document_type == "EVIDENCE_REVIEW"
    else "Do not merely provide an outline."
}

{extra}
""".strip()


# =====================================================================
# GENERATE DRAFT
# =====================================================================

def _generate(
    payload: FlexibleDraftRequest,
) -> tuple[
    EvidenceBundle,
    str,
]:

    bundle = _build_bundle(
        payload
    )

    bundle = _apply_chronology_filters(
        payload,
        bundle,
    )

    bundle = enrich_evidence_review(bundle)

    try:

        draft = generate_draft(

            system_instruction=(
                UNIVERSAL_SYSTEM_INSTRUCTION
            ),

            bundle=bundle,

            drafting_instruction=(
                _drafting_instruction(
                    payload
                )
            ),
        )

    except RuntimeError as exc:

        raise HTTPException(
            status_code=503,
            detail=str(exc),
        )

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Engine 3 AI drafting failed: "
                f"{exc}"
            ),
        )

    return (
        bundle,
        draft,
    )


# =====================================================================
# HEALTH
# =====================================================================

@router.get(
    "/health"
)
async def health():

    return {

        "status":
            "ONLINE",

        "engine":
            "ContractX Engine 3",

        "version":
            "3.0",

        "name":
            "Claims & Correspondence",

        "modes": [

            "GENERAL",

            "POTENTIAL_EVENT",

            "EVENT_LINKED",

            "NOTICE_LINKED",

            "CLAIM_LINKED",

            "ENGINE2_LINKED",
        ],

        "word_export":
            True,

        "multi_event":
            True,

        "multi_analysis":
            True,

        "event_analysis_linking":
            True,

        "primary_contract_reference":
            True,

        "query_time_reference_selection":
            True,

        "max_query_time_references":
            3,

        "evidence_review":
            True,

        "selected_document_analysis":
            True,
    }


# =====================================================================
# EVENT ↔ ENGINE 2 ANALYSIS LINKING
# =====================================================================

@router.post(
    "/delay-events/link-analysis"
)
async def link_delay_event_analysis(
    payload: LinkEventAnalysisRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    db = _require_supabase()

    # Validate the event belongs to the selected tenant/project.
    _load_delay_event(
        payload.tenant_id,
        payload.project_id,
        payload.delay_event_id,
    )

    # Validate the analysis exists before linking it.
    analysis = _load_engine2_analysis(
        payload.analysis_id,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )

    if not analysis:
        raise HTTPException(
            status_code=404,
            detail="Engine 2 analysis not found.",
        )

    row = {
        "tenant_id": payload.tenant_id,
        "project_id": payload.project_id,
        "delay_event_id": payload.delay_event_id,
        "analysis_id": payload.analysis_id,
        "relation_type": payload.relation_type,
        "sequence_no": payload.sequence_no,
        "notes": payload.notes,
    }

    try:
        result = (
            db
            .table("delay_event_analyses")
            .upsert(
                row,
                on_conflict="delay_event_id,analysis_id",
            )
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to link event and analysis: {exc}",
        )

    return {
        "status": "linked",
        "delay_event_id": payload.delay_event_id,
        "analysis_id": payload.analysis_id,
        "relation_type": payload.relation_type,
        "record": (
            (result.data or [None])[0]
            if result.data
            else None
        ),
    }


@router.get(
    "/delay-events/{delay_event_id}/analyses"
)
async def get_delay_event_analyses(
    delay_event_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )


    _load_delay_event(
        tenant_id,
        project_id,
        delay_event_id,
    )

    links = _load_event_analysis_links(
        tenant_id,
        project_id,
        [delay_event_id],
    )

    analyses = _load_engine2_analyses(
        [
            str(link.get("analysis_id"))
            for link in links
            if link.get("analysis_id")
        ],
        tenant_id=tenant_id,
        project_id=project_id,
    )

    return {
        "delay_event_id": delay_event_id,
        "links": links,
        "analyses": analyses,
        "fragnets": _extract_fragnets(
            analyses,
            links,
        ),
    }


# =====================================================================
# CREATE DELAY EVENT
# =====================================================================

@router.post(
    "/delay-events"
)
async def create_delay_event(
    payload: CreateDelayEventRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    db = _require_supabase()

    event_id = str(
        uuid.uuid4()
    )

    try:

        event = DelayEventInput(

            event_id=event_id,

            tenant_id=(
                payload.tenant_id
            ),

            project_id=(
                payload.project_id
            ),

            event_reference=(
                payload.event_reference
            ),

            event_title=(
                payload.event_title
            ),

            event_description=(
                payload.event_description
            ),

            delay_category=(
                payload.delay_category
            ),

            event_date=(
                date.fromisoformat(
                    payload.event_date
                )
            ),

            knowledge_date=(
                date.fromisoformat(
                    payload.knowledge_date
                )
            ),

            responsible_party=(
                payload.responsible_party
            ),

            contract_clause=(
                payload.contract_clause
            ),

            notice_required=(
                payload.notice_required
            ),

            notice_period_days=(
                payload.notice_period_days
            ),

            schedule_id=(
                payload.schedule_id
            ),

            engine2_analysis_id=(
                payload.engine2_analysis_id
            ),

            gross_delay_days=(
                payload.gross_delay_days
            ),

            concurrent_delay_days=(
                payload.concurrent_delay_days
            ),

            net_delay_days=(
                payload.net_delay_days
            ),
        )

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid date: {exc}"
            ),
        )

    time_bar = (
        calculate_time_bar(
            event
        )
    )

    row = {

        "id":
            event_id,

        "tenant_id":
            payload.tenant_id,

        "project_id":
            payload.project_id,

        "event_reference":
            payload.event_reference,

        "event_title":
            payload.event_title,

        "event_description":
            payload.event_description,

        "delay_category":
            payload.delay_category,

        "event_date":
            payload.event_date,

        "knowledge_date":
            payload.knowledge_date,

        "responsible_party":
            payload.responsible_party,

        "contract_clause":
            payload.contract_clause,

        "notice_required":
            payload.notice_required,

        "notice_period_days":
            payload.notice_period_days,

        "notice_deadline":
            (
                time_bar
                .notice_deadline
                .isoformat()
                if time_bar.notice_deadline
                else None
            ),

        "time_bar_status":
            time_bar.status,

        "schedule_id":
            payload.schedule_id,

        "engine2_analysis_id":
            payload.engine2_analysis_id,

        "gross_delay_days":
            payload.gross_delay_days,

        "concurrent_delay_days":
            payload.concurrent_delay_days,

        "net_delay_days":
            payload.net_delay_days,
    }

    try:

        (
            db
            .table(
                "delay_events"
            )
            .insert(
                row
            )
            .execute()
        )

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to create "
                f"delay event: {exc}"
            ),
        )

    return {

        "status":
            "created",

        "delay_event_id":
            event_id,

        "time_bar":
            time_bar.model_dump(
                mode="json"
            ),
    }


# =====================================================================
# GET DELAY EVENT
# =====================================================================

@router.get(
    "/delay-events/{delay_event_id}"
)
async def get_delay_event(
    delay_event_id: str,
    tenant_id: str,
    project_id: str,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )


    event = _load_delay_event(

        tenant_id,

        project_id,

        delay_event_id,
    )

    return {

        "delay_event":
            event.model_dump(
                mode="json"
            ),

        "time_bar":
            calculate_time_bar(
                event
            ).model_dump(
                mode="json"
            ),
    }


# =====================================================================
# FLEXIBLE DRAFT PREVIEW
# =====================================================================

@router.post(
    "/draft"
)
async def draft(
    payload: FlexibleDraftRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    bundle, text = (
        _generate(
            payload
        )
    )

    return {

        "status":
            "success",

        "document_type":
            payload.document_type,

        "mode":
            payload.mode,

        "stance":
            payload.stance,

        "evidence_gaps":
            bundle.evidence_gaps,

        "primary_contract_source_count":
            len(
                bundle.primary_contract_sources
            ),

        "reference_source_count":
            len(
                bundle.reference_sources
            ),

        "evidence_strength":
            bundle.evidence_strength,

        "evidence_score":
            bundle.evidence_score,

        "position_readiness":
            bundle.position_readiness,

        "resolution_readiness":
            bundle.resolution_readiness,

        "position_summary":
            bundle.position_summary,

        "resolution_actions":
            bundle.resolution_actions,

        "draft":
            text,

        "word_download_endpoint":
            "/api/v1/engine3/draft-word",
    }


# =====================================================================
# WORD EXPORT REVIEW APPENDIX
# =====================================================================

def _word_review_appendix(bundle: EvidenceBundle) -> str:
    """Build a concise, auditable workflow-review appendix for DOCX export."""

    lines = [
        "## Evidence & Resolution Review",
        "",
        f"- Evidence coverage: {bundle.evidence_strength} ({bundle.evidence_score}/100)",
        f"- Position readiness: {bundle.position_readiness}",
        f"- Resolution readiness: {bundle.resolution_readiness}",
        "",
        "### Position Readiness Summary",
        bundle.position_summary or "No structured position-readiness summary is available.",
    ]

    if bundle.evidence_gaps:
        lines.extend(["", "### Evidence Gaps"])
        lines.extend(f"- {gap}" for gap in bundle.evidence_gaps)

    if bundle.resolution_actions:
        lines.extend(["", "### Recommended Workflow Actions"])
        lines.extend(f"- {action}" for action in bundle.resolution_actions)

    lines.extend([
        "",
        "This review appendix is a workflow and evidence-control aid. It does not determine legal entitlement, liability, quantum, waiver or the final contractual position.",
    ])

    return "\n".join(lines)


# =====================================================================
# WORD DOWNLOAD
# =====================================================================

@router.post(
    "/draft-word"
)
async def draft_word(
    payload: WordDraftRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    bundle, text = (
        _generate(
            payload
        )
    )

    title = (

        payload.title

        or payload.subject

        or (
            payload
            .document_type
            .replace(
                "_",
                " ",
            )
            .title()
        )
    )

    export_content = (
        text
        + "\n\n---\n\n"
        + _word_review_appendix(bundle)
    )

    buffer, filename = (
        build_word_document(

            title=title,

            content=export_content,

            project_id=(
                payload.project_id
            ),

            document_type=(
                payload.document_type
            ),

            sender_role=(
                payload.sender_role
            ),

            recipient_role=(
                payload.recipient_role
            ),

            matter_reference=(
                payload.matter_reference
            ),
        )
    )

    return StreamingResponse(

        buffer,

        media_type=(
            "application/"
            "vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),

        headers={

            "Content-Disposition":
                (
                    "attachment; "
                    f'filename="{filename}"'
                )
        },
    )


# =====================================================================
# NOTICE
# =====================================================================

@router.post(
    "/draft-notice"
)
async def draft_notice(
    payload: WordDraftRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    if (
        payload.document_type
        == "GENERAL_CONTRACTUAL_LETTER"
    ):

        payload.document_type = (
            "NOTICE_OF_CLAIM"
        )

    return await draft_word(
        payload,
        authorization=authorization,
    )


# =====================================================================
# RESPONSE
# =====================================================================

@router.post(
    "/draft-response"
)
async def draft_response(
    payload: WordDraftRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    if (
        payload.document_type
        == "GENERAL_CONTRACTUAL_LETTER"
    ):

        payload.document_type = (
            "RESPONSE_TO_NOTICE"
        )

    return await draft_word(
        payload,
        authorization=authorization,
    )


# =====================================================================
# DEFENCE
# =====================================================================

@router.post(
    "/draft-defence"
)
async def draft_defence(
    payload: WordDraftRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    if (
        payload.document_type
        == "GENERAL_CONTRACTUAL_LETTER"
    ):

        payload.document_type = (
            "DEFENCE_TO_CLAIM"
        )

    payload.stance = (
        "DEFENSIVE"
    )

    return await draft_word(
        payload,
        authorization=authorization,
    )


# =====================================================================
# CHRONOLOGY
# =====================================================================

@router.post(
    "/draft-chronology"
)
async def draft_chronology(
    payload: WordDraftRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    payload.document_type = (
        "CHRONOLOGY"
    )

    return await draft_word(
        payload,
        authorization=authorization,
    )


# =====================================================================
# CLAIM REPORT
# =====================================================================

@router.post(
    "/draft-claim-report"
)
async def draft_claim_report(
    payload: WordDraftRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    payload.document_type = (
        "CLAIM_REPORT"
    )

    return await draft_word(
        payload,
        authorization=authorization,
    )


# =====================================================================
# EVIDENCE BUNDLE INSPECTION
# =====================================================================

@router.post(
    "/evidence-bundle"
)
async def inspect_evidence_bundle(
    payload: FlexibleDraftRequest,
    authorization: Optional[str] = Header(default=None),
):
    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    bundle = _build_bundle(
        payload
    )

    bundle = _apply_chronology_filters(
        payload,
        bundle,
    )

    bundle = enrich_evidence_review(bundle)

    return evidence_bundle_to_context(
        bundle
    )
