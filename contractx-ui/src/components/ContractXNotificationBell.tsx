"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

const API = "/api/contractx";

type NotificationItem = {
  id: string;
  notification_type: string;
  title: string;
  message?: string | null;
  task_id?: string | null;
  is_read: boolean;
  created_at?: string | null;
};

export default function ContractXNotificationBell({
  tenantId,
  projectId,
  userId,
}: {
  tenantId: string;
  projectId: string;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);

  async function refresh() {
    if (!tenantId || !projectId || !userId) return;

    const qs = new URLSearchParams({
      tenant_id: tenantId,
      project_id: projectId,
      user_id: userId,
    });

    try {
      await fetch(
        `${API}/api/v1/tasks/notifications/sweep?tenant_id=${encodeURIComponent(
          tenantId
        )}&project_id=${encodeURIComponent(projectId)}`,
        { method: "POST" }
      );

      const [countResponse, listResponse] = await Promise.all([
        fetch(`${API}/api/v1/tasks/notifications/unread-count?${qs}`, {
          cache: "no-store",
        }),
        fetch(`${API}/api/v1/tasks/notifications?${qs}&limit=12`, {
          cache: "no-store",
        }),
      ]);

      if (countResponse.ok) {
        const data = await countResponse.json();
        setUnread(Number(data.unread || 0));
      }

      if (listResponse.ok) {
        const data = await listResponse.json();
        setItems(Array.isArray(data.notifications) ? data.notifications : []);
      }
    } catch {
      // Bell is non-blocking for the rest of the workspace.
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 90000);
    return () => window.clearInterval(timer);
  }, [tenantId, projectId, userId]);

  async function markRead(id: string) {
    const qs = new URLSearchParams({
      tenant_id: tenantId,
      project_id: projectId,
      user_id: userId,
    });

    await fetch(`${API}/api/v1/tasks/notifications/${id}/read?${qs}`, {
      method: "POST",
    });

    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, is_read: true } : item
      )
    );
    setUnread((current) => Math.max(0, current - 1));
  }

  async function markAllRead() {
    const qs = new URLSearchParams({
      tenant_id: tenantId,
      project_id: projectId,
      user_id: userId,
    });

    await fetch(`${API}/api/v1/tasks/notifications/read-all?${qs}`, {
      method: "POST",
    });

    setItems((current) =>
      current.map((item) => ({ ...item, is_read: true }))
    );
    setUnread(0);
  }

  if (!userId) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          void refresh();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] text-[var(--cx-text)]"
        aria-label="Task notifications"
      >
        <span aria-hidden="true">🔔</span>

        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[9px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-[120] mt-2 w-[360px] max-w-[90vw] overflow-hidden rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--cx-border)] px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-[var(--cx-text)]">
                Notifications
              </div>

              <div className="mt-0.5 text-[10px] text-[var(--cx-muted)]">
                {unread} unread
              </div>
            </div>

            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-[10px] font-semibold text-[#D8A84E]"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-[var(--cx-muted)]">
                No notifications.
              </div>
            ) : (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={
                    item.task_id
                      ? `/tasks?project=${encodeURIComponent(
                          projectId
                        )}&task=${encodeURIComponent(item.task_id)}`
                      : `/tasks?project=${encodeURIComponent(projectId)}`
                  }
                  onClick={() => {
                    if (!item.is_read) void markRead(item.id);
                    setOpen(false);
                  }}
                  className={`block border-b border-[var(--cx-border)] px-4 py-3 transition hover:bg-[var(--cx-hover)] ${
                    item.is_read ? "opacity-65" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        item.is_read ? "bg-zinc-500" : "bg-[#D8A84E]"
                      }`}
                    />

                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--cx-text)]">
                        {item.title}
                      </div>

                      {item.message && (
                        <div className="mt-1 text-[10px] leading-4 text-[var(--cx-muted)]">
                          {item.message}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          <Link
            href={`/tasks?project=${encodeURIComponent(projectId)}`}
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-center text-[10px] font-semibold text-[#D8A84E]"
          >
            Open Task Centre
          </Link>
        </div>
      )}
    </div>
  );
}