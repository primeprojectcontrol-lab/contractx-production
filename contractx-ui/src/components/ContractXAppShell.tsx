"use client";



import React, { useEffect, useMemo, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import {

  BarChart3,

  BookOpenCheck,

  BriefcaseBusiness,

  ChevronLeft,

  ChevronRight,

  ClipboardList,

  FileSearch,

  Files,

  FolderKanban,

  LayoutDashboard,

  LogOut,

  Menu,

  Moon,

  Scale,

  Settings,

  ShieldCheck,

  Sun,

  UserCircle2,

  X,

} from "lucide-react";



import { createClient } from "@/lib/supabase/client";



type ContractXTheme = "dark" | "light";



type UserProfile = {

  full_name: string;

  job_title: string;

};



type ProjectContext = {

  id: string;

  project_name: string;

  project_code: string | null;

  status: string | null;

};



const PUBLIC_ROUTES = new Set([

  "/",

  "/landing",

  "/login",

  "/signup",

  "/forgot-password",

  "/reset-password",

  "/privacy",

  "/terms",

  "/security",

]);



const PUBLIC_PREFIXES = [

  "/auth/",

];



const navigation = [

  {

    section: "Workspace",

    items: [

      {

        label: "Portfolio",

        href: "/portfolio",

        icon: BriefcaseBusiness,

        projectScoped: false,

      },

      {

        label: "Dashboard",

        href: "/dashboard",

        icon: LayoutDashboard,

        projectScoped: true,

      },

    ],

  },

  {

    section: "Review",

    items: [

      {

        label: "Ask ContractX",

        href: "/ask-contractx",

        icon: FileSearch,

        projectScoped: true,

      },

      {

        label: "Bespoke Review",

        href: "/bespoke-review",

        icon: BookOpenCheck,

        projectScoped: true,

      },

    ],

  },

  {
    section: "Monitor",
    items: [
      {
        label: "Schedule Assessment",
        href: "/schedule-assessment",
        icon: ShieldCheck,
        projectScoped: true,
      },
      {
        label: "Delay Analysis",
        href: "/delay-analytics",
        icon: BarChart3,
        projectScoped: true,
      },
      {
        label: "Tasks",
        href: "/tasks",
        icon: ClipboardList,
        projectScoped: true,
      },
    ],
  },

  {

    section: "Resolve",

    items: [

      {

        label: "Claims & Resolution",

        href: "/claims",

        icon: Scale,

        projectScoped: true,

      },

    ],

  },

  {

    section: "Project Data",

    items: [

      {

        label: "Documents",

        href: "/documents",

        icon: Files,

        projectScoped: true,

      },

    ],

  },

  {

    section: "Administration",

    items: [

      {

        label: "Project Settings",

        href: "/project-settings",

        icon: Settings,

        projectScoped: true,

      },

    ],

  },

];



function isPublicRoute(pathname: string) {

  if (PUBLIC_ROUTES.has(pathname)) return true;



  return PUBLIC_PREFIXES.some((prefix) =>

    pathname.startsWith(prefix)

  );

}



function pageTitle(pathname: string) {

  if (pathname.startsWith("/onboarding")) return "Project Onboarding";

  if (pathname.startsWith("/dashboard")) return "Dashboard";

  if (pathname.startsWith("/documents")) return "Documents";

  if (pathname.startsWith("/tasks")) return "Tasks";

  if (pathname.startsWith("/ask-contractx")) return "Ask ContractX";

  if (pathname.startsWith("/bespoke-review")) return "Bespoke Contract Review";

  if (pathname.startsWith("/schedule-assessment")) return "Schedule Assessment";
  if (pathname.startsWith("/delay-analytics")) return "Delay Analysis";

  if (pathname.startsWith("/claims")) return "Claims & Resolution";

  if (pathname.startsWith("/project-settings")) return "Project Settings";

  if (pathname.startsWith("/portfolio")) return "Portfolio";



  return "ContractX";

}



export default function ContractXAppShell({

  children,

}: {

  children: React.ReactNode;

}) {

  const pathname = usePathname();

  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);



  const [theme, setTheme] = useState<ContractXTheme>("dark");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [mobileOpen, setMobileOpen] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);

  const [profileSaving, setProfileSaving] = useState(false);

  const [profileMessage, setProfileMessage] = useState("");

  const [email, setEmail] = useState("");

  const [projectId, setProjectId] = useState("");

  const [project, setProject] = useState<ProjectContext | null>(null);

  const [profile, setProfile] = useState<UserProfile>({

    full_name: "",

    job_title: "",

  });



  const publicRoute = isPublicRoute(pathname);



  useEffect(() => {

    const savedTheme = window.localStorage.getItem("contractx-theme");



    if (savedTheme === "light" || savedTheme === "dark") {

      setTheme(savedTheme);

    }

  }, []);



  useEffect(() => {

    if (publicRoute) return;



    const params = new URLSearchParams(window.location.search);

    const nextProjectId = params.get("project") ?? "";

    setProjectId(nextProjectId);

  }, [pathname, publicRoute]);



  useEffect(() => {

    if (publicRoute) return;



    const loadShellContext = async () => {

      const {

        data: { user },

      } = await supabase.auth.getUser();



      if (!user) {

        router.replace("/login");

        return;

      }



      setEmail(user.email ?? "");



      const { data: profileData } = await supabase

        .from("user_profiles")

        .select("full_name, job_title")

        .eq("user_id", user.id)

        .maybeSingle();



      setProfile({

        full_name:

          profileData?.full_name ??

          user.user_metadata?.full_name ??

          "",

        job_title:

          profileData?.job_title ??

          user.user_metadata?.job_title ??

          "",

      });

    };



    loadShellContext();

  }, [publicRoute, router, supabase]);



  useEffect(() => {

    if (publicRoute || !projectId) {

      setProject(null);

      return;

    }



    const loadProject = async () => {

      const { data } = await supabase

        .from("projects")

        .select("id, project_name, project_code, status")

        .eq("id", projectId)

        .maybeSingle();



      setProject(data ?? null);

    };



    loadProject();

  }, [projectId, publicRoute, supabase]);



  const projectScopedRoute =

    pathname.startsWith("/dashboard") ||

    pathname.startsWith("/ask-contractx") ||

    pathname.startsWith("/bespoke-review") ||

    pathname.startsWith("/schedule-assessment") ||
    pathname.startsWith("/delay-analytics") ||

    pathname.startsWith("/claims") ||

    pathname.startsWith("/tasks") ||

    pathname.startsWith("/documents") ||

    pathname.startsWith("/project-settings");



  useEffect(() => {

    if (publicRoute || !projectScopedRoute) return;



    // Read the URL directly here. projectId state is populated by a separate

    // effect and is empty on the first render, which can otherwise cause a

    // valid project URL to be redirected to Portfolio before state updates.

    const params = new URLSearchParams(window.location.search);

    const urlProjectId = params.get("project");



    if (!urlProjectId) {

      router.replace("/portfolio");

    }

  }, [pathname, projectScopedRoute, publicRoute, router]);



  const switchTheme = (nextTheme: ContractXTheme) => {

    setTheme(nextTheme);

    window.localStorage.setItem("contractx-theme", nextTheme);

    window.dispatchEvent(

      new CustomEvent("contractx-theme-change", {

        detail: nextTheme,

      })

    );

  };



  const buildHref = (href: string, projectScoped = true) => {

    // Portfolio is the project-selection boundary and must never inherit

    // an old project query parameter.

    if (!projectScoped || href === "/portfolio") return href;



    // Project-scoped modules are only valid when the URL has an explicit

    // project UUID. There is deliberately no demo/default project fallback.

    if (!projectId) return "/portfolio";



    const separator = href.includes("?") ? "&" : "?";

    return `${href}${separator}project=${encodeURIComponent(projectId)}`;

  };



  const handleSignOut = async () => {

    const { error } = await supabase.auth.signOut();



    if (error) {

      setProfileMessage(error.message);

      setProfileOpen(true);

      return;

    }



    router.replace("/login");

    router.refresh();

  };



  const saveProfile = async () => {

    setProfileSaving(true);

    setProfileMessage("");



    const {

      data: { user },

      error: userError,

    } = await supabase.auth.getUser();



    if (userError || !user) {

      setProfileMessage("Unable to verify the authenticated user.");

      setProfileSaving(false);

      return;

    }



    const { error: profileError } = await supabase

      .from("user_profiles")

      .upsert(

        {

          user_id: user.id,

          full_name: profile.full_name.trim() || null,

          job_title: profile.job_title.trim() || null,

          status: "ACTIVE",

        },

        { onConflict: "user_id" }

      );



    if (profileError) {

      setProfileMessage(profileError.message);

      setProfileSaving(false);

      return;

    }



    await supabase.auth.updateUser({

      data: {

        full_name: profile.full_name.trim(),

        job_title: profile.job_title.trim(),

      },

    });



    setProfileMessage("Profile updated.");

    setProfileSaving(false);

  };



  if (publicRoute) {

    return <>{children}</>;

  }



  return (

    <div

      className={`cx-platform min-h-screen bg-[#050608] text-[#F5F3EE] ${

        theme === "light" ? "cx-platform-light" : ""

      }`}

    >

      <style>{`

        .cx-platform {

          color-scheme: dark;

        }



        .cx-platform-light {

          color-scheme: light;

          background: #f3f0e9 !important;

          color: #17191c !important;

        }



        .cx-platform-light .cx-shell-sidebar,

        .cx-platform-light .cx-shell-topbar {

          background: rgba(243,240,233,0.94) !important;

          border-color: rgba(23,25,28,0.11) !important;

          box-shadow: 0 12px 36px rgba(43,38,28,0.06) !important;

        }



        .cx-platform-light .cx-shell-panel {

          background: rgba(255,255,255,0.84) !important;

          border-color: rgba(23,25,28,0.10) !important;

        }



        .cx-platform-light .cx-shell-muted {

          color: rgba(23,25,28,0.58) !important;

        }



        .cx-platform-light .cx-shell-primary {

          color: #17191c !important;

        }



        .cx-platform-light .cx-shell-nav-item {

          color: rgba(23,25,28,0.64) !important;

        }



        .cx-platform-light .cx-shell-nav-item:hover {

          background: rgba(23,25,28,0.045) !important;

          color: #17191c !important;

        }



        .cx-platform-light .cx-shell-nav-active {

          background: rgba(210,176,111,0.13) !important;

          color: #795b2b !important;

          border-color: rgba(169,130,62,0.22) !important;

        }



        .cx-platform-light .cx-shell-modal {

          background: #fffdf9 !important;

          color: #17191c !important;

          border-color: rgba(23,25,28,0.11) !important;

          box-shadow: 0 28px 80px rgba(43,38,28,0.18) !important;

        }



        .cx-platform-light .cx-shell-modal input {

          background: #ffffff !important;

          color: #17191c !important;

          border-color: rgba(23,25,28,0.12) !important;

        }



        .cx-platform-light .cx-shell-modal input::placeholder {

          color: rgba(23,25,28,0.30) !important;

        }

      `}</style>



      {/* MOBILE OVERLAY */}

      {mobileOpen && (

        <button

          type="button"

          aria-label="Close navigation"

          onClick={() => setMobileOpen(false)}

          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm lg:hidden"

        />

      )}



      {/* SIDEBAR */}

      <aside

        className={`cx-shell-sidebar fixed inset-y-0 left-0 z-[80] flex flex-col border-r border-white/[0.08] bg-[#07090C]/96 backdrop-blur-2xl transition-all duration-300 ${

          sidebarCollapsed ? "w-[82px]" : "w-[264px]"

        } ${

          mobileOpen

            ? "translate-x-0"

            : "-translate-x-full lg:translate-x-0"

        }`}

      >

        <div className="flex h-[78px] items-center justify-between border-b border-white/[0.07] px-5">

          <a

            href={projectId ? buildHref("/dashboard", true) : "/portfolio"}

            className="flex min-w-0 items-baseline whitespace-nowrap"

          >

            <span className="cx-shell-primary text-[1.45rem] font-black tracking-[-0.045em] text-[#F5F3EE]">

              {sidebarCollapsed ? "c" : "contract"}

            </span>

            <span className="mx-[1px] text-[1.45rem] font-black tracking-[-0.07em] text-[#D2B06F]">

              X

            </span>

            {!sidebarCollapsed && (

              <span className="cx-shell-muted text-[13px] font-bold text-[#919AA4]">

                .co

              </span>

            )}

          </a>



          <button

            type="button"

            onClick={() => setMobileOpen(false)}

            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] text-[#8C96A1] lg:hidden"

          >

            <X className="h-4 w-4" />

          </button>

        </div>



        <div className="flex-1 overflow-y-auto px-3 py-5">

          {navigation.map((group) => (

            <div key={group.section} className="mb-7">

              {!sidebarCollapsed && (

                <div className="cx-shell-muted mb-2 px-3 text-[9px] font-black uppercase tracking-[0.18em] text-[#5F6872]">

                  {group.section}

                </div>

              )}



              <div className="space-y-1">

                {group.items.map((item) => {

                  const Icon = item.icon;

                  const active = pathname.startsWith(item.href);



                  return (

                    item.projectScoped && !projectId ? (

                      <div

                        key={item.href}

                        title={

                          sidebarCollapsed

                            ? `${item.label} — select a project first`

                            : "Select a project from Portfolio first"

                        }

                        aria-disabled="true"

                        className="cx-shell-nav-item flex cursor-not-allowed items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-[12px] font-bold text-[#59616A] opacity-55"

                      >

                        <Icon className="h-4 w-4 shrink-0" />

                        {!sidebarCollapsed && <span>{item.label}</span>}

                      </div>

                    ) : (

                      <a

                        key={item.href}

                        href={buildHref(item.href, item.projectScoped)}

                        title={sidebarCollapsed ? item.label : undefined}

                        className={`cx-shell-nav-item flex items-center gap-3 rounded-xl border px-3 py-3 text-[12px] font-bold transition-all ${

                          active

                            ? "cx-shell-nav-active border-[#D2B06F]/20 bg-[#D2B06F]/[0.07] text-[#E3C98F]"

                            : "border-transparent text-[#8C96A1] hover:bg-white/[0.035] hover:text-[#F5F3EE]"

                        }`}

                      >

                        <Icon className="h-4 w-4 shrink-0" />

                        {!sidebarCollapsed && <span>{item.label}</span>}

                      </a>

                    )

                  );

                })}

              </div>

            </div>

          ))}

        </div>



        <div className="border-t border-white/[0.07] px-3 pt-3">

          {projectId && (

            <a

              href="/portfolio"

              className="cx-shell-nav-item flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-[11px] font-bold text-[#7F8994] transition hover:bg-white/[0.035] hover:text-[#D2B06F]"

              title={sidebarCollapsed ? "Back to Portfolio" : undefined}

            >

              <BriefcaseBusiness className="h-4 w-4 shrink-0" />

              {!sidebarCollapsed && <span>Back to Portfolio</span>}

            </a>

          )}

        </div>



        <div className="border-t border-white/[0.07] p-3">

          <button

            type="button"

            onClick={() => {

              setProfileMessage("");

              setProfileOpen(true);

            }}

            className="cx-shell-panel flex w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-left"

          >

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#6F8FAF]/20 bg-[#6F8FAF]/[0.06]">

              <UserCircle2 className="h-4 w-4 text-[#9EB8CF]" />

            </div>



            {!sidebarCollapsed && (

              <div className="min-w-0">

                <div className="cx-shell-primary truncate text-[12px] font-black text-[#D8DCE0]">

                  {profile.full_name || email || "ContractX User"}

                </div>

                <div className="cx-shell-muted mt-0.5 truncate text-[10px] text-[#707984]">

                  {profile.job_title || "Edit profile"}

                </div>

              </div>

            )}

          </button>



          <button

            type="button"

            onClick={() => setSidebarCollapsed((value) => !value)}

            className="mt-2 hidden w-full items-center justify-center gap-2 rounded-xl border border-white/[0.06] py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#69747F] hover:text-[#D2B06F] lg:flex"

          >

            {sidebarCollapsed ? (

              <ChevronRight className="h-3.5 w-3.5" />

            ) : (

              <>

                <ChevronLeft className="h-3.5 w-3.5" />

                Collapse

              </>

            )}

          </button>

        </div>

      </aside>



      {/* APP AREA */}

      <div

        className={`min-h-screen transition-[padding] duration-300 ${

          sidebarCollapsed

            ? "lg:pl-[82px]"

            : "lg:pl-[264px]"

        }`}

      >

        {/* TOP BAR */}

        <header className="cx-shell-topbar sticky top-0 z-[60] border-b border-white/[0.08] bg-[#050608]/88 backdrop-blur-2xl">

          <div className="flex min-h-[78px] items-center justify-between gap-4 px-4 sm:px-5 lg:px-7">

            <div className="flex min-w-0 items-center gap-3">

              <button

                type="button"

                onClick={() => setMobileOpen(true)}

                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-[#AAB2BB] lg:hidden"

              >

                <Menu className="h-4 w-4" />

              </button>



              <div className="min-w-0">

                <div className="cx-shell-muted text-[9px] font-black uppercase tracking-[0.17em] text-[#69747F]">

                  ContractX Platform

                </div>

                <div className="cx-shell-primary mt-1 truncate text-[17px] font-black tracking-[-0.025em] text-[#F5F3EE]">

                  {pageTitle(pathname)}

                </div>

              </div>



              <div className="hidden h-8 w-px bg-white/[0.08] md:block" />



              <div className="hidden min-w-0 md:block">

                <div className="cx-shell-muted text-[9px] font-black uppercase tracking-[0.14em] text-[#69747F]">

                  Current Project

                </div>

                <div className="mt-1 flex items-center gap-2">

                  <FolderKanban className="h-3.5 w-3.5 shrink-0 text-[#D2B06F]" />

                  <div className="min-w-0">

                    <span className="cx-shell-primary block max-w-[300px] truncate text-[12px] font-bold text-[#D8DCE0]">

                      {project

                        ? `${project.project_name}${

                            project.project_code

                              ? ` · ${project.project_code}`

                              : ""

                          }`

                        : pathname.startsWith("/onboarding")

                        ? "Project setup"

                        : "No project selected"}

                    </span>

                    {projectId && (

                      <span className="cx-shell-muted mt-0.5 block max-w-[300px] truncate font-mono text-[8px] text-[#69747F]">

                        {projectId}

                      </span>

                    )}

                  </div>

                </div>

              </div>

            </div>



            <div className="flex shrink-0 items-center gap-2">

              <div className="cx-shell-panel hidden items-center rounded-full border border-white/[0.08] bg-white/[0.02] p-1 sm:flex">

                <button

                  type="button"

                  aria-label="Use dark theme"

                  onClick={() => switchTheme("dark")}

                  className={`flex h-8 w-8 items-center justify-center rounded-full transition ${

                    theme === "dark"

                      ? "bg-[#D2B06F] text-[#050608]"

                      : "text-[#7F8994]"

                  }`}

                >

                  <Moon className="h-3.5 w-3.5" />

                </button>



                <button

                  type="button"

                  aria-label="Use light theme"

                  onClick={() => switchTheme("light")}

                  className={`flex h-8 w-8 items-center justify-center rounded-full transition ${

                    theme === "light"

                      ? "bg-[#D2B06F] text-[#050608]"

                      : "text-[#7F8994]"

                  }`}

                >

                  <Sun className="h-3.5 w-3.5" />

                </button>

              </div>



              <button

                type="button"

                onClick={() => {

                  setProfileMessage("");

                  setProfileOpen(true);

                }}

                className="cx-shell-panel hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 sm:inline-flex"

              >

                <UserCircle2 className="h-4 w-4 text-[#8EABC7]" />

                <span className="cx-shell-primary max-w-[150px] truncate text-[11px] font-bold text-[#D8DCE0]">

                  {profile.full_name || email || "Profile"}

                </span>

              </button>



              <button

                type="button"

                onClick={handleSignOut}

                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-[#8C96A1] transition hover:border-[#D2B06F]/30 hover:text-[#D2B06F]"

                title="Sign out"

              >

                <LogOut className="h-4 w-4" />

              </button>

            </div>

          </div>

        </header>



        <div className="min-h-[calc(100vh-78px)]">

          {children}

        </div>

      </div>



      {/* PROFILE MODAL */}

      {profileOpen && (

        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-5 backdrop-blur-md">

          <div className="cx-shell-modal w-full max-w-xl rounded-[28px] border border-white/[0.10] bg-[#0D0F12] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.55)] md:p-8">

            <div className="flex items-start justify-between gap-4">

              <div>

                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D2B06F]">

                  Account

                </div>

                <h2 className="cx-shell-primary mt-2 text-2xl font-black tracking-[-0.04em] text-[#F5F3EE]">

                  Edit Profile

                </h2>

                <p className="cx-shell-muted mt-2 text-[13px] leading-6 text-[#818B96]">

                  Update the professional profile associated with your ContractX account.

                </p>

              </div>



              <button

                type="button"

                onClick={() => setProfileOpen(false)}

                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.025] text-[#B3BBC4]"

              >

                <X className="h-4 w-4" />

              </button>

            </div>



            <div className="mt-6 grid gap-5 md:grid-cols-2">

              <div>

                <label className="cx-shell-muted mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-[#77818C]">

                  Full Name

                </label>

                <input

                  value={profile.full_name}

                  onChange={(event) =>

                    setProfile((previous) => ({

                      ...previous,

                      full_name: event.target.value,

                    }))

                  }

                  placeholder="Your full name"

                  className="w-full rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 py-3.5 text-[14px] text-[#F5F3EE] outline-none placeholder:text-white/20 focus:border-[#D2B06F]/40"

                />

              </div>



              <div>

                <label className="cx-shell-muted mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-[#77818C]">

                  Job Title

                </label>

                <input

                  value={profile.job_title}

                  onChange={(event) =>

                    setProfile((previous) => ({

                      ...previous,

                      job_title: event.target.value,

                    }))

                  }

                  placeholder="e.g. Project Controls Director"

                  className="w-full rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 py-3.5 text-[14px] text-[#F5F3EE] outline-none placeholder:text-white/20 focus:border-[#D2B06F]/40"

                />

              </div>



              <div className="md:col-span-2">

                <label className="cx-shell-muted mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-[#77818C]">

                  Account Email

                </label>

                <input

                  value={email}

                  disabled

                  className="w-full cursor-not-allowed rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3.5 text-[14px] text-[#818B96] outline-none"

                />

              </div>

            </div>



            {profileMessage && (

              <div className="mt-5 rounded-xl border border-[#D2B06F]/15 bg-[#D2B06F]/[0.05] px-4 py-3 text-[12px] text-[#E3C98F]">

                {profileMessage}

              </div>

            )}



            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">

              <button

                type="button"

                onClick={handleSignOut}

                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.025] px-5 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#B3BBC4]"

              >

                <LogOut className="h-3.5 w-3.5" />

                Sign Out

              </button>



              <div className="flex gap-3">

                <button

                  type="button"

                  onClick={() => setProfileOpen(false)}

                  className="rounded-full border border-white/[0.09] bg-white/[0.025] px-5 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#B3BBC4]"

                >

                  Cancel

                </button>



                <button

                  type="button"

                  onClick={saveProfile}

                  disabled={profileSaving}

                  className="rounded-full bg-[#D2B06F] px-6 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#050608] hover:bg-[#E3C98F] disabled:cursor-not-allowed disabled:opacity-45"

                >

                  {profileSaving ? "Saving…" : "Save Profile"}

                </button>

              </div>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}
