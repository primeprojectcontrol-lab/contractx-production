from __future__ import annotations



import logging

import os

from typing import Any, Dict, List, Optional



from fastapi import APIRouter, Header, HTTPException, status

from pydantic import BaseModel, Field



from app.engine3.evidence_service import (

    ReferenceSelection,

    retrieve_contract_context,

    assemble_project_evidence,

    get_supabase_client,

)



logger = logging.getLogger(__name__)



router = APIRouter(

    prefix="/api/v1/ask-contractx",

    tags=["Ask ContractX"],

)



from app.ai.model_service import invoke_model_chat





# =====================================================================

# AUTHENTICATION / PROJECT AUTHORIZATION

# =====================================================================


def _require_supabase():
    """
    Return the configured Supabase client used by the existing Evidence Layer.
    """
    db = get_supabase_client()

    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not currently available.",
        )

    return db


def _bearer_token(
    authorization: Optional[str],
) -> str:
    value = (
        authorization
        or ""
    ).strip()

    if not value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    scheme, separator, token = value.partition(" ")

    if (
        not separator
        or scheme.lower() != "bearer"
        or not token.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    return token.strip()


def _require_authenticated_user(
    authorization: Optional[str],
) -> str:
    """
    Validate the caller through Supabase Auth before any privileged project
    retrieval or AI operation.
    """
    db = _require_supabase()
    token = _bearer_token(
        authorization
    )

    try:
        auth_response = (
            db.auth.get_user(
                token
            )
        )

        user = getattr(
            auth_response,
            "user",
            None,
        )

        user_id = getattr(
            user,
            "id",
            None,
        )

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

    return str(
        user_id
    )


def _is_platform_admin(
    user_id: str,
) -> bool:
    db = _require_supabase()

    try:
        response = (
            db
            .table(
                "user_profiles"
            )
            .select(
                "platform_role"
            )
            .eq(
                "user_id",
                user_id,
            )
            .limit(
                1
            )
            .execute()
        )

    except Exception:
        return False

    rows = (
        response.data
        or []
    )

    return bool(
        rows
        and str(
            rows[0].get(
                "platform_role"
            )
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
    Enforce authoritative project access.

    Request-supplied tenant/project identifiers define scope only. Access
    requires an existing project with matching tenant plus project creator,
    ACTIVE project membership, or PLATFORM_ADMIN status.
    """
    db = _require_supabase()

    try:
        project_response = (
            db
            .table(
                "projects"
            )
            .select(
                "id,tenant_id,created_by"
            )
            .eq(
                "id",
                project_id,
            )
            .eq(
                "tenant_id",
                tenant_id,
            )
            .limit(
                1
            )
            .execute()
        )

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate project access.",
        ) from exc

    projects = (
        project_response.data
        or []
    )

    if not projects:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    project = projects[0]

    if str(
        project.get(
            "created_by"
        )
        or ""
    ) == user_id:
        return

    try:
        membership_response = (
            db
            .table(
                "project_users"
            )
            .select(
                "role,status"
            )
            .eq(
                "project_id",
                project_id,
            )
            .eq(
                "user_id",
                user_id,
            )
            .eq(
                "status",
                "ACTIVE",
            )
            .limit(
                1
            )
            .execute()
        )

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate project membership.",
        ) from exc

    if membership_response.data:
        return

    if _is_platform_admin(
        user_id
    ):
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

# REQUEST / RESPONSE MODELS

# =====================================================================



class AskContractXQueryRequest(BaseModel):

    query: str = Field(

        ...,

        min_length=2,

        description="User's project-specific contractual question.",

    )



    tenant_id: str

    project_id: str



    # Project-private evidence/document selections

    project_contract_document_ids: List[str] = Field(

        default_factory=list,

        description=(

            "Selected executed contract, Particular Conditions, "

            "amendments, addenda or other project contract documents."

        ),

    )



    source_document_ids: List[str] = Field(

        default_factory=list,

        description=(

            "Optional additional project evidence documents such as "

            "correspondence, notices, reports and site records."

        ),

    )



    notice_ids: List[str] = Field(

        default_factory=list,

    )



    # Registered standard-form reference

    primary_contract: Optional[

        ReferenceSelection

    ] = None



    # Optional supporting Contract Reference Library sources

    selected_references: List[

        ReferenceSelection

    ] = Field(

        default_factory=list,

        max_length=3,

    )



    # Optional deterministic schedule context

    active_schedule_id: Optional[str] = None



    # UI context only — never changes evidence authority

    stakeholder_role: Optional[str] = None





class AskContractXSourceSummary(BaseModel):

    project_contract_documents: int = 0

    project_evidence_sources: int = 0

    primary_contract_sources: int = 0

    reference_sources: int = 0

    programme_sources: int = 0





# =====================================================================

# INTERNAL HELPERS

# =====================================================================



def _programme_context(

    *,

    tenant_id: str,

    project_id: str,

    schedule_id: Optional[str],

) -> Dict[str, Any]:

    """

    Return a bounded, verified programme summary for Ask ContractX.



    Customer-facing responses never expose storage/database implementation.

    The schedule must belong to the active tenant + project.

    """



    if not schedule_id:

        return {

            "found": False,

            "schedule": None,

            "context": "No programme selected for this query.",

            "warning": None,

        }



    db = get_supabase_client()



    if db is None:

        return {

            "found": False,

            "schedule": None,

            "context": "Programme information is not currently available.",

            "warning": "Selected programme could not be verified.",

        }



    try:

        schedule_result = (

            db.table("schedules")

            .select(

                "id,tenant_id,project_id,file_name,file_type,"

                "schedule_type,data_date,created_at"

            )

            .eq("id", schedule_id)

            .eq("tenant_id", tenant_id)

            .eq("project_id", project_id)

            .limit(1)

            .execute()

        )



        rows = schedule_result.data or []



        if not rows:

            return {

                "found": False,

                "schedule": None,

                "context": "Selected programme was not found for this project.",

                "warning": "Selected programme could not be verified for this project.",

            }



        schedule = rows[0]



        task_result = (

            db.table("schedule_tasks")

            .select(

                "task_code,task_name,planned_duration_days,"

                "total_float_days,is_critical"

            )

            .eq("schedule_id", schedule_id)

            .eq("is_critical", True)

            .limit(20)

            .execute()

        )



        tasks = task_result.data or []



        lines = [

            "[VERIFIED PROGRAMME CONTEXT]",

            f"Programme: {schedule.get('file_name') or schedule_id}",

            f"Type: {schedule.get('schedule_type') or 'Not specified'}",

            f"Data date: {schedule.get('data_date') or 'Not specified'}",

        ]



        if tasks:

            lines.append("Critical activities:")

            for task in tasks:

                lines.append(

                    "- "

                    f"{task.get('task_code') or 'Activity'} | "

                    f"{task.get('task_name') or 'Unnamed activity'} | "

                    f"Duration {task.get('planned_duration_days')}d | "

                    f"Float {task.get('total_float_days')}d"

                )

        else:

            lines.append(

                "No verified critical-activity rows were available for this programme."

            )



        return {

            "found": True,

            "schedule": schedule,

            "context": "\n".join(lines),

            "warning": None,

        }



    except Exception:

        logger.exception("Ask ContractX programme context retrieval failed.")

        return {

            "found": False,

            "schedule": None,

            "context": "Programme information is not currently available.",

            "warning": "Selected programme could not be verified.",

        }





def _safe_text(value: Any) -> str:

    if value is None:

        return ""

    return str(value).strip()





def _item_text(item: Any) -> str:

    return (

        _safe_text(

            getattr(

                item,

                "content",

                None,

            )

        )

        or _safe_text(

            getattr(

                item,

                "text",

                None,

            )

        )

    )





def _item_metadata(item: Any) -> Dict[str, Any]:

    value = getattr(

        item,

        "metadata",

        None,

    )



    return (

        value

        if isinstance(

            value,

            dict,

        )

        else {}

    )





def _item_label(

    item: Any,

) -> str:

    metadata = _item_metadata(

        item

    )



    parts = [

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

        getattr(

            item,

            "document_name",

            None,

        ),

        getattr(

            item,

            "reference",

            None,

        ),

    ]



    return " | ".join(

        str(value)

        for value in parts

        if value

    )





def _format_sources(

    title: str,

    items: List[Any],

    *,

    limit: int = 10,

) -> str:

    if not items:

        return (

            f"[{title}]\n"

            "No verified source supplied."

        )



    lines = [

        f"[{title}]"

    ]



    for idx, item in enumerate(

        items[:limit],

        1,

    ):

        label = _item_label(

            item

        )



        text = _item_text(

            item

        )



        if len(text) > 2500:

            text = (

                text[:2500]

                + "..."

            )



        lines.append(

            f"\nSOURCE {idx}"

        )



        if label:

            lines.append(

                f"Reference: {label}"

            )



        lines.append(

            f"Evidence:\n{text}"

        )



    return "\n".join(

        lines

    )





def _clean_diagnostic_warnings(

    warnings: List[str],

) -> List[str]:

    """

    Keep diagnostics in the API response but prevent infrastructure

    terminology from entering the professional Ask ContractX answer.

    """



    return [

        warning

        for warning in warnings

        if warning

    ]





def _professional_evidence_gap(

    warning: str,

) -> Optional[str]:

    normalized = (

        warning

        or ""

    ).lower()



    internal_terms = (

        "qdrant",

        "payload index",

        "vector",

        "embedding",

        "supabase",

        "openai",

        "api",

        "database",

        "backend",

    )



    if any(

        term in normalized

        for term in internal_terms

    ):

        return None



    return warning.strip() or None





# =====================================================================

# SYSTEM PROMPT

# =====================================================================



ASK_CONTRACTX_SYSTEM_PROMPT = """

You are Ask ContractX, the project-specific contractual intelligence

assistant within contractX.co.



PURPOSE



Provide precise, professional construction-contract analysis grounded in

the project evidence and Contract Reference Library sources supplied in

the context. Assist Employers, Developers, Contractors, Subcontractors,

Consultants, Engineers, PMCs, Project Managers, Contract Managers,

Quantity Surveyors, Planners and legal/project teams without adopting a

default stakeholder bias.



SOURCE AUTHORITY



Apply this hierarchy:



1. Executed project contract documents.

2. Particular Conditions, amendments, addenda and agreed modifications.

3. Registered Primary Contract Reference.

4. Applicable project evidence such as notices, correspondence, reports

   and contemporaneous records.

5. Deterministic Engine 2 schedule analysis when supplied.

6. Selected Contract Reference Library sources as supporting benchmarks

   or comparative guidance only.



The registered Primary Contract Reference is NOT automatically the

executed or governing project contract.



If executed project contract evidence has not been supplied and verified:

\- call the standard form the "registered Primary Contract Reference";

\- state that interpretation is subject to verification against the

  executed project contract, Particular Conditions and amendments;

\- do not say "the Contract requires" merely because generic standard-form

  wording was retrieved.



Selected reference-library material must never be presented as a project

contract obligation merely because it was selected.



If no executed project contract is selected but a registered Primary Contract

Reference is available, answer the user's question directly from that reference.

Clearly identify the response as reference-based guidance and do not describe

that reference as the executed or governing project contract. Do not refuse to

answer merely because project-specific contract evidence is absent where the

selected Primary Contract Reference supports the requested point.



Never merge different contract families, editions or jurisdictions as

though they form a single contract.



EVIDENCE DISCIPLINE



Do not invent:

\- clauses;

\- project facts;

\- dates;

\- notices;

\- time bars;

\- correspondence;

\- schedule values;

\- activity IDs;

\- causation;

\- concurrency;

\- entitlement;

\- liability;

\- quantum;

\- governing law;

\- amendments;

\- contractual procedures.



Distinguish clearly between:

\- verified project evidence;

\- registered Primary Contract Reference;

\- supporting benchmark/reference material;

\- stakeholder assertion;

\- contractual interpretation;

\- deterministic schedule result;

\- evidence gap.



If evidence is incomplete, say so precisely.



Do not infer that a notice is valid, invalid, timely, late or time-barred

unless the relevant contract requirements and factual dates are verified.



Do not infer that an event is critical, concurrent, compensable,

excusable, non-excusable or causative of completion delay unless supported

by deterministic schedule analysis and the relevant contractual evidence.



STAKEHOLDER NEUTRALITY



Do not automatically favour the Employer, Contractor, Consultant,

Engineer or any other project stakeholder.



Where positions differ, state:

\- the available evidence;

\- each identified position;

\- the contractual issue;

\- what remains unresolved.



Do not make unnecessary admissions or concessions on behalf of the user.



LEGAL / PROFESSIONAL SAFEGUARDS



The response is decision-support, not legal advice, certification, expert

opinion or a binding contractual determination.



Avoid categorical legal conclusions where project evidence, executed

contract wording, governing law or procedural compliance has not been

verified.



Use precise qualifications such as:

\- "on the current evidence";

\- "the available record indicates";

\- "subject to verification against the executed project contract";

\- "the registered Primary Contract Reference indicates";

\- "the selected benchmark provides guidance";

\- "the matter remains to be established".



Do not expose internal infrastructure terminology such as Qdrant,

Supabase, embeddings, vector search, payload indexes, model providers,

backend services or API errors in the professional answer.



ANSWER STRUCTURE



Use the following structure when relevant:



## Answer

Give the direct practical answer first.



## Contractual Basis

Identify project-specific contract evidence first.

Then identify the registered Primary Contract Reference where relevant.



## Supporting References

Explain selected Contract Reference Library materials only as benchmarks

or supporting guidance.



## Project Evidence

Identify relevant notices, correspondence, reports, site records or other

project evidence actually supplied.



## Schedule / Delay Evidence

Use deterministic Engine 2 information only when supplied.

Do not manufacture delay analysis.



## Evidence Gaps

State only substantive professional gaps requiring verification.

Do not report internal technical warnings.



## Practical Next Steps

Provide concise evidence, contractual or project-management next actions.

Do not tell the user what legal decision they must make.



STYLE



\- Professional construction-contract language.

\- Precise and concise.

\- No generic chatbot filler.

\- No exaggerated legal certainty.

\- No unsupported clause citations.

\- No invented facts.

\- Always preserve source authority.

""".strip()





# =====================================================================

# PROGRAMME CONTEXT

# =====================================================================



@router.get(

    "/programmes",

)

async def ask_contractx_programmes(

    tenant_id: str,

    project_id: str,

    authorization: Optional[str] = Header(

        default=None,

        alias="Authorization",

    ),

):

    """

    List project programmes that have deterministic schedule data available

    for Ask ContractX. The response uses customer-facing terminology only.

    """



    _require_project_access(
        authorization=authorization,
        tenant_id=tenant_id,
        project_id=project_id,
    )


    db = get_supabase_client()



    if db is None:

        raise HTTPException(

            status_code=503,

            detail="Programme information is not currently available.",

        )



    try:

        result = (

            db.table("schedules")

            .select(

                "id,file_name,file_type,schedule_type,data_date,created_at"

            )

            .eq("tenant_id", tenant_id)

            .eq("project_id", project_id)

            .order("created_at", desc=True)

            .limit(50)

            .execute()

        )



        rows = result.data or []



    except Exception as exc:

        logger.exception("Unable to load Ask ContractX programmes.")

        raise HTTPException(

            status_code=503,

            detail="Unable to load project programmes.",

        ) from exc



    return {

        "status": "success",

        "programmes": [

            {

                "id": str(row.get("id") or ""),

                "name": row.get("file_name") or "Project Programme",

                "schedule_type": row.get("schedule_type"),

                "data_date": row.get("data_date"),

                "file_type": row.get("file_type"),

                "available_for_analysis": True,

            }

            for row in rows

        ],

    }





# =====================================================================

# QUERY ENDPOINT

# =====================================================================



@router.post(

    "/query",

)

async def ask_contractx_query(

    payload: AskContractXQueryRequest,

    authorization: Optional[str] = Header(

        default=None,

        alias="Authorization",

    ),

):

    _require_project_access(
        authorization=authorization,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
    )


    if len(

        payload.selected_references

    ) > 3:

        raise HTTPException(

            status_code=400,

            detail=(

                "A maximum of 3 supporting Contract "

                "Reference Library sources may be selected."

            ),

        )



    # -------------------------------------------------------------

    # PROJECT CONTRACT EVIDENCE

    # -------------------------------------------------------------



    project_contract_result = (

        assemble_project_evidence(

            tenant_id=payload.tenant_id,

            project_id=payload.project_id,

            query=payload.query,

            selected_document_ids=(

                payload.project_contract_document_ids

            ),

            notice_ids=[],

        )

    )



    # -------------------------------------------------------------

    # OTHER PROJECT EVIDENCE

    # -------------------------------------------------------------



    project_evidence_result = (

        assemble_project_evidence(

            tenant_id=payload.tenant_id,

            project_id=payload.project_id,

            query=payload.query,

            selected_document_ids=(

                payload.source_document_ids

            ),

            notice_ids=payload.notice_ids,

        )

    )



    # -------------------------------------------------------------

    # CONTRACT REFERENCE LIBRARY

    # -------------------------------------------------------------



    contract_context = (

        retrieve_contract_context(

            query=payload.query,

            primary_contract=(

                payload.primary_contract

            ),

            selected_references=(

                payload.selected_references

            ),

        )

    )



    # retrieve_contract_context() returns one EvidenceSearchResult.

    # Split the unified items by explicit source/authority role.

    contract_items = list(

        getattr(

            contract_context,

            "items",

            [],

        )

        or []

    )



    primary_sources = [

        item

        for item in contract_items

        if (

            str(

                getattr(

                    item,

                    "source_type",

                    "",

                )

                or ""

            ).upper()

            == "PRIMARY_CONTRACT_REFERENCE"

            or str(

                (

                    getattr(

                        item,

                        "metadata",

                        {},

                    )

                    or {}

                ).get(

                    "authority_role",

                    ""

                )

                or ""

            ).upper()

            == "PRIMARY_CONTRACT"

        )

    ]



    reference_sources = [

        item

        for item in contract_items

        if (

            str(

                getattr(

                    item,

                    "source_type",

                    "",

                )

                or ""

            ).upper()

            == "REFERENCE_BENCHMARK"

            or str(

                (

                    getattr(

                        item,

                        "metadata",

                        {},

                    )

                    or {}

                ).get(

                    "authority_role",

                    ""

                )

                or ""

            ).upper()

            == "REFERENCE_BENCHMARK"

        )

    ]



    reference_warnings = list(

        getattr(

            contract_context,

            "warnings",

            [],

        )

        or []

    )



    if (

        payload.primary_contract

        and not primary_sources

    ):

        reference_warnings.append(

            "The selected Primary Contract Reference could not be retrieved "

            "for this query. Verify the registered reference selection and "

            "reference-library metadata."

        )



    programme_result = _programme_context(

        tenant_id=payload.tenant_id,

        project_id=payload.project_id,

        schedule_id=payload.active_schedule_id,

    )



    programme_warnings = (

        [programme_result["warning"]]

        if programme_result.get("warning")

        else []

    )



    all_warnings = (

        list(

            project_contract_result.warnings

        )

        + list(

            project_evidence_result.warnings

        )

        + reference_warnings

        + programme_warnings

    )



    substantive_gaps = [

        gap

        for warning in all_warnings

        if (

            gap := _professional_evidence_gap(

                warning

            )

        )

    ]



    # -------------------------------------------------------------

    # AUTHORITY-AWARE CONTEXT

    # -------------------------------------------------------------



    authority_context = "\n\n".join(

        [

            _format_sources(

                "PROJECT CONTRACT EVIDENCE — HIGHEST AUTHORITY",

                list(

                    project_contract_result.items

                ),

                limit=12,

            ),

            _format_sources(

                "REGISTERED PRIMARY CONTRACT REFERENCE",

                primary_sources,

                limit=8,

            ),

            _format_sources(

                "SELECTED SUPPORTING CONTRACT REFERENCE LIBRARY",

                reference_sources,

                limit=12,

            ),

            _format_sources(

                "OTHER PROJECT EVIDENCE",

                list(

                    project_evidence_result.items

                ),

                limit=12,

            ),

            (

                "[PROGRAMME / SCHEDULE EVIDENCE]\n"

                + programme_result["context"]

            ),

        ]

    )



    verification_note = (

        "Executed project contract evidence has been selected."

        if payload.project_contract_document_ids

        else (

            "No executed project contract document has been selected for this "

            "query. If a registered Primary Contract Reference has been selected "

            "and retrieved, use it to provide a direct reference-based answer, "

            "clearly identifying it as the selected reference and not as the "

            "executed or governing project contract."

        )

    )



    user_context = f"""

PROJECT CONTEXT

Tenant ID: {payload.tenant_id}

Project ID: {payload.project_id}

Stakeholder Role: {payload.stakeholder_role or "Not specified"}

Programme Context: {"Verified programme selected" if programme_result["found"] else "No verified programme selected"}



CONTRACT VERIFICATION STATUS

{verification_note}



USER QUESTION

{payload.query}



AUTHORITATIVE EVIDENCE CONTEXT

{authority_context}

""".strip()



    # -------------------------------------------------------------

    # AI RESPONSE

    # -------------------------------------------------------------



    try:

        model_result = invoke_model_chat(

            tenant_id=payload.tenant_id,

            project_id=payload.project_id,

            capability="private_data",

            messages=[

                {

                    "role": "system",

                    "content": (

                        ASK_CONTRACTX_SYSTEM_PROMPT

                    ),

                },

                {

                    "role": "user",

                    "content": user_context,

                },

            ],

            temperature=0.15,

            requested_output_tokens=2500,

        )



        answer = (

            model_result.text

            or ""

        ).strip()



    except Exception as exc:

        logger.exception(

            "Ask ContractX query failed."

        )



        raise HTTPException(

            status_code=(

                status.HTTP_500_INTERNAL_SERVER_ERROR

            ),

            detail=(

                "Ask ContractX reasoning failed."

            ),

        ) from exc



    # -------------------------------------------------------------

    # RESPONSE

    # -------------------------------------------------------------



    source_summary = (

        AskContractXSourceSummary(

            project_contract_documents=len(

                project_contract_result.items

            ),

            project_evidence_sources=len(

                project_evidence_result.items

            ),

            primary_contract_sources=len(

                primary_sources

            ),

            reference_sources=len(

                reference_sources

            ),

            programme_sources=(

                1

                if programme_result["found"]

                else 0

            ),

        )

    )



    return {

        "status": "success",

        "query": payload.query,

        "answer": answer,

        "source_summary": (

            source_summary.model_dump()

        ),

        "contract_authority": {

            "primary_contract": (

                payload.primary_contract.model_dump()

                if payload.primary_contract

                else None

            ),

            "selected_references": [

                item.model_dump()

                for item

                in payload.selected_references

            ],

            "hierarchy_note": (

                "Project-specific executed contract documents, "

                "Particular Conditions and amendments take "

                "precedence. The registered Primary Contract "

                "Reference is secondary to verified project "

                "contract evidence. Selected Contract Reference "

                "Library sources are supporting benchmarks only."

            ),

        },

        "evidence_gaps": substantive_gaps,

        "diagnostics": {

            "warnings": (

                _clean_diagnostic_warnings(

                    all_warnings

                )

            ),

            "ai_processing": (

                model_result.public_dict()

            ),

        },

    }





# =====================================================================

# HEALTH

# =====================================================================



@router.get(

    "/health",

)

async def ask_contractx_health():

    return {

        "status": "ok",

        "module": "Ask ContractX",

        "authority_aware": True,

        "project_contract_selection": True,

        "primary_contract_reference": True,

        "query_time_reference_selection": True,

        "max_supporting_references": 3,

        "stakeholder_neutral": True,

        "private_project_evidence": True,

        "private_project_collection_separate": True,

        "programme_context": True,

        "programme_selector_endpoint": "/api/v1/ask-contractx/programmes",

    }
