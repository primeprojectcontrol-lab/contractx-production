"use client";



import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";

import LegalFooter from "@/components/LegalFooter";
import ContractXNoticeModal from "@/components/ContractXNoticeModal";
import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";
import { createClient } from "@/lib/supabase/client";

import { useActiveProject } from "@/hooks/useActiveProject";



type Theme = "dark" | "light";



type ReferenceSelection = {

  standard_body: string;

  contract_family: string;

  edition: string;

  jurisdiction: string;

};



type ModelOption = {

  key: string;

  provider: string;

  model_id: string;

  display_name: string;

  customer_selectable: boolean;

  status: string;

};



type ProjectRecord = {

  id: string;

  name: string;

  type: string;

  meta?: string;

  indexStatus?: string;

  fileExtension?: string;

};



type VaultDocument = {

  id: string;

  file_name?: string | null;

  subject?: string | null;

  category?: string | null;

  document_type?: string | null;

  index_status?: string | null;

  processing_percent?: number | null;

  file_extension?: string | null;

  letter_ref?: string | null;

  document_date?: string | null;

};



type ProgrammeRecord = {

  id: string;

  name: string;

  schedule_type?: string | null;

  data_date?: string | null;

  file_type?: string | null;

  available_for_analysis?: boolean;

};



type AskResponse = {

  status?: string;

  query?: string;

  answer?: string;

  source_summary?: {

    project_contract_documents?: number;

    project_evidence_sources?: number;

    primary_contract_sources?: number;

    reference_sources?: number;

    programme_sources?: number;

  };

  contract_authority?: {

    primary_contract?: ReferenceSelection | null;

    selected_references?: ReferenceSelection[];

    hierarchy_note?: string;

  };

  evidence_gaps?: string[];

  diagnostics?: {

    warnings?: string[];

    ai_processing?: {

      provider?: string;

      model_id?: string;

      model_key?: string;

      total_tokens?: number;

      estimated_cost_usd?: number;

    };

  };

};



type QueryHistoryItem = {

  id: string;

  timestamp: string;

  query: string;

  response: AskResponse;

};



type GenerationStep = {

  label: string;

  status: "pending" | "active" | "complete" | "error";

};



// All browser API calls go through the same-origin Next.js proxy.

// The proxy forwards to the ContractX FastAPI backend configured by

// CONTRACTX_BACKEND_URL in contractx-ui/.env.local.

const API = "/api/contractx";



const referenceLibrary: ReferenceSelection[] = [

  {

    standard_body: "FIDIC",

    contract_family: "Yellow_Book",

    edition: "2017",

    jurisdiction: "GLOBAL",

  },

  {

    standard_body: "FIDIC",

    contract_family: "Red_Book",

    edition: "2017",

    jurisdiction: "GLOBAL",

  },

  {

    standard_body: "FIDIC",

    contract_family: "Silver_Book",

    edition: "2017",

    jurisdiction: "GLOBAL",

  },

  {

    standard_body: "SCL",

    contract_family: "Delay_and_Disruption_Protocol",

    edition: "2nd_Edition",

    jurisdiction: "GLOBAL",

  },

  {

    standard_body: "REDAS",

    contract_family: "Design_and_Build",

    edition: "3rd_Edition",

    jurisdiction: "SINGAPORE",

  },

  {

    standard_body: "PSSCOC",

    contract_family: "Public_Sector_Standard_Conditions",

    edition: "2020",

    jurisdiction: "SINGAPORE",

  },

];



function cx(...values: Array<string | false | null | undefined>) {

  return values.filter(Boolean).join(" ");

}



function pretty(value: string | null | undefined) {

  return String(value || "").replaceAll("_", " ");

}



function formatTime(value: string) {

  try {

    return new Intl.DateTimeFormat(undefined, {

      hour: "2-digit",

      minute: "2-digit",

      day: "2-digit",

      month: "short",

    }).format(new Date(value));

  } catch {

    return value;

  }

}



function Chevron({ open }: { open: boolean }) {

  return (

    <span

      className={cx(

        "inline-block text-[13px] transition-transform duration-200",

        open ? "rotate-180" : ""

      )}

    >

      ▾

    </span>

  );

}



function Dot({

  tone,

}: {

  tone: "green" | "amber" | "red" | "muted";

}) {

  const classes = {

    green: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.45)]",

    amber: "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.38)]",

    red: "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.38)]",

    muted: "bg-slate-500",

  };



  return <span className={cx("h-2 w-2 rounded-full", classes[tone])} />;

}



function PlainCheckbox({

  checked,

  radio = false,

}: {

  checked: boolean;

  radio?: boolean;

}) {

  return (

    <span

      aria-hidden="true"

      className={cx(

        "flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] font-bold",

        radio ? "rounded-full" : "rounded-[3px]",

        checked

          ? "border-[#D8A84E] bg-[#D8A84E] text-[#111318]"

          : "cx-divider bg-transparent text-transparent"

      )}

    >

      {checked ? "✓" : ""}

    </span>

  );

}



function CountBadge({ children }: { children: React.ReactNode }) {

  return (

    <span className="cx-muted text-[10px] font-semibold">

      {children}

    </span>

  );

}



function ContextAccordion({

  title,

  subtitle,

  count,

  open,

  onToggle,

  children,

}: {

  title: string;

  subtitle: string;

  count: string;

  open: boolean;

  onToggle: () => void;

  children: React.ReactNode;

}) {

  return (

    <div className="cx-subcard overflow-hidden rounded-xl border">

      <button

        type="button"

        onClick={onToggle}

        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"

      >

        <div>

          <div className="cx-text text-sm font-semibold">{title}</div>

          <div className="cx-muted mt-1 text-[11px] leading-5">{subtitle}</div>

        </div>



        <div className="flex shrink-0 items-center gap-2">

          <CountBadge>{count}</CountBadge>

          <Chevron open={open} />

        </div>

      </button>



      {open && (

        <div className="cx-divider border-t px-4 pb-4 pt-4">{children}</div>

      )}

    </div>

  );

}



function AskContractXContent() {

  const responseRef = useRef<HTMLDivElement | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const [projectNoticeDismissed, setProjectNoticeDismissed] = useState(false);



  const [theme, setTheme] = useState<Theme>("dark");



  const {

    projectId,

    project,

    tenantId,

    loading: projectLoading,

    error: projectError,

  } = useActiveProject();

  const [stakeholderRole, setStakeholderRole] =

    useState("Contract Manager");



  const [query, setQuery] = useState("");

  const [loading, setLoading] = useState(false);

  const [response, setResponse] = useState<AskResponse | null>(null);

  const [error, setError] = useState<string | null>(null);



  const [projectContracts, setProjectContracts] = useState<ProjectRecord[]>([]);

  const [projectRecords, setProjectRecords] = useState<ProjectRecord[]>([]);

  const [storedProgrammeFiles, setStoredProgrammeFiles] =

    useState<ProjectRecord[]>([]);

  const [programmes, setProgrammes] = useState<ProgrammeRecord[]>([]);

  const [documentsLoading, setDocumentsLoading] = useState(false);

  const [contextError, setContextError] = useState<string | null>(null);



  const [selectedContractDocs, setSelectedContractDocs] = useState<string[]>([]);

  const [selectedRecordDocs, setSelectedRecordDocs] = useState<string[]>([]);

  const [activeScheduleId, setActiveScheduleId] = useState("");



  const [selectedStandardContracts, setSelectedStandardContracts] = useState<

    ReferenceSelection[]

  >([]);



  const [openContext, setOpenContext] = useState({

    contract: true,

    references: false,

    records: false,

  });



  const [models, setModels] = useState<ModelOption[]>([]);

  const [selectedModel, setSelectedModel] = useState("");

  const [modelPolicySource, setModelPolicySource] = useState("default_policy");

  const [modelLoading, setModelLoading] = useState(true);

  const [modelError, setModelError] = useState<string | null>(null);

  const [modelSaving, setModelSaving] = useState(false);



  const [showGeneration, setShowGeneration] = useState(false);

  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([

    { label: "Context selections prepared", status: "pending" },

    { label: "Secure query submitted", status: "pending" },

    { label: "ContractX analysis running", status: "pending" },

    { label: "Response received", status: "pending" },

  ]);



  const [history, setHistory] = useState<QueryHistoryItem[]>([]);



  useEffect(() => {

    const saved = window.localStorage.getItem("contractx-theme");



    if (saved === "light" || saved === "dark") {

      setTheme(saved);
      document.documentElement.dataset.contractxTheme = saved;

    } else {

      const initialTheme: Theme =
        window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";

      setTheme(initialTheme);
      document.documentElement.dataset.contractxTheme = initialTheme;

    }

  }, []);

  useEffect(() => {
    setProjectNoticeDismissed(false);
  }, [projectError]);



  const setPlatformTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    window.localStorage.setItem("contractx-theme", nextTheme);
    document.documentElement.dataset.contractxTheme = nextTheme;
    window.dispatchEvent(
      new CustomEvent("contractx-theme-change", {
        detail: nextTheme,
      })
    );
  };



  const selectedStandardContractKeys = useMemo(

    () =>

      new Set(

        selectedStandardContracts.map((item) => JSON.stringify(item))

      ),

    [selectedStandardContracts]

  );



  const activeModel = useMemo(

    () =>

      selectedModel

        ? models.find((model) => model.key === selectedModel) || null

        : null,

    [models, selectedModel]

  );



  const selectedProgramme = useMemo(

    () => programmes.find((item) => item.id === activeScheduleId) || null,

    [programmes, activeScheduleId]

  );



  async function getAuthHeaders(
    includeJson = false
  ): Promise<Record<string, string>> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Authentication required.");
    }

    return {
      ...(includeJson ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${session.access_token}`,
    };
  }


  const registryTone: "green" | "amber" | "red" =

    modelError

      ? "red"

      : modelLoading

        ? "amber"

        : activeModel?.status === "active"

          ? "green"

          : "amber";



  async function loadModels() {

    setModelLoading(true);

    setModelError(null);



    try {

      // The approved AI registry is platform-level and must load independently

      // of whether the selected project context has finished resolving.

      const approvedResponse = await fetch(`${API}/api/v1/models/approved`, {

        cache: "no-store",

      });



      if (!approvedResponse.ok) {

        throw new Error(`AI registry unavailable (${approvedResponse.status})`);

      }



      const approvedData = await approvedResponse.json();

      setModels(Array.isArray(approvedData.models) ? approvedData.models : []);



      // Project policy is project-scoped. Only query it after useActiveProject()

      // has resolved a valid tenant/project pair.

      if (projectLoading || !tenantId || !projectId) {

        setSelectedModel("");

        setModelPolicySource("selection_required");

        return;

      }



      const policyQs = new URLSearchParams({

        tenant_id: tenantId,

        project_id: projectId,

      });



      const policyResponse = await fetch(
        `${API}/api/v1/models/project?${policyQs.toString()}`,
        {
          cache: "no-store",
          headers: await getAuthHeaders(),
        }
      );



      const policyData = await policyResponse.json().catch(() => ({}));



      if (!policyResponse.ok) {

        throw new Error(

          policyData.detail ||

            `Project AI policy unavailable (${policyResponse.status})`

        );

      }



      if (policyData.configured && policyData.policy) {

        const policy = policyData.policy;

        setSelectedModel(policy.model_key || "");

        setModelPolicySource(policy.source || "project_policy");

      } else {

        setSelectedModel("");

        setModelPolicySource("selection_required");

      }

    } catch (modelLoadError) {

      setModelError(

        modelLoadError instanceof Error

          ? modelLoadError.message

          : "Unable to load AI model registry."

      );

    } finally {

      setModelLoading(false);

    }

  }



  async function saveModel(nextKey: string) {

    if (projectLoading || !tenantId || !projectId) {

      setModelError("No active project is selected.");

      return;

    }



    const next = models.find((model) => model.key === nextKey);



    if (!next || next.status !== "active" || !next.customer_selectable) {

      return;

    }



    setSelectedModel(nextKey);

    setModelSaving(true);

    setModelError(null);



    try {

      const response = await fetch(`${API}/api/v1/models/project`, {

        method: "POST",

        headers: await getAuthHeaders(true),

        body: JSON.stringify({

          tenant_id: tenantId,

          project_id: projectId ?? "",

          model_key: nextKey,

        }),

      });



      const data = await response.json().catch(() => ({}));



      if (!response.ok) {

        throw new Error(

          data.detail || "Unable to update the project AI model."

        );

      }



      setModelPolicySource(data?.policy?.source || "project_policy");

    } catch (saveError) {

      setModelError(

        saveError instanceof Error

          ? saveError.message

          : "Unable to update the project AI model."

      );

    } finally {

      setModelSaving(false);

    }

  }



  async function loadContext() {

    if (projectLoading || !tenantId || !projectId) return;



    setDocumentsLoading(true);

    setContextError(null);



    try {

      const docQs = new URLSearchParams({

        tenant_id: tenantId,

        project_id: projectId ?? "",

        page: "1",

        page_size: "100",

        sort_by: "uploaded_at",

        sort_direction: "desc",

      });



      const programmeQs = new URLSearchParams({

        tenant_id: tenantId,

        project_id: projectId ?? "",

      });



      const authHeaders = await getAuthHeaders();

      const [documentsResponse, programmesResponse] = await Promise.all([
        fetch(`${API}/api/v1/vault/documents?${docQs.toString()}`, {
          headers: authHeaders,
        }),
        fetch(
          `${API}/api/v1/ask-contractx/programmes?${programmeQs.toString()}`,
          {
            headers: authHeaders,
          }
        ),
      ]);



      if (!documentsResponse.ok) {

        const body = await documentsResponse.json().catch(() => ({}));

        throw new Error(body.detail || "Unable to load project records.");

      }



      const documentsBody = await documentsResponse.json();

      const docs = (documentsBody.documents || []) as VaultDocument[];



      const toRecord = (doc: VaultDocument): ProjectRecord => ({

        id: doc.id,

        name: doc.subject || doc.file_name || "Project Record",

        type: pretty(doc.category || doc.document_type || "Project Record"),

        meta: [

          doc.letter_ref,

          doc.document_date,

          doc.file_extension

            ? String(doc.file_extension).toUpperCase()

            : null,

        ]

          .filter(Boolean)

          .join(" · "),

        indexStatus: doc.index_status || undefined,

        fileExtension: doc.file_extension || undefined,

      });



      const ready = docs.filter(

        (doc) => String(doc.index_status || "").toLowerCase() === "ready"

      );



      const contracts = ready

        .filter(

          (doc) =>

            String(doc.category || doc.document_type || "").toLowerCase() ===

            "executed_contract"

        )

        .map(toRecord);



      const records = ready

        .filter(

          (doc) =>

            String(doc.category || doc.document_type || "").toLowerCase() !==

            "executed_contract"

        )

        .map(toRecord);



      const storedProgrammes = docs

        .filter((doc) => {

          const category = String(

            doc.category || doc.document_type || ""

          ).toLowerCase();

          const extension = String(doc.file_extension || "").toLowerCase();



          return (

            category === "programme_schedule" ||

            extension === "xer"

          );

        })

        .map(toRecord);



      setProjectContracts(contracts);

      setProjectRecords(records);

      setStoredProgrammeFiles(storedProgrammes);



      setSelectedContractDocs((current) =>

        current.filter((id) => contracts.some((item) => item.id === id))

      );



      setSelectedRecordDocs((current) =>

        current.filter((id) => records.some((item) => item.id === id))

      );



      if (programmesResponse.ok) {

        const programmeBody = await programmesResponse.json();

        const programmeRows = (programmeBody.programmes ||

          []) as ProgrammeRecord[];



        setProgrammes(programmeRows);



        setActiveScheduleId((current) =>

          current && programmeRows.some((item) => item.id === current)

            ? current

            : ""

        );

      } else {

        setProgrammes([]);

      }

    } catch (contextLoadError) {

      setContextError(

        contextLoadError instanceof Error

          ? contextLoadError.message

          : "Unable to load project context."

      );

    } finally {

      setDocumentsLoading(false);

    }

  }



  useEffect(() => {

    // Registry should always be available, even while project context is resolving.

    void loadModels();



    if (projectLoading) return;



    if (projectError) {

      setContextError(projectError);

      return;

    }



    if (!tenantId || !projectId) {

      setContextError(

        "No active project is selected. Open Ask ContractX from Portfolio."

      );

      return;

    }



    void loadContext();



    // Project / tenant remains the scope boundary for project data.

  }, [tenantId, projectId, projectLoading, projectError]);



  const toggleContractDoc = (id: string) => {

    setSelectedContractDocs((current) =>

      current.includes(id)

        ? current.filter((value) => value !== id)

        : [...current, id]

    );

  };



  const toggleRecordDoc = (id: string) => {

    setSelectedRecordDocs((current) =>

      current.includes(id)

        ? current.filter((value) => value !== id)

        : [...current, id]

    );

  };



  const toggleStandardContract = (reference: ReferenceSelection) => {

    const key = JSON.stringify(reference);



    if (selectedStandardContractKeys.has(key)) {

      setSelectedStandardContracts((current) =>

        current.filter((item) => JSON.stringify(item) !== key)

      );

      return;

    }



    if (selectedStandardContracts.length >= 3) {

      return;

    }



    setSelectedStandardContracts((current) => [...current, reference]);

  };



  const clearContextSelections = () => {

    setSelectedContractDocs([]);

    setSelectedStandardContracts([]);

    setSelectedRecordDocs([]);

    setActiveScheduleId("");

  };



  const setGeneration = (

    statuses: Array<GenerationStep["status"]>

  ) => {

    const labels = [

      "Context selections prepared",

      "Secure query submitted",

      "ContractX analysis running",

      "Response received",

    ];



    setGenerationSteps(

      labels.map((label, index) => ({

        label,

        status: statuses[index] || "pending",

      }))

    );

  };



  async function submitQuery() {

    const cleanQuery = query.trim();



    if (projectLoading) {

      setError("Loading selected project context...");

      return;

    }



    if (!tenantId || !projectId) {

      setError("No active project is selected. Open Ask ContractX from Portfolio.");

      return;

    }



    if (!cleanQuery) {

      setError("Enter a contractual question before submitting.");

      return;

    }



    setLoading(true);

    setError(null);

    setShowGeneration(true);

    setGeneration(["complete", "active", "pending", "pending"]);



    try {

      const payload = {

        query: cleanQuery,

        tenant_id: tenantId,

        project_id: projectId ?? "",

        project_contract_document_ids: selectedContractDocs,

        source_document_ids: selectedRecordDocs,

        notice_ids: [],

        // Backend compatibility:

        // UI presents one unified "Standard Contracts" selector.

        // The first selected contract is sent through the legacy primary_contract

        // field and the remaining selections through selected_references.

        // The user-facing UI does not imply a different authority between them.

        primary_contract: selectedStandardContracts[0] || null,

        selected_references: selectedStandardContracts.slice(1, 3),

        active_schedule_id: activeScheduleId || null,

        stakeholder_role: stakeholderRole,

      };



      setGeneration(["complete", "complete", "active", "pending"]);



      const result = await fetch(`${API}/api/v1/ask-contractx/query`, {

        method: "POST",

        headers: await getAuthHeaders(true),

        body: JSON.stringify(payload),

      });



      if (!result.ok) {

        const body = await result.json().catch(() => ({}));

        throw new Error(

          body.detail || `Ask ContractX request failed (${result.status}).`

        );

      }



      const data = (await result.json()) as AskResponse;



      setResponse(data);

      setGeneration(["complete", "complete", "complete", "complete"]);



      setHistory((current) => [

        {

          id: `${Date.now()}-${Math.random()}`,

          timestamp: new Date().toISOString(),

          query: cleanQuery,

          response: data,

        },

        ...current,

      ].slice(0, 5));



      window.setTimeout(() => {

        responseRef.current?.scrollIntoView({

          behavior: "smooth",

          block: "start",

        });

      }, 120);

    } catch (requestError) {

      setGeneration(["complete", "complete", "error", "pending"]);

      setError(

        requestError instanceof Error

          ? requestError.message

          : "Ask ContractX request failed."

      );

    } finally {

      setLoading(false);

    }

  }



  const useHistoryItem = (item: QueryHistoryItem) => {

    setQuery(item.query);

    setResponse(item.response);



    window.setTimeout(() => {

      responseRef.current?.scrollIntoView({

        behavior: "smooth",

        block: "start",

      });

    }, 80);

  };



  const startFollowUp = () => {

    setQuery("");

    window.scrollTo({

      top: 0,

      behavior: "smooth",

    });

  };



  const selectedContextCount =

    selectedContractDocs.length +

    selectedRecordDocs.length +

    selectedStandardContracts.length +

    (activeScheduleId ? 1 : 0);

  const noticeMessage =
    error ||
    contextError ||
    modelError ||
    (!projectNoticeDismissed ? projectError : null);

  const noticeTitle =
    error
      ? "Ask ContractX could not complete the request"
      : contextError
        ? "Project context could not be loaded"
        : modelError
          ? "AI model configuration requires attention"
          : "Project context required";

  function closeNotice() {
    if (error) {
      setError(null);
      return;
    }

    if (contextError) {
      setContextError(null);
      return;
    }

    if (modelError) {
      setModelError(null);
      return;
    }

    if (projectError) {
      setProjectNoticeDismissed(true);
    }
  }



  return (

    <main

      className={cx(

        "cx-ask flex min-h-screen flex-col",

        theme === "light" ? "cx-light" : "cx-dark"

      )}

    >

      <style>{`

        .cx-ask{

          --bg:#07090D;

          --panel:#0D1117;

          --panel-2:#090C11;

          --panel-3:#121720;

          --border:rgba(255,255,255,.09);

          --border-strong:rgba(255,255,255,.16);

          --text:#F5F3EE;

          --muted:#9CA5B1;

          --subtle:#68727F;

          --gold:#D8A84E;

          --gold-soft:rgba(216,168,78,.10);

          --shadow:0 24px 70px rgba(0,0,0,.28);
          --cx-panel:var(--panel);
          --cx-panel-2:var(--panel-2);
          --cx-border:var(--border);
          --cx-text:var(--text);
          --cx-muted:var(--muted);



          --cx-footer-bg:#050608;

          --cx-footer-text:#F4F1EA;

          --cx-footer-muted:rgba(244,241,234,.58);

          --cx-footer-muted-strong:rgba(244,241,234,.70);

          --cx-footer-muted-soft:rgba(244,241,234,.46);

          --cx-footer-border:rgba(255,255,255,.08);

          --cx-footer-border-soft:rgba(255,255,255,.06);

          --cx-footer-divider:rgba(255,255,255,.10);

          --cx-footer-hover:#FFFFFF;

          --cx-footer-accent:#D2B06F;

          background:

            radial-gradient(circle at 75% -10%, rgba(216,168,78,.08), transparent 28%),

            radial-gradient(circle at 15% 15%, rgba(43,116,166,.08), transparent 25%),

            var(--bg);

          color:var(--text);

          transition:background .25s ease,color .25s ease;

        }



        .cx-ask.cx-light{

          --bg:#F4F6F8;

          --panel:#FFFFFF;

          --panel-2:#F8FAFC;

          --panel-3:#EEF2F6;

          --border:#DDE3EA;

          --border-strong:#C9D1DB;

          --text:#172033;

          --muted:#526173;

          --subtle:#748295;

          --gold:#A66F16;

          --gold-soft:rgba(166,111,22,.08);

          --shadow:0 18px 55px rgba(15,23,42,.07);



          --cx-footer-bg:#EBE7DE;

          --cx-footer-text:#17191C;

          --cx-footer-muted:#4F5965;

          --cx-footer-muted-strong:#3B434C;

          --cx-footer-muted-soft:#66717C;

          --cx-footer-border:rgba(23,25,28,.12);

          --cx-footer-border-soft:rgba(23,25,28,.10);

          --cx-footer-divider:rgba(23,25,28,.12);

          --cx-footer-hover:#17191C;

          --cx-footer-accent:#8B6118;

          background:

            radial-gradient(circle at 75% -10%, rgba(216,168,78,.10), transparent 28%),

            radial-gradient(circle at 15% 15%, rgba(43,116,166,.06), transparent 25%),

            var(--bg);

        }



        .cx-card{

          background:var(--panel);

          border-color:var(--border);

          box-shadow:var(--shadow);

        }



        .cx-subcard{

          background:var(--panel-2);

          border-color:var(--border);

        }



        .cx-soft{

          background:var(--panel-3);

          border-color:var(--border);

        }



        .cx-divider{border-color:var(--border);}

        .cx-text{color:var(--text);}

        .cx-muted{color:var(--muted);}

        .cx-subtle{color:var(--subtle);}



        .cx-input{

          background:var(--panel-2);

          color:var(--text);

          border-color:var(--border);

        }



        .cx-input:focus{

          border-color:rgba(216,168,78,.52);

          box-shadow:0 0 0 3px rgba(216,168,78,.08);

        }



        .cx-input::placeholder{color:var(--subtle);}



        .cx-badge{

          background:var(--panel-3);

          color:var(--muted);

          border-color:var(--border);

        }



        .cx-select-item{

          background:transparent;

          border-color:var(--border);

          color:var(--text);

        }



        .cx-select-item:hover{

          background:rgba(216,168,78,.035);

        }



        .cx-light .cx-select-item:hover{

          background:rgba(166,111,22,.035);

        }



      `}</style>



      <ContractXNoticeModal
        open={Boolean(noticeMessage)}
        variant="error"
        title={noticeTitle}
        message={noticeMessage || ""}
        onClose={closeNotice}
      />

      <div className="mx-auto w-full max-w-[1500px] flex-1 px-5 py-7 lg:px-8">

        {/* HERO */}

        <header className="mb-5">

          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">

            <div>

              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#D8A84E]">

                Contract Intelligence

              </div>



              <h1 className="cx-text text-3xl font-semibold tracking-[-0.04em] lg:text-4xl">

                Ask Contract<span className="text-[#D8A84E]">X</span>

              </h1>



              <div className="cx-muted mt-2 text-sm font-medium">

                Ask your contract. Ask your project. Ask the evidence.

              </div>



              <p className="cx-muted mt-3 max-w-4xl text-sm leading-6">

                Project-specific contractual intelligence across your programme,

                approved contract references, and secure project evidence —

                enhanced by AI reasoning.

              </p>

            </div>



            <div className="flex flex-wrap items-center gap-2">

              <ContractXThemeSwitch theme={theme} onChange={setPlatformTheme} />

              <div className="cx-subcard flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-semibold">

                <Dot tone={registryTone} />

                <span className="cx-muted">

                  {modelLoading

                    ? "AI Registry Checking"

                    : modelError

                      ? "AI Registry Error"

                      : "AI Registry Online"}

                </span>

              </div>

            </div>

          </div>



          {/* CAPABILITIES */}

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">

            {[

              ["Programme Intelligence", "Interpret linked programme information"],

              ["Standard Contracts", "Apply selected approved standard contract references"],

              ["Private Project Records", "Analyse authorised project records"],

              ["AI Reasoning", "Generate grounded project-aware responses"],

            ].map(([title, copy]) => (

              <div

                key={title}

                className="cx-subcard rounded-2xl border px-4 py-3"

              >

                <div className="cx-text text-[11px] font-semibold">{title}</div>

                <div className="cx-subtle mt-1 text-[10px] leading-4">{copy}</div>

              </div>

            ))}

          </div>

        </header>



        {/* PROJECT SCOPE — TOP LEVEL */}

        <section className="cx-card mb-5 rounded-2xl border p-4">

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">

            <div>

              <div className="cx-text text-xs font-semibold uppercase tracking-[0.16em]">

                Active Project Scope

              </div>

              <div className="cx-subtle mt-1 text-[10px]">

                All intelligence and source selections on this page are scoped to this tenant and project.

              </div>

              {projectLoading && (

                <div className="mt-2 text-[10px] text-amber-500">

                  Loading selected project context...

                </div>

              )}

              

            </div>



            <CountBadge>{selectedContextCount} context selections</CountBadge>

          </div>



          <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">

            <label>

              <span className="cx-subtle mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.14em]">

                Tenant

              </span>

              <input

                value={tenantId || ""}

                readOnly

                className="cx-input w-full cursor-default rounded-xl border px-3 py-2.5 text-xs outline-none"

              />

            </label>



            <label>

              <span className="cx-subtle mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.14em]">

                Project

              </span>

              <input

                value={

                  project?.project_name

                    ? `${project.project_name}${project.project_code ? ` · ${project.project_code}` : ""}`

                    : projectId || ""

                }

                readOnly

                className="cx-input w-full cursor-default rounded-xl border px-3 py-2.5 text-xs outline-none"

              />

            </label>



            <label>

              <span className="cx-subtle mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.14em]">

                Stakeholder Role

              </span>

              <select

                value={stakeholderRole}

                onChange={(event) => setStakeholderRole(event.target.value)}

                className="cx-input w-full rounded-xl border px-3 py-2.5 text-xs outline-none"

              >

                <option>Employer</option>

                <option>Developer</option>

                <option>Contractor</option>

                <option>Subcontractor</option>

                <option>Consultant</option>

                <option>Engineer</option>

                <option>Project Manager</option>

                <option>PMC</option>

                <option>Contract Manager</option>

                <option>Quantity Surveyor</option>

                <option>Planner</option>

                <option>Law Firm</option>

                <option>Legal Counsel</option>

              </select>

            </label>

          </div>

        </section>



        <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">

          {/* INTELLIGENCE CONTEXT */}

          <aside className="space-y-4">

            <div className="cx-card rounded-2xl border p-4">

              <div className="mb-4 flex items-start justify-between gap-4">

                <div>

                  <div className="cx-text text-xs font-semibold uppercase tracking-[0.16em]">

                    Intelligence Context

                  </div>

                  <div className="cx-muted mt-1 text-[11px] leading-5">

                    Choose exactly what ContractX may use for this query.

                  </div>

                </div>



                <button

                  type="button"

                  onClick={clearContextSelections}

                  disabled={selectedContextCount === 0}

                  className="cx-muted shrink-0 border-b border-current pb-0.5 text-[10px] font-semibold transition hover:text-[#D8A84E] disabled:cursor-not-allowed disabled:opacity-35"

                >

                  Clear selections

                </button>

              </div>



              <div className="space-y-3">

                <ContextAccordion

                  title="Project Contract"

                  subtitle="Executed contract and project-specific contractual documents"

                  count={`${selectedContractDocs.length} selected`}

                  open={openContext.contract}

                  onToggle={() =>

                    setOpenContext((current) => ({

                      ...current,

                      contract: !current.contract,

                    }))

                  }

                >

                  {documentsLoading && (

                    <div className="cx-muted text-xs">Loading project contract documents…</div>

                  )}



                  {!documentsLoading && projectContracts.length === 0 && (

                    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.055] p-3 text-[11px] leading-5 text-amber-500">

                      No indexed Executed Contract is currently available for this project.

                    </div>

                  )}



                  <div className="space-y-2">

                    {projectContracts.map((doc) => {

                      const selected = selectedContractDocs.includes(doc.id);



                      return (

                        <label

                          key={doc.id}

                          className={cx(

                            "cx-select-item flex w-full cursor-pointer items-start gap-3 border-b px-2 py-3 text-left transition last:border-b-0",

                            selected && "bg-[#D8A84E]/[0.06]"

                          )}

                        >

                          <input

                            type="checkbox"

                            checked={selected}

                            onChange={() => toggleContractDoc(doc.id)}

                            className="sr-only"

                          />

                          <PlainCheckbox checked={selected} />

                          <span className="min-w-0 flex-1">

                            <span className="cx-text block text-xs font-semibold">{doc.name}</span>

                            <span className="cx-subtle mt-1 block text-[10px]">{doc.meta || doc.type}</span>

                          </span>

                        </label>

                      );

                    })}

                  </div>

                </ContextAccordion>



                <ContextAccordion

                  title="Standard Contracts"

                  subtitle="Select up to three approved standard contract references"

                  count={`${selectedStandardContracts.length} selected`}

                  open={openContext.references}

                  onToggle={() =>

                    setOpenContext((current) => ({

                      ...current,

                      references: !current.references,

                    }))

                  }

                >

                  <div className="mb-2 flex items-center justify-between gap-3">

                    <div className="cx-subtle text-[9px] font-semibold uppercase tracking-[0.14em]">

                      Approved Standard Contracts

                    </div>



                    <button

                      type="button"

                      onClick={() => setSelectedStandardContracts([])}

                      disabled={selectedStandardContracts.length === 0}

                      className="cx-muted border-b border-current pb-0.5 text-[9px] font-semibold transition hover:text-[#D8A84E] disabled:cursor-not-allowed disabled:opacity-35"

                    >

                      Clear

                    </button>

                  </div>



                  <div className="space-y-0">

                    {referenceLibrary.map((reference) => {

                      const key = JSON.stringify(reference);

                      const selected = selectedStandardContractKeys.has(key);

                      const disabled =

                        !selected && selectedStandardContracts.length >= 3;



                      return (

                        <label

                          key={`standard-${key}`}

                          className={cx(

                            "cx-select-item flex w-full items-start gap-3 border-b px-2 py-3 text-left transition last:border-b-0",

                            disabled

                              ? "cursor-not-allowed opacity-40"

                              : "cursor-pointer",

                            selected && "bg-[#D8A84E]/[0.06]"

                          )}

                        >

                          <input

                            type="checkbox"

                            checked={selected}

                            disabled={disabled}

                            onChange={() => toggleStandardContract(reference)}

                            className="sr-only"

                          />



                          <PlainCheckbox checked={selected} />



                          <span className="min-w-0 flex-1">

                            <span className="cx-text block text-xs font-semibold">

                              {reference.standard_body}{" "}

                              {pretty(reference.contract_family)}

                            </span>



                            <span className="cx-subtle mt-1 block text-[10px]">

                              {reference.edition} · {reference.jurisdiction}

                            </span>

                          </span>

                        </label>

                      );

                    })}

                  </div>



                  <div className="cx-subtle mt-3 text-[9px] leading-4">

                    Up to three standard contract references may be selected for one query.

                  </div>

                </ContextAccordion>



                <ContextAccordion

                  title="Project Records"

                  subtitle="Indexed project records and programme information"

                  count={`${selectedRecordDocs.length} records · ${activeScheduleId ? 1 : 0} programme`}

                  open={openContext.records}

                  onToggle={() =>

                    setOpenContext((current) => ({

                      ...current,

                      records: !current.records,

                    }))

                  }

                >

                  <div className="cx-subtle mb-2 text-[9px] font-semibold uppercase tracking-[0.14em]">

                    Indexed Files — Multi Select

                  </div>



                  



                  <div className="max-h-[250px] space-y-2 overflow-y-auto pr-1">

                    {projectRecords.length === 0 && !documentsLoading && (

                      <div className="cx-muted text-[11px]">No indexed project records are available.</div>

                    )}



                    {projectRecords.map((doc) => {

                      const selected = selectedRecordDocs.includes(doc.id);



                      return (

                        <label

                          key={doc.id}

                          className={cx(

                            "cx-select-item flex w-full cursor-pointer items-start gap-3 border-b px-2 py-3 text-left transition last:border-b-0",

                            selected && "bg-emerald-400/[0.05]"

                          )}

                        >

                          <input

                            type="checkbox"

                            checked={selected}

                            onChange={() => toggleRecordDoc(doc.id)}

                            className="sr-only"

                          />

                          <PlainCheckbox checked={selected} />

                          <span className="min-w-0 flex-1">

                            <span className="cx-text block text-xs font-semibold">{doc.name}</span>

                            <span className="cx-subtle mt-1 block text-[10px]">{doc.meta || doc.type}</span>

                          </span>

                        </label>

                      );

                    })}

                  </div>



                  <div className="cx-divider my-4 border-t" />



                  <div className="cx-subtle mb-2 text-[9px] font-semibold uppercase tracking-[0.14em]">

                    Programme Data — Non-Indexed

                  </div>



                  <select

                    value={activeScheduleId}

                    onChange={(event) => setActiveScheduleId(event.target.value)}

                    className="cx-input w-full rounded-xl border px-3 py-2.5 text-xs outline-none"

                  >

                    <option value="">No programme selected</option>

                    {programmes.map((programme) => (

                      <option key={programme.id} value={programme.id}>

                        {programme.name}

                        {programme.schedule_type

                          ? ` · ${pretty(programme.schedule_type)}`

                          : ""}

                        {programme.data_date

                          ? ` · Data date ${programme.data_date}`

                          : ""}

                      </option>

                    ))}

                  </select>



                  {selectedProgramme && (

                    <div className="mt-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.055] p-3 text-[10px] leading-5 text-sky-500">

                      Programme selected for this query: {selectedProgramme.name}

                    </div>

                  )}



                  {storedProgrammeFiles.length > 0 && programmes.length === 0 && (

                    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.055] p-3">

                      <div className="text-[10px] font-semibold text-amber-500">

                        Stored programme files

                      </div>

                      <div className="cx-muted mt-1 text-[10px] leading-5">

                        Programme files are present in the project records. Complete programme analysis to make schedule intelligence selectable here.

                      </div>

                      <div className="cx-subtle mt-2 space-y-1 text-[9px]">

                        {storedProgrammeFiles.slice(0, 4).map((item) => (

                          <div key={item.id}>• {item.name}</div>

                        ))}

                      </div>

                    </div>

                  )}

                </ContextAccordion>

              </div>

            </div>

          </aside>



          {/* ASK / RESPONSE */}

          <section className="space-y-5">

            {/* AI MODEL */}

            <div className="cx-card rounded-2xl border p-4">

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">

                <div>

                  <div className="flex items-center gap-2">

                    <Dot tone={registryTone} />

                    <div className="cx-text text-xs font-semibold uppercase tracking-[0.15em]">

                      AI Model

                    </div>

                  </div>



                  <div className="cx-muted mt-2 text-[11px] leading-5">

                    Choose from ContractX-approved AI providers. Only active, governed providers can be selected.

                  </div>



                  

                </div>



                <div>

                  <label className="cx-subtle mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.14em]">

                    Provider / Approved Model

                  </label>



                  <select

                    value={selectedModel}

                    disabled={modelLoading || modelSaving}

                    onChange={(event) => saveModel(event.target.value)}

                    className="cx-input w-full rounded-xl border px-3 py-2.5 text-xs outline-none disabled:opacity-60"

                  >

                    {!selectedModel && (

                      <option value="" disabled>

                        {modelLoading

                          ? "Checking approved AI models..."

                          : "Select an available AI model"}

                      </option>

                    )}



                    {models.map((model) => {

                      const comingSoon =

                        model.status !== "active" ||

                        !model.customer_selectable;



                      const cleanDisplayName = String(

                        model.display_name || model.provider || "AI Model"

                      )

                        .replace(/\s*[—-]\s*Coming Soon\s*$/i, "")

                        .trim();



                      return (

                        <option

                          key={model.key}

                          value={model.key}

                          disabled={comingSoon}

                        >

                          {cleanDisplayName}

                          {model.model_id ? ` · ${model.model_id}` : ""}

                          {comingSoon ? " · Coming Soon" : ""}

                        </option>

                      );

                    })}

                  </select>



                  {!selectedModel && !modelLoading && !modelError && (

                    <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.055] px-3 py-2 text-[10px] leading-4 text-amber-500">

                      Select and save an available AI model for this project before running Ask ContractX.

                    </div>

                  )}



                  <div className="cx-subtle mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px]">

                    <span className="inline-flex items-center gap-1.5"><Dot tone="green" /> Active</span>

                    <span className="inline-flex items-center gap-1.5"><Dot tone="amber" /> Coming Soon</span>

                    <span className="inline-flex items-center gap-1.5"><Dot tone="red" /> Unavailable</span>

                    <span>Policy: {pretty(modelPolicySource)}</span>

                  </div>

                </div>

              </div>

            </div>



            {/* ASK CARD */}

            <div className="cx-card rounded-2xl border p-5">

              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

                <div>

                  <div className="cx-text text-lg font-semibold tracking-[-0.02em]">

                    Ask ContractX

                  </div>

                  <div className="cx-muted mt-1 max-w-2xl text-[11px] leading-5">

                    Query your project context, selected standard contracts, project records and programme information in one controlled analysis.

                  </div>

                </div>



                <CountBadge>{selectedContextCount} sources selected</CountBadge>

              </div>



              <textarea

                value={query}

                onChange={(event) => setQuery(event.target.value)}

                placeholder="Ask a project-specific contractual question…"

                className="cx-input mt-5 min-h-[165px] w-full resize-y rounded-2xl border px-4 py-4 text-sm leading-7 outline-none"

              />



              



              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

                <button

                  type="button"

                  onClick={() => setShowGeneration((value) => !value)}

                  className="cx-muted text-left text-[10px] font-semibold underline decoration-dotted underline-offset-4 transition hover:text-[#D8A84E]"

                >

                  {showGeneration

                    ? "Hide generation process"

                    : "Show generation process"}

                </button>



                <button

                  type="button"

                  onClick={submitQuery}

                  disabled={

                    loading ||

                    projectLoading ||

                    !projectId ||

                    !tenantId ||

                    Boolean(modelError) ||

                    !selectedModel ||

                    activeModel?.status !== "active"

                  }

                  className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-xl border border-[#D8A84E]/45 bg-[#D8A84E] px-5 py-3 text-sm font-semibold text-[#111318] shadow-[0_14px_35px_rgba(216,168,78,.14)] transition hover:bg-[#E3BB69] disabled:cursor-wait disabled:opacity-50"

                >

                  {!loading && <Dot tone={registryTone} />}

                  {loading ? "Analysing…" : "Ask ContractX"}

                </button>

              </div>



              {showGeneration && (

                <div className="cx-subcard mt-4 rounded-2xl border p-4">

                  <div className="cx-text text-[10px] font-semibold uppercase tracking-[0.14em]">

                    Generation Process

                  </div>

                  <div className="cx-subtle mt-1 text-[9px] leading-4">

                    High-level processing status only. Internal model reasoning is not displayed.

                  </div>



                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">

                    {generationSteps.map((step, index) => (

                      <div

                        key={step.label}

                        className="cx-soft rounded-xl border p-3"

                      >

                        <div className="flex items-center gap-2">

                          <Dot

                            tone={

                              step.status === "complete"

                                ? "green"

                                : step.status === "active"

                                  ? "amber"

                                  : step.status === "error"

                                    ? "red"

                                    : "muted"

                            }

                          />

                          <span className="cx-subtle text-[9px] font-semibold">

                            0{index + 1}

                          </span>

                        </div>

                        <div className="cx-text mt-2 text-[10px] font-medium leading-4">

                          {step.label}

                        </div>

                      </div>

                    ))}

                  </div>

                </div>

              )}

            </div>



            {/* RESPONSE CARD */}

            <div

              ref={responseRef}

              className="cx-card scroll-mt-6 rounded-2xl border p-5"

            >

              <div className="cx-divider flex flex-col gap-3 border-b pb-4 md:flex-row md:items-start md:justify-between">

                <div>

                  <div className="cx-text text-base font-semibold">

                    ContractX Response

                  </div>

                  <div className="cx-subtle mt-1 text-[10px]">

                    Project-aware contractual analysis

                  </div>

                </div>



                {response?.source_summary && (

                  <div className="flex flex-wrap gap-2">

                    <CountBadge>

                      Contract {response.source_summary.project_contract_documents ?? 0}

                    </CountBadge>

                    <CountBadge>

                      Standard Contracts{" "}

                      {(response.source_summary.primary_contract_sources ?? 0) +

                        (response.source_summary.reference_sources ?? 0)}

                    </CountBadge>

                    <CountBadge>

                      Records {response.source_summary.project_evidence_sources ?? 0}

                    </CountBadge>

                    <CountBadge>

                      Programme {response.source_summary.programme_sources ?? 0}

                    </CountBadge>

                  </div>

                )}

              </div>



              {!response?.answer ? (

                <div className="cx-subcard mt-5 rounded-2xl border border-dashed px-6 py-14 text-center">

                  <div className="cx-text text-sm font-medium">

                    Your ContractX response will appear here.

                  </div>

                  <div className="cx-subtle mt-2 text-[10px]">

                    Select context, ask a question and generate the analysis.

                  </div>

                </div>

              ) : (

                <div className="mt-5 space-y-5">

                  <div className="cx-text whitespace-pre-wrap text-sm leading-7">

                    {response.answer}

                  </div>



                  {response.evidence_gaps &&

                    response.evidence_gaps.length > 0 && (

                      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4">

                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-500">

                          Evidence Gaps

                        </div>

                        <ul className="cx-muted mt-3 space-y-2 text-xs leading-5">

                          {response.evidence_gaps.map((gap, index) => (

                            <li key={`${gap}-${index}`} className="flex gap-2">

                              <span className="text-amber-500">•</span>

                              <span>{gap}</span>

                            </li>

                          ))}

                        </ul>

                      </div>

                    )}



                  <div className="flex flex-wrap items-center justify-between gap-3">

                    <div className="cx-subtle text-[9px]">

                      {response?.diagnostics?.ai_processing?.provider && (

                        <>

                          Generated with{" "}

                          {response.diagnostics.ai_processing.provider}

                          {response.diagnostics.ai_processing.model_id

                            ? ` · ${response.diagnostics.ai_processing.model_id}`

                            : ""}

                        </>

                      )}

                    </div>



                    <button

                      type="button"

                      onClick={startFollowUp}

                      className="rounded-xl border border-[#D8A84E]/30 bg-[#D8A84E]/[0.08] px-4 py-2 text-[10px] font-semibold text-[#D8A84E] transition hover:bg-[#D8A84E]/[0.14]"

                    >

                      Ask a Follow-up

                    </button>

                  </div>

                </div>

              )}

            </div>



            {/* LAST 5 */}

            <div className="cx-card rounded-2xl border p-5">

              <div className="flex items-center justify-between gap-3">

                <div>

                  <div className="cx-text text-sm font-semibold">

                    Recent Queries

                  </div>

                  <div className="cx-subtle mt-1 text-[10px]">

                    Last 5 query / response pairs in this session

                  </div>

                </div>

                <CountBadge>{history.length}/5</CountBadge>

              </div>



              <div className="mt-4 space-y-2">

                {history.length === 0 && (

                  <div className="cx-subcard rounded-xl border border-dashed p-5 text-center">

                    <div className="cx-muted text-[10px]">

                      Your recent Ask ContractX exchanges will appear here.

                    </div>

                  </div>

                )}



                {history.map((item, index) => (

                  <button

                    key={item.id}

                    type="button"

                    onClick={() => useHistoryItem(item)}

                    className="cx-subcard w-full rounded-xl border p-4 text-left transition hover:border-[#D8A84E]/30"

                  >

                    <div className="flex items-start justify-between gap-4">

                      <div className="min-w-0">

                        <div className="cx-text truncate text-xs font-semibold">

                          {item.query}

                        </div>

                        <div className="cx-muted mt-2 line-clamp-2 text-[10px] leading-4">

                          {item.response.answer || "Response available"}

                        </div>

                      </div>



                      <div className="shrink-0 text-right">

                        <div className="cx-subtle text-[9px]">

                          {formatTime(item.timestamp)}

                        </div>

                        <div className="cx-subtle mt-1 text-[8px]">

                          #{index + 1}

                        </div>

                      </div>

                    </div>

                  </button>

                ))}

              </div>

            </div>

          </section>

        </div>

      </div>

      <LegalFooter compact />

    </main>

  );

}

export default function AskContractXPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#050608] px-5 text-[#F5F3EE]">
          <div className="rounded-lg border border-white/[0.10] bg-[#0D1117] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#B9C1C9]">
            Loading Ask ContractX…
          </div>
        </main>
      }
    >
      <AskContractXContent />
    </Suspense>
  );
}

