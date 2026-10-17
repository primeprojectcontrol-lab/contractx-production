"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

const API = "/api/contractx";

type TaskSummary = {
  total: number;
  open: number;
  in_progress: number;
  blocked: number;
  completed: number;
  overdue: number;
  critical: number;
};

export default function DashboardTaskSummary({
  tenantId,
  projectId,
}: {
  tenantId: string;
  projectId: string;
}) {
  const [summary, setSummary] = useState<TaskSummary | null>(null);

  useEffect(() => {
    if (!tenantId || !projectId) return;

    const qs = new URLSearchParams({
      tenant_id: tenantId,
      project_id: projectId,
    });

    fetch(`${API}/api/v1/tasks/summary?${qs.toString()}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Task summary unavailable");
        return r.json();
      })
      .then((data) =>
        setSummary({
          total: Number(data.total || 0),
          open: Number(data.open || 0),
          in_progress: Number(data.in_progress || 0),
          blocked: Number(data.blocked || 0),
          completed: Number(data.completed || 0),
          overdue: Number(data.overdue || 0),
          critical: Number(data.critical || 0),
        })
      )
      .catch(() => setSummary(null));
  }, [tenantId, projectId]);

  return (
    <Link
      href={`/tasks?project=${encodeURIComponent(projectId)}`}
      className="block rounded-2xl border border-white/10 bg-[#0D1117] p-5 transition hover:border-[#D8A84E]/30"
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#D8A84E]">
        Project Tasks
      </div>

      <div className="mt-2 flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold text-white">
            {summary?.open ?? "—"}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Open actions</div>
        </div>

        <div className="text-right text-xs leading-5 text-zinc-500">
          <div>Overdue: {summary?.overdue ?? "—"}</div>
          <div>Critical: {summary?.critical ?? "—"}</div>
          <div>In progress: {summary?.in_progress ?? "—"}</div>
        </div>
      </div>
    </Link>
  );
}