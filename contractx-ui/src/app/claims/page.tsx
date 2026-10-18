"use client";

import React, { useEffect, useMemo, useState } from "react";
import LegalFooter from "@/components/LegalFooter";
import ContractXNoticeModal from "@/components/ContractXNoticeModal";
import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";
import { useActiveProject } from "@/hooks/useActiveProject";
import { createClient } from "@/lib/supabase/client";

// All browser API traffic uses same-origin Next.js proxies.
// /api/contractx forwards model governance + vault requests to FastAPI.
// /api/engine3-proxy forwards Engine 3 requests to FastAPI.
const API = "/api/contractx";
const ENGINE3_API = "/api/contractx/api/v1/engine3";

type HealthStatus = "checking" | "online" | "offline";
type ModelStatus = "checking" | "live" | "unavailable";
type Theme = "dark" | "light";

type DraftMode =
  | "GENERAL"
  | "POTENTIAL_EVENT"
  | "EVENT_LINKED"
  | "NOTICE_LINKED"
  | "CLAIM_LINKED"
  | "ENGINE2_LINKED";

type DraftType =
  | "GENERAL_CONTRACTUAL_LETTER"
  | "NOTICE_OF_POTENTIAL_DELAY"
  | "EARLY_WARNING"
  | "NOTICE_OF_DELAY"
  | "NOTICE_OF_CLAIM"
  | "NOTICE_OF_TIMEBAR"
  | "RESERVATION_OF_RIGHTS"
  | "REQUEST_FOR_INFORMATION"
  | "REQUEST_FOR_PARTICULARS"
  | "RESPONSE_TO_NOTICE"
  | "RESPONSE_TO_CLAIM"
  | "REJECTION_OF_CLAIM"
  | "REPLY_TO_REJECTION"
  | "DEFENCE_TO_CLAIM"
  | "POSITION_STATEMENT"
  | "VARIATION_NOTICE"
  | "EOT_SUBMISSION"
  | "EOT_RESPONSE"
  | "PAYMENT_RESPONSE"
  | "DISRUPTION_NOTICE"
  | "MITIGATION_REQUEST"
  | "INSTRUCTION_ACKNOWLEDGEMENT"
  | "WITHOUT_PREJUDICE_RESPONSE"
  | "CHRONOLOGY"
  | "CLAIM_REPORT"
  | "EVIDENCE_REVIEW";

type StakeholderRole =
  | "EMPLOYER"
  | "DEVELOPER"
  | "CONTRACTOR"
  | "SUBCONTRACTOR"
  | "CONSULTANT"
  | "ENGINEER"
  | "PROJECT_MANAGER"
  | "PMC"
  | "CONTRACT_MANAGER"
  | "QUANTITY_SURVEYOR"
  | "PLANNER"
  | "LAW_FIRM"
  | "LEGAL_COUNSEL"
  | "OTHER";

type StanceType =
  | "NEUTRAL"
  | "ASSERTIVE"
  | "DEFENSIVE"
  | "RESERVATION_OF_RIGHTS"
  | "WITHOUT_PREJUDICE"
  | "INFORMATION_REQUEST"
  | "COMMERCIAL_RESOLUTION";

type ReferenceSelection = {
  standard_body?: string | null;
  contract_family?: string | null;
  edition?: string | null;
  jurisdiction?: string | null;
};

type StandardContractOption = {
  key: string;
  label: string;
  value: ReferenceSelection;
};

type VaultDocument = {
  id: string;
  file_name?: string;
  subject?: string;
  letter_ref?: string;
  document_date?: string;
  category?: string;
  document_type?: string;
  index_status?: string;
};

type EvidenceFinding = {
  id?: string | null;
  issue?: string | null;
  finding?: string | null;
  classification?:
    | "SUPPORTS_POSITION"
    | "CONTRARY"
    | "NEUTRAL"
    | "MISSING"
    | "UNVERIFIED";
  source_type?: string | null;
  source_document_id?: string | null;
  source_reference?: string | null;
  source_date?: string | null;
  clause_reference?: string | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
};

type EvidenceBundle = {
  delay_events?: Array<Record<string, any>>;
  time_bars?: Record<string, Record<string, any>>;
  schedule_analyses?: Array<Record<string, any>>;
  contract_clauses?: Array<Record<string, any>>;
  notices?: Array<Record<string, any>>;
  correspondence?: Array<Record<string, any>>;
  weekly_reports?: Array<Record<string, any>>;
  monthly_reports?: Array<Record<string, any>>;
  site_records?: Array<Record<string, any>>;
  selected_documents?: Array<Record<string, any>>;
  evidence_strength?: "STRONG" | "MODERATE" | "LIMITED" | "INSUFFICIENT";
  evidence_score?: number;
  evidence_score_basis?: string;
  supporting_evidence?: EvidenceFinding[];
  contrary_evidence?: EvidenceFinding[];
  neutral_evidence?: EvidenceFinding[];
  unverified_assertions?: EvidenceFinding[];
  contract_findings?: EvidenceFinding[];
  schedule_findings?: EvidenceFinding[];
  evidence_gaps?: string[];
  user_context?: Record<string, any>;
};

type DraftResponse = {
  status?: string;
  document_type?: string;
  mode?: string;
  stance?: string;
  evidence_gaps?: string[];
  primary_contract_source_count?: number;
  reference_source_count?: number;
  draft?: string;
  word_download_endpoint?: string;
};

const STANDARD_CONTRACTS: StandardContractOption[] = [
  {
    key: "fidic-red-2017",
    label: "FIDIC Red Book 2017",
    value: {
      standard_body: "FIDIC",
      contract_family: "Red Book",
      edition: "2017",
      jurisdiction: "Global",
    },
  },
  {
    key: "fidic-yellow-2017",
    label: "FIDIC Yellow Book 2017",
    value: {
      standard_body: "FIDIC",
      contract_family: "Yellow Book",
      edition: "2017",
      jurisdiction: "Global",
    },
  },
  {
    key: "fidic-silver-2017",
    label: "FIDIC Silver Book 2017",
    value: {
      standard_body: "FIDIC",
      contract_family: "Silver Book",
      edition: "2017",
      jurisdiction: "Global",
    },
  },
  {
    key: "scl-2nd",
    label: "SCL Delay and Disruption Protocol",
    value: {
      standard_body: "SCL",
      contract_family: "Delay and Disruption Protocol",
      edition: "2nd Edition",
      jurisdiction: "Global",
    },
  },
  {
    key: "psscoc-2020",
    label: "PSSCOC 2020",
    value: {
      standard_body: "PSSCOC",
      contract_family: "Public Sector Standard Conditions of Contract",
      edition: "2020",
      jurisdiction: "Singapore",
    },
  },
  {
    key: "redas",
    label: "REDAS Design & Build",
    value: {
      standard_body: "REDAS",
      contract_family: "Design and Build Conditions",
      jurisdiction: "Singapore",
    },
  },
];

const DOCUMENT_TYPES: Array<{ value: DraftType; label: string }> = [
  { value: "EVIDENCE_REVIEW", label: "Evidence Review / Extraction" },
  { value: "NOTICE_OF_CLAIM", label: "Notice of Claim" },
  { value: "NOTICE_OF_DELAY", label: "Notice of Delay" },
  { value: "NOTICE_OF_POTENTIAL_DELAY", label: "Notice of Potential Delay" },
  { value: "EARLY_WARNING", label: "Early Warning" },
  { value: "RESERVATION_OF_RIGHTS", label: "Reservation of Rights" },
  { value: "VARIATION_NOTICE", label: "Variation Notice" },
  { value: "EOT_SUBMISSION", label: "EOT Submission" },
  { value: "CLAIM_REPORT", label: "Claim Report" },
  { value: "RESPONSE_TO_NOTICE", label: "Response to Notice" },
  { value: "RESPONSE_TO_CLAIM", label: "Response to Claim" },
  { value: "REJECTION_OF_CLAIM", label: "Rejection of Claim" },
  { value: "REPLY_TO_REJECTION", label: "Reply to Rejection" },
  { value: "DEFENCE_TO_CLAIM", label: "Defence to Claim" },
  { value: "POSITION_STATEMENT", label: "Position Statement" },
  { value: "WITHOUT_PREJUDICE_RESPONSE", label: "Without Prejudice Response" },
  { value: "CHRONOLOGY", label: "Chronology" },
  { value: "REQUEST_FOR_INFORMATION", label: "Request for Information" },
  { value: "REQUEST_FOR_PARTICULARS", label: "Request for Particulars" },
  { value: "MITIGATION_REQUEST", label: "Mitigation Request" },
  { value: "PAYMENT_RESPONSE", label: "Payment Response" },
  { value: "DISRUPTION_NOTICE", label: "Disruption Notice" },
  { value: "GENERAL_CONTRACTUAL_LETTER", label: "General Contractual Letter" },
];

const ROLES: StakeholderRole[] = [
  "EMPLOYER",
  "DEVELOPER",
  "CONTRACTOR",
  "SUBCONTRACTOR",
  "CONSULTANT",
  "ENGINEER",
  "PROJECT_MANAGER",
  "PMC",
  "CONTRACT_MANAGER",
  "QUANTITY_SURVEYOR",
  "PLANNER",
  "LAW_FIRM",
  "LEGAL_COUNSEL",
  "OTHER",
];

const STANCES: StanceType[] = [
  "NEUTRAL",
  "ASSERTIVE",
  "DEFENSIVE",
  "RESERVATION_OF_RIGHTS",
  "WITHOUT_PREJUDICE",
  "INFORMATION_REQUEST",
  "COMMERCIAL_RESOLUTION",
];

const MODES: Array<{ value: DraftMode; label: string }> = [
  { value: "GENERAL", label: "General Matter" },
  { value: "POTENTIAL_EVENT", label: "Potential / Emerging Event" },
  { value: "EVENT_LINKED", label: "Delay Event Linked" },
  { value: "NOTICE_LINKED", label: "Notice Linked" },
  { value: "CLAIM_LINKED", label: "Claim Linked" },
  { value: "ENGINE2_LINKED", label: "Delay Analysis Linked" },
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseIds(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    neutral:
      "border-white/10 bg-white/[0.035] text-zinc-400",
    gold:
      "border-[#D6B36A]/30 bg-[#D6B36A]/10 text-[#E9CB8C]",
    green:
      "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    amber:
      "border-amber-400/20 bg-amber-400/10 text-amber-300",
    red:
      "border-rose-400/20 bg-rose-400/10 text-rose-300",
    blue:
      "border-sky-400/20 bg-sky-400/10 text-sky-300",
  };

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.11em]",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

function FieldLabel({
  children,
  optional = false,
}: {
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-500">
      <span>{children}</span>
      {optional && (
        <span className="normal-case tracking-normal text-zinc-600">
          optional
        </span>
      )}
    </div>
  );
}

function findingTone(classification?: EvidenceFinding["classification"]) {
  if (classification === "SUPPORTS_POSITION") return "green" as const;
  if (classification === "CONTRARY") return "red" as const;
  if (classification === "UNVERIFIED" || classification === "MISSING") return "amber" as const;
  return "neutral" as const;
}

function FindingList({
  items,
  emptyText,
}: {
  items?: EvidenceFinding[];
  emptyText: string;
}) {
  const list = asArray(items) as EvidenceFinding[];

  if (list.length === 0) {
    return <div className="text-sm text-zinc-500">{emptyText}</div>;
  }

  return (
    <div className="space-y-2">
      {list.map((item, index) => (
        <div
          key={`${item.id || item.source_document_id || index}-${index}`}
          className="cx-claim-inner rounded-xl border border-white/10 bg-black/15 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={findingTone(item.classification)}>
              {titleCase(item.classification || "NEUTRAL")}
            </Pill>
            {item.confidence && <Pill tone="neutral">{item.confidence} confidence</Pill>}
            {item.source_type && <Pill tone="blue">{titleCase(item.source_type)}</Pill>}
          </div>
          <div className="mt-2 text-sm leading-6 text-zinc-300">
            {item.finding || "Evidence item available for review."}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            {item.source_reference && <span>Ref: {item.source_reference}</span>}
            {item.source_date && <span>Date: {item.source_date}</span>}
            {item.clause_reference && <span>Clause: {item.clause_reference}</span>}
            {item.source_document_id && <span>Source: {item.source_document_id}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}


export default function ClaimsResolutionPage() {
  const supabase = useMemo(() => createClient(), []);

  const {
    projectId,
    project,
    tenantId,
    loading: projectLoading,
    error: projectError,
  } = useActiveProject();

  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const shellTheme = localStorage.getItem("contractx-theme");
    const initialTheme: Theme = shellTheme === "light" ? "light" : "dark";
    setTheme(initialTheme);
    document.documentElement.dataset.contractxTheme = initialTheme;

    const onThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<Theme>;
      if (customEvent.detail === "light" || customEvent.detail === "dark") {
        setTheme(customEvent.detail);
      }
    };

    window.addEventListener(
      "contractx-theme-change",
      onThemeChange as EventListener
    );

    return () => {
      window.removeEventListener(
        "contractx-theme-change",
        onThemeChange as EventListener
      );
    };
  }, []);

  const setClaimsTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.contractxTheme = nextTheme;
    localStorage.setItem("contractx-theme", nextTheme);
    window.dispatchEvent(
      new CustomEvent("contractx-theme-change", {
        detail: nextTheme,
      })
    );
  };

  const [healthStatus, setHealthStatus] =
    useState<HealthStatus>("checking");
  const [modelStatus, setModelStatus] =
    useState<ModelStatus>("checking");
  const [modelLabel, setModelLabel] =
    useState("Checking API model...");

  const [mode, setMode] = useState<DraftMode>("GENERAL");
  const [documentType, setDocumentType] =
    useState<DraftType>("NOTICE_OF_CLAIM");
  const [senderRole, setSenderRole] =
    useState<StakeholderRole>("CONTRACT_MANAGER");
  const [recipientRole, setRecipientRole] =
    useState<StakeholderRole>("EMPLOYER");
  const [stance, setStance] =
    useState<StanceType>("NEUTRAL");

  const [matterReference, setMatterReference] = useState("");
  const [subject, setSubject] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [contractClause, setContractClause] = useState("");
  const [requestedAction, setRequestedAction] = useState("");
  const [responseDeadline, setResponseDeadline] = useState("");
  const [customInstruction, setCustomInstruction] = useState("");

  const [chronologyFromDate, setChronologyFromDate] = useState("");
  const [chronologyToDate, setChronologyToDate] = useState("");
  const [chronologySelectedDocumentsOnly, setChronologySelectedDocumentsOnly] =
    useState(true);

  const [delayEventIdsText, setDelayEventIdsText] = useState("");
  const [analysisIdsText, setAnalysisIdsText] = useState("");
  const [noticeIdsText, setNoticeIdsText] = useState("");

  const [standardContractsOpen, setStandardContractsOpen] =
    useState(false);

  const [projectContextOpen, setProjectContextOpen] = useState(false);
  const [matterOverviewOpen, setMatterOverviewOpen] = useState(true);
  const [linkedIntelligenceOpen, setLinkedIntelligenceOpen] = useState(false);
  const [projectEvidenceOpen, setProjectEvidenceOpen] = useState(true);
  const [outputStrategyOpen, setOutputStrategyOpen] = useState(true);
  const [selectedStandardKeys, setSelectedStandardKeys] =
    useState<string[]>([]);

  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] =
    useState<string[]>([]);
  const [documentSearch, setDocumentSearch] = useState("");

  const [draftResponse, setDraftResponse] =
    useState<DraftResponse | null>(null);
  const [evidenceBundle, setEvidenceBundle] =
    useState<EvidenceBundle | null>(null);

  const [generating, setGenerating] = useState(false);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [downloadingWord, setDownloadingWord] = useState(false);
  const [message, setMessage] = useState("");

  const selectedStandards = useMemo(
    () =>
      selectedStandardKeys
        .map((key) => STANDARD_CONTRACTS.find((item) => item.key === key))
        .filter(Boolean) as StandardContractOption[],
    [selectedStandardKeys]
  );

  const filteredDocuments = useMemo(() => {
    const q = documentSearch.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((doc) =>
      [
        doc.file_name,
        doc.subject,
        doc.letter_ref,
        doc.category,
        doc.document_type,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [documents, documentSearch]);

  const payload = useMemo(() => {
    const primary = selectedStandards[0]?.value || null;
    const supporting = selectedStandards
      .slice(1, 3)
      .map((item) => item.value);

    return {
      tenant_id: tenantId,
      project_id: projectId ?? "",
      mode,
      document_type: documentType,
      sender_role: senderRole,
      recipient_role: recipientRole || null,
      stance,
      subject: subject.trim() || null,
      matter_reference: matterReference.trim() || null,
      issue_description: issueDescription.trim() || null,
      delay_event_id: null,
      delay_event_ids: parseIds(delayEventIdsText),
      engine2_analysis_id: null,
      engine2_analysis_ids: parseIds(analysisIdsText),
      notice_id: null,
      claim_id: null,
      contract_clause: contractClause.trim() || null,
      primary_contract: primary,
      selected_references: supporting,
      source_document_ids: selectedDocumentIds,
      notice_ids: parseIds(noticeIdsText),
      requested_action: requestedAction.trim() || null,
      response_deadline: responseDeadline || null,
      custom_instruction: customInstruction.trim() || null,
      chronology_from_date:
        documentType === "CHRONOLOGY" && chronologyFromDate
          ? chronologyFromDate
          : null,
      chronology_to_date:
        documentType === "CHRONOLOGY" && chronologyToDate
          ? chronologyToDate
          : null,
      chronology_selected_documents_only:
        documentType === "CHRONOLOGY"
          ? chronologySelectedDocumentsOnly
          : false,
    };
  }, [
    tenantId,
    projectId,
    mode,
    documentType,
    senderRole,
    recipientRole,
    stance,
    subject,
    matterReference,
    issueDescription,
    delayEventIdsText,
    analysisIdsText,
    noticeIdsText,
    contractClause,
    selectedStandards,
    selectedDocumentIds,
    requestedAction,
    responseDeadline,
    customInstruction,
    chronologyFromDate,
    chronologyToDate,
    chronologySelectedDocumentsOnly,
  ]);

  async function getAuthHeaders(
    includeJson = false
  ): Promise<Record<string, string>> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      throw new Error(
        `Unable to verify the authenticated session: ${error.message}`
      );
    }

    if (!session?.access_token) {
      throw new Error(
        "Your ContractX session has expired. Please sign in again."
      );
    }

    return {
      ...(includeJson ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 4500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [message]);

  useEffect(() => {
    if (projectError) {
      setMessage(projectError);
    }
  }, [projectError]);

  useEffect(() => {
    // Delay Analysis -> Claims & Resolution handoff.
    // Guarded so it cannot run during server rendering.
    if (typeof window === "undefined") return;

    try {
      const params = new URLSearchParams(window.location.search);
      const analysisId = (params.get("analysis_id") || "").trim();
      const requestedMode = (params.get("mode") || "").trim().toUpperCase();

      if (analysisId) {
        setAnalysisIdsText(analysisId);
        setMode("ENGINE2_LINKED");
        setLinkedIntelligenceOpen(true);
        setMessage("Delay Analysis attached as read-only drafting evidence.");
        return;
      }

      if (requestedMode === "ENGINE2_LINKED") {
        setMode("ENGINE2_LINKED");
        setLinkedIntelligenceOpen(true);
      }
    } catch {
      // Never prevent Claims & Resolution from rendering because of URL parsing.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function checkHealth() {
      try {
        const response = await fetch(`${ENGINE3_API}/health`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        });

        const data = await response.json().catch(() => null);

        if (cancelled) return;

        const isOnline =
          response.ok &&
          String(data?.status || "").toUpperCase() === "ONLINE";

        setHealthStatus(isOnline ? "online" : "offline");
      } catch (error) {
        if (!cancelled) {
          console.error("Engine 3 health check failed:", error);
          setHealthStatus("offline");
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(checkHealth, 15000);
        }
      }
    }

    setHealthStatus("checking");
    void checkHealth();

    return () => {
      cancelled = true;

      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkModel() {
      setModelStatus("checking");
      setModelLabel("Checking API model...");

      try {
        const qs = new URLSearchParams({
          tenant_id: tenantId,
          project_id: projectId ?? "",
        });

        const response = await fetch(
          `${API}/api/v1/models/project?${qs.toString()}`,
          {
            cache: "no-store",
            headers: await getAuthHeaders(),
          }
        );

        const data = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (!response.ok) {
          setModelStatus("unavailable");
          setModelLabel("API model unavailable");
          return;
        }

        if (
          data.status === "selection_required" ||
          data.configured === false ||
          !data.policy
        ) {
          setModelStatus("unavailable");
          setModelLabel("No API model configured");
          return;
        }

        const policy = data.policy;
        const provider = String(policy.provider || "OpenAI");
        const modelId = String(
          policy.model_id ||
          policy.model_key ||
          ""
        );

        if (!modelId) {
          setModelStatus("unavailable");
          setModelLabel("No API model configured");
          return;
        }

        const displayModel =
          modelId === "gpt-4o-mini"
            ? "GPT-4o mini"
            : modelId;

        setModelLabel(`${provider} · ${displayModel}`);
        setModelStatus("live");
      } catch (error) {
        if (cancelled) return;

        console.error(
          "ContractX model policy check failed:",
          error
        );

        setModelStatus("unavailable");
        setModelLabel("API model unavailable");
      }
    }

    if (!projectLoading && tenantId && projectId) {
      void checkModel();
    }

    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, projectLoading]);

  async function loadDocuments() {
    if (!tenantId || !projectId) return;

    setDocumentsLoading(true);

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
        page: "1",
        page_size: "100",
        sort_by: "document_date",
        sort_direction: "desc",
      });

      const response = await fetch(
        `${API}/api/v1/vault/documents?${qs.toString()}`,
        {
          cache: "no-store",
          headers: await getAuthHeaders(),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(
          data.detail || "Unable to load project documents from the Private Vault."
        );
        setDocuments([]);
        return;
      }

      setDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch {
      setMessage("Unable to connect to the Private Vault document register.");
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }

  useEffect(() => {
    if (!projectLoading && tenantId && projectId) {
      void loadDocuments();
    }
  }, [tenantId, projectId, projectLoading]);

  function toggleStandardContract(key: string) {
    setSelectedStandardKeys((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }

      if (current.length >= 3) {
        setMessage("A maximum of 3 Standard Contracts / references may be selected.");
        return current;
      }

      return [...current, key];
    });
  }

  function toggleDocument(id: string) {
    setSelectedDocumentIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function validateMatter() {
    if (projectLoading) {
      setMessage("Loading selected project context...");
      return false;
    }

    if (!tenantId?.trim() || !projectId?.trim()) {
      setMessage("No active project is selected. Open the project from Portfolio.");
      return false;
    }

    if (
      !issueDescription.trim() &&
      parseIds(delayEventIdsText).length === 0 &&
      parseIds(analysisIdsText).length === 0 &&
      selectedDocumentIds.length === 0
    ) {
      setMessage(
        "Add an issue description, link a delay event, attach a Delay Analysis, or select project evidence before generating."
      );
      return false;
    }

    if (documentType === "CHRONOLOGY") {
      if (!chronologyFromDate || !chronologyToDate) {
        setMessage(
          "Chronology requires both a From Date and a To Date."
        );
        return false;
      }

      if (chronologyFromDate > chronologyToDate) {
        setMessage(
          "Chronology From Date cannot be later than the To Date."
        );
        return false;
      }

      if (
        chronologySelectedDocumentsOnly &&
        selectedDocumentIds.length === 0
      ) {
        setMessage(
          "Select at least one project document for the chronology."
        );
        return false;
      }
    }

    return true;
  }

  async function generateDraft() {
    if (!validateMatter()) return;

    setGenerating(true);
    setMessage("");
    setDraftResponse(null);

    try {
      const response = await fetch(`${ENGINE3_API}/draft`, {
        method: "POST",
        headers: await getAuthHeaders(true),
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(
          data.detail ||
            `Claims & Resolution generation failed (HTTP ${response.status}).`
        );
        return;
      }

      setDraftResponse(data);
      setMessage("Claims & Resolution draft generated from the selected project evidence.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Unable to reach Engine 3: ${error.message}`
          : "Unable to reach Engine 3."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function inspectEvidence() {
    if (!validateMatter()) return;

    setLoadingEvidence(true);
    setMessage("");

    try {
      const response = await fetch(
        `${ENGINE3_API}/evidence-bundle`,
        {
          method: "POST",
          headers: await getAuthHeaders(true),
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(
          data.detail ||
            `Unable to inspect the evidence bundle (HTTP ${response.status}).`
        );
        return;
      }

      setEvidenceBundle(data);
      setMessage("Evidence bundle assembled successfully.");
    } catch {
      setMessage("Unable to assemble the Claims & Resolution evidence bundle.");
    } finally {
      setLoadingEvidence(false);
    }
  }

  async function downloadWord() {
    if (!validateMatter()) return;

    setDownloadingWord(true);
    setMessage("");

    try {
      const response = await fetch(`${ENGINE3_API}/draft-word`, {
        method: "POST",
        headers: await getAuthHeaders(true),
        body: JSON.stringify({
          ...payload,
          title: subject.trim() || titleCase(documentType),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setMessage(
          data.detail ||
            `Word export failed (HTTP ${response.status}).`
        );
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename =
        match?.[1] ||
        `ContractX_${documentType}_${projectId}.docx`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setMessage("Word document generated successfully.");
    } catch {
      setMessage("Unable to export the Claims & Resolution Word document.");
    } finally {
      setDownloadingWord(false);
    }
  }

  const evidenceCounts = {
    contract: asArray(evidenceBundle?.contract_clauses).length,
    notices: asArray(evidenceBundle?.notices).length,
    correspondence: asArray(evidenceBundle?.correspondence).length,
    reports:
      asArray(evidenceBundle?.weekly_reports).length +
      asArray(evidenceBundle?.monthly_reports).length +
      asArray(evidenceBundle?.site_records).length,
    events: asArray(evidenceBundle?.delay_events).length,
    analyses: asArray(evidenceBundle?.schedule_analyses).length,
  };

  return (
    <main
      className={cx(
        "cx-claims-shell min-h-screen bg-[#07090D] text-[#F5F3EE]",
        theme === "light" && "cx-claims-light"
      )}
    >
      <style>{`
        .cx-claims-shell {
          font-family: Arial, Helvetica, sans-serif;
          background:
            radial-gradient(circle at 82% 0%, rgba(111,143,175,.07), transparent 28%),
            radial-gradient(circle at 12% 0%, rgba(214,179,106,.05), transparent 24%),
            #07090D;
          color:#F5F3EE;
          --cx-card:#0D1117;
          --cx-card-soft:#090D12;
          --cx-text:#F5F3EE;
          --cx-muted:#8B95A3;
          --cx-border:rgba(255,255,255,.10);
          --cx-footer-bg:#050608;
          --cx-footer-text:#F4F1EA;
          --cx-footer-muted:rgba(244,241,234,.58);
          --cx-footer-border:rgba(255,255,255,.08);
          --cx-footer-accent:#D2B06F;
        }

        .cx-claims-shell input,
        .cx-claims-shell select,
        .cx-claims-shell textarea,
        .cx-claims-shell button {
          font-family: Arial, Helvetica, sans-serif;
        }

        .cx-claims-shell input,
        .cx-claims-shell select,
        .cx-claims-shell textarea {
          background:#080B10;
          color:#F4F6F8;
          border-color:rgba(255,255,255,.14);
        }

        .cx-claims-shell input::placeholder,
        .cx-claims-shell textarea::placeholder {
          color:#718092;
        }

        .cx-claims-light {
          background:
            radial-gradient(circle at 82% 0%, rgba(111,143,175,.07), transparent 28%),
            radial-gradient(circle at 12% 0%, rgba(214,179,106,.07), transparent 24%),
            #F3F0E9 !important;
          color:#172033 !important;
          --cx-card:#FFFFFF;
          --cx-card-soft:#F7F9FC;
          --cx-text:#172033;
          --cx-muted:#526174;
          --cx-border:#D5DDE7;
          --cx-footer-bg:#EBE7DE;
          --cx-footer-text:#17191C;
          --cx-footer-muted:#4F5965;
          --cx-footer-border:rgba(23,25,28,.12);
          --cx-footer-accent:#8B6118;
        }

        .cx-claims-light .cx-claim-card,
        .cx-claims-light .cx-claim-inner,
        .cx-claims-light .cx-claim-output {
          background:#FFFFFF !important;
          color:#172033 !important;
          border-color:#D5DDE7 !important;
          box-shadow:0 8px 24px rgba(15,23,42,.045);
        }

        .cx-claims-light .cx-claim-inner {
          background:#F7F9FC !important;
        }

        .cx-claims-light .text-white,
        .cx-claims-light .text-zinc-200,
        .cx-claims-light .text-zinc-300 {
          color:#27364A !important;
        }

        .cx-claims-light .text-zinc-400 {
          color:#405066 !important;
        }

        .cx-claims-light .text-zinc-500,
        .cx-claims-light .text-zinc-600,
        .cx-claims-light .text-zinc-700 {
          color:#526174 !important;
        }

        .cx-claims-light input,
        .cx-claims-light select,
        .cx-claims-light textarea {
          background:#FFFFFF !important;
          color:#172033 !important;
          border-color:#C7D1DC !important;
        }

        .cx-claims-light [class*="border-white"] {
          border-color:#D5DDE7 !important;
        }

        .cx-claims-light [class*="bg-black/"] {
          background:#F7F9FC !important;
        }

        .cx-claims-light .text-emerald-300 { color:#176336 !important; }
        .cx-claims-light .text-amber-300 { color:#7A5415 !important; }
        .cx-claims-light .text-rose-300 { color:#8D2730 !important; }
        .cx-claims-light .text-sky-300 { color:#245F8D !important; }
        .cx-claims-light .text-[#E9CB8C],
        .cx-claims-light .text-[#D6B36A] { color:#765114 !important; }

        .cx-claim-toast {
          background:rgba(17,22,29,.96);
          color:#E4E8EE;
          border-color:rgba(255,255,255,.12);
          box-shadow:0 18px 45px rgba(0,0,0,.30);
        }

        .cx-claims-light .cx-claim-toast {
          background:rgba(255,255,255,.97) !important;
          color:#27364A !important;
          border-color:#D5DDE7 !important;
          box-shadow:0 18px 45px rgba(15,23,42,.12);
        }

        .cx-claims-footer footer {
          background:var(--cx-footer-bg) !important;
          color:var(--cx-footer-text) !important;
          border-color:var(--cx-footer-border) !important;
        }

        .cx-claims-footer footer p,
        .cx-claims-footer footer span,
        .cx-claims-footer footer div,
        .cx-claims-footer footer a {
          color:var(--cx-footer-muted) !important;
        }

        .cx-claims-footer footer .text-\[\#F4F1EA\] {
          color:var(--cx-footer-text) !important;
        }

        .cx-claims-footer footer .text-\[\#D2B06F\] {
          color:var(--cx-footer-accent) !important;
        }

        .cx-claims-footer footer .text-\[\#D8A84E\],
        .cx-claims-footer footer span[class*="text-[#D8A84E]"] {
          color:#D8A84E !important;
        }
      `}</style>

      <div className="mx-auto max-w-[1580px] px-5 py-6 lg:px-8">
        <header className="cx-claim-card rounded-2xl border border-white/10 bg-[#0D1117] p-5 lg:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="text-[10px] font-black uppercase tracking-[0.17em] text-[#D6B36A]">
                Resolve
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white lg:text-4xl">
                Claims & Resolution
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Build an evidence-grounded contractual position, response or claim
                from selected project records, linked Delay Analysis and contract references.
              </p>
              <div className="mt-3 text-[10px] leading-5 text-zinc-500">
                Evidence is retrieved from the current project. Deterministic schedule findings
                remain separate from AI-assisted interpretation and drafting.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ContractXThemeSwitch
                theme={theme}
                onChange={setClaimsTheme}
              />

              <div className="cx-claim-inner rounded-lg border border-white/10 bg-black/15 px-3 py-2.5">
                <div className="text-[8px] font-black uppercase tracking-[0.12em] text-zinc-500">
                  Drafting Service
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-zinc-300">
                  <span
                    className={cx(
                      "h-2 w-2 rounded-full",
                      healthStatus === "online"
                        ? "bg-emerald-400"
                        : healthStatus === "offline"
                        ? "bg-rose-400"
                        : "bg-amber-400"
                    )}
                  />
                  {healthStatus === "online"
                    ? "Online"
                    : healthStatus === "offline"
                    ? "Offline"
                    : "Checking"}
                </div>
              </div>

              <div className="cx-claim-inner rounded-lg border border-white/10 bg-black/15 px-3 py-2.5">
                <div className="text-[8px] font-black uppercase tracking-[0.12em] text-zinc-500">
                  AI Policy
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-zinc-300">
                  <span
                    className={cx(
                      "h-2 w-2 rounded-full",
                      modelStatus === "live"
                        ? "bg-emerald-400"
                        : modelStatus === "unavailable"
                        ? "bg-rose-400"
                        : "bg-amber-400"
                    )}
                  />
                  {modelLabel}
                </div>
              </div>
            </div>
          </div>
        </header>

        <ContractXNoticeModal
          open={Boolean(message)}
          variant={
            /generated|assembled successfully|attached as read-only|successfully/i.test(message)
              ? "success"
              : /loading|selected|maximum of|checking/i.test(message)
              ? "info"
              : "error"
          }
          title={
            /generated|assembled successfully|attached as read-only|successfully/i.test(message)
              ? "Completed"
              : /loading|selected|maximum of|checking/i.test(message)
              ? "Information"
              : "Action Required"
          }
          message={message}
          onClose={() => setMessage("")}
        />

        <section className="mt-4 cx-claim-card rounded-2xl border border-white/10 bg-[#0D1117]">
          <button
            type="button"
            onClick={() => setProjectContextOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            aria-expanded={projectContextOpen}
          >
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">
                Current Project
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-white">
                {project?.project_name
                  ? `${project.project_name}${project.project_code ? ` · ${project.project_code}` : ""}`
                  : projectLoading
                  ? "Loading selected project…"
                  : "No project selected"}
              </div>
            </div>
            <span className="text-xs font-semibold text-zinc-500">
              {projectContextOpen ? "Hide Details" : "Technical Details"}
            </span>
          </button>

          {projectContextOpen && (
            <div className="grid gap-4 border-t border-white/10 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="text-[8px] font-black uppercase tracking-[0.13em] text-zinc-500">
                  Tenant ID
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-zinc-400">
                  {tenantId || "—"}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-black uppercase tracking-[0.13em] text-zinc-500">
                  Project ID
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-zinc-400">
                  {projectId || "—"}
                </div>
              </div>
              <label>
                <FieldLabel>Workflow Mode</FieldLabel>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as DraftMode)}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                >
                  {MODES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <FieldLabel>Matter Reference</FieldLabel>
                <input
                  value={matterReference}
                  onChange={(e) => setMatterReference(e.target.value)}
                  placeholder="e.g. CX-CLM-001"
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                />
              </label>
            </div>
          )}
        </section>

        <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <section className="cx-claim-card rounded-2xl border border-white/10 bg-[#0D1117] p-5">
              <button
                type="button"
                onClick={() => setMatterOverviewOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-4 text-left"
                aria-expanded={matterOverviewOpen}
              >
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D6B36A]">
                    1 · Matter
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    Define the issue
                  </h2>
                </div>
                <span className="text-lg font-semibold text-zinc-400">
                  {matterOverviewOpen ? "−" : "+"}
                </span>
              </button>

              {matterOverviewOpen && (
                <div className="mt-5 space-y-4">
                  <label>
                    <FieldLabel>Subject</FieldLabel>
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Late access to Work Area B and resulting delay"
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                    />
                  </label>

                  <label>
                    <FieldLabel>Issue / Matter Description</FieldLabel>
                    <textarea
                      value={issueDescription}
                      onChange={(e) => setIssueDescription(e.target.value)}
                      rows={5}
                      placeholder="Describe the event, issue, position or response required."
                      className="w-full resize-y rounded-xl border px-3 py-3 text-sm leading-6 outline-none"
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label>
                      <FieldLabel optional>Contract Clause</FieldLabel>
                      <input
                        value={contractClause}
                        onChange={(e) => setContractClause(e.target.value)}
                        placeholder="e.g. 8.5 / 20.2"
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      />
                    </label>

                    <label>
                      <FieldLabel optional>Response Deadline</FieldLabel>
                      <input
                        type="date"
                        value={responseDeadline}
                        onChange={(e) => setResponseDeadline(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      />
                    </label>
                  </div>

                  <label>
                    <FieldLabel optional>Requested Action / Relief</FieldLabel>
                    <textarea
                      value={requestedAction}
                      onChange={(e) => setRequestedAction(e.target.value)}
                      rows={2}
                      placeholder="e.g. acknowledge entitlement, grant EOT, provide particulars"
                      className="w-full resize-y rounded-xl border px-3 py-3 text-sm leading-6 outline-none"
                    />
                  </label>

                  <div>
                    <FieldLabel optional>Contract References</FieldLabel>
                    <button
                      type="button"
                      onClick={() => setStandardContractsOpen((current) => !current)}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-left"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {selectedStandardKeys.length
                            ? `${selectedStandardKeys.length} reference${selectedStandardKeys.length === 1 ? "" : "s"} selected`
                            : "Select contract references"}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          Up to 3 references · first selection is primary
                        </div>
                      </div>
                      <span className="text-zinc-400">
                        {standardContractsOpen ? "−" : "+"}
                      </span>
                    </button>

                    {standardContractsOpen && (
                      <div className="cx-claim-inner mt-2 rounded-xl border border-white/10 bg-black/15 p-3">
                        <div className="space-y-2">
                          {STANDARD_CONTRACTS.map((item) => (
                            <label
                              key={item.key}
                              className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]"
                            >
                              <input
                                type="checkbox"
                                checked={selectedStandardKeys.includes(item.key)}
                                onChange={() => toggleStandardContract(item.key)}
                              />
                              <span className="text-sm text-zinc-300">
                                {item.label}
                              </span>
                            </label>
                          ))}
                        </div>

                        {selectedStandardKeys.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedStandardKeys([])}
                            className="mt-3 text-xs font-semibold text-[#D6B36A]"
                          >
                            Clear selected references
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="cx-claim-card rounded-2xl border border-white/10 bg-[#0D1117] p-5">
              <button
                type="button"
                onClick={() => setLinkedIntelligenceOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-4 text-left"
                aria-expanded={linkedIntelligenceOpen}
              >
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D6B36A]">
                    Linked Analysis
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    Delay Analysis, events and notices
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {parseIds(analysisIdsText).length > 0 && (
                    <Pill tone="green">
                      {parseIds(analysisIdsText).length} attached
                    </Pill>
                  )}
                  <span className="text-lg font-semibold text-zinc-400">
                    {linkedIntelligenceOpen ? "−" : "+"}
                  </span>
                </div>
              </button>

              {linkedIntelligenceOpen && (
                <div className="mt-5 space-y-4">
                  <label>
                    <FieldLabel optional>Delay Analysis IDs</FieldLabel>
                    <input
                      value={analysisIdsText}
                      onChange={(e) => setAnalysisIdsText(e.target.value)}
                      placeholder="Comma-separated Delay Analysis IDs"
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                    />
                  </label>
                  <label>
                    <FieldLabel optional>Delay Event IDs</FieldLabel>
                    <input
                      value={delayEventIdsText}
                      onChange={(e) => setDelayEventIdsText(e.target.value)}
                      placeholder="Comma-separated delay event IDs"
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                    />
                  </label>
                  <label>
                    <FieldLabel optional>Notice IDs</FieldLabel>
                    <input
                      value={noticeIdsText}
                      onChange={(e) => setNoticeIdsText(e.target.value)}
                      placeholder="Comma-separated notice IDs"
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                    />
                  </label>

                  <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.045] p-3 text-xs leading-5 text-zinc-500">
                    Delay Analysis is attached as read-only schedule evidence. ContractX does
                    not add delay days or infer concurrency unless supported by the deterministic analysis.
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <section className="cx-claim-card rounded-2xl border border-white/10 bg-[#0D1117] p-5">
              <button
                type="button"
                onClick={() => setProjectEvidenceOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-4 text-left"
                aria-expanded={projectEvidenceOpen}
              >
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D6B36A]">
                    2 · Evidence
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    Select project records
                  </h2>
                  <div className="mt-1 text-xs text-zinc-500">
                    {selectedDocumentIds.length} document{selectedDocumentIds.length === 1 ? "" : "s"} selected
                  </div>
                </div>
                <span className="text-lg font-semibold text-zinc-400">
                  {projectEvidenceOpen ? "−" : "+"}
                </span>
              </button>

              {projectEvidenceOpen && (
                <>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={documentSearch}
                      onChange={(e) => setDocumentSearch(e.target.value)}
                      placeholder="Search project documents…"
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void loadDocuments()}
                      disabled={documentsLoading}
                      className="shrink-0 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-zinc-300 disabled:opacity-40"
                    >
                      {documentsLoading ? "Loading…" : "Refresh"}
                    </button>
                  </div>

                  <div className="cx-claim-inner mt-3 max-h-[380px] overflow-auto rounded-xl border border-white/10 bg-black/15">
                    {documentsLoading ? (
                      <div className="px-4 py-10 text-center text-sm text-zinc-500">
                        Loading project evidence…
                      </div>
                    ) : filteredDocuments.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <div className="text-sm font-semibold text-zinc-300">
                          No project documents available
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Upload or synchronize records from Documents first.
                        </div>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/10">
                        {filteredDocuments.map((doc) => (
                          <label
                            key={doc.id}
                            className="flex cursor-pointer gap-3 px-4 py-3 hover:bg-white/[0.025]"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDocumentIds.includes(doc.id)}
                              onChange={() => toggleDocument(doc.id)}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-zinc-200">
                                {doc.file_name || doc.subject || doc.id}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                                {doc.letter_ref && <span>{doc.letter_ref}</span>}
                                {doc.document_date && <span>{doc.document_date}</span>}
                                {doc.category && <span>{doc.category}</span>}
                                {doc.index_status && <span>{doc.index_status}</span>}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                    <span className="text-zinc-500">
                      {selectedDocumentIds.length} selected
                    </span>
                    {selectedDocumentIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedDocumentIds([])}
                        className="font-semibold text-[#D6B36A]"
                      >
                        Clear selection
                      </button>
                    )}
                  </div>

                  {evidenceBundle && (
                    <div className="cx-claim-inner mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">
                            Evidence Readiness
                          </div>
                          <div className="mt-1 text-sm font-semibold text-white">
                            {evidenceBundle.evidence_strength || "INSUFFICIENT"}
                            {typeof evidenceBundle.evidence_score === "number"
                              ? ` · ${evidenceBundle.evidence_score}/100`
                              : ""}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Pill tone="neutral">Contract {evidenceCounts.contract}</Pill>
                          <Pill tone="neutral">Notices {evidenceCounts.notices}</Pill>
                          <Pill tone="neutral">Analyses {evidenceCounts.analyses}</Pill>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="cx-claim-card rounded-2xl border border-white/10 bg-[#0D1117] p-5">
              <button
                type="button"
                onClick={() => setOutputStrategyOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-4 text-left"
                aria-expanded={outputStrategyOpen}
              >
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D6B36A]">
                    3 · Output
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    Prepare the required position
                  </h2>
                </div>
                <span className="text-lg font-semibold text-zinc-400">
                  {outputStrategyOpen ? "−" : "+"}
                </span>
              </button>

              {outputStrategyOpen && (
                <>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label>
                      <FieldLabel>Document Type</FieldLabel>
                      <select
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value as DraftType)}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      >
                        {DOCUMENT_TYPES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <FieldLabel>Stance</FieldLabel>
                      <select
                        value={stance}
                        onChange={(e) => setStance(e.target.value as StanceType)}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      >
                        {STANCES.map((item) => (
                          <option key={item} value={item}>
                            {titleCase(item)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <FieldLabel>Sender Role</FieldLabel>
                      <select
                        value={senderRole}
                        onChange={(e) => setSenderRole(e.target.value as StakeholderRole)}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      >
                        {ROLES.map((item) => (
                          <option key={item} value={item}>
                            {titleCase(item)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <FieldLabel>Recipient Role</FieldLabel>
                      <select
                        value={recipientRole}
                        onChange={(e) => setRecipientRole(e.target.value as StakeholderRole)}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      >
                        {ROLES.map((item) => (
                          <option key={item} value={item}>
                            {titleCase(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {documentType === "CHRONOLOGY" && (
                    <div className="cx-claim-inner mt-4 rounded-xl border border-[#D6B36A]/25 bg-[#D6B36A]/[0.045] p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#D6B36A]">
                        Chronology Scope
                      </div>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <label>
                          <FieldLabel>From Date</FieldLabel>
                          <input
                            type="date"
                            value={chronologyFromDate}
                            onChange={(e) => setChronologyFromDate(e.target.value)}
                            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                          />
                        </label>
                        <label>
                          <FieldLabel>To Date</FieldLabel>
                          <input
                            type="date"
                            value={chronologyToDate}
                            onChange={(e) => setChronologyToDate(e.target.value)}
                            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                          />
                        </label>
                      </div>

                      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/15 p-3">
                        <input
                          type="checkbox"
                          checked={chronologySelectedDocumentsOnly}
                          onChange={(e) =>
                            setChronologySelectedDocumentsOnly(e.target.checked)
                          }
                          className="mt-1"
                        />
                        <div>
                          <div className="text-sm font-semibold text-zinc-300">
                            Use selected project documents only
                          </div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">
                            Excludes unrelated Private Vault records from the chronology.
                          </div>
                        </div>
                      </label>
                    </div>
                  )}

                  <label className="mt-4 block">
                    <FieldLabel optional>Additional Drafting Instruction</FieldLabel>
                    <textarea
                      value={customInstruction}
                      onChange={(e) => setCustomInstruction(e.target.value)}
                      rows={2}
                      placeholder="Optional project-specific drafting instruction."
                      className="w-full resize-y rounded-xl border px-3 py-3 text-sm leading-6 outline-none"
                    />
                  </label>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => void inspectEvidence()}
                      disabled={loadingEvidence || generating}
                      className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.1em] text-zinc-300 disabled:opacity-40"
                    >
                      {loadingEvidence ? "Assembling…" : "Inspect Evidence"}
                    </button>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => void downloadWord()}
                        disabled={downloadingWord || generating}
                        className="rounded-xl border border-[#D6B36A]/35 bg-[#D6B36A]/[0.08] px-4 py-3 text-xs font-bold uppercase tracking-[0.1em] text-[#E9CB8C] disabled:opacity-40"
                      >
                        {downloadingWord ? "Preparing…" : "Export Word"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void generateDraft()}
                        disabled={generating}
                        title={
                          healthStatus === "offline"
                            ? "Drafting service health check is offline."
                            : undefined
                        }
                        className="rounded-xl bg-[#D6B36A] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-[#111318] disabled:opacity-40"
                      >
                        {generating
                          ? "Generating…"
                          : documentType === "EVIDENCE_REVIEW"
                          ? "Review Evidence"
                          : "Generate Position"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>

        <section className="mt-5 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
          <div className="cx-claim-card rounded-2xl border border-white/10 bg-[#0D1117] p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D6B36A]">
              Evidence Review
            </div>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Position readiness
            </h2>

            {!evidenceBundle ? (
              <div className="cx-claim-inner mt-5 rounded-xl border border-dashed border-white/10 bg-black/15 px-5 py-10 text-center">
                <div className="text-sm font-semibold text-zinc-300">
                  Evidence not yet inspected
                </div>
                <div className="mt-2 text-xs leading-5 text-zinc-500">
                  Select evidence and run Inspect Evidence to classify supporting,
                  contrary and missing material before drafting.
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="cx-claim-inner rounded-xl border border-white/10 bg-black/15 p-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.13em] text-zinc-500">
                    Evidence Coverage
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {evidenceBundle.evidence_strength || "INSUFFICIENT"}
                    {" · "}
                    {evidenceBundle.evidence_score || 0}/100
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {evidenceBundle.evidence_score_basis ||
                      "Readiness reflects evidence coverage and traceability, not legal entitlement."}
                  </p>
                </div>

                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-zinc-500">
                    Supporting Evidence
                  </div>
                  <FindingList
                    items={evidenceBundle.supporting_evidence}
                    emptyText="No source is explicitly classified as supporting the position."
                  />
                </div>

                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-zinc-500">
                    Contrary / Qualifying Evidence
                  </div>
                  <FindingList
                    items={evidenceBundle.contrary_evidence}
                    emptyText="No source is explicitly classified as contrary or adverse."
                  />
                </div>

                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-zinc-500">
                    Contract Findings
                  </div>
                  <FindingList
                    items={evidenceBundle.contract_findings}
                    emptyText="No retrieved contract finding is available for this evidence scope."
                  />
                </div>

                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-zinc-500">
                    Delay / Causation
                  </div>
                  <FindingList
                    items={evidenceBundle.schedule_findings}
                    emptyText="No deterministic Delay Analysis is linked."
                  />
                </div>

                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-zinc-500">
                    Evidence Gaps
                  </div>
                  {asArray(evidenceBundle.evidence_gaps).length === 0 ? (
                    <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2.5 text-xs leading-5 text-emerald-300">
                      No explicit evidence gaps were returned.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {asArray(evidenceBundle.evidence_gaps).map(
                        (gap: any, index: number) => (
                          <div
                            key={`${index}-${String(gap)}`}
                            className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-300"
                          >
                            {String(gap)}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="cx-claim-output rounded-2xl border border-white/10 bg-[#0D1117] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D6B36A]">
                  Advisory Output
                </div>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  {documentType === "EVIDENCE_REVIEW"
                    ? "Evidence review"
                    : "Draft / position preview"}
                </h2>
              </div>

              {draftResponse && (
                <div className="flex flex-wrap gap-2">
                  <Pill tone="green">Generated</Pill>
                  <Pill tone="neutral">
                    {draftResponse.primary_contract_source_count || 0} primary refs
                  </Pill>
                  <Pill tone="neutral">
                    {draftResponse.reference_source_count || 0} supporting refs
                  </Pill>
                </div>
              )}
            </div>

            {!draftResponse?.draft ? (
              <div className="cx-claim-inner mt-5 rounded-xl border border-dashed border-white/10 bg-black/15 px-5 py-16 text-center">
                <div className="text-base font-semibold text-zinc-300">
                  No position generated yet
                </div>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
                  Define the matter, select the evidence and choose the required output.
                </p>
              </div>
            ) : (
              <div className="mt-5">
                {asArray(draftResponse.evidence_gaps).length > 0 && (
                  <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.13em] text-amber-300">
                      Evidence limitations
                    </div>
                    <div className="mt-2 space-y-1.5 text-xs leading-5 text-zinc-400">
                      {asArray(draftResponse.evidence_gaps).map(
                        (gap: any, index: number) => (
                          <div key={`${index}-${String(gap)}`}>• {String(gap)}</div>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div className="cx-claim-inner max-h-[760px] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/15 p-5 text-sm leading-7 text-zinc-300">
                  {draftResponse.draft}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="cx-claims-footer mt-8">
          <LegalFooter compact />
        </div>
      </div>
    </main>
  );
}
