const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export interface ContractProfile {
  contract_type?: string;
  notice_period_days?: number;
  governing_law?: string;
  employer_name?: string;
  contractor_name?: string;
  contract_value_usd?: number;
  ld_rate_per_day?: number;
  notice_time_bar_days?: number;
  eot_clause_ref?: string;
}

export interface RiskAssessResult {
  total_risk_score: number;
  risk_classification: string;
  triggered_rules: string[];
  required_action: string;
}

export interface ChatMessage {
  text: string;
  sender: 'user' | 'agent';
  timestamp?: string;
  sources?: string[];
}

export const api = {
  getContractProfile: async (tenantId: string, projectId: string): Promise<ContractProfile> => {
    const response = await fetch(`${API_BASE_URL}/api/v1/contract/profile?tenant_id=${tenantId}&project_id=${projectId}`);
    if (!response.ok) throw new Error('Failed to fetch contract profile');
    return await response.json();
  },

  uploadDocument: async (file: File, tenantId: string, projectId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tenant_id', tenantId);
    formData.append('project_id', projectId);

    const response = await fetch(`${API_BASE_URL}/api/v1/ingest/document`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Document upload failed');
    return await response.json();
  },

  assessRisk: async (params: {
    tenant_id: string;
    project_id: string;
    event_date: string;
    notice_given_date: string | null;
    financial_claim_usd: number;
    time_extension_requested_days: number;
    missing_evidence_count: number;
  }): Promise<RiskAssessResult> => {
    const response = await fetch(`${API_BASE_URL}/api/v1/risk/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error('Risk assessment failed');
    return await response.json();
  },

  sendAgentQuery: async (query: string, tenantId: string, projectId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/agent/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, tenant_id: tenantId, project_id: projectId }),
    });
    if (!response.ok) throw new Error('Agent query failed');
    return await response.json();
  },

  // Export contract review report as PDF or DOCX blob
  exportContractReview: async (projectId: string, tenantId: string, format: 'pdf' | 'docx'): Promise<Blob> => {
    const response = await fetch(`${API_BASE_URL}/api/v1/contract-review/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, tenant_id: tenantId, format }),
    });
    if (!response.ok) {
      throw new Error(`Export failed with status: ${response.status}`);
    }
    return await response.blob();
  },

  // Ingest custom benchmark template into tenant vault (With project_id included)
  uploadTemplate: async (file: File, tenantId: string, projectId: string, templateName: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tenant_id', tenantId);
    formData.append('project_id', projectId);
    formData.append('template_name', templateName);
    formData.append('doc_type', 'benchmark_template');

    const response = await fetch(`${API_BASE_URL}/api/v1/ingest/document`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Upload failed with status: ${response.status}`);
    }
    return await response.json();
  }
};