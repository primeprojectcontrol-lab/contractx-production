"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useActiveProject } from "@/hooks/useActiveProject";
import P6ProgrammeViewer from "@/components/delay/P6ProgrammeViewer";

type Theme = "dark" | "light";

type ProgrammeActivity = {
  activity_id_pk: string;
  activity_id: string;
  activity_name: string;
  wbs_path?: string;
  wbs_code?: string;
  wbs_name?: string;
  calendar_id?: string;
  original_duration_hours?: number;
  original_duration_days?: number;
  planned_duration_days?: number;
  start?: string | null;
  finish?: string | null;
  total_float_hours?: number;
  total_float_days?: number;
  status?: string;
  is_longest_path?: boolean;
  is_critical?: boolean;
};

type ProgrammeRelationship = {
  predecessor_activity_pk: string;
  successor_activity_pk: string;
  relationship_type: string;
  lag_hours: number;
};

type ViewerData = {
  schedule_id: string;
  programme_title: string;
  baseline_schedule_id?: string | null;
  data_date?: string | null;
  activity_count: number;
  relationship_count: number;
  activities: ProgrammeActivity[];
  relationships: ProgrammeRelationship[];
  read_only: boolean;
};

const API = "/api/contractx";

export default function ProgrammeViewerPage() {
  // Build-safe replacement for useSearchParams().
  // Query-string values are read on the client after mount so the existing
  // Programme Viewer can keep its current rendering and data-loading behavior
  // without requiring a Suspense boundary during Next.js prerendering.
  const [requestedScheduleId, setRequestedScheduleId] = useState("");
  const [requestedProjectId, setRequestedProjectId] = useState("");
  const [urlReady, setUrlReady] = useState(false);

  const {
    projectId,
    tenantId,
    loading: projectLoading,
  } = useActiveProject();

  const [data, setData] = useState<ViewerData | null>(null);
  const [baselineData, setBaselineData] = useState<ViewerData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const syncUrlContext = () => {
      const params = new URLSearchParams(window.location.search);

      setRequestedScheduleId(
        (params.get("schedule") || "").trim()
      );

      setRequestedProjectId(
        (params.get("project") || "").trim()
      );

      setUrlReady(true);
    };

    syncUrlContext();

    window.addEventListener("popstate", syncUrlContext);
    window.addEventListener(
      "contractx-project-change",
      syncUrlContext
    );

    return () => {
      window.removeEventListener("popstate", syncUrlContext);
      window.removeEventListener(
        "contractx-project-change",
        syncUrlContext
      );
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("contractx-theme");
    const initial: Theme =
      saved === "light" || saved === "dark"
        ? saved
        : window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";

    setTheme(initial);
    document.documentElement.dataset.contractxTheme = initial;
  }, []);

  useEffect(() => {
    if (!urlReady || projectLoading) return;

    const effectiveProjectId = requestedProjectId || projectId;

    if (!tenantId || !effectiveProjectId || !requestedScheduleId) {
      setError("Programme viewer requires a project and schedule selection.");
      setBusy(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      let primaryLoaded = false;
      setBusy(true);
      setError("");

      try {
        const query = new URLSearchParams({
          tenant_id: tenantId,
          project_id: effectiveProjectId,
        });

        const response = await fetch(
          `${API}/api/v1/engine2/programmes/${encodeURIComponent(
            requestedScheduleId
          )}/viewer?${query.toString()}`
        );

        if (!response.ok) {
          let message = `Programme viewer failed (${response.status})`;

          try {
            const body = await response.json();
            message = body?.detail || message;
          } catch {}

          throw new Error(message);
        }

        const payload = (await response.json()) as ViewerData;

        if (cancelled) return;

        // Show the primary programme immediately. Do not keep the full-screen
        // loader open while an optional baseline is fetched.
        setData(payload);
        primaryLoaded = true;
        setBusy(false);
        setBaselineData(null);

        // Baseline is secondary comparison data. Load it in the background so
        // large schedules do not make the main Programme Viewer appear hung.
        const baselineScheduleId = payload.baseline_schedule_id;

        if (baselineScheduleId) {
          void (async () => {
            try {
              const baselineResponse = await fetch(
                `${API}/api/v1/engine2/programmes/${encodeURIComponent(
                  baselineScheduleId
                )}/viewer?${query.toString()}`
              );

              if (!cancelled && baselineResponse.ok) {
                setBaselineData(
                  (await baselineResponse.json()) as ViewerData
                );
              }
            } catch {
              // Baseline remains optional; the main programme is already usable.
            }
          })();
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load programme viewer."
          );
        }
      } finally {
        if (!cancelled && !primaryLoaded) {
          setBusy(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    urlReady,
    projectLoading,
    projectId,
    requestedProjectId,
    requestedScheduleId,
    tenantId,
  ]);

  const backHref = requestedProjectId
    ? `/delay-analytics?project=${encodeURIComponent(requestedProjectId)}`
    : "/delay-analytics";

  const isDark = theme === "dark";

  return (
    <main
      className={
        isDark
          ? "min-h-screen bg-[#1A2027] text-[#EEF3F7]"
          : "min-h-screen bg-[#F3F6F9] text-[#111827]"
      }
    >
      <div className="w-full px-2 py-2 lg:px-3">
        <div
          className={
            isDark
              ? "mb-2 flex min-h-[38px] items-center justify-between rounded-lg border border-[#46515C] bg-[#252C34] px-3 py-2"
              : "mb-2 flex min-h-[38px] items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
          }
        >
          <div className="min-w-0">
            <div className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[#D8A84E]">
              ContractX.co · Programme Viewer
            </div>
          </div>

          <Link
            href={backHref}
            className={
              isDark
                ? "shrink-0 text-xs font-semibold text-[#C8D0D8] hover:text-white hover:underline"
                : "shrink-0 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline"
            }
          >
            ← Back to Delay Analytics
          </Link>
        </div>

        {busy && (
          <div
            className={
              isDark
                ? "rounded-lg border border-[#46515C] bg-[#252C34] px-5 py-16 text-center text-sm text-[#AAB4BE]"
                : "rounded-lg border border-slate-200 bg-white px-5 py-16 text-center text-sm text-slate-500"
            }
          >
            Loading programme…
          </div>
        )}

        {!busy && error && (
          <div
            className={
              isDark
                ? "rounded-lg border border-red-500/30 bg-red-500/[0.08] px-5 py-5 text-sm text-red-200"
                : "rounded-lg border border-red-300 bg-red-50 px-5 py-5 text-sm text-red-700"
            }
          >
            {error}
          </div>
        )}

        {!busy && !error && data && (
          <div className="min-w-0 max-w-full overflow-hidden">
            <P6ProgrammeViewer
              data={data}
              baselineData={baselineData}
              initialLongestOnly={false}
              theme={theme}
              onClose={() => {
                window.location.href = backHref;
              }}
            />
          </div>
        )}

        <footer
          className={
            isDark
              ? "mt-2 rounded-lg border border-[#46515C] bg-[#252C34] px-4 py-3"
              : "mt-2 rounded-lg border border-slate-200 bg-white px-4 py-3"
          }
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold">ContractX.co</div>
              <div className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-[#D8A84E]">
                Review. Monitor. Resolve.
              </div>
            </div>

            <div
              className={
                isDark
                  ? "max-w-3xl text-[9px] leading-4 text-[#9CA7B2] md:text-right"
                  : "max-w-3xl text-[9px] leading-4 text-slate-500 md:text-right"
              }
            >
              ContractX Engine 2 remains the calculation authority. Schedule
              changes are introduced only through controlled forensic workflows.
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
