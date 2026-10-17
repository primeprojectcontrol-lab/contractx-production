import io
import os
import json
import logging
import uuid
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# PDF / Word Libraries
from pypdf import PdfReader
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from qdrant_client import QdrantClient

# =====================================================================
# IMPORT ENGINE ROUTERS
# =====================================================================
from app.routers.engine2_router import router as engine2_router
from app.routers.engine3_router import router as engine3_router
from app.routers.ask_contractx_router import router as ask_contractx_router
from app.routers.model_router import router as model_router
from app.routers.vault_router import router as vault_router
from app.routers.task_router import router as task_router
from app.routers.portfolio_router import router as portfolio_router
from app.routers.project_invitation_router import router as project_invitation_router
from app.ai.model_service import invoke_model_chat
from app.engine3.evidence_service import (
    ReferenceSelection,
    retrieve_contract_context,
)

logger = logging.getLogger("uvicorn")

# Supabase Initialization (Relational Metadata & Engine 2 Storage)
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

try:
    from supabase import create_client, Client
    supabase_client: Optional[Client] = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None
except Exception:
    supabase_client = None

# Qdrant Vector Database Initialization
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")

try:
    qdrant_client = QdrantClient(
        host=QDRANT_HOST,
        port=QDRANT_PORT,
        api_key=QDRANT_API_KEY if QDRANT_API_KEY else None
    )
except Exception as e:
    logger.warning(f"Qdrant initialization warning: {str(e)}")
    qdrant_client = None

QDRANT_CONTRACT_COLLECTION = os.getenv(
    "QDRANT_CONTRACT_COLLECTION",
    "standard_contract_library",
)

# In-Memory Vault Store (Fallback)
DOCUMENT_VAULT: List[Dict[str, Any]] = []


# =====================================================================
# FASTAPI LIFESPAN & APP SETUP
# =====================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ContractX Multi-Engine Platform active...")
    yield
    logger.info("ContractX Engine shutting down...")


app = FastAPI(
    title="contractX.co Core Engine",
    description="Multi-Engine Construction Contract, Claims & Forensic Delay Intelligence Platform",
    version="3.6.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://contractX.co", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Engine 2 Router (Forensic Delay & CPM Analysis)
app.include_router(engine2_router)

# Register Engine 3 Router (Delay Events, Claims & Resolution)
app.include_router(engine3_router)

# Register Enhanced Ask ContractX Router
# New authority-aware route:
#   POST /api/v1/ask-contractx/query
# Legacy compatibility route retained below:
#   POST /api/v1/agent/query
app.include_router(ask_contractx_router)

# Register AI Model Governance Router
#   GET  /api/v1/models/approved
#   GET  /api/v1/models/project
#   POST /api/v1/models/project
app.include_router(model_router)

# Register Secure Private Project Vault Router
#   GET  /api/v1/vault/health
#   GET  /api/v1/vault/summary
#   GET  /api/v1/vault/documents
#   POST /api/v1/vault/upload
#   POST /api/v1/vault/sources
app.include_router(vault_router)

# Register Project Tasks / Action Control Router
#   GET    /api/v1/tasks/health
#   GET    /api/v1/tasks
#   GET    /api/v1/tasks/summary
#   GET    /api/v1/tasks/members
#   POST   /api/v1/tasks
#   PATCH  /api/v1/tasks/{task_id}
#   DELETE /api/v1/tasks/{task_id}
#   POST   /api/v1/tasks/{task_id}/resolve
#   POST   /api/v1/tasks/{task_id}/pin
#   DELETE /api/v1/tasks/{task_id}/pin
#   GET    /api/v1/tasks/notifications
app.include_router(task_router)

# Register Portfolio / Multi-Project Control Router
#   GET /api/v1/portfolio/health
#   GET /api/v1/portfolio/projects
app.include_router(portfolio_router)

# Register Project Invitation Router
#   POST /api/v1/project-invitations/send
#   POST /api/v1/project-invitations/resend
app.include_router(project_invitation_router)


# =====================================================================
# HELPER: FILE TEXT EXTRACTION
# =====================================================================
async def extract_text_from_bytes(file_bytes: bytes, filename: str) -> str:
    text = ""
    filename_lower = filename.lower()
    try:
        if filename_lower.endswith(".pdf"):
            pdf_reader = PdfReader(io.BytesIO(file_bytes))
            for page in pdf_reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        elif filename_lower.endswith(".docx"):
            doc = Document(io.BytesIO(file_bytes))
            text = "\n".join([p.text for p in doc.paragraphs if p.text])
        else:
            text = file_bytes.decode("utf-8", errors="ignore")
    except Exception as e:
        logger.error(f"Error parsing file {filename}: {str(e)}")
        text = ""
    return text.strip()


# =====================================================================
# HELPER: SCHEDULE TELEMETRY RETRIEVER (SUPABASE ENGINE 2 INTEGRATION)
# =====================================================================
def get_schedule_telemetry_context(schedule_id: Optional[str]) -> str:
    """
    Retrieves critical path activities and total float metrics from Supabase Engine 2
    to enrich Engine 1 legal queries with deterministic schedule telemetry.
    """
    if not supabase_client or not schedule_id:
        return "No linked CPM schedule metrics provided for this query."

    try:
        res = supabase_client.table("schedule_tasks")\
            .select("task_code, task_name, planned_duration_days, total_float_days, is_critical")\
            .eq("schedule_id", schedule_id)\
            .eq("is_critical", True)\
            .limit(10)\
            .execute()

        tasks = res.data or []
        if not tasks:
            return f"Schedule ID {schedule_id} contains no critical path tasks."

        context_lines = [f"DETERMINISTIC SCHEDULE TELEMETRY (Schedule ID: {schedule_id}):"]
        for t in tasks:
            context_lines.append(
                f"- Task [{t['task_code']}]: '{t['task_name']}' | Planned Duration: {t['planned_duration_days']}d | Float: {t['total_float_days']}d | Critical: YES"
            )
        return "\n".join(context_lines)
    except Exception as e:
        return f"Schedule telemetry retrieval warning: {str(e)}"


# =====================================================================
# DATA MODELS
# =====================================================================
# Legacy Ask ContractX request model retained for backward compatibility.
# New frontend work should target /api/v1/ask-contractx/query instead.
class AgentQueryPayload(BaseModel):
    query: str
    tenant_id: str
    project_id: str
    active_schedule_id: Optional[str] = Field(None, description="Optional Schedule ID to pull CPM metrics into Engine 1")


class ExecutiveMetrics(BaseModel):
    clauses_reviewed: int = 0
    critical_findings: int = 0
    high_risk_findings: int = 0
    medium_risk_findings: int = 0
    missing_provisions: int = 0
    priority_amendments: int = 0


class ExportPayload(BaseModel):
    project_id: str
    tenant_id: str
    jurisdiction: str = "uae_gcc"
    stakeholder_role: Optional[str] = None
    format: str = "pdf"
    metrics: Optional[Dict[str, Any]] = None
    authority: Optional[Dict[str, Any]] = None
    executive_summary: Optional[Dict[str, Any]] = None
    review_coverage: Optional[List[Dict[str, Any]]] = None
    findings: Optional[List[Dict[str, Any]]] = None


class BespokeReviewRequest(BaseModel):
    tenant_id: str
    project_id: str
    jurisdiction: str = "uae_gcc"

    primary_contract: Optional[ReferenceSelection] = None

    selected_references: List[ReferenceSelection] = Field(
        default_factory=list,
        max_length=3,
    )

    stakeholder_role: Optional[str] = None


# =====================================================================
# ROOT ENDPOINT
# =====================================================================
@app.get("/")
async def root():
    return {
        "status": "ONLINE",
        "platform": "contractX.co",
        "engine": "Multi-Engine Construction Intelligence Core",
        "version": "3.6.0",
        "ask_contractx": {
            "legacy_endpoint": "/api/v1/agent/query",
            "enhanced_endpoint": "/api/v1/ask-contractx/query",
            "authority_aware": True
        },
        "model_governance": {
            "approved_models_endpoint": "/api/v1/models/approved",
            "project_policy_endpoint": "/api/v1/models/project",
            "cost_controls_endpoint": "/api/v1/models/cost-controls",
            "approved_registry": True,
            "models_per_provider": 1,
            "anthropic": "coming_soon",
            "google_gemini": "coming_soon"
        },
        "private_project_vault": {
            "health_endpoint": "/api/v1/vault/health",
            "documents_endpoint": "/api/v1/vault/documents",
            "summary_endpoint": "/api/v1/vault/summary",
            "upload_endpoint": "/api/v1/vault/upload",
            "connected_sources_endpoint": "/api/v1/vault/sources"
        },
        "project_tasks": {
            "health_endpoint": "/api/v1/tasks/health",
            "tasks_endpoint": "/api/v1/tasks",
            "summary_endpoint": "/api/v1/tasks/summary",
            "members_endpoint": "/api/v1/tasks/members",
            "notifications_endpoint": "/api/v1/tasks/notifications",
            "dashboard_ready": True
        },
        "portfolio": {
            "health_endpoint": "/api/v1/portfolio/health",
            "projects_endpoint": "/api/v1/portfolio/projects",
            "multi_project": True,
            "task_rollup": True,
            "document_rollup": True,
            "project_user_rollup": True
        },
        "project_invitations": {
            "send_endpoint": "/api/v1/project-invitations/send",
            "resend_endpoint": "/api/v1/project-invitations/resend",
            "pending_invitation_flow": True
        }
    }


# =====================================================================
# ENGINE 1: ASK CONTRACTX â€” LEGACY COMPATIBILITY ENDPOINT
# =====================================================================
# This route is intentionally preserved because it was previously tested
# and may still be used by existing frontend code.
#
# Enhanced, authority-aware Ask ContractX is provided by:
#   POST /api/v1/ask-contractx/query
#
# Do not add new reference-selection logic to this legacy route.
@app.post("/api/v1/agent/query")
async def process_agent_query(payload: AgentQueryPayload):
    # Fetch Engine 2 Schedule Telemetry if a Schedule ID is provided
    schedule_telemetry = get_schedule_telemetry_context(
        payload.active_schedule_id
    )

    system_prompt = f"""You are contractX.co, an enterprise AI construction legal assistant and forensic delay analyst.
Provide an audit-ready, precise response synthesizing contract legal principles with deterministic schedule metrics.

[ENGINE 2 SCHEDULE TELEMETRY]
{schedule_telemetry}

Cite relevant Sub-Clauses (e.g., Sub-Clause 8.4, Sub-Clause 20.1) and Activity IDs where applicable. Rely exclusively on the provided CPM metrics for schedule numbers."""

    try:
        model_result = invoke_model_chat(
            tenant_id=payload.tenant_id,
            project_id=payload.project_id,
            capability="private_data",
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": payload.query,
                },
            ],
            temperature=0.2,
            requested_output_tokens=2500,
        )

        return {
            "text": model_result.text,
            "ai_processing": model_result.public_dict(),
        }

    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "Legacy Ask ContractX query failed."
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Legacy Ask ContractX reasoning failed.",
        ) from exc


# =====================================================================
# PLATFORM MODULE HEALTH
# =====================================================================
@app.get("/api/v1/platform/health")
async def platform_health():
    return {
        "status": "ok",
        "platform": "contractX.co",
        "version": "3.6.0",
        "modules": {
            "ask_contractx": {
                "status": "available",
                "endpoint": "/api/v1/ask-contractx/query",
                "legacy_endpoint": "/api/v1/agent/query"
            },
            "engine2": {
                "status": "available",
                "base_path": "/api/v1/engine2"
            },
            "engine3": {
                "status": "available",
                "base_path": "/api/v1/engine3"
            },
            "bespoke_review": {
                "status": "available",
                "endpoint": "/api/v1/contract-review/analyze"
            },
            "model_governance": {
                "status": "available",
                "base_path": "/api/v1/models",
                "approved_registry": True,
                "cost_controls": True,
                "models_per_provider": 1
            },
            "private_project_vault": {
                "status": "available",
                "base_path": "/api/v1/vault",
                "secure_storage": "project-documents",
                "customer_owned_data": True
            },
            "project_tasks": {
                "status": "available",
                "base_path": "/api/v1/tasks",
                "project_assignment": True,
                "pins": True,
                "notifications": True,
                "resolution_audit": True,
                "dashboard_ready": True
            },
            "portfolio": {
                "status": "available",
                "base_path": "/api/v1/portfolio",
                "multi_project": True,
                "task_rollup": True,
                "document_rollup": True,
                "project_user_rollup": True
            },
            "project_invitations": {
                "status": "available",
                "base_path": "/api/v1/project-invitations",
                "email_invites": True,
                "pending_acceptance": True
            }
        }
    }


# =====================================================================
# ENGINE 4: DOCUMENT INGESTION & VAULT STORE
# =====================================================================
@app.post("/api/v1/ingest/document")
async def ingest_document(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    project_id: str = Form(...),
    template_name: Optional[str] = Form(None),
    doc_type: str = Form("project_contract")
):
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extracted_text = await extract_text_from_bytes(file_bytes, file.filename)
    stored_doc_id = f"doc_{file.filename}_{tenant_id}"

    vault_entry = {
        "doc_id": stored_doc_id,
        "filename": file.filename,
        "template_name": template_name or file.filename,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "doc_type": doc_type,
        "character_count": len(extracted_text),
        "status": "INDEXED"
    }
    DOCUMENT_VAULT.append(vault_entry)

    return {
        "status": "success",
        "message": f"Successfully ingested '{file.filename}' into vault.",
        "doc_id": stored_doc_id,
        "character_count": len(extracted_text)
    }


# =====================================================================
# ENGINE 5: BESPOKE REVIEW (7-LAYER DETAILED LEGAL ANALYSIS)
# =====================================================================
@app.post("/api/v1/contract-review/analyze")
async def analyze_bespoke_contract(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    project_id: str = Form(...),
    jurisdiction: str = Form("uae_gcc"),
    primary_standard_body: Optional[str] = Form(None),
    primary_contract_family: Optional[str] = Form(None),
    primary_edition: Optional[str] = Form(None),
    primary_jurisdiction: Optional[str] = Form(None),
    supporting_references_json: Optional[str] = Form(None),
    stakeholder_role: Optional[str] = Form(None),
):
    file_bytes = await file.read()
    contract_text = await extract_text_from_bytes(
        file_bytes,
        file.filename,
    )

    if not contract_text or len(contract_text) < 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Could not extract text from uploaded file. "
                "Please provide a text-based PDF or DOCX."
            ),
        )

    primary_contract = None
    if any(
        [
            primary_standard_body,
            primary_contract_family,
            primary_edition,
            primary_jurisdiction,
        ]
    ):
        primary_contract = ReferenceSelection(
            standard_body=primary_standard_body,
            contract_family=primary_contract_family,
            edition=primary_edition,
            jurisdiction=primary_jurisdiction,
        )

    selected_references: List[ReferenceSelection] = []

    if supporting_references_json:
        try:
            raw_refs = json.loads(
                supporting_references_json
            )

            if not isinstance(
                raw_refs,
                list,
            ):
                raise ValueError(
                    "supporting_references_json must be a JSON array"
                )

            if len(
                raw_refs
            ) > 3:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "A maximum of 3 supporting Contract "
                        "Reference Library sources may be selected."
                    ),
                )

            selected_references = [
                ReferenceSelection(
                    **item
                )
                for item in raw_refs
            ]

        except HTTPException:
            raise

        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid supporting_references_json."
                ),
            ) from exc

    contract_context = retrieve_contract_context(
        query=(
            "Review this bespoke construction contract for "
            "risk allocation, time, delay, notices, payment, "
            "variation, claims, liability, termination and "
            "dispute provisions."
        ),
        primary_contract=primary_contract,
        selected_references=selected_references,
    )

    # retrieve_contract_context() returns a unified EvidenceSearchResult.
    # Split the actual returned items by source / authority role.
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

    def _source_text(item: Any) -> str:
        content = str(
            getattr(
                item,
                "content",
                "",
            )
            or ""
        ).strip()

        metadata = getattr(
            item,
            "metadata",
            {},
        ) or {}

        label_parts = [
            metadata.get("standard_body"),
            metadata.get("contract_family"),
            metadata.get("edition"),
            metadata.get("jurisdiction"),
            getattr(item, "reference", None),
        ]

        label = " | ".join(
            str(v)
            for v in label_parts
            if v
        )

        return (
            f"Reference: {label}\n"
            f"Content:\n{content[:3000]}"
        ).strip()

    primary_reference_context = "\n\n".join(
        _source_text(item)
        for item in primary_sources[:8]
    )

    supporting_reference_context = "\n\n".join(
        _source_text(item)
        for item in reference_sources[:12]
    )

    authority_instruction = f"""
You are contractX.co performing a 7-layer bespoke construction contract review.

SOURCE AUTHORITY

1. The uploaded bespoke/project contract is the primary project-specific
   contractual evidence for this review.

2. Particular Conditions, amendments, addenda and agreed modifications
   contained in the uploaded contract material override generic standard-form
   wording.

3. Selected Standard Contracts are comparison/reference sources unless the
   uploaded project contract evidence confirms incorporation.

4. Standard Contract material must never be presented as governing project
   obligations merely because it was selected.

5. Do not merge different editions, jurisdictions or contract families as
   though they form one contract.

6. If the uploaded contract differs from a selected Standard Contract,
   identify the deviation. Do not rewrite the project contract to fit the
   reference wording.

7. Do not invent missing project clauses, amendments, governing law, time bars,
   notice periods, remedies, liability terms or dispute procedures.

8. If a clause is absent or unclear, identify it as missing, ambiguous or
   requiring verification.

9. Be stakeholder-neutral. Do not automatically assume the Contractor,
   Employer, Consultant or any other stakeholder is correct.

10. This is AI-assisted decision support and not legal advice, expert opinion,
    contractual certification or a binding determination.

SELECTED STANDARD CONTRACTS
{primary_reference_context or ""}
{supporting_reference_context or ""}
{("No Standard Contract selected." if not primary_reference_context and not supporting_reference_context else "")}

JURISDICTION CONTEXT
{jurisdiction.upper()}

STAKEHOLDER CONTEXT
{stakeholder_role or "Not specified"}

STAKEHOLDER-NEUTRALITY RULE

The stakeholder context is metadata only. It may help explain terminology or
workflow relevance, but it must NOT change:
- the interpretation of the uploaded contract wording;
- the authority hierarchy;
- benchmark selection or comparison;
- risk grading;
- whether a condition is incorporated, missing, ambiguous or onerous;
- the substance of recommendations or suggested amendments.

Do not advocate for, optimise for, or strategically align the report to the
Employer, Contractor, Subcontractor, Consultant, Law Firm, Legal Counsel or any
other selected stakeholder. Produce an independent consultant-style review of
the contract itself.
""".strip()

    system_prompt = f"""
{authority_instruction}

Perform a comprehensive senior-consultant review of the uploaded bespoke
construction contract. Do not limit the review to seven topics. Review every
material contractual, commercial, procedural and project-management condition
that is supported by the uploaded wording and the selected Standard Contracts.

At a minimum, consider the following review dimensions where relevant:
1. CONTRACT_STRUCTURE_AUTHORITY_DEFINITIONS
2. SCOPE_OBLIGATIONS_AND_DESIGN_RESPONSIBILITY
3. TIME_PROGRAMME_MILESTONES_AND_EOT
4. NOTICES_CLAIMS_TIME_BARS_AND_RECORDS
5. VARIATIONS_CHANGE_CONTROL_AND_VALUATION
6. PAYMENT_CERTIFICATION_RETENTION_AND_SET_OFF
7. DELAY_DAMAGES_LIABILITY_AND_LIMITATIONS
8. INDEMNITY_INSURANCE_AND_RISK_ALLOCATION
9. QUALITY_HSE_COMPLIANCE_AND_APPROVALS
10. SUSPENSION_TERMINATION_AND_DEFAULT
11. DISPUTE_RESOLUTION_GOVERNING_LAW_AND_REMEDIES
12. CONTRACT_ADMINISTRATION_COMMUNICATIONS_AND_EVIDENCE

You may use an additional review area if a material condition does not fit the
above categories.

The output must read like a high-grade construction contract advisory report:
commercially practical, precise, independent and stakeholder-neutral, and
suitable for senior project, commercial, contract and legal review. The same
contract and reference inputs should produce materially the same findings and
risk grading regardless of the selected stakeholder context.

Return a valid JSON object with these top-level keys:
"metrics", "executive_summary", "review_coverage", and "findings".

"metrics":
{{
    "clauses_reviewed": <int>,
    "critical_findings": <int>,
    "high_risk_findings": <int>,
    "medium_risk_findings": <int>,
    "missing_provisions": <int>,
    "priority_amendments": <int>
}}

"executive_summary":
{{
    "overall_assessment": "Concise senior-advisory assessment of the contract's overall risk allocation, completeness and commercial operability.",
    "incorporated_conditions": [
        "Up to 12 material conditions that are clearly incorporated or adequately addressed in the uploaded contract."
    ],
    "missing_or_weak_conditions": [
        "Up to 12 material conditions that are absent, incomplete, unusually onerous, ambiguous or require strengthening."
    ],
    "priority_recommendations": [
        "Up to 10 prioritised actions for negotiation, amendment, clarification, administration or legal review."
    ],
    "conclusion": "Balanced concluding advisory statement describing the principal strengths, gaps, negotiation priorities and residual matters requiring project/legal verification."
}}

"review_coverage" must be an array. Each item must contain:
{{
    "review_area": "Review dimension / subject",
    "incorporated": "What the contract contains or addresses in this area.",
    "missing_or_weak": "What is missing, weak, ambiguous or unusually allocated, if anything.",
    "advisory_comment": "Practical senior-consultant observation and recommended focus."
}}

Each "findings" item must contain:
{{
    "review_layer": "Most relevant review dimension identifier",
    "review_area": "Human-readable review area / subject",
    "clause_ref": "Exact project clause number or 'Not identified'",
    "clause_title": "Descriptive title",
    "source_type": "CUSTOMER_CONTRACT",
    "benchmark_source": "Selected Standard Contract actually used",
    "status": "HIGH_RISK_DEVIATION" | "DEVIATION" | "AMBIGUOUS" | "MISSING" | "BENCHMARK_CONSISTENT",
    "risk_level": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    "contract_position": "What the uploaded project contract actually provides.",
    "benchmark_position": "What the selected reference or benchmark indicates, clearly identified as reference/benchmark material.",
    "deviation": "Precise comparison between project wording and the reference position.",
    "commercial_exposure": "Potential commercial, time, liability, procedural or claims consequence.",
    "recommendation": "Professional action or review recommendation, without overstating legal certainty.",
    "suggested_amendment": "Suggested drafting only where appropriate, expressly subject to legal and project review."
}}

Rules:
- Base project-contract statements only on the uploaded text.
- Do not cite clauses that are not present in the uploaded text or retrieved reference material.
- If no selected reference supports a benchmark statement, say that benchmark verification is required.
- Do not describe a selected benchmark as part of the project contract unless the uploaded contract verifies that.
- Avoid unsupported phrases such as "the Contract requires" when relying only on generic reference material.
- Distinguish clearly between conditions that are incorporated, conditions that are missing, and conditions that are incorporated but commercially onerous or ambiguous.
- Do not describe a provision as missing if the uploaded contract contains it in substance under another heading.
- Recommendations should identify the practical objective: retain, clarify, negotiate, amend, cap, extend, document, administer, verify or seek legal review.
- The executive summary must synthesise the whole review rather than merely repeat the findings.
- review_coverage should normally cover at least 8 material areas when the uploaded contract contains enough information.
""".strip()

    try:
        model_result = invoke_model_chat(
            tenant_id=tenant_id,
            project_id=project_id,
            capability="contract_review",
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": (
                        "UPLOADED BESPOKE / PROJECT CONTRACT CONTENT:\n\n"
                        + contract_text[:30000]
                    ),
                },
            ],
            response_format={
                "type": "json_object"
            },
            temperature=0.1,
            requested_output_tokens=6000,
        )

        parsed = json.loads(
            model_result.text
        )

        return {
            "status": "completed",
            "source": "AI Reasoning",
            "metrics": parsed.get(
                "metrics",
                ExecutiveMetrics().model_dump(),
            ),
            "executive_summary": parsed.get(
                "executive_summary",
                {},
            ),
            "review_coverage": parsed.get(
                "review_coverage",
                [],
            ),
            "findings": parsed.get(
                "findings",
                [],
            ),
            "ai_processing": model_result.public_dict(),
            "authority": {
                "primary_contract": (
                    primary_contract.model_dump()
                    if primary_contract
                    else None
                ),
                "selected_references": [
                    item.model_dump()
                    for item
                    in selected_references
                ],
                "primary_contract_source_count": len(
                    primary_sources
                ),
                "reference_source_count": len(
                    reference_sources
                ),
                "standard_contract_source_count": (
                    len(primary_sources)
                    + len(reference_sources)
                ),
                "hierarchy_note": (
                    "Uploaded project contract evidence takes precedence. "
                    "Selected Standard Contracts are comparison/reference "
                    "sources unless incorporation is verified."
                ),
            },
        }

    except Exception as exc:
        logger.exception(
            "Bespoke Review analysis failed."
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "Bespoke Review analysis failed."
            ),
        ) from exc


# =====================================================================
# ENGINE 6: CONSULTANT-GRADE PDF & DOCX EXPORT
# =====================================================================

def _clean_export_text(value: Any, fallback: str = "Not stated") -> str:
    text = str(value or "").strip()
    return text if text else fallback


def _risk_rank(value: Any) -> int:
    return {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}.get(
        str(value or "").upper(), 0
    )


def _export_metrics(findings: List[Dict[str, Any]], supplied: Optional[Dict[str, Any]]) -> Dict[str, int]:
    if supplied:
        return {
            "clauses_reviewed": int(supplied.get("clauses_reviewed") or len(findings)),
            "critical_findings": int(supplied.get("critical_findings") or 0),
            "high_risk_findings": int(supplied.get("high_risk_findings") or 0),
            "medium_risk_findings": int(supplied.get("medium_risk_findings") or 0),
            "missing_provisions": int(supplied.get("missing_provisions") or 0),
            "priority_amendments": int(supplied.get("priority_amendments") or 0),
        }
    return {
        "clauses_reviewed": len(findings),
        "critical_findings": sum(1 for x in findings if str(x.get("risk_level") or "").upper() == "CRITICAL"),
        "high_risk_findings": sum(1 for x in findings if str(x.get("risk_level") or "").upper() == "HIGH"),
        "medium_risk_findings": sum(1 for x in findings if str(x.get("risk_level") or "").upper() == "MEDIUM"),
        "missing_provisions": sum(1 for x in findings if str(x.get("status") or "").upper() == "MISSING"),
        "priority_amendments": sum(1 for x in findings if str(x.get("risk_level") or "").upper() in {"CRITICAL", "HIGH"}),
    }



def _summary_list(summary: Optional[Dict[str, Any]], key: str, limit: int = 12) -> List[str]:
    if not summary:
        return []
    raw = summary.get(key) or []
    if not isinstance(raw, list):
        return []
    return [str(item).strip() for item in raw if str(item or "").strip()][:limit]


def _fallback_summary(findings: List[Dict[str, Any]], metrics: Dict[str, int]) -> Dict[str, Any]:
    incorporated, missing, recommendations = [], [], []
    for item in findings:
        status_value = str(item.get("status") or "").upper()
        title = _clean_export_text(item.get("clause_title"), "Contract condition")
        clause = _clean_export_text(item.get("clause_ref"), "Not identified")
        risk = _clean_export_text(item.get("risk_level"), "N/A").upper()
        if status_value == "BENCHMARK_CONSISTENT":
            incorporated.append(f"{clause} - {title}")
        if status_value in {"MISSING","AMBIGUOUS","HIGH_RISK_DEVIATION","DEVIATION"}:
            missing.append(f"{clause} - {title}: {status_value.replace('_',' ').title()}")
        recommendation = str(item.get("recommendation") or "").strip()
        if recommendation and risk in {"CRITICAL","HIGH","MEDIUM"}:
            recommendations.append(f"{clause} - {title}: {recommendation}")
    return {
        "overall_assessment": (
            f"The review identified {metrics['critical_findings']} critical, "
            f"{metrics['high_risk_findings']} high-risk and {metrics['medium_risk_findings']} medium-risk findings across "
            f"{metrics['clauses_reviewed']} reviewed matters. {metrics['missing_provisions']} provisions were identified as missing."
        ),
        "incorporated_conditions": incorporated[:12],
        "missing_or_weak_conditions": missing[:12],
        "priority_recommendations": recommendations[:10],
        "conclusion": "The contract should be considered together with project-specific particulars, amendments, applicable law and the factual project record before negotiation, execution or reliance.",
    }


def _effective_summary(findings: List[Dict[str, Any]], metrics: Dict[str, int], supplied: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    result = _fallback_summary(findings, metrics)
    if supplied:
        for key in ("overall_assessment","incorporated_conditions","missing_or_weak_conditions","priority_recommendations","conclusion"):
            if supplied.get(key):
                result[key] = supplied.get(key)
    return result


def _effective_coverage(supplied: Optional[List[Dict[str, Any]]], findings: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    if supplied:
        rows=[]
        for item in supplied[:14]:
            if isinstance(item, dict):
                rows.append({
                    "review_area": _clean_export_text(item.get("review_area"), "Contract Review"),
                    "incorporated": _clean_export_text(item.get("incorporated"), "Not established from available wording"),
                    "missing_or_weak": _clean_export_text(item.get("missing_or_weak"), "No material gap specifically identified"),
                    "advisory_comment": _clean_export_text(item.get("advisory_comment"), "Verify against project requirements and executed contract particulars."),
                })
        if rows:
            return rows
    grouped={}
    for item in findings:
        area=_clean_export_text(item.get("review_area") or item.get("review_layer"), "Contract Review").replace("_"," ").title()
        bucket=grouped.setdefault(area,{"incorporated":[],"missing":[],"advisory":[]})
        status_value=str(item.get("status") or "").upper()
        title=_clean_export_text(item.get("clause_title"), "Condition")
        if status_value=="BENCHMARK_CONSISTENT": bucket["incorporated"].append(title)
        elif status_value in {"MISSING","AMBIGUOUS","HIGH_RISK_DEVIATION","DEVIATION"}: bucket["missing"].append(title)
        rec=str(item.get("recommendation") or "").strip()
        if rec: bucket["advisory"].append(rec)
    return [{
        "review_area": area,
        "incorporated": "; ".join(v["incorporated"][:3]) or "Review area addressed in part",
        "missing_or_weak": "; ".join(v["missing"][:3]) or "No material gap specifically identified",
        "advisory_comment": "; ".join(v["advisory"][:2]) or "Retain subject to project-specific verification",
    } for area,v in list(grouped.items())[:14]]


def _summary_table_rows(findings: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    return [{
        "clause": _clean_export_text(item.get("clause_ref"), "Not identified"),
        "topic": _clean_export_text(item.get("clause_title"), "Finding"),
        "status": _clean_export_text(item.get("status"), "N/A").replace("_"," ").title(),
        "risk": _clean_export_text(item.get("risk_level"), "N/A").upper(),
        "issue": _clean_export_text(item.get("deviation") or item.get("commercial_exposure"), "No material issue stated"),
        "recommendation": _clean_export_text(item.get("recommendation"), "Review required"),
    } for item in findings]


def _priority_findings(findings: List[Dict[str, Any]], limit: int = 5) -> List[Dict[str, Any]]:
    return sorted(
        findings,
        key=lambda x: (_risk_rank(x.get("risk_level")), str(x.get("status") or "").upper() == "MISSING"),
        reverse=True,
    )[:limit]


def _standard_contract_label(authority: Optional[Dict[str, Any]]) -> str:
    if not authority:
        return "Not recorded"
    selected: List[Dict[str, Any]] = []
    primary = authority.get("primary_contract")
    if isinstance(primary, dict):
        selected.append(primary)
    for item in authority.get("selected_references") or []:
        if isinstance(item, dict):
            selected.append(item)
    labels: List[str] = []
    for item in selected:
        parts = [
            str(item.get("standard_body") or "").strip(),
            str(item.get("contract_family") or "").replace("_", " ").strip(),
            str(item.get("edition") or "").strip(),
        ]
        label = " ".join(part for part in parts if part)
        if label and label not in labels:
            labels.append(label)
    return ", ".join(labels) if labels else "Not recorded"


def _risk_text_color(risk: str) -> str:
    return {
        "CRITICAL": "8B1E1E",
        "HIGH": "A0471D",
        "MEDIUM": "8A6517",
        "LOW": "2B6A52",
    }.get(str(risk or "").upper(), "475569")


def _set_docx_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def _set_docx_cell_margins(cell, value: int = 90) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin in ("top", "start", "bottom", "end"):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def _docx_label_value(doc: Document, label: str, value: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    a = p.add_run(f"{label}: ")
    a.bold = True
    a.font.name = "Arial"
    a.font.size = Pt(10)
    b = p.add_run(value)
    b.font.name = "Arial"
    b.font.size = Pt(10)


def _docx_finding(doc: Document, item: Dict[str, Any], index: int) -> None:
    risk = _clean_export_text(item.get("risk_level"), "N/A").upper()
    status_text = _clean_export_text(item.get("status"), "N/A").replace("_", " ")
    clause = _clean_export_text(item.get("clause_ref"), "Not identified")
    title = _clean_export_text(item.get("clause_title"), "Finding")
    layer = _clean_export_text(item.get("review_layer"), "7-Layer Review").replace("_", " ").title()

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(f"{index}. {clause} - {title}")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(12)
    r.font.color.rgb = RGBColor(40, 74, 122)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(7)
    r = p.add_run(f"{layer}  |  {risk}  |  {status_text}")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(100, 116, 139)

    fields = [
        ("Contract position", _clean_export_text(item.get("contract_position"))),
        ("Standard contract comparison", _clean_export_text(item.get("benchmark_position"))),
        ("Reference used", _clean_export_text(item.get("benchmark_source"), "Not identified")),
        ("Commercial / contractual exposure", _clean_export_text(item.get("commercial_exposure"))),
        ("Advisory recommendation", _clean_export_text(item.get("recommendation"))),
        ("Suggested amendment wording", _clean_export_text(item.get("suggested_amendment"))),
    ]
    for label, value in fields:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.left_indent = Inches(0.08)
        a = p.add_run(f"{label}: ")
        a.bold = True
        a.font.name = "Arial"
        a.font.size = Pt(10)
        b = p.add_run(value)
        b.font.name = "Arial"
        b.font.size = Pt(10)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("________________________________________________________________________________")
    r.font.name = "Arial"
    r.font.size = Pt(6)
    r.font.color.rgb = RGBColor(226, 232, 240)


def _build_docx_report(
    payload: ExportPayload,
    findings: List[Dict[str, Any]],
    metrics: Dict[str, int],
    summary: Dict[str, Any],
    coverage: List[Dict[str, str]],
) -> io.BytesIO:
    buffer = io.BytesIO()
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.62); section.bottom_margin = Inches(0.62)
    section.left_margin = Inches(0.68); section.right_margin = Inches(0.68)
    normal = doc.styles["Normal"]
    normal.font.name = "Arial"; normal.font.size = Pt(10)
    normal.paragraph_format.space_after = Pt(5); normal.paragraph_format.line_spacing = 1.08
    header = section.header.paragraphs[0]; header.text = "contractX.co  |  Bespoke Contract Advisory"; header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for run in header.runs: run.font.name="Arial"; run.font.size=Pt(8); run.font.color.rgb=RGBColor(100,116,139)
    footer = section.footer.paragraphs[0]; footer.text = "AI-assisted advisory output - subject to qualified professional review"; footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in footer.runs: run.font.name="Arial"; run.font.size=Pt(8); run.font.color.rgb=RGBColor(100,116,139)
    title=doc.add_paragraph(); run=title.add_run("BESPOKE CONTRACT ADVISORY REVIEW"); run.bold=True; run.font.name="Arial"; run.font.size=Pt(20); run.font.color.rgb=RGBColor(26,45,72)
    p=doc.add_paragraph(); p.paragraph_format.space_after=Pt(12); r=p.add_run("Comprehensive Contract, Commercial & Risk Assessment"); r.font.name="Arial"; r.font.size=Pt(11); r.font.color.rgb=RGBColor(88,100,116)
    context_table=doc.add_table(rows=4,cols=2); context_table.alignment=WD_TABLE_ALIGNMENT.CENTER; context_table.style="Table Grid"
    context_data=[("Project ID",payload.project_id),("Jurisdiction",payload.jurisdiction.upper()),("Stakeholder role",payload.stakeholder_role or "Not specified"),("Standard contracts reviewed",_standard_contract_label(payload.authority))]
    for row_idx,(label,value) in enumerate(context_data):
        left=context_table.cell(row_idx,0); right=context_table.cell(row_idx,1); left.text=label; right.text=value; _set_docx_cell_shading(left,"EEF2F6")
        for cell in (left,right):
            _set_docx_cell_margins(cell); cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for para in cell.paragraphs:
                for rr in para.runs: rr.font.name="Arial"; rr.font.size=Pt(9)
        left.paragraphs[0].runs[0].bold=True
    doc.add_paragraph()
    def heading(text,size=14):
        p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(8); r=p.add_run(text); r.bold=True; r.font.name="Arial"; r.font.size=Pt(size); r.font.color.rgb=RGBColor(26,45,72)
    heading("1. Executive Summary"); doc.add_paragraph(_clean_export_text(summary.get("overall_assessment")))
    metrics_table=doc.add_table(rows=2,cols=6); metrics_table.alignment=WD_TABLE_ALIGNMENT.CENTER; metrics_table.style="Table Grid"
    labels=["Reviewed","Critical","High","Medium","Missing","Priority"]; values=[metrics["clauses_reviewed"],metrics["critical_findings"],metrics["high_risk_findings"],metrics["medium_risk_findings"],metrics["missing_provisions"],metrics["priority_amendments"]]
    for col,label in enumerate(labels):
        c1=metrics_table.cell(0,col); c2=metrics_table.cell(1,col); c1.text=label; c2.text=str(values[col]); _set_docx_cell_shading(c1,"1A2D48")
        for c in (c1,c2): _set_docx_cell_margins(c,65,55,65,55); c.paragraphs[0].alignment=WD_ALIGN_PARAGRAPH.CENTER
        for rr in c1.paragraphs[0].runs: rr.bold=True; rr.font.name="Arial"; rr.font.size=Pt(8); rr.font.color.rgb=RGBColor(255,255,255)
        for rr in c2.paragraphs[0].runs: rr.bold=True; rr.font.name="Arial"; rr.font.size=Pt(10)
    def bullet_section(title_text,items):
        heading(title_text); use_items=items or ["No specific item established from the available review output."]
        for item in use_items:
            p=doc.add_paragraph(); p.paragraph_format.left_indent=Inches(0.16); p.paragraph_format.first_line_indent=Inches(-0.13); p.paragraph_format.space_after=Pt(4); rr=p.add_run(f"â€¢ {item}"); rr.font.name="Arial"; rr.font.size=Pt(9.5)
    bullet_section("2. Conditions Incorporated / Adequately Addressed",_summary_list(summary,"incorporated_conditions"))
    bullet_section("3. Missing, Weak or Onerous Conditions",_summary_list(summary,"missing_or_weak_conditions"))
    bullet_section("4. Priority Recommendations",_summary_list(summary,"priority_recommendations",10))
    heading("5. Contract Review Coverage")
    coverage_table=doc.add_table(rows=1,cols=4); coverage_table.alignment=WD_TABLE_ALIGNMENT.CENTER; coverage_table.style="Table Grid"
    headers=["Review Area","Incorporated / Addressed","Missing / Weak","Advisory Review"]
    for col,h in enumerate(headers):
        cell=coverage_table.rows[0].cells[col]; cell.text=h; _set_docx_cell_shading(cell,"1A2D48")
        for rr in cell.paragraphs[0].runs: rr.bold=True; rr.font.name="Arial"; rr.font.size=Pt(8); rr.font.color.rgb=RGBColor(255,255,255)
    for item in coverage:
        row=coverage_table.add_row().cells; vals=[item["review_area"],item["incorporated"],item["missing_or_weak"],item["advisory_comment"]]
        for col,value in enumerate(vals):
            row[col].text=value; _set_docx_cell_margins(row[col],60,55,60,55); row[col].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP
            for para in row[col].paragraphs:
                for rr in para.runs: rr.font.name="Arial"; rr.font.size=Pt(8.1)
    doc.add_page_break(); heading("6. Contract Review Summary Table",15)
    summary_table=doc.add_table(rows=1,cols=6); summary_table.alignment=WD_TABLE_ALIGNMENT.CENTER; summary_table.style="Table Grid"
    headers=["Clause","Condition","Status","Risk","Key Review","Recommendation"]
    for col,h in enumerate(headers):
        cell=summary_table.rows[0].cells[col]; cell.text=h; _set_docx_cell_shading(cell,"152238")
        for rr in cell.paragraphs[0].runs: rr.bold=True; rr.font.name="Arial"; rr.font.size=Pt(7.3); rr.font.color.rgb=RGBColor(255,255,255)
    for item in _summary_table_rows(findings):
        row=summary_table.add_row().cells; vals=[item["clause"],item["topic"],item["status"],item["risk"],item["issue"],item["recommendation"]]
        for col,value in enumerate(vals):
            row[col].text=value; _set_docx_cell_margins(row[col],45,42,45,42); row[col].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP
            for para in row[col].paragraphs:
                for rr in para.runs: rr.font.name="Arial"; rr.font.size=Pt(7.2)
        for rr in row[3].paragraphs[0].runs:
            rr.bold=True; rgb=_risk_text_color(item["risk"].upper()); rr.font.color.rgb=RGBColor(int(rgb[0:2],16),int(rgb[2:4],16),int(rgb[4:6],16))
    doc.add_page_break(); heading("7. Detailed Contract Review",16)
    for idx,item in enumerate(findings,1): _docx_finding(doc, item, idx)
    heading("8. Conclusion & Recommended Next Actions"); doc.add_paragraph(_clean_export_text(summary.get("conclusion")))
    for item in _summary_list(summary,"priority_recommendations",6):
        p=doc.add_paragraph(); p.paragraph_format.left_indent=Inches(0.16); p.paragraph_format.first_line_indent=Inches(-0.13); rr=p.add_run(f"â€¢ {item}"); rr.font.name="Arial"; rr.font.size=Pt(9.5)
    heading("Professional Reliance Note",11); doc.add_paragraph("This report is AI-assisted contractual and commercial decision support. It is not legal advice, certification, expert opinion or a binding contractual determination. Findings, benchmark comparisons and proposed wording should be verified against the executed contract, project-specific amendments, applicable law and the factual project record.")
    doc.save(buffer); buffer.seek(0); return buffer


def _pdf_header_footer(canvas, doc) -> None:
    canvas.saveState(); width,height=A4
    canvas.setStrokeColor(colors.HexColor("#D7DEE7")); canvas.setLineWidth(0.5); canvas.line(doc.leftMargin,height-30,width-doc.rightMargin,height-30)
    canvas.setFont("Helvetica",8); canvas.setFillColor(colors.HexColor("#64748B")); canvas.drawString(doc.leftMargin,height-23,"contractX.co | Bespoke Contract Review"); canvas.drawRightString(width-doc.rightMargin,20,f"Page {doc.page}")
    canvas.setFont("Helvetica",7.5); canvas.drawString(doc.leftMargin,20,"AI-assisted advisory output - subject to qualified professional review")
    canvas.restoreState()


def _pdf_finding_block(
    item: Dict[str, Any],
    index: int,
    styles: Dict[str, ParagraphStyle],
) -> List[Any]:
    risk = _clean_export_text(
        item.get("risk_level"),
        "N/A",
    ).upper()
    status_text = _clean_export_text(
        item.get("status"),
        "N/A",
    ).replace("_", " ")

    clause = _clean_export_text(
        item.get("clause_ref"),
        "Not identified",
    )
    title = _clean_export_text(
        item.get("clause_title"),
        "Finding",
    )
    layer = _clean_export_text(
        item.get("review_area")
        or item.get("review_layer"),
        "Contract Review",
    ).replace("_", " ").title()

    risk_hex = _risk_text_color(risk)

    elements: List[Any] = [
        Paragraph(
            f"<b>{index}. {clause} - {title}</b>",
            styles["FindingTitle"],
        ),
        Paragraph(
            (
                f"{layer} &nbsp;&nbsp;|&nbsp;&nbsp; "
                f"<font color='#{risk_hex}'><b>{risk}</b></font>"
                f" &nbsp;&nbsp;|&nbsp;&nbsp; {status_text}"
            ),
            styles["FindingMeta"],
        ),
    ]

    fields = [
        (
            "Contract position",
            _clean_export_text(
                item.get("contract_position")
            ),
        ),
        (
            "Standard contract comparison",
            _clean_export_text(
                item.get("benchmark_position")
            ),
        ),
        (
            "Reference used",
            _clean_export_text(
                item.get("benchmark_source"),
                "Not identified",
            ),
        ),
        (
            "Commercial / contractual exposure",
            _clean_export_text(
                item.get("commercial_exposure")
            ),
        ),
        (
            "Advisory recommendation",
            _clean_export_text(
                item.get("recommendation")
            ),
        ),
        (
            "Suggested amendment wording",
            _clean_export_text(
                item.get("suggested_amendment")
            ),
        ),
    ]

    for label, value in fields:
        elements.append(
            Paragraph(
                f"<b>{label}:</b> {value}",
                styles["Body"],
            )
        )

    elements.extend(
        [
            Spacer(1, 4),
            Table(
                [[""]],
                colWidths=[487],
                rowHeights=[1],
                style=TableStyle(
                    [
                        (
                            "LINEBELOW",
                            (0, 0),
                            (-1, -1),
                            0.45,
                            colors.HexColor("#E2E8F0"),
                        )
                    ]
                ),
            ),
            Spacer(1, 8),
        ]
    )

    return elements


def _build_pdf_report(payload: ExportPayload, findings: List[Dict[str, Any]], metrics: Dict[str, int], summary: Dict[str, Any], coverage: List[Dict[str, str]]) -> io.BytesIO:
    buffer=io.BytesIO(); doc=SimpleDocTemplate(buffer,pagesize=A4,rightMargin=36,leftMargin=36,topMargin=48,bottomMargin=38,title="ContractX Bespoke Contract Advisory Review",author="contractX.co")
    base=getSampleStyleSheet(); styles={
        "Title":ParagraphStyle("CxTitle",parent=base["Title"],fontName="Helvetica-Bold",fontSize=20,leading=24,textColor=colors.HexColor("#1A2D48"),alignment=TA_LEFT,spaceAfter=3),
        "Subtitle":ParagraphStyle("CxSubtitle",parent=base["Normal"],fontName="Helvetica",fontSize=10.5,leading=14,textColor=colors.HexColor("#586474"),spaceAfter=12),
        "H2":ParagraphStyle("CxH2",parent=base["Heading2"],fontName="Helvetica-Bold",fontSize=13,leading=17,textColor=colors.HexColor("#1A2D48"),spaceBefore=8,spaceAfter=6),
        "Body":ParagraphStyle("CxBody",parent=base["BodyText"],fontName="Helvetica",fontSize=9.5,leading=13,textColor=colors.HexColor("#1F2937"),spaceAfter=5),
        "Small":ParagraphStyle("CxSmall",parent=base["BodyText"],fontName="Helvetica",fontSize=8,leading=10.5,textColor=colors.HexColor("#475569"),spaceAfter=3),
        "Table":ParagraphStyle("CxTable",parent=base["BodyText"],fontName="Helvetica",fontSize=7,leading=8.8,textColor=colors.HexColor("#1F2937")),
        "TableHead":ParagraphStyle("CxTableHead",parent=base["BodyText"],fontName="Helvetica-Bold",fontSize=7,leading=8.5,textColor=colors.white),
        "FindingTitle":ParagraphStyle("CxFindingTitle",parent=base["Heading3"],fontName="Helvetica-Bold",fontSize=11.3,leading=14.5,textColor=colors.HexColor("#284A7A"),spaceAfter=3),
        "FindingMeta":ParagraphStyle("CxFindingMeta",parent=base["BodyText"],fontName="Helvetica",fontSize=8.2,leading=10.5,textColor=colors.HexColor("#64748B"),spaceAfter=5),
    }
    story=[Paragraph("BESPOKE CONTRACT ADVISORY REVIEW",styles["Title"]),Paragraph("Comprehensive Contract, Commercial & Risk Assessment",styles["Subtitle"])]
    context_data=[[Paragraph("<b>Project ID</b>",styles["Small"]),Paragraph(_clean_export_text(payload.project_id),styles["Small"])],[Paragraph("<b>Jurisdiction</b>",styles["Small"]),Paragraph(payload.jurisdiction.upper(),styles["Small"])],[Paragraph("<b>Stakeholder role</b>",styles["Small"]),Paragraph(payload.stakeholder_role or "Not specified",styles["Small"])],[Paragraph("<b>Standard contracts reviewed</b>",styles["Small"]),Paragraph(_standard_contract_label(payload.authority),styles["Small"])]]
    context=Table(context_data,colWidths=[115,372],hAlign="LEFT"); context.setStyle(TableStyle([("BACKGROUND",(0,0),(0,-1),colors.HexColor("#EEF2F6")),("BOX",(0,0),(-1,-1),0.5,colors.HexColor("#D7DEE7")),("INNERGRID",(0,0),(-1,-1),0.35,colors.HexColor("#E2E8F0")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5)])); story += [context,Spacer(1,10)]
    story += [Paragraph("1. Executive Summary",styles["H2"]),Paragraph(_clean_export_text(summary.get("overall_assessment")),styles["Body"])]
    labels=["Reviewed","Critical","High","Medium","Missing","Priority"]; values=[metrics["clauses_reviewed"],metrics["critical_findings"],metrics["high_risk_findings"],metrics["medium_risk_findings"],metrics["missing_provisions"],metrics["priority_amendments"]]
    mt=Table([[Paragraph(f"<b>{x}</b>",styles["TableHead"]) for x in labels],[Paragraph(f"<b>{x}</b>",styles["Body"]) for x in values]],colWidths=[81]*6,hAlign="LEFT"); mt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#1A2D48")),("ALIGN",(0,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("BOX",(0,0),(-1,-1),0.45,colors.HexColor("#D7DEE7")),("INNERGRID",(0,0),(-1,-1),0.3,colors.HexColor("#E2E8F0")),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5)])); story += [mt,Spacer(1,9)]
    for title,key,limit in [("2. Conditions Incorporated / Adequately Addressed","incorporated_conditions",12),("3. Missing, Weak or Onerous Conditions","missing_or_weak_conditions",12),("4. Priority Recommendations","priority_recommendations",10)]:
        story.append(Paragraph(title,styles["H2"])); items=_summary_list(summary,key,limit) or ["No specific item established from the available review output."]
        for item in items: story.append(Paragraph(f"â€¢ {item}",styles["Body"]))
    story.append(Paragraph("5. Contract Review Coverage",styles["H2"])); cd=[[Paragraph("Review Area",styles["TableHead"]),Paragraph("Incorporated / Addressed",styles["TableHead"]),Paragraph("Missing / Weak",styles["TableHead"]),Paragraph("Advisory Review",styles["TableHead"])]]
    for item in coverage: cd.append([Paragraph(item["review_area"],styles["Table"]),Paragraph(item["incorporated"],styles["Table"]),Paragraph(item["missing_or_weak"],styles["Table"]),Paragraph(item["advisory_comment"],styles["Table"])])
    ct=Table(cd,colWidths=[92,126,126,143],repeatRows=1,hAlign="LEFT"); ct.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#1A2D48")),("BOX",(0,0),(-1,-1),0.45,colors.HexColor("#CBD5E1")),("INNERGRID",(0,0),(-1,-1),0.3,colors.HexColor("#DCE3EA")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)])); story += [ct,PageBreak(),Paragraph("6. Contract Review Summary Table",styles["H2"])]
    td=[[Paragraph("Clause",styles["TableHead"]),Paragraph("Condition",styles["TableHead"]),Paragraph("Status",styles["TableHead"]),Paragraph("Risk",styles["TableHead"]),Paragraph("Key Review",styles["TableHead"]),Paragraph("Recommendation",styles["TableHead"])]]
    for item in _summary_table_rows(findings): td.append([Paragraph(item["clause"],styles["Table"]),Paragraph(item["topic"],styles["Table"]),Paragraph(item["status"],styles["Table"]),Paragraph(f"<b>{item['risk']}</b>",styles["Table"]),Paragraph(item["issue"],styles["Table"]),Paragraph(item["recommendation"],styles["Table"])])
    st=Table(td,colWidths=[40,83,63,43,128,130],repeatRows=1,hAlign="LEFT"); st.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#152238")),("BOX",(0,0),(-1,-1),0.45,colors.HexColor("#CBD5E1")),("INNERGRID",(0,0),(-1,-1),0.3,colors.HexColor("#DCE3EA")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),3.5),("RIGHTPADDING",(0,0),(-1,-1),3.5),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#F8FAFC")]) ])); story += [st,PageBreak(),Paragraph("7. Detailed Contract Review",styles["H2"])]
    for idx,item in enumerate(findings,1): story.extend(_pdf_finding_block(item,idx,styles))
    story += [Paragraph("8. Conclusion & Recommended Next Actions",styles["H2"]),Paragraph(_clean_export_text(summary.get("conclusion")),styles["Body"])]
    for item in _summary_list(summary,"priority_recommendations",6): story.append(Paragraph(f"â€¢ {item}",styles["Body"]))
    story += [Spacer(1,6),Paragraph("Professional Reliance Note",styles["H2"]),Paragraph("This report is AI-assisted contractual and commercial decision support. It is not legal advice, certification, expert opinion or a binding contractual determination. Findings, benchmark comparisons and proposed wording should be verified against the executed contract, project-specific amendments, applicable law and the factual project record.",styles["Body"])]
    doc.build(story,onFirstPage=_pdf_header_footer,onLaterPages=_pdf_header_footer); buffer.seek(0); return buffer


@app.post("/api/v1/contract-review/export")
async def export_contract_review(payload: ExportPayload):
    try:
        findings = payload.findings or []
        metrics = _export_metrics(findings, payload.metrics)
        summary = _effective_summary(findings, metrics, payload.executive_summary)
        coverage = _effective_coverage(payload.review_coverage, findings)
        filename = f"ContractX_Bespoke_Review_{payload.project_id[:8]}"

        if payload.format.lower() == "docx":
            buffer = _build_docx_report(payload, findings, metrics, summary, coverage)
            return StreamingResponse(
                buffer,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'},
            )

        buffer = _build_pdf_report(payload, findings, metrics, summary, coverage)
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
        )
    except Exception as exc:
        logger.exception("Bespoke Review export generation failed.")
        raise HTTPException(
            status_code=500,
            detail="Bespoke Review export generation failed.",
        ) from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.retrieval_engine:app", host="127.0.0.1", port=8000, reload=True)
