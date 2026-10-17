"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";
import ContractXNoticeModal from "@/components/ContractXNoticeModal";
import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";
import { useActiveProject } from "@/hooks/useActiveProject";
import { createClient } from "@/lib/supabase/client";

const API = "/api/contractx";

type TabKey =
  | "project"
  | "users"
  | "permissions"
  | "notifications"
  | "ai"
  | "lifecycle";

type Member = {
  user_id: string;
  email: string;
  full_name?: string | null;
  job_title?: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER" | string;
  status: "ACTIVE" | "INACTIVE" | string;
  joined_at?: string | null;
};

type ProjectDetails = {
  id: string;
  tenant_id: string;
  project_name: string;
  project_code?: string | null;
  status: string;
  country?: string | null;
  jurisdiction?: string | null;
  client_name?: string | null;
  contractor_name?: string | null;
  consultant_name?: string | null;
  contract_award_date?: string | null;
  project_start_date?: string | null;
  contract_completion_date?: string | null;
  baseline_start_date?: string | null;
  baseline_completion_date?: string | null;
  current_data_date?: string | null;
  forecast_completion_date?: string | null;
  program_name?: string | null;
  program_version?: string | null;
};

type ContractProfile = {
  id?: string;
  contract_type: string;
  governing_law: string;
  employer_name?: string | null;
  contractor_name?: string | null;
  engineer_name?: string | null;
  contract_value_usd?: number | null;
  start_date?: string | null;
  completion_date?: string | null;
  defects_notification_period_days?: number | null;
  notice_time_bar_days?: number | null;
  eot_clause_ref?: string | null;
  ld_rate_per_day?: number | null;
  max_ld_cap_percentage?: number | null;
};

type NotificationSettings = {
  task_assignment_notifications: boolean;
  due_date_notifications: boolean;
  overdue_notifications: boolean;
  assignment_email_enabled: boolean;
  project_timezone: string;
};



type ProjectInvitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_at: string;
  expires_at: string;
  accepted_at?: string | null;
};

type Entitlement = {
  organization_id?: string | null;
  organization_name?: string | null;
  plan_name?: string | null;
  project_limit?: number | null;
  user_limit?: number | null;
  active_projects?: number | null;
  remaining_projects?: number | null;
  platform_role?: string | null;
  has_admin_controls?: boolean | null;
};

function cx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function pretty(value?: string | null) {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtDate(value?: string | null) {
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

function Panel({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-5">
      <div className="flex flex-col gap-3 border-b border-[var(--cx-border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow && (
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-[#B98224]">
              {eyebrow}
            </div>
          )}
          <h2 className="mt-1 text-lg font-semibold text-[var(--cx-text)]">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  readOnly = false,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--cx-subtle)]">
        {label}
      </div>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className={cx(
          "w-full rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] px-3 py-2.5 text-xs text-[var(--cx-text)] outline-none transition focus:border-[#D8A84E]/50",
          readOnly && "cursor-default opacity-80"
        )}
      />
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-4">
      <div>
        <div className="text-xs font-semibold text-[var(--cx-text)]">{label}</div>
        <div className="mt-1 text-[10px] leading-5 text-[var(--cx-muted)]">
          {description}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition",
          checked
            ? "border-[#D8A84E] bg-[#D8A84E]"
            : "border-[var(--cx-border)] bg-[var(--cx-panel-2)]",
          disabled && "cursor-not-allowed opacity-45"
        )}
        aria-pressed={checked}
      >
        <span
          className={cx(
            "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all",
            checked ? "left-[22px]" : "left-[3px]"
          )}
          style={{ width: 18, height: 18 }}
        />
      </button>
    </div>
  );
}

const permissionRows = [
  ["View project workspace", true, true, true],
  ["Edit project details", true, true, false],
  ["Manage users & access", true, true, false],
  ["Change AI model policy", true, true, false],
  ["Manage notification policy", true, true, false],
  ["Change project lifecycle status", true, true, false],
  ["Use Ask ContractX / Review / Claims / Tasks", true, true, true],
  ["Access project documents permitted by RLS", true, true, true],
];

export default function ProjectSettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const {
    projectId,
    project,
    tenantId,
    loading: projectLoading,
    error: projectError,
  } = useActiveProject();

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [tab, setTab] = useState<TabKey>("project");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [contractProfile, setContractProfile] =
    useState<ContractProfile | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentProjectRole, setCurrentProjectRole] = useState("");
  const [platformRole, setPlatformRole] = useState("USER");
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("MEMBER");

  const [notifications, setNotifications] = useState<NotificationSettings>({
    task_assignment_notifications: true,
    due_date_notifications: true,
    overdue_notifications: true,
    assignment_email_enabled: false,
    project_timezone: "Asia/Singapore",
  });


  const isProjectAdmin =
    platformRole === "PLATFORM_ADMIN" ||
    currentProjectRole === "OWNER" ||
    currentProjectRole === "ADMIN";

  const projectUserLimit = useMemo(() => {
    const totalUsers = Number(entitlement?.user_limit || 0);
    const totalProjects = Number(entitlement?.project_limit || 0);

    if (totalUsers > 0 && totalProjects > 0) {
      return Math.max(1, Math.floor(totalUsers / totalProjects));
    }

    // ContractX commercial default: max 3 active users per project.
    return 3;
  }, [entitlement?.user_limit, entitlement?.project_limit]);

  const activeProjectUsers = useMemo(
    () => members.filter((member) => member.status === "ACTIVE").length,
    [members]
  );

  const pendingInvitations = useMemo(
    () => invitations.filter((invite) => invite.status === "PENDING"),
    [invitations]
  );

  const remainingProjectUserSeats = Math.max(
    projectUserLimit - activeProjectUsers,
    0
  );

  useEffect(() => {
    const saved = localStorage.getItem("contractx-theme");
    const initialTheme: "dark" | "light" =
      saved === "light" ? "light" : "dark";

    setTheme(initialTheme);
    document.documentElement.dataset.contractxTheme = initialTheme;

    const onThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<"dark" | "light">;

      if (
        customEvent.detail === "dark" ||
        customEvent.detail === "light"
      ) {
        setTheme(customEvent.detail);
        document.documentElement.dataset.contractxTheme =
          customEvent.detail;
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

  const setProjectSettingsTheme = (nextTheme: "dark" | "light") => {
    setTheme(nextTheme);
    document.documentElement.dataset.contractxTheme = nextTheme;
    localStorage.setItem("contractx-theme", nextTheme);
    window.dispatchEvent(
      new CustomEvent("contractx-theme-change", {
        detail: nextTheme,
      })
    );
  };


  async function loadAll() {
    if (projectLoading || projectError || !projectId || !tenantId) return;

    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Authenticated session could not be verified.");
      }

      setCurrentUserId(user.id);

      const [
        projectResult,
        membershipResult,
        profileResult,
        entitlementResult,
        memberResult,
        invitationResult,
        contractResult,
        notificationResult,
      ] = await Promise.all([
        supabase
          .from("projects")
          .select(
            "id,tenant_id,project_name,project_code,status,country,jurisdiction,client_name,contractor_name,consultant_name,contract_award_date,project_start_date,contract_completion_date,baseline_start_date,baseline_completion_date,current_data_date,forecast_completion_date,program_name,program_version"
          )
          .eq("id", projectId)
          .single(),

        supabase
          .from("project_users")
          .select("role,status")
          .eq("project_id", projectId)
          .eq("user_id", user.id)
          .eq("status", "ACTIVE")
          .maybeSingle(),

        supabase
          .from("user_profiles")
          .select("platform_role")
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase.rpc("get_my_entitlement"),

        supabase.rpc("project_admin_list_members", {
          p_project_id: projectId,
        }),

              supabase.rpc("project_admin_list_invitations", {
          p_project_id: projectId,
        }),
supabase
          .from("contract_profiles")
          .select(
            "id,contract_type,governing_law,employer_name,contractor_name,engineer_name,contract_value_usd,start_date,completion_date,defects_notification_period_days,notice_time_bar_days,eot_clause_ref,ld_rate_per_day,max_ld_cap_percentage"
          )
          .eq("project_id", projectId)
          .maybeSingle(),

        supabase
          .from("project_settings")
          .select(
            "task_assignment_notifications,due_date_notifications,overdue_notifications,assignment_email_enabled,project_timezone"
          )
          .eq("project_id", projectId)
          .maybeSingle(),
      ]);

      if (projectResult.error || !projectResult.data) {
        throw new Error(projectResult.error?.message || "Unable to load project.");
      }

      setDetails(projectResult.data as ProjectDetails);
      setCurrentProjectRole(membershipResult.data?.role || "");
      setPlatformRole(profileResult.data?.platform_role || "USER");

      const entitlementRow = Array.isArray(entitlementResult.data)
        ? entitlementResult.data[0]
        : entitlementResult.data;
      setEntitlement((entitlementRow || null) as Entitlement | null);

      if (memberResult.error) throw new Error(memberResult.error.message);
      if (invitationResult.error) {
        throw new Error(
          `Unable to load project invitations: ${invitationResult.error.message}`
        );
      }

      setMembers((memberResult.data || []) as Member[]);
      setInvitations((invitationResult.data || []) as ProjectInvitation[]);

      if (contractResult.data) {
        setContractProfile(contractResult.data as ContractProfile);
      } else {
        setContractProfile({
          contract_type: "",
          governing_law: "",
          employer_name: "",
          contractor_name: "",
          engineer_name: "",
          contract_value_usd: null,
          start_date: "",
          completion_date: "",
          defects_notification_period_days: 365,
          notice_time_bar_days: 28,
          eot_clause_ref: "Sub-Clause 8.4",
          ld_rate_per_day: null,
          max_ld_cap_percentage: 10,
        });
      }

      if (notificationResult.data) {
        setNotifications(notificationResult.data as NotificationSettings);
      } else {
        setNotifications({
          task_assignment_notifications: true,
          due_date_notifications: true,
          overdue_notifications: true,
          assignment_email_enabled: false,
          project_timezone: "Asia/Singapore",
        });
      }

    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load project settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectLoading) return;

    if (projectError) {
      setError(projectError);
      return;
    }

    void loadAll();
  }, [projectId, tenantId, projectLoading, projectError]);

  async function saveProjectDetails() {
    if (!details || !projectId || !isProjectAdmin) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        project_name: details.project_name.trim(),
        project_code: details.project_code?.trim() || null,
        country: details.country?.trim() || null,
        jurisdiction: details.jurisdiction?.trim() || null,
        client_name: details.client_name?.trim() || null,
        contractor_name: details.contractor_name?.trim() || null,
        consultant_name: details.consultant_name?.trim() || null,
        contract_award_date: details.contract_award_date || null,
        project_start_date: details.project_start_date || null,
        contract_completion_date: details.contract_completion_date || null,
        baseline_start_date: details.baseline_start_date || null,
        baseline_completion_date: details.baseline_completion_date || null,
        current_data_date: details.current_data_date || null,
        forecast_completion_date: details.forecast_completion_date || null,
        program_name: details.program_name?.trim() || null,
        program_version: details.program_version?.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const result = await supabase
        .from("projects")
        .update(payload)
        .eq("id", projectId);

      if (result.error) throw new Error(result.error.message);

      setMessage("Project details saved.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save project details.");
    } finally {
      setLoading(false);
    }
  }

  async function saveContractProfile() {
    if (!contractProfile || !projectId || !tenantId || !isProjectAdmin) return;

    if (!contractProfile.contract_type.trim() || !contractProfile.governing_law.trim()) {
      setError("Contract type and governing law are required.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        tenant_id: tenantId,
        project_id: projectId,
        contract_type: contractProfile.contract_type.trim(),
        governing_law: contractProfile.governing_law.trim(),
        employer_name: contractProfile.employer_name?.trim() || null,
        contractor_name: contractProfile.contractor_name?.trim() || null,
        engineer_name: contractProfile.engineer_name?.trim() || null,
        contract_value_usd: contractProfile.contract_value_usd || null,
        start_date: contractProfile.start_date || null,
        completion_date: contractProfile.completion_date || null,
        defects_notification_period_days:
          contractProfile.defects_notification_period_days || 365,
        notice_time_bar_days: contractProfile.notice_time_bar_days || 28,
        eot_clause_ref: contractProfile.eot_clause_ref?.trim() || null,
        ld_rate_per_day: contractProfile.ld_rate_per_day || null,
        max_ld_cap_percentage: contractProfile.max_ld_cap_percentage ?? 10,
        updated_at: new Date().toISOString(),
      };

      if (contractProfile.id) {
        const result = await supabase
          .from("contract_profiles")
          .update(payload)
          .eq("id", contractProfile.id);

        if (result.error) throw new Error(result.error.message);
      } else {
        const result = await supabase
          .from("contract_profiles")
          .insert(payload)
          .select("id")
          .single();

        if (result.error) throw new Error(result.error.message);
      }

      setMessage("Contract profile saved.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save contract profile.");
    } finally {
      setLoading(false);
    }
  }

  async function sendInvitationEmail(invitationId: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Authenticated session could not be verified.");
    }

    const response = await fetch(`${API}/api/v1/project-invitations/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        invitation_id: invitationId,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          "Project Invitation API was not found. Restart the FastAPI backend with the updated retrieval_engine.py and project_invitation_router.py."
        );
      }

      throw new Error(
        data.detail || "Invitation was recorded but the email could not be sent."
      );
    }

    return data;
  }

  async function addMember() {
    if (!projectId || !memberEmail.trim() || !isProjectAdmin) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Authenticated session could not be verified.");
      }

      const email = memberEmail.trim().toLowerCase();

      const response = await fetch(`${API}/api/v1/project-invitations/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          project_id: projectId,
          email,
          role: memberRole,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "Project Invitation API was not found. Restart the FastAPI backend with the current invitation router."
          );
        }

        throw new Error(
          data.detail || "Unable to add or invite the project user."
        );
      }

      setMemberEmail("");
      setMemberRole("MEMBER");
      setMessage(data.message || "User access updated.");
      await loadAll();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to add or invite project user."
      );
    } finally {
      setLoading(false);
    }
  }

  async function resendInvitation(invitationId: string) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await sendInvitationEmail(invitationId);
      setMessage("Invitation resent.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to resend invitation.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelInvitation(invitationId: string) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await supabase.rpc("project_admin_cancel_invitation", {
        p_invitation_id: invitationId,
      });

      if (result.error) throw new Error(result.error.message);

      setMessage("Invitation cancelled.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to cancel invitation.");
    } finally {
      setLoading(false);
    }
  }

  async function updateMember(
    userId: string,
    role: string,
    status: string
  ) {
    if (!projectId || !isProjectAdmin) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await supabase.rpc("project_admin_update_member", {
        p_project_id: projectId,
        p_user_id: userId,
        p_role: role,
        p_status: status,
      });

      if (result.error) throw new Error(result.error.message);

      setMessage("Member access updated.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update member access.");
    } finally {
      setLoading(false);
    }
  }

  async function saveNotifications() {
    if (!projectId || !tenantId || !currentUserId || !isProjectAdmin) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        project_id: projectId,
        tenant_id: tenantId,
        ...notifications,
        updated_by: currentUserId,
        updated_at: new Date().toISOString(),
      };

      const result = await supabase
        .from("project_settings")
        .upsert(payload, { onConflict: "project_id" });

      if (result.error) throw new Error(result.error.message);

      setMessage("Notification policy saved.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save notification settings.");
    } finally {
      setLoading(false);
    }
  }

  async function changeLifecycle(nextStatus: string) {
    if (!projectId || !details || !isProjectAdmin) return;

    const label = pretty(nextStatus);
    const confirmed = window.confirm(
      `Change project status to ${label}?\n\n` +
        (nextStatus === "CLOSED" || nextStatus === "ARCHIVED"
          ? "Closed and archived projects do not count toward the active project entitlement."
          : nextStatus === "SLEEP"
          ? "Sleep keeps the project available and still counts toward the project entitlement."
          : "The project will return to active operation.")
    );

    if (!confirmed) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await supabase
        .from("projects")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);

      if (result.error) throw new Error(result.error.message);

      setDetails({ ...details, status: nextStatus });
      setMessage(`Project status changed to ${label}.`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to change project status.");
    } finally {
      setLoading(false);
    }
  }

  const tabs: Array<[TabKey, string, string]> = [
    ["project", "Project Details", "Core project and contract data"],
    ["users", "Users & Access", "Project membership administration"],
    ["permissions", "Roles & Permissions", "Authority model"],
    ["notifications", "Notifications", "Project notification policy"],
    ["ai", "AI Processing & Privacy", "Governed models and privacy architecture"],
    ["lifecycle", "Lifecycle", "Active, sleep, close or archive"],
  ];

  if (projectLoading) {
    return (
      <main className="min-h-screen bg-[#050608] p-8 text-white">
        <div className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-[#0D0F12] p-6 text-sm text-zinc-400">
          Loading selected project settings...
        </div>
      </main>
    );
  }

  if (projectError || !projectId || !tenantId) {
    return (
      <main className="min-h-screen bg-[#050608] p-8 text-white">
        <div className="mx-auto max-w-6xl rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-6">
          <div className="text-sm font-semibold text-rose-300">
            {projectError || "No active project is selected."}
          </div>
          <Link
            href="/portfolio"
            className="mt-4 inline-flex rounded-xl bg-[#D8A84E] px-4 py-2.5 text-xs font-bold text-[#111318]"
          >
            Return to Portfolio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className={cx(
        "min-h-screen bg-[var(--cx-bg)] text-[var(--cx-text)]",
        theme === "light" ? "cx-settings-light" : "cx-settings-dark"
      )}
    >
      <style>{`
        .cx-settings-dark{
          --cx-bg:#050608;
          --cx-background:#050608;
          --cx-foreground:#F4F1EA;
          --cx-panel:#080A0D;
          --cx-panel-2:#0D0F12;
          --cx-border:rgba(255,255,255,.08);
          --cx-divider:rgba(255,255,255,.08);
          --cx-text:#F4F1EA;
          --cx-muted:#9AA4AE;
          --cx-muted-strong:#AAB3BD;
          --cx-subtle:#68737E;
          --cx-hover:rgba(255,255,255,.035);
          --cx-gold:#D8A84E;
          --cx-footer-bg:#050608;
          --cx-footer-text:#F4F1EA;
          --cx-footer-muted:rgba(244,241,234,.40);
          --cx-footer-muted-strong:rgba(244,241,234,.48);
          --cx-footer-border:rgba(255,255,255,.065);
          --cx-footer-divider:rgba(255,255,255,.10);
          --cx-footer-hover:#F4F1EA;
          --cx-footer-accent:#D8A84E;
        }
        .cx-settings-light{
          --cx-bg:#F3F0E9;
          --cx-background:#F3F0E9;
          --cx-foreground:#17191C;
          --cx-panel:#FFFDF8;
          --cx-panel-2:#FFFFFF;
          --cx-border:rgba(23,25,28,.13);
          --cx-divider:rgba(23,25,28,.11);
          --cx-text:#17191C;
          --cx-muted:#5E6670;
          --cx-muted-strong:#34383D;
          --cx-subtle:#7A828A;
          --cx-hover:rgba(23,25,28,.045);
          --cx-gold:#D8A84E;
          --cx-footer-bg:#EBE7DE;
          --cx-footer-text:#17191C;
          --cx-footer-muted:#5B6269;
          --cx-footer-muted-strong:#4F565D;
          --cx-footer-border:rgba(23,25,28,.12);
          --cx-footer-divider:rgba(23,25,28,.12);
          --cx-footer-hover:#17191C;
          --cx-footer-accent:#765114;
          color-scheme:light;
        }
      `}</style>

      <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        <header className="rounded-3xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-5 lg:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#D8A84E]/30 bg-[#D8A84E]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#B98224]">
                  Project Administration
                </span>
                <span className="rounded-full border border-[var(--cx-border)] bg-[var(--cx-panel)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--cx-muted)]">
                  {pretty(currentProjectRole || "Member")}
                </span>
                {platformRole === "PLATFORM_ADMIN" && (
                  <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-sky-400">
                    Platform Admin
                  </span>
                )}
              </div>

              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--cx-text)]">
                Project Settings & Admin Controls
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--cx-muted)]">
                Govern project identity, access, AI policy, notifications and lifecycle from one project-scoped workspace.
              </p>

              <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-[var(--cx-muted)]">
                <span className="font-semibold text-[var(--cx-text)]">
                  {project?.project_name}
                  {project?.project_code ? ` · ${project.project_code}` : ""}
                </span>
                <span>Tenant: {tenantId}</span>
                <span>Project ID: {projectId}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] px-3 py-2">
                <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">
                  Plan
                </div>
                <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">
                  {entitlement?.plan_name || "—"}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] px-3 py-2">
                <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">
                  Project Seats
                </div>
                <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">
                  {activeProjectUsers}/{projectUserLimit}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] px-3 py-2">
                <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">
                  Plan Allowance
                </div>
                <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">
                  {entitlement?.project_limit ?? "—"} projects · {entitlement?.user_limit ?? "—"} seats
                </div>
              </div>

              <ContractXThemeSwitch
                theme={theme}
                onChange={setProjectSettingsTheme}
              />
            </div>
          </div>
        </header>

        <ContractXNoticeModal
          open={Boolean(error)}
          variant="error"
          title="ContractX could not complete the action"
          message={error}
          onClose={() => setError("")}
        />

        <ContractXNoticeModal
          open={!error && Boolean(message)}
          variant="success"
          title="Completed"
          message={message}
          onClose={() => setMessage("")}
        />

        {!isProjectAdmin && (
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3 text-xs leading-5 text-amber-500">
            You have project access, but administrative changes require OWNER, ADMIN or PLATFORM_ADMIN authority. Settings are shown in read-only mode.
          </div>
        )}

        <div className="mt-5 grid gap-5 xl:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-3 xl:sticky xl:top-5">
            <div className="px-3 pb-3 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--cx-subtle)]">
              Settings
            </div>

            <div className="space-y-1">
              {tabs.map(([key, label, description]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cx(
                    "w-full rounded-xl border px-3 py-3 text-left transition",
                    tab === key
                      ? "border-[#D8A84E]/35 bg-[#D8A84E]/[0.07]"
                      : "border-transparent hover:border-[var(--cx-border)] hover:bg-[var(--cx-hover)]"
                  )}
                >
                  <div
                    className={cx(
                      "text-xs font-semibold",
                      tab === key ? "text-[#B98224]" : "text-[var(--cx-text)]"
                    )}
                  >
                    {label}
                  </div>
                  <div className="mt-1 text-[9px] leading-4 text-[var(--cx-subtle)]">
                    {description}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 border-t border-[var(--cx-border)] pt-4">
              <Link
                href={`/portfolio`}
                className="block rounded-xl border border-[var(--cx-border)] px-3 py-2.5 text-center text-[10px] font-bold text-[var(--cx-muted)]"
              >
                Back to Portfolio
              </Link>
            </div>
          </aside>

          <div className="space-y-5">
            {tab === "project" && details && (
              <>
                <Panel
                  eyebrow="Project Identity"
                  title="Project Details"
                  action={
                    <button
                      type="button"
                      disabled={!isProjectAdmin || loading}
                      onClick={saveProjectDetails}
                      className="rounded-xl bg-[#D8A84E] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#111318] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Save Project
                    </button>
                  }
                >
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field
                      label="Project Name"
                      value={details.project_name || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) => setDetails({ ...details, project_name: v })}
                    />
                    <Field
                      label="Project Code"
                      value={details.project_code || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) => setDetails({ ...details, project_code: v })}
                    />
                    <Field label="Tenant ID" value={tenantId} readOnly />
                    <Field
                      label="Country"
                      value={details.country || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) => setDetails({ ...details, country: v })}
                    />
                    <Field
                      label="Jurisdiction"
                      value={details.jurisdiction || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) => setDetails({ ...details, jurisdiction: v })}
                    />
                    <Field label="Current Status" value={pretty(details.status)} readOnly />
                    <Field
                      label="Employer / Client"
                      value={details.client_name || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) => setDetails({ ...details, client_name: v })}
                    />
                    <Field
                      label="Contractor"
                      value={details.contractor_name || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) => setDetails({ ...details, contractor_name: v })}
                    />
                    <Field
                      label="Consultant / Engineer"
                      value={details.consultant_name || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) => setDetails({ ...details, consultant_name: v })}
                    />
                    <Field
                      label="Contract Award Date"
                      type="date"
                      value={details.contract_award_date || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) =>
                        setDetails({ ...details, contract_award_date: v })
                      }
                    />
                    <Field
                      label="Project Start Date"
                      type="date"
                      value={details.project_start_date || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) =>
                        setDetails({ ...details, project_start_date: v })
                      }
                    />
                    <Field
                      label="Contract Completion"
                      type="date"
                      value={details.contract_completion_date || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) =>
                        setDetails({ ...details, contract_completion_date: v })
                      }
                    />
                    <Field
                      label="Baseline Start"
                      type="date"
                      value={details.baseline_start_date || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) =>
                        setDetails({ ...details, baseline_start_date: v })
                      }
                    />
                    <Field
                      label="Baseline Completion"
                      type="date"
                      value={details.baseline_completion_date || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) =>
                        setDetails({ ...details, baseline_completion_date: v })
                      }
                    />
                    <Field
                      label="Current Data Date"
                      type="date"
                      value={details.current_data_date || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) =>
                        setDetails({ ...details, current_data_date: v })
                      }
                    />
                    <Field
                      label="Forecast Completion"
                      type="date"
                      value={details.forecast_completion_date || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) =>
                        setDetails({ ...details, forecast_completion_date: v })
                      }
                    />
                    <Field
                      label="Programme Name"
                      value={details.program_name || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) => setDetails({ ...details, program_name: v })}
                    />
                    <Field
                      label="Programme Version"
                      value={details.program_version || ""}
                      readOnly={!isProjectAdmin}
                      onChange={(v) =>
                        setDetails({ ...details, program_version: v })
                      }
                    />
                  </div>
                </Panel>

                {contractProfile && (
                  <Panel
                    eyebrow="Contract Administration"
                    title="Contract Profile"
                    action={
                      <button
                        type="button"
                        disabled={!isProjectAdmin || loading}
                        onClick={saveContractProfile}
                        className="rounded-xl border border-[#D8A84E]/40 bg-[#D8A84E]/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#B98224] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Save Contract Profile
                      </button>
                    }
                  >
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <Field
                        label="Contract Type"
                        value={contractProfile.contract_type || ""}
                        readOnly={!isProjectAdmin}
                        onChange={(v) =>
                          setContractProfile({ ...contractProfile, contract_type: v })
                        }
                        placeholder="e.g. FIDIC Yellow Book 2017"
                      />
                      <Field
                        label="Governing Law"
                        value={contractProfile.governing_law || ""}
                        readOnly={!isProjectAdmin}
                        onChange={(v) =>
                          setContractProfile({ ...contractProfile, governing_law: v })
                        }
                      />
                      <Field
                        label="Employer"
                        value={contractProfile.employer_name || ""}
                        readOnly={!isProjectAdmin}
                        onChange={(v) =>
                          setContractProfile({ ...contractProfile, employer_name: v })
                        }
                      />
                      <Field
                        label="Contractor"
                        value={contractProfile.contractor_name || ""}
                        readOnly={!isProjectAdmin}
                        onChange={(v) =>
                          setContractProfile({ ...contractProfile, contractor_name: v })
                        }
                      />
                      <Field
                        label="Engineer / Consultant"
                        value={contractProfile.engineer_name || ""}
                        readOnly={!isProjectAdmin}
                        onChange={(v) =>
                          setContractProfile({ ...contractProfile, engineer_name: v })
                        }
                      />
                      <Field
                        label="EOT Clause Reference"
                        value={contractProfile.eot_clause_ref || ""}
                        readOnly={!isProjectAdmin}
                        onChange={(v) =>
                          setContractProfile({ ...contractProfile, eot_clause_ref: v })
                        }
                      />
                      <Field
                        label="Notice Time Bar (Days)"
                        type="number"
                        value={String(contractProfile.notice_time_bar_days ?? "")}
                        readOnly={!isProjectAdmin}
                        onChange={(v) =>
                          setContractProfile({
                            ...contractProfile,
                            notice_time_bar_days: v ? Number(v) : null,
                          })
                        }
                      />
                      <Field
                        label="Defects Notification Period (Days)"
                        type="number"
                        value={String(
                          contractProfile.defects_notification_period_days ?? ""
                        )}
                        readOnly={!isProjectAdmin}
                        onChange={(v) =>
                          setContractProfile({
                            ...contractProfile,
                            defects_notification_period_days: v ? Number(v) : null,
                          })
                        }
                      />
                      <Field
                        label="Maximum LD Cap (%)"
                        type="number"
                        value={String(contractProfile.max_ld_cap_percentage ?? "")}
                        readOnly={!isProjectAdmin}
                        onChange={(v) =>
                          setContractProfile({
                            ...contractProfile,
                            max_ld_cap_percentage: v ? Number(v) : null,
                          })
                        }
                      />
                    </div>
                  </Panel>
                )}
              </>
            )}

            {tab === "users" && (
              <Panel
                eyebrow="Access Control"
                title="Users & Access"
                action={
                  <div className="text-right text-[10px] text-[var(--cx-muted)]">
                    <div>
                      Active {activeProjectUsers} / {projectUserLimit} project seats
                    </div>
                    <div className="mt-1 text-[9px] text-[var(--cx-subtle)]">
                      {remainingProjectUserSeats} seat
                      {remainingProjectUserSeats === 1 ? "" : "s"} remaining
                    </div>
                  </div>
                }
              >
                {isProjectAdmin && (
                  <div className="mb-5 grid gap-3 rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-4 md:grid-cols-[1fr_160px_auto]">
                    <Field
                      label="Existing ContractX User Email"
                      value={memberEmail}
                      onChange={setMemberEmail}
                      placeholder="user@company.com"
                    />
                    <label>
                      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--cx-subtle)]">
                        Project Role
                      </div>
                      <select
                        value={memberRole}
                        onChange={(e) => setMemberRole(e.target.value)}
                        className="w-full rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-2.5 text-xs text-[var(--cx-text)] outline-none"
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={
                        loading ||
                        !memberEmail.trim() ||
                        activeProjectUsers >= projectUserLimit
                      }
                      onClick={addMember}
                      className="self-end rounded-xl bg-[#D8A84E] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#111318] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {activeProjectUsers >= projectUserLimit
                        ? "Project Full"
                        : "Add User"}
                    </button>
                  </div>
                )}

                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-4">
                    <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">
                      Per Project
                    </div>
                    <div className="mt-2 text-xl font-semibold text-[var(--cx-text)]">
                      {projectUserLimit}
                    </div>
                    <div className="mt-1 text-[9px] text-[var(--cx-muted)]">
                      maximum active users
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-4">
                    <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">
                      Project Allowance
                    </div>
                    <div className="mt-2 text-xl font-semibold text-[var(--cx-text)]">
                      {entitlement?.project_limit ?? "—"}
                    </div>
                    <div className="mt-1 text-[9px] text-[var(--cx-muted)]">
                      projects in this plan
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-4">
                    <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">
                      Aggregate Seats
                    </div>
                    <div className="mt-2 text-xl font-semibold text-[var(--cx-text)]">
                      {entitlement?.user_limit ?? "—"}
                    </div>
                    <div className="mt-1 text-[9px] text-[var(--cx-muted)]">
                      across all projects
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[var(--cx-border)]">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[var(--cx-panel)]">
                      <tr className="text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Joined</th>
                        <th className="px-4 py-3 text-right">Control</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr
                          key={member.user_id}
                          className="border-t border-[var(--cx-border)]"
                        >
                          <td className="px-4 py-3">
                            <div className="text-xs font-semibold text-[var(--cx-text)]">
                              {member.full_name || member.email}
                            </div>
                            <div className="mt-1 text-[9px] text-[var(--cx-muted)]">
                              {member.email}
                              {member.job_title ? ` · ${member.job_title}` : ""}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full border border-[#D8A84E]/25 bg-[#D8A84E]/10 px-2.5 py-1 text-[9px] font-bold text-[#B98224]">
                              {member.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[10px] text-[var(--cx-muted)]">
                            {member.status}
                          </td>
                          <td className="px-4 py-3 text-[10px] text-[var(--cx-muted)]">
                            {fmtDate(member.joined_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isProjectAdmin ? (
                              <div className="inline-flex gap-2">
                                <select
                                  value={member.role}
                                  onChange={(e) =>
                                    void updateMember(
                                      member.user_id,
                                      e.target.value,
                                      member.status
                                    )
                                  }
                                  className="rounded-lg border border-[var(--cx-border)] bg-[var(--cx-panel)] px-2 py-1.5 text-[9px] text-[var(--cx-text)]"
                                >
                                  <option value="OWNER">Owner</option>
                                  <option value="ADMIN">Admin</option>
                                  <option value="MEMBER">Member</option>
                                </select>

                                <select
                                  value={member.status}
                                  onChange={(e) =>
                                    void updateMember(
                                      member.user_id,
                                      member.role,
                                      e.target.value
                                    )
                                  }
                                  className="rounded-lg border border-[var(--cx-border)] bg-[var(--cx-panel)] px-2 py-1.5 text-[9px] text-[var(--cx-text)]"
                                >
                                  <option value="ACTIVE">Active</option>
                                  <option value="INACTIVE">Inactive</option>
                                </select>
                              </div>
                            ) : (
                              <span className="text-[9px] text-[var(--cx-subtle)]">
                                Read only
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>


                <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)]">
                  <div className="flex flex-col gap-3 border-b border-[var(--cx-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[#B98224]">
                        Invitation Register
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--cx-muted)]">
                        Sent invitations for this project, including current status and administrative controls.
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-2.5 py-1 text-[9px] font-bold text-[var(--cx-muted)]">
                        {invitations.length} total
                      </span>
                      <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[9px] font-bold text-amber-500">
                        {pendingInvitations.length} pending
                      </span>
                    </div>
                  </div>

                  {invitations.length === 0 ? (
                    <div className="px-4 py-7 text-center">
                      <div className="text-xs font-semibold text-[var(--cx-text)]">
                        No invitations sent for this project.
                      </div>
                      <div className="mt-1 text-[9px] text-[var(--cx-muted)]">
                        New invitations will appear here immediately after they are created.
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <thead className="bg-[var(--cx-panel-2)]">
                          <tr className="text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Role</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Sent</th>
                            <th className="px-4 py-3">Expires</th>
                            <th className="px-4 py-3 text-right">Control</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invitations.map((invite) => {
                            const status = String(invite.status || "").toUpperCase();
                            const pending = status === "PENDING";
                            const accepted = status === "ACCEPTED";
                            const cancelled = status === "CANCELLED";
                            const expired = status === "EXPIRED";

                            return (
                              <tr
                                key={invite.id}
                                className="border-t border-[var(--cx-border)]"
                              >
                                <td className="px-4 py-3">
                                  <div className="text-xs font-semibold text-[var(--cx-text)]">
                                    {invite.email}
                                  </div>
                                </td>

                                <td className="px-4 py-3 text-[10px] font-semibold text-[var(--cx-muted)]">
                                  {invite.role}
                                </td>

                                <td className="px-4 py-3">
                                  <span
                                    className={cx(
                                      "inline-flex rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em]",
                                      pending &&
                                        "border-amber-400/25 bg-amber-400/10 text-amber-500",
                                      accepted &&
                                        "border-emerald-400/25 bg-emerald-400/10 text-emerald-500",
                                      cancelled &&
                                        "border-rose-400/20 bg-rose-400/[0.06] text-rose-500",
                                      expired &&
                                        "border-[var(--cx-border)] bg-[var(--cx-panel-2)] text-[var(--cx-subtle)]"
                                    )}
                                  >
                                    {status || "UNKNOWN"}
                                  </span>
                                </td>

                                <td className="px-4 py-3 text-[9px] text-[var(--cx-muted)]">
                                  {fmtDate(invite.invited_at)}
                                </td>

                                <td className="px-4 py-3 text-[9px] text-[var(--cx-muted)]">
                                  {pending ? fmtDate(invite.expires_at) : "—"}
                                </td>

                                <td className="px-4 py-3">
                                  <div className="flex justify-end gap-2">
                                    {pending ? (
                                      <>
                                        <button
                                          type="button"
                                          disabled={loading}
                                          onClick={() => void resendInvitation(invite.id)}
                                          className="rounded-lg border border-[var(--cx-border)] px-3 py-2 text-[9px] font-bold text-[var(--cx-text)] disabled:opacity-40"
                                        >
                                          Resend
                                        </button>
                                        <button
                                          type="button"
                                          disabled={loading}
                                          onClick={() => void cancelInvitation(invite.id)}
                                          className="rounded-lg border border-rose-400/20 px-3 py-2 text-[9px] font-bold text-rose-500 disabled:opacity-40"
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : accepted ? (
                                      <span className="text-[9px] font-semibold text-[var(--cx-subtle)]">
                                        Manage access above
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-[var(--cx-subtle)]">
                                        No action
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] px-4 py-3 text-[10px] leading-5 text-[var(--cx-muted)]">
                  ContractX keeps each project intentionally compact: maximum{" "}
                  <span className="font-semibold text-[var(--cx-text)]">
                    {projectUserLimit} active users per project
                  </span>.
                  {" "}The current {entitlement?.plan_name || "subscription"} plan allows{" "}
                  <span className="font-semibold text-[var(--cx-text)]">
                    {entitlement?.project_limit ?? "—"} projects
                  </span>{" "}
                  and{" "}
                  <span className="font-semibold text-[var(--cx-text)]">
                    {entitlement?.user_limit ?? "—"} aggregate project-user seats
                  </span>.
                  Existing ContractX accounts are added immediately. If the email is not yet registered, ContractX creates a 7-day pending invitation and sends the user a secure signup email. The project cap remains enforced server-side.
                </div>
              </Panel>
            )}

            {tab === "permissions" && (
              <Panel eyebrow="Governance" title="Roles & Permissions">
                <div className="overflow-x-auto rounded-xl border border-[var(--cx-border)]">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[var(--cx-panel)]">
                      <tr className="text-left text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">
                        <th className="px-4 py-3">Capability</th>
                        <th className="px-4 py-3 text-center">Owner</th>
                        <th className="px-4 py-3 text-center">Admin</th>
                        <th className="px-4 py-3 text-center">Member</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permissionRows.map(([label, owner, admin, member]) => (
                        <tr
                          key={String(label)}
                          className="border-t border-[var(--cx-border)]"
                        >
                          <td className="px-4 py-3 text-xs text-[var(--cx-text)]">
                            {String(label)}
                          </td>
                          {[owner, admin, member].map((allowed, index) => (
                            <td
                              key={index}
                              className="px-4 py-3 text-center text-xs"
                            >
                              <span
                                className={
                                  allowed ? "text-emerald-500" : "text-[var(--cx-subtle)]"
                                }
                              >
                                {allowed ? "✓" : "—"}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    [
                      "OWNER",
                      "Ultimate project authority. Can manage administrators and project lifecycle.",
                    ],
                    [
                      "ADMIN",
                      "Operational administrator. Can manage project configuration and member access.",
                    ],
                    [
                      "MEMBER",
                      "Project participant. Can use project modules within RLS-protected project scope.",
                    ],
                  ].map(([role, desc]) => (
                    <div
                      key={role}
                      className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-4"
                    >
                      <div className="text-xs font-bold text-[var(--cx-text)]">
                        {role}
                      </div>
                      <div className="mt-2 text-[10px] leading-5 text-[var(--cx-muted)]">
                        {desc}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {tab === "notifications" && (
              <Panel
                eyebrow="Project Policy"
                title="Notifications"
                action={
                  <button
                    type="button"
                    disabled={!isProjectAdmin || loading}
                    onClick={saveNotifications}
                    className="rounded-xl bg-[#D8A84E] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#111318] disabled:opacity-40"
                  >
                    Save Policy
                  </button>
                }
              >
                <div className="grid gap-3 lg:grid-cols-2">
                  <Toggle
                    label="Task Assignment Notifications"
                    description="Create in-app notifications when a project task is assigned."
                    checked={notifications.task_assignment_notifications}
                    disabled={!isProjectAdmin}
                    onChange={(value) =>
                      setNotifications({
                        ...notifications,
                        task_assignment_notifications: value,
                      })
                    }
                  />
                  <Toggle
                    label="Due Date Notifications"
                    description="Enable project reminders for tasks approaching their due date."
                    checked={notifications.due_date_notifications}
                    disabled={!isProjectAdmin}
                    onChange={(value) =>
                      setNotifications({
                        ...notifications,
                        due_date_notifications: value,
                      })
                    }
                  />
                  <Toggle
                    label="Overdue Notifications"
                    description="Enable overdue task notifications for project members."
                    checked={notifications.overdue_notifications}
                    disabled={!isProjectAdmin}
                    onChange={(value) =>
                      setNotifications({
                        ...notifications,
                        overdue_notifications: value,
                      })
                    }
                  />
                  <Toggle
                    label="Assignment Email"
                    description="Permit assignment emails when the outbound email service is configured."
                    checked={notifications.assignment_email_enabled}
                    disabled={!isProjectAdmin}
                    onChange={(value) =>
                      setNotifications({
                        ...notifications,
                        assignment_email_enabled: value,
                      })
                    }
                  />
                </div>

                <div className="mt-4 max-w-sm">
                  <Field
                    label="Project Time Zone"
                    value={notifications.project_timezone}
                    readOnly={!isProjectAdmin}
                    onChange={(v) =>
                      setNotifications({
                        ...notifications,
                        project_timezone: v,
                      })
                    }
                  />
                </div>
              </Panel>
            )}

            {tab === "ai" && (
              <Panel
                eyebrow="AI Governance"
                title="How ContractX Selects AI Models"
              >
                <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-[#D8A84E]/25 bg-[#D8A84E]/[0.055] p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#B98224]">
                            Current Production Provider
                          </div>
                          <div className="mt-2 text-lg font-semibold text-[var(--cx-text)]">
                            OpenAI
                          </div>
                          <div className="mt-1 text-[10px] text-[var(--cx-muted)]">
                            Governed ContractX registry · current active model: GPT-4o mini
                          </div>
                        </div>

                        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-500">
                          Active
                        </span>
                      </div>

                      <p className="mt-4 text-[11px] leading-6 text-[var(--cx-muted)]">
                        ContractX does not accept arbitrary model IDs from project users.
                        Models are admitted through a governed platform registry. The active
                        provider and model can be changed centrally by ContractX without
                        changing the project Vault, evidence structure or module workflows.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {[
                        [
                          "Minimum Context",
                          "Relevant evidence only",
                          "ContractX is designed to retrieve only the project context required for the requested analysis instead of sending complete document repositories to the model.",
                        ],
                        [
                          "Tenant / Project Isolation",
                          "Project-scoped processing",
                          "Private project information is scoped by tenant and project. Vault, document and evidence workflows remain tied to the selected project.",
                        ],
                        [
                          "Data Ownership",
                          "Customer retained",
                          "Project documents and project-specific records remain customer-owned. ContractX processes authorised information for contract, claims, delay and project intelligence.",
                        ],
                        [
                          "Shared Model Training",
                          "Disabled by ContractX policy",
                          "Customer project content is not intended to be used to train shared ContractX AI models. Privacy controls remain separate from model selection.",
                        ],
                      ].map(([label, title, description]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-4"
                        >
                          <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[var(--cx-subtle)]">
                            {label}
                          </div>
                          <div className="mt-2 text-xs font-semibold text-[var(--cx-text)]">
                            {title}
                          </div>
                          <p className="mt-2 text-[10px] leading-5 text-[var(--cx-muted)]">
                            {description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5">
                      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--cx-subtle)]">
                        Model Selection Logic
                      </div>

                      <div className="mt-4 space-y-3">
                        {[
                          [
                            "1",
                            "Approved Registry",
                            "ContractX maintains the list of validated providers and model configurations.",
                          ],
                          [
                            "2",
                            "Task Fit",
                            "The platform uses the approved production model for ContractX reasoning and document workflows.",
                          ],
                          [
                            "3",
                            "Privacy Boundary",
                            "The model receives only authorised, project-scoped context required for the task.",
                          ],
                          [
                            "4",
                            "Provider Evolution",
                            "A provider can be added or replaced later without restructuring project evidence or user workflows.",
                          ],
                        ].map(([step, title, description]) => (
                          <div
                            key={step}
                            className="flex gap-3 rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-3"
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#D8A84E]/35 bg-[#D8A84E]/10 text-[10px] font-black text-[#B98224]">
                              {step}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-[var(--cx-text)]">
                                {title}
                              </div>
                              <div className="mt-1 text-[9px] leading-4 text-[var(--cx-muted)]">
                                {description}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5">
                      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--cx-subtle)]">
                        Potential Future Providers
                      </div>

                      <div className="mt-4 space-y-3">
                        {[
                          [
                            "Anthropic",
                            "Provider integration reserved for future approved configuration.",
                          ],
                          [
                            "Google Gemini",
                            "Provider integration reserved for future approved configuration.",
                          ],
                        ].map(([provider, description]) => (
                          <div
                            key={provider}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-3"
                          >
                            <div>
                              <div className="text-xs font-semibold text-[var(--cx-text)]">
                                {provider}
                              </div>
                              <div className="mt-1 text-[9px] text-[var(--cx-muted)]">
                                {description}
                              </div>
                            </div>
                            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.10em] text-amber-500">
                              Coming Soon
                            </span>
                          </div>
                        ))}

                        <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.055] p-3">
                          <div className="text-xs font-semibold text-[var(--cx-text)]">
                            Private / Customer-Hosted Inference
                          </div>
                          <div className="mt-1 text-[9px] leading-4 text-[var(--cx-muted)]">
                            Future enterprise deployments can support customer-approved
                            private inference or customer-hosted models for restrictive
                            environments.
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] px-4 py-3 text-[9px] leading-5 text-[var(--cx-muted)]">
                      Centralized customer model selection is intentionally disabled at this
                      stage. ContractX governs the production model centrally so privacy,
                      validation, cost control and output consistency can be managed without
                      creating different AI configurations across individual projects.
                    </div>
                  </div>
                </div>
              </Panel>
            )}

            {tab === "lifecycle" && details && (
              <Panel eyebrow="Project Governance" title="Lifecycle Control">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    [
                      "ACTIVE",
                      "Active",
                      "Normal operating state. Counts toward the project entitlement.",
                    ],
                    [
                      "SLEEP",
                      "Sleep",
                      "Temporarily inactive but retained for future work. Still counts toward the project entitlement.",
                    ],
                    [
                      "CLOSED",
                      "Closed",
                      "Project delivery is complete. Retained for reference and no longer counts toward the active project entitlement.",
                    ],
                    [
                      "ARCHIVED",
                      "Archived",
                      "Long-term retained state. No longer counts toward the active project entitlement.",
                    ],
                  ].map(([value, label, description]) => {
                    const active = details.status === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!isProjectAdmin || loading}
                        onClick={() => void changeLifecycle(value)}
                        className={cx(
                          "rounded-2xl border p-4 text-left transition",
                          active
                            ? "border-[#D8A84E]/55 bg-[#D8A84E]/[0.07]"
                            : "border-[var(--cx-border)] bg-[var(--cx-panel)] hover:border-[#D8A84E]/30",
                          (!isProjectAdmin || loading) &&
                            "cursor-not-allowed opacity-60"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-bold text-[var(--cx-text)]">
                            {label}
                          </div>
                          {active && (
                            <span className="text-sm font-black text-[#B98224]">
                              ✓
                            </span>
                          )}
                        </div>
                        <div className="mt-3 text-[10px] leading-5 text-[var(--cx-muted)]">
                          {description}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/[0.04] p-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-rose-500">
                    Delete Project
                  </div>
                  <div className="mt-2 text-[10px] leading-5 text-[var(--cx-muted)]">
                    Permanent project deletion is intentionally not exposed here. Closing or archiving preserves contractual records, audit history, documents and evidence. Irreversible deletion should remain a separate controlled administrative process.
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>

        <div className="mt-8">
          <LegalFooter compact />
        </div>
      </div>
    </main>
  );
}
