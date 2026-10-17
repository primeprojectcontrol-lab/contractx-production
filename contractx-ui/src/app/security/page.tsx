"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  FileCheck2,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Network,
  Radar,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

const EFFECTIVE_DATE = "16 September 2026";
const LAST_UPDATED = "16 September 2026";

const sections = [
  {
    id: "security-program",
    title: "1. Security Programme",
    body: [
      "ContractX is intended to operate a risk-based information security programme proportionate to the sensitivity of contractual, commercial, schedule, claims, and project information processed through the platform.",
      "The security programme is designed around defence in depth, least privilege, need-to-know access, tenant isolation, secure-by-default configuration, auditability, confidentiality, integrity, availability, resilience, and continual improvement.",
    ],
  },
  {
    id: "iso",
    title: "2. ISO/IEC 27001:2022 Alignment",
    body: [
      "ContractX intends its production information security management system (“ISMS”) to be designed and operated in alignment with ISO/IEC 27001:2022 principles for establishing, implementing, maintaining, and continually improving information security management.",
      "The control framework should address risk assessment and treatment, access control, asset management, supplier security, secure development, vulnerability management, logging, incident management, cryptography, business continuity, information classification, and governance.",
      "ContractX will not claim ISO/IEC 27001 certification unless and until certification has been formally issued by an appropriately accredited independent certification body for the applicable scope.",
    ],
  },
  {
    id: "soc",
    title: "3. SOC 2 Readiness and Assurance",
    body: [
      "ContractX intends to design and document controls suitable for SOC 2 readiness, including controls relevant to security, availability, confidentiality, processing integrity, and privacy where applicable.",
      "The initial assurance objective may include SOC 2 Type 1 readiness followed by independent examination when operational maturity and commercial requirements justify formal attestation.",
      "ContractX will not represent that it holds a SOC 2 Type 1 or Type 2 report unless an independent licensed audit firm has completed the applicable examination and issued the report.",
    ],
  },
  {
    id: "vapt",
    title: "4. Independent VAPT",
    body: [
      "The production Service is intended to undergo independent third-party Vulnerability Assessment and Penetration Testing (“VAPT”) before material production launch and thereafter periodically on a risk-based basis, including after significant architectural or security-sensitive changes where appropriate.",
      "Testing should cover relevant web application, API, authentication, authorisation, access-control, tenant-isolation, session-management, input-validation, configuration, and infrastructure attack surfaces within the authorised scope.",
      "Material findings should be severity-ranked, assigned remediation owners, tracked through closure, and retested where appropriate.",
      "Detailed VAPT reports may be treated as confidential security information and disclosed only under appropriate confidentiality arrangements.",
    ],
  },
  {
    id: "sdlc",
    title: "5. Secure Software Development Lifecycle",
    body: [
      "ContractX intends to operate a secure software development lifecycle incorporating security requirements, peer review, dependency management, secrets management, vulnerability scanning, environment separation, change control, testing, deployment controls, and security review for high-risk changes.",
      "Production secrets, service-role credentials, signing keys, privileged database credentials, and equivalent material must not be embedded in client-side code or exposed through public browser variables.",
      "Development, test, staging, and production environments should be separated according to risk and operational maturity.",
    ],
  },
  {
    id: "encryption",
    title: "6. Encryption and Secrets Management",
    body: [
      "ContractX intends to use industry-standard encrypted transport for data transmitted over public networks and appropriate encryption mechanisms for stored data where supported by the relevant infrastructure.",
      "Sensitive secrets and privileged credentials should be stored using dedicated secure environment or secret-management controls and subject to rotation and restricted access.",
    ],
  },
  {
    id: "iam",
    title: "7. Identity, Authentication, and Least Privilege",
    body: [
      "Access should be controlled through authenticated identities, role-appropriate permissions, project membership, tenant isolation, and least-privilege principles.",
      "Administrative and privileged access should be restricted, monitored, and separated from ordinary end-user access.",
      "Multi-factor authentication may be required for privileged functions, Enterprise environments, or accounts assessed as higher risk.",
      "ContractX may enforce password resets, session revocation, additional verification, or access suspension in response to suspected compromise.",
    ],
  },
  {
    id: "tenant",
    title: "8. Tenant and Project Isolation",
    body: [
      "ContractX is designed as a multi-customer platform in which project data should be logically isolated by authenticated identity, organisation, project membership, access policy, and database-level controls.",
      "Security testing should specifically address insecure direct object reference, broken access control, privilege escalation, and cross-tenant data exposure risks.",
    ],
  },
  {
    id: "monitoring",
    title: "9. Logging, Monitoring, and Threat Detection",
    body: [
      "ContractX may maintain security and audit logs covering authentication events, account changes, privileged actions, project access, uploads, exports, system events, error conditions, and suspicious activity.",
      "Logs may be used for security monitoring, forensic investigation, abuse detection, service reliability, incident response, and enforcement of contractual obligations.",
      "Access to sensitive logs should itself be restricted and monitored.",
    ],
  },
  {
    id: "incident",
    title: "10. Security Incident Response",
    body: [
      "ContractX intends to maintain documented procedures for identifying, containing, investigating, remediating, recovering from, and learning from material security incidents.",
      "Where a personal-data breach or other security incident triggers a legal or contractual notification obligation, ContractX will seek to provide required notifications within applicable timeframes using information reasonably available at the time.",
      "Incident details may be disclosed on a need-to-know basis to affected customers, regulators, insurers, law enforcement, professional advisers, or service providers where required or reasonably necessary.",
    ],
  },
  {
    id: "supplier",
    title: "11. Supplier and Subprocessor Security",
    body: [
      "ContractX intends to apply risk-based due diligence to material vendors and subprocessors that handle sensitive information or provide security-critical services.",
      "Assessment may consider security certifications, audit reports, privacy commitments, incident history, encryption, access controls, data-location practices, contractual protections, service criticality, and operational resilience.",
      "Material supplier relationships should be reviewed periodically according to risk.",
    ],
  },
  {
    id: "ai-security",
    title: "12. AI Security Guardrails",
    body: [
      "AI-enabled features should be designed to reduce unnecessary disclosure of sensitive Customer Data and to restrict model or provider access to the minimum reasonably necessary for the requested functionality.",
      "ContractX may implement input validation, output review controls, prompt-injection safeguards, model-provider restrictions, logging, rate limits, and other measures intended to reduce misuse or unauthorised extraction of system information.",
      "Users must not attempt to extract hidden prompts, system instructions, proprietary orchestration, protected configuration, credentials, or other security-sensitive information.",
    ],
  },
  {
    id: "marketplace",
    title: "13. Marketplace and Platform Security",
    body: [
      "ContractX may be distributed through Microsoft Marketplace, Apple App Store, Google Play, and other authorised channels. Security controls and disclosures should remain consistent with the actual architecture and platform-specific requirements.",
      "Where marketplace distribution requires HTTPS endpoints, verified support information, account deletion, secure authentication, privacy disclosures, or additional technical controls, ContractX will seek to maintain those requirements for the relevant listing.",
    ],
  },
  {
    id: "continuity",
    title: "14. Backup, Recovery, and Business Continuity",
    body: [
      "ContractX intends to maintain backup, restoration, continuity, and recovery procedures proportionate to service criticality and contractual commitments.",
      "Recovery objectives, backup frequency, geographic redundancy, and availability commitments may differ by plan and may be specified in Enterprise service-level agreements.",
    ],
  },
  {
    id: "security-testing",
    title: "15. Security Testing and Remediation",
    body: [
      "ContractX may conduct internal and external vulnerability scanning, code review, dependency analysis, configuration review, penetration testing, and other security assessments appropriate to risk.",
      "Security findings should be classified by severity, assigned remediation owners, tracked to closure, and validated where appropriate.",
      "Customers or researchers must not conduct penetration testing or vulnerability exploitation against ContractX without prior written authorisation and an agreed testing scope.",
    ],
  },
  {
    id: "claims",
    title: "16. Accuracy of Security and Compliance Claims",
    body: [
      "ContractX will seek to ensure that security, certification, audit, VAPT, and compliance statements are accurate, supportable, and current.",
      "Terms such as “ISO/IEC 27001 certified”, “SOC 2 Type 1”, “SOC 2 Type 2”, “independently penetration tested”, or similar assurance claims will only be used publicly when supported by the relevant current certificate, attestation, report, or completed assessment for the stated scope.",
      "Readiness, alignment, planned controls, or target-state programmes must not be represented as completed certification or attestation.",
    ],
  },
  {
    id: "reporting",
    title: "17. Responsible Security Reporting",
    body: [
      "Suspected vulnerabilities should be reported responsibly to ContractX and must not be publicly disclosed before ContractX has had a reasonable opportunity to investigate and remediate them.",
      "Until a dedicated security contact is published, security concerns may be directed to info@contractx.co.",
    ],
  },
];

export default function SecurityPage() {
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
            radial-gradient(circle at ${100 - cursor.x * 0.44}% ${28 + cursor.y * 0.20}%, rgba(111,143,175,0.085), transparent 28%),
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
              Security
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
            <ShieldCheck className="h-3.5 w-3.5" />
            Security & Assurance
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-[64px] lg:leading-[1.02]">
            Security
          </h1>
          <p className="mt-6 max-w-4xl text-[16px] leading-8 text-white/58 sm:text-[17px]">
            The ContractX security framework for infrastructure, access control, secure development, independent testing, AI safeguards, incident response, and assurance readiness.
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
            { icon: ShieldCheck, title: "ISO 27001:2022", text: "ISMS-aligned control framework and risk management target state." },
            { icon: FileCheck2, title: "SOC 2 Readiness", text: "Control design toward independent Type 1 assurance readiness." },
            { icon: Network, title: "Independent VAPT", text: "Third-party vulnerability assessment and penetration testing programme." },
            { icon: BrainCircuit, title: "AI Security", text: "Prompt, data, provider, access, and misuse guardrails for AI-assisted workflows." },
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

        <div className="mt-8 rounded-2xl border border-[#6F8FAF]/20 bg-[#6F8FAF]/[0.04] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#8EABC7]" />
            <div>
              <div className="text-[12px] font-semibold">Assurance-status disclosure</div>
              <p className="mt-2 max-w-5xl text-[12px] leading-6 text-white/50">
                ISO/IEC 27001:2022 alignment, SOC 2 readiness, VAPT, and related programmes describe the intended security framework unless and until the relevant independent certification, attestation, or assessment has actually been completed for the stated scope.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="cx-legal-toc rounded-2xl border border-white/[0.08] bg-[#090B0E]/85 p-5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D2B06F]">
                <Radar className="h-3.5 w-3.5" />
                Security Contents
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
                <KeyRound className="h-4 w-4" />
                Security principle
              </div>
              <p className="mt-3 text-[11px] leading-5 text-white/45">
                Privileged access, production secrets, customer isolation, and sensitive project data require strong technical and organisational controls.
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
              <Link href="/privacy" className="transition hover:text-white/70">Privacy</Link>
              <Link href="/terms" className="transition hover:text-white/70">Terms</Link>
              <Link href="/security" className="text-[#D2B06F]">Security</Link>
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
