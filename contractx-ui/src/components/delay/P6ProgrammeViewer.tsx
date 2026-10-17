/**
 * ContractX.co — P6 Programme Viewer
 *
 * SPDX-License-Identifier: MIT
 * License: MIT License (the MIT license has no version number).
 *
 * Copyright (c) 2026 ContractX.co / Prime Project Control.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 *
 * Third-party credits:
 * - React: MIT License.
 * - DHTMLX Gantt Community Edition v10+: MIT License.
 *   Legacy dhtmlx-gantt v9.x and earlier used GPL v2; this viewer is intended
 *   for the MIT-licensed Community Edition v10+.
 * - Lucide Icons: ISC License; portions derive from Feather Icons (MIT).
 *
 * Third-party packages remain subject to their own copyright notices and
 * license terms. Do not remove their bundled LICENSE / NOTICE files.
 */

"use client";

import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
import {
  Filter,
  GitBranch,
  Layers,
  Printer,
  RotateCcw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type ViewerTheme = "light" | "dark";
type FilterMode =
  | "all"
  | "longest"
  | "critical"
  | "milestones"
  | "loe"
  | "not_started"
  | "in_progress"
  | "completed";

type SortKey =
  | "p6"
  | "wbs"
  | "activity_id"
  | "name"
  | "duration"
  | "start"
  | "finish"
  | "float";

type SortDirection = "asc" | "desc";
type WbsLevel = "1" | "2" | "3" | "all";
type ZoomMode = "year" | "month" | "week" | "day";

export type ProgrammeWbsNode = {
  wbs_id: string;
  parent_wbs_id?: string | null;
  wbs_code?: string;
  wbs_name?: string;
  wbs_path?: string;
  sequence_number?: number | null;
  source_row_sequence?: number | null;
  status?: string;
};

export type ProgrammeActivity = {
  activity_id_pk: string;
  source_activity_id_pk?: string | null;
  synthetic_activity_pk?: boolean;

  activity_id: string;
  activity_name: string;

  wbs_id?: string | null;
  parent_wbs_id?: string | null;
  wbs_code?: string;
  wbs_name?: string;
  wbs_path?: string;

  wbs_sequence_number?: number | null;
  wbs_source_row_sequence?: number | null;
  activity_sequence?: number | null;
  source_row_sequence?: number | null;
  display_sequence?: number | null;

  calendar_id?: string;
  hours_per_day?: number | null;
  status?: string;

  activity_type?: string;
  activity_type_raw?: string;
  activity_type_normalized?: string;
  is_start_milestone?: boolean;
  is_finish_milestone?: boolean;

  original_duration_hours?: number | null;
  original_duration_days?: number | null;

  start?: string | null;
  finish?: string | null;

  planned_start?: string | null;
  planned_finish?: string | null;
  early_start?: string | null;
  early_finish?: string | null;
  late_start?: string | null;
  late_finish?: string | null;
  actual_start?: string | null;
  actual_finish?: string | null;
  remaining_start?: string | null;
  remaining_finish?: string | null;
  expected_finish?: string | null;

  total_float_hours?: number | null;
  total_float_days?: number | null;

  is_longest_path?: boolean;
  is_critical?: boolean;
  cpm_present?: boolean;
};

export type ProgrammeRelationship = {
  relationship_id?: string;
  predecessor_activity_pk: string;
  successor_activity_pk: string;
  relationship_type: string;
  lag_hours?: number;
  source_row_sequence?: number | null;
};

export type ViewerMetadata = {
  ordering?: string;
  display_basis?: string;
  dates_recalculated_for_viewer?: boolean;
  all_parsed_task_rows_included?: boolean;
  wbs_hierarchy_preserved?: boolean;
  wbs_path_preserved?: boolean;
  milestone_semantics_exposed?: boolean;
  source_activity_count?: number;
  cpm_activity_count?: number;
  source_relationship_count?: number;
  cpm_relationship_count?: number;
  source_vs_cpm_activity_count_match?: boolean;
  source_vs_cpm_relationship_count_match?: boolean;
  blank_activity_pk_count?: number;
  duplicate_relationship_pair_extra_count?: number;
  engine_project_finish_diagnostic?: string | null;
  engine_recalculation_warning?: string | null;
  [key: string]: unknown;
};

export type ViewerData = {
  schedule_id?: string;
  programme_title: string;
  baseline_schedule_id?: string | null;
  data_date?: string | null;

  programme_start?: string | null;
  programme_finish?: string | null;

  activity_count: number;
  relationship_count: number;
  wbs_count?: number;

  wbs_nodes?: ProgrammeWbsNode[];
  activities: ProgrammeActivity[];
  relationships: ProgrammeRelationship[];

  read_only?: boolean;
  viewer_metadata?: ViewerMetadata;
};

interface P6ViewerProps {
  data: ViewerData;
  baselineData?: ViewerData | null;
  initialLongestOnly?: boolean;
  onClose?: () => void;
  theme?: ViewerTheme;
}

type GanttTask = {
  id: string;
  text: string;
  parent: string | number;
  open?: boolean;
  readonly: boolean;
  unscheduled?: boolean;
  start_date?: Date | null;
  end_date?: Date | null;

  row_kind: "wbs" | "activity";
  activity_pk?: string;
  activity_id?: string;
  wbs_id?: string;
  wbs_code?: string;
  wbs_level?: number;

  original_duration_days?: number | null;
  raw_start?: string | null;
  raw_finish?: string | null;
  total_float_days?: number | null;
  status?: string;

  is_longest_path?: boolean;
  is_critical?: boolean;
  is_start_milestone?: boolean;
  is_finish_milestone?: boolean;

  baseline_start?: Date | null;
  baseline_end?: Date | null;
};

const ZOOM_LEVELS: ZoomMode[] = ["year", "month", "week", "day"];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, amount: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function addMonths(date: Date, amount: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + amount);
  return d;
}

function addHours(date: Date, amount: number) {
  return new Date(date.getTime() + amount * 60 * 60 * 1000);
}

function shortDate(value?: string | null) {
  const d = safeDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function longDate(value?: string | null) {
  const d = safeDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function numberText(value?: number | null) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }
  const n = Number(value);
  return Number.isInteger(n)
    ? String(n)
    : n.toFixed(2).replace(/\.?0+$/, "");
}

function totalFloatText(value?: number | null) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  // Match the current P6 layout: Total Float is displayed with zero decimals.
  // The underlying source precision remains unchanged in the payload.
  return String(Math.round(Number(value)));
}

function compareWbsCode(
  a?: string | null,
  b?: string | null
) {
  const aa = String(a || "").trim();
  const bb = String(b || "").trim();

  if (aa && bb) {
    const byCode = aa.localeCompare(bb, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (byCode !== 0) return byCode;
  } else if (aa) {
    return -1;
  } else if (bb) {
    return 1;
  }

  return 0;
}

function relationType(value: string) {
  const type = String(value || "FS").toUpperCase();
  if (type === "SS" || type === "PR_SS") return "1";
  if (type === "FF" || type === "PR_FF") return "2";
  if (type === "SF" || type === "PR_SF") return "3";
  return "0";
}

function milestoneKind(
  activity: ProgrammeActivity
): "start" | "finish" | null {
  if (activity.is_start_milestone) return "start";
  if (activity.is_finish_milestone) return "finish";

  const token = String(
    activity.activity_type_normalized ||
      activity.activity_type_raw ||
      activity.activity_type ||
      ""
  )
    .trim()
    .toUpperCase();

  if (
    token === "START_MILESTONE" ||
    token === "TT_MILE" ||
    token === "TT_MILESTONE"
  ) {
    return "start";
  }

  if (
    token === "FINISH_MILESTONE" ||
    token === "TT_FINMILE" ||
    token === "TT_FINISHMILESTONE"
  ) {
    return "finish";
  }

  return null;
}

function isCritical(activity: ProgrammeActivity) {
  if (activity.is_critical === true) return true;
  const tf = activity.total_float_days;
  return typeof tf === "number" && Number.isFinite(tf) && tf <= 0;
}

function activityStatusToken(activity: ProgrammeActivity) {
  return String(activity.status || "").trim().toUpperCase();
}

function isCompletedActivity(activity: ProgrammeActivity) {
  const token = activityStatusToken(activity);
  return (
    token === "TK_COMPLETE" ||
    token === "COMPLETE" ||
    token === "COMPLETED" ||
    token.includes("COMPLETE")
  );
}

function isInProgressActivity(activity: ProgrammeActivity) {
  const token = activityStatusToken(activity);
  return (
    token === "TK_ACTIVE" ||
    token === "ACTIVE" ||
    token.includes("PROGRESS") ||
    token.includes("ACTIVE")
  );
}

function isNotStartedActivity(activity: ProgrammeActivity) {
  const token = activityStatusToken(activity);
  return (
    token === "TK_NOTSTART" ||
    token === "NOT_STARTED" ||
    token === "NOT STARTED" ||
    token.includes("NOTSTART")
  );
}

function isLevelOfEffort(activity: ProgrammeActivity) {
  const token = String(
    activity.activity_type_normalized ||
      activity.activity_type_raw ||
      activity.activity_type ||
      ""
  )
    .trim()
    .toUpperCase();

  return token === "LEVEL_OF_EFFORT" || token === "TT_LOE";
}

function compareText(a: unknown, b: unknown) {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareNumberNullable(a: unknown, b: unknown) {
  const aa = Number(a);
  const bb = Number(b);
  const aValid = Number.isFinite(aa);
  const bValid = Number.isFinite(bb);

  if (aValid && bValid) return aa - bb;
  if (aValid) return -1;
  if (bValid) return 1;
  return 0;
}

function compareDateNullable(a?: string | null, b?: string | null) {
  const aa = safeDate(a)?.getTime();
  const bb = safeDate(b)?.getTime();

  if (aa !== undefined && bb !== undefined) return aa - bb;
  if (aa !== undefined) return -1;
  if (bb !== undefined) return 1;
  return 0;
}

function activityKey(activity: ProgrammeActivity) {
  return String(
    activity.source_activity_id_pk ||
      activity.activity_id_pk ||
      activity.activity_id
  ).trim();
}

function taskIdForActivity(activity: ProgrammeActivity) {
  return `act::${activityKey(activity)}`;
}

function baselineLookupKey(activity: ProgrammeActivity) {
  return String(activity.activity_id || activityKey(activity)).trim();
}

function getProgrammeRange(data: ViewerData) {
  let start = safeDate(data.programme_start);
  let finish = safeDate(data.programme_finish);

  if (!start || !finish) {
    for (const activity of data.activities) {
      const s = safeDate(activity.start);
      const f = safeDate(activity.finish);
      if (s && (!start || s < start)) start = s;
      if (f && (!finish || f > finish)) finish = f;
    }
  }

  return { start, finish };
}

function buildWbsRangeMap(
  wbsNodes: ProgrammeWbsNode[],
  activities: ProgrammeActivity[]
) {
  const children = new Map<string, string[]>();
  const ranges = new Map<string, { start: Date | null; finish: Date | null }>();

  for (const node of wbsNodes) {
    const id = String(node.wbs_id);
    const parent = String(node.parent_wbs_id || "");
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(id);
    ranges.set(id, { start: null, finish: null });
  }

  for (const activity of activities) {
    const wbsId = String(activity.wbs_id || "");
    const range = ranges.get(wbsId);
    if (!range) continue;

    const start = safeDate(activity.start);
    const finish = safeDate(activity.finish);

    if (start && (!range.start || start < range.start)) {
      range.start = start;
    }
    if (finish && (!range.finish || finish > range.finish)) {
      range.finish = finish;
    }
  }

  const visiting = new Set<string>();

  const resolve = (id: string) => {
    const range = ranges.get(id) || { start: null, finish: null };
    if (visiting.has(id)) return range;

    visiting.add(id);

    for (const child of children.get(id) || []) {
      const childRange = resolve(child);

      if (
        childRange.start &&
        (!range.start || childRange.start < range.start)
      ) {
        range.start = childRange.start;
      }

      if (
        childRange.finish &&
        (!range.finish || childRange.finish > range.finish)
      ) {
        range.finish = childRange.finish;
      }
    }

    visiting.delete(id);
    ranges.set(id, range);
    return range;
  };

  for (const node of wbsNodes) {
    resolve(String(node.wbs_id));
  }

  return ranges;
}

function SummaryBadge({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string | number;
  warning?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded border px-2.5 py-1.5",
        warning
          ? "border-amber-300 bg-amber-50"
          : "border-slate-200 bg-slate-50"
      )}
    >
      <div
        className={cx(
          "text-[8px] font-bold uppercase tracking-[0.08em]",
          warning ? "text-amber-700" : "text-slate-400"
        )}
      >
        {label}
      </div>
      <div
        className={cx(
          "mt-0.5 text-xs font-bold",
          warning ? "text-amber-900" : "text-slate-800"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function LegendBar({
  color,
  label,
  thin = false,
}: {
  color: string;
  label: string;
  thin?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={thin ? "h-1 w-4" : "h-2 w-4"}
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}

export default function P6ProgrammeViewer({
  data,
  baselineData,
  initialLongestOnly = false,
  onClose,
  theme = "light",
}: P6ViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ganttContainerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<any>(null);
  const baselineLayerIdRef = useRef<any>(null);
  const openStateRef = useRef<Map<string, boolean>>(new Map());
  const printRestoreRef = useRef<null | {
    smartRendering: boolean;
    autosize: boolean | string;
    containerHeight: string;
    containerOverflow: string;
    shellHeight: string;
    shellOverflow: string;
    startDate: Date | null;
    endDate: Date | null;
    minColumnWidth: number | undefined;
  }>(null);

  const [filterMode, setFilterMode] = useState<FilterMode>(
    initialLongestOnly ? "longest" : "all"
  );
  const [searchText, setSearchText] = useState("");
  const deferredSearch = useDeferredValue(searchText);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showBaseline, setShowBaseline] = useState(Boolean(baselineData));
  const [showRelationships, setShowRelationships] = useState(true);
  const [zoom, setZoom] = useState<ZoomMode>("month");
  const [sortKey, setSortKey] = useState<SortKey>("p6");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("asc");
  const [wbsFilter, setWbsFilter] = useState<string>("all");
  const [wbsLevel, setWbsLevel] = useState<WbsLevel>("all");
  const [ganttLicense, setGanttLicense] = useState<string>("unknown");

  const sourceActivityIntegrity =
    data.activity_count === data.activities.length;
  const sourceRelationshipIntegrity =
    data.relationship_count === data.relationships.length;

  const baselineByActivityId = useMemo(() => {
    const map = new Map<string, ProgrammeActivity>();

    for (const activity of baselineData?.activities || []) {
      const key = baselineLookupKey(activity);
      if (key) map.set(key, activity);
    }

    return map;
  }, [baselineData]);

  // Build the P6 WBS tree from PROJWBS parent relationships, but order every
  // sibling group by WBS Code first. This prevents global sequence sorting from
  // pushing valid WBS branches to the bottom of the programme.
  const wbsNodes = useMemo<ProgrammeWbsNode[]>(() => {
    const normalized = (data.wbs_nodes || []).map((node) => ({
      ...node,
      wbs_id: String(node.wbs_id || "").trim(),
      parent_wbs_id:
        node.parent_wbs_id === null ||
        node.parent_wbs_id === undefined ||
        String(node.parent_wbs_id).trim() === ""
          ? null
          : String(node.parent_wbs_id).trim(),
      wbs_code: String(node.wbs_code || "").trim(),
    }));

    const byId = new Map(
      normalized
        .filter((node) => node.wbs_id)
        .map((node) => [node.wbs_id, node])
    );

    // P6 parent_wbs_id remains authoritative. If an exported node has a blank,
    // self-referencing or missing parent, recover its parent from the longest
    // existing hierarchical WBS-code prefix (for example 1.2.3 -> 1.2).
    const byCode = normalized
      .filter((node) => node.wbs_code)
      .slice()
      .sort((a, b) => b.wbs_code.length - a.wbs_code.length);

    const repaired = normalized.map((node) => {
      const parentId = String(node.parent_wbs_id || "");
      const parentIsValid =
        parentId &&
        parentId !== node.wbs_id &&
        byId.has(parentId);

      if (parentIsValid || !node.wbs_code) {
        return node;
      }

      const inferredParent = byCode.find((candidate) => {
        if (candidate.wbs_id === node.wbs_id) return false;
        if (!candidate.wbs_code) return false;
        if (!node.wbs_code.startsWith(candidate.wbs_code)) return false;

        const next = node.wbs_code.charAt(candidate.wbs_code.length);
        return next === "." || next === "/" || next === "\\";
      });

      return {
        ...node,
        parent_wbs_id: inferredParent?.wbs_id || null,
      };
    });

    // This top-level array order is only a deterministic fallback. The actual
    // rendered order is set per parent in wbsChildren below.
    return repaired.sort((a, b) => {
      const byCodeResult = compareWbsCode(a.wbs_code, b.wbs_code);
      if (byCodeResult !== 0) return byCodeResult;

      const aa =
        a.source_row_sequence ??
        a.sequence_number ??
        Number.MAX_SAFE_INTEGER;
      const bb =
        b.source_row_sequence ??
        b.sequence_number ??
        Number.MAX_SAFE_INTEGER;
      return aa - bb;
    });
  }, [data.wbs_nodes]);

  const wbsMap = useMemo(
    () => new Map(wbsNodes.map((node) => [String(node.wbs_id), node])),
    [wbsNodes]
  );

  const wbsDepthMap = useMemo(() => {
    const result = new Map<string, number>();

    const resolveDepth = (
      nodeId: string,
      visiting = new Set<string>()
    ): number => {
      if (result.has(nodeId)) {
        return result.get(nodeId)!;
      }

      if (visiting.has(nodeId)) {
        // Defensive fallback for malformed/cyclic WBS exports.
        result.set(nodeId, 1);
        return 1;
      }

      const node = wbsMap.get(nodeId);
      if (!node) {
        result.set(nodeId, 1);
        return 1;
      }

      const nextVisiting = new Set(visiting);
      nextVisiting.add(nodeId);

      const parentId = String(node.parent_wbs_id || "").trim();
      const depth =
        !parentId || !wbsMap.has(parentId)
          ? 1
          : resolveDepth(parentId, nextVisiting) + 1;

      result.set(nodeId, depth);
      return depth;
    };

    for (const node of wbsNodes) {
      resolveDepth(String(node.wbs_id));
    }

    return result;
  }, [wbsMap, wbsNodes]);

  const wbsChildren = useMemo(() => {
    const map = new Map<string, ProgrammeWbsNode[]>();

    for (const node of wbsNodes) {
      const parent = String(node.parent_wbs_id || "");
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(node);
    }

    for (const rows of map.values()) {
      rows.sort((a, b) => {
        // WBS Code remains the hierarchy key. Descending is only applied when
        // the user explicitly selects "WBS Code" + descending.
        const direction =
          sortKey === "wbs" && sortDirection === "desc" ? -1 : 1;

        const byCodeResult =
          compareWbsCode(a.wbs_code, b.wbs_code) * direction;
        if (byCodeResult !== 0) return byCodeResult;

        const aa =
          a.source_row_sequence ??
          a.sequence_number ??
          Number.MAX_SAFE_INTEGER;
        const bb =
          b.source_row_sequence ??
          b.sequence_number ??
          Number.MAX_SAFE_INTEGER;
        return (aa - bb) * direction;
      });
    }

    return map;
  }, [sortDirection, sortKey, wbsNodes]);

  const activityComparator = useMemo(() => {
    return (a: ProgrammeActivity, b: ProgrammeActivity) => {
      let result = 0;

      if (sortKey === "activity_id") {
        result = compareText(a.activity_id, b.activity_id);
      } else if (sortKey === "name") {
        result = compareText(a.activity_name, b.activity_name);
      } else if (sortKey === "duration") {
        result = compareNumberNullable(
          a.original_duration_days,
          b.original_duration_days
        );
      } else if (sortKey === "start") {
        result = compareDateNullable(a.start, b.start);
      } else if (sortKey === "finish") {
        result = compareDateNullable(a.finish, b.finish);
      } else if (sortKey === "float") {
        result = compareNumberNullable(
          a.total_float_days,
          b.total_float_days
        );
      } else {
        // Default P6 activity order within each WBS.
        const aa =
          a.activity_sequence ??
          a.display_sequence ??
          a.source_row_sequence ??
          Number.MAX_SAFE_INTEGER;
        const bb =
          b.activity_sequence ??
          b.display_sequence ??
          b.source_row_sequence ??
          Number.MAX_SAFE_INTEGER;

        result = aa - bb;
        if (result === 0) {
          result = compareText(a.activity_id, b.activity_id);
        }
      }

      return sortDirection === "desc" ? -result : result;
    };
  }, [sortDirection, sortKey]);

  const activitiesByWbs = useMemo(() => {
    const map = new Map<string, ProgrammeActivity[]>();

    for (const activity of data.activities) {
      const wbsId = String(activity.wbs_id || "");
      if (!map.has(wbsId)) map.set(wbsId, []);
      map.get(wbsId)!.push(activity);
    }

    for (const rows of map.values()) {
      rows.sort(activityComparator);
    }

    return map;
  }, [activityComparator, data.activities]);

  const wbsFilterIds = useMemo(() => {
    if (wbsFilter === "all") return null;

    const ids = new Set<string>();
    const stack = [wbsFilter];

    while (stack.length) {
      const current = stack.pop()!;
      if (ids.has(current)) continue;
      ids.add(current);

      for (const child of wbsChildren.get(current) || []) {
        stack.push(String(child.wbs_id));
      }
    }

    return ids;
  }, [wbsChildren, wbsFilter]);

  const visibleActivities = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return data.activities.filter((activity) => {
      if (
        wbsFilterIds &&
        !wbsFilterIds.has(String(activity.wbs_id || ""))
      ) {
        return false;
      }

      if (filterMode === "longest" && !activity.is_longest_path) {
        return false;
      }

      if (filterMode === "critical" && !isCritical(activity)) {
        return false;
      }

      if (filterMode === "milestones" && !milestoneKind(activity)) {
        return false;
      }

      if (filterMode === "loe" && !isLevelOfEffort(activity)) {
        return false;
      }

      if (
        filterMode === "not_started" &&
        !isNotStartedActivity(activity)
      ) {
        return false;
      }

      if (
        filterMode === "in_progress" &&
        !isInProgressActivity(activity)
      ) {
        return false;
      }

      if (
        filterMode === "completed" &&
        !isCompletedActivity(activity)
      ) {
        return false;
      }

      if (!query) return true;

      return [
        activity.activity_id,
        activity.activity_name,
        activity.wbs_code,
        activity.wbs_name,
        activity.wbs_path,
        activity.status,
        activity.activity_type,
        activity.activity_type_normalized,
        activity.calendar_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    data.activities,
    deferredSearch,
    filterMode,
    wbsFilterIds,
  ]);

  const visibleActivityKeys = useMemo(
    () => new Set(visibleActivities.map(activityKey)),
    [visibleActivities]
  );

  const requiredWbsIds = useMemo(() => {
    const ids = new Set<string>();

    // Keep only WBS nodes that contain at least one visible activity,
    // plus every ancestor required to preserve the P6 hierarchy.
    // Empty branches are not sent to DHTMLX.
    for (const activity of visibleActivities) {
      let current = String(activity.wbs_id || "");
      const seen = new Set<string>();

      while (current && !seen.has(current)) {
        seen.add(current);

        const node = wbsMap.get(current);
        if (!node) break;

        ids.add(current);
        current = String(node.parent_wbs_id || "");
      }
    }

    return ids;
  }, [visibleActivities, wbsMap]);

  const visibleActivitiesByWbs = useMemo(() => {
    const map = new Map<string, ProgrammeActivity[]>();

    for (const activity of visibleActivities) {
      const wbsId = String(activity.wbs_id || "");
      if (!map.has(wbsId)) map.set(wbsId, []);
      map.get(wbsId)!.push(activity);
    }

    for (const rows of map.values()) {
      rows.sort(activityComparator);
    }

    return map;
  }, [activityComparator, visibleActivities]);

  const wbsRangeMap = useMemo(
    () => buildWbsRangeMap(wbsNodes, visibleActivities),
    [wbsNodes, visibleActivities]
  );

  /*
   * IMPORTANT - COMMUNITY EDITION:
   * Do not use DHTMLX type:"project" or type:"milestone".
   * Those task types are PRO features.
   *
   * WBS hierarchy is represented with ordinary tasks using parent/open,
   * which is supported by the Community edition. WBS summary bars and
   * milestones are styled manually through task_class.
   */
  const taskPayload = useMemo(() => {
    const tasks: GanttTask[] = [];

    const pushActivity = (
      activity: ProgrammeActivity,
      parent: string | number
    ) => {
      const start = safeDate(activity.start);
      const finish = safeDate(activity.finish);
      const milestone = milestoneKind(activity);

      const milestoneDate =
        milestone === "start"
          ? start || finish
          : milestone === "finish"
          ? finish || start
          : null;

      const baseline = baselineByActivityId.get(
        baselineLookupKey(activity)
      );

      let renderedStart = start;
      let renderedFinish = finish;

      // Community edition milestone emulation:
      // give the ordinary task a minimal temporal footprint and render it
      // as a fixed-size diamond through CSS.
      if (milestoneDate) {
        renderedStart = milestoneDate;
        renderedFinish = addHours(milestoneDate, 1);
      }

      tasks.push({
        id: taskIdForActivity(activity),
        text:
          activity.activity_name ||
          activity.activity_id ||
          "(Unnamed activity)",
        parent,
        readonly: true,
        unscheduled:
          milestoneDate === null
            ? !renderedStart || !renderedFinish
            : false,
        start_date: renderedStart,
        end_date: renderedFinish,

        row_kind: "activity",
        activity_pk: activityKey(activity),
        activity_id: activity.activity_id,
        wbs_id: String(activity.wbs_id || ""),

        original_duration_days:
          activity.original_duration_days ?? null,
        raw_start: activity.start,
        raw_finish: activity.finish,
        total_float_days: activity.total_float_days ?? null,
        status: activity.status,

        is_longest_path: Boolean(activity.is_longest_path),
        is_critical: isCritical(activity),
        is_start_milestone: milestone === "start",
        is_finish_milestone: milestone === "finish",

        baseline_start: safeDate(baseline?.start),
        baseline_end: safeDate(baseline?.finish),
      });
    };

    const visited = new Set<string>();

    const walkWbs = (
      node: ProgrammeWbsNode,
      parent: string | number
    ) => {
      const nodeId = String(node.wbs_id);

      if (!requiredWbsIds.has(nodeId)) return;
      if (visited.has(nodeId)) return;

      visited.add(nodeId);

      const ganttId = `wbs::${nodeId}`;
      const range = wbsRangeMap.get(nodeId);

      // WBS is an ordinary task in Community edition. The tree comes
      // entirely from parent/open; the summary appearance is custom CSS.
      tasks.push({
        id: ganttId,
        text:
          node.wbs_code && node.wbs_name
            ? `${node.wbs_code} - ${node.wbs_name}`
            : node.wbs_code ||
              node.wbs_name ||
              "(Unnamed WBS)",
        parent,
        open:
          openStateRef.current.get(ganttId) ??
          (
            wbsLevel === "all" ||
            (wbsDepthMap.get(nodeId) ?? 1) < Number(wbsLevel)
          ),
        readonly: true,
        unscheduled: !range?.start || !range?.finish,
        start_date: range?.start || null,
        end_date: range?.finish || null,

        row_kind: "wbs",
        wbs_id: nodeId,
        wbs_code: node.wbs_code,
        wbs_level: wbsDepthMap.get(nodeId) ?? 1,
        raw_start: range?.start?.toISOString() || null,
        raw_finish: range?.finish?.toISOString() || null,
      });

      for (const child of wbsChildren.get(nodeId) || []) {
        walkWbs(child, ganttId);
      }

      for (const activity of visibleActivitiesByWbs.get(nodeId) || []) {
        pushActivity(activity, ganttId);
      }
    };

    const roots = wbsNodes
      .filter((node) => {
        const parent = String(node.parent_wbs_id || "");
        return !parent || !wbsMap.has(parent);
      })
      .sort((a, b) => {
        const direction =
          sortKey === "wbs" && sortDirection === "desc" ? -1 : 1;

        const byCodeResult =
          compareWbsCode(a.wbs_code, b.wbs_code) * direction;
        if (byCodeResult !== 0) return byCodeResult;

        const aa =
          a.source_row_sequence ??
          a.sequence_number ??
          Number.MAX_SAFE_INTEGER;
        const bb =
          b.source_row_sequence ??
          b.sequence_number ??
          Number.MAX_SAFE_INTEGER;
        return (aa - bb) * direction;
      });

    for (const root of roots) {
      walkWbs(root, 0);
    }

    // Preserve orphan WBS nodes rather than dropping them.
    for (const node of wbsNodes) {
      const id = String(node.wbs_id);
      if (requiredWbsIds.has(id) && !visited.has(id)) {
        walkWbs(node, 0);
      }
    }

    // Preserve activities with no valid WBS rather than dropping them.
    for (const activity of visibleActivities) {
      const wbsId = String(activity.wbs_id || "");
      if (!wbsId || !wbsMap.has(wbsId)) {
        pushActivity(activity, 0);
      }
    }

    return tasks;
  }, [
    baselineByActivityId,
    requiredWbsIds,
    visibleActivities,
    visibleActivitiesByWbs,
    wbsChildren,
    wbsMap,
    wbsNodes,
    wbsRangeMap,
    sortDirection,
    sortKey,
    wbsDepthMap,
    wbsLevel,
  ]);

  const linkPayload = useMemo(() => {
    if (!showRelationships) return [];

    const allowed = new Set(
      visibleActivities.map((activity) => activityKey(activity))
    );

    return data.relationships
      .filter((relationship) => {
        const pred = String(
          relationship.predecessor_activity_pk || ""
        ).trim();
        const succ = String(
          relationship.successor_activity_pk || ""
        ).trim();

        return allowed.has(pred) && allowed.has(succ);
      })
      .map((relationship, index) => ({
        id:
          relationship.relationship_id ||
          `rel::${index}::${relationship.predecessor_activity_pk}::${relationship.successor_activity_pk}`,
        source: `act::${String(
          relationship.predecessor_activity_pk || ""
        ).trim()}`,
        target: `act::${String(
          relationship.successor_activity_pk || ""
        ).trim()}`,
        type: relationType(relationship.relationship_type),
        lag: relationship.lag_hours || 0,
        readonly: true,
      }));
  }, [
    data.relationships,
    showRelationships,
    visibleActivities,
  ]);

  const fullRange = useMemo(() => getProgrammeRange(data), [data]);

  const longestCount = useMemo(
    () =>
      data.activities.reduce(
        (count, activity) =>
          count + (activity.is_longest_path ? 1 : 0),
        0
      ),
    [data.activities]
  );

  const criticalCount = useMemo(
    () =>
      data.activities.reduce(
        (count, activity) =>
          count + (isCritical(activity) ? 1 : 0),
        0
      ),
    [data.activities]
  );

  const milestoneCount = useMemo(
    () =>
      data.activities.reduce(
        (count, activity) =>
          count + (milestoneKind(activity) ? 1 : 0),
        0
      ),
    [data.activities]
  );

  const configureZoom = (gantt: any, mode: ZoomMode) => {
    if (mode === "day") {
      gantt.config.scales = [
        { unit: "month", step: 1, format: "%F %Y" },
        { unit: "day", step: 1, format: "%d" },
      ];
      gantt.config.min_column_width = 32;
      return;
    }

    if (mode === "week") {
      gantt.config.scales = [
        { unit: "month", step: 1, format: "%F %Y" },
        { unit: "week", step: 1, format: "W%W" },
      ];
      gantt.config.min_column_width = 46;
      return;
    }

    if (mode === "year") {
      gantt.config.scales = [
        { unit: "year", step: 1, format: "%Y" },
        {
          unit: "quarter",
          step: 1,
          format: (date: Date) =>
            `Q${Math.floor(date.getMonth() / 3) + 1}`,
        },
      ];
      gantt.config.min_column_width = 70;
      return;
    }

    gantt.config.scales = [
      { unit: "year", step: 1, format: "%Y" },
      { unit: "month", step: 1, format: "%M" },
    ];
    gantt.config.min_column_width = 46;
  };

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let onOpen: string | null = null;
    let onCloseTask: string | null = null;

    const initialize = async () => {
      if (!ganttContainerRef.current) return;

      const dhtmlx = await import("dhtmlx-gantt");
      if (cancelled || !ganttContainerRef.current) return;

      const gantt: any = dhtmlx.gantt;
      ganttRef.current = gantt;
      setGanttLicense(String(gantt.license || "unknown"));

      try {
        gantt.clearAll();
      } catch {
        // HMR-safe.
      }

      gantt.config.readonly = true;
      gantt.config.drag_move = false;
      gantt.config.drag_resize = false;
      gantt.config.drag_progress = false;
      gantt.config.drag_links = false;
      gantt.config.details_on_dblclick = false;
      gantt.config.show_progress = false;
      gantt.config.show_unscheduled = true;

      // Community edition large-programme settings.
      // Smart rendering is DOM virtualization, not a row limit.
      gantt.config.smart_rendering = true;
      gantt.config.smart_scales = true;
      gantt.config.autosize = false;
      gantt.config.preserve_scroll = true;
      gantt.config.open_tree_initially = true;

      gantt.config.row_height = 18;
      gantt.config.task_height = 7;
      gantt.config.scale_height = 36;
      gantt.config.grid_width = 681;
      gantt.config.scroll_size = 13;
      gantt.config.show_links = showRelationships;

      configureZoom(gantt, zoom);

      if (fullRange.start && fullRange.finish) {
        gantt.config.start_date = addDays(fullRange.start, -7);
        gantt.config.end_date = addMonths(fullRange.finish, 1);
      } else {
        gantt.config.start_date = null;
        gantt.config.end_date = null;
      }

      gantt.config.columns = [
        {
          name: "activity_id",
          label: "Activity ID",
          width: 91,
          align: "left",
          resize: true,
          template: (task: GanttTask) =>
            task.row_kind === "wbs"
              ? task.wbs_code || ""
              : task.activity_id || "",
        },
        {
          name: "text",
          label: "Activity Name",
          tree: true,
          width: 295,
          align: "left",
          resize: true,
        },
        {
          name: "original_duration",
          label: "Original Duration",
          width: 90,
          align: "right",
          resize: true,
          template: (task: GanttTask) =>
            task.row_kind === "wbs"
              ? ""
              : numberText(task.original_duration_days),
        },
        {
          name: "start",
          label: "Start",
          width: 78,
          align: "center",
          resize: true,
          template: (task: GanttTask) => shortDate(task.raw_start),
        },
        {
          name: "finish",
          label: "Finish",
          width: 67,
          align: "center",
          resize: true,
          template: (task: GanttTask) => shortDate(task.raw_finish),
        },
        {
          name: "total_float",
          label: "Total Float",
          width: 60,
          align: "right",
          resize: true,
          template: (task: GanttTask) =>
            task.row_kind === "wbs"
              ? ""
              : totalFloatText(task.total_float_days),
        },
      ];

      gantt.templates.grid_row_class = (
        _start: Date,
        _end: Date,
        task: GanttTask
      ) => {
        if (task.row_kind === "wbs") {
          const level = Math.max(1, Number(task.wbs_level || 1));
          const band = Math.min(level, 4);
          return `cx-wbs-grid-row cx-wbs-level-${band}`;
        }
        if (task.is_longest_path) return "cx-longest-grid-row";
        if (task.is_critical) return "cx-critical-grid-row";
        return "";
      };

      gantt.templates.task_row_class = (
        _start: Date,
        _end: Date,
        task: GanttTask
      ) => {
        if (task.row_kind !== "wbs") return "";
        const level = Math.max(1, Number(task.wbs_level || 1));
        const band = Math.min(level, 4);
        return `cx-wbs-task-row cx-wbs-level-${band}`;
      };

      gantt.templates.task_class = (
        _start: Date,
        _end: Date,
        task: GanttTask
      ) => {
        if (task.row_kind === "wbs") {
          const level = Math.max(1, Number(task.wbs_level || 1));
          const band = Math.min(level, 4);
          return `cx-wbs-summary cx-wbs-summary-level-${band}`;
        }
        if (task.is_start_milestone)
          return "cx-milestone-task cx-start-milestone";
        if (task.is_finish_milestone)
          return "cx-milestone-task cx-finish-milestone";
        if (task.is_longest_path) return "cx-longest-task";
        if (task.is_critical) return "cx-critical-task";

        const status = String(task.status || "").toUpperCase();
        if (
          status.includes("COMPLETE") ||
          status.includes("TK_COMPLETE")
        ) {
          return "cx-complete-task";
        }

        return "cx-normal-task";
      };

      gantt.templates.task_text = (
        _start: Date,
        _end: Date,
        task: GanttTask
      ) => {
        if (
          task.row_kind === "wbs" ||
          task.is_start_milestone ||
          task.is_finish_milestone
        ) {
          return "";
        }

        return `<span class="cx-task-label">${String(
          task.activity_id || ""
        )}</span>`;
      };

      gantt.templates.tooltip_text = (
        _start: Date,
        _end: Date,
        task: GanttTask
      ) => {
        if (task.row_kind === "wbs") {
          return `<b>${task.wbs_code || ""} ${task.text || ""}</b><br/>
            Start: ${shortDate(task.raw_start)}<br/>
            Finish: ${shortDate(task.raw_finish)}`;
        }

        return `<b>${task.activity_id || ""} - ${task.text || ""}</b><br/>
          Start: ${shortDate(task.raw_start)}<br/>
          Finish: ${shortDate(task.raw_finish)}<br/>
          Original Duration: ${numberText(task.original_duration_days)} d<br/>
          Total Float: ${totalFloatText(task.total_float_days)} d`;
      };

      gantt.init(ganttContainerRef.current);

      onOpen = gantt.attachEvent(
        "onTaskOpened",
        (id: string | number) => {
          openStateRef.current.set(String(id), true);
          return true;
        }
      );

      onCloseTask = gantt.attachEvent(
        "onTaskClosed",
        (id: string | number) => {
          openStateRef.current.set(String(id), false);
          return true;
        }
      );

      const payload = {
        data: taskPayload,
        links: linkPayload,
      };

      if (typeof gantt.batchUpdate === "function") {
        gantt.batchUpdate(() => {
          gantt.clearAll();
          gantt.parse(payload);
        });
      } else {
        gantt.clearAll();
        gantt.parse(payload);
      }

      // Hard runtime reconciliation. This does not limit rows; it warns if
      // DHTMLX has not loaded the full logical tree.
      const expectedRows = taskPayload.length;
      let loadedRows: number | null = null;

      try {
        if (typeof gantt.getTaskCount === "function") {
          loadedRows = gantt.getTaskCount();
        }
      } catch {
        loadedRows = null;
      }

      console.info("[ContractX Programme Viewer]", {
        sourceActivities: data.activities.length,
        sourceWbsNodes: wbsNodes.length,
        expectedLogicalRows: expectedRows,
        dhtmlxLoadedRows: loadedRows,
        relationships: linkPayload.length,
      });

      if (
        loadedRows !== null &&
        loadedRows !== expectedRows
      ) {
        console.error(
          `[ContractX Programme Viewer] DHTMLX row reconciliation failed: expected ${expectedRows}, loaded ${loadedRows}.`
        );
      }

      if (
        showBaseline &&
        baselineData &&
        typeof gantt.addTaskLayer === "function"
      ) {
        baselineLayerIdRef.current = gantt.addTaskLayer(
          (task: GanttTask) => {
            if (
              task.row_kind !== "activity" ||
              !(task.baseline_start instanceof Date) ||
              !(task.baseline_end instanceof Date)
            ) {
              return false;
            }

            const sizes = gantt.getTaskPosition(
              task,
              task.baseline_start,
              task.baseline_end
            );

            if (!sizes) return false;

            const element = document.createElement("div");
            element.className = "cx-baseline-bar";
            element.style.left = `${sizes.left}px`;
            element.style.top = `${sizes.top + 12}px`;
            element.style.width = `${Math.max(sizes.width, 3)}px`;
            return element;
          }
        );
      }

      gantt.render();

      resizeObserver = new ResizeObserver(() => {
        try {
          gantt.setSizes();
        } catch {
          // Ignore resize during unmount.
        }
      });

      if (rootRef.current) {
        resizeObserver.observe(rootRef.current);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();

      const gantt = ganttRef.current;
      if (!gantt) return;

      try {
        if (onOpen) gantt.detachEvent(onOpen);
        if (onCloseTask) gantt.detachEvent(onCloseTask);
      } catch {
        // HMR-safe.
      }

      try {
        if (
          baselineLayerIdRef.current !== null &&
          typeof gantt.removeTaskLayer === "function"
        ) {
          gantt.removeTaskLayer(baselineLayerIdRef.current);
        }
      } catch {
        // HMR-safe.
      }

      baselineLayerIdRef.current = null;

      try {
        gantt.clearAll();
      } catch {
        // HMR-safe.
      }
    };
  }, [
    baselineData,
    data.activities.length,
    fullRange.finish,
    fullRange.start,
    linkPayload,
    showBaseline,
    showRelationships,
    taskPayload,
    wbsNodes.length,
    zoom,
  ]);

  const zoomIn = () => {
    setZoom((current) => {
      const index = ZOOM_LEVELS.indexOf(current);
      return ZOOM_LEVELS[
        Math.min(index + 1, ZOOM_LEVELS.length - 1)
      ];
    });
  };

  const zoomOut = () => {
    setZoom((current) => {
      const index = ZOOM_LEVELS.indexOf(current);
      return ZOOM_LEVELS[Math.max(index - 1, 0)];
    });
  };

  const applyWbsLevel = (level: WbsLevel) => {
    setWbsLevel(level);

    const gantt = ganttRef.current;
    if (!gantt) return;

    gantt.eachTask((task: GanttTask) => {
      if (task.row_kind !== "wbs") return;

      const nodeId = String(task.wbs_id || "").trim();
      const depth = wbsDepthMap.get(nodeId) ?? 1;

      // P6-style level behaviour:
      // Level 1 -> show top-level WBS only.
      // Level 2 -> open Level 1 so Level 2 is visible.
      // Level 3 -> open Levels 1-2 so Level 3 is visible.
      // All     -> open every WBS node and expose its activities.
      const shouldOpen =
        level === "all" || depth < Number(level);

      if (shouldOpen) {
        gantt.open(task.id);
      } else {
        gantt.close(task.id);
      }

      openStateRef.current.set(String(task.id), shouldOpen);
    });

    gantt.render();
  };

  const prepareP6Print = () => {
    const gantt = ganttRef.current;
    const container = ganttContainerRef.current;
    if (!gantt || !container || printRestoreRef.current) return;

    const shell = container.parentElement as HTMLDivElement | null;

    printRestoreRef.current = {
      smartRendering: Boolean(gantt.config.smart_rendering),
      autosize: gantt.config.autosize,
      containerHeight: container.style.height,
      containerOverflow: container.style.overflow,
      shellHeight: shell?.style.height || "",
      shellOverflow: shell?.style.overflow || "",
      startDate: gantt.config.start_date
        ? new Date(gantt.config.start_date)
        : null,
      endDate: gantt.config.end_date
        ? new Date(gantt.config.end_date)
        : null,
      minColumnWidth: gantt.config.min_column_width,
    };

    // Browser printing must materialize every currently-visible logical row.
    // This is a temporary print-only change; interactive smart rendering is
    // restored immediately after printing.
    gantt.config.smart_rendering = false;
    gantt.config.autosize = "y";

    // PDF PRINT DEFAULT: fit the complete programme timeline into the
    // available Gantt width without changing the locked interactive viewer.
    if (fullRange.start && fullRange.finish) {
      gantt.config.start_date = addDays(fullRange.start, -7);
      gantt.config.end_date = addDays(fullRange.finish, 14);
      gantt.config.min_column_width = 14;
    }

    const visibleRows =
      typeof gantt.getVisibleTaskCount === "function"
        ? gantt.getVisibleTaskCount()
        : taskPayload.length;

    const printHeight =
      Math.max(1, Number(visibleRows || taskPayload.length)) *
        Number(gantt.config.row_height || 18) +
      Number(gantt.config.scale_height || 36) +
      12;

    // DHTMLX is normally absolutely positioned inside a flex child. During
    // printing the parent therefore needs the same explicit height or the
    // browser sees an empty/collapsed schedule region.
    container.style.height = `${printHeight}px`;
    container.style.overflow = "visible";

    if (shell) {
      shell.style.height = `${printHeight}px`;
      shell.style.overflow = "visible";
    }

    try {
      gantt.setSizes();
      gantt.render();
    } catch {
      // Printing should still proceed even if the grid is already unmounting.
    }
  };

  const restoreAfterP6Print = () => {
    const gantt = ganttRef.current;
    const container = ganttContainerRef.current;
    const restore = printRestoreRef.current;

    if (!gantt || !container || !restore) return;

    const shell = container.parentElement as HTMLDivElement | null;

    gantt.config.smart_rendering = restore.smartRendering;
    gantt.config.autosize = restore.autosize;

    if (restore.startDate) gantt.config.start_date = restore.startDate;
    if (restore.endDate) gantt.config.end_date = restore.endDate;
    if (restore.minColumnWidth !== undefined) {
      gantt.config.min_column_width = restore.minColumnWidth;
    }

    container.style.height = restore.containerHeight;
    container.style.overflow = restore.containerOverflow;

    if (shell) {
      shell.style.height = restore.shellHeight;
      shell.style.overflow = restore.shellOverflow;
    }

    printRestoreRef.current = null;

    try {
      gantt.setSizes();
      gantt.render();
    } catch {
      // HMR/unmount safe.
    }
  };

  const printP6Programme = () => {
    prepareP6Print();

    // Give DHTMLX one frame to lay out all visible rows before the browser
    // captures the print tree.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  const fitProgramme = () => {
    const gantt = ganttRef.current;
    if (!gantt) return;

    try {
      if (gantt.ext?.zoom?.zoomToFit) {
        gantt.ext.zoom.zoomToFit();
        return;
      }
    } catch {
      // Fall through to deterministic full-range fit.
    }

    if (fullRange.start && fullRange.finish) {
      gantt.config.start_date = addDays(fullRange.start, -7);
      gantt.config.end_date = addMonths(fullRange.finish, 1);
      gantt.render();
    }
  };

  const reset = () => {
    setFilterMode("all");
    setSearchText("");
    setWbsFilter("all");
    setSortKey("p6");
    setSortDirection("asc");
    setWbsLevel("all");
    openStateRef.current.clear();
  };

  useEffect(() => {
    const beforePrint = () => prepareP6Print();
    const afterPrint = () => restoreAfterP6Print();

    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);

    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [taskPayload]);

  return (
    <div
      ref={rootRef}
      data-theme={theme}
      className={cx(
        "cx-p6-viewer flex h-[clamp(680px,calc(100dvh-135px),1050px)] min-w-0 flex-col overflow-hidden rounded-lg border",
        theme === "dark"
          ? "border-slate-700 bg-[#17202a] text-slate-100"
          : "border-slate-200 bg-white text-slate-900"
      )}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .cx-p6-viewer .gantt_container {
            border: 0 !important;
            font-family: Arial, "Segoe UI", sans-serif;
            font-variant-numeric: tabular-nums;
          }

          .cx-p6-viewer .gantt_grid_scale,
          .cx-p6-viewer .gantt_task_scale {
            background: #e9edf2;
            border-color: #aeb8c4;
          }

          .cx-p6-viewer .gantt_grid_head_cell,
          .cx-p6-viewer .gantt_scale_cell {
            color: #202a35;
            font-size: 9px;
            font-weight: 700;
            line-height: 18px;
            border-color: #aeb8c4;
          }

          .cx-p6-viewer .gantt_row,
          .cx-p6-viewer .gantt_task_row {
            background: #ffffff;
            border-color: #e5e9ef;
          }

          .cx-p6-viewer .gantt_row:nth-child(even),
          .cx-p6-viewer .gantt_task_row:nth-child(even) {
            background: #fbfcfd;
          }

          .cx-p6-viewer .gantt_grid_data .gantt_cell {
            color: #1f2933;
            font-size: 9.5px;
            line-height: 18px;
            border-color: #d8dde4;
            padding-left: 3px;
            padding-right: 3px;
          }

          .cx-p6-viewer .gantt_tree_content {
            color: #1f2937;
            font-size: 9.5px;
            line-height: 18px;
          }

          /* Primavera-like compact hierarchy indentation. */
          .cx-p6-viewer .gantt_tree_indent,
          .cx-p6-viewer .gantt_tree_icon {
            width: 14px !important;
            min-width: 14px !important;
          }

          .cx-p6-viewer .gantt_tree_icon {
            line-height: 18px !important;
          }

          .cx-p6-viewer .gantt_task_cell {
            border-color: #edf0f4;
          }

          .cx-p6-viewer .gantt_task_line {
            overflow: visible !important;
            border-radius: 0;
            box-shadow: none;
            border-width: 1px;
          }

          /* P6-style WBS level banding.
             Level 1 is strongest; each deeper level steps lighter while keeping
             the WBS summary bar visually tied to its grid row. Level 4 is also
             used for any level deeper than 4 to avoid an uncontrolled palette. */
          .cx-p6-viewer .cx-wbs-level-1 {
            background: #9fbad0 !important;
          }

          .cx-p6-viewer .cx-wbs-level-2 {
            background: #bfd0df !important;
          }

          .cx-p6-viewer .cx-wbs-level-3 {
            background: #d8e3ec !important;
          }

          .cx-p6-viewer .cx-wbs-level-4 {
            background: #edf2f6 !important;
          }

          .cx-p6-viewer .cx-wbs-grid-row .gantt_cell,
          .cx-p6-viewer .cx-wbs-grid-row .gantt_tree_content {
            font-weight: 700 !important;
          }

          .cx-p6-viewer .cx-wbs-grid-row.cx-wbs-level-1 .gantt_cell,
          .cx-p6-viewer .cx-wbs-grid-row.cx-wbs-level-1 .gantt_tree_content {
            color: #0b2e4f !important;
          }

          .cx-p6-viewer .cx-wbs-grid-row.cx-wbs-level-2 .gantt_cell,
          .cx-p6-viewer .cx-wbs-grid-row.cx-wbs-level-2 .gantt_tree_content {
            color: #17365d !important;
          }

          .cx-p6-viewer .cx-wbs-grid-row.cx-wbs-level-3 .gantt_cell,
          .cx-p6-viewer .cx-wbs-grid-row.cx-wbs-level-3 .gantt_tree_content {
            color: #234b6f !important;
          }

          .cx-p6-viewer .cx-wbs-grid-row.cx-wbs-level-4 .gantt_cell,
          .cx-p6-viewer .cx-wbs-grid-row.cx-wbs-level-4 .gantt_tree_content {
            color: #365c78 !important;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary {
            height: 5px !important;
            margin-top: 1px;
            border-width: 1px !important;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-1 {
            background: #244d70 !important;
            border-color: #17365d !important;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-2 {
            background: #4f81a8 !important;
            border-color: #385d7a !important;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-3 {
            background: #7fa6c3 !important;
            border-color: #5f829d !important;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-4 {
            background: #a9bfd0 !important;
            border-color: #7f9aae !important;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary::before,
          .cx-p6-viewer .gantt_task_line.cx-wbs-summary::after {
            content: "";
            position: absolute;
            top: 4px;
            width: 1px;
            height: 4px;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-1::before,
          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-1::after {
            background: #17365d;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-2::before,
          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-2::after {
            background: #385d7a;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-3::before,
          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-3::after {
            background: #5f829d;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-4::before,
          .cx-p6-viewer .gantt_task_line.cx-wbs-summary-level-4::after {
            background: #7f9aae;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary::before {
            left: -1px;
          }

          .cx-p6-viewer .gantt_task_line.cx-wbs-summary::after {
            right: -1px;
          }

          .cx-p6-viewer .gantt_task_line.cx-normal-task {
            height: 7px !important;
            background: #00a651;
            border-color: #00783b;
          }

          .cx-p6-viewer .gantt_task_line.cx-complete-task {
            height: 7px !important;
            background: #1f4e79;
            border-color: #17365d;
          }

          .cx-p6-viewer .gantt_task_line.cx-critical-task {
            height: 7px !important;
            background: #d7191c;
            border-color: #9f1012;
          }

          .cx-p6-viewer .gantt_task_line.cx-longest-task {
            height: 7px !important;
            background: #a50f15;
            border-color: #7f0b0f;
          }

          /* Community-edition milestone emulation */
          .cx-p6-viewer .gantt_task_line.cx-milestone-task {
            width: 9px !important;
            min-width: 9px !important;
            height: 9px !important;
            margin-top: 1px !important;
            border-radius: 0 !important;
            transform: rotate(45deg);
            transform-origin: center center;
          }

          .cx-p6-viewer .gantt_task_line.cx-start-milestone {
            background: #7030a0 !important;
            border-color: #542478 !important;
          }

          .cx-p6-viewer .gantt_task_line.cx-finish-milestone {
            background: #d7191c !important;
            border-color: #a50f15 !important;
          }

          .cx-p6-viewer .cx-task-label {
            display: block;
            overflow: hidden;
            padding: 0 2px;
            color: #ffffff;
            font-size: 7px;
            line-height: 7px;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .cx-p6-viewer .cx-baseline-bar {
            position: absolute;
            height: 2px;
            min-width: 3px;
            border: 0;
            border-top: 2px solid #d6a400;
            background: transparent;
            pointer-events: none;
            opacity: 0.95;
            z-index: 5;
          }

          .cx-p6-viewer .gantt_link_line_right,
          .cx-p6-viewer .gantt_link_line_left,
          .cx-p6-viewer .gantt_link_line_up,
          .cx-p6-viewer .gantt_link_line_down {
            background-color: #7b8794;
          }

          .cx-p6-viewer .gantt_task_link .gantt_link_arrow {
            border-left-color: #7b8794;
          }

          .cx-p6-viewer .gantt_row:hover,
          .cx-p6-viewer .gantt_task_row:hover {
            background: #eef4fb !important;
          }

          .cx-p6-viewer .gantt_selected .gantt_cell,
          .cx-p6-viewer .gantt_task_row.gantt_selected {
            background: #dbeafe !important;
          }

          .cx-print-only {
            display: none;
          }

          @media print {
            @page {
              size: A3 landscape;
              margin: 7mm;
            }

            html,
            body {
              width: 100% !important;
              height: auto !important;
              overflow: visible !important;
              background: #ffffff !important;
            }

            body * {
              visibility: hidden !important;
            }

            .cx-p6-viewer,
            .cx-p6-viewer * {
              visibility: visible !important;
            }

            .cx-p6-viewer {
              position: absolute !important;
              inset: 0 auto auto 0 !important;
              width: 100% !important;
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              border: 0 !important;
              border-radius: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
            }

            .cx-print-hide {
              display: none !important;
            }

            .cx-print-only {
              display: block !important;
            }

            /*
             * Do NOT force DHTMLX internal layout cells to height:auto here.
             * DHTMLX calculates pixel heights/positions for rows, bars and the
             * timeline. Overriding those heights collapses the schedule in the
             * browser print tree and leaves only the ContractX summary/header.
             */
            .cx-p6-viewer .cx-gantt-shell {
              position: relative !important;
              display: block !important;
              flex: none !important;
              min-height: 0 !important;
              max-height: none !important;
              overflow: visible !important;
            }

            .cx-p6-viewer .cx-gantt-host {
              position: relative !important;
              inset: auto !important;
              width: 100% !important;
              max-height: none !important;
              overflow: visible !important;
            }

            .cx-p6-viewer .gantt_container {
              display: block !important;
              width: 100% !important;
              max-height: none !important;
              overflow: visible !important;
            }

            .cx-p6-viewer .gantt_grid_scale,
            .cx-p6-viewer .gantt_task_scale {
              background: #e9edf2 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .cx-p6-viewer .gantt_row,
            .cx-p6-viewer .gantt_task_row,
            .cx-p6-viewer .gantt_task_line,
            .cx-p6-viewer .cx-baseline-bar {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              break-inside: avoid;
            }

            .cx-p6-viewer .gantt_grid_head_cell,
            .cx-p6-viewer .gantt_scale_cell {
              font-size: 8px !important;
            }

            .cx-p6-viewer .gantt_grid_data .gantt_cell,
            .cx-p6-viewer .gantt_tree_content {
              font-size: 8.5px !important;
            }
          }
        `,
        }}
      />

      <div className="cx-print-only hidden border-b border-slate-400 bg-white px-2 py-1 text-black">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[12px] font-bold leading-tight">
              {data.programme_title}
            </div>
            <div className="mt-0.5 text-[8px] leading-tight">
              Primavera P6-style Programme Viewer · Read-only source XER schedule · Timeline fitted for PDF
            </div>
          </div>
          <div className="text-right text-[8px] leading-tight">
            <div>
              Data Date: {data.data_date ? longDate(data.data_date) : "—"}
            </div>
            <div>
              Programme: {longDate(data.programme_start)} –{" "}
              {longDate(data.programme_finish)}
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-900">
              {data.programme_title}
            </div>

            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
              <span>
                Data Date: <strong>{longDate(data.data_date)}</strong>
              </span>
              <span>
                Start:{" "}
                <strong>
                  {fullRange.start
                    ? longDate(fullRange.start.toISOString())
                    : "—"}
                </strong>
              </span>
              <span>
                Finish:{" "}
                <strong>
                  {fullRange.finish
                    ? longDate(fullRange.finish.toISOString())
                    : "—"}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <SummaryBadge
              label="Activities"
              value={`${data.activities.length.toLocaleString()} / ${data.activity_count.toLocaleString()}`}
              warning={!sourceActivityIntegrity}
            />
            <SummaryBadge
              label="WBS"
              value={wbsNodes.length.toLocaleString()}
            />
            <SummaryBadge
              label="Logical Rows"
              value={taskPayload.length.toLocaleString()}
            />
            <SummaryBadge
              label="Relationships"
              value={`${data.relationships.length.toLocaleString()} / ${data.relationship_count.toLocaleString()}`}
              warning={!sourceRelationshipIntegrity}
            />
            <SummaryBadge
              label="Longest Path"
              value={longestCount.toLocaleString()}
            />
            <SummaryBadge
              label="Critical"
              value={criticalCount.toLocaleString()}
            />
            <SummaryBadge
              label="Milestones"
              value={milestoneCount.toLocaleString()}
            />
          </div>
        </div>

        {(!sourceActivityIntegrity ||
          !sourceRelationshipIntegrity ||
          (data.viewer_metadata?.blank_activity_pk_count || 0) > 0 ||
          data.viewer_metadata?.engine_recalculation_warning) && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-900">
            {!sourceActivityIntegrity && (
              <span className="mr-4">
                Activity payload mismatch: API declares{" "}
                {data.activity_count.toLocaleString()} but returned{" "}
                {data.activities.length.toLocaleString()}.
              </span>
            )}

            {!sourceRelationshipIntegrity && (
              <span className="mr-4">
                Relationship payload mismatch: API declares{" "}
                {data.relationship_count.toLocaleString()} but returned{" "}
                {data.relationships.length.toLocaleString()}.
              </span>
            )}

            {(data.viewer_metadata?.blank_activity_pk_count || 0) > 0 && (
              <span className="mr-4">
                {String(data.viewer_metadata?.blank_activity_pk_count)} source
                TASK row(s) have no activity PK.
              </span>
            )}

            {data.viewer_metadata?.engine_recalculation_warning && (
              <span>
                Engine 2 diagnostic:{" "}
                {String(
                  data.viewer_metadata.engine_recalculation_warning
                )}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="cx-print-hide flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#f7f9fb] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded border border-slate-300 bg-white text-xs">
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={cx(
                "px-3 py-1.5",
                filterMode === "all"
                  ? "bg-slate-200 font-semibold text-slate-900"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              Full Programme
            </button>

            <button
              type="button"
              onClick={() => setFilterMode("longest")}
              className={cx(
                "border-l border-slate-200 px-3 py-1.5",
                filterMode === "longest"
                  ? "bg-red-50 font-semibold text-red-700"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              Longest Path
            </button>

            <button
              type="button"
              onClick={() => setFilterMode("critical")}
              className={cx(
                "border-l border-slate-200 px-3 py-1.5",
                filterMode === "critical"
                  ? "bg-orange-50 font-semibold text-orange-700"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              Critical
            </button>
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className={cx(
              "flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold",
              filtersOpen || searchText
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-300 bg-white text-slate-600"
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
          </button>

          <button
            type="button"
            onClick={() => setShowBaseline((value) => !value)}
            disabled={!baselineData}
            className={cx(
              "flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold",
              showBaseline && baselineData
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "border-slate-300 bg-white text-slate-600",
              !baselineData && "cursor-not-allowed opacity-40"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Baseline {showBaseline && baselineData ? "On" : "Off"}
          </button>

          <button
            type="button"
            onClick={() =>
              setShowRelationships((value) => !value)
            }
            className={cx(
              "flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold",
              showRelationships
                ? "border-slate-400 bg-slate-100 text-slate-800"
                : "border-slate-300 bg-white text-slate-500"
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Relationships {showRelationships ? "On" : "Off"}
          </button>

          <select
            value={sortKey}
            onChange={(event) =>
              setSortKey(event.target.value as SortKey)
            }
            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
            title="Sort activities within each WBS while preserving the WBS tree"
          >
            <option value="p6">Sort: P6 / WBS Order</option>
            <option value="wbs">Sort: WBS Code</option>
            <option value="activity_id">Sort: Activity ID</option>
            <option value="name">Sort: Activity Name</option>
            <option value="duration">Sort: Original Duration</option>
            <option value="start">Sort: Start</option>
            <option value="finish">Sort: Finish</option>
            <option value="float">Sort: Total Float</option>
          </select>

          <button
            type="button"
            onClick={() =>
              setSortDirection((value) =>
                value === "asc" ? "desc" : "asc"
              )
            }
            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
            title="Toggle ascending / descending"
          >
            {sortDirection === "asc" ? "Ascending ↑" : "Descending ↓"}
          </button>

          <select
            value={wbsLevel}
            onChange={(event) =>
              applyWbsLevel(event.target.value as WbsLevel)
            }
            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
            title="Set the visible P6 WBS hierarchy depth"
          >
            <option value="1">WBS Level: 1</option>
            <option value="2">WBS Level: 2</option>
            <option value="3">WBS Level: 3</option>
            <option value="all">WBS Level: All</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-slate-300 bg-white">
            <button
              type="button"
              onClick={zoomOut}
              className="px-2 py-1.5 text-slate-500 hover:bg-slate-50"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>

            <span className="min-w-[62px] border-x border-slate-200 px-2 py-1.5 text-center text-[9px] font-bold uppercase text-slate-500">
              {zoom}
            </span>

            <button
              type="button"
              onClick={zoomIn}
              className="px-2 py-1.5 text-slate-500 hover:bg-slate-50"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={printP6Programme}
            className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="cx-print-hide grid grid-cols-1 gap-2 border-b border-slate-200 bg-white px-3 py-2 lg:grid-cols-[minmax(260px,1fr)_190px_260px_auto]">
          <label className="relative min-w-0">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search Activity ID, Activity Name, WBS, status, type or calendar..."
              className="w-full rounded border border-slate-300 bg-white py-2 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-blue-400"
            />
          </label>

          <select
            value={filterMode}
            onChange={(event) =>
              setFilterMode(event.target.value as FilterMode)
            }
            className="rounded border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700"
          >
            <option value="all">Filter: All Activities</option>
            <option value="longest">Filter: Longest Path</option>
            <option value="critical">Filter: Critical</option>
            <option value="milestones">Filter: Milestones</option>
            <option value="loe">Filter: Level of Effort</option>
            <option value="not_started">Filter: Not Started</option>
            <option value="in_progress">Filter: In Progress</option>
            <option value="completed">Filter: Completed</option>
          </select>

          <select
            value={wbsFilter}
            onChange={(event) => setWbsFilter(event.target.value)}
            className="min-w-0 rounded border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700"
            title="Filter to a WBS branch and all of its descendants"
          >
            <option value="all">WBS: All</option>
            {wbsNodes.map((node) => (
              <option key={node.wbs_id} value={String(node.wbs_id)}>
                {node.wbs_code || node.wbs_name || node.wbs_id}
                {node.wbs_code && node.wbs_name
                  ? ` — ${node.wbs_name}`
                  : ""}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={reset}
            className="flex items-center justify-center gap-1.5 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      )}

      <div className="cx-print-hide flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-500">
        <div>
          <strong className="text-slate-700">
            {visibleActivities.length.toLocaleString()}
          </strong>{" "}
          activities displayed from{" "}
          <strong className="text-slate-700">
            {data.activities.length.toLocaleString()}
          </strong>{" "}
          source activities ·{" "}
          <strong className="text-slate-700">
            {taskPayload.length.toLocaleString()}
          </strong>{" "}
          logical rows including WBS. · Filter:{" "}
          <strong className="text-slate-700">{filterMode}</strong> · Sort:{" "}
          <strong className="text-slate-700">
            {sortKey} {sortDirection}
          </strong>{" "}
          · WBS:{" "}
          <strong className="text-slate-700">
            {wbsLevel === "all" ? "All Levels" : `Level ${wbsLevel}`}
          </strong>
        </div>

        <div>
          Rendering:{" "}
          <strong className="text-emerald-700">
            Community smart rendering / no row cap
          </strong>
        </div>
      </div>

      <div className="cx-gantt-shell relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          ref={ganttContainerRef}
          className="cx-gantt-host absolute inset-0 h-full w-full"
        />
      </div>

      <div className="cx-print-hide flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-[#f7f9fb] px-3 py-2 text-[10px] text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <LegendBar color="#4f81bd" label="WBS Summary" />
          <LegendBar color="#00a651" label="Remaining / Normal" />
          <LegendBar color="#1f4e79" label="Completed / Actual" />
          <LegendBar color="#ef6c00" label="Critical" />
          <LegendBar color="#d7191c" label="Longest Path / Finish Milestone" />
          <LegendBar color="#ffd966" label="Baseline" thin />
        </div>

        <div className="text-right">
          <div>
            Model: {data.activities.length.toLocaleString()} activities ·{" "}
            {wbsNodes.length.toLocaleString()} WBS ·{" "}
            {data.relationships.length.toLocaleString()} relationships
          </div>
          <div className="mt-0.5 text-[9px] text-slate-400">
            License notice: ContractX viewer — MIT (SPDX: MIT; no version number).
            DHTMLX Gantt Community v10+ — MIT; runtime license:{" "}
            <strong className="font-semibold text-slate-500">
              {ganttLicense}
            </strong>
            . React — MIT. Lucide Icons — ISC / Feather portions MIT.
            WBS Level control follows hierarchical PROJWBS parent/code structure.
            Print layout uses A3 landscape, the current filter/WBS level, all visible rows, and automatically fits the complete programme timeline to the PDF view.
          </div>
        </div>
      </div>

      <div className="cx-print-only hidden border-t border-slate-400 bg-white px-2 py-1 text-[7.5px] leading-tight text-slate-700">
        <div className="flex items-start justify-between gap-6">
          <div className="font-semibold">
            ContractX.co · Programme Viewer
          </div>
          <div className="max-w-[78%] text-right">
            <strong>Viewer Disclaimer:</strong> This output is provided for
            read-only schedule viewing and visual review requirements only. It
            does not constitute a contractual determination, forensic delay
            analysis, entitlement assessment, responsibility allocation,
            excusability or compensability finding, concurrency determination,
            damages assessment, or legal opinion. Source programme data remains
            authoritative.
          </div>
        </div>
      </div>
    </div>
  );
}