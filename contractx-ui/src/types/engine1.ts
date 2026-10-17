// src/types/engine1.ts

export interface AskContractXResponse {
  finding_id: string;
  contractx_finding: string;
  applicable_contract_clauses: Array<{
    clause_number: string;
    clause_title: string;
    relevance: string;
  }>;
  reference_basis: Array<{
    framework: string;
    sub_clause: string;
    scl_protocol_ref?: string;
  }>;
  project_evidence: Array<{
    document_name: string;
    page?: number;
    date?: string;
    source_type: string;
  }>;
  schedule_findings?: {
    engine2_analysis_id: string;
    critical_path_slippage_days: number;
    delay_driver_activity: string;
    total_float_remaining: number;
    concurrency_status: string;
  };
  potential_entitlement_exposure?: {
    eot_entitlement_days: number;
    prolongation_cost_claimable: boolean;
    delay_damages_exposure: string;
  };
  missing_evidence: string[];
  risk_level: string;
  recommended_action: string;
  provenance_sources: Array<{
    source: string;
    ref: string;
  }>;
}
