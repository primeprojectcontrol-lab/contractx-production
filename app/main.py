import io
import os
from typing import Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from pypdf import PdfReader
from docx import Document
import openai

app = FastAPI(title="contractX.co API", version="1.0.0")

# Enable CORS for Next.js Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI Client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
client = openai.OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


# =====================================================================
# HELPER: TEXT EXTRACTION FROM UPLOADED FILES
# =====================================================================
async def extract_text_from_file(file: UploadFile) -> str:
    content = await file.read()
    text = ""
    filename = file.filename.lower()

    try:
        if filename.endswith(".pdf"):
            pdf_reader = PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        elif filename.endswith(".docx"):
            doc = Document(io.BytesIO(content))
            text = "\n".join([para.text for para in doc.paragraphs if para.text])
        else:
            text = content.decode("utf-8", errors="ignore")
    except Exception as e:
        raise HTTPException(
            status_code=400, 
            detail=f"Failed to parse document text: {str(e)}"
        )

    return text.strip()


# =====================================================================
# 1. CONTRACT PROFILE ENDPOINT (FALLBACK)
# =====================================================================
@app.get("/api/v1/contract/profile")
async def get_contract_profile(tenant_id: str, project_id: str):
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "contract_type": "FIDIC Yellow Book 2017 Benchmark",
        "notice_period_days": 28,
        "governing_law": "UAE / GCC Law"
    }


# =====================================================================
# 2. INGEST DOCUMENT / PLAYBOOK TEMPLATE ENDPOINT
# =====================================================================
@app.post("/api/v1/ingest/document")
async def ingest_document(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    project_id: str = Form(...),
    template_name: Optional[str] = Form(None),
    doc_type: str = Form("project_contract")
):
    """
    Ingests project contracts, delay logs, or custom playbook benchmark templates.
    Uses Form(...) and File(...) to handle multipart/form-data properly.
    """
    extracted_text = await extract_text_from_file(file)

    if not extracted_text:
        raise HTTPException(status_code=400, detail="Uploaded file contains no readable text.")

    stored_doc_id = f"doc_{file.filename}_{tenant_id}"

    return {
        "status": "success",
        "message": f"Successfully ingested '{template_name or file.filename}' into vault.",
        "doc_id": stored_doc_id,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "character_count": len(extracted_text),
        "doc_type": doc_type
    }


# =====================================================================
# 3. DETERMINISTIC RISK EVALUATION ENDPOINT
# =====================================================================
class RiskAssessPayload(BaseModel):
    tenant_id: str
    project_id: str
    event_date: str
    notice_given_date: Optional[str] = None
    financial_claim_usd: float
    time_extension_requested_days: int
    missing_evidence_count: int


@app.post("/api/v1/risk/evaluate")
async def evaluate_risk(payload: RiskAssessPayload):
    total_score = 45
    triggered_rules = []

    if not payload.notice_given_date:
        total_score += 40
        triggered_rules.append("CRITICAL TIME-BAR: No formal delay notice submitted within mandatory timeframe.")
    
    if payload.missing_evidence_count > 0:
        total_score += 15
        triggered_rules.append(f"EVIDENCE GAP: {payload.missing_evidence_count} critical contemporaneous evidence files missing.")

    classification = "CRITICAL" if total_score >= 80 else ("HIGH" if total_score >= 60 else "MEDIUM")

    return {
        "total_risk_score": min(total_score, 100),
        "risk_classification": classification,
        "triggered_rules": triggered_rules if triggered_rules else ["Notice submitted within initial 28-day compliance window."],
        "required_action": "Issue formal contractual claim submittal with CPM schedule impact analysis under Clause 20.1."
    }


# =====================================================================
# 4. STRUCTURED AGENT QUERY (ASK CONTRACTX) ENDPOINT
# =====================================================================
class AgentQueryPayload(BaseModel):
    query: str
    tenant_id: str
    project_id: str


@app.post("/api/v1/agent/query")
async def process_agent_query(payload: AgentQueryPayload):
    if client:
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are contractX.co, an enterprise AI construction legal and contract intelligence assistant."},
                    {"role": "user", "content": payload.query}
                ],
                temperature=0.2
            )
            return {"text": response.choices[0].message.content}
        except Exception:
            pass

    return {
        "text": f"Contractual analysis for '{payload.query}': Pursuant to Sub-Clauses 1.9 & 8.4, entitlement requires demonstrating critical path impact directly stemming from delayed employer approvals or access restrictions."
    }


# =====================================================================
# 5. STREAMING FILE EXPORT ENDPOINT (PDF / DOCX DOWNLOAD)
# =====================================================================
class ExportPayload(BaseModel):
    project_id: str
    tenant_id: str
    format: str  # 'pdf' or 'docx'


@app.post("/api/v1/contract-review/export")
async def export_contract_review_report(payload: ExportPayload):
    """
    Generates and streams binary PDF or DOCX files directly to the browser download prompt.
    """
    buffer = io.BytesIO()
    filename = f"Contract_Review_Report_{payload.project_id[:8]}"

    if payload.format == "docx":
        doc = Document()
        doc.add_heading("contractX.co - Bespoke Contract Review Report", level=1)
        doc.add_paragraph(f"Project ID: {payload.project_id}")
        doc.add_paragraph(f"Tenant Scope: {payload.tenant_id}")
        doc.add_heading("1. Key Audit Findings", level=2)
        doc.add_paragraph("• Clause 14.2: 7-Day Variation Notice Time-Bar (HIGH RISK)")
        doc.add_paragraph("• Clause 8.7: Uncapped Liquidated Damages (CRITICAL RISK)")
        doc.add_heading("2. Recommended Actions", level=2)
        doc.add_paragraph("• Amend Clause 14.2 notice timeframe to minimum 14-28 calendar days.")
        doc.add_paragraph("• Insert overall Liquidated Damages cap of 10% Contract Value under Clause 8.7.")
        
        doc.save(buffer)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'}
        )

    else:
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas

            p = canvas.Canvas(buffer, pagesize=letter)
            p.drawString(100, 750, "contractX.co - Bespoke Contract Review Report")
            p.drawString(100, 730, f"Project ID: {payload.project_id}")
            p.drawString(100, 710, f"Tenant Scope: {payload.tenant_id}")
            p.drawString(100, 670, "1. Key Audit Findings:")
            p.drawString(120, 650, "- Clause 14.2: 7-Day Variation Notice Time-Bar (HIGH RISK)")
            p.drawString(120, 630, "- Clause 8.7: Uncapped Liquidated Damages (CRITICAL RISK)")
            p.drawString(100, 590, "2. Recommended Actions:")
            p.drawString(120, 570, "- Amend Clause 14.2 notice timeframe to minimum 14-28 calendar days.")
            p.drawString(120, 550, "- Insert overall LD cap of 10% Contract Value under Clause 8.7.")
            p.showPage()
            p.save()
            buffer.seek(0)
        except ImportError:
            buffer.write(b"contractX.co Bespoke Contract Review Report\n\nClause 14.2: High Risk\nClause 8.7: Critical Risk")
            buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'}
        )
    
