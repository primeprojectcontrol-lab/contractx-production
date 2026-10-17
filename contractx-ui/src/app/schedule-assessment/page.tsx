"use client";







import React, { useEffect, useMemo, useState } from "react";



import {



Activity,



  AlertTriangle,



  BarChart3,



  CheckCircle2,



  ChevronDown,



  Fingerprint,



  Moon,



  Network,



  Printer,



  RefreshCw,



  Route,



  ShieldCheck,



  Sun,



  X,



} from "lucide-react";







import { useActiveProject } from "@/hooks/useActiveProject";



import { createClient } from "@/lib/supabase/client";
import LegalFooter from "@/components/LegalFooter";
import ContractXNoticeModal from "@/components/ContractXNoticeModal";
import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";







type Theme = "dark" | "light";



type AssessmentTab = "health" | "forensic";



type AnyJson = Record<string, any>;







type Programme = {



  id: string;



  tenant_id: string;



  project_id: string;



  file_name: string;



  schedule_type?: string | null;



  data_date?: string | null;



  uploaded_at?: string | null;



  programme_title?: string | null;



  revision_number?: number | null;



  revision_label?: string | null;



  programme_status?: string | null;



  is_current?: boolean;



  activity_count?: number | null;



  relationship_count?: number | null;



};







const API = "/api/contractx";







function cx(...values: Array<string | false | null | undefined>) {



  return values.filter(Boolean).join(" ");



}







function fmtDate(value?: string | null) {



  if (!value) return "—";



  const date = new Date(value);



  if (Number.isNaN(date.getTime())) return value;







  return date.toLocaleDateString(undefined, {



    day: "2-digit",



    month: "short",



    year: "numeric",



  });



}







function fmtNumber(value: unknown, digits = 2) {



  const number = Number(value);



  if (!Number.isFinite(number)) return "—";







  return number.toLocaleString(undefined, {



    maximumFractionDigits: digits,



    minimumFractionDigits: 0,



  });



}







function statusTone(status?: string) {



  const normalized = String(status || "").toUpperCase();







  if (normalized === "PASS" || normalized === "PASSED" || normalized === "HEALTHY") {



    return "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300";



  }







  if (



    normalized === "FAIL" ||



    normalized === "FAILED" ||



    normalized === "CRITICAL"



  ) {



    return "border-rose-400/20 bg-rose-400/[0.08] text-rose-300";



  }







  if (



    normalized === "REVIEW" ||



    normalized === "WARNING" ||



    normalized === "PARTIAL"



  ) {



    return "border-amber-400/20 bg-amber-400/[0.08] text-amber-300";



  }







  return "border-white/[0.08] bg-white/[0.03] text-[#8D98A5]";



}







function dcmaIndustryStandard(point: number) {



  switch (point) {



    case 1:



      return "≤ 5%";



    case 2:



      return "0%";



    case 3:



      return "≤ 5%";



    case 4:



      return "≥ 90% FS";



    case 5:



      return "≤ 5%";



    case 6:



      return "≤ 5% · High Float > 44 working days";



    case 7:



      return "0%";



    case 8:



      return "≤ 5% · High Duration > 44 working days";



    case 9:



      return "0%";



    case 10:



      return "0% unresourced where resource loading is required";



    case 11:



      return "≤ 5%";



    case 12:



      return "600 working-day stress test";



    case 13:



      return "≥ 0.95";



    case 14:



      return "≥ 0.95";



    default:



      return "—";



  }



}







function dcmaValue(metric: AnyJson) {



  const point = Number(metric?.point || 0);



  const status = String(metric?.status || "").toUpperCase();







  if (status === "NOT_ASSESSED" || status === "NOT ASSESSED") return "—";



  if (point === 12) return status === "PASS" || status === "FAIL" ? status : "—";







  const value = Number(metric?.value);



  if (!Number.isFinite(value)) return "—";







  if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(point)) {



    return `${fmtNumber(value)}%`;



  }







  return fmtNumber(value);



}







function MetricCard({



  label,



  value,



  helper,



  accent = false,



}: {



  label: string;



  value: React.ReactNode;



  helper?: string;



  accent?: boolean;



}) {



  return (



    <div



      className={cx(



        "rounded-2xl border p-4",



        accent



          ? "border-[#D2B06F]/20 bg-[#D2B06F]/[0.055]"



          : "border-white/[0.075] bg-white/[0.025]"



      )}



    >



      <div className="cx-assessment-muted text-[9px] font-black uppercase tracking-[0.14em] text-[#68727E]">



        {label}



      </div>



      <div className="cx-assessment-primary mt-2 text-[22px] font-black tracking-[-0.035em] text-[#F5F3EE]">



        {value}



      </div>



      {helper ? (



        <div className="cx-assessment-muted mt-1 text-[10px] leading-5 text-[#747F8B]">



          {helper}



        </div>



      ) : null}



    </div>



  );



}







function SectionCard({



  title,



  eyebrow,



  children,



  actions,



}: {



  title: string;



  eyebrow?: string;



  children: React.ReactNode;



  actions?: React.ReactNode;



}) {



  return (



    <section className="cx-assessment-card rounded-[26px] border border-white/[0.075] bg-[#0B0E12]/86 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] md:p-6">



      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">



        <div>



          {eyebrow ? (



            <div className="text-[9px] font-black uppercase tracking-[0.17em] text-[#D2B06F]">



              {eyebrow}



            </div>



          ) : null}



          <h2 className="cx-assessment-primary mt-1 text-[18px] font-black tracking-[-0.03em] text-[#F5F3EE]">



            {title}



          </h2>



        </div>



        {actions}



      </div>



      {children}



    </section>



  );



}







type MessageVariant = "error" | "success";



function ContractXMessageModal({

  variant,

  message,

  onClose,

}: {

  variant: MessageVariant;

  message: string;

  onClose: () => void;

}) {

  const isError = variant === "error";



  return (

    <div

      className="cx-no-print fixed inset-0 z-[200] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]"

      role={isError ? "alertdialog" : "dialog"}

      aria-modal="true"

      aria-live={isError ? "assertive" : "polite"}

    >

      <div

        className={cx(

          "w-full max-w-[460px] rounded-2xl border bg-[#0D1117] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.48)]",

          isError

            ? "border-rose-400/25"

            : "border-emerald-400/25"

        )}

      >

        <div className="flex items-start justify-between gap-4">

          <div>

            <div

              className={cx(

                "text-[9px] font-black uppercase tracking-[0.16em]",

                isError ? "text-rose-300" : "text-emerald-300"

              )}

            >

              {isError ? "Action Required" : "Completed"}

            </div>



            <h3 className="mt-2 text-[17px] font-black tracking-[-0.025em] text-[#F5F3EE]">

              {isError

                ? "ContractX could not complete the action"

                : "ContractX completed the action"}

            </h3>

          </div>



          <button

            type="button"

            onClick={onClose}

            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-[#8E98A3] transition hover:border-[#D2B06F]/30 hover:text-[#D2B06F]"

            aria-label="Close message"

          >

            <X className="h-4 w-4" />

          </button>

        </div>



        <div

          className={cx(

            "mt-4 rounded-xl border px-4 py-3 text-[12px] leading-6",

            isError

              ? "border-rose-400/15 bg-rose-400/[0.055] text-rose-200"

              : "border-emerald-400/15 bg-emerald-400/[0.055] text-emerald-200"

          )}

        >

          {message}

        </div>



        <div className="mt-5 flex justify-end">

          <button

            type="button"

            onClick={onClose}

            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#D2B06F] px-5 text-[10px] font-black uppercase tracking-[0.08em] text-[#050608] transition hover:bg-[#E3C98F]"

          >

            Close

          </button>

        </div>

      </div>

    </div>

  );

}





export default function ScheduleAssessmentPage() {



  const supabase = useMemo(() => createClient(), []);



  const {



    projectId,



    project,



    tenantId,



    loading: projectLoading,



    error: projectError,



  } = useActiveProject();







  const [theme, setTheme] = useState<Theme>("dark");



  const [themeReady, setThemeReady] = useState(false);



  const [tab, setTab] = useState<AssessmentTab>("health");







  const [programmes, setProgrammes] = useState<Programme[]>([]);



  const [scheduleId, setScheduleId] = useState("");



  const [loadingProgrammes, setLoadingProgrammes] = useState(false);







  const [assessment, setAssessment] = useState<AnyJson | null>(null);



  const [analysisId, setAnalysisId] = useState("");



  const [busy, setBusy] = useState(false);



  const [error, setError] = useState("");



  const [notice, setNotice] = useState("");



  const [dismissedProjectError, setDismissedProjectError] = useState<string | null>(null);







  const [options] = useState({



    progress_mode: "retained_logic",



    float_mode: "finish_float",



    critical_mode: "longest_path",



    lag_calendar_mode: "predecessor",



    use_expected_finish_dates: true,



    make_open_ended_critical: false,



    calculate_multiple_float_paths: true,



    multiple_float_path_mode: "free_float",



    multiple_float_path_count: 5,



    multiple_float_path_end_activity: null as string | null,



    level_resources: false,



    preserve_scheduled_early_late_dates: true,



    total_float_threshold_hours: 0,



  });







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



    setThemeReady(true);







    const onThemeChange = (event: Event) => {



      const customEvent = event as CustomEvent<Theme>;



      if (customEvent.detail === "dark" || customEvent.detail === "light") {



        setTheme(customEvent.detail);



      }



    };







    window.addEventListener("contractx-theme-change", onThemeChange as EventListener);







    return () => {



      window.removeEventListener(



        "contractx-theme-change",



        onThemeChange as EventListener



      );



    };



  }, []);







  const setPlatformTheme = (nextTheme: Theme) => {



    setTheme(nextTheme);



    document.documentElement.dataset.contractxTheme = nextTheme;



    window.localStorage.setItem("contractx-theme", nextTheme);



    window.dispatchEvent(



      new CustomEvent("contractx-theme-change", {



        detail: nextTheme,



      })



    );



  };







  const getAuthHeaders = async (

    includeJson = false

  ): Promise<Record<string, string>> => {

    const {

      data: { session },

    } = await supabase.auth.getSession();



    if (!session?.access_token) {

      throw new Error("Authentication required.");

    }



    return {

      ...(includeJson ? { "Content-Type": "application/json" } : {}),

      Authorization: `Bearer ${session.access_token}`,

    };

  };





  const loadProgrammes = async () => {



    if (!projectId || !tenantId) return;







    setLoadingProgrammes(true);



    setError("");







    try {



      const params = new URLSearchParams({



        tenant_id: tenantId,



        project_id: projectId,



        include_archived: "false",



      });







      const response = await fetch(

        `${API}/api/v1/engine2/programmes?${params.toString()}`,

        {

          cache: "no-store",

          headers: await getAuthHeaders(),

        }

      );







      if (!response.ok) {



        let message = `Unable to load programmes (${response.status})`;



        try {



          const body = await response.json();



          message = body?.detail || message;



        } catch {}



        throw new Error(message);



      }







      const data = await response.json();



      const rows: Programme[] = Array.isArray(data?.programmes)



        ? data.programmes



        : [];







      setProgrammes(rows);







      const current = rows.find((programme) => programme.is_current);



      setScheduleId((existing) => {



        if (existing && rows.some((programme) => programme.id === existing)) {



          return existing;



        }



        return current?.id || rows[0]?.id || "";



      });



    } catch (caught) {



      setError(



        caught instanceof Error



          ? caught.message



          : "Unable to load registered programmes."



      );



    } finally {



      setLoadingProgrammes(false);



    }



  };







  useEffect(() => {



    if (!projectId || !tenantId) return;



    void loadProgrammes();



    // eslint-disable-next-line react-hooks/exhaustive-deps



  }, [projectId, tenantId]);







  const selectedProgramme = useMemo(



    () => programmes.find((programme) => programme.id === scheduleId) || null,



    [programmes, scheduleId]



  );







  const runAssessment = async () => {



    if (!projectId || !tenantId) {



      setError("Select a valid project before running Schedule Assessment.");



      return;



    }







    if (!scheduleId) {



      setError("Select a registered programme before running Schedule Assessment.");



      return;



    }







    setBusy(true);



    setError("");



    setNotice("");







    try {



      const response = await fetch(`${API}/api/v1/engine2/forensic-assessment`, {



        method: "POST",



        headers: await getAuthHeaders(true),



        body: JSON.stringify({



          tenant_id: tenantId,



          project_id: projectId,



          schedule_id: scheduleId,



          persist: true,



          scheduling_options: {



            ...options,



            ignore_external_relationships: true,



          },



        }),



      });







      if (!response.ok) {



        let message = `Schedule Assessment failed (${response.status})`;



        try {



          const body = await response.json();



          message = body?.detail || message;



        } catch {}



        throw new Error(message);



      }







      const data = await response.json();



      setAssessment(data);



      setAnalysisId(String(data?.analysis_id || ""));



      setNotice("Schedule Assessment completed successfully.");



    } catch (caught) {



      setError(



        caught instanceof Error



          ? caught.message



          : "Schedule Assessment could not be completed."



      );



    } finally {



      setBusy(false);



    }



  };







  const printAssessment = () => {



    document.body.classList.add("cx-print-schedule-assessment");







    const cleanup = () => {



      document.body.classList.remove("cx-print-schedule-assessment");



      window.removeEventListener("afterprint", cleanup);



    };







    window.addEventListener("afterprint", cleanup);



    window.print();



  };







  const dcmaMetrics: AnyJson[] = Array.isArray(



    assessment?.dcma_14_point?.metrics



  )



    ? assessment.dcma_14_point.metrics



    : [];







  const dcmaSummary: AnyJson = assessment?.dcma_14_point?.summary || {};



  const executive: AnyJson = assessment?.executive_summary || {};



  const diagnostics: AnyJson = assessment?.advanced_diagnostics || {};



  const paths: AnyJson = assessment?.cpm_and_path_analysis || {};



  const integrity: AnyJson = assessment?.schedule_integrity || {};



  const exceptions: AnyJson[] = Array.isArray(



    assessment?.exception_activity_register



  )



    ? assessment.exception_activity_register



    : [];







  const diagnosticItems = [



    ["Quality Score", diagnostics?.quality_score],



    ["Open Starts", diagnostics?.open_start_count],



    ["Open Finishes", diagnostics?.open_finish_count],



    ["Negative Lags", diagnostics?.negative_lag_count],



    ["Positive Lags", diagnostics?.positive_lag_count],



    ["Non-FS Relationships", diagnostics?.non_fs_relationship_count],



    ["Constrained Activities", diagnostics?.constrained_activity_count],



    ["Zero Duration", diagnostics?.zero_duration_activity_count],



    ["Negative Float", diagnostics?.negative_float_activity_count],



    ["Ignored External Ties", diagnostics?.ignored_external_relationship_count],



    ["Invalid Actual Dates", diagnostics?.actual_finish_without_start_count],



  ].filter(([, value]) => value !== undefined && value !== null);







  const longestPath = Array.isArray(paths?.longest_path)



    ? paths.longest_path



    : [];



  const multipleFloatPaths = Array.isArray(paths?.multiple_float_paths)



    ? paths.multiple_float_paths



    : [];







  if (!themeReady) return null;







  return (



    <div



      className={cx(



        "cx-assessment-page flex min-h-[calc(100vh-78px)] flex-col",



        theme === "light" ? "cx-assessment-light" : ""



      )}



    >



      <style>{`



        .cx-assessment-page {



          background:



            radial-gradient(circle at 82% 2%, rgba(111,143,175,0.08), transparent 28%),



            radial-gradient(circle at 12% 0%, rgba(210,176,111,0.055), transparent 24%),



            #050608;



          color: #f5f3ee;
          --cx-panel:#0B0E12;
          --cx-panel-2:#090C11;
          --cx-border:rgba(255,255,255,.08);
          --cx-text:#F5F3EE;
          --cx-muted:#858F9B;
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







        .cx-assessment-light {



          background:



            radial-gradient(circle at 82% 2%, rgba(111,143,175,0.08), transparent 28%),



            radial-gradient(circle at 12% 0%, rgba(210,176,111,0.08), transparent 24%),



            #f3f0e9;



          color: #17191c;
          --cx-panel:#FFFFFF;
          --cx-panel-2:#F8FAFC;
          --cx-border:rgba(23,25,28,.10);
          --cx-text:#17191C;
          --cx-muted:#566577;
          --cx-footer-bg:#F3F0E9;
          --cx-footer-text:#17191C;
          --cx-footer-muted:#566577;
          --cx-footer-muted-strong:#46566A;
          --cx-footer-muted-soft:#758295;
          --cx-footer-border:#D9E0E8;
          --cx-footer-border-soft:#E3E8EE;
          --cx-footer-divider:#D9E0E8;
          --cx-footer-hover:#17191C;
          --cx-footer-accent:#A87924;



        }







        .cx-assessment-light .cx-assessment-card,



        .cx-assessment-light .cx-assessment-toolbar {



          background: rgba(255,255,255,0.84) !important;



          border-color: rgba(23,25,28,0.10) !important;



          box-shadow: 0 20px 60px rgba(43,38,28,0.055) !important;



        }







        .cx-assessment-light .cx-assessment-primary {



          color: #17191c !important;



        }







        .cx-assessment-light .cx-assessment-muted {



          color: rgba(23,25,28,0.58) !important;



        }



        .cx-assessment-light .fixed[role="alertdialog"] > div,

        .cx-assessment-light .fixed[role="dialog"] > div {

          background: #FFFFFF !important;

          color: #17191C !important;

          box-shadow: 0 28px 90px rgba(15,23,42,0.20) !important;

        }



        .cx-assessment-light .fixed[role="alertdialog"] h3,

        .cx-assessment-light .fixed[role="dialog"] h3 {

          color: #17191C !important;

        }









        .cx-assessment-light .cx-assessment-input,



        .cx-assessment-light .cx-assessment-table {



          background: rgba(255,255,255,0.76) !important;



          color: #17191c !important;



          border-color: rgba(23,25,28,0.11) !important;



        }







        .cx-assessment-light .cx-assessment-table thead {



          background: rgba(23,25,28,0.035) !important;



        }







        .cx-assessment-light .cx-assessment-row {



          border-color: rgba(23,25,28,0.08) !important;



        }







        @page {



          size: A4 landscape;



          margin: 12mm;



        }







        @media print {



          body.cx-print-schedule-assessment * {



            visibility: hidden !important;



          }







          body.cx-print-schedule-assessment .cx-assessment-print,



          body.cx-print-schedule-assessment .cx-assessment-print * {



            visibility: visible !important;



          }







          body.cx-print-schedule-assessment .cx-assessment-print {



            position: absolute !important;



            inset: 0 !important;



            width: 100% !important;



            background: white !important;



            color: #111827 !important;



          }







          body.cx-print-schedule-assessment .cx-no-print {



            display: none !important;



          }







          body.cx-print-schedule-assessment .cx-assessment-card,



          body.cx-print-schedule-assessment .cx-assessment-table {



            background: white !important;



            color: #111827 !important;



            border-color: #d1d5db !important;



            box-shadow: none !important;



          }







          body.cx-print-schedule-assessment .cx-assessment-primary {



            color: #111827 !important;



          }







          body.cx-print-schedule-assessment .cx-assessment-muted {



            color: #4b5563 !important;



          }



        }



      `}</style>







      <main className="mx-auto w-full max-w-[1560px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">



        <div className="cx-assessment-print">



          <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">



            <div className="max-w-4xl">



              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D2B06F]">



                Monitor · Schedule Assessment



              </div>







              <h1 className="cx-assessment-primary mt-2 text-3xl font-black tracking-[-0.045em] text-[#F5F3EE] md:text-[40px]">



                Schedule Assessment



              </h1>







              <p className="cx-assessment-muted mt-3 max-w-3xl text-[13px] leading-6 text-[#858F9B]">



                Deterministic schedule health, DCMA 14-Point checks, CPM path



                diagnostics and forensic network assessment from the selected



                registered programme.



              </p>



            </div>







            <div className="cx-no-print flex flex-wrap items-center gap-2">



              <ContractXThemeSwitch
                theme={theme}
                onChange={setPlatformTheme}
              />

              {assessment ? (



                <button



                  type="button"



                  onClick={printAssessment}



                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 text-[11px] font-black uppercase tracking-[0.08em] text-[#B7C0C9] transition hover:border-[#D2B06F]/30 hover:text-[#D2B06F]"



                >



                  <Printer className="h-4 w-4" />



                  Print Assessment



                </button>



              ) : null}



            </div>



          </header>







          {error ? (
              <ContractXNoticeModal
                open
                variant="error"
                title="ContractX could not complete the action"
                message={error}
                onClose={() => setError("")}
              />
            ) : projectError && dismissedProjectError !== projectError ? (
              <ContractXNoticeModal
                open
                variant="error"
                title="Project context required"
                message={projectError}
                onClose={() => setDismissedProjectError(projectError)}
              />
            ) : notice ? (
              <ContractXNoticeModal
                open
                variant="success"
                title="Schedule Assessment completed"
                message={notice}
                onClose={() => setNotice("")}
              />
            ) : null}


            <SectionCard



            eyebrow="Programme"



            title="Assessment Source"



            actions={



              <button



                type="button"



                disabled={loadingProgrammes || !projectId || !tenantId}



                onClick={() => void loadProgrammes()}



                className="cx-no-print inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#88939E] transition hover:text-[#D2B06F] disabled:cursor-not-allowed disabled:opacity-40"



              >



                <RefreshCw



                  className={cx(



                    "h-3.5 w-3.5",



                    loadingProgrammes && "animate-spin"



                  )}



                />



                Refresh



              </button>



            }



          >



            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">



              <div>



                <label className="cx-assessment-muted mb-2 block text-[9px] font-black uppercase tracking-[0.14em] text-[#67727D]">



                  Registered Programme



                </label>



                <div className="relative">



                  <select



                    value={scheduleId}



                    onChange={(event) => {



                      setScheduleId(event.target.value);



                      setAssessment(null);



                      setAnalysisId("");



                      setNotice("");



                    }}



                    disabled={loadingProgrammes || programmes.length === 0}



                    className="cx-assessment-input h-12 w-full appearance-none rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 pr-11 text-[13px] font-bold text-[#E7E3DA] outline-none focus:border-[#D2B06F]/40 disabled:cursor-not-allowed disabled:opacity-50"



                  >



                    {programmes.length === 0 ? (



                      <option value="">No registered programmes</option>



                    ) : null}



                    {programmes.map((programme) => (



                      <option key={programme.id} value={programme.id}>



                        {programme.programme_title || programme.file_name}



                        {programme.revision_label



                          ? ` · ${programme.revision_label}`



                          : ""}



                        {programme.is_current ? " · CURRENT" : ""}



                      </option>



                    ))}



                  </select>



                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737E89]" />



                </div>



              </div>







              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">



                <MetricCard



                  label="Status"



                  value={



                    selectedProgramme?.is_current



                      ? "Current"



                      : selectedProgramme?.programme_status || "Registered"



                  }



                />



                <MetricCard



                  label="Data Date"



                  value={fmtDate(selectedProgramme?.data_date)}



                />



                <MetricCard



                  label="Activities"



                  value={fmtNumber(selectedProgramme?.activity_count, 0)}



                />



                <MetricCard



                  label="Relationships"



                  value={fmtNumber(selectedProgramme?.relationship_count, 0)}



                />



              </div>



            </div>







            <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.07] pt-4 md:flex-row md:items-center md:justify-between">



              <div className="cx-assessment-muted text-[11px] leading-5 text-[#77828E]">



                {projectLoading



                  ? "Loading project context…"



                  : project



                  ? `${project.project_name}${



                      project.project_code ? ` · ${project.project_code}` : ""



                    }`



                  : "Select a project from Portfolio."}



              </div>







              <button



                type="button"



                onClick={() => void runAssessment()}



                disabled={busy || !scheduleId || !projectId || !tenantId}



                className="cx-no-print inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#D2B06F] px-5 py-3 text-[11px] font-black uppercase tracking-[0.085em] text-[#050608] transition hover:bg-[#E3C98F] disabled:cursor-not-allowed disabled:opacity-45"



              >



                <ShieldCheck className="h-4 w-4" />



                {busy ? "Running Assessment…" : "Run Schedule Assessment"}



              </button>



            </div>



          </SectionCard>







          <div className="cx-no-print mt-5 flex w-full max-w-xl rounded-2xl border border-white/[0.08] bg-white/[0.025] p-1">



            <button



              type="button"



              onClick={() => setTab("health")}



              className={cx(



                "flex-1 rounded-xl px-4 py-3 text-[11px] font-black transition",



                tab === "health"



                  ? "bg-[#D2B06F] text-[#050608]"



                  : "text-[#87929D] hover:text-[#F5F3EE]"



              )}



            >



              Schedule Health



            </button>



            <button



              type="button"



              onClick={() => setTab("forensic")}



              className={cx(



                "flex-1 rounded-xl px-4 py-3 text-[11px] font-black transition",



                tab === "forensic"



                  ? "bg-[#D2B06F] text-[#050608]"



                  : "text-[#87929D] hover:text-[#F5F3EE]"



              )}



            >



              Forensic Assessment



            </button>



          </div>







          {!assessment ? (



            <div className="mt-5 rounded-[26px] border border-dashed border-white/[0.09] bg-white/[0.018] px-6 py-14 text-center">



              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#6F8FAF]/20 bg-[#6F8FAF]/[0.06]">



                <Activity className="h-5 w-5 text-[#9EB8CF]" />



              </div>



              <h3 className="cx-assessment-primary mt-4 text-[16px] font-black text-[#F5F3EE]">



                Select a programme and run Schedule Assessment



              </h3>



              <p className="cx-assessment-muted mx-auto mt-2 max-w-xl text-[12px] leading-6 text-[#77828E]">



                One deterministic assessment generates the DCMA 14-Point result,



                schedule-quality diagnostics, CPM path analytics and forensic



                exception register.



              </p>



            </div>



          ) : tab === "health" ? (



            <div className="mt-5 space-y-5">



              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">



                <MetricCard



                  label="Quality Score"



                  value={fmtNumber(executive?.quality_score, 0)}



                  helper="Diagnostic prioritisation score"



                  accent



                />



                <MetricCard



                  label="DCMA Status"



                  value={executive?.dcma_status || "—"}



                />



                <MetricCard



                  label="Project Finish"



                  value={fmtDate(executive?.project_finish)}



                />



                <MetricCard



                  label="Exceptions"



                  value={fmtNumber(exceptions.length, 0)}



                />



              </div>







              <SectionCard



                eyebrow="Schedule Health"



                title="DCMA 14-Point Assessment"



              >



                <div className="mb-4 flex flex-wrap items-center gap-2">



                  <span



                    className={cx(



                      "rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em]",



                      statusTone(dcmaSummary?.overall_status)



                    )}



                  >



                    {dcmaSummary?.overall_status || "Assessment Complete"}



                  </span>



                  {Array.isArray(dcmaSummary?.failed_points) &&



                  dcmaSummary.failed_points.length ? (



                    <span className="cx-assessment-muted text-[11px] text-[#77828E]">



                      Failed points: {dcmaSummary.failed_points.join(", ")}



                    </span>



                  ) : null}



                </div>







                <div className="overflow-x-auto rounded-2xl border border-white/[0.075]">



                  <table className="cx-assessment-table w-full min-w-[900px] border-collapse bg-white/[0.018] text-left">



                    <thead className="bg-white/[0.025]">



                      <tr>



                        {[



                          "Point",



                          "Check",



                          "Result",



                          "Benchmark",



                          "Status",



                          "Finding",



                        ].map((heading) => (



                          <th



                            key={heading}



                            className="cx-assessment-muted px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-[#69747F]"



                          >



                            {heading}



                          </th>



                        ))}



                      </tr>



                    </thead>



                    <tbody>



                      {dcmaMetrics.map((metric, index) => (



                        <tr



                          key={`${metric?.point || index}-${index}`}



                          className="cx-assessment-row border-t border-white/[0.065]"



                        >



                          <td className="px-4 py-3 text-[12px] font-black text-[#D2B06F]">



                            {metric?.point || index + 1}



                          </td>



                          <td className="cx-assessment-primary px-4 py-3 text-[12px] font-bold text-[#E7E3DA]">



                            {metric?.name || metric?.metric || "Schedule check"}



                          </td>



                          <td className="cx-assessment-primary px-4 py-3 text-[12px] font-black text-[#F5F3EE]">



                            {dcmaValue(metric)}



                          </td>



                          <td className="cx-assessment-muted max-w-[250px] px-4 py-3 text-[10px] leading-5 text-[#77828E]">



                            {dcmaIndustryStandard(Number(metric?.point || 0))}



                          </td>



                          <td className="px-4 py-3">



                            <span



                              className={cx(



                                "inline-flex rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em]",



                                statusTone(metric?.status)



                              )}



                            >



                              {metric?.status || "—"}



                            </span>



                          </td>



                          <td className="cx-assessment-muted max-w-[360px] px-4 py-3 text-[10px] leading-5 text-[#77828E]">



                            {metric?.methodology_note ||



                              metric?.finding ||



                              metric?.message ||



                              "—"}



                          </td>



                        </tr>



                      ))}



                    </tbody>



                  </table>



                </div>



              </SectionCard>







              <SectionCard



                eyebrow="ContractX Diagnostics"



                title="Schedule Quality Indicators"



              >



                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">



                  {diagnosticItems.map(([label, value]) => (



                    <div



                      key={String(label)}



                      className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"



                    >



                      <div className="cx-assessment-muted text-[9px] font-black uppercase tracking-[0.11em] text-[#68727D]">



                        {label}



                      </div>



                      <div className="cx-assessment-primary mt-1.5 text-[18px] font-black text-[#F5F3EE]">



                        {fmtNumber(value, 0)}



                      </div>



                    </div>



                  ))}



                </div>



              </SectionCard>



            </div>



          ) : (



            <div className="mt-5 space-y-5">



              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">



                <MetricCard



                  label="Project Start"



                  value={fmtDate(executive?.project_start)}



                />



                <MetricCard



                  label="Project Finish"



                  value={fmtDate(executive?.project_finish)}



                  accent



                />



                <MetricCard



                  label="Longest Path"



                  value={fmtNumber(longestPath.length, 0)}



                  helper="Activities on calculated longest path"



                />



                <MetricCard



                  label="Float Paths"



                  value={fmtNumber(multipleFloatPaths.length, 0)}



                />



              </div>







              <div className="grid gap-5 xl:grid-cols-2">



                <SectionCard eyebrow="Network" title="Schedule Integrity">



                  <div className="space-y-3">



                    <div className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">



                      <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-[#D2B06F]" />



                      <div className="min-w-0">



                        <div className="cx-assessment-muted text-[9px] font-black uppercase tracking-[0.12em] text-[#68727D]">



                          Network Fingerprint



                        </div>



                        <div className="cx-assessment-primary mt-1 break-all font-mono text-[10px] leading-5 text-[#D8DCE0]">



                          {integrity?.network_fingerprint ||



                            executive?.network_fingerprint ||



                            "—"}



                        </div>



                      </div>



                    </div>







                    <div className="grid grid-cols-2 gap-3">



                      <MetricCard



                        label="Activities"



                        value={fmtNumber(executive?.activity_count, 0)}



                      />



                      <MetricCard



                        label="Relationships"



                        value={fmtNumber(executive?.relationship_count, 0)}



                      />



                    </div>







                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">



                      <div className="flex items-center gap-2">



                        <Network className="h-4 w-4 text-[#9EB8CF]" />



                        <div className="cx-assessment-primary text-[12px] font-black text-[#E7E3DA]">



                          Network Validation



                        </div>



                      </div>



                      <div className="cx-assessment-muted mt-2 text-[11px] leading-6 text-[#77828E]">



                        {typeof integrity?.network_validation === "string"



                          ? integrity.network_validation



                          : integrity?.network_validation?.status ||



                            integrity?.network_validation?.message ||



                            "Validated during deterministic CPM calculation."}



                      </div>



                    </div>



                  </div>



                </SectionCard>







                <SectionCard eyebrow="CPM" title="Path Analytics">



                  <div className="space-y-3">



                    <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">



                      <div className="flex items-center gap-2">



                        <Route className="h-4 w-4 text-[#D2B06F]" />



                        <span className="cx-assessment-primary text-[12px] font-bold text-[#E7E3DA]">



                          Longest Path Activities



                        </span>



                      </div>



                      <span className="text-[13px] font-black text-[#D2B06F]">



                        {longestPath.length}



                      </span>



                    </div>







                    <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">



                      <div className="flex items-center gap-2">



                        <BarChart3 className="h-4 w-4 text-[#9EB8CF]" />



                        <span className="cx-assessment-primary text-[12px] font-bold text-[#E7E3DA]">



                          Multiple Float Paths



                        </span>



                      </div>



                      <span className="text-[13px] font-black text-[#9EB8CF]">



                        {multipleFloatPaths.length}



                      </span>



                    </div>







                    <div className="cx-assessment-muted rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-[11px] leading-6 text-[#77828E]">



                      Progress: retained logic · Critical path: longest path ·



                      Float: finish float · Multiple float paths enabled.



                    </div>



                  </div>



                </SectionCard>



              </div>







              <SectionCard



                eyebrow="Forensic Review"



                title="Exception Activity Register"



                actions={



                  <span className="cx-assessment-muted text-[10px] font-bold text-[#74808B]">



                    {exceptions.length} activities



                  </span>



                }



              >



                {exceptions.length === 0 ? (



                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">



                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />



                    <span className="text-[11px] text-emerald-300">



                      No exception activities were returned by the consolidated assessment.



                    </span>



                  </div>



                ) : (



                  <div className="overflow-x-auto rounded-2xl border border-white/[0.075]">



                    <table className="cx-assessment-table w-full min-w-[900px] border-collapse bg-white/[0.018] text-left">



                      <thead className="bg-white/[0.025]">



                        <tr>



                          {[



                            "Activity",



                            "Name",



                            "Total Float",



                            "Longest Path",



                            "Status",



                          ].map((heading) => (



                            <th



                              key={heading}



                              className="cx-assessment-muted px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-[#69747F]"



                            >



                              {heading}



                            </th>



                          ))}



                        </tr>



                      </thead>



                      <tbody>



                        {exceptions.slice(0, 100).map((activity, index) => (



                          <tr



                            key={`${activity?.activity_pk || index}-${index}`}



                            className="cx-assessment-row border-t border-white/[0.065]"



                          >



                            <td className="px-4 py-3">



                              <div className="text-[11px] font-black text-[#D2B06F]">



                                {activity?.activity_id ||



                                  activity?.activity_pk ||



                                  "—"}



                              </div>



                            </td>



                            <td className="cx-assessment-primary max-w-[360px] px-4 py-3 text-[11px] font-bold text-[#E7E3DA]">



                              {activity?.activity_name || "—"}



                            </td>



                            <td className="cx-assessment-primary px-4 py-3 text-[11px] font-bold text-[#D8DCE0]">



                              {Number.isFinite(Number(activity?.total_float_hours))



                                ? `${fmtNumber(



                                    Number(activity.total_float_hours) / 8,



                                    1



                                  )} d`



                                : "—"}



                            </td>



                            <td className="px-4 py-3">



                              <span



                                className={cx(



                                  "inline-flex rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em]",



                                  activity?.is_longest_path



                                    ? "border-[#D2B06F]/20 bg-[#D2B06F]/[0.06] text-[#E3C98F]"



                                    : "border-white/[0.07] bg-white/[0.02] text-[#77828E]"



                                )}



                              >



                                {activity?.is_longest_path ? "Yes" : "No"}



                              </span>



                            </td>



                            <td className="px-4 py-3">



                              <div className="flex items-center gap-2">



                                <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />



                                <span className="cx-assessment-muted text-[10px] text-[#77828E]">



                                  Review



                                </span>



                              </div>



                            </td>



                          </tr>



                        ))}



                      </tbody>



                    </table>



                  </div>



                )}







                {exceptions.length > 100 ? (



                  <div className="cx-assessment-muted mt-3 text-[10px] text-[#77828E]">



                    Showing first 100 exception activities in the workspace.



                  </div>



                ) : null}



              </SectionCard>







              <SectionCard eyebrow="Audit" title="Deterministic Assessment Trail">



                <div className="grid gap-3 md:grid-cols-3">



                  <MetricCard



                    label="Calculation"



                    value="Deterministic"



                    helper="AI is not used for CPM arithmetic"



                  />



                  <MetricCard



                    label="Analysis ID"



                    value={



                      <span className="block max-w-full truncate font-mono text-[11px]">



                        {analysisId || "—"}



                      </span>



                    }



                  />



                  <MetricCard



                    label="Data Date"



                    value={fmtDate(executive?.data_date)}



                  />



                </div>



              </SectionCard>



            </div>



          )}







          <div className="mt-8 border-t border-white/[0.07] py-6">
              <p className="cx-assessment-muted text-[10px] leading-5 text-[#69747F]">
                Schedule Assessment reports deterministic programme facts, schedule-quality findings and CPM network diagnostics from supplied programme data. Contractual causation, entitlement, excusability, compensability, concurrency, damages and legal liability require separate contract and evidence review.
              </p>
            </div>



        </div>



      </main>

      <LegalFooter compact />



    </div>



  );



}
