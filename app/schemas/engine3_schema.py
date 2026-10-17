# app/schemas/engine3_schema.py

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class CategorySelectors(BaseModel):
    delay_event_name: str = Field(..., description="e.g., Delay in Site Access Zone B")
    delay_category: str = Field(..., description="EMPLOYER_PREVENTION | FORCE_MAJEURE | UNFORESEEN_SITE | VARIATION")
    
    # Multi-Source Evidence Vault
    notice_file_ids: List[str] = Field(default=[], description="Selected initial notice file IDs")
    weekly_report_folder_ids: List[str] = Field(default=[], description="Selected weekly progress report IDs")
    monthly_report_folder_ids: List[str] = Field(default=[], description="Selected monthly progress report IDs")
    contract_doc_ids: List[str] = Field(default=[], description="Selected active project contract document IDs in Qdrant")
    
    # Engine 2 Analytical Selection
    cpm_analysis_type: str = Field("AS_PLANNED_VS_AS_BUILT", description="AS_PLANNED_VS_AS_BUILT | WINDOW_ANALYSIS | TIA")
    engine2_analysis_id: str = Field(..., description="Linked Engine 2 calculation output ID")


class DraftNoticePayload(BaseModel):
    tenant_id: str
    project_id: str
    selectors: CategorySelectors
    
    notice_type: str = Field(
        "NOTICE_OF_CLAIM", 
        description="NOTICE_OF_CLAIM | NOTICE_OF_TIMEBAR | LETTER_RESPONSE_TO_CLAIM | REPLY_TO_CLAIM_REJECTION | RESERVATION_OF_RIGHTS"
    )
    client_stance: str = Field("CLAIMANT", description="CLAIMANT | DEFENDANT")
    
    # Vector Retrieval Prompt / Clause Reference
    clause_target: Optional[str] = Field(
        None, 
        description="Clause reference or search query. If empty or generic, Qdrant retrieves top relevant contract clauses automatically."
    )
    custom_prompt: Optional[str] = Field(None, description="Prompt refractor box for specific tone or arguments")