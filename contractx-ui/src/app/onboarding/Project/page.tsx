"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  Globe2,
  LogOut,
  Mail,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

const PUBLIC_CONTACT_EMAIL = "info@contractx.co";

type FormState = {
  projectName: string;
  projectCode: string;
  country: string;
  jurisdiction: string;
  employerName: string;
  contractorName: string;
  consultantName: string;
  contractAwardDate: string;
  projectStartDate: string;
  contractCompletionDate: string;
  baselineStartDate: string;
  baselineCompletionDate: string;
  currentDataDate: string;
  forecastCompletionDate: string;
  programName: string;
  programVersion: string;
  contractType: string;
  governingLaw: string;
};

const initialForm: FormState = {
  projectName: "",
  projectCode: "",
  country: "Singapore",
  jurisdiction: "Singapore",
  employerName: "",
  contractorName: "",
  consultantName: "",
  contractAwardDate: "",
  projectStartDate: "",
  contractCompletionDate: "",
  baselineStartDate: "",
  baselineCompletionDate: "",
  currentDataDate: "",
  forecastCompletionDate: "",
  programName: "",
  programVersion: "",
  contractType: "FIDIC Yellow Book 2017",
  governingLaw: "Singapore",
};

const contractOptions = [
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

function Label({
  children,
  required = false,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-[#8F98A2]">
      {children}
      {required && <span className="ml-1 text-[#D2B06F]">*</span>}
    </label>
  );
}

function FieldShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="cx-field-shell rounded-2xl border-2 border-white/[0.12] bg-white/[0.025] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition-all focus-within:border-white/[0.2] focus-within:shadow-[0_0_20px_rgba(255,255,255,0.025)]">
      {children}
    </div>
  );
}

export default function ProjectRegistrationPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [form, setForm] = useState<FormState>(initialForm);
  const [cursor, setCursor] = useState({ x: 50, y: 42 });
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      setCursor({
        x: (event.clientX / window.innerWidth) * 100,
        y: (event.clientY / window.innerHeight) * 100,
      });
    };

    window.addEventListener("pointermove", handlePointerMove);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  useEffect(() => {
    const initialise = async () => {
      const { data, error: userError } =
        await supabase.auth.getUser();

      if (userError || !data.user) {
        router.replace("/login");
        return;
      }

      setEmail(data.user.email ?? "");

      const { data: projects, error: projectError } =
        await supabase
          .from("projects")
          .select("id")
          .eq("status", "ACTIVE")
          .limit(2);

      if (projectError) {
        setError(projectError.message);
        setChecking(false);
        return;
      }

      if ((projects?.length ?? 0) === 1) {
        router.replace(
          `/dashboard?project=${projects![0].id}`
        );
        return;
      }

      if ((projects?.length ?? 0) > 1) {
        router.replace("/portfolio");
        return;
      }

      setChecking(false);
    };

    initialise();
  }, [router, supabase]);

  const handleSignOut = async () => {
    setError("");

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      setError(signOutError.message);
      return;
    }

    router.replace("/login");
    router.refresh();
  };

  const updateField = (
    key: keyof FormState,
    value: string
  ) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const requiredComplete =
    form.projectName.trim() &&
    form.projectCode.trim() &&
    form.country.trim() &&
    form.jurisdiction.trim() &&
    form.employerName.trim() &&
    form.contractorName.trim() &&
    form.contractType.trim() &&
    form.governingLaw.trim();

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!requiredComplete || saving) return;

    setSaving(true);
    setError("");

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      const user = userData.user;

      const tenantId =
        typeof user.app_metadata?.tenant_id === "string" &&
        user.app_metadata.tenant_id
          ? user.app_metadata.tenant_id
          : user.id;

      const { data: project, error: projectError } =
        await supabase
          .from("projects")
          .insert({
            tenant_id: tenantId,
            project_name: form.projectName.trim(),
            project_code: form.projectCode.trim(),
            status: "ACTIVE",
            country: form.country.trim(),
            jurisdiction: form.jurisdiction.trim(),
            client_name: form.employerName.trim(),
            contractor_name: form.contractorName.trim(),
            consultant_name:
              form.consultantName.trim() || null,
            contract_award_date:
              form.contractAwardDate || null,
            project_start_date:
              form.projectStartDate || null,
            contract_completion_date:
              form.contractCompletionDate || null,
            baseline_start_date:
              form.baselineStartDate || null,
            baseline_completion_date:
              form.baselineCompletionDate || null,
            current_data_date:
              form.currentDataDate || null,
            forecast_completion_date:
              form.forecastCompletionDate || null,
            program_name:
              form.programName.trim() || null,
            program_version:
              form.programVersion.trim() || null,
            created_by: user.id,
          })
          .select("id")
          .single();

      if (projectError || !project) {
        throw new Error(
          projectError?.message ??
            "Project registration failed."
        );
      }

      const { error: profileError } = await supabase
        .from("contract_profiles")
        .insert({
          tenant_id: tenantId,
          project_id: project.id,
          contract_type: form.contractType.trim(),
          governing_law: form.governingLaw.trim(),
          employer_name: form.employerName.trim(),
          contractor_name: form.contractorName.trim(),
          engineer_name:
            form.consultantName.trim() || null,
          start_date: form.projectStartDate || null,
          completion_date:
            form.contractCompletionDate || null,
        });

      if (profileError) {
        throw new Error(
          `Project created, but contract profile could not be saved: ${profileError.message}`
        );
      }

      router.replace(
        `/dashboard?project=${project.id}`
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to register project."
      );
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050608] text-[#F5F3EE]">
        <div className="rounded-full border-2 border-white/[0.12] bg-white/[0.025] px-5 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#B3BBC4]">
          Checking project access…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050608] text-[#F5F3EE] selection:bg-[#D2B06F] selection:text-[#050608]">
      <style>{`
        .cx-platform-light {
          color-scheme: light;
          background: #f3f0e9 !important;
          color: #17191c !important;
        }

        .cx-platform-light [class*="bg-[#050608]"] {
          background-color: #f3f0e9 !important;
        }

        .cx-platform-light [class*="bg-[#0D0F12]"] {
          background-color: rgba(255,255,255,0.90) !important;
        }

        .cx-platform-light [class*="bg-white/"] {
          background-color: rgba(23,25,28,0.035) !important;
        }

        .cx-platform-light [class*="border-white"] {
          border-color: rgba(23,25,28,0.11) !important;
        }

        .cx-platform-light [class*="text-[#F5F3EE]"],
        .cx-platform-light [class*="text-[#D8DCE0]"] {
          color: #17191c !important;
        }

        .cx-platform-light [class*="text-[#B3BBC4]"],
        .cx-platform-light [class*="text-[#919AA4]"],
        .cx-platform-light [class*="text-[#8F98A2]"],
        .cx-platform-light [class*="text-[#89939E]"],
        .cx-platform-light [class*="text-[#828B95]"],
        .cx-platform-light [class*="text-[#7F8994]"],
        .cx-platform-light [class*="text-[#7D8792]"],
        .cx-platform-light [class*="text-[#707984]"],
        .cx-platform-light [class*="text-[#69747F]"] {
          color: rgba(23,25,28,0.60) !important;
        }

        .cx-platform-light .cx-onboarding-header {
          background: rgba(243,240,233,0.88) !important;
          border-color: rgba(23,25,28,0.11) !important;
          box-shadow: 0 14px 38px rgba(43,38,28,0.07) !important;
        }

        .cx-platform-light .cx-context-panel,
        .cx-platform-light .cx-form-panel {
          background: rgba(255,255,255,0.90) !important;
          border-color: rgba(23,25,28,0.11) !important;
          box-shadow:
            0 28px 70px rgba(43,38,28,0.10),
            inset 0 0 0 1px rgba(255,255,255,0.45) !important;
        }

        .cx-platform-light .cx-context-panel h1,
        .cx-platform-light .cx-form-panel h2,
        .cx-platform-light .cx-form-panel [class*="font-black"] {
          color: #17191c;
        }

        .cx-platform-light .cx-field-shell {
          background: #ffffff !important;
          border-color: rgba(23,25,28,0.12) !important;
          box-shadow: 0 8px 24px rgba(43,38,28,0.04) !important;
        }

        .cx-platform-light input,
        .cx-platform-light select {
          color: #17191c !important;
          background-color: transparent !important;
          color-scheme: light !important;
        }

        .cx-platform-light select {
          background-color: #ffffff !important;
        }

        .cx-platform-light input::placeholder {
          color: rgba(23,25,28,0.32) !important;
        }

        .cx-platform-light option {
          background: #ffffff;
          color: #17191c;
        }

        .cx-platform-light .cx-info-card {
          background: rgba(255,255,255,0.70) !important;
          border-color: rgba(23,25,28,0.10) !important;
        }

        .cx-platform-light .cx-footer {
          background: #ece7dd !important;
          border-color: rgba(23,25,28,0.10) !important;
        }

        .cx-platform-light .cx-footer a:hover {
          color: #8f6b31 !important;
        }
      `}</style>

      {/* Responsive ContractX background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background: `
              radial-gradient(
                circle at ${cursor.x}% ${cursor.y}%,
                rgba(210,176,111,0.11),
                transparent 22%
              ),
              radial-gradient(
                circle at ${100 - cursor.x * 0.28}% ${
              18 + cursor.y * 0.18
            }%,
                rgba(111,143,175,0.08),
                transparent 30%
              ),
              radial-gradient(
                circle at 78% 74%,
                rgba(184,110,60,0.045),
                transparent 26%
              )
            `,
          }}
        />

        <div
          className="absolute left-[-8%] top-[8%] h-[34rem] w-[34rem] rounded-full border border-white/[0.04] transition-transform duration-200 ease-out"
          style={{
            transform: `translate3d(${
              (cursor.x - 50) * 0.12
            }px, ${(cursor.y - 50) * 0.08}px, 0)`,
          }}
        />

        <div
          className="absolute bottom-[6%] right-[-8%] h-[30rem] w-[30rem] rounded-full border border-[#D2B06F]/10 transition-transform duration-200 ease-out"
          style={{
            transform: `translate3d(${
              (cursor.x - 50) * -0.09
            }px, ${(cursor.y - 50) * -0.06}px, 0)`,
          }}
        />

        <div
          className="absolute inset-0 opacity-[0.038]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(185,193,201,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(185,193,201,0.15) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            backgroundPosition: `${
              (cursor.x - 50) * 0.18
            }px ${(cursor.y - 50) * 0.18}px`,
          }}
        />
      </div>

      <div className="relative z-10">
        <main className="mx-auto max-w-7xl px-5 py-9 md:py-12">
          <div className="grid gap-8 lg:grid-cols-[0.68fr_1.32fr]">
            {/* Context panel */}
            <section className="lg:sticky lg:top-8 lg:self-start">
              <div className="cx-context-panel rounded-[28px] border-2 border-white/[0.15] bg-[#0D0F12]/92 p-7 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_22px_rgba(255,255,255,0.03),0_28px_70px_rgba(0,0,0,0.36)] backdrop-blur-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#D2B06F]/20 bg-[#D2B06F]/[0.06] px-3 py-2">
                  <Sparkles className="h-3.5 w-3.5 text-[#D2B06F]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#E3C98F]">
                    Project Onboarding
                  </span>
                </div>

                <h1 className="mt-6 text-[2.45rem] font-black leading-[1.02] tracking-[-0.05em]">
                  Establish the project context once.
                </h1>

                <p className="mt-5 text-[15px] leading-7 text-[#919AA4]">
                  ContractX uses this information to anchor
                  project intelligence, notices, programme
                  analytics, claims and reporting to the correct
                  contractual and project context.
                </p>

                <div className="mt-7 space-y-3">
                  {[
                    [
                      "01",
                      "Project identity",
                      "Core project, parties, location and jurisdiction.",
                    ],
                    [
                      "02",
                      "Contract position",
                      "Contract form and governing-law context.",
                    ],
                    [
                      "03",
                      "Programme dates",
                      "Baseline, data date and completion controls.",
                    ],
                    [
                      "04",
                      "Secure workspace",
                      "The authenticated creator becomes the project owner.",
                    ],
                  ].map(([no, title, text]) => (
                    <div
                      key={no}
                      className="cx-info-card flex gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.018] p-4"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#D2B06F]/20 bg-[#D2B06F]/[0.05] text-[10px] font-black text-[#D2B06F]">
                        {no}
                      </div>

                      <div>
                        <div className="text-[13px] font-black text-[#D8DCE0]">
                          {title}
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-[#7F8994]">
                          {text}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="cx-info-card mt-7 rounded-2xl border border-[#6F8FAF]/18 bg-[#6F8FAF]/[0.04] p-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#9EB8CF]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Registration principle
                  </div>

                  <p className="mt-2 text-[11px] leading-5 text-[#89939E]">
                    Only essential project and contract context is
                    captured here. Documents, schedules and evidence
                    are uploaded later through Docs and specialist
                    modules.
                  </p>
                </div>
              </div>
            </section>

            {/* Form */}
            <section className="cx-form-panel rounded-[30px] border-2 border-white/[0.17] bg-[#0D0F12]/94 shadow-[0_0_0_1px_rgba(255,255,255,0.055),0_0_20px_rgba(255,255,255,0.032),0_28px_72px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
              <div className="border-b border-white/[0.08] px-6 py-6 md:px-8">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D2B06F]">
                  New Project
                </div>
                <h2 className="mt-2 text-[1.9rem] font-black tracking-[-0.04em]">
                  Project Registration
                </h2>
                <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#828B95]">
                  Fields marked with an asterisk are required to
                  initialise the ContractX project workspace.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-8 p-6 md:p-8"
              >
                {/* Project identity */}
                <div>
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#D2B06F]/20 bg-[#D2B06F]/[0.06]">
                      <Building2 className="h-4 w-4 text-[#D2B06F]" />
                    </div>
                    <div>
                      <div className="text-[14px] font-black">
                        Project identity
                      </div>
                      <div className="text-[11px] text-[#707984]">
                        Core project particulars and stakeholder context
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Label required>Project Name</Label>
                      <FieldShell>
                        <input
                          value={form.projectName}
                          onChange={(e) =>
                            updateField(
                              "projectName",
                              e.target.value
                            )
                          }
                          placeholder="e.g. Singapore Hyperscale Data Center Phase 2"
                          className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] text-[#F5F3EE] outline-none placeholder:text-white/20"
                          required
                        />
                      </FieldShell>
                    </div>

                    <div>
                      <Label required>Project Code</Label>
                      <FieldShell>
                        <input
                          value={form.projectCode}
                          onChange={(e) =>
                            updateField(
                              "projectCode",
                              e.target.value
                            )
                          }
                          placeholder="e.g. SG-DC-2026"
                          className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] outline-none placeholder:text-white/20"
                          required
                        />
                      </FieldShell>
                    </div>

                    <div>
                      <Label required>Country</Label>
                      <FieldShell>
                        <input
                          value={form.country}
                          onChange={(e) =>
                            updateField(
                              "country",
                              e.target.value
                            )
                          }
                          className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] outline-none"
                          required
                        />
                      </FieldShell>
                    </div>

                    <div>
                      <Label required>Jurisdiction</Label>
                      <FieldShell>
                        <input
                          value={form.jurisdiction}
                          onChange={(e) =>
                            updateField(
                              "jurisdiction",
                              e.target.value
                            )
                          }
                          placeholder="Contract / legal jurisdiction"
                          className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] outline-none placeholder:text-white/20"
                          required
                        />
                      </FieldShell>
                    </div>

                    <div>
                      <Label>Project Location</Label>
                      <div className="flex items-center gap-2 rounded-2xl border-2 border-white/[0.09] bg-white/[0.015] px-4 py-3.5 text-[12px] text-[#8F98A2]">
                        <MapPin className="h-4 w-4 text-[#6F8FAF]" />
                        Country is used as the current project location reference.
                      </div>
                    </div>

                    <div>
                      <Label required>Employer / Client</Label>
                      <FieldShell>
                        <input
                          value={form.employerName}
                          onChange={(e) =>
                            updateField(
                              "employerName",
                              e.target.value
                            )
                          }
                          placeholder="Employer / client organisation"
                          className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] outline-none placeholder:text-white/20"
                          required
                        />
                      </FieldShell>
                    </div>

                    <div>
                      <Label required>Main Contractor</Label>
                      <FieldShell>
                        <input
                          value={form.contractorName}
                          onChange={(e) =>
                            updateField(
                              "contractorName",
                              e.target.value
                            )
                          }
                          placeholder="Main contractor"
                          className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] outline-none placeholder:text-white/20"
                          required
                        />
                      </FieldShell>
                    </div>

                    <div className="md:col-span-2">
                      <Label>Engineer / Consultant / PMC</Label>
                      <FieldShell>
                        <input
                          value={form.consultantName}
                          onChange={(e) =>
                            updateField(
                              "consultantName",
                              e.target.value
                            )
                          }
                          placeholder="Engineer, consultant or PMC"
                          className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] outline-none placeholder:text-white/20"
                        />
                      </FieldShell>
                    </div>
                  </div>
                </div>

                {/* Contract context */}
                <div className="border-t border-white/[0.07] pt-8">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#6F8FAF]/20 bg-[#6F8FAF]/[0.05]">
                      <FileText className="h-4 w-4 text-[#9EB8CF]" />
                    </div>
                    <div>
                      <div className="text-[14px] font-black">
                        Contract context
                      </div>
                      <div className="text-[11px] text-[#707984]">
                        Initial contract form and governing-law reference
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <Label required>Contract Form</Label>
                      <FieldShell>
                        <select
                          value={form.contractType}
                          onChange={(e) =>
                            updateField(
                              "contractType",
                              e.target.value
                            )
                          }
                          className="w-full rounded-xl bg-[#0D0F12] px-4 py-3.5 text-[14px] outline-none"
                          required
                        >
                          {contractOptions.map(
                            (option) => (
                              <option
                                key={option}
                                value={option}
                              >
                                {option}
                              </option>
                            )
                          )}
                        </select>
                      </FieldShell>
                    </div>

                    <div>
                      <Label required>Governing Law</Label>
                      <FieldShell>
                        <input
                          value={form.governingLaw}
                          onChange={(e) =>
                            updateField(
                              "governingLaw",
                              e.target.value
                            )
                          }
                          placeholder="e.g. Singapore"
                          className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] outline-none placeholder:text-white/20"
                          required
                        />
                      </FieldShell>
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div className="border-t border-white/[0.07] pt-8">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#6F9C83]/20 bg-[#6F9C83]/[0.05]">
                      <CalendarDays className="h-4 w-4 text-[#9AC7A9]" />
                    </div>
                    <div>
                      <div className="text-[14px] font-black">
                        Contract & programme dates
                      </div>
                      <div className="text-[11px] text-[#707984]">
                        Executive dates used by the dashboard and later schedule analytics
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {[
                      ["contractAwardDate", "Contract Award Date"],
                      ["projectStartDate", "Project Start Date"],
                      [
                        "contractCompletionDate",
                        "Contract Completion Date",
                      ],
                      [
                        "baselineStartDate",
                        "Baseline Start Date",
                      ],
                      [
                        "baselineCompletionDate",
                        "Baseline Completion Date",
                      ],
                      ["currentDataDate", "Current Data Date"],
                      [
                        "forecastCompletionDate",
                        "Forecast Completion Date",
                      ],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <Label>{label}</Label>
                        <FieldShell>
                          <input
                            type="date"
                            value={
                              form[
                                key as keyof FormState
                              ]
                            }
                            onChange={(e) =>
                              updateField(
                                key as keyof FormState,
                                e.target.value
                              )
                            }
                            className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] outline-none"
                          />
                        </FieldShell>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Programme */}
                <div className="border-t border-white/[0.07] pt-8">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.025]">
                      <Globe2 className="h-4 w-4 text-[#B3BBC4]" />
                    </div>
                    <div>
                      <div className="text-[14px] font-black">
                        Programme reference
                      </div>
                      <div className="text-[11px] text-[#707984]">
                        Optional initial programme identity; XER files are uploaded later through Docs
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <Label>Programme Name</Label>
                      <FieldShell>
                        <input
                          value={form.programName}
                          onChange={(e) =>
                            updateField(
                              "programName",
                              e.target.value
                            )
                          }
                          placeholder="e.g. Contract Baseline Programme"
                          className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] outline-none placeholder:text-white/20"
                        />
                      </FieldShell>
                    </div>

                    <div>
                      <Label>Programme Version</Label>
                      <FieldShell>
                        <input
                          value={form.programVersion}
                          onChange={(e) =>
                            updateField(
                              "programVersion",
                              e.target.value
                            )
                          }
                          placeholder="e.g. BL-02 / Rev 1"
                          className="w-full rounded-xl bg-transparent px-4 py-3.5 text-[14px] outline-none placeholder:text-white/20"
                        />
                      </FieldShell>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="rounded-2xl border-2 border-[#B85C5C]/25 bg-[#B85C5C]/[0.06] px-4 py-3 text-[12px] leading-5 text-[#DE8585]">
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-4 border-t border-white/[0.07] pt-7 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-xl text-[11px] leading-5 text-[#707984]">
                    Creating the project will initialise your
                    private project workspace and register you as
                    its owner. Documents and evidence can be added
                    after registration.
                  </div>

                  <button
                    type="submit"
                    disabled={!requiredComplete || saving}
                    className="group inline-flex min-w-[210px] items-center justify-center gap-2 rounded-full bg-[#D2B06F] px-6 py-3.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#050608] shadow-[0_10px_28px_rgba(210,176,111,0.14)] transition-all hover:-translate-y-0.5 hover:bg-[#E3C98F] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving
                      ? "Creating Project…"
                      : "Create Project"}

                    {!saving && (
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    )}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </main>

        <footer className="cx-footer border-t-2 border-white/[0.12] bg-[#050608] px-5 py-12">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 border-b border-white/[0.08] pb-8 lg:grid-cols-[1.25fr_0.75fr]">
              <div>
                <div className="flex items-center gap-3">
                  <div className="text-xl font-black tracking-[-0.04em]">
                    contract
                    <span className="text-[#D2B06F]">X</span>
                    <span className="text-sm text-[#919AA4]">
                      .co
                    </span>
                  </div>

                  <div className="h-4 w-px bg-white/10" />

                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#69747F]">
                    Review. Monitor. Resolve.
                  </span>
                </div>

                <p className="mt-4 max-w-3xl text-xs leading-6 text-[#7F8994]">
                  contractX.co provides AI-assisted contractual,
                  commercial, project and schedule intelligence.
                  Outputs should be reviewed by appropriately
                  qualified contract, commercial, project or legal
                  professionals.
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:items-end">
                <a
                  href={`mailto:${PUBLIC_CONTACT_EMAIL}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#D8DCE0] transition-colors hover:text-[#D2B06F]"
                >
                  <Mail className="h-4 w-4" />
                  {PUBLIC_CONTACT_EMAIL}
                </a>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center justify-between gap-5 md:flex-row">
              <span className="text-[10px] font-semibold text-[#69747F]">
                © {new Date().getFullYear()} contractX.co. All rights reserved.
              </span>

              <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-[0.15em] text-[#8F99A5]">
                <a
                  href="/privacy"
                  className="transition-colors hover:text-white"
                >
                  Privacy
                </a>
                <a
                  href="/terms"
                  className="transition-colors hover:text-white"
                >
                  Terms
                </a>
                <a
                  href="/security"
                  className="transition-colors hover:text-white"
                >
                  Security
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
