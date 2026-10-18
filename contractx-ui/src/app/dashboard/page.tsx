"use client";



import React, { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import {

  AlertTriangle,

  ArrowUpRight,

  BarChart3,

  CalendarDays,

  CheckCircle2,

  Clock3,

  Database,

  FileText,

  FolderKanban,

  RefreshCw,

  Scale,

  ShieldCheck,

} from "lucide-react";



import { createClient } from "@/lib/supabase/client";
import LegalFooter from "@/components/LegalFooter";
import ContractXNoticeModal from "@/components/ContractXNoticeModal";
import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";

import { useActiveProject } from "@/hooks/useActiveProject";



type Theme = "dark" | "light";

type AnyJson = Record<string, any>;



type Programme = {

  id: string;

  file_name?: string | null;

  schedule_type?: string | null;

  data_date?: string | null;

  uploaded_at?: string | null;

  programme_title?: string | null;

  revision_number?: number | null;

  revision_label?: string | null;

  programme_status?: string | null;

  is_current?: boolean;

  baseline_schedule_id?: string | null;

  activity_count?: number | null;

  relationship_count?: number | null;

  quality_summary?: AnyJson | null;

};



type ViewerActivity = {

  activity_id_pk?: string;

  activity_id?: string;

  activity_name?: string;

  status?: string;

  start?: string | null;

  finish?: string | null;

  total_float_days?: number | null;

  is_critical?: boolean;

  is_longest_path?: boolean;

  is_start_milestone?: boolean;

  is_finish_milestone?: boolean;

};



type ViewerData = {

  schedule_id?: string;

  programme_title?: string;

  baseline_schedule_id?: string | null;

  data_date?: string | null;

  activity_count?: number;

  relationship_count?: number;

  activities?: ViewerActivity[];

};



type DelayAnalysis = {

  analysis_id: string;

  analysis_type?: string;

  created_at?: string;

  schedule_id?: string;

  before_finish?: string | null;

  after_finish?: string | null;

  impact_days?: number | null;

  fragnet_id?: string | null;

  fragnet_name?: string | null;

};



type TaskSummary = {

  total?: number;

  open?: number;

  in_progress?: number;

  blocked?: number;

  completed?: number;

  cancelled?: number;

  closed?: number;

  overdue?: number;

  due_today?: number;

  due_7_days?: number;

  critical?: number;

};



type CurvePoint = {

  label: string;

  date: number;

  value: number;

};



const API = "/api/contractx";



function fmtDate(value?: string | null) {

  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleDateString(undefined, {

    day: "2-digit",

    month: "short",

    year: "numeric",

  });

}



function fmtNumber(value: unknown, digits = 0) {

  const n = Number(value);

  if (!Number.isFinite(n)) return "—";

  return n.toLocaleString(undefined, {

    minimumFractionDigits: 0,

    maximumFractionDigits: digits,

  });

}



function pretty(value?: string | null) {

  if (!value) return "—";

  return String(value)

    .replaceAll("_", " ")

    .replaceAll("-", " ")

    .toLowerCase()

    .replace(/\b\w/g, (m) => m.toUpperCase());

}



function safeDate(value?: string | null) {

  if (!value) return null;

  const d = new Date(value);

  return Number.isNaN(d.getTime()) ? null : d;

}



function completionDate(viewer: ViewerData | null) {

  const dates = (viewer?.activities || [])

    .map((a) => safeDate(a.finish))

    .filter((d): d is Date => Boolean(d));

  if (!dates.length) return null;

  return new Date(Math.max(...dates.map((d) => d.getTime())));

}



function projectStartDate(viewer: ViewerData | null) {

  const dates = (viewer?.activities || [])

    .map((a) => safeDate(a.start))

    .filter((d): d is Date => Boolean(d));

  if (!dates.length) return null;

  return new Date(Math.min(...dates.map((d) => d.getTime())));

}



function daysBetween(a: Date | null, b: Date | null) {

  if (!a || !b) return null;

  return Math.round((b.getTime() - a.getTime()) / 86400000);

}



function buildActivityCurve(viewer: ViewerData | null, buckets = 12): CurvePoint[] {

  const activities = viewer?.activities || [];

  const starts = activities

    .map((a) => safeDate(a.start))

    .filter((d): d is Date => Boolean(d));

  const finishes = activities

    .map((a) => safeDate(a.finish))

    .filter((d): d is Date => Boolean(d));



  if (!starts.length || !finishes.length) return [];



  const min = Math.min(...starts.map((d) => d.getTime()));

  const max = Math.max(...finishes.map((d) => d.getTime()));

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];



  const span = max - min;

  const points: CurvePoint[] = [];



  for (let i = 0; i <= buckets; i += 1) {

    const t = min + (span * i) / buckets;

    const completed = finishes.filter((d) => d.getTime() <= t).length;

    const value = activities.length ? (completed / activities.length) * 100 : 0;

    points.push({

      date: t,

      value,

      label: new Date(t).toLocaleDateString(undefined, {

        month: "short",

        year: "2-digit",

      }),

    });

  }



  return points;

}



function curvePath(points: CurvePoint[], width: number, height: number) {

  if (!points.length) return "";

  const usableW = width - 52;

  const usableH = height - 46;

  const x0 = 42;

  const y0 = 14;



  return points

    .map((p, index) => {

      const x = x0 + (index / Math.max(1, points.length - 1)) * usableW;

      const y = y0 + usableH - (Math.max(0, Math.min(100, p.value)) / 100) * usableH;

      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;

    })

    .join(" ");

}



function Metric({

  label,

  value,

  note,

}: {

  label: string;

  value: React.ReactNode;

  note?: React.ReactNode;

}) {

  return (

    <div className="rounded-lg border border-[var(--cx-border)] bg-[var(--cx-card)] p-4">

      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--cx-muted)]">

        {label}

      </div>

      <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--cx-text)]">

        {value}

      </div>

      {note ? (

        <div className="mt-1 text-[11px] leading-5 text-[var(--cx-muted)]">

          {note}

        </div>

      ) : null}

    </div>

  );

}



function Section({

  title,

  eyebrow,

  action,

  children,

}: {

  title: string;

  eyebrow?: string;

  action?: React.ReactNode;

  children: React.ReactNode;

}) {

  return (

    <section className="rounded-lg border border-[var(--cx-border)] bg-[var(--cx-card)]">

      <div className="flex flex-col gap-3 border-b border-[var(--cx-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">

        <div>

          {eyebrow ? (

            <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[#D8A84E]">

              {eyebrow}

            </div>

          ) : null}

          <h2 className="mt-1 text-base font-semibold text-[var(--cx-text)]">{title}</h2>

        </div>

        {action}

      </div>

      <div className="p-5">{children}</div>

    </section>

  );

}



function Empty({ children }: { children: React.ReactNode }) {

  return (

    <div className="rounded-md border border-dashed border-white/[0.09] px-4 py-7 text-center text-xs leading-5 text-[var(--cx-muted)]">

      {children}

    </div>

  );

}



export default function DashboardPage() {

  const supabase = useMemo(() => createClient(), []);
  const [theme, setTheme] = useState<Theme>("dark");

  const {

    projectId,

    project,

    tenantId,

    loading: projectLoading,

    error: projectError,

  } = useActiveProject();



  const [loading, setLoading] = useState(true);

  const [refreshKey, setRefreshKey] = useState(0);

  const [sourceNotes, setSourceNotes] = useState<string[]>([]);



  const [projectDetails, setProjectDetails] = useState<AnyJson | null>(null);

  const [programmes, setProgrammes] = useState<Programme[]>([]);

  const [currentViewer, setCurrentViewer] = useState<ViewerData | null>(null);

  const [baselineViewer, setBaselineViewer] = useState<ViewerData | null>(null);

  const [analyses, setAnalyses] = useState<DelayAnalysis[]>([]);

  const [taskSummary, setTaskSummary] = useState<TaskSummary | null>(null);

  const [documentCount, setDocumentCount] = useState<number | null>(null);

  useEffect(() => {
    const syncThemeFromShell = () => {
      const shell = document.querySelector(".cx-platform");

      if (shell) {
        const nextTheme: Theme = shell.classList.contains("cx-platform-light")
          ? "light"
          : "dark";
        setTheme(nextTheme);
        document.documentElement.dataset.contractxTheme = nextTheme;
        return;
      }

      const saved = window.localStorage.getItem("contractx-theme");
      const nextTheme: Theme = saved === "light" ? "light" : "dark";
      setTheme(nextTheme);
      document.documentElement.dataset.contractxTheme = nextTheme;
    };

    const onThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<Theme>;

      if (
        customEvent.detail === "light" ||
        customEvent.detail === "dark"
      ) {
        setTheme(customEvent.detail);
        document.documentElement.dataset.contractxTheme = customEvent.detail;
      } else {
        syncThemeFromShell();
      }
    };

    syncThemeFromShell();

    window.addEventListener(
      "contractx-theme-change",
      onThemeChange as EventListener
    );

    const shell = document.querySelector(".cx-platform");
    const observer = shell
      ? new MutationObserver(syncThemeFromShell)
      : null;

    observer?.observe(shell as Element, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      window.removeEventListener(
        "contractx-theme-change",
        onThemeChange as EventListener
      );
      observer?.disconnect();
    };
  }, []);

  function updateTheme(next: Theme) {
    setTheme(next);
    window.localStorage.setItem("contractx-theme", next);
    document.documentElement.dataset.contractxTheme = next;
    window.dispatchEvent(
      new CustomEvent("contractx-theme-change", {
        detail: next,
      })
    );
  }



  useEffect(() => {

    if (projectLoading || !projectId || !tenantId) return;



    let cancelled = false;



    const getJson = async (url: string) => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Authentication required.");
      }

      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.detail || `Request failed (${response.status})`);
      }

      return data;
    };



    const load = async () => {

      setLoading(true);

      setSourceNotes([]);



      const notes: string[] = [];



      try {

        const projectResult = await supabase

          .from("projects")

          .select("*")

          .eq("id", projectId)

          .eq("tenant_id", tenantId)

          .maybeSingle();



        if (!cancelled) {

          if (projectResult.error) {

            notes.push(`Project detail: ${projectResult.error.message}`);

          } else {

            setProjectDetails(projectResult.data || null);

          }

        }



        let programmeRows: Programme[] = [];

        try {

          const qs = new URLSearchParams({

            tenant_id: tenantId,

            project_id: projectId,

            include_archived: "false",

          });

          const data = await getJson(

            `${API}/api/v1/engine2/programmes?${qs.toString()}`

          );

          programmeRows = Array.isArray(data.programmes) ? data.programmes : [];

          if (!cancelled) setProgrammes(programmeRows);

        } catch (error) {

          notes.push(

            `Programme Register: ${

              error instanceof Error ? error.message : "unavailable"

            }`

          );

          if (!cancelled) setProgrammes([]);

        }



        const current =

          programmeRows.find((p) => p.is_current) ||

          programmeRows.find((p) => p.programme_status === "ACCEPTED") ||

          programmeRows[0] ||

          null;



        const baseline =

          programmeRows.find((p) => p.id === current?.baseline_schedule_id) ||

          programmeRows.find(

            (p) => String(p.schedule_type || "").toLowerCase() === "baseline"

          ) ||

          null;



        const viewerQuery = new URLSearchParams({

          tenant_id: tenantId,

          project_id: projectId,

        }).toString();



        if (current?.id) {

          try {

            const data = await getJson(

              `${API}/api/v1/engine2/programmes/${encodeURIComponent(

                current.id

              )}/viewer?${viewerQuery}`

            );

            if (!cancelled) setCurrentViewer(data);

          } catch (error) {

            notes.push(

              `Current programme dataset: ${

                error instanceof Error ? error.message : "unavailable"

              }`

            );

            if (!cancelled) setCurrentViewer(null);

          }

        } else if (!cancelled) {

          setCurrentViewer(null);

        }



        if (baseline?.id) {

          try {

            const data = await getJson(

              `${API}/api/v1/engine2/programmes/${encodeURIComponent(

                baseline.id

              )}/viewer?${viewerQuery}`

            );

            if (!cancelled) setBaselineViewer(data);

          } catch (error) {

            notes.push(

              `Baseline programme dataset: ${

                error instanceof Error ? error.message : "unavailable"

              }`

            );

            if (!cancelled) setBaselineViewer(null);

          }

        } else if (!cancelled) {

          setBaselineViewer(null);

        }



        try {

          const qs = new URLSearchParams({

            tenant_id: tenantId,

            project_id: projectId,

            limit: "3",

          });

          const data = await getJson(

            `${API}/api/v1/engine2/analyses?${qs.toString()}`

          );

          if (!cancelled) {

            setAnalyses(Array.isArray(data.analyses) ? data.analyses : []);

          }

        } catch (error) {

          notes.push(

            `Delay Analysis: ${

              error instanceof Error ? error.message : "unavailable"

            }`

          );

          if (!cancelled) setAnalyses([]);

        }



        try {

          const qs = new URLSearchParams({

            tenant_id: tenantId,

            project_id: projectId,

          });

          const data = await getJson(

            `${API}/api/v1/tasks/summary?${qs.toString()}`

          );

          if (!cancelled) setTaskSummary(data);

        } catch (error) {

          notes.push(

            `Tasks: ${error instanceof Error ? error.message : "unavailable"}`

          );

          if (!cancelled) setTaskSummary(null);

        }



        try {

          const qs = new URLSearchParams({

            tenant_id: tenantId,

            project_id: projectId,

            page: "1",

            page_size: "1",

            sort_by: "document_date",

            sort_direction: "desc",

          });

          const data = await getJson(

            `${API}/api/v1/vault/documents?${qs.toString()}`

          );

          const count =

            Number(data.total ?? data.count ?? data.total_count) ||

            (Array.isArray(data.documents) ? data.documents.length : 0);

          if (!cancelled) setDocumentCount(count);

        } catch (error) {

          notes.push(

            `Private Vault: ${

              error instanceof Error ? error.message : "unavailable"

            }`

          );

          if (!cancelled) setDocumentCount(null);

        }

      } finally {

        if (!cancelled) {

          setSourceNotes(notes);

          setLoading(false);

        }

      }

    };



    void load();



    return () => {

      cancelled = true;

    };

  }, [projectId, tenantId, projectLoading, supabase, refreshKey]);



  const currentProgramme = useMemo(

    () =>

      programmes.find((p) => p.is_current) ||

      programmes.find((p) => p.programme_status === "ACCEPTED") ||

      programmes[0] ||

      null,

    [programmes]

  );



  const baselineProgramme = useMemo(

    () =>

      programmes.find((p) => p.id === currentProgramme?.baseline_schedule_id) ||

      programmes.find(

        (p) => String(p.schedule_type || "").toLowerCase() === "baseline"

      ) ||

      null,

    [programmes, currentProgramme]

  );



  const currentFinish = useMemo(

    () => completionDate(currentViewer),

    [currentViewer]

  );

  const baselineFinish = useMemo(

    () => completionDate(baselineViewer),

    [baselineViewer]

  );

  const currentStart = useMemo(

    () => projectStartDate(currentViewer),

    [currentViewer]

  );



  const completionMovement = daysBetween(baselineFinish, currentFinish);



  const currentActivities = currentViewer?.activities || [];

  const criticalCount = currentActivities.filter(

    (a) => a.is_critical || Number(a.total_float_days) <= 0

  ).length;

  const longestPathCount = currentActivities.filter(

    (a) => a.is_longest_path

  ).length;

  const milestoneCount = currentActivities.filter(

    (a) => a.is_start_milestone || a.is_finish_milestone

  ).length;



  const baselineCurve = useMemo(

    () => buildActivityCurve(baselineViewer),

    [baselineViewer]

  );

  const currentCurve = useMemo(

    () => buildActivityCurve(currentViewer),

    [currentViewer]

  );



  const chartW = 840;

  const chartH = 260;

  const baselinePath = curvePath(baselineCurve, chartW, chartH);

  const currentPath = curvePath(currentCurve, chartW, chartH);



  const latestAnalysis = analyses[0] || null;



  const projectName =

    projectDetails?.project_name || project?.project_name || "Selected Project";

  const projectCode =

    projectDetails?.project_code || project?.project_code || "—";

  const jurisdiction =

    projectDetails?.jurisdiction || project?.jurisdiction || "—";

  const country = projectDetails?.country || project?.country || "—";

  const status = projectDetails?.status || project?.status || "—";



  const query = projectId

    ? `?project=${encodeURIComponent(projectId)}`

    : "";



  if (projectLoading) {

    return (

      <main className="flex min-h-[70vh] items-center justify-center bg-[var(--cx-bg)] text-[var(--cx-text)]">

        <div className="text-xs font-semibold text-[var(--cx-muted)]">

          Loading project dashboard…

        </div>

      </main>

    );

  }



  if (projectError || !projectId || !tenantId) {

    return (

      <main className="flex min-h-[70vh] items-center justify-center bg-[var(--cx-bg)] px-5 text-[var(--cx-text)]">

        <div className="max-w-xl rounded-lg border border-[var(--cx-border)] bg-[var(--cx-card)] p-6">

          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D8A84E]">

            Project context required

          </div>

          <div className="mt-3 text-sm leading-6 text-[var(--cx-muted)]">

            {projectError || "Open a project from Portfolio before using Dashboard."}

          </div>

          <Link

            href="/portfolio"

            className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#D8A84E] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#050608]"

          >

            Open Portfolio <ArrowUpRight className="h-3.5 w-3.5" />

          </Link>

        </div>

      </main>

    );

  }



  return (

    <main
      className={`cx-dashboard-shell flex min-h-screen flex-col bg-[var(--cx-bg)] text-[var(--cx-text)] ${
        theme === "light" ? "cx-platform-light" : ""
      }`}
    >

      <style>{`

        :root {

          --cx-bg: #07090D;

          --cx-card: #0D1117;

          --cx-card-2: #11161D;

          --cx-text: #F5F3EE;

          --cx-text-soft: #D7DCE3;

          --cx-muted: #8E99A6;

          --cx-panel: #0D1117;
          --cx-panel-2: #11161D;
          --cx-border: rgba(255,255,255,.08);
          --cx-footer-bg: #050608;
          --cx-footer-text: #F4F1EA;
          --cx-footer-muted: rgba(244,241,234,.40);
          --cx-footer-muted-strong: rgba(244,241,234,.48);
          --cx-footer-muted-soft: rgba(244,241,234,.30);
          --cx-footer-border: rgba(255,255,255,.065);
          --cx-footer-border-soft: rgba(255,255,255,.05);
          --cx-footer-divider: rgba(255,255,255,.10);
          --cx-footer-hover: #F4F1EA;
          --cx-footer-accent: #D2B06F;

        }



        .cx-dashboard-shell.cx-platform-light {

          --cx-bg: #F5F7FA;

          --cx-card: #FFFFFF;

          --cx-card-2: #F7F9FC;

          --cx-text: #172033;

          --cx-text-soft: #334155;

          --cx-muted: #5C6B7C;

          --cx-panel: #FFFFFF;
          --cx-panel-2: #F7F9FC;
          --cx-border: #D7DEE7;
          --cx-footer-bg: #F5F7FA;
          --cx-footer-text: #172033;
          --cx-footer-muted: #566577;
          --cx-footer-muted-strong: #46566A;
          --cx-footer-muted-soft: #758295;
          --cx-footer-border: #D9E0E8;
          --cx-footer-border-soft: #E3E8EE;
          --cx-footer-divider: #D9E0E8;
          --cx-footer-hover: #172033;
          --cx-footer-accent: #A87924;

        }



        .cx-dashboard-shell.cx-platform-light [class*="border-white"] {

          border-color: #D7DEE7 !important;

        }

      `}</style>



      <div className="mx-auto w-full max-w-[1500px] flex-1 space-y-5 px-5 py-6 lg:px-8">

        <header className="rounded-lg border border-[var(--cx-border)] bg-[var(--cx-card)] px-5 py-5">

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

            <div className="min-w-0">

              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D8A84E]">

                Project Dashboard

              </div>

              <h1 className="mt-2 truncate text-2xl font-semibold tracking-[-0.035em] text-[var(--cx-text)]">

                {projectName}

              </h1>

              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--cx-muted)]">

                <span>{projectCode}</span>

                <span>{jurisdiction}</span>

                <span>{country}</span>

                <span>{pretty(status)}</span>

              </div>

            </div>



            <div className="flex flex-wrap items-center gap-2">
              <ContractXThemeSwitch theme={theme} onChange={updateTheme} />

              <Link
                href={`/documents${query}`}
                className="inline-flex items-center justify-center rounded-md border border-[var(--cx-border)] bg-[var(--cx-card-2)] px-3.5 py-2.5 text-[10px] font-black uppercase tracking-[0.10em] text-[var(--cx-text-soft)] transition hover:border-[#D8A84E]/35"
              >
                Documents
              </Link>

              <Link
                href={`/project-settings${query}`}
                className="inline-flex items-center justify-center rounded-md border border-[var(--cx-border)] bg-[var(--cx-card-2)] px-3.5 py-2.5 text-[10px] font-black uppercase tracking-[0.10em] text-[var(--cx-text-soft)] transition hover:border-[#D8A84E]/35"
              >
                Settings
              </Link>

              <button
                type="button"
                onClick={() => setRefreshKey((v) => v + 1)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--cx-border)] bg-[var(--cx-card-2)] px-3.5 py-2.5 text-[10px] font-black uppercase tracking-[0.10em] text-[var(--cx-text-soft)] transition hover:border-[#D8A84E]/35 disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

          </div>

        </header>



        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

          <Metric

            label="Current Data Date"

            value={fmtDate(currentProgramme?.data_date || currentViewer?.data_date)}

            note={currentProgramme?.revision_label || currentProgramme?.programme_title || "Current programme"}

          />

          <Metric

            label="Baseline Completion"

            value={baselineFinish ? fmtDate(baselineFinish.toISOString()) : "—"}

            note={baselineProgramme?.revision_label || baselineProgramme?.programme_title || "No baseline registered"}

          />

          <Metric

            label="Current Completion"

            value={currentFinish ? fmtDate(currentFinish.toISOString()) : "—"}

            note={

              completionMovement == null

                ? "No baseline/current comparison available"

                : completionMovement > 0

                ? `+${completionMovement} calendar days vs baseline`

                : completionMovement < 0

                ? `${completionMovement} calendar days vs baseline`

                : "No completion movement vs baseline"

            }

          />

          <Metric

            label="Current Programme"

            value={currentProgramme ? fmtNumber(currentProgramme.activity_count ?? currentActivities.length) : "—"}

            note={`Activities · ${fmtNumber(currentProgramme?.relationship_count ?? currentViewer?.relationship_count)} relationships`}

          />

        </section>



        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">

          <Metric label="Critical Activities" value={currentProgramme ? criticalCount : "—"} />

          <Metric label="Longest Path" value={currentProgramme ? longestPathCount : "—"} />

          <Metric label="Milestones" value={currentProgramme ? milestoneCount : "—"} />

          <Metric

            label="Stored Delay Analyses"

            value={analyses.length}

            note="Latest 3 retained"

          />

          <Metric

            label="Project Documents"

            value={documentCount ?? "—"}

            note="Private Vault"

          />

        </section>



        <div className="grid gap-5 xl:grid-cols-[1.45fr_0.55fr]">

          <Section

            eyebrow="Uploaded programme data"

            title="Baseline Curve & Current Programme"

            action={

              <Link

                href={`/delay-analytics${query}`}

                className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.10em] text-[#D8A84E]"

              >

                Open Delay Analysis <ArrowUpRight className="h-3.5 w-3.5" />

              </Link>

            }

          >

            {baselineCurve.length || currentCurve.length ? (

              <>

                <div className="mb-4 flex flex-wrap gap-4 text-[10px] font-semibold text-[var(--cx-muted)]">

                  {baselineCurve.length ? (

                    <span className="inline-flex items-center gap-2">

                      <span className="h-0.5 w-5 bg-[#D8A84E]" />

                      Baseline · {baselineProgramme?.programme_title || baselineProgramme?.file_name || "Uploaded baseline"}

                    </span>

                  ) : null}

                  {currentCurve.length ? (

                    <span className="inline-flex items-center gap-2">

                      <span className="h-0.5 w-5 bg-sky-400" />

                      Current · {currentProgramme?.programme_title || currentProgramme?.file_name || "Current programme"}

                    </span>

                  ) : null}

                </div>



                <div className="overflow-x-auto">

                  <svg

                    viewBox={`0 0 ${chartW} ${chartH}`}

                    className="h-[260px] min-w-[720px] w-full"

                    role="img"

                    aria-label="Baseline and current programme activity distribution curve"

                  >

                    {[0, 25, 50, 75, 100].map((pct) => {

                      const y = 14 + (1 - pct / 100) * (chartH - 46);

                      return (

                        <g key={pct}>

                          <line

                            x1="42"

                            x2={chartW - 10}

                            y1={y}

                            y2={y}

                            stroke="currentColor"

                            opacity="0.09"

                          />

                          <text

                            x="34"

                            y={y + 4}

                            textAnchor="end"

                            fontSize="10"

                            fill="currentColor"

                            opacity="0.55"

                          >

                            {pct}%

                          </text>

                        </g>

                      );

                    })}



                    {baselinePath ? (

                      <path

                        d={baselinePath}

                        fill="none"

                        stroke="#D8A84E"

                        strokeWidth="3"

                        strokeLinecap="round"

                        strokeLinejoin="round"

                      />

                    ) : null}



                    {currentPath ? (

                      <path

                        d={currentPath}

                        fill="none"

                        stroke="#38BDF8"

                        strokeWidth="2.5"

                        strokeLinecap="round"

                        strokeLinejoin="round"

                      />

                    ) : null}



                    {(baselineCurve.length ? baselineCurve : currentCurve).map(

                      (p, i, arr) => {

                        if (i % 2 !== 0 && i !== arr.length - 1) return null;

                        const x =

                          42 +

                          (i / Math.max(1, arr.length - 1)) * (chartW - 52);

                        return (

                          <text

                            key={`${p.date}-${i}`}

                            x={x}

                            y={chartH - 8}

                            textAnchor="middle"

                            fontSize="9"

                            fill="currentColor"

                            opacity="0.55"

                          >

                            {p.label}

                          </text>

                        );

                      }

                    )}

                  </svg>

                </div>



                <p className="mt-3 text-[10px] leading-5 text-[var(--cx-muted)]">

                  Curve is generated directly from the uploaded programme datasets using cumulative activity finish distribution. It is not a cost-loaded or earned-value S-curve unless the source programme contains and the platform explicitly processes that weighting.

                </p>

              </>

            ) : (

              <Empty>

                No uploaded baseline/current programme dataset is available. Upload and register the programme in Delay Analysis first.

              </Empty>

            )}

          </Section>



          <Section eyebrow="Schedule dataset" title="Current Source">

            <div className="space-y-3 text-xs">

              {[

                ["Programme", currentProgramme?.programme_title || currentProgramme?.file_name],

                ["Revision", currentProgramme?.revision_label || (currentProgramme?.revision_number != null ? `Rev ${currentProgramme.revision_number}` : null)],

                ["Data Date", fmtDate(currentProgramme?.data_date || currentViewer?.data_date)],

                ["Project Start", currentStart ? fmtDate(currentStart.toISOString()) : "—"],

                ["Completion", currentFinish ? fmtDate(currentFinish.toISOString()) : "—"],

                ["Activities", currentProgramme?.activity_count ?? currentViewer?.activity_count],

                ["Relationships", currentProgramme?.relationship_count ?? currentViewer?.relationship_count],

                ["Status", pretty(currentProgramme?.programme_status)],

              ].map(([label, value]) => (

                <div

                  key={String(label)}

                  className="flex items-start justify-between gap-4 border-b border-[var(--cx-border)] pb-2 last:border-b-0"

                >

                  <span className="text-[var(--cx-muted)]">{label}</span>

                  <strong className="max-w-[62%] text-right font-semibold text-[var(--cx-text-soft)]">

                    {value ?? "—"}

                  </strong>

                </div>

              ))}

            </div>

          </Section>

        </div>



        <div className="grid gap-5 xl:grid-cols-3">

          <Section eyebrow="Delay Analysis" title="Latest Analysis">

            {latestAnalysis ? (

              <div className="space-y-4">

                <div>

                  <div className="text-lg font-semibold text-[var(--cx-text)]">

                    {pretty(latestAnalysis.analysis_type)}

                  </div>

                  <div className="mt-1 text-[11px] text-[var(--cx-muted)]">

                    {fmtDate(latestAnalysis.created_at)}

                  </div>

                </div>



                <div className="grid grid-cols-2 gap-2">

                  <div className="rounded-md bg-[var(--cx-card-2)] p-3">

                    <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--cx-muted)]">

                      Before

                    </div>

                    <div className="mt-1 text-sm font-semibold">

                      {fmtDate(latestAnalysis.before_finish)}

                    </div>

                  </div>

                  <div className="rounded-md bg-[var(--cx-card-2)] p-3">

                    <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--cx-muted)]">

                      After

                    </div>

                    <div className="mt-1 text-sm font-semibold">

                      {fmtDate(latestAnalysis.after_finish)}

                    </div>

                  </div>

                </div>



                <Link

                  href={`/delay-analytics${query}`}

                  className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.10em] text-[#D8A84E]"

                >

                  View Delay Analysis <ArrowUpRight className="h-3.5 w-3.5" />

                </Link>

              </div>

            ) : (

              <Empty>No persisted Delay Analysis is available for this project.</Empty>

            )}

          </Section>



          <Section eyebrow="Project actions" title="Tasks">

            {taskSummary ? (

              <div className="grid grid-cols-2 gap-2">

                <Metric label="Open" value={taskSummary.open ?? 0} />

                <Metric label="In Progress" value={taskSummary.in_progress ?? 0} />

                <Metric label="Critical" value={taskSummary.critical ?? 0} />

                <Metric label="Overdue" value={taskSummary.overdue ?? 0} />

              </div>

            ) : (

              <Empty>Task summary is not available.</Empty>

            )}

            <Link

              href={`/tasks${query}`}

              className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.10em] text-[#D8A84E]"

            >

              Open Tasks <ArrowUpRight className="h-3.5 w-3.5" />

            </Link>

          </Section>



          <Section eyebrow="Project data" title="Readiness">

            <div className="space-y-3">

              {[

                {

                  icon: <BarChart3 className="h-4 w-4" />,

                  label: "Programme Register",

                  value: `${programmes.length} uploaded`,

                  ready: programmes.length > 0,

                },

                {

                  icon: <Database className="h-4 w-4" />,

                  label: "Baseline Dataset",

                  value: baselineProgramme ? "Available" : "Not registered",

                  ready: Boolean(baselineProgramme),

                },

                {

                  icon: <FileText className="h-4 w-4" />,

                  label: "Private Vault",

                  value: documentCount == null ? "Unavailable" : `${documentCount} documents`,

                  ready: documentCount != null,

                },

                {

                  icon: <Scale className="h-4 w-4" />,

                  label: "Delay Analysis",

                  value: analyses.length ? `${analyses.length} stored` : "None",

                  ready: analyses.length > 0,

                },

              ].map((item) => (

                <div

                  key={item.label}

                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--cx-border)] bg-[var(--cx-card-2)] p-3"

                >

                  <div className="flex min-w-0 items-center gap-3">

                    <span className="text-[var(--cx-muted)]">{item.icon}</span>

                    <div className="min-w-0">

                      <div className="text-xs font-semibold text-[var(--cx-text)]">

                        {item.label}

                      </div>

                      <div className="mt-0.5 text-[10px] text-[var(--cx-muted)]">

                        {item.value}

                      </div>

                    </div>

                  </div>

                  {item.ready ? (

                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />

                  ) : (

                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />

                  )}

                </div>

              ))}

            </div>

          </Section>

        </div>



        <Section eyebrow="Project command centre" title="Quick Access">

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">

            {[

              {

                href: `/ask-contractx${query}`,

                title: "Ask ContractX",

                text: "Contract and project intelligence",

                icon: <ShieldCheck className="h-4 w-4" />,

              },

              {

                href: `/bespoke-review${query}`,

                title: "Bespoke Review",

                text: "Contract review and benchmark",

                icon: <FileText className="h-4 w-4" />,

              },

              {

                href: `/delay-analytics${query}`,

                title: "Delay Analysis",

                text: "Programme, CPM and forensic analysis",

                icon: <Clock3 className="h-4 w-4" />,

              },

              {

                href: `/claims${query}`,

                title: "Claims & Resolution",

                text: "Evidence-grounded drafting",

                icon: <Scale className="h-4 w-4" />,

              },

            ].map((item) => (

              <Link

                key={item.title}

                href={item.href}

                className="rounded-md border border-[var(--cx-border)] bg-[var(--cx-card-2)] p-4 transition hover:border-[#D8A84E]/35"

              >

                <div className="flex items-center gap-2 text-[#D8A84E]">

                  {item.icon}

                  <span className="text-xs font-black uppercase tracking-[0.08em]">

                    {item.title}

                  </span>

                </div>

                <div className="mt-2 text-[11px] leading-5 text-[var(--cx-muted)]">

                  {item.text}

                </div>

              </Link>

            ))}

          </div>

        </Section>



        <ContractXNoticeModal
          open={sourceNotes.length > 0}
          variant="warning"
          title="Some dashboard sources are unavailable"
          message={sourceNotes.join(" • ")}
          onClose={() => setSourceNotes([])}
        />



        <div className="border-t border-[var(--cx-border)] pt-4 text-[10px] leading-5 text-[var(--cx-muted)]">
          Dashboard displays project-source data only. No independent CPM or delay calculation is performed here.
        </div>

      </div>

      <LegalFooter compact />

    </main>

  );

}
