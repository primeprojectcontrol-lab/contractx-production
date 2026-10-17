"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Scale,
  ShieldCheck,
  LockKeyhole,
  FileText,
  AlertTriangle,
  BrainCircuit,
  Copyright,
} from "lucide-react";

const EFFECTIVE_DATE = "16 September 2026";
const LAST_UPDATED = "16 September 2026";

const sections = [
  {
    id: "acceptance",
    title: "1. Acceptance and Scope",
    body: [
      "These Terms and Conditions (the “Terms”) govern access to and use of contractX.co, ContractX, and all associated software, applications, interfaces, reports, workflows, artificial intelligence functionality, document-processing capability, schedule analytics, claims analytics, notices, dashboards, APIs, and related services (collectively, the “Service”).",
      "By creating an account, clicking an acceptance control, accessing the Service, or using any part of the Service, you confirm that you have read, understood, and agreed to be bound by these Terms and the ContractX Privacy Policy.",
      "If you use the Service on behalf of an employer, company, partnership, joint venture, public authority, consultant, contractor, subcontractor, client, law firm, expert practice, project management organisation, or other legal entity, you represent and warrant that you have authority to bind that entity to these Terms.",
    ],
  },
  {
    id: "definitions",
    title: "2. Key Definitions",
    body: [
      "“Customer” means the individual or legal entity subscribing to, purchasing, trialling, or otherwise authorised to use the Service. “Authorised User” means a person permitted by the Customer to access the Service. “Customer Data” means documents, schedules, correspondence, records, photographs, datasets, files, prompts, project information, personal data, or other content submitted to the Service by or for the Customer.",
      "“AI Output” means text, analysis, summaries, draft notices, draft claims, risk flags, recommendations, classifications, extracted data, generated reports, schedule observations, or other content produced or assisted by artificial intelligence through the Service.",
      "“ContractX Materials” means the Service and all proprietary software, source code, object code, workflows, user interfaces, schemas, prompt structures, orchestration, taxonomies, models, retrieval logic, scoring methods, reports, templates, graphics, documentation, APIs, configuration, product architecture, trade secrets, know-how, and other intellectual property owned or controlled by ContractX or its licensors.",
    ],
  },
  {
    id: "service-nature",
    title: "3. Nature of the Service",
    body: [
      "ContractX is an AI-assisted contractual, commercial, project, claims, schedule, document, and construction intelligence platform. It is designed to support appropriately qualified professionals, not to replace them.",
      "The Service may assist with review, monitoring, extraction, summarisation, schedule analysis, draft notices, draft claims, chronology, risk assessment, entitlement support, and related project functions. The Service does not make binding contractual determinations and does not act as an employer’s representative, engineer, contract administrator, project manager, adjudicator, arbitrator, lawyer, expert witness, certifier, or decision-maker.",
    ],
  },
  {
    id: "professional-advice",
    title: "4. No Legal, Engineering, Expert, or Professional Advice",
    body: [
      "The Service and all AI Output are provided for informational, analytical, workflow, and decision-support purposes only. They do not constitute legal advice, engineering advice, quantity surveying advice, contractual certification, expert evidence, financial advice, tax advice, adjudication advice, arbitration advice, or any other regulated or professional opinion.",
      "Users remain solely responsible for obtaining independent professional advice where appropriate and for reviewing all material outputs before relying on, issuing, submitting, certifying, negotiating, or acting upon them.",
    ],
  },
  {
    id: "human-review",
    title: "5. Mandatory Human Review of AI Output",
    body: [
      "Artificial intelligence can produce incomplete, inaccurate, ambiguous, outdated, or contextually inappropriate results. AI Output may omit amendments, misunderstand project facts, misread documents, infer incorrect chronology, or identify contractual or schedule issues incorrectly.",
      "Before external use, Users must independently verify all material facts, clause references, notice periods, dates, calculations, governing law, contract amendments, schedule logic, critical path conclusions, delay attribution, entitlement positions, quantum assumptions, and documentary references.",
      "No AI Output should be treated as automatically suitable for submission to a client, contractor, consultant, engineer, adjudicator, arbitrator, court, insurer, auditor, regulator, funder, or other third party without competent human review.",
    ],
  },
  {
    id: "ethical-ai",
    title: "6. Ethical and Responsible Use of AI",
    body: [
      "The Service must be used lawfully, honestly, professionally, and in accordance with applicable ethical, contractual, regulatory, data-protection, intellectual-property, employment, anti-bribery, competition, sanctions, and professional obligations.",
      "Users must not use the Service to generate, facilitate, disguise, strengthen, or disseminate content that they know, or reasonably should know, is false, deceptive, fraudulent, defamatory, discriminatory, unlawful, professionally improper, or misleading.",
      "Users are responsible for ensuring that AI-assisted material is appropriately reviewed, attributed where required, and not misrepresented as independently verified professional opinion.",
    ],
  },
  {
    id: "construction-misuse",
    title: "7. Construction-Specific Prohibited Conduct",
    body: [
      "The Service must not be used to fabricate, alter, conceal, manipulate, or misrepresent project evidence or records.",
      "Without limitation, Users must not knowingly use ContractX to manufacture delay events, fabricate notices, invent contemporaneous records, create false meeting minutes, falsify progress, manipulate schedule logic to manufacture critical delay, conceal actual progress, create false baseline evidence, fabricate resource data, manufacture correspondence, falsify variations, create deceptive payment support, misstate critical path, or produce intentionally misleading claim or expert-style material.",
      "ContractX may suspend or terminate access where it reasonably believes the Service is being used to facilitate fraud, professional misconduct, corruption, collusion, evidence manipulation, or other unlawful or abusive conduct.",
    ],
  },
  {
    id: "customer-data",
    title: "8. Customer Data and Upload Responsibility",
    body: [
      "The Customer retains ownership of Customer Data, subject to the limited rights necessary for ContractX to host, process, analyse, transmit, secure, back up, and otherwise use Customer Data solely to provide, maintain, protect, support, and improve the Service in accordance with these Terms and the Privacy Policy.",
      "The Customer represents and warrants that it has all rights, permissions, lawful bases, contractual authority, and consents required to upload and process Customer Data through the Service.",
      "The Customer must not upload material that infringes third-party intellectual property, privacy, confidentiality, trade-secret, database, contractual, or other rights.",
    ],
  },
  {
    id: "ip",
    title: "9. ContractX Intellectual Property",
    body: [
      "All rights, title, and interest in and to the ContractX Materials are and remain exclusively owned by ContractX and/or its licensors. No ownership rights in the ContractX Materials are transferred to the Customer or any User.",
      "Protected materials include, without limitation, software, code, proprietary implementation, workflows, prompt structures, orchestration, taxonomies, data structures, schemas, analytical logic, scoring methods, classification systems, interface design, reports, templates, documentation, APIs, product architecture, security design, testing methodologies, configuration, branding, know-how, confidential information, and trade secrets.",
      "Except for the limited access rights expressly granted under these Terms, all rights are reserved.",
    ],
  },
  {
    id: "license",
    title: "10. Limited Licence to Use the Service",
    body: [
      "Subject to payment of applicable fees and continued compliance with these Terms, ContractX grants the Customer a limited, revocable, non-exclusive, non-transferable, non-sublicensable right to permit its Authorised Users to access and use the Service during the applicable subscription, demo, or trial period solely for legitimate internal business and project purposes.",
      "No licence is granted to reproduce, commercialise, resell, distribute, white-label, sublicense, or provide the Service to third parties except under a separate written agreement.",
    ],
  },
  {
    id: "no-copy",
    title: "11. No Copying, Cloning, or Derivative Replication",
    body: [
      "Users must not copy, reproduce, clone, imitate, adapt, translate, recreate, replicate, derive from, or build substantially similar implementations of proprietary ContractX software, interface structures, workflows, analytical taxonomies, report structures, documentation, proprietary prompts, configuration, or internal logic.",
      "Users must not use access to ContractX to create, commission, procure, assist, or improve a competing or substantially similar product, platform, service, model, workflow, or software implementation.",
      "These restrictions apply to the maximum extent permitted by applicable law and do not restrict rights that cannot lawfully be excluded.",
    ],
  },
  {
    id: "reverse-engineering",
    title: "12. No Reverse Engineering or Technical Extraction",
    body: [
      "Users must not reverse engineer, decompile, disassemble, decode, probe, inspect, derive, reconstruct, or attempt to discover the source code, object structure, hidden prompts, model orchestration, internal APIs, proprietary schemas, system instructions, retrieval logic, scoring methods, security mechanisms, or confidential architecture of the Service.",
      "Users must not use prompt injection, adversarial prompting, jailbreaks, debugging techniques, browser instrumentation, network inspection, automated analysis, or similar means to extract protected system information except where expressly authorised in writing by ContractX or where applicable law grants a non-waivable right.",
    ],
  },
  {
    id: "competitive-use",
    title: "13. No Competitive Intelligence or Benchmarking",
    body: [
      "Users must not access or use ContractX for competitive teardown, competitor benchmarking, product replication, market intelligence directed at recreating ContractX functionality, or evaluation on behalf of a competing product or service without prior written consent.",
      "Publication of benchmark results, performance comparisons, internal architecture descriptions, screenshots intended for competitive analysis, or technical evaluations of ContractX requires prior written permission.",
    ],
  },
  {
    id: "ai-training",
    title: "14. No Training or Improvement of Competing AI Systems",
    body: [
      "Users must not use ContractX Materials, proprietary reports, documentation, prompts, interface data, output structures, screenshots, API behaviour, workflows, or other protected materials to train, fine-tune, evaluate, benchmark, supervise, distil, validate, or improve another artificial intelligence system, large language model, retrieval system, agent, software platform, or competing service without prior written permission.",
      "Nothing in these Terms transfers any right to create datasets derived from proprietary ContractX Materials for machine learning or competitive development.",
    ],
  },
  {
    id: "scraping",
    title: "15. No Scraping, Automated Extraction, or Abuse",
    body: [
      "Users must not use crawlers, bots, scrapers, automated browsers, scripts, data-mining systems, high-volume extraction tools, or unauthorised APIs to systematically collect, reproduce, index, archive, monitor, or extract ContractX Materials or Service data.",
      "Users must not bypass rate limits, usage controls, tenant isolation, authentication, subscription controls, project limits, export controls, or other technical restrictions.",
    ],
  },
  {
    id: "security",
    title: "16. Security, Penetration Testing, and Circumvention",
    body: [
      "Users must not attempt to gain unauthorised access to any account, project, tenant, database, storage object, API, model, administrative system, source code, infrastructure, or security control.",
      "Penetration testing, vulnerability scanning, load testing, credential testing, attack simulation, exploitation, or security research against the Service is prohibited without prior written authorisation from ContractX.",
      "Suspected vulnerabilities should be reported responsibly to ContractX and must not be publicly disclosed before ContractX has had a reasonable opportunity to investigate and remediate them.",
    ],
  },
  {
    id: "accounts",
    title: "17. Accounts, Credentials, and Access Control",
    body: [
      "Each User must use an individual authorised account unless ContractX expressly permits another arrangement. Credentials, passwords, session tokens, API keys, reset links, and authentication factors must not be shared.",
      "The Customer is responsible for activity performed through its accounts and for promptly notifying ContractX of suspected credential compromise, unauthorised access, or misuse.",
      "ContractX may require password resets, multi-factor authentication, additional verification, session termination, or other security controls where reasonably necessary.",
    ],
  },
  {
    id: "output-use",
    title: "18. Use of AI Output and No Misrepresentation",
    body: [
      "Subject to these Terms and applicable third-party rights, Customers may use AI Output for legitimate internal project and business purposes.",
      "Users must not represent AI Output as a formal ContractX legal opinion, expert determination, engineering certification, contractual certification, adjudicative decision, or independently verified professional opinion.",
      "AI Output may not be unique. Similar or identical wording, analysis, structures, or recommendations may be generated for different users.",
    ],
  },
  {
    id: "quoting",
    title: "19. Quoting, Publication, Attribution, and Publicity",
    body: [
      "Users must not publish substantial extracts of confidential or proprietary ContractX Materials, reproduce proprietary documentation or templates for resale, publish protected technical information, or quote ContractX outputs in a manner that falsely implies endorsement, certification, verification, or authorship by ContractX.",
      "Users must not publish benchmark results, security findings, architectural descriptions, or competitive evaluations without prior written consent, except where such restriction is prohibited by applicable law.",
      "The ContractX name, contractX.co name, logos, trademarks, and brand elements may not be used in advertising, publicity, marketing, endorsements, or partnership claims without prior written permission.",
    ],
  },
  {
    id: "deadlines",
    title: "20. Notices, Deadlines, and Contractual Time Bars",
    body: [
      "The Customer remains solely responsible for identifying and complying with all contractual notice requirements, time bars, response periods, limitation periods, submission dates, programme update requirements, claim deadlines, and statutory deadlines.",
      "Any reminders, alerts, risk flags, dates, extracted deadlines, or suggested notice periods provided by the Service are assistive only and must be independently verified against the executed contract, amendments, governing law, project correspondence, and other controlling documents.",
      "ContractX does not accept responsibility for a missed notice, time bar, contractual deadline, statutory limitation period, or procedural requirement.",
    ],
  },
  {
    id: "outcomes",
    title: "21. No Guarantee of Entitlement, Recovery, or Outcome",
    body: [
      "ContractX does not guarantee that any notice will be valid, any claim will succeed, any extension of time will be granted, any delay analysis will be accepted, any entitlement will be established, any payment will be recovered, or any dispute will resolve in a particular manner.",
      "ContractX does not guarantee acceptance of any output by an employer, contractor, subcontractor, engineer, consultant, certifier, adjudicator, arbitrator, expert, court, insurer, lender, regulator, or other third party.",
    ],
  },
  {
    id: "third-party",
    title: "22. Third-Party Services and AI Providers",
    body: [
      "The Service may rely on third-party hosting, database, storage, communications, analytics, artificial intelligence, machine-learning, email, security, payment, and infrastructure providers.",
      "ContractX may change, replace, or reconfigure third-party providers, AI models, model versions, algorithms, APIs, and technical infrastructure where reasonably required to operate, secure, improve, or evolve the Service.",
      "Third-party products and services remain subject to their own intellectual-property rights and applicable terms.",
    ],
  },
  {
    id: "confidentiality",
    title: "23. Confidentiality",
    body: [
      "Each party must protect the other party’s Confidential Information using reasonable care and may use such information only for purposes connected with the Service or the parties’ commercial relationship.",
      "Confidential Information includes project contracts, schedules, claims, commercial records, correspondence, pricing, security information, unreleased features, product architecture, source code, proprietary workflows, technical documentation, trade secrets, and other information that is confidential by nature or circumstance.",
      "These obligations do not apply to information that is lawfully public, independently developed without use of Confidential Information, rightfully obtained without duty of confidence, or required to be disclosed by law or binding legal process.",
    ],
  },
  {
    id: "privacy",
    title: "24. Privacy and Data Protection",
    body: [
      "Personal data is handled in accordance with the ContractX Privacy Policy and applicable data-protection law.",
      "Customers are responsible for ensuring that their use of the Service, including upload of personal data, employee information, correspondence, photographs, records, or other identifiable information, is lawful and appropriately disclosed to affected individuals where required.",
      "Additional data-processing terms may apply to Enterprise customers under a separate Data Processing Agreement.",
    ],
  },
  {
    id: "monitoring",
    title: "25. Security Monitoring, Logs, and Audit Records",
    body: [
      "To operate, secure, support, investigate, and enforce the Service, ContractX may maintain reasonable technical and audit records including authentication events, account activity, project access, uploads, exports, system events, security events, and usage metadata, subject to applicable law and the Privacy Policy.",
      "ContractX may use such records to investigate suspected abuse, security incidents, policy violations, account compromise, unauthorised scraping, attempted reverse engineering, or other prohibited conduct.",
    ],
  },
  {
    id: "suspension",
    title: "26. Suspension and Termination",
    body: [
      "ContractX may suspend, restrict, or terminate access immediately where reasonably necessary to address non-payment, unlawful activity, fraud, security threats, credential compromise, abuse, scraping, reverse engineering, competitive misuse, intellectual-property infringement, repeated breach, misuse of AI, excessive technical load, or conduct that may harm ContractX, its customers, infrastructure, or third parties.",
      "Upon termination, the Customer must cease use of the Service. Provisions concerning intellectual property, confidentiality, prohibited copying, liability, indemnity, payment obligations, dispute resolution, and other provisions intended by their nature to survive will continue to apply.",
    ],
  },
  {
    id: "availability",
    title: "27. Availability, Changes, Beta Features, and Maintenance",
    body: [
      "Unless otherwise stated in a separate written Enterprise service-level agreement, ContractX does not guarantee uninterrupted or error-free availability.",
      "The Service may be modified, improved, replaced, restricted, suspended, or temporarily unavailable due to maintenance, updates, security work, infrastructure changes, third-party failures, legal requirements, or technical events.",
      "Features identified as beta, preview, experimental, early access, or similar may change materially and may be withdrawn.",
    ],
  },
  {
    id: "disclaimers",
    title: "28. Disclaimer of Warranties",
    body: [
      "To the maximum extent permitted by applicable law, the Service and AI Output are provided on an “as available” basis without warranties, representations, conditions, or guarantees of accuracy, completeness, uninterrupted operation, non-infringement, merchantability, fitness for a particular purpose, or achievement of a particular contractual, commercial, project, legal, or dispute outcome.",
      "Nothing in these Terms excludes any warranty, right, or remedy that cannot lawfully be excluded.",
    ],
  },
  {
    id: "liability",
    title: "29. Limitation of Liability",
    body: [
      "To the maximum extent permitted by applicable law, ContractX will not be liable for indirect, incidental, special, exemplary, punitive, or consequential loss, or for loss of profit, revenue, anticipated savings, opportunity, goodwill, business, reputation, data, contract, claim value, project recovery, or similar economic loss arising from or connected with the Service.",
      "ContractX will not be liable for losses arising from unverified AI Output, Customer Data errors, missed notices, missed time bars, incorrect project records, inaccurate schedules, Customer decisions, third-party service failures, unauthorised account use, or failure to obtain appropriate professional advice.",
      "Except for liability that cannot lawfully be limited or excluded, ContractX’s aggregate liability arising out of or relating to the Service will be limited to the amount paid by the Customer to ContractX for the affected Service during the twelve months immediately preceding the event giving rise to the claim.",
    ],
  },
  {
    id: "indemnity",
    title: "30. Customer Indemnity",
    body: [
      "To the maximum extent permitted by applicable law, the Customer will indemnify and hold harmless ContractX and its officers, employees, contractors, and affiliates from third-party claims, losses, liabilities, costs, and reasonable legal expenses arising from unlawful Customer Data, infringement caused by Customer Data, fraudulent or prohibited use of the Service, misuse of confidential information, violation of applicable law, or material breach of these Terms by the Customer or its Users.",
    ],
  },
  {
    id: "ip-enforcement",
    title: "31. Intellectual Property Enforcement and Equitable Relief",
    body: [
      "Unauthorised copying, disclosure, reverse engineering, competitive replication, misuse of confidential information, or misappropriation of ContractX Materials may cause harm that cannot be adequately remedied by damages alone.",
      "Where permitted by law, ContractX may seek injunctive, equitable, interim, or other appropriate relief in addition to contractual, statutory, and common-law remedies.",
    ],
  },
  {
    id: "compliance",
    title: "32. Anti-Bribery, Sanctions, Export Controls, and Legal Compliance",
    body: [
      "Users must not use the Service in connection with bribery, corruption, kickbacks, sanctions evasion, money laundering, unlawful collusion, prohibited exports, or other unlawful conduct.",
      "Customers and Users are responsible for compliance with laws, regulations, professional standards, sanctions, export controls, procurement requirements, competition rules, and contractual obligations applicable to their activities.",
    ],
  },
  {
    id: "feedback",
    title: "33. Feedback",
    body: [
      "If a Customer or User voluntarily provides product suggestions, feature ideas, improvement proposals, or other feedback, ContractX may use that feedback without restriction or compensation, provided that ContractX does not thereby acquire ownership of unrelated Customer Confidential Information or Customer Data.",
    ],
  },
  {
    id: "changes",
    title: "34. Changes to These Terms",
    body: [
      "ContractX may update these Terms from time to time to reflect changes to the Service, law, security, commercial arrangements, or business practices.",
      "Where changes are material, ContractX may provide notice through the Service, by email, or by another reasonable method. Continued use after the effective date of updated Terms constitutes acceptance to the extent permitted by applicable law.",
    ],
  },
  {
    id: "law",
    title: "35. Governing Law and Dispute Resolution",
    body: [
      "Unless a separate written agreement states otherwise, these Terms are governed by the laws of Singapore, without regard to conflict-of-laws principles.",
      "The parties will first attempt in good faith to resolve disputes through commercial discussion and escalation between authorised representatives.",
      "Subject to any mandatory legal rights or separately agreed dispute-resolution procedure, the courts of Singapore will have jurisdiction over disputes arising out of or relating to these Terms or the Service.",
    ],
  },
  {
    id: "general",
    title: "36. General",
    body: [
      "If any provision of these Terms is held invalid or unenforceable, the remaining provisions will remain in effect and the affected provision will be interpreted or modified to the minimum extent necessary to make it enforceable where legally permissible.",
      "Failure to enforce a provision does not waive the right to enforce it later. The Customer may not assign these Terms without ContractX’s prior written consent, except where applicable law provides otherwise.",
      "These Terms, together with the Privacy Policy, applicable order form, subscription terms, Data Processing Agreement, Enterprise agreement, and service-level agreement (where applicable), form the agreement governing use of the Service. In the event of conflict, a separately signed written agreement will prevail to the extent of that conflict.",
    ],
  },
  {
    id: "contact",
    title: "37. Contact and Legal Notices",
    body: [
      "Questions regarding these Terms, legal notices, intellectual-property concerns, or security reports may be sent to info@contractx.co until a dedicated legal or security contact is published.",
      "ContractX may designate additional legal, privacy, security, or registered-office contact details from time to time.",
    ],
  },
];

export default function TermsPage() {
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
    () =>
      sections.map((section) => ({
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
            radial-gradient(circle at ${cursor.x}% ${cursor.y}%, rgba(210,176,111,0.11), transparent 22%),
            radial-gradient(circle at ${100 - cursor.x * 0.45}% ${30 + cursor.y * 0.18}%, rgba(111,143,175,0.08), transparent 27%),
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
          `,
          backgroundSize: "auto, auto, 48px 48px, 48px 48px",
        }}
      />

      <div className="pointer-events-none fixed left-[8%] top-[16%] h-56 w-56 rounded-full border border-white/[0.035]" />
      <div className="pointer-events-none fixed bottom-[10%] right-[10%] h-72 w-72 rounded-full border border-[#6F8FAF]/[0.045]" />

      <header className="cx-legal-header relative z-10 border-b border-white/[0.07] bg-[#050608]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <Link href="/login" className="group flex items-center gap-3">
            <div className="text-[19px] font-semibold tracking-[-0.03em]">
              contract<span className="text-[#D8A84E]">X</span>.co
            </div>
            <div className="hidden h-5 w-px bg-white/10 sm:block" />
            <div className="hidden text-[10px] font-medium uppercase tracking-[0.20em] text-white/45 sm:block">
              Terms & Conditions
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
            <Scale className="h-3.5 w-3.5" />
            Legal Framework
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.045em] text-[#F4F1EA] sm:text-5xl lg:text-[64px] lg:leading-[1.02]">
            Terms & Conditions
          </h1>

          <p className="mt-6 max-w-4xl text-[16px] leading-8 text-white/58 sm:text-[17px]">
            These Terms govern access to ContractX and establish the legal,
            intellectual-property, responsible-AI, security, and professional-use
            framework applicable to the platform.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3">
              <div className="text-[9px] uppercase tracking-[0.16em] text-white/35">
                Effective
              </div>
              <div className="mt-1 text-[12px] font-medium text-white/72">
                {EFFECTIVE_DATE}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3">
              <div className="text-[9px] uppercase tracking-[0.16em] text-white/35">
                Last updated
              </div>
              <div className="mt-1 text-[12px] font-medium text-white/72">
                {LAST_UPDATED}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              icon: Copyright,
              title: "IP Protection",
              text: "No copying, cloning, reverse engineering, or competitive replication.",
            },
            {
              icon: BrainCircuit,
              title: "Responsible AI",
              text: "Human review is mandatory for contractual and professional reliance.",
            },
            {
              icon: ShieldCheck,
              title: "Security",
              text: "No scraping, circumvention, penetration testing, or credential abuse.",
            },
            {
              icon: AlertTriangle,
              title: "Construction Misuse",
              text: "No fabricated claims, notices, schedules, progress, or project evidence.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/[0.08] bg-[#0A0C0F]/80 p-5 shadow-[0_16px_50px_rgba(0,0,0,0.22),0_0_34px_rgba(255,255,255,0.012)]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#D2B06F]/15 bg-[#D2B06F]/[0.045]">
                <Icon className="h-4 w-4 text-[#D2B06F]" />
              </div>
              <div className="mt-4 text-[13px] font-semibold text-[#F4F1EA]">
                {title}
              </div>
              <p className="mt-2 text-[12px] leading-6 text-white/45">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-2xl border border-white/[0.08] bg-[#090B0E]/85 p-5 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D2B06F]">
                <FileText className="h-3.5 w-3.5" />
                Contents
              </div>

              <div className="mt-4 max-h-[68vh] space-y-0.5 overflow-y-auto pr-1">
                {toc.map((item, index) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="block rounded-lg px-3 py-2 text-[11px] leading-5 text-white/42 transition hover:bg-white/[0.035] hover:text-white/75"
                  >
                    <span className="mr-2 text-white/22">{index + 1}.</span>
                    {item.title}
                  </a>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[#D2B06F]/15 bg-[#D2B06F]/[0.035] p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#E3C98F]">
                <LockKeyhole className="h-4 w-4" />
                Important
              </div>
              <p className="mt-3 text-[11px] leading-5 text-white/45">
                ContractX is an AI-assisted decision-support platform. Material
                contractual, commercial, schedule, claims, legal, and professional
                outputs require qualified human review.
              </p>
            </div>
          </aside>

          <article className="rounded-[22px] border border-white/[0.09] bg-[#090B0E]/88 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.30),0_0_50px_rgba(255,255,255,0.012)] backdrop-blur-xl sm:p-8 lg:p-10">
            <div className="mb-9 rounded-2xl border border-[#D2B06F]/15 bg-[#D2B06F]/[0.035] p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#D2B06F]" />
                <div>
                  <div className="text-[12px] font-semibold text-[#F4F1EA]">
                    ContractX legal-use notice
                  </div>
                  <p className="mt-2 text-[12px] leading-6 text-white/50">
                    By using ContractX, you agree to use the platform lawfully,
                    ethically, securely, and only for legitimate professional and
                    project purposes. Misuse of the platform, its intellectual
                    property, security controls, AI capability, or project evidence
                    may result in immediate suspension or termination.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-10">
              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-28 border-b border-white/[0.055] pb-9 last:border-b-0 last:pb-0"
                >
                  <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#F4F1EA] sm:text-[20px]">
                    {section.title}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {section.body.map((paragraph, index) => (
                      <p
                        key={index}
                        className="text-[13px] leading-7 text-white/55 sm:text-[14px]"
                      >
                        {paragraph}
                      </p>
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
                contractX.co provides AI-assisted contractual, commercial, project
                and schedule intelligence. Outputs should be reviewed by
                appropriately qualified contract, commercial, project or legal
                professionals.
              </p>

              <div className="mt-4 text-[11px] text-white/38">
                info@contractx.co
              </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">
              <Link href="/privacy" className="transition hover:text-white/70">
                Privacy
              </Link>
              <Link href="/terms" className="text-[#D2B06F]">
                Terms
              </Link>
              <Link href="/security" className="transition hover:text-white/70">
                Security
              </Link>
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
