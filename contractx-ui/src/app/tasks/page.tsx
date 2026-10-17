"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import ContractXNotificationBell from "@/components/ContractXNotificationBell";
import ContractXNoticeModal from "@/components/ContractXNoticeModal";
import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";
import { createClient } from "@/lib/supabase/client";

import LegalFooter from "@/components/LegalFooter";

import { useActiveProject } from "@/hooks/useActiveProject";

type Theme = "dark" | "light";

type TaskStatus = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";

type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type TaskCategory =

  | "GENERAL"

  | "CONTRACT"

  | "CLAIMS"

  | "DELAY"

  | "DOCUMENTS"

  | "COMMERCIAL"

  | "LEGAL";

type ProjectMember = {

  user_id: string;

  full_name: string;

  job_title?: string | null;

  project_role?: string | null;

};

type TaskRecord = {

  id: string;

  tenant_id: string;

  project_id: string;

  title: string;

  description?: string | null;

  status: TaskStatus;

  priority: TaskPriority;

  category: TaskCategory;

  owner?: string | null;

  due_date?: string | null;

  linked_module?: string | null;

  linked_record_id?: string | null;

  assigned_by?: string | null;

  assigned_to?: string | null;

  assignee_name?: string | null;

  assignee_job_title?: string | null;

  resolution_note?: string | null;

  created_at?: string | null;

  updated_at?: string | null;

  completed_at?: string | null;

  is_pinned?: boolean;

};

type TaskSummary = {

  total: number;

  open: number;

  in_progress: number;

  blocked: number;

  completed: number;

  cancelled: number;

  closed: number;

  overdue: number;

  due_today: number;

  due_7_days: number;

  critical: number;

  priority?: {

    critical?: number;

    high?: number;

    medium?: number;

    low?: number;

  };

};

const API = "/api/contractx";

const STATUS_OPTIONS: TaskStatus[] = [

  "OPEN",

  "IN_PROGRESS",

  "BLOCKED",

  "COMPLETED",

  "CANCELLED",

];

const PRIORITY_OPTIONS: TaskPriority[] = [

  "LOW",

  "MEDIUM",

  "HIGH",

  "CRITICAL",

];

const CATEGORY_OPTIONS: TaskCategory[] = [

  "GENERAL",

  "CONTRACT",

  "CLAIMS",

  "DELAY",

  "DOCUMENTS",

  "COMMERCIAL",

  "LEGAL",

];

const MODULE_OPTIONS = [

  "Dashboard",

  "Ask ContractX",

  "Bespoke Review",

  "Delay Analysis",

  "Claims & Resolution",

  "Documents",

];

function cx(...values: Array<string | false | null | undefined>) {

  return values.filter(Boolean).join(" ");

}

function pretty(value?: string | null) {

  return String(value || "")

    .replaceAll("_", " ")

    .toLowerCase()

    .replace(/\b\w/g, (m) => m.toUpperCase());

}

function formatTaskTimestamp(value?: string | null) {

  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {

    return String(value);

  }

  return new Intl.DateTimeFormat("en-SG", {

    day: "2-digit",

    month: "short",

    year: "numeric",

    hour: "2-digit",

    minute: "2-digit",

    hour12: true,

    timeZone: "Asia/Singapore",

  }).format(date);

}

function wasTaskEdited(task: TaskRecord) {

  if (!task.created_at || !task.updated_at) return false;

  const created = new Date(task.created_at).getTime();

  const updated = new Date(task.updated_at).getTime();

  if (Number.isNaN(created) || Number.isNaN(updated)) return false;

  // Ignore database precision differences at creation time.

  return updated - created > 1000;

}

function isOverdue(task: TaskRecord) {

  if (!task.due_date || ["COMPLETED", "CANCELLED"].includes(task.status)) {

    return false;

  }

  return new Date(`${task.due_date}T23:59:59`).getTime() < Date.now();

}

function Badge({

  children,

  tone = "neutral",

}: {

  children: React.ReactNode;

  tone?: "neutral" | "green" | "amber" | "red" | "blue" | "gold";

}) {

  const tones = {

    neutral: "border-[var(--cx-border)] bg-[var(--cx-soft)] text-[var(--cx-muted)]",

    green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-500",

    amber: "border-amber-400/25 bg-amber-400/10 text-amber-500",

    red: "border-rose-400/25 bg-rose-400/10 text-rose-500",

    blue: "border-sky-400/25 bg-sky-400/10 text-sky-500",

    gold: "border-[#D8A84E]/35 bg-[#D8A84E]/10 text-[#B98224]",

  };

  return (

    <span

      className={cx(

        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]",

        tones[tone]

      )}

    >

      {children}

    </span>

  );

}

function DonutChart({

  summary,

}: {

  summary: TaskSummary;

}) {

  const items = [

    ["Open", summary.open, "var(--chart-1)"],

    ["In Progress", summary.in_progress, "var(--chart-2)"],

    ["Blocked", summary.blocked, "var(--chart-3)"],

    ["Completed", summary.completed, "var(--chart-4)"],

  ] as const;

  const total = Math.max(

    1,

    items.reduce((sum, [, value]) => sum + Number(value || 0), 0)

  );

  let offset = 0;

  return (

    <div className="flex flex-col items-center gap-4 sm:flex-row">

      <svg viewBox="0 0 42 42" className="h-36 w-36 -rotate-90">

        <circle

          cx="21"

          cy="21"

          r="15.9155"

          fill="transparent"

          stroke="var(--cx-chart-track)"

          strokeWidth="5"

        />

        {items.map(([label, value, color]) => {

          const pct = (Number(value || 0) / total) * 100;

          const dashOffset = -offset;

          offset += pct;

          return (

            <circle

              key={label}

              cx="21"

              cy="21"

              r="15.9155"

              fill="transparent"

              stroke={color}

              strokeWidth="5"

              strokeDasharray={`${pct} ${100 - pct}`}

              strokeDashoffset={dashOffset}

            />

          );

        })}

      </svg>

      <div className="w-full space-y-2">

        {items.map(([label, value, color]) => (

          <div

            key={label}

            className="flex items-center justify-between gap-4 text-xs"

          >

            <div className="flex items-center gap-2 text-[var(--cx-muted)]">

              <span

                className="h-2.5 w-2.5 rounded-full"

                style={{ background: color }}

              />

              {label}

            </div>

            <span className="font-semibold text-[var(--cx-text)]">{value}</span>

          </div>

        ))}

      </div>

    </div>

  );

}

function PriorityBars({

  summary,

}: {

  summary: TaskSummary;

}) {

  const rows = [

    ["Critical", summary.priority?.critical || 0],

    ["High", summary.priority?.high || 0],

    ["Medium", summary.priority?.medium || 0],

    ["Low", summary.priority?.low || 0],

  ];

  const max = Math.max(1, ...rows.map(([, value]) => Number(value)));

  return (

    <div className="space-y-3">

      {rows.map(([label, value]) => (

        <div key={String(label)}>

          <div className="mb-1 flex items-center justify-between text-[10px]">

            <span className="text-[var(--cx-muted)]">{label}</span>

            <span className="font-semibold text-[var(--cx-text)]">{value}</span>

          </div>

          <div className="h-2 overflow-hidden rounded-full bg-[var(--cx-soft)]">

            <div

              className="h-full rounded-full bg-[#D8A84E]"

              style={{ width: `${(Number(value) / max) * 100}%` }}

            />

          </div>

        </div>

      ))}

    </div>

  );

}

export default function TasksPage() {
  const supabase = useMemo(() => createClient(), []);

  const [theme, setTheme] = useState<Theme>("dark");

  const dueDateInputRef = useRef<HTMLInputElement | null>(null);

  const {

    projectId,

    project,

    tenantId,

    loading: projectLoading,

    error: projectError,

  } = useActiveProject();

  const [members, setMembers] = useState<ProjectMember[]>([]);

  const [currentUserId, setCurrentUserId] = useState("");

  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  const [summary, setSummary] = useState<TaskSummary>({

    total: 0,

    open: 0,

    in_progress: 0,

    blocked: 0,

    completed: 0,

    cancelled: 0,

    closed: 0,

    overdue: 0,

    due_today: 0,

    due_7_days: 0,

    critical: 0,

    priority: {

      critical: 0,

      high: 0,

      medium: 0,

      low: 0,

    },

  });

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");

  const [query, setQuery] = useState("");

  const [statusFilter, setStatusFilter] = useState("");

  const [priorityFilter, setPriorityFilter] = useState("");

  const [categoryFilter, setCategoryFilter] = useState("");

  const [myTasksOnly, setMyTasksOnly] = useState(false);

  const [pinnedOnly, setPinnedOnly] = useState(false);

  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const [showDashboard, setShowDashboard] = useState(false);

  const [showAdvancedTaskFields, setShowAdvancedTaskFields] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");

  const [description, setDescription] = useState("");

  const [status, setStatus] = useState<TaskStatus>("OPEN");

  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");

  const [category, setCategory] = useState<TaskCategory>("GENERAL");

  const [owner, setOwner] = useState("");

  const [dueDate, setDueDate] = useState("");

  const [assignedTo, setAssignedTo] = useState("");

  const [linkedModule, setLinkedModule] = useState("");

  const [linkedRecordId, setLinkedRecordId] = useState("");

  const [resolvingTask, setResolvingTask] = useState<TaskRecord | null>(null);

  const [resolutionNote, setResolutionNote] = useState("");

  const [resolving, setResolving] = useState(false);

  useEffect(() => {

    const saved = window.localStorage.getItem("contractx-theme");

    setTheme(saved === "light" ? "light" : "dark");

    const storedUser = window.localStorage.getItem("contractx-user-id");

    if (storedUser) setCurrentUserId(storedUser);

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

  function setTasksTheme(nextTheme: Theme) {

    setTheme(nextTheme);

    window.localStorage.setItem("contractx-theme", nextTheme);

    window.dispatchEvent(

      new CustomEvent("contractx-theme-change", {

        detail: nextTheme,

      })

    );

  }

  useEffect(() => {

    if (!message) return;

    const onKeyDown = (event: KeyboardEvent) => {

      if (event.key === "Escape") {

        setMessage("");

      }

    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);

  }, [message]);

  async function authenticatedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> {
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
  }

  async function loadMembers() {

    if (projectLoading || projectError || !tenantId || !projectId) return;

    try {

      const qs = new URLSearchParams({

        tenant_id: tenantId,

        project_id: projectId ?? "",

      });

      const response = await authenticatedFetch(`${API}/api/v1/tasks/members?${qs}`, {

        cache: "no-store",

      });

      if (!response.ok) return;

      const data = await response.json();

      const rows = Array.isArray(data.members) ? data.members : [];

      setMembers(rows);

      setCurrentUserId((current) => {

        if (current && rows.some((member: ProjectMember) => member.user_id === current)) {

          return current;

        }

        const fallback = rows[0]?.user_id || "";

        if (fallback) {

          window.localStorage.setItem("contractx-user-id", fallback);

        }

        return fallback;

      });

    } catch {

      setMembers([]);

    }

  }

  async function loadTasks() {

    if (projectLoading || projectError || !tenantId || !projectId) return;

    setLoading(true);

    try {

      const qs = new URLSearchParams({

        tenant_id: tenantId,

        project_id: projectId ?? "",

      });

      if (query.trim()) qs.set("query", query.trim());

      if (statusFilter) qs.set("status", statusFilter);

      if (priorityFilter) qs.set("priority", priorityFilter);

      if (categoryFilter) qs.set("category", categoryFilter);

      if (myTasksOnly && currentUserId) qs.set("assigned_to", currentUserId);

      if (currentUserId) qs.set("pinned_by", currentUserId);

      const summaryQs = new URLSearchParams({

        tenant_id: tenantId,

        project_id: projectId ?? "",

      });

      if (myTasksOnly && currentUserId) {

        summaryQs.set("user_id", currentUserId);

      }

      const [taskResponse, summaryResponse] = await Promise.all([

        authenticatedFetch(`${API}/api/v1/tasks?${qs}`, { cache: "no-store" }),

        authenticatedFetch(`${API}/api/v1/tasks/summary?${summaryQs}`, {

          cache: "no-store",

        }),

      ]);

      const taskData = await taskResponse.json().catch(() => ({}));

      const summaryData = await summaryResponse.json().catch(() => ({}));

      if (!taskResponse.ok) {

        throw new Error(taskData.detail || "Unable to load tasks.");

      }

      setTasks(Array.isArray(taskData.tasks) ? taskData.tasks : []);

      if (summaryResponse.ok) {

        setSummary(summaryData);

      }

    } catch (error) {

      setMessage(

        error instanceof Error ? error.message : "Unable to load project tasks."

      );

      setTasks([]);

    } finally {

      setLoading(false);

    }

  }

  useEffect(() => {

    if (projectLoading) return;

    if (projectError) {

      setMembers([]);

      setTasks([]);

      setMessage(projectError);

      return;

    }

    if (!tenantId || !projectId) {

      setMembers([]);

      setTasks([]);

      setMessage("No active project is selected. Open Tasks from Portfolio.");

      return;

    }

    void loadMembers();

  }, [tenantId, projectId, projectLoading, projectError]);

  useEffect(() => {

    if (projectLoading || projectError || !tenantId || !projectId) return;

    void loadTasks();

  }, [

    tenantId,

    projectId,

    projectLoading,

    projectError,

    currentUserId,

    statusFilter,

    priorityFilter,

    categoryFilter,

    myTasksOnly,

  ]);

  useEffect(() => {

    setCurrentUserId("");

    setMembers([]);

    setTasks([]);

    setQuery("");

    setStatusFilter("");

    setPriorityFilter("");

    setCategoryFilter("");

    setMyTasksOnly(false);

    setPinnedOnly(false);

    setEditingId(null);

    setResolvingTask(null);

    setResolutionNote("");

  }, [projectId]);

  const visibleTasks = useMemo(() => {

    if (!pinnedOnly) return tasks;

    return tasks.filter((task) => task.is_pinned);

  }, [tasks, pinnedOnly]);

  const pinnedTasks = useMemo(

    () => tasks.filter((task) => task.is_pinned).slice(0, 5),

    [tasks]

  );

  function resetForm() {

    setEditingId(null);

    setTitle("");

    setDescription("");

    setStatus("OPEN");

    setPriority("MEDIUM");

    setCategory("GENERAL");

    setOwner("");

    setDueDate("");

    setAssignedTo("");

    setLinkedModule("");

    setLinkedRecordId("");

  }

  function editTask(task: TaskRecord) {

    setEditingId(task.id);

    setTitle(task.title);

    setDescription(task.description || "");

    setStatus(task.status);

    setPriority(task.priority);

    setCategory(task.category);

    setOwner(task.owner || "");

    setDueDate(task.due_date || "");

    setAssignedTo(task.assigned_to || "");

    setLinkedModule(task.linked_module || "");

    setLinkedRecordId(task.linked_record_id || "");

  }

  async function saveTask() {

    if (projectLoading) {

      setMessage("Loading selected project context...");

      return;

    }

    if (projectError || !tenantId || !projectId) {

      setMessage(

        projectError || "No active project is selected. Open Tasks from Portfolio."

      );

      return;

    }

    if (!title.trim()) {

      setMessage("Task title is required.");

      return;

    }

    setSaving(true);

    setMessage("");

    const payload = {

      tenant_id: tenantId,

      project_id: projectId ?? "",

      actor_user_id: currentUserId || null,

      assigned_to: assignedTo || null,

      title: title.trim(),

      description: description.trim() || null,

      status,

      priority,

      category,

      owner: owner.trim() || null,

      due_date: dueDate || null,

      linked_module: linkedModule || null,

      linked_record_id: linkedRecordId.trim() || null,

    };

    try {

      const endpoint = editingId

        ? `${API}/api/v1/tasks/${editingId}`

        : `${API}/api/v1/tasks`;

      const response = await authenticatedFetch(endpoint, {

        method: editingId ? "PATCH" : "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(payload),

      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {

        throw new Error(data.detail || "Unable to save task.");

      }

      setMessage(editingId ? "Task updated." : "Task created.");

      resetForm();

      await loadTasks();

    } catch (error) {

      setMessage(

        error instanceof Error ? error.message : "Unable to save task."

      );

    } finally {

      setSaving(false);

    }

  }

  async function togglePin(task: TaskRecord) {

    if (projectLoading || projectError || !tenantId || !projectId) {

      setMessage(

        projectError || "No active project is selected. Open Tasks from Portfolio."

      );

      return;

    }

    if (!currentUserId) {

      setMessage("Select the active project user before pinning tasks.");

      return;

    }

    const qs = new URLSearchParams({

      tenant_id: tenantId,

      project_id: projectId ?? "",

      user_id: currentUserId,

    });

    const response = await authenticatedFetch(

      `${API}/api/v1/tasks/${task.id}/pin?${qs}`,

      { method: task.is_pinned ? "DELETE" : "POST" }

    );

    if (!response.ok) {

      const data = await response.json().catch(() => ({}));

      setMessage(data.detail || "Unable to update pinned task.");

      return;

    }

    setTasks((current) =>

      current.map((item) =>

        item.id === task.id

          ? { ...item, is_pinned: !item.is_pinned }

          : item

      )

    );

  }

  async function resolveTask() {

    if (projectLoading || projectError || !tenantId || !projectId) {

      setMessage(

        projectError || "No active project is selected. Open Tasks from Portfolio."

      );

      return;

    }

    if (!resolvingTask || !resolutionNote.trim()) {

      setMessage("Enter the resolution/action taken before resolving the task.");

      return;

    }

    setResolving(true);

    try {

      const response = await authenticatedFetch(

        `${API}/api/v1/tasks/${resolvingTask.id}/resolve`,

        {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({

            tenant_id: tenantId,

            project_id: projectId ?? "",

            actor_user_id: currentUserId || null,

            resolution_note: resolutionNote.trim(),

          }),

        }

      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {

        throw new Error(data.detail || "Unable to resolve task.");

      }

      setMessage("Task resolved.");

      setResolvingTask(null);

      setResolutionNote("");

      await loadTasks();

    } catch (error) {

      setMessage(

        error instanceof Error ? error.message : "Unable to resolve task."

      );

    } finally {

      setResolving(false);

    }

  }

  async function deleteTask(task: TaskRecord) {

    if (projectLoading || projectError || !tenantId || !projectId) {

      setMessage(

        projectError || "No active project is selected. Open Tasks from Portfolio."

      );

      return;

    }

    if (!window.confirm(`Delete task "${task.title}"?`)) return;

    const qs = new URLSearchParams({

      tenant_id: tenantId,

      project_id: projectId ?? "",

    });

    const response = await authenticatedFetch(`${API}/api/v1/tasks/${task.id}?${qs}`, {

      method: "DELETE",

    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {

      setMessage(data.detail || "Unable to delete task.");

      return;

    }

    setMessage("Task deleted.");

    await loadTasks();

  }

  return (

    <main

      className={cx("cx-task-shell flex min-h-screen flex-col", theme === "light" ? "cx-light" : "cx-dark")}

    >

      <style>{`

        .cx-task-shell{

          --cx-bg:#07090D;

          --cx-panel:#0D1117;

          --cx-panel-2:#090C11;

          --cx-soft:#141922;

          --cx-border:rgba(255,255,255,.10);

          --cx-text:#F5F3EE;

          --cx-muted:#9CA5B1;

          --cx-subtle:#6F7A88;

          --cx-hover:rgba(255,255,255,.035);

          --cx-chart-track:rgba(255,255,255,.08);

          --chart-1:#D8A84E;

          --chart-2:#38BDF8;

          --chart-3:#FB923C;

          --chart-4:#34D399;

          --cx-footer-bg:#050608;

          --cx-footer-text:#F4F1EA;

          --cx-footer-muted:rgba(244,241,234,.58);

          --cx-footer-muted-strong:rgba(244,241,234,.70);

          --cx-footer-muted-soft:rgba(244,241,234,.46);

          --cx-footer-border:rgba(255,255,255,.08);

          --cx-footer-border-soft:rgba(255,255,255,.06);
          --cx-footer-divider:rgba(255,255,255,.10);
          --cx-footer-hover:#F4F1EA;

          --cx-footer-accent:#D2B06F;

          background:var(--cx-bg);

          color:var(--cx-text);

          transition:background .2s ease,color .2s ease;

        }

        .cx-task-shell.cx-light{

          --cx-bg:#F3F5F7;

          --cx-panel:#FFFFFF;

          --cx-panel-2:#F8FAFC;

          --cx-soft:#EEF2F6;

          --cx-border:#D9E0E8;

          --cx-text:#172033;

          --cx-muted:#566577;

          --cx-subtle:#758295;

          --cx-hover:rgba(15,23,42,.035);

          --cx-chart-track:#E4E9EF;

          --chart-1:#A66F16;

          --chart-2:#2787B8;

          --chart-3:#C36A1D;

          --chart-4:#2B8A61;

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

          background:var(--cx-bg);

          color:var(--cx-text);

        }

        .cx-task-shell input,

        .cx-task-shell select,

        .cx-task-shell textarea{

          background:var(--cx-panel-2);

          color:var(--cx-text);

          border-color:var(--cx-border);

        }

        .cx-task-shell input::placeholder,

        .cx-task-shell textarea::placeholder{

          color:var(--cx-subtle);

        }
`}</style>

      <ContractXNoticeModal
        open={Boolean(projectError && !message)}
        variant="error"
        title="Project context required"
        message={projectError || ""}
        onClose={() => setMessage("")}
      />

      <div className="mx-auto w-full max-w-[1700px] flex-1 px-5 py-6 lg:px-8">

        <header className="rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5 lg:p-6">

          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">

            <div className="max-w-4xl">

              <div className="text-[10px] font-black uppercase tracking-[0.17em] text-[#D8A84E]">

                Monitor

              </div>

              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--cx-text)] lg:text-4xl">

                Tasks

              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--cx-muted)]">

                Assign, monitor and resolve project actions with clear ownership,

                due dates and links to ContractX records.

              </p>

            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">

              <ContractXThemeSwitch
                theme={theme}
                onChange={setTasksTheme}
              />

              <ContractXNotificationBell

                tenantId={tenantId}

                projectId={projectId || ""}

                userId={currentUserId}

              />

            </div>

          </div>

          {projectLoading && (

            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3 text-xs text-amber-500">

              Loading selected project context...

            </div>

          )}

          <div className="mt-5 rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)]">

            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

              <div className="min-w-0">

                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--cx-subtle)]">

                  Current Project

                </div>

                <div className="mt-1 truncate text-sm font-semibold text-[var(--cx-text)]">

                  {project?.project_name

                    ? `${project.project_name}${project.project_code ? ` · ${project.project_code}` : ""}`

                    : projectId || "No project selected"}

                </div>

              </div>

              <button

                type="button"

                onClick={() => setShowTechnicalDetails((current) => !current)}

                className="w-fit rounded-md border border-[var(--cx-border)] px-3 py-2 text-[9px] font-black uppercase tracking-[0.09em] text-[var(--cx-muted)]"

              >

                {showTechnicalDetails ? "Hide Technical Details" : "Technical Details"}

              </button>

            </div>

            {showTechnicalDetails && (

              <div className="grid gap-3 border-t border-[var(--cx-border)] px-4 py-4 md:grid-cols-3">

                <div>

                  <div className="text-[8px] font-black uppercase tracking-[0.13em] text-[var(--cx-subtle)]">

                    Tenant ID

                  </div>

                  <div className="mt-1 truncate font-mono text-[10px] text-[var(--cx-muted)]">

                    {tenantId || "—"}

                  </div>

                </div>

                <div>

                  <div className="text-[8px] font-black uppercase tracking-[0.13em] text-[var(--cx-subtle)]">

                    Project ID

                  </div>

                  <div className="mt-1 truncate font-mono text-[10px] text-[var(--cx-muted)]">

                    {projectId || "—"}

                  </div>

                </div>

                <label>

                  <div className="mb-1 text-[8px] font-black uppercase tracking-[0.13em] text-[var(--cx-subtle)]">

                    Active Project User

                  </div>

                  <select

                    value={currentUserId}

                    onChange={(e) => {

                      setCurrentUserId(e.target.value);

                      window.localStorage.setItem("contractx-user-id", e.target.value);

                    }}

                    className="w-full rounded-lg border px-3 py-2 text-xs outline-none"

                  >

                    <option value="">Select project user</option>

                    {members.map((member) => (

                      <option key={member.user_id} value={member.user_id}>

                        {member.full_name}

                        {member.job_title ? ` · ${member.job_title}` : ""}

                      </option>

                    ))}

                  </select>

                </label>

              </div>

            )}

          </div>

        </header>

        <section className="mt-5 rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)]">

          <div className="grid gap-px overflow-hidden rounded-2xl bg-[var(--cx-border)] sm:grid-cols-2 xl:grid-cols-5">

            {[

              ["Open", summary.open],

              ["In Progress", summary.in_progress],

              ["Overdue", summary.overdue],

              ["Due Today", summary.due_today],

              ["Critical", summary.critical],

            ].map(([label, value]) => (

              <div key={String(label)} className="bg-[var(--cx-panel)] px-4 py-4">

                <div className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--cx-subtle)]">

                  {label}

                </div>

                <div className="mt-1 text-xl font-semibold text-[var(--cx-text)]">

                  {value}

                </div>

              </div>

            ))}

          </div>

          <button

            type="button"

            onClick={() => setShowDashboard((current) => !current)}

            className="flex w-full items-center justify-between border-t border-[var(--cx-border)] px-4 py-3 text-left"

          >

            <span className="text-[9px] font-black uppercase tracking-[0.11em] text-[var(--cx-muted)]">

              {showDashboard ? "Hide Task Analytics" : "Task Analytics"}

            </span>

            <span className="text-[var(--cx-muted)]">{showDashboard ? "−" : "+"}</span>

          </button>

          {showDashboard && (

            <div className="grid gap-4 border-t border-[var(--cx-border)] p-4 lg:grid-cols-2">

              <div className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-4">

                <div className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cx-text)]">

                  Task Status

                </div>

                <DonutChart summary={summary} />

              </div>

              <div className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-4">

                <div className="mb-4 flex items-center justify-between gap-3">

                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cx-text)]">

                    Priority & Due Position

                  </div>

                  <div className="text-[10px] text-[var(--cx-muted)]">

                    Next 7 days {summary.due_7_days}

                  </div>

                </div>

                <PriorityBars summary={summary} />

              </div>

            </div>

          )}

        </section>

        {pinnedTasks.length > 0 && (

          <section className="mt-5 rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5">

            <div className="mb-4 flex items-center justify-between">

              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cx-text)]">

                Pinned Tasks

              </div>

              <button

                type="button"

                onClick={() => setPinnedOnly((value) => !value)}

                className="text-[10px] font-semibold text-[#D8A84E]"

              >

                {pinnedOnly ? "Show all tasks" : "Show pinned only"}

              </button>

            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">

              {pinnedTasks.map((task) => (

                <button

                  key={task.id}

                  type="button"

                  onClick={() => editTask(task)}

                  className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-3 text-left"

                >

                  <div className="truncate text-xs font-semibold text-[var(--cx-text)]">

                    {task.title}

                  </div>

                  <div className="mt-1 text-[10px] text-[var(--cx-muted)]">

                    {task.priority}

                    {task.due_date ? ` · Due ${task.due_date}` : ""}

                  </div>

                </button>

              ))}

            </div>

          </section>

        )}

        <section className="mt-5 grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">

          <aside className="rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5">

            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#D8A84E]">

              {editingId ? "Edit Task" : "New Task"}

            </div>

            <h2 className="mt-1 text-lg font-semibold text-[var(--cx-text)]">

              {editingId ? "Update project action" : "Create project action"}

            </h2>

            <div className="mt-5 space-y-4">

              <button

                type="button"

                onClick={() => setShowAdvancedTaskFields((current) => !current)}

                className="w-full rounded-lg border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-[0.10em] text-[var(--cx-muted)]"

              >

                {showAdvancedTaskFields ? "Collapse Task Details −" : "Expand to Add Task +"}

              </button>

              {showAdvancedTaskFields && (

                <div className="space-y-4">

              <label>

                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                  Task Title

                </div>

                <input

                  value={title}

                  onChange={(e) => setTitle(e.target.value)}

                  placeholder="e.g. Issue EOT notice for late access"

                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"

                />

              </label>

              <label>

                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                  Description

                </div>

                <textarea

                  value={description}

                  onChange={(e) => setDescription(e.target.value)}

                  rows={4}

                  placeholder="Action, evidence requirement, decision or follow-up."

                  className="w-full resize-y rounded-xl border px-3 py-3 text-sm leading-6 outline-none"

                />

              </label>

              <label>

                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                  Assign To

                </div>

                <select

                  value={assignedTo}

                  onChange={(e) => setAssignedTo(e.target.value)}

                  className="w-full rounded-xl border px-3 py-2.5 text-xs"

                >

                  <option value="">Unassigned</option>

                  {members.map((member) => (

                    <option key={member.user_id} value={member.user_id}>

                      {member.full_name}

                      {member.job_title ? ` · ${member.job_title}` : ""}

                    </option>

                  ))}

                </select>

                <div className="mt-1 text-[9px] text-[var(--cx-muted)]">

                  Only active users assigned to this project are available.

                </div>

              </label>

              <div className="grid gap-3 sm:grid-cols-2">

                <label>

                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                    Status

                  </div>

                  <select

                    value={status}

                    onChange={(e) => setStatus(e.target.value as TaskStatus)}

                    className="w-full rounded-xl border px-3 py-2.5 text-xs"

                  >

                    {STATUS_OPTIONS.map((item) => (

                      <option key={item}>{item}</option>

                    ))}

                  </select>

                </label>

                <label>

                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                    Priority

                  </div>

                  <select

                    value={priority}

                    onChange={(e) => setPriority(e.target.value as TaskPriority)}

                    className="w-full rounded-xl border px-3 py-2.5 text-xs"

                  >

                    {PRIORITY_OPTIONS.map((item) => (

                      <option key={item}>{item}</option>

                    ))}

                  </select>

                </label>

              </div>

              <div className="grid gap-3 sm:grid-cols-2">

                <label>

                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                    Category

                  </div>

                  <select

                    value={category}

                    onChange={(e) => setCategory(e.target.value as TaskCategory)}

                    className="w-full rounded-xl border px-3 py-2.5 text-xs"

                  >

                    {CATEGORY_OPTIONS.map((item) => (

                      <option key={item}>{item}</option>

                    ))}

                  </select>

                </label>

                <label>

                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                    Due Date

                  </div>

                  <div className="relative">

                    <input

                      ref={dueDateInputRef}

                      type="date"

                      value={dueDate}

                      onChange={(e) => setDueDate(e.target.value)}

                      onClick={(e) => {

                        const input = e.currentTarget;

                        if (typeof input.showPicker === "function") {

                          try {

                            input.showPicker();

                          } catch {}

                        }

                      }}

                      className="w-full cursor-pointer rounded-xl border px-3 py-2.5 pr-20 text-xs"

                    />

                    <button

                      type="button"

                      onClick={() => {

                        const input = dueDateInputRef.current;

                        if (!input) return;

                        input.focus();

                        if (typeof input.showPicker === "function") {

                          try {

                            input.showPicker();

                          } catch {}

                        }

                      }}

                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg border border-[var(--cx-border)] bg-[var(--cx-soft)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--cx-muted)]"

                    >

                      Calendar

                    </button>

                  </div>

                  {dueDate && (

                    <button

                      type="button"

                      onClick={() => setDueDate("")}

                      className="mt-1.5 text-[9px] font-semibold text-[#D8A84E]"

                    >

                      Clear date

                    </button>

                  )}

                </label>

              </div>

              <label>

                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                  Owner / Discipline

                </div>

                <input

                  value={owner}

                  onChange={(e) => setOwner(e.target.value)}

                  placeholder="e.g. Contract Management"

                  className="w-full rounded-xl border px-3 py-2.5 text-xs"

                />

              </label>

              <label>

                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                  Linked Module

                </div>

                <select

                  value={linkedModule}

                  onChange={(e) => setLinkedModule(e.target.value)}

                  className="w-full rounded-xl border px-3 py-2.5 text-xs"

                >

                  <option value="">No linked module</option>

                  {MODULE_OPTIONS.map((item) => (

                    <option key={item}>{item}</option>

                  ))}

                </select>

              </label>

              <label>

                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                  Linked Record ID

                </div>

                <input

                  value={linkedRecordId}

                  onChange={(e) => setLinkedRecordId(e.target.value)}

                  placeholder="Optional claim / delay / document / review ID"

                  className="w-full rounded-xl border px-3 py-2.5 text-xs"

                />

              </label>

                </div>

              )}

              <div className="flex gap-2">

                <button

                  type="button"

                  onClick={saveTask}

                  disabled={saving}

                  className="flex-1 rounded-xl bg-[#D8A84E] px-4 py-3 text-sm font-semibold text-[#111318] disabled:opacity-50"

                >

                  {saving

                    ? "Saving..."

                    : editingId

                    ? "Update Task"

                    : "Create Task"}

                </button>

                {editingId && (

                  <button

                    type="button"

                    onClick={resetForm}

                    className="rounded-xl border border-[var(--cx-border)] px-4 py-3 text-sm text-[var(--cx-muted)]"

                  >

                    Cancel

                  </button>

                )}

              </div>

            </div>

          </aside>

          <section className="rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5">

            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

              <div>

                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#D8A84E]">

                  Task Register

                </div>

                <h2 className="mt-1 text-lg font-semibold text-[var(--cx-text)]">

                  Project actions and deadlines

                </h2>

              </div>

              <div className="flex flex-wrap gap-2">

                <button

                  type="button"

                  onClick={() => setMyTasksOnly((value) => !value)}

                  className={cx(

                    "rounded-xl border px-3 py-2 text-[10px] font-semibold",

                    myTasksOnly

                      ? "border-[#D8A84E]/40 bg-[#D8A84E]/10 text-[#B98224]"

                      : "border-[var(--cx-border)] text-[var(--cx-muted)]"

                  )}

                >

                  My Tasks

                </button>

                <button

                  type="button"

                  onClick={() => setPinnedOnly((value) => !value)}

                  className={cx(

                    "rounded-xl border px-3 py-2 text-[10px] font-semibold",

                    pinnedOnly

                      ? "border-[#D8A84E]/40 bg-[#D8A84E]/10 text-[#B98224]"

                      : "border-[var(--cx-border)] text-[var(--cx-muted)]"

                  )}

                >

                  📌 Pinned

                </button>

                <button

                  type="button"

                  onClick={() => void loadTasks()}

                  disabled={loading}

                  className="rounded-xl border border-[var(--cx-border)] px-3 py-2 text-[10px] font-semibold text-[var(--cx-muted)]"

                >

                  {loading ? "Refreshing..." : "Refresh"}

                </button>

              </div>

            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-4">

              <input

                value={query}

                onChange={(e) => setQuery(e.target.value)}

                onKeyDown={(e) => {

                  if (e.key === "Enter") void loadTasks();

                }}

                placeholder="Search title, assignee or action…"

                className="rounded-xl border px-3 py-2.5 text-xs"

              />

              <select

                value={statusFilter}

                onChange={(e) => setStatusFilter(e.target.value)}

                className="rounded-xl border px-3 py-2.5 text-xs"

              >

                <option value="">All Status</option>

                {STATUS_OPTIONS.map((item) => (

                  <option key={item} value={item}>

                    {pretty(item)}

                  </option>

                ))}

              </select>

              <select

                value={priorityFilter}

                onChange={(e) => setPriorityFilter(e.target.value)}

                className="rounded-xl border px-3 py-2.5 text-xs"

              >

                <option value="">All Priorities</option>

                {PRIORITY_OPTIONS.map((item) => (

                  <option key={item} value={item}>

                    {pretty(item)}

                  </option>

                ))}

              </select>

              <select

                value={categoryFilter}

                onChange={(e) => setCategoryFilter(e.target.value)}

                className="rounded-xl border px-3 py-2.5 text-xs"

              >

                <option value="">All Categories</option>

                {CATEGORY_OPTIONS.map((item) => (

                  <option key={item} value={item}>

                    {pretty(item)}

                  </option>

                ))}

              </select>

            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-[var(--cx-border)]">

              {loading ? (

                <div className="px-5 py-12 text-center text-sm text-[var(--cx-muted)]">

                  Loading tasks...

                </div>

              ) : visibleTasks.length === 0 ? (

                <div className="px-5 py-12 text-center text-sm text-[var(--cx-muted)]">

                  No tasks match the current view.

                </div>

              ) : (

                <div className="divide-y divide-[var(--cx-border)]">

                  {visibleTasks.map((task) => (

                    <article key={task.id} className="p-4 hover:bg-[var(--cx-hover)]">

                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">

                        <div className="min-w-0 flex-1">

                          <div className="flex flex-wrap items-center gap-2">

                            <button

                              type="button"

                              onClick={() => void togglePin(task)}

                              className="text-base"

                              title={task.is_pinned ? "Unpin task" : "Pin task"}

                            >

                              {task.is_pinned ? "📌" : "☆"}

                            </button>

                            <Badge

                              tone={

                                task.status === "COMPLETED"

                                  ? "green"

                                  : task.status === "BLOCKED"

                                  ? "red"

                                  : task.status === "IN_PROGRESS"

                                  ? "blue"

                                  : task.status === "CANCELLED"

                                  ? "neutral"

                                  : "gold"

                              }

                            >

                              {pretty(task.status)}

                            </Badge>

                            <Badge

                              tone={

                                task.priority === "CRITICAL"

                                  ? "red"

                                  : task.priority === "HIGH"

                                  ? "amber"

                                  : task.priority === "MEDIUM"

                                  ? "gold"

                                  : "neutral"

                              }

                            >

                              {pretty(task.priority)}

                            </Badge>

                            <Badge>{pretty(task.category)}</Badge>

                            {isOverdue(task) && <Badge tone="red">Overdue</Badge>}

                          </div>

                          <h3 className="mt-3 text-base font-semibold text-[var(--cx-text)]">

                            {task.title}

                          </h3>

                          {task.description && (

                            <p className="mt-2 text-sm leading-6 text-[var(--cx-muted)]">

                              {task.description}

                            </p>

                          )}

                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--cx-subtle)]">

                            {task.assignee_name && (

                              <span>

                                Assigned to: {task.assignee_name}

                                {task.assignee_job_title

                                  ? ` · ${task.assignee_job_title}`

                                  : ""}

                              </span>

                            )}

                            {task.due_date && <span>Due: {task.due_date}</span>}

                            {task.linked_module && (

                              <span>Module: {task.linked_module}</span>

                            )}

                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--cx-subtle)]">

                            {task.created_at && (

                              <span>

                                Created: {formatTaskTimestamp(task.created_at)}

                              </span>

                            )}

                            {wasTaskEdited(task) && task.updated_at && (

                              <span className="font-semibold text-[#D8A84E]">

                                Edited: {formatTaskTimestamp(task.updated_at)}

                              </span>

                            )}

                            {task.status === "COMPLETED" && task.completed_at && (

                              <span className="font-semibold text-emerald-600">

                                Resolved: {formatTaskTimestamp(task.completed_at)}

                              </span>

                            )}

                          </div>

                          {task.resolution_note && (

                            <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-xs leading-5 text-emerald-600">

                              <strong>Resolution:</strong> {task.resolution_note}

                            </div>

                          )}

                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">

                          {!["COMPLETED", "CANCELLED"].includes(task.status) && (

                            <button

                              type="button"

                              onClick={() => {

                                setResolvingTask(task);

                                setResolutionNote("");

                              }}

                              className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2 text-xs font-semibold text-emerald-600"

                            >

                              Resolve

                            </button>

                          )}

                          <button

                            type="button"

                            onClick={() => editTask(task)}

                            className="rounded-lg border border-[var(--cx-border)] px-3 py-2 text-xs text-[var(--cx-muted)]"

                          >

                            Edit

                          </button>

                          <button

                            type="button"

                            onClick={() => void deleteTask(task)}

                            className="rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2 text-xs text-rose-500"

                          >

                            Delete

                          </button>

                        </div>

                      </div>

                    </article>

                  ))}

                </div>

              )}

            </div>

          </section>

        </section>

      </div>

      <ContractXNoticeModal
        open={Boolean(message)}
        variant={
          /created|updated|resolved|deleted|success/i.test(message)
            ? "success"
            : "error"
        }
        title={
          /created|updated|resolved|deleted|success/i.test(message)
            ? "Completed"
            : "Action Required"
        }
        message={message}
        onClose={() => setMessage("")}
      />

      {resolvingTask && (

        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 px-4">

          <div className="w-full max-w-lg rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5 shadow-2xl">

            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#D8A84E]">

              Resolve Task

            </div>

            <h3 className="mt-2 text-lg font-semibold text-[var(--cx-text)]">

              {resolvingTask.title}

            </h3>

            <label className="mt-5 block">

              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">

                Resolution / Action Taken

              </div>

              <textarea

                value={resolutionNote}

                onChange={(e) => setResolutionNote(e.target.value)}

                rows={6}

                placeholder="Record what was completed, decided or issued."

                className="w-full rounded-xl border px-3 py-3 text-sm leading-6 outline-none"

              />

            </label>

            <div className="mt-4 flex justify-end gap-2">

              <button

                type="button"

                onClick={() => {

                  setResolvingTask(null);

                  setResolutionNote("");

                }}

                className="rounded-xl border border-[var(--cx-border)] px-4 py-2.5 text-xs text-[var(--cx-muted)]"

              >

                Cancel

              </button>

              <button

                type="button"

                onClick={() => void resolveTask()}

                disabled={resolving}

                className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"

              >

                {resolving ? "Resolving..." : "Resolve Task"}

              </button>

            </div>

          </div>

        </div>

      )}

      <LegalFooter compact />

    </main>

  );

}
