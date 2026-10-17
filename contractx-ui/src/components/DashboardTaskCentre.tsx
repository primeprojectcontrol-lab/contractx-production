"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ContractXNotificationBell from "@/components/ContractXNotificationBell";

const API = "/api/contractx";

type Summary = {
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
};

type Task = {
  id: string;
  title: string;
  priority: string;
  due_date?: string | null;
  is_pinned?: boolean;
};

function Donut({
  values,
}: {
  values: Array<{ label: string; value: number }>;
}) {
  const total = Math.max(
    1,
    values.reduce((sum, item) => sum + item.value, 0)
  );
  let offset = 0;

  return (
    <svg viewBox="0 0 42 42" className="h-28 w-28 -rotate-90">
      <circle
        cx="21"
        cy="21"
        r="15.9155"
        fill="transparent"
        stroke="var(--cx-chart-track)"
        strokeWidth="5"
      />
      {values.map((item, index) => {
        const pct = (item.value / total) * 100;
        const dash = `${pct} ${100 - pct}`;
        const dashOffset = -offset;
        offset += pct;

        return (
          <circle
            key={item.label}
            cx="21"
            cy="21"
            r="15.9155"
            fill="transparent"
            stroke={`var(--cx-chart-${index + 1})`}
            strokeWidth="5"
            strokeDasharray={dash}
            strokeDashoffset={dashOffset}
          />
        );
      })}
    </svg>
  );
}

export default function DashboardTaskCentre({
  tenantId,
  projectId,
  userId,
}: {
  tenantId: string;
  projectId: string;
  userId: string;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pinned, setPinned] = useState<Task[]>([]);

  useEffect(() => {
    if (!tenantId || !projectId) return;

    const summaryQs = new URLSearchParams({
      tenant_id: tenantId,
      project_id: projectId,
    });

    if (userId) summaryQs.set("user_id", userId);

    const taskQs = new URLSearchParams({
      tenant_id: tenantId,
      project_id: projectId,
    });

    if (userId) taskQs.set("pinned_by", userId);

    Promise.all([
      fetch(`${API}/api/v1/tasks/summary?${summaryQs}`, {
        cache: "no-store",
      }),
      fetch(`${API}/api/v1/tasks?${taskQs}`, {
        cache: "no-store",
      }),
    ])
      .then(async ([summaryResponse, taskResponse]) => {
        if (summaryResponse.ok) {
          setSummary(await summaryResponse.json());
        }

        if (taskResponse.ok) {
          const data = await taskResponse.json();
          setPinned(
            (data.tasks || [])
              .filter((task: Task) => task.is_pinned)
              .slice(0, 4)
          );
        }
      })
      .catch(() => {
        setSummary(null);
        setPinned([]);
      });
  }, [tenantId, projectId, userId]);

  const chart = useMemo(
    () => [
      { label: "Open", value: summary?.open || 0 },
      { label: "In Progress", value: summary?.in_progress || 0 },
      { label: "Blocked", value: summary?.blocked || 0 },
      { label: "Completed", value: summary?.completed || 0 },
    ],
    [summary]
  );

  return (
    <section
      className="rounded-3xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5"
      style={
        {
          "--cx-panel": "var(--contractx-panel, #0D1117)",
          "--cx-border": "var(--contractx-border, rgba(255,255,255,.10))",
          "--cx-text": "var(--contractx-text, #F5F3EE)",
          "--cx-muted": "var(--contractx-muted, #8B95A3)",
          "--cx-chart-track": "rgba(128,128,128,.16)",
          "--cx-chart-1": "#D8A84E",
          "--cx-chart-2": "#38BDF8",
          "--cx-chart-3": "#FB923C",
          "--cx-chart-4": "#34D399",
        } as React.CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D8A84E]">
            Project Actions
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--cx-text)]">
            Task Centre
          </div>
        </div>

        <ContractXNotificationBell
          tenantId={tenantId}
          projectId={projectId}
          userId={userId}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Open Actions", summary?.open ?? "—"],
          ["Overdue", summary?.overdue ?? "—"],
          ["Critical", summary?.critical ?? "—"],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-[var(--cx-border)] p-3"
          >
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-muted)]">
              {label}
            </div>
            <div className="mt-1 text-2xl font-semibold text-[var(--cx-text)]">
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[150px_minmax(0,1fr)] md:items-center">
        <div className="flex justify-center">
          <Donut values={chart} />
        </div>

        <div className="space-y-2">
          {chart.map((item, index) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2 text-[var(--cx-muted)]">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: `var(--cx-chart-${index + 1})` }}
                />
                {item.label}
              </div>
              <div className="font-semibold text-[var(--cx-text)]">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--cx-border)] pt-4">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cx-muted)]">
          Pinned
        </div>

        {pinned.length === 0 ? (
          <div className="text-xs text-[var(--cx-muted)]">
            No pinned tasks.
          </div>
        ) : (
          <div className="space-y-2">
            {pinned.map((task) => (
              <Link
                key={task.id}
                href={`/tasks?project=${encodeURIComponent(projectId)}&task=${encodeURIComponent(task.id)}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--cx-border)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-[var(--cx-text)]">
                    📌 {task.title}
                  </div>
                  <div className="mt-1 text-[9px] text-[var(--cx-muted)]">
                    {task.priority}
                    {task.due_date ? ` · Due ${task.due_date}` : ""}
                  </div>
                </div>
                <span className="text-[#D8A84E]">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        href={`/tasks?project=${encodeURIComponent(projectId)}`}
        className="mt-5 block rounded-xl border border-[#D8A84E]/30 bg-[#D8A84E]/[0.08] px-4 py-3 text-center text-xs font-semibold text-[#D8A84E]"
      >
        Open Task Centre →
      </Link>
    </section>
  );
}
