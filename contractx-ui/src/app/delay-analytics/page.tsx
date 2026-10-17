"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useActiveProject } from "@/hooks/useActiveProject";
import { createClient } from "@/lib/supabase/client";
import ContractXNoticeModal from "@/components/ContractXNoticeModal";
import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";
import LegalFooter from "@/components/LegalFooter";

type Theme = "dark" | "light";

type Tab = "programmes" | "schedule" | "apab" | "windows" | "tia" | "tia_multi";

type AnyJson = Record<string, any>;

type RecentDelayAnalysis = {
  analysis_id: string;
  analysis_type?: string;
  created_at?: string;
  schedule_id?: string;
  tia_mode?: string | null;
  fragnet_id?: string | null;
  fragnet_name?: string | null;
  before_finish?: string | null;
  after_finish?: string | null;
  impact_days?: number | null;
  status?: string;
};

type MultiFragnetActivity = {
  rowId: string;
  activity_id_pk: string;
  activity_id: string;
  activity_name: string;
  planned_duration_days: string;
  calendar_id: string;
};

type MultiFragnetRelationship = {
  rowId: string;
  scope: "internal" | "insertion" | "remove";
  predecessor_activity_pk: string;
  successor_activity_pk: string;
  relationship_type: "FS" | "SS" | "FF" | "SF";
  lag_hrs: string;
};

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

type TiaActivityLink = {
  rowId: string;
  activity_id_pk: string;
  relationship_type: "FS" | "SS" | "FF" | "SF";
  lag_hours: string;
};

type TiaDelayEvent = {
  rowId: string;
  fragnet_id: string;
  fragnet_name: string;

  // Kept for backward compatibility with existing state/payload conventions.
  // When dates are present, this value is derived from the inclusive event window.
  duration_days: string;

  impact_start_date: string;
  forecast_end_date: string;

  calendar_id: string;
  predecessors: TiaActivityLink[];
  successors: TiaActivityLink[];
};

type Programme = {
  id: string;
  tenant_id: string;
  project_id: string;
  file_name: string;
  file_type?: string | null;
  schedule_type: string;
  data_date?: string | null;
  file_path?: string | null;
  uploaded_at?: string | null;
  programme_title?: string | null;
  revision_number?: number | null;
  revision_label?: string | null;
  programme_status?: "DRAFT" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "ARCHIVED" | string;
  is_current?: boolean;
  baseline_schedule_id?: string | null;
  source_sha256?: string | null;
  network_sha256?: string | null;
  activity_count?: number | null;
  relationship_count?: number | null;
  quality_summary?: AnyJson | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const API = "/api/contractx";
const MAX_PROGRAMMES_PER_PROJECT = 6;

function cx(...v: Array<string | false | null | undefined>) {

  return v.filter(Boolean).join(" ");

}

function fmt(value?: string) {

  if (!value) return "—";

  const d = new Date(value);

  return Number.isNaN(d.getTime())

    ? value

    : d.toLocaleDateString(undefined, {

        day: "2-digit",

        month: "short",

        year: "numeric",

      });

}

function fmtNum(value: unknown, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function inclusiveCalendarDays(
  startValue?: string | null,
  finishValue?: string | null
): number | null {
  if (!startValue || !finishValue) return null;

  const parseDateOnly = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utc = Date.UTC(year, month - 1, day);

    return Number.isFinite(utc) ? utc : null;
  };

  const start = parseDateOnly(startValue);
  const finish = parseDateOnly(finishValue);

  if (start === null || finish === null || finish < start) return null;

  return Math.floor((finish - start) / 86400000) + 1;
}

function printDate() {
  return new Date().toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function findDirectedCycle(
  relationships: Array<{
    predecessor_activity_pk: string;
    successor_activity_pk: string;
  }>
): string[] | null {
  const adjacency = new Map<string, string[]>();

  for (const rel of relationships) {
    const predecessor = String(rel.predecessor_activity_pk || "").trim();
    const successor = String(rel.successor_activity_pk || "").trim();

    if (!predecessor || !successor) continue;

    const next = adjacency.get(predecessor) || [];
    next.push(successor);
    adjacency.set(predecessor, next);

    if (!adjacency.has(successor)) adjacency.set(successor, []);
  }

  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const stackIndex = new Map<string, number>();

  const visit = (node: string): string[] | null => {
    state.set(node, 1);
    stackIndex.set(node, stack.length);
    stack.push(node);

    for (const next of adjacency.get(node) || []) {
      const nextState = state.get(next) || 0;

      if (nextState === 0) {
        const cycle = visit(next);
        if (cycle) return cycle;
      } else if (nextState === 1) {
        const startIndex = stackIndex.get(next) ?? 0;
        return [...stack.slice(startIndex), next];
      }
    }

    stack.pop();
    stackIndex.delete(node);
    state.set(node, 2);
    return null;
  };

  for (const node of adjacency.keys()) {
    if ((state.get(node) || 0) === 0) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }

  return null;
}

function ActivityRelationshipSelector({
  title,
  activities,
  links,
  excludedActivityIds = [],
  onAdd,
  onRemove,
  onUpdate,
  disabled = false,
}: {
  title: string;
  activities: ProgrammeActivity[];
  links: TiaActivityLink[];
  excludedActivityIds?: string[];
  onAdd: (activityIdPk: string) => void;
  onRemove: (rowId: string) => void;
  onUpdate: (
    rowId: string,
    patch: Partial<Pick<TiaActivityLink, "relationship_type" | "lag_hours">>
  ) => void;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const selectedIds = useMemo(
    () => new Set(links.map((link) => link.activity_id_pk)),
    [links]
  );

  const excludedIds = useMemo(
    () => new Set(excludedActivityIds),
    [excludedActivityIds]
  );

  const activityByPk = useMemo(
    () =>
      new Map(
        activities.map((activity) => [
          String(activity.activity_id_pk),
          activity,
        ])
      ),
    [activities]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return activities
      .filter(
        (activity) =>
          !selectedIds.has(activity.activity_id_pk) &&
          !excludedIds.has(activity.activity_id_pk)
      )
      .filter((activity) => {
        if (!q) return true;
        return [
          activity.activity_id,
          activity.activity_name,
          activity.wbs_path,
          activity.wbs_code,
          activity.wbs_name,
          activity.start,
          activity.finish,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      });
  }, [activities, query, selectedIds, excludedIds]);

  const singularTitle = title.replace(/s$/, "");

  return (
    <div className="rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--cx-text)]">
            {title}
          </div>
          <div className="mt-1 text-[10px] text-[var(--cx-muted)]">
            {links.length
              ? `${links.length} selected · each link can use FS / SS / FF / SF with lag or lead`
              : `Select ${singularTitle.toLowerCase()} activity · FS / SS / FF / SF with lag or lead`}
          </div>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setAdding((value) => !value);
            setQuery("");
          }}
          aria-label={`Add ${singularTitle}`}
          title={`Add another ${singularTitle.toLowerCase()}`}
          className="flex h-9 min-w-9 items-center justify-center rounded-[4px] border border-[#D8A84E]/45 bg-[#D8A84E]/10 px-3 text-[13px] font-black text-[#D8A84E] transition hover:bg-[#D8A84E]/18 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {adding ? "×" : "+"}
        </button>
      </div>

      {links.length > 0 && (
        <div className="mt-3 space-y-2">
          {links.map((link) => {
            const activity = activityByPk.get(link.activity_id_pk);

            return (
              <div
                key={link.rowId}
                className="rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-3"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-black text-[#D8A84E]">
                        {activity?.activity_id || link.activity_id_pk}
                      </span>
                      {activity?.is_critical && (
                        <span className="rounded-[3px] border border-red-400/30 bg-red-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-red-300">
                          Critical
                        </span>
                      )}
                    </div>

                    <div className="mt-1 truncate text-xs font-semibold text-[var(--cx-text)]">
                      {activity?.activity_name || "Activity"}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-[var(--cx-muted)] md:grid-cols-5">
                      <div>
                        <span className="font-bold text-[var(--cx-text-soft)]">OD </span>
                        {fmtNum(
                          activity?.original_duration_days ??
                            activity?.planned_duration_days
                        )}d
                      </div>
                      <div>
                        <span className="font-bold text-[var(--cx-text-soft)]">Start </span>
                        {fmt(activity?.start || undefined)}
                      </div>
                      <div>
                        <span className="font-bold text-[var(--cx-text-soft)]">Finish </span>
                        {fmt(activity?.finish || undefined)}
                      </div>
                      <div>
                        <span className="font-bold text-[var(--cx-text-soft)]">TF </span>
                        {activity?.total_float_days == null
                          ? "—"
                          : `${fmtNum(activity.total_float_days)}d`}
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-[var(--cx-text-soft)]">WBS </span>
                        {activity?.wbs_path ||
                          activity?.wbs_code ||
                          activity?.wbs_name ||
                          "—"}
                      </div>
                    </div>
                  </div>

                  <div className="grid shrink-0 grid-cols-[112px_145px_auto] gap-2">
                    <label>
                      <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                        Relationship
                      </span>
                      <select
                        value={link.relationship_type}
                        onChange={(e) =>
                          onUpdate(link.rowId, {
                            relationship_type: e.target
                              .value as TiaActivityLink["relationship_type"],
                          })
                        }
                        className="mt-1 h-10 w-full rounded-[4px] border border-white/[0.08] bg-[var(--cx-card-2)] px-2 text-[11px] font-bold text-[var(--cx-text)]"
                      >
                        <option value="FS">FS</option>
                        <option value="SS">SS</option>
                        <option value="FF">FF</option>
                        <option value="SF">SF</option>
                      </select>
                    </label>

                    <label>
                      <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                        Lag / Lead (Hours)
                      </span>
                      <input
                        type="number"
                        step="1"
                        value={link.lag_hours}
                        onChange={(e) =>
                          onUpdate(link.rowId, { lag_hours: e.target.value })
                        }
                        title="Positive value = lag; negative value = lead"
                        className="mt-1 h-10 w-full rounded-[4px] border border-white/[0.08] bg-[var(--cx-card-2)] px-2 text-[11px] text-[var(--cx-text)]"
                      />
                      <span className="mt-1 block text-[8px] leading-3 text-[var(--cx-muted)]">
                        + Lag · − Lead
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => onRemove(link.rowId)}
                      className="mt-[17px] h-10 rounded-[4px] border border-red-400/25 bg-red-400/[0.06] px-3 text-[10px] font-black uppercase tracking-[0.06em] text-red-300 hover:bg-red-400/10"
                    >
                      × Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="relative mt-3">
        {!adding && (
          <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setAdding(true);
                setQuery("");
              }}
              className="flex h-12 w-full items-center justify-between rounded-[4px] border border-white/[0.10] bg-[var(--cx-card)] px-3 text-left text-xs text-[var(--cx-text-soft)] transition hover:border-[#D8A84E]/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>
                {links.length
                  ? `Select another ${singularTitle.toLowerCase()} activity...`
                  : `Select ${singularTitle.toLowerCase()} activity...`}
              </span>
              <span className="text-[#D8A84E]">▾</span>
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setAdding(true);
                setQuery("");
              }}
              aria-label={`Add ${singularTitle}`}
              title={`Add another ${singularTitle.toLowerCase()}`}
              className="flex h-12 items-center justify-center rounded-[4px] border border-[#D8A84E]/45 bg-[#D8A84E]/10 text-lg font-black text-[#D8A84E] transition hover:bg-[#D8A84E]/18 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>
        )}

        {adding && (
          <div className="absolute left-0 right-0 top-0 z-50 rounded-md border border-[#D8A84E]/25 bg-[var(--cx-card)] p-3 shadow-2xl">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Activity ID, Activity Name, WBS, Start or Finish..."
                className="h-11 min-w-0 flex-1 rounded-[4px] border border-white/[0.10] bg-[var(--cx-card-2)] px-3 text-xs text-[var(--cx-text)] outline-none focus:border-[#D8A84E]/50"
              />
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setQuery("");
                }}
                className="h-11 rounded-[4px] border border-white/[0.08] px-3 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--cx-muted)]"
              >
                Close
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between text-[9px] font-semibold text-[var(--cx-muted)]">
              <span>
                {query.trim()
                  ? `${filtered.length} matching activities`
                  : `${filtered.length} available activities`}
              </span>
              <span>
                Programme total: {activities.length}
              </span>
            </div>

            <div className="mt-2 max-h-[320px] overflow-auto rounded-[4px] border border-white/[0.07] bg-[var(--cx-card-2)]">
              <div className="sticky top-0 z-10 hidden grid-cols-[110px_minmax(260px,1fr)_80px_105px_105px_80px] gap-3 border-b border-white/[0.08] bg-[var(--cx-card)] px-3 py-2 text-[8px] font-black uppercase tracking-[0.08em] text-[var(--cx-muted)] lg:grid">
                <span>Activity ID</span>
                <span>Activity Name</span>
                <span>OD</span>
                <span>Start</span>
                <span>Finish</span>
                <span>Total Float</span>
              </div>

              {filtered.length === 0 ? (
                <div className="px-3 py-5 text-center text-[11px] text-[var(--cx-muted)]">
                  No matching activities.
                </div>
              ) : (
                filtered.map((activity) => (
                  <button
                    key={activity.activity_id_pk}
                    type="button"
                    onClick={() => {
                      onAdd(activity.activity_id_pk);
                      setQuery("");
                      setAdding(false);
                    }}
                    className="block w-full border-b border-white/[0.05] px-3 py-3 text-left transition last:border-b-0 hover:bg-white/[0.04]"
                  >
                    <div className="hidden grid-cols-[110px_minmax(260px,1fr)_80px_105px_105px_80px] items-center gap-3 lg:grid">
                      <span className="truncate font-mono text-[10px] font-black text-[#D8A84E]">
                        {activity.activity_id || activity.activity_id_pk}
                      </span>
                      <span className="truncate text-[11px] font-semibold text-[var(--cx-text)]">
                        {activity.activity_name}
                      </span>
                      <span className="text-[10px] text-[var(--cx-text-soft)]">
                        {fmtNum(
                          activity.original_duration_days ??
                            activity.planned_duration_days
                        )}d
                      </span>
                      <span className="text-[10px] text-[var(--cx-text-soft)]">
                        {fmt(activity.start || undefined)}
                      </span>
                      <span className="text-[10px] text-[var(--cx-text-soft)]">
                        {fmt(activity.finish || undefined)}
                      </span>
                      <span className="text-[10px] text-[var(--cx-text-soft)]">
                        {activity.total_float_days == null
                          ? "—"
                          : `${fmtNum(activity.total_float_days)}d`}
                      </span>
                    </div>

                    <div className="lg:hidden">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-black text-[#D8A84E]">
                          {activity.activity_id || activity.activity_id_pk}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--cx-text)]">
                          {activity.activity_name}
                        </span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[9px] text-[var(--cx-muted)]">
                        <span>
                          OD{" "}
                          {fmtNum(
                            activity.original_duration_days ??
                              activity.planned_duration_days
                          )}d
                        </span>
                        <span>
                          TF{" "}
                          {activity.total_float_days == null
                            ? "—"
                            : `${fmtNum(activity.total_float_days)}d`}
                        </span>
                        <span>Start {fmt(activity.start || undefined)}</span>
                        <span>Finish {fmt(activity.finish || undefined)}</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function json(value: unknown) {

  try {

    return JSON.stringify(value, null, 2);

  } catch {

    return String(value);

  }

}

function Pill({

  children,

  tone = "neutral",

}: {

  children: React.ReactNode;

  tone?: "neutral" | "gold" | "blue" | "green" | "amber" | "red";

}) {

  const styles = {

    neutral: "border-white/10 bg-white/[0.04] text-[var(--cx-muted)]",

    gold: "border-[#D8A84E]/30 bg-[#D8A84E]/10 text-[#E8C982]",

    blue: "border-sky-400/20 bg-sky-400/10 text-sky-200",

    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",

    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",

    red: "border-red-400/20 bg-red-400/10 text-red-200",

  };

  return (

    <span

      className={cx(

        "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",

        styles[tone]

      )}

    >

      {children}

    </span>

  );

}

function Metric({

  label,

  value,

  note,

}: {

  label: string;

  value: React.ReactNode;

  note?: string;

}) {

  return (

    <div className="rounded-lg border border-white/[0.07] bg-[var(--cx-card)] p-4">

      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--cx-muted)]">

        {label}

      </div>

      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--cx-text)]">

        {value}

      </div>

      {note && <div className="mt-1 text-[11px] text-[var(--cx-muted)]">{note}</div>}

    </div>

  );

}

function MetricCard({

  title,

  value,

  subtitle,

}: {

  title: string;

  value: React.ReactNode;

  subtitle?: React.ReactNode;

}) {

  return (

    <div className="rounded-lg border border-white/[0.07] bg-[var(--cx-card-2)] p-4">

      <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cx-muted)]">

        {title}

      </div>

      <div className="mt-2 break-words text-xl font-semibold tracking-[-0.03em] text-[var(--cx-text)]">

        {value}

      </div>

      {subtitle !== undefined && subtitle !== null && subtitle !== "" && (

        <div className="mt-1 break-words text-[11px] leading-5 text-[var(--cx-muted)]">

          {subtitle}

        </div>

      )}

    </div>

  );

}

function FileBox({

  label,

  hint,

  file,

  onChange,
  disabled = false,

}: {

  label: string;

  hint: string;

  file: File | null;

  onChange: (file: File | null) => void;
  disabled?: boolean;

}) {

  return (

    <label
      className={cx(
        "block rounded-lg border border-dashed bg-[var(--cx-card-2)] p-4 transition",
        disabled
          ? "cursor-not-allowed border-white/[0.06] opacity-55"
          : "cursor-pointer border-white/[0.10] hover:border-[#D8A84E]/35"
      )}
    >

      <input

        type="file"

        accept=".xer"

        className="hidden"
        disabled={disabled}

        onChange={(e) => onChange(e.target.files?.[0] || null)}

      />

      <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#D8A84E]">

        {label}

      </div>

      <div className="mt-2 text-sm font-semibold text-[var(--cx-text)]">

        {file?.name || "Select Primavera P6 XER"}

      </div>

      <div className="mt-1 text-[11px] leading-5 text-[var(--cx-muted)]">{hint}</div>

    </label>

  );

}

function Toggle({

  value,

  onChange,

  label,

}: {

  value: boolean;

  onChange: (v: boolean) => void;

  label: string;

}) {

  return (

    <button

      type="button"

      onClick={() => onChange(!value)}

      className="flex w-full items-center justify-between rounded-md border border-white/[0.07] bg-white/[0.02] p-3"

    >

      <span className="text-xs font-semibold text-[var(--cx-text-soft)]">{label}</span>

      <span

        className={cx(

          "relative h-5 w-9 rounded-full border",

          value

            ? "border-[#D8A84E]/50 bg-[#D8A84E]/25"

            : "border-white/[0.10] bg-white/[0.04]"

        )}

      >

        <span

          className={cx(

            "absolute top-[2px] h-3.5 w-3.5 rounded-full transition-all",

            value

              ? "left-[18px] bg-[#D8A84E]"

              : "left-[2px] bg-[#69747F]"

          )}

        />

      </span>

    </button>

  );

}

export default function Engine2Page() {
  const supabase = useMemo(() => createClient(), []);

  const [theme, setTheme] = useState<Theme>("dark");
  const [themeReady, setThemeReady] = useState(false);

  const [tab, setTab] = useState<Tab>("programmes");

  const {
    projectId,
    project,
    tenantId,
    loading: projectLoading,
    error: projectError,
  } = useActiveProject();

  const [scheduleType, setScheduleType] = useState("baseline");

  const [scheduleFile, setScheduleFile] = useState<File | null>(null);

  const [scheduleId, setScheduleId] = useState("");

  const [analysisId, setAnalysisId] = useState("");
  const [recentAnalyses, setRecentAnalyses] = useState<RecentDelayAnalysis[]>([]);
  const [recentAnalysesLoading, setRecentAnalysesLoading] = useState(false);
  const [recentAnalysesOpen, setRecentAnalysesOpen] = useState(false);
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false);

  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [programmeCapacityCount, setProgrammeCapacityCount] = useState(0);
  const [programmeBusy, setProgrammeBusy] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [programmeEditId, setProgrammeEditId] = useState("");
  const [selectedProgrammeIds, setSelectedProgrammeIds] = useState<string[]>([]);
  const [apabBaselineId, setApabBaselineId] = useState("");
  const [apabAsBuiltId, setApabAsBuiltId] = useState("");
  const [windowAId, setWindowAId] = useState("");
  const [windowBId, setWindowBId] = useState("");
  const [apabSourceMode, setApabSourceMode] = useState<"registered" | "upload">("registered");
  const [windowSourceMode, setWindowSourceMode] = useState<"registered" | "upload">("registered");
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [asBuiltFile, setAsBuiltFile] = useState<File | null>(null);
  const [windowAFile, setWindowAFile] = useState<File | null>(null);
  const [windowBFile, setWindowBFile] = useState<File | null>(null);
  const [programmeTitle, setProgrammeTitle] = useState("");
  const [revisionNumber, setRevisionNumber] = useState("");
  const [revisionLabel, setRevisionLabel] = useState("");
  const [programmeStatus, setProgrammeStatus] = useState("DRAFT");
  const [baselineScheduleId, setBaselineScheduleId] = useState("");

  const [forensicAssessment, setForensicAssessment] = useState<AnyJson | null>(null);
  const [assessmentBusy, setAssessmentBusy] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "info"; message: string } | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");

  const [multiFragnetId, setMultiFragnetId] = useState("MFRAG-001");
  const [multiFragnetName, setMultiFragnetName] = useState("Multi-Activity Delay Fragnet");
  const [multiEventId, setMultiEventId] = useState("");
  const [multiEventTitle, setMultiEventTitle] = useState("");
  const [multiAffectedActivities, setMultiAffectedActivities] = useState("");

  const [multiActivities, setMultiActivities] = useState<MultiFragnetActivity[]>([
    {
      rowId: "a-1",
      activity_id_pk: "",
      activity_id: "",
      activity_name: "Fragnet Activity 1",
      planned_duration_days: "1",
      calendar_id: "",
    },
  ]);

  const [multiRelationships, setMultiRelationships] = useState<MultiFragnetRelationship[]>([
    {
      rowId: "r-1",
      scope: "insertion",
      predecessor_activity_pk: "",
      successor_activity_pk: "",
      relationship_type: "FS",
      lag_hrs: "0",
    },
  ]);

  const [fragnetId, setFragnetId] = useState("FRAG-001");

  const [fragnetName, setFragnetName] = useState("Delay Event Fragnet");

  // Date-driven TIA window. Start and forecast end are authoritative.
  // durationDays remains as a derived compatibility value for existing payloads.
  const [durationDays, setDurationDays] = useState("5");
  const [tiaImpactStartDate, setTiaImpactStartDate] = useState("");
  const [tiaForecastEndDate, setTiaForecastEndDate] = useState("");

  const [predecessorPk, setPredecessorPk] = useState("");

  const [successorPk, setSuccessorPk] = useState("");

  const [relationshipType, setRelationshipType] = useState("FS");

  const [lagHours, setLagHours] = useState("0");

  const [calendarId, setCalendarId] = useState("");

  const [tiaPredecessors, setTiaPredecessors] = useState<TiaActivityLink[]>([]);
  const [tiaSuccessors, setTiaSuccessors] = useState<TiaActivityLink[]>([]);

  const [multiDelayEvents, setMultiDelayEvents] = useState<TiaDelayEvent[]>([
    {
      rowId: "event-1",
      fragnet_id: "DELAY-001",
      fragnet_name: "Delay Event 1",
      duration_days: "",
      impact_start_date: "",
      forecast_end_date: "",
      calendar_id: "",
      predecessors: [],
      successors: [],
    },
  ]);
  const [selectedMultiEventRowId, setSelectedMultiEventRowId] = useState("event-1");

  const [programmeActivities, setProgrammeActivities] = useState<ProgrammeActivity[]>([]);
  const [programmeRelationships, setProgrammeRelationships] = useState<ProgrammeRelationship[]>([]);
  const [activitiesBusy, setActivitiesBusy] = useState(false);
  const [activitiesError, setActivitiesError] = useState("");
  const [selectorIntegrity, setSelectorIntegrity] = useState<{
    endpointCount: number;
    mergedCount: number;
    programmeRegisterCount: number | null;
    missingStart: number;
    missingFinish: number;
    missingFloat: number;
    complete: boolean;
  } | null>(null);

  const [advanced, setAdvanced] = useState(false);

  const [options, setOptions] = useState({

    progress_mode: "retained_logic",

    float_mode: "finish_float",

    critical_mode: "longest_path",

    lag_calendar_mode: "predecessor",

    use_expected_finish_dates: true,

    make_open_ended_critical: false,

    calculate_multiple_float_paths: true,

    multiple_float_path_mode: "free_float",

    multiple_float_path_count: 5,

    multiple_float_path_end_activity: "",

    level_resources: false,

    preserve_scheduled_early_late_dates: true,

    total_float_threshold_hours: 0,

  });

  const [result, setResult] = useState<AnyJson | null>(null);

  const [kind, setKind] = useState<Tab | null>(null);

  const [busy, setBusy] = useState("");

  const [error, setError] = useState("");

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

  }, []);

  const setPlatformTheme = (t: Theme) => {
    setTheme(t);
    document.documentElement.dataset.contractxTheme = t;
    window.localStorage.setItem("contractx-theme", t);
    window.dispatchEvent(
      new CustomEvent("contractx-theme-change", {
        detail: t,
      })
    );
  };

  const authenticatedFetch = async (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Authentication required.");
    }

    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${session.access_token}`);

    return globalThis.fetch(input, {
      ...init,
      headers,
    });
  };

  const call = async (

    label: string,

    fn: () => Promise<Response>,

    responseType: "json" | "blob" = "json"

  ) => {

    setBusy(label);

    setError("");

    try {

      const response = await fn();

      if (!response.ok) {

        let message = `Request failed (${response.status})`;

        try {

          const body = await response.json();

          message = body?.detail || message;

        } catch {}

        throw new Error(message);

      }

      return responseType === "blob"

        ? await response.blob()

        : await response.json();

    } catch (e) {

      setError(e instanceof Error ? e.message : "Delay Analysis request failed.");

      return null;

    } finally {

      setBusy("");

    }

  };

  const classifyStoredAnalysisKind = (analysis: AnyJson): Tab | null => {
    const analysisType = String(analysis?.analysis_type || "").toUpperCase();
    const tiaMode = String(analysis?.tia_mode || "").toLowerCase();

    if (analysisType === "TIME_IMPACT_ANALYSIS") {
      return tiaMode === "multi_activity_fragnet" ? "tia_multi" : "tia";
    }
    if (
      analysisType.includes("AS_PLANNED") ||
      analysisType.includes("AS-PLANNED") ||
      analysisType.includes("AS_BUILT") ||
      analysisType.includes("APAB")
    ) {
      return "apab";
    }
    if (analysisType.includes("WINDOW")) return "windows";
    return null;
  };

  const openStoredAnalysis = async (storedAnalysisId: string) => {
    if (!tenantId || !projectId || !storedAnalysisId) return;

    const query = new URLSearchParams({
      tenant_id: tenantId,
      project_id: projectId,
    });

    const data = await call(
      "Opening saved Delay Analysis...",
      () =>
        authenticatedFetch(
          `${API}/api/v1/engine2/analysis/${encodeURIComponent(
            storedAnalysisId
          )}?${query.toString()}`,
          { cache: "no-store" }
        )
    );

    if (!data?.result) return;

    const restored = data.result as AnyJson;
    const restoredKind = classifyStoredAnalysisKind(restored);

    setResult(restored);
    setKind(restoredKind);
    setAnalysisId(storedAnalysisId);

    if (restoredKind) setTab(restoredKind);
  };

  const loadRecentAnalyses = async (restoreLatest = false) => {
    if (!tenantId || !projectId) return;

    setRecentAnalysesLoading(true);
    try {
      const query = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId,
        limit: "3",
      });

      const response = await authenticatedFetch(
        `${API}/api/v1/engine2/analyses?${query.toString()}`,
        { cache: "no-store" }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.detail || `Unable to load recent Delay Analysis records (${response.status})`
        );
      }

      const rows = Array.isArray(data.analyses) ? data.analyses : [];
      setRecentAnalyses(rows);

      if (restoreLatest && !result && rows[0]?.analysis_id) {
        await openStoredAnalysis(rows[0].analysis_id);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load recent Delay Analysis records."
      );
    } finally {
      setRecentAnalysesLoading(false);
    }
  };

  const deleteStoredAnalysis = async (storedAnalysisId: string) => {
    if (!tenantId || !projectId || !storedAnalysisId) return;

    const confirmed = window.confirm(
      "WARNING — PERMANENT DELETION\n\n" +
        "This permanently deletes the selected Delay Analysis.\n\n" +
        "The source programme and source XER will NOT be deleted.\n\n" +
        "Future XLSX/XER regeneration from this analysis will be unavailable.\n\n" +
        "This action cannot be undone."
    );
    if (!confirmed) return;

    const query = new URLSearchParams({
      tenant_id: tenantId,
      project_id: projectId,
    });

    const data = await call(
      "Deleting saved Delay Analysis...",
      () =>
        authenticatedFetch(
          `${API}/api/v1/engine2/analysis/${encodeURIComponent(
            storedAnalysisId
          )}?${query.toString()}`,
          { method: "DELETE" }
        )
    );

    if (!data) return;

    if (analysisId === storedAnalysisId) {
      setResult(null);
      setKind(null);
      setAnalysisId("");
    }

    await loadRecentAnalyses(false);
    setNotice({
      type: "success",
      message:
        "Delay Analysis deleted. The source programme and source XER remain unchanged.",
    });
  };

  const programmeFetch = async (
    label: string,
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    setProgrammeBusy(label);
    setError("");
    try {
      const response = await authenticatedFetch(input, init);
      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const body = await response.json();
          message = body?.detail || message;
        } catch {}
        throw new Error(message);
      }
      return await response.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Programme Register request failed.");
      return null;
    } finally {
      setProgrammeBusy("");
    }
  };

  const loadProgrammes = async () => {
    if (!projectId || !tenantId) return;

    const params = new URLSearchParams({
      tenant_id: tenantId,
      project_id: projectId,
      include_archived: String(includeArchived),
    });

    const data = await programmeFetch(
      "Loading Programme Register...",
      `${API}/api/v1/engine2/programmes?${params.toString()}`
    );

    if (!data) return;

    const rows = Array.isArray(data.programmes) ? data.programmes : [];
    setProgrammes(rows);
    setProgrammeCapacityCount(
      Number.isFinite(Number(data.project_programme_count))
        ? Number(data.project_programme_count)
        : rows.length
    );

    const current = rows.find((p: Programme) => p.is_current);
    if (current?.id) {
      setScheduleId(current.id);
    }
  };

  useEffect(() => {
    if (!projectId || !tenantId) return;
    void loadProgrammes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tenantId, includeArchived]);

  useEffect(() => {
    if (!projectId || !tenantId) return;
    void loadRecentAnalyses(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tenantId]);

  const beginEditProgramme = (programme: Programme) => {
    setProgrammeEditId(programme.id);
    setProgrammeTitle(programme.programme_title || programme.file_name || "");
    setRevisionNumber(
      programme.revision_number === null || programme.revision_number === undefined
        ? ""
        : String(programme.revision_number)
    );
    setRevisionLabel(programme.revision_label || "");
    setProgrammeStatus(programme.programme_status || "DRAFT");
    setBaselineScheduleId(programme.baseline_schedule_id || "");
  };

  const cancelProgrammeEdit = () => {
    setProgrammeEditId("");
    setProgrammeTitle("");
    setRevisionNumber("");
    setRevisionLabel("");
    setProgrammeStatus("DRAFT");
    setBaselineScheduleId("");
  };

  const saveProgramme = async (schedulePk: string) => {
    if (!projectId || !tenantId) return;

    const payload: AnyJson = {
      tenant_id: tenantId,
      project_id: projectId,
      programme_title: programmeTitle.trim(),
      revision_label: revisionLabel.trim() || null,
      programme_status: programmeStatus,
      baseline_schedule_id: baselineScheduleId || null,
    };

    if (revisionNumber.trim() !== "") {
      payload.revision_number = Number(revisionNumber);
    } else {
      payload.revision_number = null;
    }

    const data = await programmeFetch(
      "Updating programme metadata...",
      `${API}/api/v1/engine2/programmes/${schedulePk}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!data) return;
    cancelProgrammeEdit();
    await loadProgrammes();
    setNotice({ type: "success", message: "Programme metadata updated successfully." });
  };

  const setCurrentProgramme = async (schedulePk: string) => {
    if (!projectId || !tenantId) return;

    const data = await programmeFetch(
      "Setting current programme...",
      `${API}/api/v1/engine2/programmes/${schedulePk}/set-current`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          project_id: projectId,
        }),
      }
    );

    if (!data) return;
    setScheduleId(schedulePk);
    await loadProgrammes();
    setNotice({ type: "success", message: "Current programme updated." });
  };

  const archiveProgramme = async (schedulePk: string) => {
    if (!projectId || !tenantId) return;

    const data = await programmeFetch(
      "Archiving programme...",
      `${API}/api/v1/engine2/programmes/${schedulePk}/archive`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          project_id: projectId,
        }),
      }
    );

    if (!data) return;
    if (scheduleId === schedulePk) setScheduleId("");
    await loadProgrammes();
    setConfirmArchiveId("");
    setNotice({ type: "success", message: "Programme archived. The revision remains auditable." });
  };

  const useProgrammeForAnalysis = (programme: Programme) => {
    setScheduleId(programme.id);
    setTab("tia");
    setError("");
  };

  const programmeTone = (
    status?: string
  ): "neutral" | "gold" | "blue" | "green" | "amber" | "red" => {
    if (status === "ACCEPTED") return "green";
    if (status === "SUBMITTED") return "blue";
    if (status === "REJECTED") return "red";
    if (status === "SUPERSEDED" || status === "ARCHIVED") return "neutral";
    return "amber";
  };

  const runForensicAssessment = async () => {
    if (!projectId || !tenantId) {
      setError("Select a valid ContractX project before running the forensic assessment.");
      return;
    }

    if (!scheduleId.trim()) {
      setError("Set or select a current programme before running the forensic assessment.");
      return;
    }

    setAssessmentBusy("Generating consolidated forensic schedule assessment...");
    setError("");

    try {
      const response = await authenticatedFetch(`${API}/api/v1/engine2/forensic-assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          project_id: projectId,
          schedule_id: scheduleId,
          persist: true,
          scheduling_options: {
            progress_mode: options.progress_mode,
            float_mode: options.float_mode,
            critical_mode: options.critical_mode,
            lag_calendar_mode: options.lag_calendar_mode,
            use_expected_finish_dates: options.use_expected_finish_dates,
            make_open_ended_critical: options.make_open_ended_critical,
            ignore_external_relationships: true,
            calculate_multiple_float_paths: options.calculate_multiple_float_paths,
            multiple_float_path_mode: options.multiple_float_path_mode,
            multiple_float_path_count: Math.max(
              1,
              Math.min(50, Number(options.multiple_float_path_count) || 10)
            ),
            multiple_float_path_end_activity:
              options.multiple_float_path_end_activity || null,
            level_resources: options.level_resources,
            preserve_scheduled_early_late_dates:
              options.preserve_scheduled_early_late_dates,
            total_float_threshold_hours:
              Number(options.total_float_threshold_hours) || 0,
          },
        }),
      });

      if (!response.ok) {
        let message = `Forensic assessment failed (${response.status})`;
        try {
          const body = await response.json();
          message = body?.detail || message;
        } catch {}
        throw new Error(message);
      }

      const data = await response.json();
      setForensicAssessment(data);
      setAnalysisId(data.analysis_id || "");
      if (data.analysis_id) void loadRecentAnalyses(false);
      setNotice({ type: "success", message: "Forensic Schedule Assessment generated successfully." });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Forensic schedule assessment failed."
      );
    } finally {
      setAssessmentBusy("");
    }
  };

  const dcmaMetrics: AnyJson[] = Array.isArray(
    forensicAssessment?.dcma_14_point?.metrics
  )
    ? forensicAssessment.dcma_14_point.metrics
    : [];

  const dcmaSummary: AnyJson =
    forensicAssessment?.dcma_14_point?.summary || {};

  const dcmaDisplayUnit = (metric: AnyJson) => {
    const point = Number(metric?.point || 0);
    if (point === 12) return "Pass / Fail";
    if (point === 13 || point === 14) return "Index";
    if (point === 10) return "% unresourced";
    if (point === 4) return "% FS";
    return "%";
  };

  const dcmaIndustryStandard = (metric: AnyJson) => {
    switch (Number(metric?.point || 0)) {
      case 1: return "≤ 5%";
      case 2: return "0%";
      case 3: return "≤ 5%";
      case 4: return "≥ 90% FS";
      case 5: return "≤ 5%";
      case 6: return "≤ 5% · High Float > 44 working days";
      case 7: return "0%";
      case 8: return "≤ 5% · High Duration > 44 working days";
      case 9: return "0%";
      case 10: return "0% unresourced where resource loading is required";
      case 11: return "≤ 5%";
      case 12:
        return "600 working-day stress test · completion should move commensurately";
      case 13: return "≥ 0.95";
      case 14: return "≥ 0.95";
      default: return "—";
    }
  };

  const dcmaDisplayValue = (metric: AnyJson) => {
    const point = Number(metric?.point || 0);
    const status = String(metric?.status || "").toUpperCase();

    if (status === "NOT_ASSESSED" || status === "NOT ASSESSED") return "—";

    if (point === 12) {
      return status === "PASS" || status === "FAIL" ? status : "—";
    }

    if (
      metric?.value === null ||
      metric?.value === undefined ||
      Number.isNaN(Number(metric.value))
    ) {
      return "—";
    }

    if ([1,2,3,4,5,6,7,8,9,10,11].includes(point)) {
      return `${fmtNum(Number(metric.value))}%`;
    }

    if (point === 13 || point === 14) {
      return fmtNum(Number(metric.value));
    }

    return String(metric.value);
  };

  const assessmentExecutive: AnyJson =
    forensicAssessment?.executive_summary || {};

  const advancedDiagnostics: AnyJson =
    forensicAssessment?.advanced_diagnostics || {};

  const pathAnalytics: AnyJson =
    forensicAssessment?.cpm_and_path_analysis || {};

  const exceptionRegister: AnyJson[] = Array.isArray(
    forensicAssessment?.exception_activity_register
  )
    ? forensicAssessment.exception_activity_register
    : [];

  const deleteProgramme = async (schedulePk: string) => {
    if (!tenantId || !projectId) return;

    const query = new URLSearchParams({
      tenant_id: tenantId,
      project_id: projectId,
      delete_analyses: "true",
    });

    const data = await programmeFetch(
      "Deleting programme and raw storage...",
      `${API}/api/v1/engine2/programmes/${encodeURIComponent(
        schedulePk
      )}?${query.toString()}`,
      { method: "DELETE" }
    );

    if (!data) return;

    if (scheduleId === schedulePk) {
      setScheduleId("");
      setProgrammeActivities([]);
    }

    setConfirmDeleteId("");
    await loadProgrammes();
    setNotice({
      type: "success",
      message: data.storage_warning
        ? `Programme deleted. ${data.storage_warning}`
        : "Programme and associated raw schedule storage deleted.",
    });
  };

  const printCurrentView = () => {
    window.print();
  };

  const uploadSchedule = async () => {

    if (!projectId || !tenantId) {
      setError("Select a valid ContractX project before uploading a schedule.");
      return;
    }

    if (programmeCapacityCount >= MAX_PROGRAMMES_PER_PROJECT) {
      setError(
        `This project already contains ${MAX_PROGRAMMES_PER_PROJECT} programme XER files. Delete one programme from Programme Register before adding another.`
      );
      setTab("programmes");
      return;
    }

    if (!scheduleFile) {

      setError("Select a Primavera P6 XER first.");

      return;

    }

    const form = new FormData();

    form.append("file", scheduleFile);

    form.append("tenant_id", tenantId ?? "");

    form.append("project_id", projectId ?? "");

    form.append("schedule_type", scheduleType);

    const data = await call("Parsing XER and calculating CPM...", () =>

      authenticatedFetch(`${API}/api/v1/engine2/upload-schedule`, {

        method: "POST",

        body: form,

      })

    );

    if (!data) return;

    setResult(data);

    setKind("schedule");

    setScheduleId(data.schedule_id || "");

    setAnalysisId("");
    await loadProgrammes();
    setNotice({ type: "success", message: "Programme uploaded, parsed and CPM calculated successfully." });

  };

  const toggleProgrammeSelection = (programmeId: string) => {
    setSelectedProgrammeIds((current) => {
      if (current.includes(programmeId)) {
        return current.filter((id) => id !== programmeId);
      }
      if (current.length >= 2) {
        setError("Select a maximum of two programme revisions for comparison.");
        return current;
      }
      return [...current, programmeId];
    });
  };

  const useSelectedForApAb = () => {
    if (selectedProgrammeIds.length !== 2) {
      setError("Select exactly two programme revisions first.");
      return;
    }
    setApabBaselineId(selectedProgrammeIds[0]);
    setApabAsBuiltId(selectedProgrammeIds[1]);
    setTab("apab");
  };

  const useSelectedForWindows = () => {
    if (selectedProgrammeIds.length !== 2) {
      setError("Select exactly two programme revisions first.");
      return;
    }
    setWindowAId(selectedProgrammeIds[0]);
    setWindowBId(selectedProgrammeIds[1]);
    setTab("windows");
  };

  const printDcmaAssessment = () => {
    document.body.classList.add("cx-print-dcma-only");

    const cleanup = () => {
      document.body.classList.remove("cx-print-dcma-only");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    window.print();

    window.setTimeout(cleanup, 1500);
  };

  const runApAb = async () => {
    if (apabSourceMode === "upload") {
      if (!baselineFile || !asBuiltFile) {
        setError("Select both baseline and as-built XER files.");
        return;
      }

      const form = new FormData();
      form.append("baseline_file", baselineFile);
      form.append("as_built_file", asBuiltFile);

      const data = await call("Running As-Planned vs As-Built...", () =>
        authenticatedFetch(`${API}/api/v1/engine2/as-planned-vs-as-built`, {
          method: "POST",
          body: form,
        })
      );

      if (!data) return;

      setResult(data);
      setKind("apab");
      setAnalysisId(data.analysis_id || "");
      if (data.analysis_id) void loadRecentAnalyses(false);
      setNotice({
        type: "success",
        message: "As-Planned vs As-Built analysis completed.",
      });
      return;
    }

    if (!tenantId || !projectId) {
      setError("Project context is not ready.");
      return;
    }

    if (!apabBaselineId || !apabAsBuiltId) {
      setError("Select both the As-Planned and As-Built programme revisions.");
      return;
    }

    if (apabBaselineId === apabAsBuiltId) {
      setError("As-Planned and As-Built must be different programme revisions.");
      return;
    }

    const data = await call("Running As-Planned vs As-Built...", () =>
      authenticatedFetch(`${API}/api/v1/engine2/as-planned-vs-as-built/registered`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          project_id: projectId,
          baseline_schedule_id: apabBaselineId,
          as_built_schedule_id: apabAsBuiltId,
          persist: true,
        }),
      })
    );

    if (!data) return;

    setResult(data);
    setKind("apab");
    setAnalysisId(data.analysis_id || "");
      if (data.analysis_id) void loadRecentAnalyses(false);
    setNotice({
      type: "success",
      message: "As-Planned vs As-Built analysis completed.",
    });
  };

  const runWindows = async () => {
    if (windowSourceMode === "upload") {
      if (!windowAFile || !windowBFile) {
        setError("Select both Window A and Window B XER files.");
        return;
      }

      const form = new FormData();
      form.append("window_a_file", windowAFile);
      form.append("window_b_file", windowBFile);

      const data = await call("Running Window Analysis...", () =>
        authenticatedFetch(`${API}/api/v1/engine2/window-analysis`, {
          method: "POST",
          body: form,
        })
      );

      if (!data) return;

      setResult(data);
      setKind("windows");
      setAnalysisId(data.analysis_id || "");
      if (data.analysis_id) void loadRecentAnalyses(false);
      setNotice({
        type: "success",
        message: "Window Analysis completed.",
      });
      return;
    }

    if (!tenantId || !projectId) {
      setError("Project context is not ready.");
      return;
    }

    if (!windowAId || !windowBId) {
      setError("Select both Window A and Window B programme revisions.");
      return;
    }

    if (windowAId === windowBId) {
      setError("Window A and Window B must be different programme revisions.");
      return;
    }

    const data = await call("Running Window Analysis...", () =>
      authenticatedFetch(`${API}/api/v1/engine2/window-analysis/registered`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          project_id: projectId,
          window_a_schedule_id: windowAId,
          window_b_schedule_id: windowBId,
          persist: true,
        }),
      })
    );

    if (!data) return;

    setResult(data);
    setKind("windows");
    setAnalysisId(data.analysis_id || "");
      if (data.analysis_id) void loadRecentAnalyses(false);
    setNotice({
      type: "success",
      message: "Window Analysis completed.",
    });
  };

  useEffect(() => {
    if (!tenantId || !projectId || !scheduleId.trim()) {
      setProgrammeActivities([]);
      setProgrammeRelationships([]);
      setSelectorIntegrity(null);
      setActivitiesError("");
      return;
    }

    let cancelled = false;

    const loadProgrammeActivities = async () => {
      setActivitiesBusy(true);
      setActivitiesError("");

      try {
        const query = new URLSearchParams({
          tenant_id: tenantId,
          project_id: projectId,
        });

        const response = await authenticatedFetch(
          `${API}/api/v1/engine2/programmes/${encodeURIComponent(
            scheduleId.trim()
          )}/activities?${query.toString()}`
        );

        if (!response.ok) {
          let detail = `Unable to load programme activities (${response.status})`;
          try {
            const body = await response.json();
            detail = body?.detail || detail;
          } catch {}
          throw new Error(detail);
        }

        const data = await response.json();
        if (cancelled) return;

        const selectorRows: ProgrammeActivity[] = Array.isArray(data?.activities)
          ? data.activities
          : [];

        const viewerResponse = await authenticatedFetch(
          `${API}/api/v1/engine2/programmes/${encodeURIComponent(
            scheduleId.trim()
          )}/viewer?${query.toString()}`
        );

        if (!viewerResponse.ok) {
          let detail = `Unable to load programme relationships (${viewerResponse.status})`;
          try {
            const body = await viewerResponse.json();
            detail = body?.detail || detail;
          } catch {}
          throw new Error(detail);
        }

        const viewerData = await viewerResponse.json();
        if (cancelled) return;

        const viewerActivities: ProgrammeActivity[] = Array.isArray(viewerData?.activities)
          ? viewerData.activities
          : [];

        const viewerByPk = new Map(
          viewerActivities.map((activity) => [String(activity.activity_id_pk), activity])
        );

        // Keep the selector endpoint authoritative for activity population.
        // Fill only missing display fields from the read-only viewer dataset.
        const rows: ProgrammeActivity[] = selectorRows.map((activity) => {
          const viewer = viewerByPk.get(String(activity.activity_id_pk));
          return {
            ...activity,
            original_duration_days:
              activity.original_duration_days ??
              activity.planned_duration_days ??
              viewer?.original_duration_days ??
              viewer?.planned_duration_days,
            start: activity.start ?? viewer?.start ?? null,
            finish: activity.finish ?? viewer?.finish ?? null,
            total_float_days:
              activity.total_float_days ?? viewer?.total_float_days,
            is_longest_path:
              activity.is_longest_path ?? viewer?.is_longest_path,
            is_critical: activity.is_critical ?? viewer?.is_critical,
          };
        });

        setProgrammeActivities(rows);

        const relationshipRows: ProgrammeRelationship[] = Array.isArray(
          viewerData?.relationships
        )
          ? viewerData.relationships
              .map((rel: AnyJson) => ({
                predecessor_activity_pk: String(rel?.predecessor_activity_pk || ""),
                successor_activity_pk: String(rel?.successor_activity_pk || ""),
                relationship_type: String(rel?.relationship_type || "FS"),
                lag_hours: Number(rel?.lag_hours || 0),
              }))
              .filter(
                (rel: ProgrammeRelationship) =>
                  rel.predecessor_activity_pk && rel.successor_activity_pk
              )
          : [];

        setProgrammeRelationships(relationshipRows);

        const selectedProgramme = programmes.find(
          (programme) => programme.id === scheduleId.trim()
        );
        const registerCount =
          selectedProgramme?.activity_count == null
            ? null
            : Number(selectedProgramme.activity_count);
        const endpointCount = Number(data?.activity_count ?? selectorRows.length);
        const missingStart = rows.filter((row) => !row.start).length;
        const missingFinish = rows.filter((row) => !row.finish).length;
        const missingFloat = rows.filter((row) => row.total_float_days == null).length;
        const countMatchesEndpoint = endpointCount === rows.length;
        const countMatchesRegister =
          registerCount == null || registerCount === rows.length;

        setSelectorIntegrity({
          endpointCount,
          mergedCount: rows.length,
          programmeRegisterCount: registerCount,
          missingStart,
          missingFinish,
          missingFloat,
          complete: countMatchesEndpoint && countMatchesRegister,
        });

        // Clear stale selections if they do not exist in the newly selected programme.
        const ids = new Set(rows.map((row: ProgrammeActivity) => row.activity_id_pk));
        setPredecessorPk((current) => (current && !ids.has(current) ? "" : current));
        setSuccessorPk((current) => (current && !ids.has(current) ? "" : current));

        setTiaPredecessors((current) =>
          current.filter((link) => ids.has(link.activity_id_pk))
        );
        setTiaSuccessors((current) =>
          current.filter((link) => ids.has(link.activity_id_pk))
        );
        setMultiDelayEvents((events) =>
          events.map((event) => ({
            ...event,
            predecessors: event.predecessors.filter((link) =>
              ids.has(link.activity_id_pk)
            ),
            successors: event.successors.filter((link) =>
              ids.has(link.activity_id_pk)
            ),
          }))
        );
      } catch (e) {
        if (cancelled) return;
        setProgrammeActivities([]);
        setProgrammeRelationships([]);
        setSelectorIntegrity(null);
        setActivitiesError(
          e instanceof Error ? e.message : "Unable to load programme activities."
        );
      } finally {
        if (!cancelled) setActivitiesBusy(false);
      }
    };

    void loadProgrammeActivities();

    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, scheduleId]);

  const relationActivityOptions = [
    ...programmeActivities.map((activity) => ({
      value: activity.activity_id_pk,
      label: `${activity.activity_id || activity.activity_id_pk} | ${activity.activity_name}`,
      source: "programme" as const,
    })),
    ...multiActivities
      .filter((activity) => activity.activity_id_pk.trim())
      .map((activity) => ({
        value: activity.activity_id_pk.trim(),
        label: `${activity.activity_id.trim() || activity.activity_id_pk.trim()} | ${
          activity.activity_name || "Custom Fragnet Activity"
        }`,
        source: "fragnet" as const,
      })),
  ];

  const runTia = async () => {
    if (!projectId || !tenantId) {
      setError("Select a valid ContractX project before running TIA.");
      return;
    }

    if (!scheduleId.trim()) {
      setError("Select a registered programme before running TIA.");
      return;
    }

    if (!fragnetId.trim() || !fragnetName.trim()) {
      setError("Delay Fragnet ID and Delay Fragnet Name are required.");
      return;
    }

    if (!tiaPredecessors.length || !tiaSuccessors.length) {
      setError(
        "Add at least one predecessor and one successor before running TIA."
      );
      return;
    }

    const predecessorIds = new Set(
      tiaPredecessors.map((link) => link.activity_id_pk)
    );
    const duplicateAcrossSides = tiaSuccessors.find((link) =>
      predecessorIds.has(link.activity_id_pk)
    );

    if (duplicateAcrossSides) {
      setError(
        "Hard rule: an activity selected as a predecessor cannot also be selected as a successor in the same delay fragnet."
      );
      return;
    }

    if (!tiaImpactStartDate || !tiaForecastEndDate) {
      setError("Impact Start Date and Forecast End Date are required.");
      return;
    }

    const durationDaysValue = inclusiveCalendarDays(
      tiaImpactStartDate,
      tiaForecastEndDate
    );

    if (!(durationDaysValue && durationDaysValue > 0)) {
      setError(
        "Forecast End Date must be the same as or later than Impact Start Date."
      );
      return;
    }

    // Keep the legacy duration state synchronized for restored UI/result
    // compatibility. The backend uses the date window as authoritative.
    setDurationDays(String(durationDaysValue));

    const activityLabelByPk = new Map(
      programmeActivities.map((activity) => [
        activity.activity_id_pk,
        `${activity.activity_id || activity.activity_id_pk} — ${activity.activity_name}`,
      ])
    );

    const fragnetPkForCycle = fragnetId.trim();
    activityLabelByPk.set(
      fragnetPkForCycle,
      `${fragnetPkForCycle} — ${fragnetName.trim()}`
    );

    const proposedSingleRelationships = [
      ...programmeRelationships.map((rel) => ({
        predecessor_activity_pk: rel.predecessor_activity_pk,
        successor_activity_pk: rel.successor_activity_pk,
      })),
      ...tiaPredecessors.map((link) => ({
        predecessor_activity_pk: link.activity_id_pk,
        successor_activity_pk: fragnetPkForCycle,
      })),
      ...tiaSuccessors.map((link) => ({
        predecessor_activity_pk: fragnetPkForCycle,
        successor_activity_pk: link.activity_id_pk,
      })),
    ];

    const singleCycle = findDirectedCycle(proposedSingleRelationships);

    if (singleCycle) {
      const readableLoop = singleCycle
        .map((pk) => activityLabelByPk.get(pk) || pk)
        .join(" → ");

      setError(
        `LOOP DETECTED — TIA cannot be calculated because the proposed fragnet creates a circular CPM network. The network contains a logic loop: ${readableLoop}. A successor ultimately links back to one of its own predecessors, so the CPM network cannot be scheduled deterministically. Remove or revise the conflicting predecessor/successor relationship before running the analysis.`
      );
      return;
    }

    const fragnetPk = fragnetId.trim();
    const insertionRelationships = [
      ...tiaPredecessors.map((link) => ({
        predecessor_activity_pk: link.activity_id_pk,
        successor_activity_pk: fragnetPk,
        relationship_type: link.relationship_type,
        lag_hrs: Number(link.lag_hours) || 0,
      })),
      ...tiaSuccessors.map((link) => ({
        predecessor_activity_pk: fragnetPk,
        successor_activity_pk: link.activity_id_pk,
        relationship_type: link.relationship_type,
        lag_hrs: Number(link.lag_hours) || 0,
      })),
    ];

    const directSourceRelationshipsToReplace = programmeRelationships
      .filter(
        (sourceRel) =>
          tiaPredecessors.some(
            (pred) =>
              pred.activity_id_pk === sourceRel.predecessor_activity_pk
          ) &&
          tiaSuccessors.some(
            (succ) =>
              succ.activity_id_pk === sourceRel.successor_activity_pk
          )
      )
      .map((sourceRel) => ({
        predecessor_activity_pk: sourceRel.predecessor_activity_pk,
        successor_activity_pk: sourceRel.successor_activity_pk,
        relationship_type: sourceRel.relationship_type || "FS",
        lag_hrs: Number(sourceRel.lag_hours) || 0,
      }));

    const payload: AnyJson = {
      tenant_id: tenantId,
      project_id: projectId,
      schedule_id: scheduleId.trim(),
      fragnet_id: fragnetPk,
      fragnet_name: fragnetName.trim(),
      fragnet_activities: [
        {
          activity_id_pk: fragnetPk,
          activity_id: fragnetPk,
          activity_name: fragnetName.trim(),
          planned_duration_days: durationDaysValue,
          planned_duration_hrs: durationDaysValue * 24,
          delay_start_date: tiaImpactStartDate,
          delay_finish_date: tiaForecastEndDate,
          // Do not force ContractX 24H. The backend inherits the source P6
          // calendar from the inserted predecessor/network location.
          calendar_id: "",
        },
      ],
      fragnet_relationships: [],
      insertion_relationships: insertionRelationships,
      remove_relationships: directSourceRelationshipsToReplace,
      affected_activity_ids: [
        ...new Set([
          ...tiaPredecessors.map((link) => link.activity_id_pk),
          ...tiaSuccessors.map((link) => link.activity_id_pk),
        ]),
      ],
      scheduling_options: {
        ...options,
        multiple_float_path_end_activity:
          options.multiple_float_path_end_activity.trim() || null,
      },
    };

    const data = await call(
      "Recalculating Time Impact Analysis with multiple insertion relationships...",
      () =>
        authenticatedFetch(`${API}/api/v1/engine2/time-impact-analysis/fragnet`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
    );

    if (!data) return;

    setResult(data);
    setKind("tia");
    setAnalysisId(data.analysis_id || "");
      if (data.analysis_id) void loadRecentAnalyses(false);
    setNotice({
      type: "success",
      message:
        "Time Impact Analysis completed with multiple predecessor/successor relationships.",
    });
  };

  const runMultiFragnetTIA = async () => {
    if (!tenantId || !projectId || !scheduleId.trim()) {
      setError(
        "Select a registered programme before running Multi-Event Time Impact Analysis."
      );
      return;
    }

    if (!multiDelayEvents.length) {
      setError("Add at least one delay event.");
      return;
    }

    const invalidEvent = multiDelayEvents.find((event) => {
      const elapsedDays = inclusiveCalendarDays(
        event.impact_start_date,
        event.forecast_end_date
      );

      return (
        !event.fragnet_id.trim() ||
        !event.fragnet_name.trim() ||
        !event.impact_start_date ||
        !event.forecast_end_date ||
        !(elapsedDays && elapsedDays > 0) ||
        !event.predecessors.length ||
        !event.successors.length
      );
    });

    if (invalidEvent) {
      setError(
        "Every delay event requires a Fragnet ID, Fragnet Name, Impact Start Date, Forecast End Date, at least one predecessor and at least one successor. Forecast End Date cannot be earlier than Impact Start Date."
      );
      return;
    }

    const overlapEvent = multiDelayEvents.find((event) => {
      const predecessorIds = new Set(
        event.predecessors.map((link) => link.activity_id_pk)
      );
      return event.successors.some((link) =>
        predecessorIds.has(link.activity_id_pk)
      );
    });

    if (overlapEvent) {
      setError(
        `Hard rule: a programme activity cannot be both predecessor and successor within delay fragnet ${overlapEvent.fragnet_id || overlapEvent.rowId}.`
      );
      return;
    }

    const eventIds = multiDelayEvents.map((event) => event.fragnet_id.trim());
    if (new Set(eventIds).size !== eventIds.length) {
      setError("Each Delay Fragnet ID must be unique.");
      return;
    }

    const multiActivityLabelByPk = new Map(
      programmeActivities.map((activity) => [
        activity.activity_id_pk,
        `${activity.activity_id || activity.activity_id_pk} — ${activity.activity_name}`,
      ])
    );

    for (const event of multiDelayEvents) {
      multiActivityLabelByPk.set(
        event.fragnet_id.trim(),
        `${event.fragnet_id.trim()} — ${event.fragnet_name.trim()}`
      );
    }

    const proposedMultiRelationships = [
      ...programmeRelationships.map((rel) => ({
        predecessor_activity_pk: rel.predecessor_activity_pk,
        successor_activity_pk: rel.successor_activity_pk,
      })),
      ...multiDelayEvents.flatMap((event) => {
        const fragnetPk = event.fragnet_id.trim();
        return [
          ...event.predecessors.map((link) => ({
            predecessor_activity_pk: link.activity_id_pk,
            successor_activity_pk: fragnetPk,
          })),
          ...event.successors.map((link) => ({
            predecessor_activity_pk: fragnetPk,
            successor_activity_pk: link.activity_id_pk,
          })),
        ];
      }),
    ];

    const multiCycle = findDirectedCycle(proposedMultiRelationships);

    if (multiCycle) {
      const readableLoop = multiCycle
        .map((pk) => multiActivityLabelByPk.get(pk) || pk)
        .join(" → ");

      setError(
        `LOOP DETECTED — Multi-Event TIA cannot be calculated because the proposed delay fragnets create a circular CPM network. The network contains a logic loop: ${readableLoop}. This means an activity or delay fragnet becomes both upstream and downstream of itself through the relationship chain. CPM forward/backward pass calculation is invalid until the loop is removed. Revise the conflicting predecessor/successor relationships and run the analysis again.`
      );
      return;
    }

    const fragnetActivities = multiDelayEvents.map((event) => {
      const elapsedDays =
        inclusiveCalendarDays(
          event.impact_start_date,
          event.forecast_end_date
        ) || 0;

      return {
        activity_id_pk: event.fragnet_id.trim(),
        activity_id: event.fragnet_id.trim(),
        activity_name: event.fragnet_name.trim(),
        planned_duration_days: elapsedDays,
        planned_duration_hrs: elapsedDays * 24,
        delay_start_date: event.impact_start_date,
        delay_finish_date: event.forecast_end_date,
        // The backend resolves the source P6 calendar from the inserted network.
        calendar_id: "",
      };
    });

    const insertionRelationships = multiDelayEvents.flatMap((event) => {
      const fragnetPk = event.fragnet_id.trim();

      return [
        ...event.predecessors.map((link) => ({
          predecessor_activity_pk: link.activity_id_pk,
          successor_activity_pk: fragnetPk,
          relationship_type: link.relationship_type,
          lag_hrs: Number(link.lag_hours) || 0,
        })),
        ...event.successors.map((link) => ({
          predecessor_activity_pk: fragnetPk,
          successor_activity_pk: link.activity_id_pk,
          relationship_type: link.relationship_type,
          lag_hrs: Number(link.lag_hours) || 0,
        })),
      ];
    });

    const affectedActivityIds = [
      ...new Set(
        multiDelayEvents.flatMap((event) => [
          ...event.predecessors.map((link) => link.activity_id_pk),
          ...event.successors.map((link) => link.activity_id_pk),
        ])
      ),
    ];

    const multiSourceRelationshipsToReplace = programmeRelationships
      .filter((sourceRel) =>
        multiDelayEvents.some(
          (event) =>
            event.predecessors.some(
              (pred) =>
                pred.activity_id_pk === sourceRel.predecessor_activity_pk
            ) &&
            event.successors.some(
              (succ) =>
                succ.activity_id_pk === sourceRel.successor_activity_pk
            )
        )
      )
      .map((sourceRel) => ({
        predecessor_activity_pk: sourceRel.predecessor_activity_pk,
        successor_activity_pk: sourceRel.successor_activity_pk,
        relationship_type: sourceRel.relationship_type || "FS",
        lag_hrs: Number(sourceRel.lag_hours) || 0,
      }));

    const payload: AnyJson = {
      tenant_id: tenantId,
      project_id: projectId,
      schedule_id: scheduleId.trim(),
      fragnet_id: `MULTI-${Date.now()}`,
      fragnet_name: "Multi-Event Delay Fragnet",
      fragnet_activities: fragnetActivities,
      fragnet_relationships: [],
      insertion_relationships: insertionRelationships,
      remove_relationships: multiSourceRelationshipsToReplace,
      affected_activity_ids: affectedActivityIds,
      scheduling_options: {
        ...options,
        multiple_float_path_end_activity:
          options.multiple_float_path_end_activity.trim() || null,
      },
      event: {
        event_id: `MULTI-${Date.now()}`,
        event_title: `${multiDelayEvents.length} Delay Event TIA`,
      },
    };

    const data = await call("Running Multi-Event Time Impact Analysis...", () =>
      authenticatedFetch(`${API}/api/v1/engine2/time-impact-analysis/fragnet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    if (!data) return;

    setResult(data);
    setKind("tia_multi");
    setAnalysisId(data.analysis_id || "");
      if (data.analysis_id) void loadRecentAnalyses(false);
    setNotice({
      type: "success",
      message: `Multi-Event Time Impact Analysis completed for ${multiDelayEvents.length} delay event(s).`,
    });
  };

  const exportXlsx = async () => {

    if (!analysisId.trim()) {

      setError("A persisted analysis ID is required for Excel export.");

      return;

    }

    const blob = await call(

      "Preparing Excel export...",

      () =>

        authenticatedFetch(`${API}/api/v1/engine2/analysis/export`, {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({

            analysis_id: analysisId.trim(),

            format: "xlsx",

          }),

        }),

      "blob"

    );

    if (!blob) return;

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = `ContractX_Forensic_Gantt_${analysisId.slice(0, 8)}.xlsx`;

    document.body.appendChild(a);

    a.click();

    a.remove();

    URL.revokeObjectURL(url);

  };

  const deleteImpactedAnalysis = async () => {
    if (!analysisId.trim()) {
      setError("No persisted Delay Analysis is available to delete.");
      return;
    }
    await deleteStoredAnalysis(analysisId.trim());
  };

  const exportImpactedXer = async () => {
    if (!analysisId.trim()) {
      setError("A persisted TIA analysis ID is required for impacted XER export.");
      return;
    }

    if (kind !== "tia" && kind !== "tia_multi") {
      setError("Impacted XER export is available only for Time Impact Analysis results.");
      return;
    }

    if (!tenantId || !projectId) {
      setError("Project context is required for impacted XER export.");
      return;
    }

    const blob = await call(
      "Preparing impacted Primavera XER...",
      () =>
        authenticatedFetch(`${API}/api/v1/engine2/analysis/export-xer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: tenantId,
            project_id: projectId,
            analysis_id: analysisId.trim(),
            write_calculated_dates: true,
          }),
        }),
      "blob"
    );

    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ContractX_Impacted_TIA_${analysisId.slice(0, 8)}.xer`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const countChangeSet = (value: AnyJson | null | undefined) => {
    if (!value || typeof value !== "object") return 0;
    return (
      Number(value.added_count || 0) +
      Number(value.removed_count || 0) +
      Number(value.modified_count || 0)
    );
  };

  const signedDays = (value: unknown) => {
    if (value == null || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    const clean = fmtNum(Math.abs(n), 2);
    if (n > 0) return `+${clean} days`;
    if (n < 0) return `-${clean} days`;
    return "0 days";
  };

  const comparisonImpact = useMemo(() => {
    if (!result || (kind !== "apab" && kind !== "windows")) return null;

    if (result.impact_summary) return result.impact_summary as AnyJson;

    if (kind === "apab") {
      const summary = result.comparison?.summary || {};
      return {
        method_label: "As-Planned vs As-Built",
        planned_finish: summary.baseline_project_finish,
        actual_or_current_finish:
          summary.as_built_or_current_project_finish,
        completion_variance_calendar_days:
          summary.project_finish_shift_calendar_days,
        baseline_activity_count: summary.baseline_activity_count,
        as_built_activity_count: summary.as_built_activity_count,
        matched_activity_count: summary.matched_activity_count,
        later_finish_activity_count: summary.later_finish_activity_count,
        added_activity_count: summary.added_activity_count,
        deleted_or_missing_activity_count:
          summary.deleted_or_missing_activity_count,
        became_critical_count: summary.became_critical_count,
        left_critical_set_count: summary.left_critical_set_count,
        logic_change_count: countChangeSet(result.logic_changes),
        calendar_change_count: countChangeSet(result.calendar_changes),
      };
    }

    const summary = result.results?.summary || {};
    const activities = Array.isArray(result.results?.activities)
      ? result.results.activities
      : [];

    let slipped = 0;
    let recovered = 0;
    let progressed = 0;
    let constraintChanges = 0;

    for (const item of activities) {
      const finishDays = Number(item?.delta?.finish_calendar_days);
      if (Number.isFinite(finishDays)) {
        if (finishDays > 0) slipped += 1;
        if (finishDays < 0) recovered += 1;
      }
      const progressChange = Number(item?.delta?.percent_complete_change);
      if (Number.isFinite(progressChange) && progressChange > 0) {
        progressed += 1;
      }
      if (Array.isArray(item?.constraint_changes)) {
        constraintChanges += item.constraint_changes.length;
      } else if (
        item?.constraint_changes &&
        typeof item.constraint_changes === "object"
      ) {
        constraintChanges += Object.keys(item.constraint_changes).length;
      }
    }

    return {
      method_label: "Window Analysis",
      window_a_finish: summary.window_a_finish,
      window_b_finish: summary.window_b_finish,
      completion_movement_calendar_days:
        summary.finish_shift_calendar_days,
      window_a_activity_count: summary.window_a_activity_count,
      window_b_activity_count: summary.window_b_activity_count,
      changed_activity_count: summary.changed_activity_count,
      added_activity_count: summary.added_activity_count,
      removed_activity_count: summary.removed_activity_count,
      slipped_activity_count: slipped,
      recovered_activity_count: recovered,
      progressed_activity_count: progressed,
      float_erosion_activity_count:
        summary.float_erosion_activity_count,
      became_critical_count: summary.became_critical_count,
      logic_change_count: countChangeSet(result.results?.logic_changes),
      calendar_change_count: countChangeSet(
        result.results?.calendar_changes
      ),
      constraint_change_count: constraintChanges,
    };
  }, [result, kind]);

  const metrics = useMemo(() => {

    if (!result) return [];

    if (kind === "schedule") {

      return [

        ["Activities", result.summary?.activity_count ?? "—"],

        ["Relationships", result.summary?.relationship_count ?? "—"],

        [
          "Open Starts",
          Array.isArray(result.summary?.open_starts)
            ? result.summary.open_starts.length
            : result.summary?.open_starts ?? "—",
        ],

        [
          "Open Finishes",
          Array.isArray(result.summary?.open_finishes)
            ? result.summary.open_finishes.length
            : result.summary?.open_finishes ?? "—",
        ],

        ["Project Start", fmt(result.summary?.project_start)],

        ["Project Finish", fmt(result.summary?.project_finish)],

        ["Longest Path", result.summary?.longest_path_count ?? "—"],

      ];

    }

    if (kind === "apab" && comparisonImpact) {
      return [
        ["Planned Completion", fmt(comparisonImpact.planned_finish)],
        ["Actual / Current Completion", fmt(comparisonImpact.actual_or_current_finish)],
        [
          "Completion Variance",
          signedDays(comparisonImpact.completion_variance_calendar_days),
        ],
        [
          "Activities Compared",
          comparisonImpact.matched_activity_count ?? "—",
        ],
      ];
    }

    if (kind === "windows" && comparisonImpact) {
      return [
        ["Window A Completion", fmt(comparisonImpact.window_a_finish)],
        ["Window B Completion", fmt(comparisonImpact.window_b_finish)],
        [
          "Completion Movement",
          signedDays(comparisonImpact.completion_movement_calendar_days),
        ],
        [
          "Activities Changed",
          comparisonImpact.changed_activity_count ?? "—",
        ],
      ];
    }

    return [];

  }, [result, kind, comparisonImpact]);

  const openNetworkActivities = useMemo(() => {
    if (!result || kind !== "schedule") {
      return { starts: [] as AnyJson[], finishes: [] as AnyJson[] };
    }

    const activityByPk = new Map(
      programmeActivities.map((activity) => [
        String(activity.activity_id_pk),
        activity,
      ])
    );

    const resolve = (values: unknown) =>
      (Array.isArray(values) ? values : []).map((pk) => {
        const key = String(pk);
        const activity = activityByPk.get(key);

        return {
          activity_id_pk: key,
          activity_id: activity?.activity_id || key,
          activity_name: activity?.activity_name || "Activity name loading / unavailable",
          wbs_path: activity?.wbs_path || "",
        };
      });

    return {
      starts: resolve(result.summary?.open_starts),
      finishes: resolve(result.summary?.open_finishes),
    };
  }, [result, kind, programmeActivities]);

  const workflowRows: Array<{
    title: string;
    items: Array<[Tab, string, string]>;
  }> = [
    {
      title: "Programme",
      items: [
        ["programmes", "Programme Register", "Revisions / Current"],
      ],
    },
    {
      title: "Analysis Methods",
      items: [
        ["schedule", "Programme CPM", "Upload / Calculate"],
        ["tia", "Single TIA", "Delay Fragnet"],
        ["tia_multi", "Multi-Event TIA", "Multiple Delay Events"],
        ["apab", "As-Planned vs As-Built", "AP vs AB"],
        ["windows", "Window Analysis", "Time Slice"],
      ],
    },
  ];

  const isMultiDelayEventReady = (event: TiaDelayEvent) =>
    Boolean(
      event.fragnet_id.trim() &&
        event.fragnet_name.trim() &&
        event.impact_start_date &&
        event.forecast_end_date &&
        inclusiveCalendarDays(event.impact_start_date, event.forecast_end_date) &&
        event.predecessors.length &&
        event.successors.length
    );

  const selectedMultiDelayEvent =
    multiDelayEvents.find((event) => event.rowId === selectedMultiEventRowId) ||
    multiDelayEvents[0];

  const selectedMultiDelayEventIndex = Math.max(
    0,
    multiDelayEvents.findIndex(
      (event) => event.rowId === selectedMultiDelayEvent?.rowId
    )
  );

  const readyMultiDelayEvents = multiDelayEvents.filter(isMultiDelayEventReady).length;

  if (projectLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--cx-bg)] px-5 text-[var(--cx-text)]">
        <div className="rounded-full border border-white/[0.10] bg-[var(--cx-card)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cx-muted)]">
          Loading project context…
        </div>
      </main>
    );
  }

  if (projectError || !projectId || !tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--cx-bg)] px-5 text-[var(--cx-text)]">
        <div className="w-full max-w-xl rounded-md border border-[#D8A84E]/25 bg-[var(--cx-card)] p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D8A84E]">
            Project context required
          </div>
          <div className="mt-3 text-sm leading-6 text-[var(--cx-muted)]">
            {projectError ||
              "Select a project from Portfolio before opening Delay Analysis."}
          </div>
          <a
            href="/portfolio"
            className="mt-5 inline-flex rounded-md bg-[#D8A84E] px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-[#050608]"
          >
            Back to Portfolio
          </a>
        </div>
      </main>
    );
  }

  return (

    <main

      data-theme={theme}
      className="cx-platform-root flex min-h-screen flex-col bg-[var(--cx-bg)] text-[var(--cx-text)]"

    >

      <style>{`
        .cx-platform-root {
          --cx-bg: #050608;
          --cx-card: #0D0F12;
          --cx-card-2: #080A0D;
          --cx-text: #F5F3EE;
          --cx-text-soft: #D8DCE0;
          --cx-muted: #69747F;
          --cx-border: rgba(255,255,255,.08);
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
          --cx-tint: rgba(255,255,255,.025);
          color-scheme: dark;
          background: var(--cx-bg);
          color: var(--cx-text);
          transition: background-color .18s ease, color .18s ease;
        }

        .cx-platform-root[data-theme="light"] {
          --cx-bg: #F4F1EA;
          --cx-card: #FFFFFF;
          --cx-card-2: #FAF8F3;
          --cx-text: #17191C;
          --cx-text-soft: #2B3035;
          --cx-muted: #66707A;
          --cx-border: rgba(23,25,28,.12);
          --cx-tint: rgba(23,25,28,.035);
          color-scheme: light;
        
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

        .cx-platform-root,
        .cx-platform-root * {
          transition-property: background-color, border-color, color, box-shadow;
          transition-duration: .18s;
          transition-timing-function: ease;
        }

        .cx-platform-root [class*="border-white"] {
          border-color: var(--cx-border) !important;
        }

        .cx-platform-root [class*="bg-white/"] {
          background-color: var(--cx-tint) !important;
        }

        .cx-platform-root input,
        .cx-platform-root select,
        .cx-platform-root textarea {
          color: var(--cx-text) !important;
          background-color: var(--cx-card-2) !important;
          border-color: var(--cx-border) !important;
        }

        .cx-platform-root input::placeholder,
        .cx-platform-root textarea::placeholder {
          color: var(--cx-muted) !important;
          opacity: .72;
        }

        .cx-platform-root table thead {
          background-color: var(--cx-card-2) !important;
        }

        .cx-platform-root table tbody tr:hover {
          background-color: var(--cx-tint) !important;
        }

        .cx-platform-root pre,
        .cx-platform-root code {
          color: var(--cx-text-soft);
        }

        html[data-contractx-theme="light"] {
          color-scheme: light;
          background: #F4F1EA;
        }

        html[data-contractx-theme="dark"] {
          color-scheme: dark;
          background: #050608;
        }

        @media print {
          .cx-platform-root {
            --cx-bg: #ffffff;
            --cx-card: #ffffff;
            --cx-card-2: #f7f7f7;
            --cx-text: #111111;
            --cx-text-soft: #222222;
            --cx-muted: #555555;
            color-scheme: light;
            background: #ffffff !important;
          }

          .cx-print-header {
            display: flex !important;
            align-items: flex-end;
            justify-content: space-between;
            border-bottom: 1px solid #d6d6d6;
            margin: 0 0 14px 0;
            padding: 0 0 10px 0;
          }

          .cx-print-brand {
            font-size: 20px;
            font-weight: 800;
            letter-spacing: -0.04em;
            color: #111111;
          }

          .cx-print-brand span {
            color: #D8A84E;
          }

          .cx-print-meta {
            text-align: right;
            font-size: 9px;
            line-height: 1.5;
            color: #555555;
          }

          button,
          .no-print {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          @page {
            margin: 14mm;
          }
        }

        @media print {
          body.cx-print-dcma-only * {
            visibility: hidden !important;
          }

          body.cx-print-dcma-only .dcma-print-area,
          body.cx-print-dcma-only .dcma-print-area * {
            visibility: visible !important;
          }

          body.cx-print-dcma-only .dcma-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            color: #111111 !important;
          }

          body.cx-print-dcma-only .cx-dcma-print-header {
            display: flex !important;
            align-items: flex-end;
            justify-content: space-between;
            border-bottom: 1px solid #d6d6d6;
            margin-bottom: 14px;
            padding-bottom: 10px;
          }

          body.cx-print-dcma-only button {
            display: none !important;
          }

          body.cx-print-dcma-only table {
            break-inside: auto;
          }

          body.cx-print-dcma-only tr {
            break-inside: avoid;
            break-after: auto;
          }
        }

      `}</style>

      {(busy || programmeBusy || assessmentBusy || confirmArchiveId || confirmDeleteId) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-md border border-white/[0.10] bg-[var(--cx-card)] p-6 shadow-2xl">
            {confirmDeleteId ? (
              <>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-300">
                  Permanent Delete
                </div>
                <div className="mt-3 text-lg font-semibold text-[var(--cx-text)]">
                  Delete this programme revision?
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--cx-muted)]">
                  This permanently removes the programme register record, its raw stored schedule and linked CPM analysis records. This action is different from Archive and cannot be undone.
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId("")}
                    className="rounded-md border border-white/[0.08] px-4 py-2.5 text-xs font-bold text-[var(--cx-text-soft)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteProgramme(confirmDeleteId)}
                    className="rounded-md bg-red-500 px-4 py-2.5 text-xs font-black text-white"
                  >
                    Delete Permanently
                  </button>
                </div>
              </>
            ) : confirmArchiveId ? (
              <>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D8A84E]">
                  Confirm Archive
                </div>
                <div className="mt-3 text-lg font-semibold text-[var(--cx-text)]">
                  Archive this programme revision?
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--cx-muted)]">
                  The revision will remain auditable and can be displayed again using Include Archived.
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmArchiveId("")}
                    className="rounded-md border border-white/[0.08] px-4 py-2.5 text-xs font-bold text-[var(--cx-muted)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void archiveProgramme(confirmArchiveId)}
                    className="rounded-md bg-[#D8A84E] px-4 py-2.5 text-xs font-black text-[#050608]"
                  >
                    Archive Programme
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D8A84E]">
                  Processing
                </div>
                <div className="mt-3 text-lg font-semibold text-[var(--cx-text)]">
                  Please wait
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--cx-muted)]">
                  {assessmentBusy || programmeBusy || busy}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ContractXNoticeModal
        open={Boolean(error)}
        variant="error"
        title="ContractX could not complete the action"
        message={error}
        onClose={() => setError("")}
      />

      <ContractXNoticeModal
        open={Boolean(notice)}
        variant={notice?.type === "success" ? "success" : "info"}
        title={notice?.type === "success" ? "Completed" : "Information"}
        message={notice?.message || ""}
        onClose={() => setNotice(null)}
      />

      <div className="mx-auto w-full max-w-[1580px] flex-1 px-5 py-6 lg:px-8">

        <header className="mb-5 rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-5 lg:p-6">

          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">

            <div>
<h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--cx-text)] lg:text-4xl">

                Delay Analysis

              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--cx-muted)]">

                Deterministic CPM, Time Impact Analysis, As-Planned vs As-Built

                and Window Analysis from registered programme data.

              </p>

            </div>

            <div className="flex flex-wrap items-center gap-2">

              <button
                type="button"
                onClick={() => {
                  setTab("schedule");
                  setError("");
                  window.setTimeout(
                    () => document.getElementById("workflow-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    30
                  );
                }}
                className="rounded-md bg-[#D8A84E] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.13em] text-[#050608] shadow-sm"
              >
                + Upload Programme
              </button>

              <ContractXThemeSwitch
                theme={theme}
                onChange={setPlatformTheme}
              />

              {project && (
                <div className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[10px] font-semibold text-[var(--cx-muted)]">
                  {project.project_name}
                  {project.project_code ? ` · ${project.project_code}` : ""}
                </div>
              )}

            </div>

          </div>

        </header>

        <section className="mb-5 rounded-md border border-white/[0.07] bg-[var(--cx-card)]">
          <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[#D8A84E]">
                Current Analysis Context
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-[var(--cx-text)]">
                {programmes.find((programme) => programme.id === scheduleId)?.programme_title ||
                  programmes.find((programme) => programme.id === scheduleId)?.file_name ||
                  "No programme selected"}
                {programmes.find((programme) => programme.id === scheduleId)?.is_current
                  ? " · CURRENT"
                  : ""}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTechnicalDetailsOpen((current) => !current)}
              className="w-fit rounded-[4px] border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[9px] font-black uppercase tracking-[0.10em] text-[var(--cx-muted)] transition hover:text-[var(--cx-text)]"
            >
              {technicalDetailsOpen ? "Hide Technical Details" : "Technical Details"}
            </button>
          </div>

          {technicalDetailsOpen && (
            <div className="grid gap-3 border-t border-white/[0.06] px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Tenant ID", tenantId || "—"],
                ["Project ID", projectId || "—"],
                ["Schedule ID", scheduleId || "Not selected"],
                ["Analysis ID", analysisId || "Not generated"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <div className="text-[8px] font-bold uppercase tracking-[0.13em] text-[var(--cx-muted)]">
                    {label}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-[var(--cx-text-soft)]">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-5 rounded-md border border-white/[0.07] bg-[var(--cx-card)]">
          <button
            type="button"
            onClick={() => setRecentAnalysesOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            aria-expanded={recentAnalysesOpen}
          >
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D8A84E]">
                Recent Delay Analysis
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--cx-text)]">
                {recentAnalyses.length} of 3 analysis records stored
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="text-lg font-black text-[var(--cx-muted)]">
                {recentAnalysesOpen ? "−" : "+"}
              </span>
            </div>
          </button>

          {recentAnalysesOpen && (
            <div className="border-t border-white/[0.07] px-5 pb-5 pt-4">
              <p className="max-w-4xl text-[11px] leading-5 text-[var(--cx-muted)]">
                ContractX stores only the latest 3 Delay Analysis records for this project.
                When a fourth analysis is completed, the oldest stored analysis is
                automatically deleted. Save required XLSX/XER outputs to your own
                system before running additional analyses. Source programmes and
                source XER files are never automatically deleted.
              </p>

              {recentAnalysesLoading ? (
                <div className="mt-4 text-xs text-[var(--cx-muted)]">
                  Loading saved Delay Analysis records…
                </div>
              ) : recentAnalyses.length ? (
                <div className="mt-4 grid gap-3 xl:grid-cols-3">
                  {recentAnalyses.map((item, index) => (
                    <div
                      key={item.analysis_id}
                      className="rounded-md border border-white/[0.07] bg-[var(--cx-card-2)] p-4"
                    >
                      <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[#D8A84E]">
                        {index === 0 ? "Last Analysis" : `Saved Analysis ${index + 1}`}
                      </div>
                      <div className="mt-1 text-sm font-bold text-[var(--cx-text)]">
                        {item.analysis_type === "AS_PLANNED_VS_AS_BUILT"
                          ? "As-Planned vs As-Built"
                          : item.analysis_type === "WINDOW_ANALYSIS"
                          ? "Window Analysis"
                          : item.analysis_type === "TIME_IMPACT_ANALYSIS"
                          ? "Time Impact Analysis"
                          : item.analysis_type || "Delay Analysis"}
                      </div>

                      <div className="mt-3 space-y-1 text-[10px] leading-4 text-[var(--cx-muted)]">
                        {item.fragnet_id && (
                          <div>
                            <strong className="text-[var(--cx-text-soft)]">Event:</strong>{" "}
                            {item.fragnet_id}
                            {item.fragnet_name ? ` — ${item.fragnet_name}` : ""}
                          </div>
                        )}
                        {item.before_finish && (
                          <div>
                            <strong className="text-[var(--cx-text-soft)]">Before:</strong>{" "}
                            {fmt(item.before_finish)}
                          </div>
                        )}
                        {item.after_finish && (
                          <div>
                            <strong className="text-[var(--cx-text-soft)]">After:</strong>{" "}
                            {fmt(item.after_finish)}
                          </div>
                        )}
                        {item.impact_days != null && (
                          <div>
                            <strong className="text-[var(--cx-text-soft)]">Impact:</strong>{" "}
                            {fmtNum(item.impact_days, 2)} calendar days
                          </div>
                        )}
                        <div className="truncate">
                          <strong className="text-[var(--cx-text-soft)]">ID:</strong>{" "}
                          {item.analysis_id}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => void openStoredAnalysis(item.analysis_id)}
                          disabled={!!busy}
                          className="rounded-md border border-sky-400/30 bg-sky-400/[0.08] px-3 py-2 text-[10px] font-black uppercase tracking-[0.10em] text-sky-300 disabled:opacity-40"
                        >
                          Open Analysis
                        </button>
                        <Link
                          href={`/claims?project=${encodeURIComponent(
                            projectId
                          )}&analysis_id=${encodeURIComponent(
                            item.analysis_id
                          )}&mode=ENGINE2_LINKED`}
                          className="rounded-md border border-[#D8A84E]/35 bg-[#D8A84E]/10 px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.10em] text-[#D8A84E]"
                        >
                          Use in Drafting
                        </Link>
                        <button
                          type="button"
                          onClick={() => void deleteStoredAnalysis(item.analysis_id)}
                          disabled={!!busy}
                          className="sm:col-span-2 rounded-md border border-red-400/25 bg-red-400/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-[0.10em] text-red-300 disabled:opacity-40"
                        >
                          Delete Analysis
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-white/[0.08] px-4 py-5 text-xs text-[var(--cx-muted)]">
                  No saved Delay Analysis is available for this project yet.
                </div>
              )}
            </div>
          )}
        </section>

        <div className="space-y-5">

          <aside id="workflow-panel" className="scroll-mt-5 rounded-md border border-white/[0.07] bg-[var(--cx-card)]">

            <div className="border-b border-white/[0.06] p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#D8A84E]">
                    Analysis Workflow
                  </div>
                  <div className="mt-1 text-xs text-[var(--cx-muted)]">
                    Programme → Method → Inputs → Calculate → Review
                  </div>
                </div>

              </div>
              <div className="space-y-4">
                {workflowRows.map((row) => (
                  <div key={row.title}>
                    <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--cx-muted)]">
                      {row.title}
                    </div>
                    <div
                      className={cx(
                        "grid gap-2",
                        row.items.length === 2
                          ? "grid-cols-1 sm:grid-cols-2"
                          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"
                      )}
                    >
                      {row.items.map(([id, label, eyebrow]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setTab(id);
                            setError("");
                          }}
                          className={cx(
                            "rounded-md border px-3 py-3 text-left transition",
                            tab === id
                              ? "border-[#D8A84E]/35 bg-[#D8A84E]/10 shadow-sm"
                              : "border-white/[0.07] bg-white/[0.015] hover:bg-white/[0.04]"
                          )}
                        >
                          <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#D8A84E]">
                            {eyebrow}
                          </div>
                          <div className="mt-1 text-xs font-semibold text-[var(--cx-text-soft)]">
                            {label}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
</div>
            </div>

            <div className="p-5">

            {tab === "programmes" && (

                <div className="space-y-4">

                  <div>

                    <div className="text-sm font-semibold text-[var(--cx-text)]">

                      Programme Register

                    </div>

                    <div className="mt-1 text-xs leading-5 text-[var(--cx-muted)]">

                      Review revisions, identify the current programme and maintain baseline references. Use the top-row Upload Programme action for new revisions.

                    </div>

                  </div>
<Toggle

                    value={includeArchived}

                    onChange={setIncludeArchived}

                    label="Include Archived Programmes"

                  />

                  <button

                    type="button"

                    onClick={() => void loadProgrammes()}

                    disabled={!!programmeBusy}

                    className="w-full rounded-md border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)] disabled:opacity-50"

                  >

                    Refresh Register

                  </button>
<div className="rounded-md border border-sky-400/15 bg-sky-400/[0.04] p-3 text-[11px] leading-5 text-[var(--cx-muted)]">

                    The register stores programme metadata and forensic fingerprints. Each revision remains separately auditable.

                  </div>

                </div>

              )}

              {tab === "schedule" && (

                <div className="space-y-4">

                  <div>

                    <div className="text-sm font-semibold text-[var(--cx-text)]">

                      Upload & Calculate CPM

                    </div>

                    <div className="mt-1 text-xs leading-5 text-[var(--cx-muted)]">

                      Parse XER, validate the network and persist the schedule.

                    </div>

                  </div>

                  <div
                    className={cx(
                      "rounded-md border px-3 py-2.5 text-[11px] leading-5",
                      programmeCapacityCount >= MAX_PROGRAMMES_PER_PROJECT
                        ? "border-amber-500/30 bg-amber-500/10 text-[var(--cx-text)]"
                        : "border-sky-400/15 bg-sky-400/[0.04] text-[var(--cx-muted)]"
                    )}
                  >
                    <strong>
                      Programme capacity: {programmeCapacityCount}/{MAX_PROGRAMMES_PER_PROJECT}
                    </strong>
                    {programmeCapacityCount >= MAX_PROGRAMMES_PER_PROJECT
                      ? " — Full. Delete a programme from Programme Register before adding another XER."
                      : ` — ${MAX_PROGRAMMES_PER_PROJECT - programmeCapacityCount} slot${MAX_PROGRAMMES_PER_PROJECT - programmeCapacityCount === 1 ? "" : "s"} available.`}
                  </div>

                  <FileBox

                    label="Schedule XER"

                    hint={
                      programmeCapacityCount >= MAX_PROGRAMMES_PER_PROJECT
                        ? "Programme capacity full — delete one programme from Programme Register first."
                        : "Primavera P6 .xer"
                    }

                    file={scheduleFile}

                    onChange={setScheduleFile}
                    disabled={programmeCapacityCount >= MAX_PROGRAMMES_PER_PROJECT}

                  />

                  <label className="block">

                    <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cx-muted)]">

                      Schedule Type

                    </span>

                    <select

                      value={scheduleType}

                      onChange={(e) => setScheduleType(e.target.value)}

                      className="mt-2 w-full rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-3 py-3 text-xs text-[var(--cx-text-soft)]"

                    >

                      <option value="baseline">Baseline</option>

                      <option value="update">Update</option>

                      <option value="as_built">As-Built</option>

                      <option value="recovery">Recovery</option>

                      <option value="impacted">Impacted</option>

                    </select>

                  </label>

                  <button

                    onClick={uploadSchedule}

                    disabled={
                      !!busy ||
                      programmeCapacityCount >= MAX_PROGRAMMES_PER_PROJECT
                    }

                    className="w-full rounded-md bg-[#D8A84E] px-4 py-3 text-xs font-black uppercase tracking-[0.13em] text-[#050608] disabled:cursor-not-allowed disabled:opacity-50"

                  >

                    {programmeCapacityCount >= MAX_PROGRAMMES_PER_PROJECT
                      ? "Programme Limit Reached — Delete One First"
                      : "Parse + Calculate CPM"}

                  </button>

                </div>

              )}

              {tab === "apab" && (

                <div className="space-y-5">

                  <div>
                    <div className="text-sm font-semibold text-[var(--cx-text)]">
                      As-Planned vs As-Built
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[var(--cx-muted)]">
                      Registered programme revisions are the preferred comparison source.
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                    <div className="text-[10px] text-[var(--cx-muted)]">
                      {apabSourceMode === "registered"
                        ? "Using registered programmes"
                        : "Using uploaded XER files"}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setApabSourceMode((current) =>
                          current === "registered" ? "upload" : "registered"
                        )
                      }
                      className="text-[10px] font-semibold text-sky-300 hover:underline"
                    >
                      {apabSourceMode === "registered"
                        ? "Upload XER files instead"
                        : "Use registered programmes"}
                    </button>
                  </div>

                  {apabSourceMode === "registered" ? (
                    <>
                      <label className="block">
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                          As-Planned / Baseline Programme
                        </span>
                        <select
                          value={apabBaselineId}
                          onChange={(e) => setApabBaselineId(e.target.value)}
                          className="mt-2 w-full rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-3 py-3 text-xs text-[var(--cx-text-soft)]"
                        >
                          <option value="">Select programme revision</option>
                          {programmes
                            .filter((p) => p.programme_status !== "ARCHIVED")
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {(p.programme_title || p.file_name)} · {p.revision_label || `Rev ${p.revision_number ?? "—"}`}
                              </option>
                            ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                          As-Built / Later Programme
                        </span>
                        <select
                          value={apabAsBuiltId}
                          onChange={(e) => setApabAsBuiltId(e.target.value)}
                          className="mt-2 w-full rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-3 py-3 text-xs text-[var(--cx-text-soft)]"
                        >
                          <option value="">Select programme revision</option>
                          {programmes
                            .filter((p) => p.programme_status !== "ARCHIVED")
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {(p.programme_title || p.file_name)} · {p.revision_label || `Rev ${p.revision_number ?? "—"}`}
                              </option>
                            ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                          Baseline XER
                        </span>
                        <input
                          type="file"
                          accept=".xer"
                          onChange={(e) => setBaselineFile(e.target.files?.[0] || null)}
                          className="mt-2 block w-full rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-3 py-3 text-xs text-[var(--cx-muted)]"
                        />
                      </label>

                      <label className="block">
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                          As-Built XER
                        </span>
                        <input
                          type="file"
                          accept=".xer"
                          onChange={(e) => setAsBuiltFile(e.target.files?.[0] || null)}
                          className="mt-2 block w-full rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-3 py-3 text-xs text-[var(--cx-muted)]"
                        />
                      </label>
                    </div>
                  )}

                  <button
                    onClick={runApAb}
                    disabled={
                      !!busy ||
                      (apabSourceMode === "registered"
                        ? !apabBaselineId || !apabAsBuiltId
                        : !baselineFile || !asBuiltFile)
                    }
                    className="w-full rounded-md bg-[#D8A84E] px-4 py-3 text-xs font-black uppercase tracking-[0.13em] text-[#050608] disabled:opacity-50"
                  >
                    Run AP vs AB
                  </button>

                </div>

              )}

              {tab === "windows" && (

                <div className="space-y-5">

                  <div>
                    <div className="text-sm font-semibold text-[var(--cx-text)]">
                      Window Analysis
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[var(--cx-muted)]">
                      Select registered programme revisions for the time-slice comparison, or upload XER files as a secondary option.
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                    <div className="text-[10px] text-[var(--cx-muted)]">
                      {windowSourceMode === "registered"
                        ? "Using registered programmes"
                        : "Using uploaded XER files"}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setWindowSourceMode((current) =>
                          current === "registered" ? "upload" : "registered"
                        )
                      }
                      className="text-[10px] font-semibold text-sky-300 hover:underline"
                    >
                      {windowSourceMode === "registered"
                        ? "Upload XER files instead"
                        : "Use registered programmes"}
                    </button>
                  </div>

                  {windowSourceMode === "registered" ? (
                    <>
                      <label className="block">
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                          Window A · Earlier Programme
                        </span>
                        <select
                          value={windowAId}
                          onChange={(e) => setWindowAId(e.target.value)}
                          className="mt-2 w-full rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-3 py-3 text-xs text-[var(--cx-text-soft)]"
                        >
                          <option value="">Select earlier revision</option>
                          {programmes
                            .filter((p) => p.programme_status !== "ARCHIVED")
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {(p.programme_title || p.file_name)} · {p.revision_label || `Rev ${p.revision_number ?? "—"}`}
                              </option>
                            ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                          Window B · Later Programme
                        </span>
                        <select
                          value={windowBId}
                          onChange={(e) => setWindowBId(e.target.value)}
                          className="mt-2 w-full rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-3 py-3 text-xs text-[var(--cx-text-soft)]"
                        >
                          <option value="">Select later revision</option>
                          {programmes
                            .filter((p) => p.programme_status !== "ARCHIVED")
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {(p.programme_title || p.file_name)} · {p.revision_label || `Rev ${p.revision_number ?? "—"}`}
                              </option>
                            ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                          Window A XER
                        </span>
                        <input
                          type="file"
                          accept=".xer"
                          onChange={(e) => setWindowAFile(e.target.files?.[0] || null)}
                          className="mt-2 block w-full rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-3 py-3 text-xs text-[var(--cx-muted)]"
                        />
                      </label>

                      <label className="block">
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                          Window B XER
                        </span>
                        <input
                          type="file"
                          accept=".xer"
                          onChange={(e) => setWindowBFile(e.target.files?.[0] || null)}
                          className="mt-2 block w-full rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-3 py-3 text-xs text-[var(--cx-muted)]"
                        />
                      </label>
                    </div>
                  )}

                  <button
                    onClick={runWindows}
                    disabled={
                      !!busy ||
                      (windowSourceMode === "registered"
                        ? !windowAId || !windowBId
                        : !windowAFile || !windowBFile)
                    }
                    className="w-full rounded-md bg-[#D8A84E] px-4 py-3 text-xs font-black uppercase tracking-[0.13em] text-[#050608] disabled:opacity-50"
                  >
                    Run Window Analysis
                  </button>

                </div>

              )}

              {tab === "tia" && (
                <div className="space-y-5">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D8A84E]">
                      Time Impact Analysis
                    </div>
                    <div className="mt-1 text-lg font-semibold text-[var(--cx-text)]">
                      Insert Delay Fragnet
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[var(--cx-muted)]">
                      Define the delay event, select one or more predecessor and successor activities with full schedule context, then recalculate the CPM network.
                    </div>
                  </div>

                  <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card-2)] p-4">
                    <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                      1 · Source Programme
                    </div>

                    <select
                      value={scheduleId}
                      onChange={(e) => setScheduleId(e.target.value)}
                      className="mt-2 h-12 w-full rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs font-semibold text-[var(--cx-text)]"
                    >
                      <option value="">Select registered programme</option>
                      {programmes
                        .filter((programme) => programme.programme_status !== "ARCHIVED")
                        .map((programme) => (
                          <option key={programme.id} value={programme.id}>
                            {programme.programme_title || programme.file_name}
                            {programme.revision_label ? ` · ${programme.revision_label}` : ""}
                            {programme.is_current ? " · CURRENT" : ""}
                          </option>
                        ))}
                    </select>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-[var(--cx-muted)]">
                      <span>
                        Activities:{" "}
                        <strong className="text-[var(--cx-text-soft)]">
                          {programmeActivities.length || "—"}
                        </strong>
                      </span>
                      <span>
                        Data Date:{" "}
                        <strong className="text-[var(--cx-text-soft)]">
                          {fmt(
                            programmes.find((programme) => programme.id === scheduleId)
                              ?.data_date || undefined
                          )}
                        </strong>
                      </span>
                      <span>
                        File:{" "}
                        <strong className="text-[var(--cx-text-soft)]">
                          {programmes.find((programme) => programme.id === scheduleId)
                            ?.file_name || "—"}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card-2)] p-4">
                    <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                      2 · Delay Fragnet
                    </div>

                    <div className="mt-3 grid gap-3 xl:grid-cols-[0.8fr_1.7fr]">
                      <label>
                        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                          Delay Fragnet ID
                        </span>
                        <input
                          value={fragnetId}
                          onChange={(e) => setFragnetId(e.target.value)}
                          className="mt-1.5 h-11 w-full rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs font-semibold text-[var(--cx-text)]"
                        />
                      </label>

                      <label>
                        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                          Delay Fragnet Name
                        </span>
                        <input
                          value={fragnetName}
                          onChange={(e) => setFragnetName(e.target.value)}
                          className="mt-1.5 h-11 w-full rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs text-[var(--cx-text)]"
                        />
                      </label>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label>
                        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                          Impact Start Date
                        </span>
                        <input
                          type="date"
                          value={tiaImpactStartDate}
                          onChange={(e) => {
                            const start = e.target.value;
                            setTiaImpactStartDate(start);
                            const elapsed = inclusiveCalendarDays(
                              start,
                              tiaForecastEndDate
                            );
                            setDurationDays(elapsed ? String(elapsed) : "");
                          }}
                          className="mt-1.5 h-11 w-full rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs font-semibold text-[var(--cx-text)]"
                        />
                      </label>

                      <label>
                        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                          Forecast End Date
                        </span>
                        <input
                          type="date"
                          value={tiaForecastEndDate}
                          min={tiaImpactStartDate || undefined}
                          onChange={(e) => {
                            const finish = e.target.value;
                            setTiaForecastEndDate(finish);
                            const elapsed = inclusiveCalendarDays(
                              tiaImpactStartDate,
                              finish
                            );
                            setDurationDays(elapsed ? String(elapsed) : "");
                          }}
                          className="mt-1.5 h-11 w-full rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs font-semibold text-[var(--cx-text)]"
                        />
                      </label>

                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                          Elapsed Impact
                        </span>
                        <div className="mt-1.5 flex h-11 items-center rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs font-semibold text-[var(--cx-text)]">
                          {inclusiveCalendarDays(
                            tiaImpactStartDate,
                            tiaForecastEndDate
                          ) ?? "—"}{" "}
                          {inclusiveCalendarDays(
                            tiaImpactStartDate,
                            tiaForecastEndDate
                          ) === 1
                            ? "calendar day"
                            : "calendar days"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-[4px] border border-sky-400/15 bg-sky-400/[0.04] px-3 py-2.5 text-[10px] leading-5 text-[var(--cx-muted)]">
                      Start and Forecast End are inclusive calendar dates. The programme calendar is applied internally during CPM recalculation and impacted XER generation.
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                          3 · Fragnet Insertion
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--cx-muted)]">
                          Activity selection shows ID, Name, Original Duration, Start, Finish and Total Float. An activity cannot be both predecessor and successor within the same fragnet. ContractX also validates the full programme network and blocks any insertion that creates a CPM logic loop.
                        </div>
                      </div>
                      <div className="text-right text-[10px] font-semibold text-[var(--cx-text-soft)]">
                        <div>
                          {activitiesBusy
                            ? "Loading programme activities..."
                            : activitiesError || `${programmeActivities.length} activities available`}
                        </div>
                        {!activitiesBusy && selectorIntegrity && (
                          <div
                            className={
                              selectorIntegrity.complete
                                ? "mt-1 text-emerald-300"
                                : "mt-1 text-red-300"
                            }
                          >
                            {selectorIntegrity.complete
                              ? `Selector verified: ${selectorIntegrity.mergedCount}/${selectorIntegrity.endpointCount} activities`
                              : `Selector mismatch: UI ${selectorIntegrity.mergedCount} · endpoint ${selectorIntegrity.endpointCount}${
                                  selectorIntegrity.programmeRegisterCount == null
                                    ? ""
                                    : ` · register ${selectorIntegrity.programmeRegisterCount}`
                                }`}
                          </div>
                        )}
                      </div>
                    </div>

                    {selectorIntegrity && (
                      <div
                        className={
                          selectorIntegrity.complete
                            ? "mb-4 rounded-[4px] border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-2 text-[10px] text-[var(--cx-muted)]"
                            : "mb-4 rounded-[4px] border border-red-400/25 bg-red-400/[0.05] px-3 py-2 text-[10px] text-red-200"
                        }
                      >
                        <strong className="text-[var(--cx-text-soft)]">
                          TIA selector integrity:
                        </strong>{" "}
                        {selectorIntegrity.complete
                          ? `All ${selectorIntegrity.mergedCount} programme activities returned by Delay Analysis are available to the TIA selectors before predecessor/successor exclusions.`
                          : "Activity population mismatch detected. Do not proceed with forensic validation until the selector count is reconciled."}
                        <span className="ml-2">
                          Missing display values after viewer fallback — Start: {selectorIntegrity.missingStart}, Finish: {selectorIntegrity.missingFinish}, Total Float: {selectorIntegrity.missingFloat}.
                        </span>
                      </div>
                    )}

                    <div className="grid gap-4">
                      <ActivityRelationshipSelector
                        title="Predecessors"
                        activities={programmeActivities}
                        links={tiaPredecessors}
                        excludedActivityIds={tiaSuccessors.map(
                          (link) => link.activity_id_pk
                        )}
                        disabled={activitiesBusy || !programmeActivities.length}
                        onAdd={(activityIdPk) =>
                          setTiaPredecessors((rows) => [
                            ...rows,
                            {
                              rowId: `pred-${Date.now()}-${activityIdPk}`,
                              activity_id_pk: activityIdPk,
                              relationship_type: "FS",
                              lag_hours: "0",
                            },
                          ])
                        }
                        onRemove={(rowId) =>
                          setTiaPredecessors((rows) =>
                            rows.filter((row) => row.rowId !== rowId)
                          )
                        }
                        onUpdate={(rowId, patch) =>
                          setTiaPredecessors((rows) =>
                            rows.map((row) =>
                              row.rowId === rowId ? { ...row, ...patch } : row
                            )
                          )
                        }
                      />

                      <ActivityRelationshipSelector
                        title="Successors"
                        activities={programmeActivities}
                        links={tiaSuccessors}
                        excludedActivityIds={tiaPredecessors.map(
                          (link) => link.activity_id_pk
                        )}
                        disabled={activitiesBusy || !programmeActivities.length}
                        onAdd={(activityIdPk) =>
                          setTiaSuccessors((rows) => [
                            ...rows,
                            {
                              rowId: `succ-${Date.now()}-${activityIdPk}`,
                              activity_id_pk: activityIdPk,
                              relationship_type: "FS",
                              lag_hours: "0",
                            },
                          ])
                        }
                        onRemove={(rowId) =>
                          setTiaSuccessors((rows) =>
                            rows.filter((row) => row.rowId !== rowId)
                          )
                        }
                        onUpdate={(rowId, patch) =>
                          setTiaSuccessors((rows) =>
                            rows.map((row) =>
                              row.rowId === rowId ? { ...row, ...patch } : row
                            )
                          )
                        }
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAdvanced((value) => !value)}
                    className="w-full rounded-[4px] border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-left text-xs font-bold text-[var(--cx-muted)]"
                  >
                    {advanced ? "−" : "+"} Advanced CPM Settings
                  </button>

                  {advanced && (
                    <div className="space-y-3 rounded-md border border-white/[0.07] bg-[var(--cx-card-2)] p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={options.progress_mode}
                          onChange={(e) =>
                            setOptions((p) => ({ ...p, progress_mode: e.target.value }))
                          }
                          className="h-10 rounded-[4px] border border-white/[0.08] bg-[var(--cx-card)] px-2 text-[11px]"
                        >
                          <option value="retained_logic">Retained Logic</option>
                          <option value="progress_override">Progress Override</option>
                          <option value="actual_dates">Actual Dates</option>
                        </select>

                        <select
                          value={options.float_mode}
                          onChange={(e) =>
                            setOptions((p) => ({ ...p, float_mode: e.target.value }))
                          }
                          className="h-10 rounded-[4px] border border-white/[0.08] bg-[var(--cx-card)] px-2 text-[11px]"
                        >
                          <option value="start_float">Start Float</option>
                          <option value="finish_float">Finish Float</option>
                          <option value="smallest">Smallest</option>
                        </select>

                        <select
                          value={options.critical_mode}
                          onChange={(e) =>
                            setOptions((p) => ({ ...p, critical_mode: e.target.value }))
                          }
                          className="h-10 rounded-[4px] border border-white/[0.08] bg-[var(--cx-card)] px-2 text-[11px]"
                        >
                          <option value="longest_path">Longest Path</option>
                          <option value="total_float">Total Float</option>
                        </select>

                        <select
                          value={options.lag_calendar_mode}
                          onChange={(e) =>
                            setOptions((p) => ({ ...p, lag_calendar_mode: e.target.value }))
                          }
                          className="h-10 rounded-[4px] border border-white/[0.08] bg-[var(--cx-card)] px-2 text-[11px]"
                        >
                          <option value="predecessor">Lag Calendar · Predecessor</option>
                          <option value="successor">Lag Calendar · Successor</option>
                          <option value="project_default">Lag Calendar · Project Default</option>
                          <option value="24_hour">Lag Calendar · 24 Hour</option>
                        </select>
                      </div>

                      <Toggle
                        value={options.use_expected_finish_dates}
                        onChange={(v) =>
                          setOptions((p) => ({ ...p, use_expected_finish_dates: v }))
                        }
                        label="Use Expected Finish Dates"
                      />
                      <Toggle
                        value={options.make_open_ended_critical}
                        onChange={(v) =>
                          setOptions((p) => ({ ...p, make_open_ended_critical: v }))
                        }
                        label="Make Open-Ended Activities Critical"
                      />
                      <Toggle
                        value={options.calculate_multiple_float_paths}
                        onChange={(v) =>
                          setOptions((p) => ({ ...p, calculate_multiple_float_paths: v }))
                        }
                        label="Calculate Multiple Float Paths"
                      />
                      <Toggle
                        value={options.level_resources}
                        onChange={(v) =>
                          setOptions((p) => ({ ...p, level_resources: v }))
                        }
                        label="Resource Leveling Heuristic"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void runTia()}
                    disabled={
                      !!busy ||
                      !scheduleId ||
                      !fragnetId.trim() ||
                      !fragnetName.trim() ||
                      !tiaImpactStartDate ||
                      !tiaForecastEndDate ||
                      !inclusiveCalendarDays(
                        tiaImpactStartDate,
                        tiaForecastEndDate
                      ) ||
                      !tiaPredecessors.length ||
                      !tiaSuccessors.length
                    }
                    className="w-full rounded-[4px] border-2 border-[#9A6A16] bg-[#D8A84E] px-4 py-3.5 text-xs font-black uppercase tracking-[0.13em] text-[#050608] shadow-[0_2px_8px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Run Time Impact Analysis
                  </button>
                </div>
              )}

              {tab === "tia_multi" && (
                <div className="space-y-5">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D8A84E]">
                      Multi-Event Time Impact Analysis
                    </div>
                    <div className="mt-1 text-lg font-semibold text-[var(--cx-text)]">
                      Delay Events
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[var(--cx-muted)]">
                      Configure events one at a time, then run one deterministic CPM recalculation.
                    </div>
                  </div>

                  <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card-2)] p-4">
                    <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--cx-muted)]">
                      Source Programme
                    </div>
                    <select
                      value={scheduleId}
                      onChange={(e) => setScheduleId(e.target.value)}
                      className="mt-2 h-12 w-full rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs font-semibold text-[var(--cx-text)]"
                    >
                      <option value="">Select registered programme</option>
                      {programmes
                        .filter((programme) => programme.programme_status !== "ARCHIVED")
                        .map((programme) => (
                          <option key={programme.id} value={programme.id}>
                            {programme.programme_title || programme.file_name}
                            {programme.revision_label ? ` · ${programme.revision_label}` : ""}
                            {programme.is_current ? " · CURRENT" : ""}
                          </option>
                        ))}
                    </select>
                    <div className="mt-2 text-[10px] text-[var(--cx-muted)]">
                      {programmeActivities.length.toLocaleString()} activities available for relationship selection.
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card-2)] p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#D8A84E]">
                            Delay Events
                          </div>
                          <div className="mt-1 text-[10px] text-[var(--cx-muted)]">
                            {multiDelayEvents.length} event{multiDelayEvents.length === 1 ? "" : "s"} ·{" "}
                            {readyMultiDelayEvents} ready
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {multiDelayEvents.map((event, eventIndex) => {
                          const ready = isMultiDelayEventReady(event);
                          const elapsed = inclusiveCalendarDays(
                            event.impact_start_date,
                            event.forecast_end_date
                          );

                          return (
                            <button
                              key={event.rowId}
                              type="button"
                              onClick={() => setSelectedMultiEventRowId(event.rowId)}
                              className={cx(
                                "w-full rounded-[4px] border px-3 py-3 text-left transition",
                                selectedMultiDelayEvent?.rowId === event.rowId
                                  ? "border-[#D8A84E]/45 bg-[#D8A84E]/[0.08]"
                                  : "border-white/[0.07] bg-[var(--cx-card)] hover:border-white/[0.13]"
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[#D8A84E]">
                                    {String(eventIndex + 1).padStart(2, "0")} · {event.fragnet_id || "Unassigned"}
                                  </div>
                                  <div className="mt-1 truncate text-[11px] font-semibold text-[var(--cx-text)]">
                                    {event.fragnet_name || "Unnamed Delay Event"}
                                  </div>
                                </div>
                                <span
                                  className={cx(
                                    "shrink-0 rounded-[3px] border px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em]",
                                    ready
                                      ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300"
                                      : "border-amber-400/25 bg-amber-400/[0.07] text-amber-300"
                                  )}
                                >
                                  {ready ? "Ready" : "Needs Input"}
                                </span>
                              </div>

                              <div className="mt-2 text-[9px] leading-4 text-[var(--cx-muted)]">
                                {event.impact_start_date || "Start —"} →{" "}
                                {event.forecast_end_date || "Finish —"}
                                {elapsed ? ` · ${elapsed}d` : ""}
                                {" · "}
                                {event.predecessors.length} Pred · {event.successors.length} Succ
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const rowId = `event-${Date.now()}`;
                          setMultiDelayEvents((events) => [
                            ...events,
                            {
                              rowId,
                              fragnet_id: `DELAY-${String(events.length + 1).padStart(3, "0")}`,
                              fragnet_name: `Delay Event ${events.length + 1}`,
                              duration_days: "",
                              impact_start_date: "",
                              forecast_end_date: "",
                              calendar_id: "",
                              predecessors: [],
                              successors: [],
                            },
                          ]);
                          setSelectedMultiEventRowId(rowId);
                        }}
                        className="mt-3 w-full rounded-[4px] border border-dashed border-[#D8A84E]/35 bg-[#D8A84E]/[0.035] px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.10em] text-[#D8A84E] hover:bg-[#D8A84E]/[0.07]"
                      >
                        + Add Delay Event
                      </button>
                    </div>

                    {selectedMultiDelayEvent && (
                      <div className="rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] p-4">
                        <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[#D8A84E]">
                              Event {String(selectedMultiDelayEventIndex + 1).padStart(2, "0")}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-[var(--cx-text)]">
                              {selectedMultiDelayEvent.fragnet_id} ·{" "}
                              {selectedMultiDelayEvent.fragnet_name || "Unnamed Delay Event"}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const rowId = `event-${Date.now()}`;
                                setMultiDelayEvents((events) => [
                                  ...events,
                                  {
                                    ...selectedMultiDelayEvent,
                                    rowId,
                                    fragnet_id: `DELAY-${String(events.length + 1).padStart(3, "0")}`,
                                    fragnet_name: `${selectedMultiDelayEvent.fragnet_name || "Delay Event"} Copy`,
                                    predecessors: selectedMultiDelayEvent.predecessors.map((link, index) => ({
                                      ...link,
                                      rowId: `dup-p-${Date.now()}-${index}`,
                                    })),
                                    successors: selectedMultiDelayEvent.successors.map((link, index) => ({
                                      ...link,
                                      rowId: `dup-s-${Date.now()}-${index}`,
                                    })),
                                  },
                                ]);
                                setSelectedMultiEventRowId(rowId);
                              }}
                              className="rounded-[4px] border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-[var(--cx-muted)] hover:text-[var(--cx-text)]"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              disabled={multiDelayEvents.length === 1}
                              onClick={() => {
                                const remaining = multiDelayEvents.filter(
                                  (event) => event.rowId !== selectedMultiDelayEvent.rowId
                                );
                                setMultiDelayEvents(remaining);
                                setSelectedMultiEventRowId(remaining[0]?.rowId || "");
                              }}
                              className="rounded-[4px] border border-red-400/25 bg-red-400/[0.05] px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 xl:grid-cols-[0.8fr_1.7fr]">
                          <label>
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                              Fragnet ID
                            </span>
                            <input
                              value={selectedMultiDelayEvent.fragnet_id}
                              onChange={(e) =>
                                setMultiDelayEvents((events) =>
                                  events.map((item) =>
                                    item.rowId === selectedMultiDelayEvent.rowId
                                      ? { ...item, fragnet_id: e.target.value }
                                      : item
                                  )
                                )
                              }
                              className="mt-1.5 h-11 w-full rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs font-semibold text-[var(--cx-text)]"
                            />
                          </label>

                          <label>
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                              Event Name
                            </span>
                            <input
                              value={selectedMultiDelayEvent.fragnet_name}
                              onChange={(e) =>
                                setMultiDelayEvents((events) =>
                                  events.map((item) =>
                                    item.rowId === selectedMultiDelayEvent.rowId
                                      ? { ...item, fragnet_name: e.target.value }
                                      : item
                                  )
                                )
                              }
                              className="mt-1.5 h-11 w-full rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs text-[var(--cx-text)]"
                            />
                          </label>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <label>
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                              Impact Start
                            </span>
                            <input
                              type="date"
                              value={selectedMultiDelayEvent.impact_start_date}
                              onChange={(e) =>
                                setMultiDelayEvents((events) =>
                                  events.map((item) => {
                                    if (item.rowId !== selectedMultiDelayEvent.rowId) return item;
                                    const start = e.target.value;
                                    const elapsed = inclusiveCalendarDays(
                                      start,
                                      item.forecast_end_date
                                    );
                                    return {
                                      ...item,
                                      impact_start_date: start,
                                      duration_days: elapsed ? String(elapsed) : "",
                                    };
                                  })
                                )
                              }
                              className="mt-1.5 h-11 w-full rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs font-semibold text-[var(--cx-text)]"
                            />
                          </label>

                          <label>
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                              Forecast End
                            </span>
                            <input
                              type="date"
                              value={selectedMultiDelayEvent.forecast_end_date}
                              min={selectedMultiDelayEvent.impact_start_date || undefined}
                              onChange={(e) =>
                                setMultiDelayEvents((events) =>
                                  events.map((item) => {
                                    if (item.rowId !== selectedMultiDelayEvent.rowId) return item;
                                    const finish = e.target.value;
                                    const elapsed = inclusiveCalendarDays(
                                      item.impact_start_date,
                                      finish
                                    );
                                    return {
                                      ...item,
                                      forecast_end_date: finish,
                                      duration_days: elapsed ? String(elapsed) : "",
                                    };
                                  })
                                )
                              }
                              className="mt-1.5 h-11 w-full rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs font-semibold text-[var(--cx-text)]"
                            />
                          </label>

                          <div>
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                              Elapsed
                            </span>
                            <div className="mt-1.5 flex h-11 items-center rounded-[4px] border border-white/[0.09] bg-[var(--cx-card)] px-3 text-xs font-semibold text-[var(--cx-text)]">
                              {inclusiveCalendarDays(
                                selectedMultiDelayEvent.impact_start_date,
                                selectedMultiDelayEvent.forecast_end_date
                              ) ?? "—"}{" "}
                              days
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 text-[9px] leading-4 text-[var(--cx-muted)]">
                          Dates are inclusive. CPM calendar is inherited from the selected P6 programme.
                        </div>

                        <div className="mt-4 grid gap-4">
                          <ActivityRelationshipSelector
                            title="Predecessors"
                            activities={programmeActivities}
                            links={selectedMultiDelayEvent.predecessors}
                            excludedActivityIds={selectedMultiDelayEvent.successors.map(
                              (link) => link.activity_id_pk
                            )}
                            disabled={activitiesBusy || !programmeActivities.length}
                            onAdd={(activityIdPk) =>
                              setMultiDelayEvents((events) =>
                                events.map((item) =>
                                  item.rowId === selectedMultiDelayEvent.rowId
                                    ? {
                                        ...item,
                                        predecessors: [
                                          ...item.predecessors,
                                          {
                                            rowId: `mp-${Date.now()}-${activityIdPk}`,
                                            activity_id_pk: activityIdPk,
                                            relationship_type: "FS",
                                            lag_hours: "0",
                                          },
                                        ],
                                      }
                                    : item
                                )
                              )
                            }
                            onRemove={(rowId) =>
                              setMultiDelayEvents((events) =>
                                events.map((item) =>
                                  item.rowId === selectedMultiDelayEvent.rowId
                                    ? {
                                        ...item,
                                        predecessors: item.predecessors.filter(
                                          (link) => link.rowId !== rowId
                                        ),
                                      }
                                    : item
                                )
                              )
                            }
                            onUpdate={(rowId, patch) =>
                              setMultiDelayEvents((events) =>
                                events.map((item) =>
                                  item.rowId === selectedMultiDelayEvent.rowId
                                    ? {
                                        ...item,
                                        predecessors: item.predecessors.map((link) =>
                                          link.rowId === rowId
                                            ? { ...link, ...patch }
                                            : link
                                        ),
                                      }
                                    : item
                                )
                              )
                            }
                          />

                          <ActivityRelationshipSelector
                            title="Successors"
                            activities={programmeActivities}
                            links={selectedMultiDelayEvent.successors}
                            excludedActivityIds={selectedMultiDelayEvent.predecessors.map(
                              (link) => link.activity_id_pk
                            )}
                            disabled={activitiesBusy || !programmeActivities.length}
                            onAdd={(activityIdPk) =>
                              setMultiDelayEvents((events) =>
                                events.map((item) =>
                                  item.rowId === selectedMultiDelayEvent.rowId
                                    ? {
                                        ...item,
                                        successors: [
                                          ...item.successors,
                                          {
                                            rowId: `ms-${Date.now()}-${activityIdPk}`,
                                            activity_id_pk: activityIdPk,
                                            relationship_type: "FS",
                                            lag_hours: "0",
                                          },
                                        ],
                                      }
                                    : item
                                )
                              )
                            }
                            onRemove={(rowId) =>
                              setMultiDelayEvents((events) =>
                                events.map((item) =>
                                  item.rowId === selectedMultiDelayEvent.rowId
                                    ? {
                                        ...item,
                                        successors: item.successors.filter(
                                          (link) => link.rowId !== rowId
                                        ),
                                      }
                                    : item
                                )
                              )
                            }
                            onUpdate={(rowId, patch) =>
                              setMultiDelayEvents((events) =>
                                events.map((item) =>
                                  item.rowId === selectedMultiDelayEvent.rowId
                                    ? {
                                        ...item,
                                        successors: item.successors.map((link) =>
                                          link.rowId === rowId
                                            ? { ...link, ...patch }
                                            : link
                                        ),
                                      }
                                    : item
                                )
                              )
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 rounded-md border border-white/[0.07] bg-[var(--cx-card-2)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--cx-text)]">
                        {multiDelayEvents.length} event{multiDelayEvents.length === 1 ? "" : "s"} ·{" "}
                        {readyMultiDelayEvents} ready
                        {readyMultiDelayEvents !== multiDelayEvents.length
                          ? ` · ${multiDelayEvents.length - readyMultiDelayEvents} needs input`
                          : ""}
                      </div>
                      <div className="mt-1 text-[9px] leading-4 text-[var(--cx-muted)]">
                        CPM, float and time impact are calculated deterministically.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void runMultiFragnetTIA()}
                      disabled={
                        !!busy ||
                        !scheduleId ||
                        multiDelayEvents.some((event) => !isMultiDelayEventReady(event))
                      }
                      className="min-h-11 rounded-[4px] border-2 border-[#9A6A16] bg-[#D8A84E] px-5 py-3 text-[10px] font-black uppercase tracking-[0.11em] text-[#050608] shadow-[0_2px_8px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Run Time Impact Analysis
                    </button>
                  </div>
                </div>
              )}

            </div>

          </aside>

          <section className="space-y-5">
{tab === "programmes" && (

              <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card)]">

                <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#D8A84E]">
                      C2 · Programme Register
                    </div>
                    <div className="mt-1 text-lg font-semibold text-[var(--cx-text)]">
                      Registered Programme Revisions
                    </div>
                    <div className="mt-1 text-xs text-[var(--cx-muted)]">
                      Keep up to six XER programme revisions per project. To add another programme after the limit is reached, permanently delete an existing programme from this register.
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div
                      className={cx(
                        "rounded-[4px] border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em]",
                        programmeCapacityCount >= MAX_PROGRAMMES_PER_PROJECT
                          ? "border-amber-600/50 bg-amber-500/10 text-amber-500"
                          : "border-white/[0.10] bg-white/[0.025] text-[var(--cx-text-soft)]"
                      )}
                    >
                      Programme Capacity {programmeCapacityCount}/{MAX_PROGRAMMES_PER_PROJECT}
                    </div>

                    <span className="text-[10px] text-[var(--cx-muted)]">
                      {selectedProgrammeIds.length} selected for comparison
                    </span>

                    <button
                      type="button"
                      onClick={useSelectedForApAb}
                      disabled={selectedProgrammeIds.length !== 2}
                      className="text-[10px] font-semibold text-[var(--cx-text-soft)] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Use for AP vs AB
                    </button>

                    <button
                      type="button"
                      onClick={useSelectedForWindows}
                      disabled={selectedProgrammeIds.length !== 2}
                      className="text-[10px] font-semibold text-[var(--cx-text-soft)] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Use for Window Analysis
                    </button>
                  </div>

                </div>

                <div
                  className={cx(
                    "mx-5 mt-4 rounded-md border px-4 py-3 text-[11px] leading-5",
                    programmeCapacityCount >= MAX_PROGRAMMES_PER_PROJECT
                      ? "border-amber-500/30 bg-amber-500/10 text-[var(--cx-text)]"
                      : "border-sky-400/15 bg-sky-400/[0.04] text-[var(--cx-muted)]"
                  )}
                >
                  <strong>
                    {programmeCapacityCount}/{MAX_PROGRAMMES_PER_PROJECT} programme slots used.
                  </strong>{" "}
                  {programmeCapacityCount >= MAX_PROGRAMMES_PER_PROJECT
                    ? "Project programme capacity is full. Delete an existing programme from Programme Register before uploading or importing another XER."
                    : `You can add ${MAX_PROGRAMMES_PER_PROJECT - programmeCapacityCount} more XER programme${MAX_PROGRAMMES_PER_PROJECT - programmeCapacityCount === 1 ? "" : "s"} to this project.`}
                </div>

                {programmes.length === 0 ? (

                  <div className="px-5 py-12 text-center">
                    <div className="text-sm font-semibold text-[var(--cx-text-soft)]">
                      No programmes registered for this project
                    </div>
                    <div className="mx-auto mt-2 max-w-lg text-xs leading-5 text-[var(--cx-muted)]">
                      Upload the first Primavera P6 XER from Upload / Parse / Calculate.
                    </div>
                  </div>

                ) : (

                  <div>

                    <div className="grid grid-cols-[36px_minmax(260px,2fr)_90px_95px_105px_110px_minmax(210px,1.25fr)] items-center gap-3 border-b border-white/[0.07] bg-[var(--cx-card-2)] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                      <div />
                      <div>Programme</div>
                      <div>Revision</div>
                      <div>Status</div>
                      <div>Data Date</div>
                      <div>Uploaded</div>
                      <div>Actions</div>
                    </div>

                    {programmes.map((programme) => {
                      const editing = programmeEditId === programme.id;
                      const selected = selectedProgrammeIds.includes(programme.id);

                      return (
                        <React.Fragment key={programme.id}>
                          <div
                            className={cx(
                              "grid grid-cols-[36px_minmax(260px,2fr)_90px_95px_105px_110px_minmax(210px,1.25fr)] items-center gap-3 border-b border-white/[0.055] px-4 py-3 last:border-b-0",
                              selected && "bg-[#D8A84E]/[0.045]"
                            )}
                          >
                            <div>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleProgrammeSelection(programme.id)}
                                aria-label={`Select ${programme.programme_title || programme.file_name}`}
                                className="h-4 w-4 accent-[#D8A84E]"
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-xs font-semibold text-[var(--cx-text)]">
                                  {programme.programme_title || programme.file_name}
                                </span>
                                {programme.is_current && (
                                  <span className="text-[9px] font-bold uppercase tracking-[0.10em] text-[#D8A84E]">
                                    Current
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 truncate text-[9px] text-[var(--cx-muted)]">
                                {programme.file_name}
                              </div>
                            </div>

                            <div className="text-[10px] text-[var(--cx-muted)]">
                              {programme.revision_label || (
                                programme.revision_number === null || programme.revision_number === undefined
                                  ? "—"
                                  : `Rev ${programme.revision_number}`
                              )}
                            </div>

                            <div className="text-[10px] text-[var(--cx-muted)]">
                              {programme.programme_status || "DRAFT"}
                            </div>

                            <div className="text-[10px] text-[var(--cx-muted)]">
                              {fmt(programme.data_date || undefined)}
                            </div>

                            <div className="text-[10px] text-[var(--cx-muted)]">
                              {fmt(programme.uploaded_at || programme.created_at || undefined)}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                              <Link
                                href={`/delay-analytics/programme-viewer?project=${encodeURIComponent(projectId || "")}&schedule=${encodeURIComponent(programme.id)}`}
                                className="font-semibold text-sky-300 hover:underline"
                              >
                                View Programme
                              </Link>

                              {!programme.is_current && programme.programme_status !== "ARCHIVED" && (
                                <button
                                  type="button"
                                  onClick={() => void setCurrentProgramme(programme.id)}
                                  className="text-[var(--cx-text-soft)] hover:underline"
                                >
                                  Set Current
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => beginEditProgramme(programme)}
                                className="text-[var(--cx-text-soft)] hover:underline"
                              >
                                Edit
                              </button>

                              {programme.programme_status !== "ARCHIVED" && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmArchiveId(programme.id)}
                                  className="text-[var(--cx-muted)] hover:underline"
                                >
                                  Archive
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(programme.id)}
                                className="text-red-300 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {editing && (
                            <div className="border-b border-white/[0.06] bg-[var(--cx-card-2)] px-4 py-4">
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <label className="block">
                                  <span className="text-[9px] uppercase tracking-[0.13em] text-[var(--cx-muted)]">
                                    Programme Title
                                  </span>
                                  <input
                                    value={programmeTitle}
                                    onChange={(e) => setProgrammeTitle(e.target.value)}
                                    className="mt-1 w-full rounded-md border border-white/[0.08] bg-[var(--cx-card)] px-3 py-2 text-xs text-[var(--cx-text)]"
                                  />
                                </label>

                                <label className="block">
                                  <span className="text-[9px] uppercase tracking-[0.13em] text-[var(--cx-muted)]">
                                    Revision Label
                                  </span>
                                  <input
                                    value={revisionLabel}
                                    onChange={(e) => setRevisionLabel(e.target.value)}
                                    className="mt-1 w-full rounded-md border border-white/[0.08] bg-[var(--cx-card)] px-3 py-2 text-xs text-[var(--cx-text)]"
                                  />
                                </label>

                                <label className="block">
                                  <span className="text-[9px] uppercase tracking-[0.13em] text-[var(--cx-muted)]">
                                    Revision Number
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={revisionNumber}
                                    onChange={(e) => setRevisionNumber(e.target.value)}
                                    className="mt-1 w-full rounded-md border border-white/[0.08] bg-[var(--cx-card)] px-3 py-2 text-xs text-[var(--cx-text)]"
                                  />
                                </label>

                                <label className="block">
                                  <span className="text-[9px] uppercase tracking-[0.13em] text-[var(--cx-muted)]">
                                    Status
                                  </span>
                                  <select
                                    value={programmeStatus}
                                    onChange={(e) => setProgrammeStatus(e.target.value)}
                                    className="mt-1 w-full rounded-md border border-white/[0.08] bg-[var(--cx-card)] px-3 py-2 text-xs text-[var(--cx-text)]"
                                  >
                                    {["DRAFT", "SUBMITTED", "ACCEPTED", "REJECTED", "SUPERSEDED", "ARCHIVED"].map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>

                              <div className="mt-3 flex justify-end gap-3 text-[10px]">
                                <button
                                  type="button"
                                  onClick={cancelProgrammeEdit}
                                  className="text-[var(--cx-muted)] hover:underline"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void saveProgramme(programme.id)}
                                  className="font-semibold text-[#D8A84E] hover:underline"
                                >
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}

                  </div>

                )}

              </div>

            )}

            {tab !== "programmes" &&
              result &&
              kind === tab && (
              <div className="rounded-md border border-white/[0.08] bg-[var(--cx-card)] p-5">
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.17em] text-[#D8A84E]">
                        Deterministic Output
                      </div>
                      <div className="mt-2 text-xl font-semibold text-[var(--cx-text)]">
                        {!kind && "No analysis selected"}
                        {kind === "schedule" && "CPM Schedule Summary"}
                        {kind === "apab" && "As-Planned vs As-Built"}
                        {kind === "windows" && "Window Analysis"}
                        {kind === "tia" && "Time Impact Analysis"}
                        {kind === "tia_multi" && "Multi-Event Time Impact Analysis"}
                      </div>
                      <div className="mt-1 max-w-2xl text-[11px] leading-5 text-[var(--cx-muted)]">
                        Review the deterministic result, export the analysis workbook,
                        validate the impacted programme in Primavera P6, or use it in drafting.
                      </div>
                    </div>

                    {(kind === "tia" || kind === "tia_multi") && result && (
                      <div className="rounded-[4px] border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.11em] text-emerald-300">
                        Impacted Programme Available
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                    {result && (scheduleId || result?.schedule_id) ? (
                      <Link
                        href={`/delay-analytics/programme-viewer?project=${encodeURIComponent(
                          projectId || ""
                        )}&schedule=${encodeURIComponent(
                          scheduleId || result?.schedule_id || ""
                        )}`}
                        className="group flex min-h-[92px] items-center justify-between rounded-[5px] border border-sky-400/25 bg-sky-400/[0.06] px-4 py-4 transition hover:border-sky-400/45 hover:bg-sky-400/[0.09]"
                      >
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.13em] text-sky-300">
                            Programme
                          </div>
                          <div className="mt-1 text-sm font-bold text-[var(--cx-text)]">
                            View Programme
                          </div>
                          <div className="mt-1 text-[10px] leading-4 text-[var(--cx-muted)]">
                            Open the selected source programme in the read-only P6 viewer.
                          </div>
                        </div>
                        <span className="ml-4 text-xl text-sky-300 transition group-hover:translate-x-0.5">
                          →
                        </span>
                      </Link>
                    ) : (
                      <div className="flex min-h-[92px] items-center rounded-[5px] border border-white/[0.06] bg-white/[0.02] px-4 py-4 opacity-45">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[var(--cx-muted)]">
                            Programme
                          </div>
                          <div className="mt-1 text-sm font-bold text-[var(--cx-text-soft)]">
                            View Programme
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={!analysisId || !!busy}
                      onClick={exportXlsx}
                      className="group flex min-h-[92px] items-center justify-between rounded-[5px] border border-[#D8A84E]/35 bg-[#D8A84E]/10 px-4 py-4 text-left transition hover:border-[#D8A84E]/55 hover:bg-[#D8A84E]/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[#D8A84E]">
                          Analysis Workbook
                        </div>
                        <div className="mt-1 text-sm font-bold text-[var(--cx-text)]">
                          Export Professional Gantt XLSX
                        </div>
                        <div className="mt-1 text-[10px] leading-4 text-[var(--cx-muted)]">
                          Export the deterministic analysis and professional Gantt workbook.
                        </div>
                      </div>
                      <span className="ml-4 text-lg text-[#D8A84E]">↓</span>
                    </button>

                    <button
                      type="button"
                      disabled={
                        !analysisId ||
                        !!busy ||
                        (kind !== "tia" && kind !== "tia_multi")
                      }
                      onClick={exportImpactedXer}
                      className="group flex min-h-[92px] items-center justify-between rounded-[5px] border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-4 text-left transition hover:border-emerald-400/50 hover:bg-emerald-400/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.13em] text-emerald-300">
                          Impacted Programme
                        </div>
                        <div className="mt-1 text-sm font-bold text-[var(--cx-text)]">
                          Export Impacted XER
                        </div>
                        <div className="mt-1 text-[10px] leading-4 text-[var(--cx-muted)]">
                          Export the TIA-impacted programme for P6 import, reschedule and independent validation.
                        </div>
                      </div>
                      <span className="ml-4 text-lg text-emerald-300">↓</span>
                    </button>

                    {analysisId && (
                      <Link
                        href={`/claims?project=${encodeURIComponent(projectId)}&analysis_id=${encodeURIComponent(analysisId)}&mode=ENGINE2_LINKED`}
                        className="group flex min-h-[92px] items-center justify-between rounded-[5px] border border-violet-400/30 bg-violet-400/[0.08] px-4 py-4 transition hover:border-violet-400/50 hover:bg-violet-400/[0.12]"
                      >
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.13em] text-violet-300">
                            Evidence Handoff
                          </div>
                          <div className="mt-1 text-sm font-bold text-[var(--cx-text)]">
                            Use in Drafting
                          </div>
                          <div className="mt-1 text-[10px] leading-4 text-[var(--cx-muted)]">
                            Open Claims & Resolution with this saved Delay Analysis attached as read-only schedule evidence.
                          </div>
                        </div>
                        <span className="ml-4 text-xl text-violet-300">→</span>
                      </Link>
                    )}

                    <button
                      type="button"
                      disabled={
                        !analysisId ||
                        !!busy ||
                        (kind !== "tia" && kind !== "tia_multi")
                      }
                      onClick={deleteImpactedAnalysis}
                      className="group flex min-h-[92px] items-center justify-between rounded-[5px] border border-red-400/25 bg-red-400/[0.05] px-4 py-4 text-left transition hover:border-red-400/45 hover:bg-red-400/[0.09] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.13em] text-red-300">
                          Server Cleanup
                        </div>
                        <div className="mt-1 text-sm font-bold text-[var(--cx-text)]">
                          Delete Impacted Analysis
                        </div>
                        <div className="mt-1 text-[10px] leading-4 text-[var(--cx-muted)]">
                          Permanently remove this impacted TIA result. The original source programme is preserved.
                        </div>
                      </div>
                      <span className="ml-4 text-lg text-red-300">×</span>
                    </button>
                  </div>

                  {(kind === "tia" || kind === "tia_multi") && result && (
                    <div className="rounded-[4px] border border-white/[0.06] bg-[var(--cx-card-2)] px-3 py-2 text-[9px] leading-4 text-[var(--cx-muted)]">
                      <strong className="text-[var(--cx-text-soft)]">
                        Impacted XER:
                      </strong>{" "}
                      source-preserving ContractX export of the recalculated TIA network.
                      Intended for Primavera P6 import/reschedule/regression validation;
                      it is not represented as a byte-for-byte Oracle P6 export.
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab !== "programmes" &&
              (!result || kind !== tab) && (

              <div className="rounded-md border border-dashed border-white/[0.08] bg-[var(--cx-card)] px-6 py-20 text-center">

                <div className="text-sm font-semibold text-[var(--cx-text-soft)]">

                  Delay Analysis workspace ready

                </div>

                <div className="mx-auto mt-2 max-w-lg text-xs leading-5 text-[var(--cx-muted)]">

                  Upload a P6 XER or select a forensic analysis mode. Schedule

                  calculations remain deterministic and auditable.

                </div>

              </div>

            )}

            {tab !== "programmes" &&
              kind === tab &&
              !!metrics.length && (

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

                {metrics.map(([label, value]) => (

                  <Metric key={label} label={label} value={value} />

                ))}

              </div>

            )}

            {tab === "schedule" &&
              kind === "schedule" &&
              result &&
              (openNetworkActivities.starts.length > 0 ||
                openNetworkActivities.finishes.length > 0) && (
                <div className="grid gap-4 xl:grid-cols-2">
                  {[
                    {
                      title: "Open Start Activities",
                      note: "Activities with no logical predecessor.",
                      rows: openNetworkActivities.starts,
                    },
                    {
                      title: "Open Finish Activities",
                      note: "Activities with no logical successor.",
                      rows: openNetworkActivities.finishes,
                    },
                  ].map((group) => (
                    <div
                      key={group.title}
                      className="rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-[var(--cx-text)]">
                            {group.title}
                          </div>
                          <div className="mt-1 text-[10px] text-[var(--cx-muted)]">
                            {group.note}
                          </div>
                        </div>
                        <div className="rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-2.5 py-1 text-[10px] font-bold text-[#D8A84E]">
                          {group.rows.length}
                        </div>
                      </div>

                      <div className="mt-3 max-h-[300px] overflow-auto rounded-md border border-white/[0.06]">
                        <table className="w-full min-w-[560px] border-collapse text-left">
                          <thead className="sticky top-0 bg-[var(--cx-card-2)]">
                            <tr className="border-b border-white/[0.07]">
                              <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--cx-muted)]">
                                Activity ID
                              </th>
                              <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--cx-muted)]">
                                Activity Name
                              </th>
                              <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--cx-muted)]">
                                WBS
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((row: AnyJson) => (
                              <tr
                                key={`${group.title}-${row.activity_id_pk}`}
                                className="border-b border-white/[0.05] last:border-b-0"
                              >
                                <td className="px-3 py-2 font-mono text-[11px] text-[var(--cx-text-soft)]">
                                  {row.activity_id}
                                </td>
                                <td className="px-3 py-2 text-[11px] text-[var(--cx-text)]">
                                  {row.activity_name}
                                </td>
                                <td className="px-3 py-2 text-[10px] text-[var(--cx-muted)]">
                                  {row.wbs_path || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            {tab === "schedule" && kind === "schedule" &&

              result &&

              Array.isArray(result.parse_warnings) &&

              result.parse_warnings.length > 0 && (

                <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-5">

                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-200">

                    Parse / Network Warnings

                  </div>

                  <div className="mt-3 space-y-2 text-xs leading-5 text-[var(--cx-muted)]">

                    {result.parse_warnings.map((w: string, i: number) => (

                      <div key={`${w}-${i}`}>• {w}</div>

                    ))}

                  </div>

                </div>

              )}

            {(tab === "tia" || tab === "tia_multi") &&
              kind === tab &&
              result && (
                <div className="space-y-4">
                  <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-5">
                    <div className="flex flex-col gap-2 border-b border-white/[0.07] pb-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D8A84E]">
                          Time Impact Analysis Result
                        </div>
                        <div className="mt-1 text-sm font-semibold text-[var(--cx-text)]">
                          {kind === "tia_multi"
                            ? "Multi-Event Delay Impact"
                            : result.fragnet?.fragnet_name ||
                              fragnetName ||
                              "Delay Fragnet Impact"}
                        </div>
                      </div>
                      <div className="text-[10px] font-semibold text-emerald-300">
                        Analysis Completed
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Metric
                        label="Original Completion"
                        value={fmt(result.before?.project_finish)}
                      />
                      <Metric
                        label="Impacted Completion"
                        value={fmt(result.after?.project_finish)}
                      />
                      <Metric
                        label="Net Calendar Impact"
                        value={
                          result.impact?.calendar_elapsed_days == null
                            ? "—"
                            : `${fmtNum(result.impact.calendar_elapsed_days)} days`
                        }
                      />
                      <Metric
                        label="Critical Path"
                        value={
                          result.impact?.critical_path_extended
                            ? "Extended"
                            : "Not Extended"
                        }
                      />
                    </div>
                  </div>

                  {result.network_change && (
                    <div className="rounded-md border border-sky-400/20 bg-sky-400/[0.04] p-5">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-300">
                        Network Change Applied
                      </div>
                      <div className="mt-2 text-xs leading-5 text-[var(--cx-muted)]">
                        Fragnet inserted into the selected CPM path; bypassing source ties
                        were replaced before the full CPM recalculation.
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <MetricCard
                          title="Source Ties Replaced"
                          value={
                            result.network_change
                              ?.source_relationships_removed_count ?? 0
                          }
                          subtitle="Direct predecessor → successor source links replaced by the fragnet."
                        />
                        <MetricCard
                          title="Fragnet Links Added"
                          value={
                            result.network_change
                              ?.fragnet_relationships_added_count ?? 0
                          }
                          subtitle="New predecessor/fragnet/successor relationships included."
                        />
                        <MetricCard
                          title="Recalculation"
                          value="Full CPM"
                          subtitle="Dates, total float and longest path are recalculated on the revised network."
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-5">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#D8A84E]">
                        Delay Fragnet
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                            Fragnet ID
                          </div>
                          <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">
                            {result.fragnet?.fragnet_id ||
                              result.fragnet_id ||
                              (kind === "tia" ? fragnetId : "Multiple Events")}
                          </div>
                        </div>

                        {kind === "tia" && (
                          <>
                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                                Impact Start Date
                              </div>
                              <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">
                                {fmt(
                                  result.tia_event_window
                                    ?.requested_impact_start_date ||
                                    tiaImpactStartDate ||
                                    undefined
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                                Forecast End Date
                              </div>
                              <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">
                                {fmt(
                                  result.tia_event_window
                                    ?.requested_forecast_end_date ||
                                    tiaForecastEndDate ||
                                    undefined
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                                Elapsed Impact
                              </div>
                              <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">
                                {fmtNum(
                                  result.tia_event_window
                                    ?.elapsed_impact_calendar_days ??
                                    inclusiveCalendarDays(
                                      tiaImpactStartDate,
                                      tiaForecastEndDate
                                    )
                                )}{" "}
                                calendar days
                              </div>
                            </div>

                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                                Tie-In
                              </div>
                              <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">
                                {tiaPredecessors.length} predecessor
                                {tiaPredecessors.length === 1 ? "" : "s"} ·{" "}
                                {tiaSuccessors.length} successor
                                {tiaSuccessors.length === 1 ? "" : "s"}
                              </div>
                            </div>
                          </>
                        )}

                        {kind === "tia_multi" && (
                          <>
                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                                Delay Events
                              </div>
                              <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">
                                {multiDelayEvents.length}
                              </div>
                            </div>

                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
                                Event Windows
                              </div>
                              <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">
                                Start → Forecast End · inclusive calendar dates
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {kind === "tia_multi" && (
                        <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
                          {(Array.isArray(result.tia_event_windows)
                            ? result.tia_event_windows
                            : multiDelayEvents.map((event) => ({
                                activity_id_pk: event.fragnet_id,
                                requested_impact_start_date:
                                  event.impact_start_date,
                                requested_forecast_end_date:
                                  event.forecast_end_date,
                                elapsed_impact_calendar_days:
                                  inclusiveCalendarDays(
                                    event.impact_start_date,
                                    event.forecast_end_date
                                  ),
                              }))
                          ).map((windowItem: AnyJson, index: number) => (
                            <div
                              key={`${windowItem.activity_id_pk || "event"}-${index}`}
                              className="grid gap-2 rounded-[4px] border border-white/[0.06] bg-[var(--cx-card-2)] px-3 py-2.5 text-[10px] md:grid-cols-[0.8fr_1fr_1fr_0.8fr]"
                            >
                              <div>
                                <div className="text-[8px] font-bold uppercase tracking-[0.10em] text-[var(--cx-muted)]">
                                  Delay Event
                                </div>
                                <div className="mt-1 font-semibold text-[var(--cx-text)]">
                                  {windowItem.activity_id_pk || `Event ${index + 1}`}
                                </div>
                              </div>
                              <div>
                                <div className="text-[8px] font-bold uppercase tracking-[0.10em] text-[var(--cx-muted)]">
                                  Impact Start
                                </div>
                                <div className="mt-1 font-semibold text-[var(--cx-text)]">
                                  {fmt(
                                    windowItem.requested_impact_start_date ||
                                      undefined
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-[8px] font-bold uppercase tracking-[0.10em] text-[var(--cx-muted)]">
                                  Forecast End
                                </div>
                                <div className="mt-1 font-semibold text-[var(--cx-text)]">
                                  {fmt(
                                    windowItem.requested_forecast_end_date ||
                                      undefined
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-[8px] font-bold uppercase tracking-[0.10em] text-[var(--cx-muted)]">
                                  Elapsed
                                </div>
                                <div className="mt-1 font-semibold text-[var(--cx-text)]">
                                  {fmtNum(
                                    windowItem.elapsed_impact_calendar_days
                                  )}{" "}
                                  days
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-5">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--cx-muted)]">
                        CPM Methodology
                      </div>

                      <div className="mt-4 space-y-2 text-[11px] leading-5 text-[var(--cx-muted)]">
                        <div>
                          <strong className="text-[var(--cx-text-soft)]">
                            Progress:
                          </strong>{" "}
                          {String(result.scheduling_options?.progress_mode || options.progress_mode)
                            .replaceAll("_", " ")}
                        </div>
                        <div>
                          <strong className="text-[var(--cx-text-soft)]">
                            Critical Path:
                          </strong>{" "}
                          {String(result.scheduling_options?.critical_mode || options.critical_mode)
                            .replaceAll("_", " ")}
                        </div>
                        <div>
                          <strong className="text-[var(--cx-text-soft)]">
                            Float:
                          </strong>{" "}
                          {String(result.scheduling_options?.float_mode || options.float_mode)
                            .replaceAll("_", " ")}
                        </div>
                        <div>
                          <strong className="text-[var(--cx-text-soft)]">
                            Calendar:
                          </strong>{" "}
                          P6 programme calendar inherited for CPM calculation.
                        </div>
                        <div>
                          <strong className="text-[var(--cx-text-soft)]">
                            Multiple Float Paths:
                          </strong>{" "}
                          {(result.scheduling_options?.calculate_multiple_float_paths ??
                            options.calculate_multiple_float_paths)
                            ? "Enabled"
                            : "Disabled"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {(tab === "apab" || tab === "windows") &&
              kind === tab &&
              result &&
              comparisonImpact && (
                <div className="space-y-4">
                  <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-5">
                    <div className="flex flex-col gap-3 border-b border-white/[0.07] pb-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#D8A84E]">
                          {kind === "apab"
                            ? "As-Planned vs As-Built"
                            : "Window Analysis"}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-[var(--cx-text)]">
                          Deterministic schedule comparison
                        </div>
                        <div className="mt-1 max-w-3xl text-[11px] leading-5 text-[var(--cx-muted)]">
                          {kind === "apab"
                            ? "Compares the approved/planned programme position with the as-built or current programme. Variance does not by itself assign responsibility, entitlement, excusability, compensability or concurrency."
                            : "Compares programme movement between two updates. Completion movement is schedule movement only and is not automatically a delay event, liability finding or entitlement conclusion."}
                        </div>
                      </div>
                      <div className="rounded-md border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2 text-[10px] font-black uppercase tracking-[0.10em] text-emerald-300">
                        Analysis Complete
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {(kind === "apab"
                        ? [
                            ["Planned Completion", fmt(comparisonImpact.planned_finish)],
                            ["Actual / Current Completion", fmt(comparisonImpact.actual_or_current_finish)],
                            ["Completion Variance", signedDays(comparisonImpact.completion_variance_calendar_days)],
                            ["Matched Activities", comparisonImpact.matched_activity_count ?? "—"],
                            ["Later Finish Activities", comparisonImpact.later_finish_activity_count ?? "—"],
                            ["New Activities", comparisonImpact.added_activity_count ?? "—"],
                            ["Deleted / Missing", comparisonImpact.deleted_or_missing_activity_count ?? "—"],
                            ["Became Critical", comparisonImpact.became_critical_count ?? "—"],
                          ]
                        : [
                            ["Window A Completion", fmt(comparisonImpact.window_a_finish)],
                            ["Window B Completion", fmt(comparisonImpact.window_b_finish)],
                            ["Completion Movement", signedDays(comparisonImpact.completion_movement_calendar_days)],
                            ["Changed Activities", comparisonImpact.changed_activity_count ?? "—"],
                            ["Activities Slipped", comparisonImpact.slipped_activity_count ?? "—"],
                            ["Activities Recovered", comparisonImpact.recovered_activity_count ?? "—"],
                            ["Progressed Activities", comparisonImpact.progressed_activity_count ?? "—"],
                            ["Float Erosion", comparisonImpact.float_erosion_activity_count ?? "—"],
                          ]
                      ).map(([label, value]) => (
                        <Metric key={String(label)} label={String(label)} value={value} />
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-5">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--cx-muted)]">
                        Network & Calendar Changes
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <Metric
                          label="Logic Changes"
                          value={comparisonImpact.logic_change_count ?? 0}
                        />
                        <Metric
                          label="Calendar Changes"
                          value={comparisonImpact.calendar_change_count ?? 0}
                        />
                        {kind === "windows" && (
                          <>
                            <Metric
                              label="Constraint Changes"
                              value={comparisonImpact.constraint_change_count ?? 0}
                            />
                            <Metric
                              label="Became Critical"
                              value={comparisonImpact.became_critical_count ?? 0}
                            />
                          </>
                        )}
                        {kind === "apab" && (
                          <>
                            <Metric
                              label="Left Critical Set"
                              value={comparisonImpact.left_critical_set_count ?? 0}
                            />
                            <Metric
                              label="As-Built Activities"
                              value={comparisonImpact.as_built_activity_count ?? "—"}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-5">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--cx-muted)]">
                        Professional Output
                      </div>
                      <div className="mt-3 text-[11px] leading-5 text-[var(--cx-muted)]">
                        The professional XLSX is the controlled comparison deliverable for this methodology. No impacted XER is generated because AP vs AB and Window Analysis do not create a modified programme network.
                      </div>

                      <div className="mt-4 grid gap-2">
                        <button
                          type="button"
                          disabled={!analysisId || !!busy}
                          onClick={exportXlsx}
                          className="rounded-md border border-[#D8A84E]/35 bg-[#D8A84E]/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#D8A84E] disabled:opacity-40"
                        >
                          Export Professional Gantt XLSX
                        </button>

                        {analysisId && (
                          <Link
                            href={`/claims?project=${encodeURIComponent(projectId)}&analysis_id=${encodeURIComponent(analysisId)}&mode=ENGINE2_LINKED`}
                            className="rounded-md border border-violet-400/30 bg-violet-400/[0.08] px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.12em] text-violet-300"
                          >
                            Use in Drafting
                          </Link>
                        )}

                        <button
                          type="button"
                          disabled={!analysisId || !!busy}
                          onClick={() => void deleteStoredAnalysis(analysisId)}
                          className="rounded-md border border-red-400/25 bg-red-400/[0.06] px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-red-300 disabled:opacity-40"
                        >
                          Delete Analysis
                        </button>
                      </div>
                    </div>
                  </div>

                  <details className="rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-5">
                    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.14em] text-[#D8A84E]">
                      Detailed Deterministic Findings
                    </summary>
                    <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border border-white/[0.06] bg-[var(--cx-card-2)] p-4 text-[10px] leading-5 text-[var(--cx-muted)]">
                      {json(kind === "apab" ? result.comparison : result.results)}
                    </pre>
                  </details>
                </div>
              )}

{tab !== "programmes" && <div className="rounded-md border border-white/[0.07] bg-[var(--cx-card)] p-5">

              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                <div>

                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D8A84E]">

                    Evidence Handoff

                  </div>

                  <div className="mt-2 text-sm font-semibold text-[var(--cx-text)]">

                    Delay Analysis → Drafting Evidence

                  </div>

                  <div className="mt-1 max-w-2xl text-xs leading-5 text-[var(--cx-muted)]">

                    Persisted analysis IDs are the deterministic evidence bridge

                    for delay-event and claims workflows.

                  </div>

                </div>

                <div className="flex flex-wrap gap-2">

                  <input

                    value={analysisId}

                    onChange={(e) => setAnalysisId(e.target.value)}

                    placeholder="Persisted analysis ID"

                    className="min-w-[280px] rounded-md border border-white/[0.08] bg-[var(--cx-card-2)] px-3 py-3 text-xs text-[var(--cx-text-soft)]"

                  />

                  <button

                    disabled={!analysisId || !!busy}

                    onClick={exportXlsx}

                    className="rounded-md bg-[#D8A84E] px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#050608] disabled:opacity-40"

                  >

                    Export Professional Gantt XLSX

                  </button>

                </div>

              </div>

            </div>}

          </section>

        </div>

        <div className="mt-8 border-t border-white/[0.07] py-5 text-[10px] leading-5 text-[var(--cx-muted)]">
          Deterministic schedule analysis from supplied programme data. Contractual entitlement, causation and liability require separate contract and evidence review.
        </div>

      </div>

          <LegalFooter compact />

    </main>

  );

}
