"use client";



import React, { Suspense, useEffect, useMemo, useState } from "react";

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



type ReviewFinding = {

  review_layer?: string;

  clause_ref?: string;

  clause_title?: string;

  source_type?: string;

  benchmark_source?: string;

  status?: string;

  risk_level?: string;

  contract_position?: string;

  benchmark_position?: string;

  deviation?: string;

  commercial_exposure?: string;

  recommendation?: string;

  suggested_amendment?: string;

};



type ReviewResponse = {

  status?: string;

  source?: string;

  metrics?: {

    clauses_reviewed?: number;

    critical_findings?: number;

    high_risk_findings?: number;

    medium_risk_findings?: number;

    missing_provisions?: number;

    priority_amendments?: number;

  };

  executive_summary?: {

    overall_assessment?: string;

    incorporated_conditions?: string[];

    missing_or_weak_conditions?: string[];

    priority_recommendations?: string[];

    conclusion?: string;

  };

  review_coverage?: Array<{

    review_area?: string;

    incorporated?: string;

    missing_or_weak?: string;

    advisory_comment?: string;

  }>;

  findings?: ReviewFinding[];

  ai_processing?: {

    provider?: string;

    model_id?: string;

    model_key?: string;

  };

  authority?: {

    primary_contract?: ReferenceSelection | null;

    selected_references?: ReferenceSelection[];

    primary_contract_source_count?: number;

    reference_source_count?: number;

    standard_contract_source_count?: number;

    hierarchy_note?: string;

  };

};



// All browser API calls go through the same-origin Next.js proxy.

// The proxy forwards to the ContractX FastAPI backend configured by

// CONTRACTX_BACKEND_URL in contractx-ui/.env.local.

const API_BASE = "/api/contractx";



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



function pretty(value: string) {

  return value.replaceAll("_", " ");

}



function Pill({

  label,

  tone = "default",

}: {

  label: string;

  tone?: "default" | "gold" | "blue" | "green" | "red" | "amber";

}) {

  const tones = {

    default: "border-white/10 bg-white/[0.04] text-zinc-300",

    gold: "border-[#D6B36A]/30 bg-[#D6B36A]/10 text-[#E9CB8C]",

    blue: "border-sky-400/20 bg-sky-400/10 text-sky-200",

    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",

    red: "border-red-400/20 bg-red-400/10 text-red-200",

    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",

  };



  return (

    <span

      className={cx(

        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",

        tones[tone]

      )}

    >

      {label}

    </span>

  );

}



function riskTone(level?: string) {

  const value = (level || "").toUpperCase();



  if (value === "CRITICAL") return "red";

  if (value === "HIGH") return "amber";

  if (value === "MEDIUM") return "blue";

  if (value === "LOW") return "green";



  return "default";

}



function BespokeReviewContent() {

  const [file, setFile] = useState<File | null>(null);



  const {

    projectId,

    project,

    tenantId,

    loading: projectLoading,

    error: projectError,

  } = useActiveProject();

  const supabase = useMemo(() => createClient(), []);
  const [theme, setTheme] = useState<Theme>("dark");
  const [projectNoticeDismissed, setProjectNoticeDismissed] = useState(false);




  const [jurisdiction, setJurisdiction] = useState("uae_gcc");

  const [stakeholderRole, setStakeholderRole] =

    useState("Contract Manager");

  useEffect(() => {
    const saved = window.localStorage.getItem("contractx-theme");
    const initialTheme: Theme =
      saved === "light" || saved === "dark"
        ? saved
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";

    setTheme(initialTheme);
    document.documentElement.dataset.contractxTheme = initialTheme;
  }, []);

  useEffect(() => {
    setProjectNoticeDismissed(false);
  }, [projectError]);

  function updateTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    window.localStorage.setItem("contractx-theme", nextTheme);
    document.documentElement.dataset.contractxTheme = nextTheme;
    window.dispatchEvent(
      new CustomEvent("contractx-theme-change", {
        detail: nextTheme,
      })
    );
  }

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




  useEffect(() => {

    const value = String(project?.jurisdiction || project?.country || "")

      .trim()

      .toLowerCase();



    if (!value) return;



    if (value.includes("singapore")) {

      setJurisdiction("singapore");

      return;

    }



    if (

      value.includes("uae") ||

      value.includes("united arab emirates") ||

      value.includes("gcc")

    ) {

      setJurisdiction("uae_gcc");

      return;

    }



    setJurisdiction("global");

  }, [project]);



  const [standardContractsOpen, setStandardContractsOpen] =

    useState<boolean>(false);



  const [aiModelStatus, setAiModelStatus] =

    useState<"checking" | "live" | "unavailable">("checking");



  const [aiModelLabel, setAiModelLabel] =

    useState<string>("Checking API model...");



  const [selectedStandardContracts, setSelectedStandardContracts] = useState<

    ReferenceSelection[]

  >([]);



  const [standardContractSearch, setStandardContractSearch] = useState("");



  const [loading, setLoading] = useState(false);

  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  const [response, setResponse] = useState<ReviewResponse | null>(null);

  const [error, setError] = useState<string | null>(null);

  const noticeMessage =
    error || (!projectNoticeDismissed ? projectError : null);

  const noticeTitle = error
    ? "Bespoke Review could not complete the action"
    : "Project context required";

  function closeNotice() {
    if (error) {
      setError(null);
      return;
    }

    if (projectError) {
      setProjectNoticeDismissed(true);
    }
  }




  const selectedStandardContractKeys = useMemo(

    () =>

      new Set(

        selectedStandardContracts.map((item) => JSON.stringify(item))

      ),

    [selectedStandardContracts]

  );



  const filteredReferenceLibrary = useMemo(() => {

    const query = standardContractSearch.trim().toLowerCase();



    if (!query) return referenceLibrary;



    return referenceLibrary.filter((ref) => {

      const searchable = [

        ref.standard_body,

        ref.contract_family,

        ref.edition,

        ref.jurisdiction,

      ]

        .filter(Boolean)

        .join(" ")

        .replaceAll("_", " ")

        .toLowerCase();



      return searchable.includes(query);

    });

  }, [standardContractSearch]);



  useEffect(() => {

    let cancelled = false;



    async function checkProjectModel() {

      setAiModelStatus("checking");

      setAiModelLabel("Checking API model...");



      try {

        const qs = new URLSearchParams({

          tenant_id: tenantId,

          project_id: projectId ?? "",

        });



        const result = await fetch(
          `${API_BASE}/api/v1/models/project?${qs.toString()}`,
          {
            cache: "no-store",
            headers: await getAuthHeaders(),
          }
        );



        const data = await result.json().catch(() => ({}));



        if (cancelled) return;



        if (!result.ok) {

          setAiModelStatus("unavailable");

          setAiModelLabel("API model unavailable");

          return;

        }



        if (

          data.status === "selection_required" ||

          data.configured === false ||

          !data.policy

        ) {

          setAiModelStatus("unavailable");

          setAiModelLabel("No API model configured");

          return;

        }



        const policy = data.policy;

        const provider = String(policy.provider || "OpenAI");

        const modelId = String(policy.model_id || policy.model_key || "");



        if (!modelId) {

          setAiModelStatus("unavailable");

          setAiModelLabel("No API model configured");

          return;

        }



        setAiModelLabel(`${provider} · ${modelId}`);

        setAiModelStatus("live");

      } catch (modelError) {

        if (cancelled) return;



        console.error(

          "ContractX Bespoke Review model policy check failed:",

          modelError

        );



        setAiModelStatus("unavailable");

        setAiModelLabel("API model unavailable");

      }

    }



    if (!projectLoading && tenantId && projectId) {

      void checkProjectModel();

    }



    return () => {

      cancelled = true;

    };

  }, [tenantId, projectId, projectLoading]);





  const toggleStandardContract = (ref: ReferenceSelection) => {

    const key = JSON.stringify(ref);



    if (selectedStandardContractKeys.has(key)) {

      setSelectedStandardContracts((prev) =>

        prev.filter((item) => JSON.stringify(item) !== key)

      );

      return;

    }



    if (selectedStandardContracts.length >= 3) {

      return;

    }



    setSelectedStandardContracts((prev) => [...prev, ref]);

  };



  const runReview = async () => {

    if (projectLoading) {

      setError("Loading selected project context...");

      return;

    }



    if (projectError || !tenantId || !projectId) {

      setError(

        projectError ||

          "No active project is selected. Open Bespoke Review from Portfolio."

      );

      return;

    }



    if (!file) {

      setError("Upload a project or bespoke contract before running the review.");

      return;

    }



    setLoading(true);

    setError(null);



    try {

      const form = new FormData();



      form.append("file", file);

      form.append("tenant_id", tenantId);

      form.append("project_id", projectId);

      form.append("jurisdiction", jurisdiction);

      form.append("stakeholder_role", stakeholderRole);



      // Unified customer-facing Standard Contracts selector.

      // Backend compatibility is preserved by sending the first selected

      // standard contract through the existing primary_* fields and the

      // remaining selections through supporting_references_json.

      const firstStandardContract = selectedStandardContracts[0] || null;

      const additionalStandardContracts = selectedStandardContracts.slice(1, 3);



      if (firstStandardContract) {

        form.append(

          "primary_standard_body",

          firstStandardContract.standard_body || ""

        );

        form.append(

          "primary_contract_family",

          firstStandardContract.contract_family || ""

        );

        form.append(

          "primary_edition",

          firstStandardContract.edition || ""

        );

        form.append(

          "primary_jurisdiction",

          firstStandardContract.jurisdiction || ""

        );

      }



      form.append(

        "supporting_references_json",

        JSON.stringify(additionalStandardContracts)

      );



      const result = await fetch(
        `${API_BASE}/api/v1/contract-review/analyze`,
        {
          method: "POST",
          headers: await getAuthHeaders(),
          body: form,
        }
      );



      if (!result.ok) {

        let detail = `Request failed (${result.status})`;



        try {

          const body = await result.json();

          detail = body?.detail || detail;

        } catch {

          // keep default

        }



        throw new Error(detail);

      }



      const data = (await result.json()) as ReviewResponse;

      setResponse(data);

    } catch (requestError) {

      setResponse(null);

      setError(

        requestError instanceof Error

          ? requestError.message

          : "Bespoke Review failed."

      );

    } finally {

      setLoading(false);

    }

  };



  const exportReview = async (format: "pdf" | "docx") => {

    if (!response?.findings?.length) return;



    if (projectLoading || projectError || !tenantId || !projectId) {

      setError(

        projectError ||

          "No active project is selected. Open Bespoke Review from Portfolio."

      );

      return;

    }



    setExporting(format);

    setError(null);



    try {

      const result = await fetch(

        `${API_BASE}/api/v1/contract-review/export`,

        {

          method: "POST",

          headers: await getAuthHeaders(true),

          body: JSON.stringify({

            project_id: projectId ?? "",

            tenant_id: tenantId,

            jurisdiction,

            stakeholder_role: stakeholderRole,

            format,

            metrics: response.metrics || null,

            authority: response.authority || null,

            executive_summary: response.executive_summary || null,

            review_coverage: response.review_coverage || null,

            findings: response.findings,

          }),

        }

      );



      if (!result.ok) {

        let detail = `Export failed (${result.status})`;



        try {

          const body = await result.json();

          detail = body?.detail || detail;

        } catch {

          // keep default

        }



        throw new Error(detail);

      }



      const blob = await result.blob();

      const url = window.URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = url;

      anchor.download = `ContractX_Bespoke_Review_${projectId.slice(0, 8)}.${format}`;

      document.body.appendChild(anchor);

      anchor.click();

      anchor.remove();

      window.URL.revokeObjectURL(url);

    } catch (exportError) {

      setError(

        exportError instanceof Error

          ? exportError.message

          : "Review export failed."

      );

    } finally {

      setExporting(null);

    }

  };



  return (

    <main
      className={cx(
        "cx-review-shell flex min-h-screen flex-col bg-[#07090D] text-[#F5F3EE] transition-colors duration-300",
        theme === "light" ? "cx-platform-light" : ""
      )}
    >

      <style>{`

        .cx-review-shell {

          font-family: Arial, Helvetica, sans-serif;

          font-size: 14px;

          line-height: 1.58;

          background: #07090D;

          color: #F5F3EE;
          --cx-panel:#0D1117;
          --cx-panel-2:#080B10;
          --cx-border:rgba(255,255,255,.10);
          --cx-text:#F5F3EE;
          --cx-muted:#AAB3C0;
          --cx-footer-bg:#050608;
          --cx-footer-text:#F4F1EA;
          --cx-footer-muted:rgba(244,241,234,.40);
          --cx-footer-muted-strong:rgba(244,241,234,.48);
          --cx-footer-muted-soft:rgba(244,241,234,.30);
          --cx-footer-border:rgba(255,255,255,.065);
          --cx-footer-border-soft:rgba(255,255,255,.05);
          --cx-footer-divider:rgba(255,255,255,.10);
          --cx-footer-hover:#F4F1EA;
          --cx-footer-accent:#D2B06F;

        }



        .cx-review-shell .text-xs {

          font-size: 12.5px !important;

          line-height: 1.55 !important;

        }



        .cx-review-shell .text-sm {

          font-size: 14px !important;

          line-height: 1.55 !important;

        }



        .cx-review-shell .text-\\[10px\\] {

          font-size: 11.5px !important;

          line-height: 1.5 !important;

        }



        .cx-review-shell input,

        .cx-review-shell select,

        .cx-review-shell textarea,

        .cx-review-shell button {

          font-family: Arial, Helvetica, sans-serif;

          font-size: 13px;

          line-height: 1.45;

        }



        /* DARK MODE */

        .cx-review-shell .bg-\\[\\#0D1117\\] {

          background: #0D1117 !important;

          color: #F5F7FA !important;

        }



        .cx-review-shell .bg-\\[\\#080B10\\],

        .cx-review-shell .bg-black\\/20,

        .cx-review-shell .bg-black\\/15,

        .cx-review-shell .bg-black\\/10 {

          background: #080B10 !important;

          color: #F5F7FA !important;

        }



        .cx-review-shell .text-white {

          color: #F5F7FA !important;

        }



        .cx-review-shell .text-zinc-200,

        .cx-review-shell .text-zinc-300 {

          color: #E7EAF0 !important;

        }



        .cx-review-shell .text-zinc-400 {

          color: #C7CDD7 !important;

        }



        .cx-review-shell .text-zinc-500,

        .cx-review-shell .text-zinc-600,

        .cx-review-shell .text-zinc-700 {

          color: #AAB3C0 !important;

        }



        .cx-review-shell input,

        .cx-review-shell select,

        .cx-review-shell textarea {

          background: #080B10 !important;

          color: #F4F6F8 !important;

          border-color: rgba(255,255,255,.14) !important;

        }



        .cx-review-shell input::placeholder,

        .cx-review-shell textarea::placeholder {

          color: #8F9AAA !important;

        }



        /* LIGHT MODE — controlled only by ContractXAppShell */

        .cx-review-shell.cx-platform-light {

          background: #F5F7FA !important;

          color: #172033 !important;
          --cx-panel:#FFFFFF;
          --cx-panel-2:#F7F9FC;
          --cx-border:#D5DDE7;
          --cx-text:#172033;
          --cx-muted:#526173;
          --cx-footer-bg:#F5F7FA;
          --cx-footer-text:#172033;
          --cx-footer-muted:#566577;
          --cx-footer-muted-strong:#46566A;
          --cx-footer-muted-soft:#758295;
          --cx-footer-border:#D9E0E8;
          --cx-footer-border-soft:#E3E8EE;
          --cx-footer-divider:#D9E0E8;
          --cx-footer-hover:#172033;
          --cx-footer-accent:#A87924;

        }



        .cx-review-shell.cx-platform-light .bg-\\[\\#0D1117\\],

        .cx-review-shell.cx-platform-light .bg-\\[\\#080B10\\],

        .cx-review-shell.cx-platform-light .bg-black\\/20,

        .cx-review-shell.cx-platform-light .bg-black\\/15,

        .cx-review-shell.cx-platform-light .bg-black\\/10 {

          background: #FFFFFF !important;

          color: #172033 !important;

          border-color: #D5DDE7 !important;

          box-shadow: 0 8px 24px rgba(15,23,42,.045);

        }



        .cx-review-shell.cx-platform-light .border-white\\/10,

        .cx-review-shell.cx-platform-light .border-white\\/15,

        .cx-review-shell.cx-platform-light .border-white\\/20 {

          border-color: #D5DDE7 !important;

        }



        .cx-review-shell.cx-platform-light .text-white {

          color: #172033 !important;

        }



        .cx-review-shell.cx-platform-light .text-zinc-200,

        .cx-review-shell.cx-platform-light .text-zinc-300 {

          color: #263548 !important;

        }



        .cx-review-shell.cx-platform-light .text-zinc-400 {

          color: #405066 !important;

        }



        .cx-review-shell.cx-platform-light .text-zinc-500,

        .cx-review-shell.cx-platform-light .text-zinc-600,

        .cx-review-shell.cx-platform-light .text-zinc-700 {

          color: #4B5B70 !important;

        }



        .cx-review-shell.cx-platform-light input,

        .cx-review-shell.cx-platform-light select,

        .cx-review-shell.cx-platform-light textarea {

          background: #FFFFFF !important;

          color: #172033 !important;

          border-color: #C7D1DC !important;

        }



        .cx-review-shell.cx-platform-light input::placeholder,

        .cx-review-shell.cx-platform-light textarea::placeholder {

          color: #78879A !important;

        }



        .cx-review-shell.cx-platform-light [class*="bg-white/"] {

          color: #172033 !important;

        }



        .cx-review-shell.cx-platform-light .text-\\[\\#E9CB8C\\],

        .cx-review-shell.cx-platform-light .text-\\[\\#D6B36A\\] {

          color: #765114 !important;

        }



        .cx-review-shell.cx-platform-light .bg-\\[\\#D6B36A\\] {

          background: #C99534 !important;

          color: #111318 !important;

        }



        /*

         * FINAL semantic light-mode overrides.

         * These classes are deliberately independent of Tailwind arbitrary

         * class parsing and therefore reliably follow the App Shell theme.

         */



        .cx-review-shell.cx-platform-light .cx-review-card,

        .cx-review-shell.cx-platform-light .cx-standard-contracts-card,

        .cx-review-shell.cx-platform-light .cx-findings-card {

          background: #FFFFFF !important;

          color: #172033 !important;

          border-color: #D1D9E4 !important;

          box-shadow: 0 8px 24px rgba(15,23,42,.05) !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-inner-card,

        .cx-review-shell.cx-platform-light .cx-review-reasoning-card {

          background: #F7F9FC !important;

          color: #172033 !important;

          border-color: #D5DDE7 !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-authority-card {

          background: #FFF8E8 !important;

          color: #172033 !important;

          border-color: #DFC98E !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-card .text-white,

        .cx-review-shell.cx-platform-light .cx-standard-contracts-card .text-white,

        .cx-review-shell.cx-platform-light .cx-findings-card .text-white,

        .cx-review-shell.cx-platform-light .cx-review-inner-card .text-white,

        .cx-review-shell.cx-platform-light .cx-review-reasoning-card .text-white {

          color: #172033 !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-card .text-zinc-200,

        .cx-review-shell.cx-platform-light .cx-review-card .text-zinc-300,

        .cx-review-shell.cx-platform-light .cx-standard-contracts-card .text-zinc-200,

        .cx-review-shell.cx-platform-light .cx-standard-contracts-card .text-zinc-300,

        .cx-review-shell.cx-platform-light .cx-findings-card .text-zinc-200,

        .cx-review-shell.cx-platform-light .cx-findings-card .text-zinc-300,

        .cx-review-shell.cx-platform-light .cx-review-inner-card .text-zinc-200,

        .cx-review-shell.cx-platform-light .cx-review-inner-card .text-zinc-300,

        .cx-review-shell.cx-platform-light .cx-review-reasoning-card .text-zinc-200,

        .cx-review-shell.cx-platform-light .cx-review-reasoning-card .text-zinc-300 {

          color: #27364A !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-card .text-zinc-400,

        .cx-review-shell.cx-platform-light .cx-review-card .text-zinc-500,

        .cx-review-shell.cx-platform-light .cx-review-card .text-zinc-600,

        .cx-review-shell.cx-platform-light .cx-review-card .text-zinc-700,

        .cx-review-shell.cx-platform-light .cx-standard-contracts-card .text-zinc-400,

        .cx-review-shell.cx-platform-light .cx-standard-contracts-card .text-zinc-500,

        .cx-review-shell.cx-platform-light .cx-standard-contracts-card .text-zinc-600,

        .cx-review-shell.cx-platform-light .cx-standard-contracts-card .text-zinc-700,

        .cx-review-shell.cx-platform-light .cx-findings-card .text-zinc-400,

        .cx-review-shell.cx-platform-light .cx-findings-card .text-zinc-500,

        .cx-review-shell.cx-platform-light .cx-findings-card .text-zinc-600,

        .cx-review-shell.cx-platform-light .cx-findings-card .text-zinc-700,

        .cx-review-shell.cx-platform-light .cx-review-inner-card .text-zinc-400,

        .cx-review-shell.cx-platform-light .cx-review-inner-card .text-zinc-500,

        .cx-review-shell.cx-platform-light .cx-review-inner-card .text-zinc-600,

        .cx-review-shell.cx-platform-light .cx-review-inner-card .text-zinc-700,

        .cx-review-shell.cx-platform-light .cx-review-reasoning-card .text-zinc-400,

        .cx-review-shell.cx-platform-light .cx-review-reasoning-card .text-zinc-500,

        .cx-review-shell.cx-platform-light .cx-review-reasoning-card .text-zinc-600,

        .cx-review-shell.cx-platform-light .cx-review-reasoning-card .text-zinc-700 {

          color: #4A5A6F !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-authority-card .text-zinc-300,

        .cx-review-shell.cx-platform-light .cx-review-authority-card .text-zinc-400,

        .cx-review-shell.cx-platform-light .cx-review-authority-card .text-zinc-500 {

          color: #4A4F58 !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-authority-card .text-\\[\\#E9CB8C\\] {

          color: #745015 !important;

        }



        /*

         * Shared ContractX footer.

         * Explicit theme variables are supplied here so the shared footer

         * remains readable in both dark and light App Shell modes.

         */

        .cx-review-shell .cx-review-footer {

          --cx-footer-bg: #050608;

          --cx-footer-text: #F4F1EA;

          --cx-footer-muted: rgba(244,241,234,.58);

          --cx-footer-muted-strong: rgba(244,241,234,.70);

          --cx-footer-muted-soft: rgba(244,241,234,.46);

          --cx-footer-border: rgba(255,255,255,.08);

          --cx-footer-border-soft: rgba(255,255,255,.06);

          --cx-footer-divider: rgba(255,255,255,.10);

          --cx-footer-hover: #FFFFFF;

          --cx-footer-accent: #D2B06F;

        }



        .cx-review-shell .cx-review-footer footer {

          background: var(--cx-footer-bg) !important;

          color: var(--cx-footer-text) !important;

          border-color: var(--cx-footer-border) !important;

        }



        .cx-review-shell .cx-review-footer footer p,

        .cx-review-shell .cx-review-footer footer span,

        .cx-review-shell .cx-review-footer footer div,

        .cx-review-shell .cx-review-footer footer a {

          color: var(--cx-footer-muted) !important;

        }



        .cx-review-shell .cx-review-footer footer a:hover {

          color: var(--cx-footer-hover) !important;

        }



        .cx-review-shell .cx-review-footer footer .text-\\[\\#F4F1EA\\] {

          color: var(--cx-footer-text) !important;

        }



        .cx-review-shell .cx-review-footer footer .text-\\[\\#D8A84E\\],

        .cx-review-shell .cx-review-footer footer .text-\\[\\#D2B06F\\] {

          color: var(--cx-footer-accent) !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-footer {

          --cx-footer-bg: #EBE7DE;

          --cx-footer-text: #17191C;

          --cx-footer-muted: #4F5965;

          --cx-footer-muted-strong: #3B434C;

          --cx-footer-muted-soft: #66717C;

          --cx-footer-border: rgba(23,25,28,.12);

          --cx-footer-border-soft: rgba(23,25,28,.10);

          --cx-footer-divider: rgba(23,25,28,.12);

          --cx-footer-hover: #17191C;

          --cx-footer-accent: #8B6118;

        }



        .cx-review-shell.cx-platform-light .cx-review-footer footer {

          background: var(--cx-footer-bg) !important;

          color: var(--cx-footer-text) !important;

          border-color: var(--cx-footer-border) !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-footer footer p,

        .cx-review-shell.cx-platform-light .cx-review-footer footer span,

        .cx-review-shell.cx-platform-light .cx-review-footer footer div,

        .cx-review-shell.cx-platform-light .cx-review-footer footer a {

          color: var(--cx-footer-muted) !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-footer footer a:hover {

          color: var(--cx-footer-hover) !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-footer footer .text-\\[\\#F4F1EA\\] {

          color: var(--cx-footer-text) !important;

        }



        .cx-review-shell.cx-platform-light .cx-review-footer footer .text-\\[\\#D8A84E\\],

        .cx-review-shell.cx-platform-light .cx-review-footer footer .text-\\[\\#D2B06F\\] {

          color: var(--cx-footer-accent) !important;

        }



        .cx-review-shell .cx-review-footer footer [class*="border-white/"],

        .cx-review-shell.cx-platform-light .cx-review-footer footer [class*="border-white/"] {

          border-color: var(--cx-footer-border-soft) !important;

        }

      `}</style>



      <ContractXNoticeModal
        open={Boolean(noticeMessage)}
        variant="error"
        title={noticeTitle}
        message={noticeMessage || ""}
        onClose={closeNotice}
      />

      <div className="mx-auto w-full max-w-[1500px] flex-1 px-5 py-6 lg:px-8">

        {/* HEADER */}

        <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">

          <div>

            <div className="mb-2 flex items-center gap-3">

              <div className="text-[12px] uppercase tracking-[0.28em] text-[#D6B36A]">

                7-Layer Contract Review

              </div>

              <Pill label="Authority-Aligned" tone="gold" />

            </div>



            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white lg:text-4xl">

              Bespoke Review

            </h1>



            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">

              Review bespoke or project contract wording against selected

              Standard Contracts, identify deviations and commercial exposure,

              and generate structured amendment recommendations.

            </p>

          </div>



          <div className="flex flex-wrap items-center gap-2">
            <ContractXThemeSwitch theme={theme} onChange={updateTheme} />
          </div>

        </div>



        <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">

          {/* LEFT */}

          <aside className="space-y-5">

            <div className="cx-review-card rounded-2xl border border-white/10 bg-[#0D1117] p-5">

              <div className="text-sm font-semibold text-white">

                Project Contract

              </div>

              <p className="mt-1 text-xs leading-5 text-zinc-500">

                Upload the contract to be reviewed. This remains the primary

                project-specific authority.

              </p>



              <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-white/15 bg-black/15 p-5 text-center transition hover:border-[#D6B36A]/30 hover:bg-[#D6B36A]/[0.03]">

                <input

                  type="file"

                  accept=".pdf,.docx"

                  className="hidden"

                  onChange={(event) =>

                    setFile(event.target.files?.[0] || null)

                  }

                />



                <div className="text-sm font-medium text-zinc-200">

                  {file ? file.name : "Select PDF or DOCX"}

                </div>

                <div className="mt-1 text-xs text-zinc-600">

                  Executed contract, Particular Conditions or bespoke draft

                </div>

              </label>



              {file && (

                <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-200">

                  Uploaded contract selected

                </div>

              )}

            </div>



            <div className="cx-review-card cx-standard-contracts-card rounded-2xl border border-white/10 bg-[#0D1117]">

              <button

                type="button"

                onClick={() =>

                  setStandardContractsOpen((current: boolean) => !current)

                }

                className="flex w-full items-start justify-between gap-4 p-5 text-left"

                aria-expanded={standardContractsOpen}

              >

                <div className="min-w-0">

                  <div className="flex items-center gap-2">

                    <span className="text-sm font-semibold text-white">

                      Standard Contracts

                    </span>



                    <span className="text-[10px] font-semibold text-zinc-500">

                      {selectedStandardContracts.length}/3 selected

                    </span>

                  </div>



                  <p className="mt-1 text-xs leading-5 text-zinc-500">

                    Select up to three approved standard contract references for

                    comparison. They do not override the uploaded project contract.

                  </p>

                </div>



                <span

                  className="mt-0.5 text-sm font-semibold text-[#D6B36A]"

                  aria-hidden="true"

                >

                  {standardContractsOpen ? "▾" : "▸"}

                </span>

              </button>



              {standardContractsOpen && (

                <div className="border-t border-white/10 px-5 pb-5">

                  <div className="pt-3">

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

                      <div className="min-w-0 flex-1">

                        <input

                          type="search"

                          value={standardContractSearch}

                          onChange={(event) =>

                            setStandardContractSearch(event.target.value)

                          }

                          placeholder="Search contract, jurisdiction or edition..."

                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[#D6B36A]/45"

                        />

                      </div>



                      <button

                        type="button"

                        onClick={() => setSelectedStandardContracts([])}

                        disabled={selectedStandardContracts.length === 0}

                        className="shrink-0 border-b border-current pb-0.5 text-[10px] font-semibold text-zinc-500 transition hover:text-[#D6B36A] disabled:cursor-not-allowed disabled:opacity-35"

                      >

                        Clear selected

                      </button>

                    </div>



                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">

                      <span>

                        {filteredReferenceLibrary.length} reference

                        {filteredReferenceLibrary.length === 1 ? "" : "s"} found

                      </span>



                      {standardContractSearch && (

                        <button

                          type="button"

                          onClick={() => setStandardContractSearch("")}

                          className="font-semibold text-[#D6B36A]"

                        >

                          Clear search

                        </button>

                      )}

                    </div>

                  </div>



                  <div className="mt-2 max-h-[340px] overflow-y-auto border-y border-white/10 pr-1">

                    <div className="divide-y divide-white/10">

                      {filteredReferenceLibrary.map((ref) => {

                        const key = JSON.stringify(ref);

                        const selected = selectedStandardContractKeys.has(key);

                        const blocked =

                          !selected && selectedStandardContracts.length >= 3;



                        return (

                          <label

                            key={`standard-${key}`}

                            className={cx(

                              "flex w-full items-start gap-3 px-1 py-3 text-left transition",

                              blocked

                                ? "cursor-not-allowed opacity-40"

                                : "cursor-pointer hover:bg-white/[0.025]",

                              selected && "bg-[#D6B36A]/[0.05]"

                            )}

                          >

                            <input

                              type="checkbox"

                              checked={selected}

                              disabled={blocked}

                              onChange={() => toggleStandardContract(ref)}

                              className="mt-0.5 h-4 w-4 shrink-0 accent-[#D6B36A]"

                            />



                            <span className="min-w-0 flex-1">

                              <span className="block text-sm font-medium text-white">

                                {ref.standard_body} {pretty(ref.contract_family)}

                              </span>

                              <span className="mt-1 block text-xs text-zinc-500">

                                {ref.edition} · {ref.jurisdiction}

                              </span>

                            </span>

                          </label>

                        );

                      })}



                      {filteredReferenceLibrary.length === 0 && (

                        <div className="px-4 py-8 text-center text-xs text-zinc-500">

                          No standard contract reference matches this search.

                        </div>

                      )}

                    </div>

                  </div>

                </div>

              )}

            </div>



          </aside>



          {/* RIGHT */}

          <section className="space-y-5">

            <div className="cx-review-card rounded-2xl border border-white/10 bg-[#0D1117] p-5">

              {projectLoading && (

                <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-300">

                  Loading selected project context...

                </div>

              )}



              



              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">





                <label>

                  <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-zinc-600">

                    Project

                  </span>

                  <input

                    value={

                      project?.project_name

                        ? `${project.project_name}${project.project_code ? ` · ${project.project_code}` : ""}`

                        : projectId || ""

                    }

                    readOnly

                    className="w-full cursor-default rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300 outline-none"

                  />

                </label>



                <label>

                  <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-zinc-600">

                    Jurisdiction

                  </span>

                  <select

                    value={jurisdiction}

                    onChange={(e) => setJurisdiction(e.target.value)}

                    className="w-full rounded-lg border border-white/10 bg-[#080B10] px-3 py-2 text-xs text-zinc-300 outline-none"

                  >

                    <option value="uae_gcc">UAE / GCC</option>

                    <option value="singapore">Singapore</option>

                    <option value="global">Global</option>

                  </select>

                </label>



                <label>

                  <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-zinc-600">

                    Stakeholder Context

                  </span>

                  <select

                    value={stakeholderRole}

                    onChange={(e) => setStakeholderRole(e.target.value)}

                    className="w-full rounded-lg border border-white/10 bg-[#080B10] px-3 py-2 text-xs text-zinc-300 outline-none"

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

                  <span className="mt-1.5 block text-[10px] leading-4 text-zinc-500">

                    Context only — findings, risk grading and recommendations remain independent and stakeholder-neutral.

                  </span>

                </label>

              </div>



              <div className="cx-review-reasoning-card mt-5 rounded-xl border border-white/10 bg-black/10 p-4">

                <div className="flex flex-wrap items-center justify-between gap-3">

                  <div>

                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">

                      AI Model

                    </div>



                    <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-zinc-200">

                      <span

                        className={cx(

                          "h-2.5 w-2.5 rounded-full",

                          aiModelStatus === "live"

                            ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.10)]"

                            : aiModelStatus === "checking"

                              ? "bg-amber-400"

                              : "bg-red-400"

                        )}

                        aria-hidden="true"

                      />

                      <span>{aiModelLabel}</span>

                    </div>

                  </div>



                  <div

                    className={cx(

                      "text-[10px] font-semibold uppercase tracking-[0.12em]",

                      aiModelStatus === "live"

                        ? "text-emerald-400"

                        : aiModelStatus === "checking"

                          ? "text-amber-400"

                          : "text-red-400"

                    )}

                  >

                    {aiModelStatus === "live"

                      ? "Live"

                      : aiModelStatus === "checking"

                        ? "Checking"

                        : "Unavailable"}

                  </div>

                </div>

              </div>



              <div className="cx-review-authority-card mt-5 rounded-xl border border-[#D6B36A]/20 bg-[#D6B36A]/[0.05] p-4">

                <div className="text-xs font-semibold uppercase tracking-[0.15em] text-[#E9CB8C]">

                  Review Authority

                </div>

                <div className="mt-2 text-sm leading-6 text-zinc-300">

                  Uploaded project contract → Particular Conditions / amendments

                  → selected Standard Contracts for comparison.

                </div>

              </div>



              



              <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

                <div className="text-[10px] text-zinc-500">

                  {response?.ai_processing?.model_id

                    ? `Generated with ${response.ai_processing.provider || "AI"} · ${response.ai_processing.model_id}`

                    : "Uses the AI model selected for this project."}

                </div>



                <div className="flex flex-wrap justify-end gap-2">

                  {Boolean(response?.findings?.length) && (

                    <>

                      <button

                        type="button"

                        onClick={() => exportReview("docx")}

                        disabled={Boolean(exporting)}

                        className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:border-white/20 disabled:opacity-50"

                      >

                        {exporting === "docx" ? "Exporting..." : "Export Word"}

                      </button>



                      <button

                        type="button"

                        onClick={() => exportReview("pdf")}

                        disabled={Boolean(exporting)}

                        className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:border-white/20 disabled:opacity-50"

                      >

                        {exporting === "pdf" ? "Exporting..." : "Export PDF"}

                      </button>

                    </>

                  )}



                  <button

                    type="button"

                    onClick={runReview}

                    disabled={

                      loading ||

                      projectLoading ||

                      Boolean(projectError) ||

                      !tenantId ||

                      !projectId

                    }

                    className="inline-flex min-w-[200px] items-center justify-center rounded-xl border border-[#D6B36A]/40 bg-[#D6B36A] px-5 py-3 text-sm font-semibold text-[#111318] shadow-lg shadow-[#D6B36A]/10 transition hover:bg-[#E1C17D] disabled:cursor-wait disabled:opacity-60"

                  >

                    {loading ? "Running 7-Layer Review..." : "Run Bespoke Review"}

                  </button>

                </div>

              </div>

            </div>



            {/* METRICS */}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">

              {[

                ["Clauses", response?.metrics?.clauses_reviewed ?? 0],

                ["Critical", response?.metrics?.critical_findings ?? 0],

                ["High", response?.metrics?.high_risk_findings ?? 0],

                ["Medium", response?.metrics?.medium_risk_findings ?? 0],

                ["Missing", response?.metrics?.missing_provisions ?? 0],

                ["Priority", response?.metrics?.priority_amendments ?? 0],

              ].map(([label, value]) => (

                <div

                  key={String(label)}

                  className="cx-review-card rounded-xl border border-white/10 bg-[#0D1117] p-4"

                >

                  <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">

                    {label}

                  </div>

                  <div className="mt-2 text-2xl font-semibold text-white">

                    {String(value)}

                  </div>

                </div>

              ))}

            </div>



            {/* AUTHORITY SUMMARY */}

            {response?.authority && (

              <div className="cx-review-card rounded-2xl border border-white/10 bg-[#0D1117] p-5">

                <div className="flex flex-wrap items-center gap-2">

                  <Pill

                    label={`Standard Contract Sources ${

                      response.authority.standard_contract_source_count ??

                      ((response.authority.primary_contract_source_count ?? 0) +

                        (response.authority.reference_source_count ?? 0))

                    }`}

                    tone="gold"

                  />

                </div>



                {response.authority.hierarchy_note && (

                  <div className="mt-3 text-xs leading-5 text-zinc-500">

                    {response.authority.hierarchy_note}

                  </div>

                )}

              </div>

            )}



            {/* FINDINGS */}

            <div className="cx-review-card cx-findings-card rounded-2xl border border-white/10 bg-[#0D1117] p-5">

              <div className="mb-4">

                <div className="text-sm font-semibold text-white">

                  7-Layer Review Findings

                </div>

                <div className="mt-1 text-xs text-zinc-600">

                  Contract position, benchmark comparison, deviation, exposure,

                  recommendation and amendment guidance.

                </div>

              </div>



              {!response?.findings?.length ? (

                <div className="cx-review-inner-card rounded-xl border border-dashed border-white/10 bg-black/10 px-5 py-12 text-center">

                  <div className="text-sm text-zinc-500">

                    Review findings will appear here.

                  </div>

                </div>

              ) : (

                <div className="space-y-4">

                  {response.findings.map((finding, index) => (

                    <article

                      key={`${finding.clause_ref}-${index}`}

                      className="cx-review-inner-card rounded-xl border border-white/10 bg-black/10 p-4"

                    >

                      <div className="flex flex-col gap-3 border-b border-white/10 pb-3 md:flex-row md:items-start md:justify-between">

                        <div>

                          <div className="text-xs uppercase tracking-[0.14em] text-zinc-600">

                            {finding.review_layer || "7-Layer Review"} · {finding.clause_ref || "Clause"}

                          </div>

                          <div className="mt-1 text-base font-semibold text-white">

                            {finding.clause_title || "Finding"}

                          </div>

                        </div>



                        <div className="flex flex-wrap gap-2">

                          <Pill

                            label={finding.risk_level || "N/A"}

                            tone={riskTone(finding.risk_level) as any}

                          />

                          <Pill

                            label={finding.status || "N/A"}

                            tone="default"

                          />

                        </div>

                      </div>



                      <div className="mt-4 grid gap-4 lg:grid-cols-2">

                        <div>

                          <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">

                            Contract Position

                          </div>

                          <div className="mt-2 text-sm leading-6 text-zinc-300">

                            {finding.contract_position || "N/A"}

                          </div>

                        </div>



                        <div>

                          <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">

                            Benchmark Position

                          </div>

                          <div className="mt-2 text-sm leading-6 text-zinc-300">

                            {finding.benchmark_position || "N/A"}

                          </div>

                          {finding.benchmark_source && (

                            <div className="mt-2 text-xs text-[#D6B36A]">

                              {finding.benchmark_source}

                            </div>

                          )}

                        </div>



                        <div>

                          <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">

                            Deviation

                          </div>

                          <div className="mt-2 text-sm leading-6 text-zinc-300">

                            {finding.deviation || "N/A"}

                          </div>

                        </div>



                        <div>

                          <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">

                            Commercial Exposure

                          </div>

                          <div className="mt-2 text-sm leading-6 text-zinc-300">

                            {finding.commercial_exposure || "N/A"}

                          </div>

                        </div>

                      </div>



                      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-4">

                        <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">

                          Recommendation

                        </div>

                        <div className="mt-2 text-sm leading-6 text-zinc-200">

                          {finding.recommendation || "N/A"}

                        </div>

                      </div>



                      <div className="mt-3 rounded-xl border border-[#D6B36A]/15 bg-[#D6B36A]/[0.04] p-4">

                        <div className="text-[11px] uppercase tracking-[0.14em] text-[#D6B36A]">

                          Suggested Amendment

                        </div>

                        <div className="mt-2 text-sm leading-6 text-zinc-300">

                          {finding.suggested_amendment || "N/A"}

                        </div>

                      </div>

                    </article>

                  ))}

                </div>

              )}

            </div>

          </section>

        </div>



      </div>



      <LegalFooter compact />

    </main>

  );

}

export default function BespokeReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#07090D] px-5 text-[#F5F3EE]">
          <div className="rounded-lg border border-white/[0.10] bg-[#0D1117] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#B9C1C9]">
            Loading Bespoke Review…
          </div>
        </main>
      }
    >
      <BespokeReviewContent />
    </Suspense>
  );
}

