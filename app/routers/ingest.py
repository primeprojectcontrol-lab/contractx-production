import io
import json
import hashlib
from typing import Dict, Any, Optional
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from pydantic import BaseModel, Field
import pypdf

from app.retrieval_engine import supabase_client, openai_client, get_embedding, authenticate_user

router = APIRouter(prefix="/api/v1/ingest", tags=["Document Ingestion Pipeline"])

@router.post("/document")
async def ingest_project_document(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    project_id: str = Form(...),
    stakeholder_tier: str = Form(...), # 'EMPLOYER_CLIENT' or 'SUBCONTRACTOR'
    flow_direction: str = Form(...),   # 'INCOMING' or 'OUTGOING'
    document_category: str = Form(...), # 'CLIENT_CORRESPONDENCE', 'SUBCONTRACTOR_CORRESPONDENCE', etc.
    user_context: Dict[str, Any] = Depends(authenticate_user)
):
    """
    Production Document Ingestion Pipeline:
    1. Read & SHA-256 Hash File (Prevent Duplicate Ingestion)
    2. Extract Plain Text (PyPDF / Text)
    3. Metadata Extraction via GPT-4o
    4. Text Chunking (1000 char windows, 150 overlap)
    5. Vector Embedding generation (text-embedding-3-large)
    6. Relational Insert into Supabase (project_documents & project_chunks)
    """
    file_bytes = await file.read()
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    
    # 1. Duplicate Detection Check
    existing = supabase_client.table("project_documents")\
        .select("id")\
        .eq("tenant_id", tenant_id)\
        .eq("file_hash", file_hash)\
        .execute()
        
    if existing.data:
        raise HTTPException(status_code=400, detail="Document with identical content already ingested.")

    # 2. Text Extraction
    extracted_text = ""
    if file.filename.endswith(".pdf"):
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            extracted_text += (page.extract_text() or "") + "\n"
    else:
        extracted_text = file_bytes.decode("utf-8", errors="ignore")

    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from uploaded document.")

    # 3. LLM Metadata Auto-Extraction
    meta_prompt = (
        "Extract key formal correspondence metadata from the construction document snippet below.\n"
        "Return JSON matching key names: letter_reference_no, subject_heading, sender_entity, "
        "recipient_entity, date_sent, is_formal_notice, governing_clause_ref."
    )
    
    meta_res = openai_client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": meta_prompt},
            {"role": "user", "content": extracted_text[:2500]}
        ],
        temperature=0.0
    )
    
    parsed_meta = json.loads(meta_res.choices[0].message.content)

    # 4. Insert Master Document Record into Supabase
    doc_payload = {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "file_name": file.filename,
        "storage_path": f"{tenant_id}/{project_id}/{file.filename}",
        "file_hash": file_hash,
        "file_size_bytes": len(file_bytes),
        "document_category": document_category,
        "stakeholder_tier": stakeholder_tier,
        "flow_direction": flow_direction,
        "letter_reference_no": parsed_meta.get("letter_reference_no"),
        "subject_heading": parsed_meta.get("subject_heading"),
        "sender_entity": parsed_meta.get("sender_entity", "UNKNOWN"),
        "recipient_entity": parsed_meta.get("recipient_entity", "UNKNOWN"),
        "date_sent": parsed_meta.get("date_sent"),
        "is_formal_notice": parsed_meta.get("is_formal_notice", False),
        "governing_clause_ref": parsed_meta.get("governing_clause_ref")
    }

    doc_insert = supabase_client.table("project_documents").insert(doc_payload).execute()
    document_id = doc_insert.data[0]["id"]

    # 5. Chunking & Vector Ingestion
    chunk_size = 1000
    overlap = 150
    chunks = []
    
    for i in range(0, len(extracted_text), chunk_size - overlap):
        chunk_str = extracted_text[i:i + chunk_size]
        if len(chunk_str.strip()) > 30:
            chunks.append(chunk_str)

    chunk_records = []
    for idx, chunk_text in enumerate(chunks):
        embedding_vec = get_embedding(chunk_text)
        
        chunk_records.append({
            "document_id": document_id,
            "tenant_id": tenant_id,
            "project_id": project_id,
            "chunk_index": idx,
            "content": chunk_text,
            "stakeholder_tier": stakeholder_tier,
            "flow_direction": flow_direction,
            "document_category": document_category,
            "letter_reference_no": parsed_meta.get("letter_reference_no"),
            "event_date": parsed_meta.get("date_sent"),
            "clause_number": parsed_meta.get("governing_clause_ref"),
            "embedding": embedding_vec
        })

    # Batch Insert Chunks into Supabase
    supabase_client.table("project_chunks").insert(chunk_records).execute()

    return {
        "status": "SUCCESS",
        "document_id": document_id,
        "filename": file.filename,
        "chunks_ingested": len(chunk_records),
        "extracted_metadata": parsed_meta
    }