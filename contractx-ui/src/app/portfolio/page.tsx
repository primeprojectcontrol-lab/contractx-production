"use client";







import Link from "next/link";



import React, { useEffect, useMemo, useState } from "react";



import LegalFooter from "@/components/LegalFooter";

import ContractXNoticeModal from "@/components/ContractXNoticeModal";

import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";



import { createClient } from "@/lib/supabase/client";







const API = "/api/contractx";







type Theme = "dark" | "light";



type ViewMode = "grid" | "table";







type RegistrationForm = {



  projectName: string;



  projectCode: string;



  country: string;



  jurisdiction: string;



  employerName: string;



  contractorName: string;



  consultantName: string;



  contractType: string;



  governingLaw: string;



};







type Entitlement = {



  organization_id: string;



  organization_name: string;



  plan_name: string;



  project_limit: number;



  user_limit: number;



  active_projects: number;



  remaining_projects: number;



  platform_role: "USER" | "PLATFORM_ADMIN";



  has_admin_controls: boolean;



};







const INITIAL_REGISTRATION_FORM: RegistrationForm = {



  projectName: "",



  projectCode: "",



  country: "Singapore",



  jurisdiction: "Singapore",



  employerName: "",



  contractorName: "",



  consultantName: "",



  contractType: "FIDIC Yellow Book 2017",



  governingLaw: "Singapore",



};







const CONTRACT_OPTIONS = [



  "FIDIC Yellow Book 2017",



  "FIDIC Red Book 2017",



  "FIDIC Silver Book 2017",



  "FIDIC Yellow Book 1999",



  "FIDIC Red Book 1999",



  "NEC4 ECC",



  "JCT Design and Build",



  "Bespoke / Amended Contract",



  "Other",



];







type PortfolioMetrics = {



  tasks_total: number;



  tasks_open: number;



  tasks_completed: number;



  tasks_overdue: number;



  tasks_critical: number;



  documents: number;



  project_users: number;



};







type PortfolioProject = {



  id: string;



  tenant_id: string;



  project_name: string;



  project_code?: string | null;



  status: string;



  jurisdiction?: string | null;



  stakeholder_role?: string | null;



  last_activity?: string | null;



  metrics: PortfolioMetrics;



};







type PortfolioSummary = {



  projects: number;



  active: number;



  on_hold: number;



  archived: number;



  open_tasks: number;



  overdue_tasks: number;



  critical_tasks: number;



  documents: number;



  project_users: number;



};







const EMPTY_SUMMARY: PortfolioSummary = {



  projects: 0,



  active: 0,



  on_hold: 0,



  archived: 0,



  open_tasks: 0,



  overdue_tasks: 0,



  critical_tasks: 0,



  documents: 0,



  project_users: 0,



};







function cx(...parts: Array<string | false | null | undefined>) {



  return parts.filter(Boolean).join(" ");



}







function pretty(value?: string | null) {



  return String(value || "")



    .replaceAll("_", " ")



    .toLowerCase()



    .replace(/\b\w/g, (char) => char.toUpperCase());



}







function formatDate(value?: string | null) {



  if (!value) return "No activity recorded";







  const date = new Date(value);







  if (Number.isNaN(date.getTime())) {



    return value;



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







function StatusBadge({ status }: { status: string }) {



  const value = status.toUpperCase();







  const tone =



    value === "ACTIVE"



      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-500"



      : value === "ON_HOLD" || value === "HOLD"



      ? "border-amber-400/25 bg-amber-400/10 text-amber-500"



      : value === "ARCHIVED" || value === "INACTIVE"



      ? "border-slate-400/25 bg-slate-400/10 text-slate-500"



      : "border-sky-400/25 bg-sky-400/10 text-sky-500";







  return (



    <span



      className={cx(



        "inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em]",



        tone



      )}



    >



      {pretty(value)}



    </span>



  );



}







function PortfolioDonut({



  summary,



}: {



  summary: PortfolioSummary;



}) {



  const values = [



    ["Active", summary.active, "var(--portfolio-chart-1)"],



    ["On Hold", summary.on_hold, "var(--portfolio-chart-2)"],



    ["Archived", summary.archived, "var(--portfolio-chart-3)"],



  ] as const;







  const accounted =



    summary.active + summary.on_hold + summary.archived;



  const other = Math.max(0, summary.projects - accounted);







  const allValues =



    other > 0



      ? [...values, ["Other", other, "var(--portfolio-chart-4)"] as const]



      : values;







  const total = Math.max(



    1,



    allValues.reduce((sum, [, count]) => sum + Number(count), 0)



  );







  let offset = 0;







  return (



    <div className="flex items-center gap-6">



      <svg viewBox="0 0 42 42" className="h-28 w-28 -rotate-90">



        <circle



          cx="21"



          cy="21"



          r="15.9155"



          fill="transparent"



          stroke="var(--cx-chart-track)"



          strokeWidth="5"



        />







        {allValues.map(([label, count, color]) => {



          const pct = (Number(count) / total) * 100;



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







      <div className="min-w-0 flex-1 space-y-2">



        {allValues.map(([label, count, color]) => (



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



            <span className="font-semibold text-[var(--cx-text)]">



              {count}



            </span>



          </div>



        ))}



      </div>



    </div>



  );



}







function ProjectActions({ project }: { project: PortfolioProject }) {



  const query = `?project=${encodeURIComponent(project.id)}`;







  const actions = [



    ["Dashboard", `/dashboard${query}`],



    ["Ask ContractX", `/ask-contractx${query}`],



    ["Bespoke Review", `/bespoke-review${query}`],



    ["Delay & Forensic", `/delay-analytics${query}`],



    ["Claims & Resolution", `/claims${query}`],



    ["Tasks", `/tasks${query}`],



    ["Documents", `/documents${query}`],



    ["Settings", `/project-settings${query}`],



  ];







  return (



    <div className="grid grid-cols-2 gap-2">



      {actions.map(([label, href]) => (



        <Link



          key={label}



          href={href}



          className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-2.5 text-center text-[10px] font-semibold text-[var(--cx-muted)] transition hover:border-[#D8A84E]/40 hover:text-[#B98224]"



        >



          {label}



        </Link>



      ))}



    </div>



  );



}







function Metric({



  label,



  value,



  alert = false,



}: {



  label: string;



  value: number;



  alert?: boolean;



}) {



  return (



    <div className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-3">



      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">



        {label}



      </div>



      <div



        className={cx(



          "mt-1 text-xl font-semibold",



          alert && value > 0



            ? "text-rose-500"



            : "text-[var(--cx-text)]"



        )}



      >



        {value}



      </div>



    </div>



  );



}







export default function PortfolioPage() {



  const supabase = useMemo(() => createClient(), []);







  const [theme, setTheme] = useState<Theme>("dark");



  const [viewMode, setViewMode] = useState<ViewMode>("grid");







  const [registerOpen, setRegisterOpen] = useState(false);



  const [registerSaving, setRegisterSaving] = useState(false);



  const [registerError, setRegisterError] = useState("");



  const [registerForm, setRegisterForm] =



    useState<RegistrationForm>(INITIAL_REGISTRATION_FORM);







  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);







  const [tenantId, setTenantId] = useState("");



  const [projects, setProjects] = useState<PortfolioProject[]>([]);



  const [summary, setSummary] =



    useState<PortfolioSummary>(EMPTY_SUMMARY);







  const [loading, setLoading] = useState(false);



  const [message, setMessage] = useState("");







  const [search, setSearch] = useState("");



  const [statusFilter, setStatusFilter] = useState("ALL");



  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);







  useEffect(() => {



    const saved =



      window.localStorage.getItem("contractx-portfolio-theme") ||



      window.localStorage.getItem("contractx-theme");







    const initialTheme: Theme = saved === "light" ? "light" : "dark";

    setTheme(initialTheme);

    document.documentElement.dataset.contractxTheme = initialTheme;







    const savedProjectId = window.localStorage.getItem(



      "contractx-selected-project"



    );







    if (savedProjectId) {



      setSelectedProjectId(savedProjectId);



    }



  }, []);







  function updateTheme(next: Theme) {

    setTheme(next);

    window.localStorage.setItem("contractx-theme", next);

    window.localStorage.setItem("contractx-portfolio-theme", next);

    document.documentElement.dataset.contractxTheme = next;

    window.dispatchEvent(
      new CustomEvent("contractx-theme-change", {
        detail: next,
      })
    );

  }



  function selectProject(projectId: string) {



    setSelectedProjectId((current) => {



      if (current === projectId) {



        window.localStorage.removeItem("contractx-selected-project");



        return null;



      }







      window.localStorage.setItem(



        "contractx-selected-project",



        projectId



      );



      return projectId;



    });



  }







  async function loadPortfolio() {



    setLoading(true);



    setMessage("");







    try {



      const {



        data: { user },



        error: userError,



      } = await supabase.auth.getUser();







      if (userError || !user) {



        throw new Error("Your authenticated session could not be verified.");



      }







      const entitlementResult = await supabase.rpc("get_my_entitlement");







      if (entitlementResult.error) {



        throw new Error(entitlementResult.error.message);



      }







      const entitlementRow = Array.isArray(entitlementResult.data)



        ? entitlementResult.data[0]



        : entitlementResult.data;







      setEntitlement(



        entitlementRow



          ? {



              organization_id: entitlementRow.organization_id,



              organization_name: entitlementRow.organization_name,



              plan_name: entitlementRow.plan_name,



              project_limit: Number(entitlementRow.project_limit ?? 0),



              user_limit: Number(entitlementRow.user_limit ?? 0),



              active_projects: Number(entitlementRow.active_projects ?? 0),



              remaining_projects: Number(entitlementRow.remaining_projects ?? 0),



              platform_role: entitlementRow.platform_role,



              has_admin_controls: Boolean(entitlementRow.has_admin_controls),



            }



          : null



      );







      const membershipResult = await supabase



        .from("project_users")



        .select("project_id, role, status")



        .eq("user_id", user.id)



        .eq("status", "ACTIVE");







      if (membershipResult.error) {



        throw new Error(membershipResult.error.message);



      }







      const projectIds = Array.from(



        new Set(



          (membershipResult.data ?? [])



            .map((item) => item.project_id)



            .filter(Boolean)



        )



      );







      if (projectIds.length === 0) {



        setProjects([]);



        setSummary(EMPTY_SUMMARY);



        return;



      }







      const projectResult = await supabase



        .from("projects")



        .select("*")



        .in("id", projectIds)



        .order("project_name", { ascending: true });







      if (projectResult.error) {



        throw new Error(projectResult.error.message);



      }







      const rawProjects = projectResult.data ?? [];







      const [



        taskResult,



        userResult,



      ] = await Promise.all([



        supabase



          .from("project_tasks")



          .select(



            "project_id,status,priority,due_date,created_at,updated_at"



          )



          .in("project_id", projectIds),



        supabase



          .from("project_users")



          .select("project_id,user_id,status,joined_at,updated_at")



          .in("project_id", projectIds)



          .eq("status", "ACTIVE"),



      ]);







      if (taskResult.error) {



        throw new Error(taskResult.error.message);



      }







      if (userResult.error) {



        throw new Error(userResult.error.message);



      }







      let documentRows: Array<{



        id: string;



        project_id: string;



        created_at?: string | null;



        updated_at?: string | null;



      }> = [];







      const documentResult = await supabase



        .from("project_documents")



        .select("id,project_id,created_at,updated_at")



        .in("project_id", projectIds);







      if (!documentResult.error) {



        documentRows = documentResult.data ?? [];



      }







      const tasks = taskResult.data ?? [];



      const members = userResult.data ?? [];



      const today = new Date();



      today.setHours(0, 0, 0, 0);







      const rows: PortfolioProject[] = rawProjects.map((project) => {



        const projectTasks = tasks.filter(



          (item) => item.project_id === project.id



        );







        const projectDocs = documentRows.filter(



          (item) => item.project_id === project.id



        );







        const projectMembers = members.filter(



          (item) => item.project_id === project.id



        );







        const openTasks = projectTasks.filter(



          (item) =>



            !["COMPLETED", "CANCELLED"].includes(



              String(item.status || "").toUpperCase()



            )



        );







        const overdueTasks = openTasks.filter((item) => {



          if (!item.due_date) return false;







          const due = new Date(`${item.due_date}T00:00:00`);



          if (Number.isNaN(due.getTime())) return false;







          return due < today;



        });







        const criticalTasks = openTasks.filter(



          (item) =>



            String(item.priority || "").toUpperCase() === "CRITICAL"



        );







        const activityCandidates = [



          project.updated_at,



          project.created_at,



          ...projectTasks.flatMap((item) => [



            item.updated_at,



            item.created_at,



          ]),



          ...projectDocs.flatMap((item) => [



            item.updated_at,



            item.created_at,



          ]),



          ...projectMembers.flatMap((item) => [



            item.updated_at,



            item.joined_at,



          ]),



        ]



          .filter(Boolean)



          .map(String);







        const lastActivity =



          activityCandidates.length > 0



            ? activityCandidates.sort().at(-1) ?? null



            : null;







        return {



          id: project.id,



          tenant_id: project.tenant_id,



          project_name:



            project.project_name ||



            project.name ||



            project.title ||



            "Untitled Project",



          project_code:



            project.project_code || project.code || null,



          status: String(project.status || "ACTIVE").toUpperCase(),



          jurisdiction:



            project.jurisdiction ||



            project.country ||



            project.region ||



            null,



          stakeholder_role:



            project.stakeholder_role ||



            project.role ||



            project.company_type ||



            null,



          last_activity: lastActivity,



          metrics: {



            tasks_total: projectTasks.length,



            tasks_open: openTasks.length,



            tasks_completed: projectTasks.filter(



              (item) =>



                String(item.status || "").toUpperCase() ===



                "COMPLETED"



            ).length,



            tasks_overdue: overdueTasks.length,



            tasks_critical: criticalTasks.length,



            documents: projectDocs.length,



            project_users: projectMembers.length,



          },



        };



      });







      const filtered = rows.filter((project) => {



        if (



          statusFilter !== "ALL" &&



          project.status !== statusFilter



        ) {



          return false;



        }







        if (!search.trim()) return true;







        const needle = search.trim().toLowerCase();







        return [



          project.project_name,



          project.project_code,



          project.jurisdiction,



          project.stakeholder_role,



          project.status,



        ]



          .filter(Boolean)



          .join(" ")



          .toLowerCase()



          .includes(needle);



      });







      setProjects(filtered);







      setSummary({



        projects: filtered.length,



        active: filtered.filter(



          (project) => project.status === "ACTIVE"



        ).length,



        on_hold: filtered.filter((project) =>



          ["ON_HOLD", "HOLD"].includes(project.status)



        ).length,



        archived: filtered.filter((project) =>



          ["ARCHIVED", "INACTIVE"].includes(project.status)



        ).length,



        open_tasks: filtered.reduce(



          (sum, project) => sum + project.metrics.tasks_open,



          0



        ),



        overdue_tasks: filtered.reduce(



          (sum, project) =>



            sum + project.metrics.tasks_overdue,



          0



        ),



        critical_tasks: filtered.reduce(



          (sum, project) =>



            sum + project.metrics.tasks_critical,



          0



        ),



        documents: filtered.reduce(



          (sum, project) => sum + project.metrics.documents,



          0



        ),



        project_users: filtered.reduce(



          (sum, project) =>



            sum + project.metrics.project_users,



          0



        ),



      });







      if (rawProjects[0]?.tenant_id) {



        setTenantId(rawProjects[0].tenant_id);



      }



    } catch (error) {



      setProjects([]);



      setSummary(EMPTY_SUMMARY);



      setEntitlement(null);



      setMessage(



        error instanceof Error



          ? error.message



          : "Unable to load ContractX portfolio."



      );



    } finally {



      setLoading(false);



    }



  }







  useEffect(() => {



    void loadPortfolio();



    // eslint-disable-next-line react-hooks/exhaustive-deps



  }, [statusFilter]);







  const statusOptions = useMemo(() => {



    const options = new Set<string>(["ALL"]);







    projects.forEach((project) => {



      options.add(project.status);



    });







    return Array.from(options);



  }, [projects]);







  const canRegisterProject =



    !entitlement || entitlement.remaining_projects > 0;







  const selectedProject =



    projects.find((project) => project.id === selectedProjectId) || null;







  function updateRegistrationField(



    key: keyof RegistrationForm,



    value: string



  ) {



    setRegisterForm((previous) => ({



      ...previous,



      [key]: value,



    }));



  }







  const registrationComplete =



    registerForm.projectName.trim() &&



    registerForm.projectCode.trim() &&



    registerForm.country.trim() &&



    registerForm.jurisdiction.trim() &&



    registerForm.employerName.trim() &&



    registerForm.contractorName.trim() &&



    registerForm.contractType.trim() &&



    registerForm.governingLaw.trim();







  async function registerProject(



    event: React.FormEvent<HTMLFormElement>



  ) {



    event.preventDefault();







    if (!registrationComplete || registerSaving) return;







    if (entitlement && entitlement.remaining_projects <= 0) {



      setRegisterError(



        `Project limit reached for ${entitlement.plan_name}. Close or archive an existing project, or change plan.`



      );



      return;



    }







    setRegisterSaving(true);



    setRegisterError("");







    try {



      const {



        data: { user },



        error: userError,



      } = await supabase.auth.getUser();







      if (userError || !user) {



        throw new Error("Your authenticated session could not be verified.");



      }







      const currentTenant =



        tenantId.trim() ||



        (typeof user.app_metadata?.tenant_id === "string"



          ? user.app_metadata.tenant_id



          : "") ||



        user.id;







      const { data: project, error: projectError } =



        await supabase



          .from("projects")



          .insert({



            tenant_id: currentTenant,



            project_name: registerForm.projectName.trim(),



            project_code: registerForm.projectCode.trim(),



            status: "ACTIVE",



            country: registerForm.country.trim(),



            jurisdiction: registerForm.jurisdiction.trim(),



            client_name: registerForm.employerName.trim(),



            contractor_name: registerForm.contractorName.trim(),



            consultant_name:



              registerForm.consultantName.trim() || null,



            created_by: user.id,



          })



          .select("id")



          .single();







      if (projectError || !project) {



        throw new Error(



          projectError?.message || "Project registration failed."



        );



      }







      const { error: profileError } = await supabase



        .from("contract_profiles")



        .insert({



          tenant_id: currentTenant,



          project_id: project.id,



          contract_type: registerForm.contractType.trim(),



          governing_law: registerForm.governingLaw.trim(),



          employer_name: registerForm.employerName.trim(),



          contractor_name: registerForm.contractorName.trim(),



          engineer_name:



            registerForm.consultantName.trim() || null,



        });







      if (profileError) {



        throw new Error(



          `Project created, but contract profile could not be saved: ${profileError.message}`



        );



      }







      setTenantId(currentTenant);



      setRegisterForm(INITIAL_REGISTRATION_FORM);



      setRegisterOpen(false);



      await loadPortfolio();



    } catch (error) {



      setRegisterError(



        error instanceof Error



          ? error.message



          : "Unable to register project."



      );



    } finally {



      setRegisterSaving(false);



    }



  }







  return (



    <main



      className={cx(



        "cx-portfolio flex min-h-screen flex-col",



        theme === "light" ? "cx-light" : "cx-dark"



      )}



    >



      <style>{`



        .cx-portfolio {



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



          --portfolio-chart-1:#34D399;



          --portfolio-chart-2:#F59E0B;



          --portfolio-chart-3:#64748B;



          --portfolio-chart-4:#38BDF8;



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



          background:var(--cx-bg);



          color:var(--cx-text);



          transition:background .2s ease,color .2s ease;



        }







        .cx-portfolio.cx-light {



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



          --portfolio-chart-1:#26865E;



          --portfolio-chart-2:#B97708;



          --portfolio-chart-3:#64748B;



          --portfolio-chart-4:#2787B8;



          --cx-footer-bg:#F3F5F7;



          --cx-footer-text:#172033;



          --cx-footer-muted:#566577;



          --cx-footer-muted-strong:#46566A;



          --cx-footer-muted-soft:#758295;



          --cx-footer-border:#D9E0E8;



          --cx-footer-border-soft:#E3E8EE;



          --cx-footer-divider:#D9E0E8;



          --cx-footer-hover:#172033;



          --cx-footer-accent:#A87924;



          background:var(--cx-bg);



          color:var(--cx-text);



        }







        .cx-portfolio input,



        .cx-portfolio select {



          background:var(--cx-panel-2);



          color:var(--cx-text);



          border-color:var(--cx-border);



        }







        .cx-portfolio input::placeholder {



          color:var(--cx-subtle);



        }



      `}</style>







      <div className="mx-auto w-full max-w-[1700px] flex-1 px-5 py-6 lg:px-8">



        <header className="rounded-3xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5 lg:p-6">



          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">



            <div>



              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#D8A84E]">
                Portfolio
              </div>











              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--cx-text)] lg:text-4xl">



                Portfolio Control Centre



              </h1>







              <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--cx-muted)]">



                Executive visibility across projects available to your



                authenticated ContractX account, with project activity, task



                pressure, evidence volume and direct entry into each workspace.



              </p>



              {entitlement && (



                <div className="mt-3 flex flex-wrap items-center gap-2">



                  <span className="rounded-full border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-1 text-[10px] font-semibold text-[var(--cx-text)]">



                    {entitlement.plan_name}



                  </span>



                  <span className="rounded-full border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-1 text-[10px] text-[var(--cx-muted)]">



                    {entitlement.active_projects}/{entitlement.project_limit} active projects



                  </span>



                  {entitlement.has_admin_controls && (



                    <span className="rounded-full border border-[#D8A84E]/25 bg-[#D8A84E]/10 px-3 py-1 text-[10px] font-semibold text-[#B98224]">



                      Platform Admin



                    </span>



                  )}



                </div>



              )}



            </div>







            <div className="flex flex-wrap items-center gap-2">



              <ContractXThemeSwitch theme={theme} onChange={updateTheme} />







              {selectedProjectId ? (



                <Link



                  href={`/project-settings?project=${encodeURIComponent(selectedProjectId)}`}



                  className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-4 py-2.5 text-xs font-semibold text-[var(--cx-muted)] transition hover:border-[#D8A84E]/45 hover:text-[var(--cx-text)]"



                >



                  Project Settings



                </Link>



              ) : (



                <button



                  type="button"



                  disabled



                  title="Select a project first"



                  className="cursor-not-allowed rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-4 py-2.5 text-xs font-semibold text-[var(--cx-subtle)] opacity-50"



                >



                  Project Settings



                </button>



              )}







              <button



                type="button"



                disabled={!canRegisterProject}



                onClick={() => {



                  setRegisterError("");



                  if (canRegisterProject) setRegisterOpen(true);



                }}



                className="rounded-xl bg-[#D8A84E] px-4 py-2.5 text-xs font-semibold text-[#111318] disabled:cursor-not-allowed disabled:opacity-45"



              >



                {canRegisterProject ? "+ Register Project" : "Project Limit Reached"}



              </button>



            </div>



          </div>







          {summary.projects > 0 && (



          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1.4fr)_180px_auto]">



            <label>



              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--cx-subtle)]">



                Tenant



              </div>



              <input



                value={tenantId}



                readOnly



                className="w-full cursor-default rounded-xl border px-3 py-2.5 text-xs outline-none"



              />



            </label>







            <label>



              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--cx-subtle)]">



                Search Portfolio



              </div>



              <input



                value={search}



                onChange={(event) => setSearch(event.target.value)}



                onKeyDown={(event) => {



                  if (event.key === "Enter") {



                    void loadPortfolio();



                  }



                }}



                placeholder="Project name, code, jurisdiction, role..."



                className="w-full rounded-xl border px-3 py-2.5 text-xs outline-none"



              />



            </label>







            <label>



              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--cx-subtle)]">



                Status



              </div>



              <select



                value={statusFilter}



                onChange={(event) =>



                  setStatusFilter(event.target.value)



                }



                className="w-full rounded-xl border px-3 py-2.5 text-xs outline-none"



              >



                {statusOptions.map((item) => (



                  <option key={item} value={item}>



                    {item === "ALL" ? "All projects" : pretty(item)}



                  </option>



                ))}



              </select>



            </label>







            <div className="flex items-end gap-2">



              <button



                type="button"



                onClick={() => void loadPortfolio()}



                className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-4 py-2.5 text-xs font-semibold text-[var(--cx-muted)]"



              >



                {loading ? "Refreshing..." : "Refresh"}



              </button>







              <div className="flex rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-1">



                {(["grid", "table"] as ViewMode[]).map((mode) => (



                  <button



                    key={mode}



                    type="button"



                    onClick={() => setViewMode(mode)}



                    className={cx(



                      "rounded-lg px-3 py-1.5 text-[10px] font-semibold",



                      viewMode === mode



                        ? "bg-[#D8A84E] text-[#111318]"



                        : "text-[var(--cx-muted)]"



                    )}



                  >



                    {pretty(mode)}



                  </button>



                ))}



              </div>



            </div>



          </div>



          )}



        </header>







        <ContractXNoticeModal
          open={Boolean(message)}
          variant="error"
          message={message}
          onClose={() => setMessage("")}
        />



        {summary.projects > 0 && (



          <>



        <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,.7fr)]">



          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">



            {[



              ["Projects", summary.projects, "Registered"],



              ["Open Actions", summary.open_tasks, "Portfolio-wide"],



              ["Overdue", summary.overdue_tasks, "Requires attention"],



              ["Documents", summary.documents, "Private Vault"],



            ].map(([label, value, note]) => (



              <div



                key={String(label)}



                className="rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-4"



              >



                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--cx-subtle)]">



                  {label}



                </div>



                <div className="mt-2 text-3xl font-semibold text-[var(--cx-text)]">



                  {value}



                </div>



                <div className="mt-1 text-[10px] text-[var(--cx-muted)]">



                  {note}



                </div>



              </div>



            ))}



          </div>







          <div className="rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5">



            <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cx-subtle)]">



              Portfolio Status



            </div>



            <PortfolioDonut summary={summary} />



          </div>



        </section>







          </>



        )}







        <section className="mt-5 rounded-2xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-5">



          {summary.projects > 0 && (



            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">



              <div>



                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#D8A84E]">



                  Project Register



                </div>



                <h2 className="mt-1 text-lg font-semibold text-[var(--cx-text)]">



                  Registered ContractX Projects



                </h2>



              </div>







              <div className="text-[10px] text-[var(--cx-muted)]">



                {projects.length} project{projects.length === 1 ? "" : "s"} in current view



              </div>



            </div>



          )}







          {loading ? (



            <div className="py-16 text-center text-sm text-[var(--cx-muted)]">



              Loading portfolio...



            </div>



          ) : projects.length === 0 ? (



            <div className="mt-5 flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-6 py-14 text-center">



              <div className="max-w-md">



                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D8A84E]/25 bg-[#D8A84E]/10 text-lg font-semibold text-[#B98224]">



                  +



                </div>







                <div className="mt-5 text-lg font-semibold text-[var(--cx-text)]">



                  Start your project portfolio



                </div>







                <div className="mt-2 text-xs leading-5 text-[var(--cx-muted)]">



                  No portfolio analytics are shown until a project exists.



                  Register the first project here without leaving this page.



                </div>







                <button



                  type="button"



                  disabled={!canRegisterProject}



                  onClick={() => {



                    setRegisterError("");



                    if (canRegisterProject) setRegisterOpen(true);



                  }}



                  className="mt-6 rounded-xl bg-[#D8A84E] px-5 py-3 text-xs font-semibold text-[#111318] disabled:cursor-not-allowed disabled:opacity-45"



                >



                  {canRegisterProject ? "Register Project" : "Project Limit Reached"}



                </button>







                {!canRegisterProject && entitlement && (



                  <div className="mt-3 text-[10px] leading-5 text-[var(--cx-muted)]">



                    {entitlement.plan_name} allows {entitlement.project_limit} active project



                    {entitlement.project_limit === 1 ? "" : "s"}. Close or archive an



                    existing project before registering another.



                  </div>



                )}



              </div>



            </div>



          ) : viewMode === "grid" ? (



            <>



              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">



                <div>



                  <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--cx-subtle)]">



                    Current Project Selection



                  </div>



                  <div className="mt-1 text-xs font-semibold text-[var(--cx-text)]">



                    {selectedProject



                      ? `${selectedProject.project_name}${selectedProject.project_code ? ` · ${selectedProject.project_code}` : ""}`



                      : "No project selected"}



                  </div>



                </div>







                <div className="max-w-xl text-[10px] leading-5 text-[var(--cx-muted)]">



                  ACTIVE is the project lifecycle status. The gold selector identifies the project currently selected for ContractX modules.



                </div>



              </div>







              <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">



                {projects.map((project) => {



                  const selected = selectedProjectId === project.id;







                  return (



                    <article



                      key={project.id}



                      onClick={() => selectProject(project.id)}



                      className={cx(



                        "cursor-pointer rounded-2xl border p-5 transition-all duration-200",



                        selected



                          ? "border-[#D8A84E]/70 bg-[#D8A84E]/[0.055] shadow-[0_0_0_1px_rgba(216,168,78,.10),0_16px_45px_rgba(0,0,0,.14)]"



                          : "border-[var(--cx-border)] bg-[var(--cx-panel-2)] hover:border-[#D8A84E]/30"



                      )}



                    >



                      <div className="mb-4 flex items-center justify-between gap-3">



                        <button



                          type="button"



                          onClick={(event) => {



                            event.stopPropagation();



                            selectProject(project.id);



                          }}



                          className={cx(



                            "inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] transition",



                            selected



                              ? "text-[#B98224]"



                              : "text-[var(--cx-subtle)] hover:text-[#B98224]"



                          )}



                          aria-pressed={selected}



                        >



                          <span



                            className={cx(



                              "flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold",



                              selected



                                ? "border-[#D8A84E] bg-[#D8A84E] text-[#111318]"



                                : "border-[var(--cx-border)] bg-[var(--cx-panel)] text-transparent"



                            )}



                          >



                            ✓



                          </span>



                          {selected ? "Selected Project" : "Select Project"}



                        </button>







                        <StatusBadge status={project.status} />



                      </div>







                      <div className="flex items-start justify-between gap-4">



                        <div className="min-w-0">



                          <h3 className="truncate text-lg font-semibold text-[var(--cx-text)]">



                            {project.project_name}



                          </h3>







                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--cx-muted)]">



                            {project.project_code && <span>{project.project_code}</span>}



                            {project.jurisdiction && <span>{pretty(project.jurisdiction)}</span>}



                            {project.stakeholder_role && <span>{pretty(project.stakeholder_role)}</span>}



                          </div>



                        </div>







                        {project.metrics.tasks_critical > 0 && (



                          <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-[9px] font-bold text-rose-500">



                            {project.metrics.tasks_critical} critical



                          </span>



                        )}



                      </div>







                      <div className="mt-5 grid grid-cols-4 gap-2">



                        <Metric label="Open" value={project.metrics.tasks_open} />



                        <Metric label="Overdue" value={project.metrics.tasks_overdue} alert />



                        <Metric label="Docs" value={project.metrics.documents} />



                        <Metric label="Users" value={project.metrics.project_users} />



                      </div>







                      <div className="mt-4 rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] px-3 py-2.5">



                        <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">



                          Last Activity



                        </div>



                        <div className="mt-1 text-[10px] text-[var(--cx-muted)]">



                          {formatDate(project.last_activity)}



                        </div>



                      </div>







                      {selected ? (



                        <div className="mt-4" onClick={(event) => event.stopPropagation()}>



                          <Link



                            href={`/dashboard?project=${encodeURIComponent(project.id)}`}



                            className="mb-3 flex w-full items-center justify-center rounded-xl border border-[#D8A84E]/45 bg-[#D8A84E] px-4 py-3 text-xs font-semibold text-[#111318] transition hover:bg-[#E3BB69]"



                          >



                            Open Selected Project



                          </Link>







                          <ProjectActions project={project} />



                        </div>



                      ) : (



                        <div className="mt-4 rounded-xl border border-dashed border-[var(--cx-border)] px-4 py-3 text-center text-[10px] font-medium text-[var(--cx-subtle)]">



                          Select this project to open its modules



                        </div>



                      )}



                    </article>



                  );



                })}



              </div>



            </>



          ) : (



            <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--cx-border)]">



              <table className="min-w-[1100px] w-full border-collapse text-left">



                <thead className="bg-[var(--cx-panel-2)]">



                  <tr>



                    {[



                      "Select",



                      "Project",



                      "Status",



                      "Jurisdiction",



                      "Role",



                      "Open",



                      "Overdue",



                      "Documents",



                      "Users",



                      "Last Activity",



                      "",



                    ].map((heading) => (



                      <th



                        key={heading}



                        className="border-b border-[var(--cx-border)] px-4 py-3 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]"



                      >



                        {heading}



                      </th>



                    ))}



                  </tr>



                </thead>







                <tbody>



                  {projects.map((project) => {



                    const selected = selectedProjectId === project.id;







                    return (



                      <tr



                        key={project.id}



                        onClick={() => selectProject(project.id)}



                        className={cx(



                          "cursor-pointer border-b last:border-b-0 transition",



                          selected



                            ? "border-[#D8A84E]/35 bg-[#D8A84E]/[0.055]"



                            : "border-[var(--cx-border)] hover:bg-[var(--cx-hover)]"



                        )}



                      >



                        <td className="px-4 py-3">



                          <button



                            type="button"



                            onClick={(event) => {



                              event.stopPropagation();



                              selectProject(project.id);



                            }}



                            className={cx(



                              "flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold",



                              selected



                                ? "border-[#D8A84E] bg-[#D8A84E] text-[#111318]"



                                : "border-[var(--cx-border)] text-transparent"



                            )}



                            aria-pressed={selected}



                          >



                            ✓



                          </button>



                        </td>



                        <td className="px-4 py-3">



                          <div className="text-xs font-semibold text-[var(--cx-text)]">



                            {project.project_name}



                          </div>



                          <div className="mt-1 text-[9px] text-[var(--cx-muted)]">



                            {project.project_code || project.id}



                          </div>



                        </td>



                        <td className="px-4 py-3">



                          <StatusBadge status={project.status} />



                        </td>



                        <td className="px-4 py-3 text-xs text-[var(--cx-muted)]">



                          {project.jurisdiction ? pretty(project.jurisdiction) : "—"}



                        </td>



                        <td className="px-4 py-3 text-xs text-[var(--cx-muted)]">



                          {project.stakeholder_role ? pretty(project.stakeholder_role) : "—"}



                        </td>



                        <td className="px-4 py-3 text-xs font-semibold text-[var(--cx-text)]">



                          {project.metrics.tasks_open}



                        </td>



                        <td className="px-4 py-3 text-xs font-semibold text-rose-500">



                          {project.metrics.tasks_overdue}



                        </td>



                        <td className="px-4 py-3 text-xs text-[var(--cx-muted)]">



                          {project.metrics.documents}



                        </td>



                        <td className="px-4 py-3 text-xs text-[var(--cx-muted)]">



                          {project.metrics.project_users}



                        </td>



                        <td className="px-4 py-3 text-[10px] text-[var(--cx-muted)]">



                          {formatDate(project.last_activity)}



                        </td>



                        <td



                          className="px-4 py-3 text-right"



                          onClick={(event) => event.stopPropagation()}



                        >



                          {selected ? (



                            <Link



                              href={`/dashboard?project=${encodeURIComponent(project.id)}`}



                              className="rounded-lg border border-[#D8A84E]/45 bg-[#D8A84E] px-3 py-2 text-[10px] font-semibold text-[#111318]"



                            >



                              Open Selected



                            </Link>



                          ) : (



                            <button



                              type="button"



                              onClick={() => selectProject(project.id)}



                              className="rounded-lg border border-[var(--cx-border)] px-3 py-2 text-[10px] font-semibold text-[var(--cx-muted)] transition hover:border-[#D8A84E]/35 hover:text-[#B98224]"



                            >



                              Select



                            </button>



                          )}



                        </td>



                      </tr>



                    );



                  })}                </tbody>



              </table>



            </div>



          )}



        </section>



      </div>











      <ContractXNoticeModal
        open={Boolean(registerError)}
        variant="error"
        message={registerError}
        onClose={() => setRegisterError("")}
      />



      {registerOpen && (



        <div



          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"



          onMouseDown={(event) => {



            if (event.target === event.currentTarget && !registerSaving) {



              setRegisterOpen(false);



            }



          }}



        >



          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-[var(--cx-border)] bg-[var(--cx-panel)] shadow-2xl">



            <div className="sticky top-0 z-10 flex items-start justify-between gap-5 border-b border-[var(--cx-border)] bg-[var(--cx-panel)] px-6 py-5">



              <div>



                <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#D8A84E]">



                  Project Registration



                </div>



                <h2 className="mt-1 text-xl font-semibold text-[var(--cx-text)]">



                  Establish project context



                </h2>



                <p className="mt-1 text-xs text-[var(--cx-muted)]">



                  Essential project and contract information only. Documents and



                  schedules are added later within the project workspace.



                </p>



              </div>







              <button



                type="button"



                disabled={registerSaving}



                onClick={() => setRegisterOpen(false)}



                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--cx-border)] bg-[var(--cx-panel-2)] text-lg text-[var(--cx-muted)]"



                aria-label="Close project registration"



              >



                ×



              </button>



            </div>







            <form onSubmit={registerProject} className="p-6">



              <div className="grid gap-6 lg:grid-cols-2">



                <section>



                  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cx-subtle)]">



                    Project Identity



                  </div>







                  <div className="space-y-3">



                    {[



                      ["Project Name", "projectName", "Tuas Data Center Expansion"],



                      ["Project Code", "projectCode", "TDC-01"],



                      ["Country", "country", "Singapore"],



                      ["Jurisdiction", "jurisdiction", "Singapore"],



                    ].map(([label, key, placeholder]) => (



                      <label key={key} className="block">



                        <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">



                          {label} *



                        </span>



                        <input



                          value={registerForm[key as keyof RegistrationForm]}



                          onChange={(event) =>



                            updateRegistrationField(



                              key as keyof RegistrationForm,



                              event.target.value



                            )



                          }



                          placeholder={placeholder}



                          className="w-full rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-2.5 text-xs outline-none"



                        />



                      </label>



                    ))}



                  </div>



                </section>







                <section>



                  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cx-subtle)]">



                    Contract Context



                  </div>







                  <div className="space-y-3">



                    <label className="block">



                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">



                        Employer / Client *



                      </span>



                      <input



                        value={registerForm.employerName}



                        onChange={(event) =>



                          updateRegistrationField(



                            "employerName",



                            event.target.value



                          )



                        }



                        className="w-full rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-2.5 text-xs outline-none"



                      />



                    </label>







                    <label className="block">



                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">



                        Contractor *



                      </span>



                      <input



                        value={registerForm.contractorName}



                        onChange={(event) =>



                          updateRegistrationField(



                            "contractorName",



                            event.target.value



                          )



                        }



                        className="w-full rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-2.5 text-xs outline-none"



                      />



                    </label>







                    <label className="block">



                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">



                        Consultant / Engineer



                      </span>



                      <input



                        value={registerForm.consultantName}



                        onChange={(event) =>



                          updateRegistrationField(



                            "consultantName",



                            event.target.value



                          )



                        }



                        className="w-full rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-2.5 text-xs outline-none"



                      />



                    </label>







                    <label className="block">



                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">



                        Contract Type *



                      </span>



                      <select



                        value={registerForm.contractType}



                        onChange={(event) =>



                          updateRegistrationField(



                            "contractType",



                            event.target.value



                          )



                        }



                        className="w-full rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-2.5 text-xs outline-none"



                      >



                        {CONTRACT_OPTIONS.map((option) => (



                          <option key={option} value={option}>



                            {option}



                          </option>



                        ))}



                      </select>



                    </label>







                    <label className="block">



                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--cx-subtle)]">



                        Governing Law *



                      </span>



                      <input



                        value={registerForm.governingLaw}



                        onChange={(event) =>



                          updateRegistrationField(



                            "governingLaw",



                            event.target.value



                          )



                        }



                        className="w-full rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-3 py-2.5 text-xs outline-none"



                      />



                    </label>



                  </div>



                </section>



              </div>







              <div className="mt-6 flex flex-col gap-3 border-t border-[var(--cx-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">



                <div className="text-[10px] leading-5 text-[var(--cx-muted)]">



                  The project remains isolated to its ContractX tenant and



                  project workspace.



                </div>







                <div className="flex gap-2">



                  <button



                    type="button"



                    disabled={registerSaving}



                    onClick={() => setRegisterOpen(false)}



                    className="rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] px-4 py-2.5 text-xs font-semibold text-[var(--cx-muted)]"



                  >



                    Cancel



                  </button>







                  <button



                    type="submit"



                    disabled={



                      !registrationComplete ||



                      registerSaving ||



                      !canRegisterProject



                    }



                    className="rounded-xl bg-[#D8A84E] px-5 py-2.5 text-xs font-semibold text-[#111318] disabled:cursor-not-allowed disabled:opacity-50"



                  >



                    {registerSaving



                      ? "Registering..."



                      : canRegisterProject



                        ? "Register Project"



                        : "Project Limit Reached"}



                  </button>



                </div>



              </div>



            </form>



          </div>



        </div>



      )}







      <LegalFooter compact />



    </main>



  );



}
