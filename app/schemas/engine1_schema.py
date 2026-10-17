# app/schemas/engine1_schema.py
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class ApplicableClause(BaseModel):
    clause_number: str
    clause_title: str
    relevance: str

class ReferenceBasisItem(BaseModel):
    framework: str
    sub_clause: str
    scl_protocol_ref: Optional[str] = None

class ProjectEvidenceItem(BaseModel):
    document_name: str
    page: Optional[int] = None
    date: Optional[str] = None
    source_type: str  # "PROJECT_EVIDENCE", "PROJECT_CONTRACT", etc.

class ScheduleFindings(BaseModel):
    engine2_analysis_id: str
    critical_path_slippage_days: float
    delay_driver_activity: str
    total_float_remaining: float
    concurrency_status: str

class PotentialEntitlement(BaseModel):
    eot_entitlement_days: float
    prolongation_cost_claimable: bool
    delay_damages_exposure: str

class ProvenanceSource(BaseModel):
    source: str  # "REFERENCE", "PROJECT_CONTRACT", "PROJECT_EVIDENCE", "SCHEDULE"
    ref: str

class AskContractXResponse(BaseModel):
    finding_id: str
    contractx_finding: str
    applicable_contract_clauses: List[ApplicableClause]
    reference_basis: List[ReferenceBasisItem]
    project_evidence: List[ProjectEvidenceItem]
    schedule_findings: Optional[ScheduleFindings] = None
    potential_entitlement_exposure: Optional[PotentialEntitlement] = None
    missing_evidence: List[str]
    risk_level: str  # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    recommended_action: str
    provenance_sources: List[ProvenanceSource]