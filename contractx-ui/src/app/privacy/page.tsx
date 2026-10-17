"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Database,
  Eye,
  FileText,
  Fingerprint,
  Globe2,
  LockKeyhole,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";

const EFFECTIVE_DATE = "16 September 2026";
const LAST_UPDATED = "16 September 2026";

const sections = [
  {
    id: "scope",
    title: "1. Scope",
    body: [
      "This Privacy Policy explains how contractX.co and ContractX (collectively, “ContractX”, “we”, “us”, or “our”) collect, use, store, disclose, protect, retain, and delete personal data and other information in connection with the ContractX web platform, mobile applications, marketplace-distributed applications, APIs, and related services.",
      "This Policy applies to the ContractX web platform and authorised distributions through Microsoft Marketplace, Apple App Store, Google Play, and other approved channels, subject to applicable law and platform-specific requirements.",
    ],
  },
  {
    id: "principles",
    title: "2. Privacy Principles",
    body: [
      "ContractX is designed around data minimisation, purpose limitation, need-to-know access, transparency, accountability, and lawful processing.",
      "We seek to collect and process only information reasonably necessary to provide, secure, support, administer, improve, and lawfully operate the Service.",
      "ContractX does not design its Service around behavioural advertising or the sale of confidential construction project information.",
    ],
  },
  {
    id: "data",
    title: "3. Information We May Process",
    body: [
      "Account data may include name, business email, organisation, job title, account identifiers, authentication metadata, subscription information, and authorised project memberships.",
      "Project and Customer Data may include contracts, amendments, correspondence, notices, schedules, claims, reports, photographs, programme information, metadata, prompts, uploaded documents, and generated reports.",
      "Technical data may include IP address, browser and device information, timestamps, session metadata, application events, diagnostic information, and usage records.",
      "Support data may include support requests, service communications, feedback, billing correspondence, and security-related communications.",
    ],
  },
  {
    id: "purposes",
    title: "4. Purposes of Processing",
    body: [
      "We may process information to authenticate users, provide project workspaces, analyse contracts and project records, generate AI-assisted outputs, administer subscriptions, provide support, maintain auditability, investigate misuse, prevent fraud, improve reliability, and comply with legal obligations.",
      "Personal data will not be used for materially incompatible purposes without an appropriate legal basis and, where required, additional notice or consent.",
    ],
  },
  {
    id: "legal-basis",
    title: "5. Legal Bases",
    body: [
      "Depending on jurisdiction and context, processing may be based on contract performance, legitimate interests, consent, compliance with legal obligations, protection of legal rights, or another recognised lawful basis.",
      "Where consent applies, Users may withdraw consent subject to legal, contractual, security, or record-retention obligations that continue to apply.",
    ],
  },
  {
    id: "ownership",
    title: "6. Customer Data Ownership",
    body: [
      "Customers retain ownership of Customer Data. ContractX receives only the limited rights necessary to host, transmit, secure, analyse, retrieve, back up, and otherwise process Customer Data to provide the Service.",
      "ContractX does not acquire ownership of uploaded contracts, schedules, correspondence, claims, commercial records, or other Customer Data merely because those materials are processed through the Service.",
    ],
  },
  {
    id: "ai",
    title: "7. AI Processing",
    body: [
      "ContractX may use artificial intelligence and machine-learning services to assist with extraction, classification, summarisation, analysis, risk identification, drafting, schedule intelligence, claims support, and related functionality.",
      "Customer Data should be disclosed to AI or infrastructure providers only to the extent reasonably necessary to provide the requested functionality and subject to appropriate contractual, confidentiality, privacy, and security safeguards.",
      "ContractX will not intentionally sell confidential Customer Data or use confidential project documents to train a general-purpose ContractX model for unrelated customers without explicit lawful authorisation or an expressly agreed customer programme.",
    ],
  },
  {
    id: "no-sale",
    title: "8. No Sale of Personal or Project Data",
    body: [
      "ContractX does not sell personal data, confidential project information, uploaded contracts, claims records, schedule data, or other Customer Data as a standalone commercial asset.",
      "ContractX does not use confidential Customer Data for third-party targeted advertising.",
    ],
  },
  {
    id: "sharing",
    title: "9. Service Providers and Subprocessors",
    body: [
      "ContractX may use selected providers for cloud infrastructure, database, storage, authentication, email, analytics, payments, AI processing, support, and related operational functions.",
      "Providers should receive only the data reasonably necessary for their function and should be subject to confidentiality, privacy, and security obligations appropriate to the nature of the processing.",
      "Enterprise customers may receive additional subprocessor disclosures or contractual notification mechanisms where agreed.",
    ],
  },
  {
    id: "marketplaces",
    title: "10. Marketplace and App-Store Distribution",
    body: [
      "ContractX may be offered through Microsoft Marketplace, Apple App Store, Google Play, and other authorised channels. Those platforms may independently process account, device, transaction, subscription, analytics, or marketplace information under their own privacy policies and terms.",
      "ContractX will seek to maintain privacy disclosures that accurately describe its actual data practices for each distribution channel.",
      "Where a platform requires privacy disclosures, Data Safety information, consent controls, account deletion, or support information, ContractX will seek to implement and maintain those requirements for the relevant distribution.",
    ],
  },
  {
    id: "international",
    title: "11. International Transfers and Data Residency",
    body: [
      "ContractX may process data in jurisdictions where ContractX or its approved service providers operate. Where required, appropriate legal or contractual mechanisms should be used for cross-border transfers of personal data.",
      "Enterprise plans may support agreed data-residency or regional-hosting requirements where commercially and technically available.",
      "ContractX will not represent that data is confined to a particular jurisdiction unless that requirement is expressly supported by the relevant architecture and customer agreement.",
    ],
  },
  {
    id: "retention",
    title: "12. Data Retention",
    body: [
      "ContractX will retain personal data and Customer Data only for as long as reasonably necessary to provide the Service, satisfy the purposes for which it was collected, maintain security and auditability, resolve disputes, comply with legal obligations, or enforce agreements.",
      "Different categories of information may have different retention periods. Enterprise customers may agree specific retention schedules where technically and legally feasible.",
    ],
  },
  {
    id: "deletion",
    title: "13. Account and Data Deletion",
    body: [
      "Where the Service permits account creation, ContractX intends to provide users with a clear mechanism to request account deletion and deletion of associated personal data, subject to lawful retention requirements.",
      "Deletion is distinct from temporary deactivation. Where deletion is requested and no retention obligation applies, associated personal data should be deleted or irreversibly de-identified within a reasonable operational period.",
      "Certain information may be retained where necessary for fraud prevention, legal claims, financial records, regulatory obligations, contractual disputes, security investigations, or other legitimate legal requirements.",
    ],
  },
  {
    id: "rights",
    title: "14. Individual Privacy Rights",
    body: [
      "Depending on applicable law, individuals may have rights to request access, correction, deletion, restriction, portability, objection, withdrawal of consent, or information about processing of their personal data.",
      "ContractX may need to verify identity and authority before fulfilling a request. Where ContractX processes personal data solely on behalf of an Enterprise customer, the request may be referred to that customer as the relevant controller or responsible organisation.",
    ],
  },
  {
    id: "mobile",
    title: "15. Mobile Permissions and Device Data",
    body: [
      "Mobile applications should request only permissions reasonably necessary for their functionality and should avoid sensitive permissions where a less intrusive alternative is available.",
      "Camera, files, notifications, biometrics, contacts, location, microphone, or photo permissions should not be accessed unless required for a relevant feature and appropriately disclosed or consented to where necessary.",
    ],
  },
  {
    id: "children",
    title: "16. Children and Minors",
    body: [
      "ContractX is intended for professional and business use and is not designed for children.",
      "If ContractX becomes aware that personal data from a child has been collected contrary to applicable requirements, reasonable steps will be taken to delete or otherwise lawfully address that information.",
    ],
  },
  {
    id: "changes",
    title: "17. Changes to this Policy",
    body: [
      "ContractX may update this Privacy Policy as the Service, laws, subprocessors, distribution channels, or business practices evolve.",
      "Material changes may be notified through the Service, by email, through marketplace release information, or by another reasonable method.",
    ],
  },
  {
    id: "contact",
    title: "18. Privacy Contact",
    body: [
      "Privacy requests, access requests, correction requests, deletion requests, and questions about this Policy may be directed to info@contractx.co until a dedicated privacy contact is published.",
      "Enterprise customers may be provided additional privacy, DPO, legal, or data-processing contact channels under their applicable agreements.",
    ],
  },
];

export default function PrivacyPage() {
  const [cursor, setCursor] = useState({ x: 50, y: 32 });
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("contractx-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  const switchTheme = (nextTheme: "dark" | "light") => {
    setTheme(nextTheme);
    window.localStorage.setItem("contractx-theme", nextTheme);
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      setCursor({
        x: (event.clientX / window.innerWidth) * 100,
        y: (event.clientY / window.innerHeight) * 100,
      });
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  const toc = useMemo(
    () => sections.map((section) => ({
      id: section.id,
      title: section.title.replace(/^\d+\.\s*/, ""),
    })),
    []
  );

  return (
    <main
      className={`relative min-h-screen overflow-hidden bg-[#050608] text-[#F4F1EA] ${
        theme === "light" ? "cx-legal-light" : ""
      }`}
    >
      <style>{`
        .cx-legal-light {
          color-scheme: light;
          background: #f3f0e9 !important;
          color: #17191c !important;
        }

        .cx-legal-light [class*="bg-[#050608]"] {
          background-color: #f3f0e9 !important;
        }

        .cx-legal-light [class*="bg-[#090B0E]"],
        .cx-legal-light [class*="bg-[#0A0C0F]"] {
          background-color: rgba(255,255,255,0.90) !important;
        }

        .cx-legal-light [class*="border-white"] {
          border-color: rgba(23,25,28,0.11) !important;
        }

        .cx-legal-light [class*="text-white/"] {
          color: rgba(23,25,28,0.60) !important;
        }

        .cx-legal-light [class*="text-[#F4F1EA]"] {
          color: #17191c !important;
        }

        .cx-legal-light .cx-legal-header {
          background: rgba(243,240,233,0.90) !important;
          border-color: rgba(23,25,28,0.10) !important;
          box-shadow: 0 12px 34px rgba(43,38,28,0.05);
        }

        .cx-legal-light .cx-legal-card,
        .cx-legal-light .cx-legal-toc,
        .cx-legal-light .cx-legal-article {
          background: rgba(255,255,255,0.90) !important;
          border-color: rgba(23,25,28,0.10) !important;
          box-shadow: 0 18px 45px rgba(43,38,28,0.06);
        }

        .cx-legal-light .cx-legal-article h2,
        .cx-legal-light h1 {
          color: #17191c !important;
        }

        .cx-legal-light .cx-legal-footer {
          background: #ece7dd !important;
          border-color: rgba(23,25,28,0.10) !important;
        }

        .cx-legal-light .cx-theme-toggle {
          background: rgba(255,255,255,0.75) !important;
          border-color: rgba(23,25,28,0.10) !important;
        }
      `}</style>

      <div
        className="pointer-events-none fixed inset-0 opacity-80"
        style={{
          background: `
            radial-gradient(circle at ${cursor.x}% ${cursor.y}%, rgba(210,176,111,0.10), transparent 22%),
            radial-gradient(circle at ${100 - cursor.x * 0.44}% ${28 + cursor.y * 0.20}%, rgba(111,143,175,0.08), transparent 28%),
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
          `,
          backgroundSize: "auto, auto, 48px 48px, 48px 48px",
        }}
      />

      <header className="cx-legal-header relative z-10 border-b border-white/[0.07] bg-[#050608]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <Link href="/login" className="flex items-center gap-3">
            <div className="text-[19px] font-semibold tracking-[-0.03em]">
              contract<span className="text-[#D8A84E]">X</span>.co
            </div>
            <div className="hidden h-5 w-px bg-white/10 sm:block" />
            <div className="hidden text-[10px] font-medium uppercase tracking-[0.20em] text-white/45 sm:block">
              Privacy
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <div className="cx-theme-toggle flex items-center rounded-full border border-white/[0.09] bg-white/[0.025] p-1">
              <button
                type="button"
                onClick={() => switchTheme("dark")}
                className={`rounded-full px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.10em] ${theme === "dark" ? "bg-[#D2B06F] text-[#050608]" : "text-white/45"}`}
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => switchTheme("light")}
                className={`rounded-full px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.10em] ${theme === "light" ? "bg-[#D2B06F] text-[#050608]" : "text-white/45"}`}
              >
                Light
              </button>
            </div>



          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65 transition hover:border-[#D2B06F]/35 hover:text-[#F4F1EA]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Login
          </Link>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-[1500px] px-5 pb-16 pt-14 sm:px-8 lg:px-12 lg:pt-20">
        <div className="max-w-5xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#D2B06F]/20 bg-[#D2B06F]/[0.045] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E3C98F]">
            <Fingerprint className="h-3.5 w-3.5" />
            Privacy Framework
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-[64px] lg:leading-[1.02]">
            Privacy Policy
          </h1>
          <p className="mt-6 max-w-4xl text-[16px] leading-8 text-white/58 sm:text-[17px]">
            How ContractX collects, uses, shares, retains, protects, and deletes personal and project-related information.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3">
              <div className="text-[9px] uppercase tracking-[0.16em] text-white/35">Effective</div>
              <div className="mt-1 text-[12px] font-medium text-white/72">{EFFECTIVE_DATE}</div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3">
              <div className="text-[9px] uppercase tracking-[0.16em] text-white/35">Last updated</div>
              <div className="mt-1 text-[12px] font-medium text-white/72">{LAST_UPDATED}</div>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: Eye, title: "Transparency", text: "Clear disclosure of collection, use, sharing, retention, and deletion." },
            { icon: Database, title: "Customer Data", text: "Customers retain ownership of project and uploaded data." },
            { icon: Trash2, title: "Deletion", text: "Account and data deletion mechanisms subject to lawful retention." },
            { icon: UserCheck, title: "Privacy Rights", text: "Access, correction, deletion, restriction, and other applicable rights." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="cx-legal-card rounded-2xl border border-white/[0.08] bg-[#0A0C0F]/80 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#D2B06F]/15 bg-[#D2B06F]/[0.045]">
                <Icon className="h-4 w-4 text-[#D2B06F]" />
              </div>
              <div className="mt-4 text-[13px] font-semibold">{title}</div>
              <p className="mt-2 text-[12px] leading-6 text-white/45">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="cx-legal-toc rounded-2xl border border-white/[0.08] bg-[#090B0E]/85 p-5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D2B06F]">
                <FileText className="h-3.5 w-3.5" />
                Contents
              </div>
              <div className="mt-4 max-h-[68vh] space-y-0.5 overflow-y-auto pr-1">
                {toc.map((item, index) => (
                  <a key={item.id} href={`#${item.id}`} className="block rounded-lg px-3 py-2 text-[11px] leading-5 text-white/42 transition hover:bg-white/[0.035] hover:text-white/75">
                    <span className="mr-2 text-white/22">{index + 1}.</span>
                    {item.title}
                  </a>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[#D2B06F]/15 bg-[#D2B06F]/[0.035] p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#E3C98F]">
                <LockKeyhole className="h-4 w-4" />
                Privacy principle
              </div>
              <p className="mt-3 text-[11px] leading-5 text-white/45">
                Customer information should be processed only for authorised purposes and retained only as long as reasonably necessary.
              </p>
            </div>
          </aside>

          <article className="cx-legal-article rounded-[22px] border border-white/[0.09] bg-[#090B0E]/88 p-6 sm:p-8 lg:p-10">
            <div className="space-y-10">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28 border-b border-white/[0.055] pb-9 last:border-b-0 last:pb-0">
                  <h2 className="text-[18px] font-semibold tracking-[-0.02em] sm:text-[20px]">{section.title}</h2>
                  <div className="mt-4 space-y-4">
                    {section.body.map((paragraph, index) => (
                      <p key={index} className="text-[13px] leading-7 text-white/55 sm:text-[14px]">{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </div>
      </section>

      <footer className="cx-legal-footer relative z-10 border-t border-white/[0.06] bg-[#050608] px-5 py-12">
        <div className="mx-auto max-w-[1500px]">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="text-[18px] font-semibold tracking-[-0.03em]">
                  contract<span className="text-[#D8A84E]">X</span>.co
                </div>
                <div className="h-5 w-px bg-white/10" />
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                  Review. Monitor. Resolve.
                </div>
              </div>
              <p className="mt-5 max-w-3xl text-[11px] leading-6 text-white/32">
                contractX.co provides AI-assisted contractual, commercial, project and schedule intelligence. Outputs should be reviewed by appropriately qualified contract, commercial, project or legal professionals.
              </p>
              <div className="mt-4 text-[11px] text-white/38">info@contractx.co</div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">
              <Link href="/privacy" className="text-[#D2B06F]">Privacy</Link>
              <Link href="/terms" className="transition hover:text-white/70">Terms</Link>
              <Link href="/security" className="transition hover:text-white/70">Security</Link>
            </div>
          </div>
          <div className="mt-8 border-t border-white/[0.05] pt-5 text-[10px] text-white/25">
            © {new Date().getFullYear()} contractX.co. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}
