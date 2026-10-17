"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Cpu,
  FileCheck2,
  FileText,
  GitBranch,
  Mail,
  MessageCircle,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  X,
} from "lucide-react";

/* ============================================================
   TYPES
============================================================ */

type ModuleTab = "ASK" | "BESPOKE" | "DELAY" | "RESOLUTION";

type QueryStage = 0 | 1 | 2 | 3 | 4;

type FormData = {
  full_name: string;
  work_email: string;
  company_name: string;
  industry_role: string;
  country: string;
  requested_plan: string;
  estimated_projects: number;
};

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

const PUBLIC_CONTACT_EMAIL = "info@contractx.co";

/*
 * Configure this in contractx-ui/.env.local, for example:
 * NEXT_PUBLIC_WHATSAPP_NUMBER=6591234567
 * Use country code + number only. Do not include +, spaces or dashes.
 */
const PUBLIC_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "") ?? "";

const publicChatPrompts = [
  "What can contractX.co help me with?",
  "Who is contractX.co designed for?",
  "What is Bespoke Contract Review?",
  "What is Delay & Forensic Analytics?",
  "What is Claims & Resolution?",
  "How does the 1-Day Demo work?",
  "How is project information handled?",
  "How can I contact the contractX.co team?",
];

/* ============================================================
   PUBLIC PLATFORM MODULES
============================================================ */

const platformModules: Array<{
  id: ModuleTab;
  short: string;
  label: string;
  kicker: string;
  description: string;
}> = [
  {
    id: "ASK",
    short: "ASK",
    label: "Ask ContractX",
    kicker: "MODULE 01",
    description:
      "Ask the contract. Ask the project. Understand the evidence.",
  },
  {
    id: "BESPOKE",
    short: "REVIEW",
    label: "Bespoke Contract Review",
    kicker: "MODULE 02",
    description:
      "Identify contractual risk, deviation and exposure before execution.",
  },
  {
    id: "DELAY",
    short: "ANALYSE",
    label: "Delay & Forensic Analytics",
    kicker: "MODULE 03",
    description:
      "Understand what happened to the programme and why.",
  },
  {
    id: "RESOLUTION",
    short: "RESOLVE",
    label: "Claims & Resolution",
    kicker: "MODULE 04",
    description:
      "Build, assess and respond to contractual positions using verified evidence.",
  },
];

/* ============================================================
   PRICING / ACCESS STRUCTURE
============================================================ */

const pricingPlans = [
  {
    name: "1-Day Demo",
    eyebrow: "EXPLORE",
    price: "Demo Access",
    note: "Controlled temporary access",
    description:
      "Explore the contractX.co platform before selecting a project or organisation plan.",
    features: [
      "Controlled 1-day platform access",
      "Explore core platform modules",
      "Single evaluation workspace",
      "No payment required during launch",
    ],
    cta: "Start 1-Day Demo",
    plan: "DEMO",
    featured: false,
  },
  {
    name: "Single Project",
    eyebrow: "PROJECT",
    price: "Coming Soon",
    note: "Online payment after launch",
    description:
      "Dedicated contract, project and delay intelligence for one active construction project.",
    features: [
      "1 active project",
      "Private project intelligence workspace",
      "Contract review and project analysis",
      "Professional reports and outputs",
    ],
    cta: "Register Interest",
    plan: "BUSINESS",
    featured: true,
  },
  {
    name: "Enterprise",
    eyebrow: "ORGANISATION",
    price: "Custom",
    note: "Portfolio & organisation access",
    description:
      "Multi-project deployment for employers, contractors, consultancies and legal teams.",
    features: [
      "Multiple projects",
      "Organisation and team administration",
      "Portfolio-level governance",
      "Enterprise onboarding and controls",
    ],
    cta: "Contact ContractX",
    plan: "ENTERPRISE",
    featured: false,
  },
];

/* ============================================================
   PAGE
============================================================ */

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<ModuleTab>("ASK");

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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "Welcome to contractX.co. I can answer high-level questions about the platform, its four specialist modules, demo access, privacy principles and how to contact our team.",
    },
  ]);

  const [isPlaying, setIsPlaying] = useState(true);
  const [queryStep, setQueryStep] = useState<QueryStage>(0);

  const [cursor, setCursor] = useState({
    x: 50,
    y: 42,
  });

  const [formData, setFormData] = useState<FormData>({
    full_name: "",
    work_email: "",
    company_name: "",
    industry_role: "Main Contractor",
    country: "Singapore",
    requested_plan: "DEMO",
    estimated_projects: 1,
  });

  /* ============================================================
     INTELLIGENCE SIMULATION
  ============================================================ */

  useEffect(() => {
    if (!isPlaying) return;

    const interval = window.setInterval(() => {
      setQueryStep((previous) => {
        if (previous >= 4) return 0;

        return (previous + 1) as QueryStage;
      });
    }, 2600);

    return () => window.clearInterval(interval);
  }, [isPlaying]);

  /* ============================================================
     CURSOR PARALLAX
  ============================================================ */

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

  const activeModule = useMemo(() => {
    return (
      platformModules.find((module) => module.id === activeTab) ??
      platformModules[0]
    );
  }, [activeTab]);

  /* ============================================================
     ACCESS MODAL
  ============================================================ */

  const openAccessModal = (plan = "DEMO") => {
    setSubmitted(false);

    setFormData((previous) => ({
      ...previous,
      requested_plan: plan,
    }));

    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSubmitted(false);
  };

  /* ============================================================
     REGISTRATION
  ============================================================ */

  const handleRegisterSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setSubmitting(true);

    try {
      /*
       * CURRENT LAUNCH VERSION
       *
       * Replace this simulation with your FastAPI / Supabase
       * production endpoint.
       *
       * Example:
       *
       * const response = await fetch("/api/public/access-request", {
       *   method: "POST",
       *   headers: {
       *     "Content-Type": "application/json",
       *   },
       *   body: JSON.stringify(formData),
       * });
       *
       * if (!response.ok) {
       *   throw new Error("Registration failed");
       * }
       *
       * IMPORTANT:
       *
       * Stripe should NOT be called directly here.
       *
       * Current:
       *
       * Demo / Evaluation
       *     ↓
       * Entitlement Service
       *     ↓
       * Platform Access
       *
       * Future:
       *
       * Stripe
       *     ↓
       * Webhook
       *     ↓
       * Subscription Service
       *     ↓
       * Entitlement Service
       *     ↓
       * Platform Access
       */

      console.log(
        "Submitting contractX access request:",
        formData
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 800)
      );

      setSubmitted(true);
    } catch (error) {
      console.error("Submission failed:", error);
    } finally {
      setSubmitting(false);
    }
  };

  /* ============================================================
     HERO INTELLIGENCE NODES
  ============================================================ */

  const heroNodes = [
    {
      label: "CONTRACT",
      x: 17,
      y: 42,
      type: "contract",
    },
    {
      label: "PROJECT",
      x: 29,
      y: 72,
      type: "project",
    },
    {
      label: "SCHEDULE",
      x: 72,
      y: 28,
      type: "schedule",
    },
    {
      label: "EVIDENCE",
      x: 82,
      y: 70,
      type: "evidence",
    },
    {
      label: "RISK",
      x: 88,
      y: 43,
      type: "risk",
    },
    {
      label: "RESOLUTION",
      x: 50,
      y: 17,
      type: "resolution",
    },
  ];

  /* ============================================================
     ASK CONTRACTX DEMO STAGES
  ============================================================ */

  const stageData: Record<
    QueryStage,
    {
      title: string;
      description: string;
      icon: React.ReactNode;
      tag: string;
    }
  > = {
    0: {
      title: "Authorized project context",
      description:
        "Loading the active project, jurisdiction and permitted evidence scope.",
      icon: <ShieldCheck className="h-4 w-4" />,
      tag: "ACCESS",
    },

    1: {
      title: "Contract intelligence",
      description:
        "Matching contractual provisions against curated construction contract and claims reference knowledge.",
      icon: <FileCheck2 className="h-4 w-4" />,
      tag: "CONTRACT",
    },

    2: {
      title: "Project evidence",
      description:
        "Cross-referencing private project records, notices, reports and meeting evidence.",
      icon: <FileText className="h-4 w-4" />,
      tag: "EVIDENCE",
    },

    3: {
      title: "Schedule intelligence",
      description:
        "Consuming verified programme, critical path, float and delay findings where available.",
      icon: <BarChart3 className="h-4 w-4" />,
      tag: "SCHEDULE",
    },

    4: {
      title: "AI reasoning",
      description:
        "Synthesizing authorized evidence into a structured contractual position, risk assessment and recommended next action.",
      icon: <Sparkles className="h-4 w-4" />,
      tag: "REASON",
    },
  };

  const currentStage =
    stageData[queryStep];

  const buildWhatsAppUrl = (message: string) => {
    if (!PUBLIC_WHATSAPP_NUMBER) return null;

    return `https://wa.me/${PUBLIC_WHATSAPP_NUMBER}?text=${encodeURIComponent(
      message
    )}`;
  };

  const getPublicChatResponse = (question: string) => {
    const normalized = question.trim().toLowerCase();

    const restrictedTerms = [
      "architecture",
      "engine",
      "database",
      "qdrant",
      "supabase",
      "fastapi",
      "next.js",
      "nextjs",
      "api",
      "vector",
      "embedding",
      "prompt",
      "system instruction",
      "model provider",
      "openai",
      "gpt",
      "interdependence",
      "dependency",
      "backend",
      "source code",
      "security implementation",
    ];

    if (restrictedTerms.some((term) => normalized.includes(term))) {
      return "contractX.co does not disclose internal implementation details, model configuration, system architecture or service dependencies. I can explain the platform's public capabilities, security principles, demo access, or connect you with the contractX.co team for an appropriate discussion.";
    }

    if (
      normalized.includes("what can") ||
      normalized.includes("help me") ||
      normalized.includes("what is contractx")
    ) {
      return "contractX.co is an AI-powered construction contract and claims intelligence platform built around Review, Monitor and Resolve. It helps teams understand contract obligations and risk, connect project evidence to contractual issues, analyse programme and delay information, and develop defensible contractual positions for resolution.";
    }

    if (
      normalized.includes("who") ||
      normalized.includes("designed for") ||
      normalized.includes("user")
    ) {
      return "contractX.co is designed for employers and developers, main contractors and subcontractors, PMCs and consultancies, project and contract managers, planners, quantity surveyors and commercial teams, claims professionals, and construction law firms or legal teams.";
    }

    if (normalized.includes("bespoke") || normalized.includes("contract review")) {
      return "Bespoke Contract Review helps identify contractual risk, deviations, obligations, notice requirements, liability allocation and commercial exposure before execution, with structured recommendations for professional review.";
    }

    if (
      normalized.includes("delay") ||
      normalized.includes("forensic") ||
      normalized.includes("programme") ||
      normalized.includes("schedule")
    ) {
      return "Delay & Forensic Analytics is designed to help teams understand what happened to the programme and why, using verified schedule information such as critical path, float movement, delay events, concurrency and time-impact findings where available.";
    }

    if (
      normalized.includes("claim") ||
      normalized.includes("resolution") ||
      normalized.includes("dispute")
    ) {
      return "Claims & Resolution supports the preparation, assessment and response to contractual positions using authorised project evidence, forensic schedule findings and relevant reference knowledge. Outputs can support claim development, assessment, rebuttal, EOT positions, chronology and resolution workflows.";
    }

    if (normalized.includes("demo") || normalized.includes("1-day") || normalized.includes("1 day")) {
      return "The launch plan includes controlled 1-day evaluation access so prospective users can explore the platform before selecting a project or organisation plan. Use Start 1-Day Demo or leave your details and the contractX.co team can arrange access.";
    }

    if (
      normalized.includes("private") ||
      normalized.includes("privacy") ||
      normalized.includes("project information") ||
      normalized.includes("project data") ||
      normalized.includes("security")
    ) {
      return "The platform is designed to separate curated reference knowledge from authorised customer project evidence, with tenant and project-scoped data boundaries. Detailed security implementation is not disclosed publicly; enterprise security information can be discussed with the contractX.co team.";
    }

    if (
      normalized.includes("price") ||
      normalized.includes("pricing") ||
      normalized.includes("cost") ||
      normalized.includes("subscription")
    ) {
      return "Launch access currently includes a controlled demo, with Single Project and Enterprise options being prepared for commercial release. For current commercial discussions, please contact the contractX.co team.";
    }

    if (
      normalized.includes("contact") ||
      normalized.includes("email") ||
      normalized.includes("whatsapp") ||
      normalized.includes("sales")
    ) {
      return `You can contact the contractX.co team at ${PUBLIC_CONTACT_EMAIL}. You can also use the WhatsApp or Leave Details options below for a follow-up.`;
    }

    return "I can help with high-level information about contractX.co, its four specialist modules, demo access, intended users, pricing approach and privacy principles. For a detailed requirement, project-specific question or commercial discussion, please use WhatsApp, email or Leave Details so the contractX.co team can follow up.";
  };

  const submitPublicChatQuestion = (question: string) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) return;

    const nextId = Date.now();
    const response = getPublicChatResponse(cleanQuestion);

    setChatMessages((previous) => [
      ...previous,
      { id: nextId, role: "user", text: cleanQuestion },
      { id: nextId + 1, role: "assistant", text: response },
    ]);
    setChatInput("");
  };

  const currentWhatsAppLeadUrl = buildWhatsAppUrl(
    `Hello contractX.co, I would like to know more about the platform. My question is: ${
      chatMessages.filter((message) => message.role === "user").at(-1)?.text ??
      "Please contact me about contractX.co."
    }`
  );

  return (
    <div
      className={`
        min-h-screen
        overflow-x-hidden
        bg-[#050608]
        text-[#F4F1EA]
        selection:bg-[#D8A84E]
        selection:text-[#050608]
        ${theme === "light" ? "cx-light" : ""}
      `}
    >
      {/* ========================================================
         GLOBAL MOTION
      ======================================================== */}

      <style>{`
        html {
          scroll-behavior: smooth;
        }

        @keyframes cx-drift {
          0% {
            transform: translate3d(0, 0, 0);
          }

          50% {
            transform: translate3d(10px, -8px, 0);
          }

          100% {
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes cx-flow {
          0% {
            stroke-dashoffset: 120;
          }

          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes cx-scan {
          0% {
            transform: translateX(-120%);
            opacity: 0;
          }

          20% {
            opacity: 0.7;
          }

          80% {
            opacity: 0.7;
          }

          100% {
            transform: translateX(120%);
            opacity: 0;
          }
        }

        @keyframes cx-float {
          0%,
          100% {
            transform: translateY(0);
          }

          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes cx-orbit {
          0% {
            transform:
              rotate(0deg)
              translateX(16px)
              rotate(0deg);
          }

          100% {
            transform:
              rotate(360deg)
              translateX(16px)
              rotate(-360deg);
          }
        }

        @keyframes cx-grid {
          0% {
            background-position: 0 0;
          }

          100% {
            background-position: 80px 80px;
          }
        }

        .cx-flow {
          animation:
            cx-flow
            2.4s
            linear
            infinite;
        }

        .cx-scan {
          animation:
            cx-scan
            6s
            ease-in-out
            infinite;
        }

        .cx-float {
          animation:
            cx-float
            5s
            ease-in-out
            infinite;
        }

        .cx-orbit {
          animation:
            cx-orbit
            10s
            linear
            infinite;
        }

        .cx-drift {
          animation:
            cx-drift
            8s
            ease-in-out
            infinite;
        }

        .cx-grid {
          animation:
            cx-grid
            18s
            linear
            infinite;
        }


        /* =========================================================
           CONTRACTX LANDING — SCOPED LIGHT MODE
           Dark mode remains the untouched design baseline.
           These rules apply only when the outer landing wrapper has
           the cx-light class.
        ========================================================= */

        .cx-light {
          color-scheme: light;
          background: #f3f0e9 !important;
          color: #17191c !important;
        }

        .cx-light [class*="bg-[#050608]"] {
          background-color: #f3f0e9 !important;
        }

        .cx-light [class*="bg-[#080B0F]"],
        .cx-light [class*="bg-[#0D0F12]"] {
          background-color: rgba(255, 255, 255, 0.88) !important;
        }

        .cx-light [class*="bg-[#160C0E]"] {
          background-color: rgba(184, 92, 92, 0.07) !important;
        }

        .cx-light [class*="bg-[#181307]"] {
          background-color: rgba(169, 130, 62, 0.08) !important;
        }

        .cx-light [class*="bg-white/["],
        .cx-light [class*="bg-white/0"],
        .cx-light [class*="bg-white/1"] {
          background-color: rgba(23, 25, 28, 0.035) !important;
        }

        .cx-light [class*="border-white"] {
          border-color: rgba(23, 25, 28, 0.11) !important;
        }

        .cx-light [class*="text-[#F4F1EA]"],
        .cx-light [class*="text-[#D6DCE1]"],
        .cx-light [class*="text-[#E2E6EA]"] {
          color: #17191c !important;
        }

        .cx-light [class*="text-[#B9C1C9]"],
        .cx-light [class*="text-[#AEB7C0]"],
        .cx-light [class*="text-[#AAB3BD]"],
        .cx-light [class*="text-[#9CA5B0]"],
        .cx-light [class*="text-[#8F99A5]"],
        .cx-light [class*="text-[#89939E]"],
        .cx-light [class*="text-[#8E98A3]"],
        .cx-light [class*="text-[#87919C]"],
        .cx-light [class*="text-[#858F9A]"],
        .cx-light [class*="text-[#838E99]"],
        .cx-light [class*="text-[#7F8994]"],
        .cx-light [class*="text-[#707A86]"],
        .cx-light [class*="text-[#69747F]"],
        .cx-light [class*="text-[#68727D]"],
        .cx-light [class*="text-[#5F6872]"] {
          color: rgba(23, 25, 28, 0.58) !important;
        }

        .cx-light [class*="text-white"] {
          color: rgba(23, 25, 28, 0.72) !important;
        }

        .cx-light [class*="hover:text-white"]:hover {
          color: #17191c !important;
        }

        .cx-light [class*="bg-[#D8A84E]"],
        .cx-light [class*="bg-[#E7BC69]"] {
          color: #050608 !important;
        }

        .cx-light [class*="shadow-2xl"] {
          box-shadow: 0 28px 72px rgba(43, 38, 28, 0.12) !important;
        }

        .cx-light .cx-light-panel {
          background: rgba(255, 255, 255, 0.90) !important;
          border-color: rgba(23, 25, 28, 0.11) !important;
          box-shadow:
            0 28px 72px rgba(43, 38, 28, 0.10),
            0 0 1px rgba(23, 25, 28, 0.10) !important;
        }

        .cx-light .cx-light-nav {
          background: rgba(243, 240, 233, 0.84) !important;
          border-color: rgba(23, 25, 28, 0.10) !important;
          box-shadow: 0 10px 35px rgba(43, 38, 28, 0.05);
        }

        .cx-light .cx-light-hero-gradient {
          background-image: linear-gradient(
            to right,
            #17191c,
            #a9823e,
            #557593
          ) !important;
        }

        .cx-light input,
        .cx-light textarea,
        .cx-light select {
          color: #17191c;
        }

        .cx-light input::placeholder,
        .cx-light textarea::placeholder {
          color: rgba(23, 25, 28, 0.34) !important;
        }


        /* Security / reference knowledge readability in light mode */
        .cx-light .cx-security-section {
          background: #ebe7de !important;
          border-color: rgba(23, 25, 28, 0.10) !important;
        }

        .cx-light .cx-security-section h2 {
          color: #17191c !important;
        }

        .cx-light .cx-security-section > div > div > div:first-child > p {
          color: rgba(23, 25, 28, 0.68) !important;
        }

        .cx-light .cx-security-card {
          background: rgba(255, 255, 255, 0.78) !important;
          border-color: rgba(23, 25, 28, 0.10) !important;
          box-shadow:
            0 12px 30px rgba(43, 38, 28, 0.06),
            inset 0 0 0 1px rgba(255, 255, 255, 0.35);
        }

        .cx-light .cx-security-card > div {
          color: #9a7336 !important;
        }

        .cx-light .cx-security-card p {
          color: rgba(23, 25, 28, 0.66) !important;
        }


        /* Demo / Request Access readability in light mode */
        .cx-light .cx-demo-access {
          background-image: linear-gradient(
            135deg,
            #fffdf8 0%,
            #f5f0e7 52%,
            #ebe5d9 100%
          ) !important;
          border-color: rgba(169, 130, 62, 0.24) !important;
          box-shadow:
            0 26px 72px rgba(43, 38, 28, 0.10),
            inset 0 0 0 1px rgba(255, 255, 255, 0.48);
        }

        .cx-light .cx-demo-access h2 {
          color: #17191c !important;
        }

        .cx-light .cx-demo-access p {
          color: rgba(23, 25, 28, 0.68) !important;
        }

        .cx-light .cx-demo-access [class*="text-[#D8A84E]"] {
          color: #9a7336 !important;
        }

        .cx-light .cx-demo-sales {
          background: rgba(255, 255, 255, 0.82) !important;
          border-color: rgba(23, 25, 28, 0.13) !important;
          color: #17191c !important;
          box-shadow: 0 8px 24px rgba(43, 38, 28, 0.06);
        }

        .cx-light .cx-demo-sales:hover {
          background: #ffffff !important;
          border-color: rgba(169, 130, 62, 0.40) !important;
          color: #8e692f !important;
        }

        @media (prefers-reduced-motion: reduce) {
          html {
            scroll-behavior: auto;
          }

          .cx-flow,
          .cx-scan,
          .cx-float,
          .cx-orbit,
          .cx-drift,
          .cx-grid {
            animation: none !important;
          }
        }
      `}</style>

      {/* ========================================================
         FUTURE INTELLIGENCE BACKGROUND
      ======================================================== */}

      <div
        className="
          pointer-events-none
          fixed
          inset-0
          z-0
          overflow-hidden
        "
      >
        <div
          className="
            absolute
            inset-0
            opacity-80
          "
          style={{
            background: `
              radial-gradient(
                circle at ${cursor.x}% ${cursor.y}%,
                rgba(216,168,78,0.10),
                transparent 22%
              ),
              radial-gradient(
                circle at 50% 24%,
                rgba(111,143,175,0.11),
                transparent 30%
              ),
              radial-gradient(
                circle at 80% 76%,
                rgba(184,110,60,0.08),
                transparent 28%
              )
            `,
          }}
        />

        <div
          className="
            cx-grid
            absolute
            inset-0
            opacity-[0.08]
          "
          style={{
            backgroundImage:
              "linear-gradient(rgba(185,193,201,0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(185,193,201,0.11) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        <div
          className="
            cx-drift
            absolute
            left-[-10%]
            top-[10%]
            h-[600px]
            w-[600px]
            rounded-full
            border
            border-white/[0.04]
          "
        />

        <div
          className="
            absolute
            bottom-[8%]
            right-[-10%]
            h-[520px]
            w-[520px]
            rounded-full
            border
            border-[#D8A84E]/10
          "
        />

        <div
          className="
            cx-scan
            absolute
            left-0
            top-[24%]
            h-px
            w-1/2
            bg-gradient-to-r
            from-transparent
            via-[#D8A84E]/50
            to-transparent
          "
        />

        <div
          className="
            cx-scan
            absolute
            left-0
            top-[69%]
            h-px
            w-2/5
            bg-gradient-to-r
            from-transparent
            via-[#6F8FAF]/50
            to-transparent
          "
        />
      </div>

      {/* ========================================================
         NAVIGATION
      ======================================================== */}

      <nav
        className="
          sticky
          top-0
          z-50
          border-b
          border-white/[0.07]
          bg-[#050608]/75
          px-5
          py-4
          backdrop-blur-2xl
          cx-light-nav
        "
      >
        <div
          className="
            mx-auto
            flex
            max-w-7xl
            items-center
            justify-between
            gap-5
          "
        >
          {/* BRAND */}

          <div
            className="
              flex
              min-w-0
              items-center
              gap-4
            "
          >
            <a
              href="/"
              className="
                group
                flex
                shrink-0
                items-baseline
                whitespace-nowrap
              "
              aria-label="contractX.co home"
            >
              <span
                className="
                  text-2xl
                  font-black
                  tracking-[-0.045em]
                  text-[#F4F1EA]
                  md:text-3xl
                "
              >
                contract
              </span>

              <span
                className="
                  relative
                  mx-[1px]
                  text-2xl
                  font-black
                  tracking-[-0.07em]
                  text-[#D8A84E]
                  md:text-3xl
                "
              >
                X

                <span
                  className="
                    absolute
                    left-[18%]
                    top-[14%]
                    h-[72%]
                    w-[64%]
                    rounded-full
                    border
                    border-[#F4F1EA]/20
                    opacity-0
                    transition-opacity
                    duration-300
                    group-hover:opacity-100
                  "
                />
              </span>

              <span
                className="
                  text-sm
                  font-bold
                  text-[#B9C1C9]
                  md:text-base
                "
              >
                .co
              </span>
            </a>

            <div
              className="
                hidden
                h-5
                w-px
                bg-white/10
                xl:block
              "
            />

            <span
              className="
                hidden
                text-[9px]
                font-semibold
                uppercase
                tracking-[0.15em]
                text-[#8F99A5]
                xl:block
              "
            >
              AI Contract & Claims Xpert
              for Construction
            </span>
          </div>

          {/* NAV LINKS */}

          <div
            className="
              hidden
              items-center
              gap-6
              lg:flex
            "
          >
            <a
              href="#platform"
              className="
                text-xs
                font-semibold
                text-[#9CA5B0]
                transition-colors
                hover:text-white
              "
            >
              Platform
            </a>

            <a
              href="#solutions"
              className="
                text-xs
                font-semibold
                text-[#9CA5B0]
                transition-colors
                hover:text-white
              "
            >
              Solutions
            </a>

            <a
              href="#pricing"
              className="
                text-xs
                font-semibold
                text-[#9CA5B0]
                transition-colors
                hover:text-white
              "
            >
              Pricing
            </a>

            <a
              href="#security"
              className="
                text-xs
                font-semibold
                text-[#9CA5B0]
                transition-colors
                hover:text-white
              "
            >
              Security
            </a>

            <a
              href="#demo"
              className="
                text-xs
                font-semibold
                text-[#9CA5B0]
                transition-colors
                hover:text-white
              "
            >
              Demo
            </a>

            <a
              href="/login"
              className="
                text-xs
                font-bold
                text-[#F4F1EA]
                transition-colors
                hover:text-[#D8A84E]
              "
            >
              Sign In
            </a>

            <a
              href="/signup"
              className="
                text-xs
                font-bold
                text-[#D8A84E]
                transition-colors
                hover:text-[#E7BC69]
              "
            >
              Sign Up
            </a>
          </div>

          {/* LIGHT / DARK THEME — self-contained landing-page control */}

          <div className="hidden items-center rounded-full border border-white/[0.09] bg-white/[0.025] p-1 sm:flex">
            <button
              type="button"
              onClick={() => switchTheme("dark")}
              aria-pressed={theme === "dark"}
              className={`rounded-full px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] transition-all ${
                theme === "dark"
                  ? "bg-[#D8A84E] text-[#050608]"
                  : "text-[#8F99A5] hover:text-white"
              }`}
            >
              Dark
            </button>

            <button
              type="button"
              onClick={() => switchTheme("light")}
              aria-pressed={theme === "light"}
              className={`rounded-full px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] transition-all ${
                theme === "light"
                  ? "bg-[#D8A84E] text-[#050608]"
                  : "text-[#8F99A5] hover:text-white"
              }`}
            >
              Light
            </button>
          </div>

          {/* MAIN CTA */}

          <button
            onClick={() =>
              openAccessModal("DEMO")
            }
            className="
              group
              relative
              shrink-0
              overflow-hidden
              rounded-full
              bg-[#D8A84E]
              px-4
              py-2.5
              text-[10px]
              font-black
              uppercase
              tracking-[0.11em]
              text-[#050608]
              transition-all
              hover:-translate-y-0.5
              hover:bg-[#E7BC69]
              md:px-5
            "
          >
            <span className="relative z-10">
              Start 1-Day Demo
            </span>

            <span
              className="
                absolute
                inset-y-0
                left-[-30%]
                w-1/3
                skew-x-[-20deg]
                bg-white/25
                opacity-0
                transition-all
                duration-500
                group-hover:left-[105%]
                group-hover:opacity-100
              "
            />
          </button>
        </div>
      </nav>

      {/* ========================================================
         PAGE CONTENT
      ======================================================== */}

      <main className="relative z-10">

        {/* ======================================================
            HERO
        ====================================================== */}

        <section
          id="platform"
          className="
            mx-auto
            max-w-7xl
            px-5
            pb-14
            pt-16
            md:pt-24
          "
        >
          <div
            className="
              grid
              items-center
              gap-12
              lg:grid-cols-[1.02fr_0.98fr]
              lg:gap-16
            "
          >
            {/* HERO COPY */}

            <div>
              <div
                className="
                  mb-7
                  inline-flex
                  items-center
                  gap-2
                  rounded-full
                  border
                  border-white/10
                  bg-white/[0.035]
                  px-4
                  py-2
                  backdrop-blur-md
                "
              >
                <CircleDot
                  className="
                    h-3.5
                    w-3.5
                    text-[#D8A84E]
                  "
                />

                <span
                  className="
                    text-[10px]
                    font-bold
                    uppercase
                    tracking-[0.18em]
                    text-[#B9C1C9]
                  "
                >
                  Construction Contract &
                  Claims Intelligence
                </span>
              </div>

              <h1
                className="
                  max-w-4xl
                  text-5xl
                  font-black
                  leading-[0.98]
                  tracking-[-0.055em]
                  text-[#F4F1EA]
                  sm:text-6xl
                  lg:text-[5.15rem]
                "
              >
                Your AI{" "}

                <span
                  className="
                    bg-gradient-to-r
                    from-[#F4F1EA]
                    via-[#D8A84E]
                    to-[#AEB7C0]
                    bg-clip-text
                    text-transparent
                    cx-light-hero-gradient
                  "
                >
                  Contract & Claims Xpert
                </span>{" "}

                for Construction.
              </h1>

              <p
                className="
                  mt-7
                  max-w-2xl
                  text-xl
                  font-semibold
                  leading-8
                  text-[#D6DCE1]
                  md:text-2xl
                "
              >
                Review. Monitor. Resolve.
              </p>

              <p
                className="
                  mt-3
                  max-w-2xl
                  text-base
                  leading-7
                  text-[#AAB3BD]
                  md:text-lg
                "
              >
                Understand the contract,
                connect it to what is
                happening on the project,
                analyse delay and evidence,
                and develop a defensible
                contractual position for
                resolution.
              </p>

              {/* HERO ACTIONS */}

              <div
                className="
                  mt-8
                  flex
                  flex-col
                  gap-3
                  sm:flex-row
                "
              >
                <button
                  onClick={() =>
                    openAccessModal("DEMO")
                  }
                  className="
                    group
                    inline-flex
                    items-center
                    justify-center
                    gap-2
                    rounded-full
                    bg-[#D8A84E]
                    px-6
                    py-3.5
                    text-xs
                    font-black
                    uppercase
                    tracking-[0.12em]
                    text-[#050608]
                    transition-all
                    hover:-translate-y-0.5
                    hover:bg-[#E7BC69]
                  "
                >
                  Start 1-Day Demo

                  <ArrowRight
                    className="
                      h-4
                      w-4
                      transition-transform
                      group-hover:translate-x-1
                    "
                  />
                </button>

                <button
                  onClick={() =>
                    openAccessModal("BUSINESS")
                  }
                  className="
                    inline-flex
                    items-center
                    justify-center
                    gap-2
                    rounded-full
                    border
                    border-white/10
                    bg-white/[0.035]
                    px-6
                    py-3.5
                    text-xs
                    font-black
                    uppercase
                    tracking-[0.12em]
                    text-[#E2E6EA]
                    transition-all
                    hover:border-[#D8A84E]/50
                    hover:bg-white/[0.06]
                  "
                >
                  Book a Demo
                </button>

                <a
                  href="/signup"
                  className="
                    inline-flex
                    items-center
                    justify-center
                    rounded-full
                    border
                    border-white/[0.07]
                    px-6
                    py-3.5
                    text-xs
                    font-black
                    uppercase
                    tracking-[0.12em]
                    text-[#B9C1C9]
                    transition-all
                    hover:text-white
                  "
                >
                  Sign Up
                </a>
              </div>

              {/* HERO TRUST STRIP */}

              <div
                className="
                  mt-9
                  flex
                  flex-wrap
                  gap-x-6
                  gap-y-3
                  text-[10px]
                  font-semibold
                  uppercase
                  tracking-[0.14em]
                  text-[#7F8994]
                "
              >
                <span
                  className="
                    inline-flex
                    items-center
                    gap-2
                  "
                >
                  <ShieldCheck
                    className="
                      h-3.5
                      w-3.5
                      text-[#6F9C83]
                    "
                  />

                  Private Project Workspace
                </span>

                <span
                  className="
                    inline-flex
                    items-center
                    gap-2
                  "
                >
                  <Cpu
                    className="
                      h-3.5
                      w-3.5
                      text-[#D8A84E]
                    "
                  />

                  AI Reasoning
                </span>

                <span
                  className="
                    inline-flex
                    items-center
                    gap-2
                  "
                >
                  <GitBranch
                    className="
                      h-3.5
                      w-3.5
                      text-[#6F8FAF]
                    "
                  />

                  Deterministic Schedule
                  Analytics
                </span>
              </div>
            </div>

            {/* ====================================================
                HERO INTELLIGENCE GRAPHIC
            ==================================================== */}

            <div
              className="
                relative
                min-h-[490px]
                lg:min-h-[560px]
              "
            >
              <div
                className="
                  absolute
                  inset-0
                  rounded-[28px]
                  border
                  border-white/[0.07]
                  bg-white/[0.018]
                  backdrop-blur-[2px]
                "
              />

              {/* STATUS */}

              <div
                className="
                  absolute
                  left-5
                  top-5
                  z-10
                  flex
                  items-center
                  gap-2
                  rounded-full
                  border
                  border-white/[0.08]
                  bg-[#080B0F]/80
                  px-3
                  py-2
                  backdrop-blur-xl
                "
              >
                <span
                  className="
                    h-1.5
                    w-1.5
                    animate-pulse
                    rounded-full
                    bg-[#6F9C83]
                  "
                />

                <span
                  className="
                    text-[9px]
                    font-bold
                    uppercase
                    tracking-[0.16em]
                    text-[#8F99A5]
                  "
                >
                  Intelligence Field / Live
                </span>
              </div>

              {/* CONNECTORS */}

              <svg
                viewBox="0 0 1000 700"
                className="
                  absolute
                  inset-0
                  h-full
                  w-full
                "
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient
                    id="cxLineGold"
                    x1="0"
                    x2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#D8A84E"
                      stopOpacity="0"
                    />

                    <stop
                      offset="50%"
                      stopColor="#D8A84E"
                      stopOpacity="0.9"
                    />

                    <stop
                      offset="100%"
                      stopColor="#D8A84E"
                      stopOpacity="0"
                    />
                  </linearGradient>

                  <linearGradient
                    id="cxLineBlue"
                    x1="0"
                    x2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#6F8FAF"
                      stopOpacity="0"
                    />

                    <stop
                      offset="50%"
                      stopColor="#6F8FAF"
                      stopOpacity="0.8"
                    />

                    <stop
                      offset="100%"
                      stopColor="#6F8FAF"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>

                <g opacity="0.58">
                  <path
                    d="
                      M 170 295
                      C 290 255,
                        345 320,
                        500 350
                    "
                    stroke="url(#cxLineGold)"
                    strokeWidth="1.25"
                    fill="none"
                    strokeDasharray="18 14"
                    className="cx-flow"
                  />

                  <path
                    d="
                      M 290 510
                      C 345 445,
                        410 405,
                        500 350
                    "
                    stroke="url(#cxLineBlue)"
                    strokeWidth="1.1"
                    fill="none"
                    strokeDasharray="14 14"
                    className="cx-flow"
                  />

                  <path
                    d="
                      M 500 350
                      C 610 305,
                        680 230,
                        730 190
                    "
                    stroke="url(#cxLineBlue)"
                    strokeWidth="1.15"
                    fill="none"
                    strokeDasharray="20 15"
                    className="cx-flow"
                  />

                  <path
                    d="
                      M 500 350
                      C 630 390,
                        705 465,
                        820 500
                    "
                    stroke="url(#cxLineGold)"
                    strokeWidth="1.3"
                    fill="none"
                    strokeDasharray="16 13"
                    className="cx-flow"
                  />

                  <path
                    d="
                      M 500 350
                      C 520 285,
                        520 230,
                        500 145
                    "
                    stroke="url(#cxLineGold)"
                    strokeWidth="1.15"
                    fill="none"
                    strokeDasharray="18 13"
                    className="cx-flow"
                  />

                  <path
                    d="
                      M 820 500
                      C 870 450,
                        910 410,
                        900 345
                    "
                    stroke="url(#cxLineGold)"
                    strokeWidth="1"
                    fill="none"
                    strokeDasharray="12 13"
                    className="cx-flow"
                  />
                </g>
              </svg>

              {/* CENTRAL CORE */}

              <div
                className="
                  absolute
                  left-1/2
                  top-1/2
                  z-20
                "
                style={{
                  transform: `
                    translate(
                      calc(
                        -50% +
                        ${
                          (cursor.x - 50) *
                          0.045
                        }px
                      ),
                      calc(
                        -50% +
                        ${
                          (cursor.y - 50) *
                          0.035
                        }px
                      )
                    )
                  `,
                }}
              >
                <div
                  className="
                    relative
                    flex
                    h-40
                    w-40
                    items-center
                    justify-center
                    rounded-full
                    border
                    border-[#D8A84E]/30
                    bg-[#080B0F]/90
                    shadow-[0_0_70px_rgba(216,168,78,0.12)]
                    backdrop-blur-xl
                  "
                >
                  <div
                    className="
                      absolute
                      inset-[-18px]
                      rounded-full
                      border
                      border-white/[0.05]
                    "
                  />

                  <div
                    className="
                      absolute
                      inset-[-34px]
                      rounded-full
                      border
                      border-[#6F8FAF]/10
                    "
                  />

                  <div
                    className="
                      cx-orbit
                      absolute
                      left-1/2
                      top-1/2
                      h-2
                      w-2
                      rounded-full
                      bg-[#D8A84E]
                      shadow-[0_0_18px_rgba(216,168,78,0.8)]
                    "
                  />

                  <div className="text-center">
                    <div
                      className="
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.24em]
                        text-[#7F8994]
                      "
                    >
                      Intelligence
                    </div>

                    <div
                      className="
                        mt-1
                        text-2xl
                        font-black
                        tracking-[-0.05em]
                        text-[#F4F1EA]
                      "
                    >
                      contract

                      <span
                        className="
                          text-[#D8A84E]
                        "
                      >
                        X
                      </span>
                    </div>

                    <div
                      className="
                        mt-1
                        text-[8px]
                        font-bold
                        uppercase
                        tracking-[0.2em]
                        text-[#8F99A5]
                      "
                    >
                      Platform
                    </div>
                  </div>
                </div>
              </div>

              {/* DATA NODES */}

              {heroNodes.map(
                (node, index) => {
                  const isRisk =
                    node.type === "risk";

                  const isResolution =
                    node.type ===
                    "resolution";

                  return (
                    <div
                      key={node.label}
                      className="
                        absolute
                        z-20
                      "
                      style={{
                        left: `${node.x}%`,
                        top: `${node.y}%`,
                        transform: `
                          translate(-50%, -50%)
                          translate(
                            ${
                              (cursor.x - 50) *
                              (0.016 +
                                index *
                                  0.002)
                            }px,
                            ${
                              (cursor.y - 50) *
                              0.012
                            }px
                          )
                        `,
                      }}
                    >
                      <div
                        className={`
                          cx-float
                          flex
                          items-center
                          gap-2
                          rounded-full
                          border
                          px-3
                          py-2
                          backdrop-blur-xl

                          ${
                            isRisk
                              ? `
                                border-[#B85C5C]/30
                                bg-[#160C0E]/70
                              `
                              : isResolution
                              ? `
                                border-[#D8A84E]/30
                                bg-[#181307]/70
                              `
                              : `
                                border-white/[0.09]
                                bg-[#080B0F]/80
                              `
                          }
                        `}
                        style={{
                          animationDelay:
                            `${index * 0.45}s`,
                        }}
                      >
                        <span
                          className={`
                            h-2
                            w-2
                            rounded-full

                            ${
                              isRisk
                                ? "bg-[#B85C5C]"
                                : isResolution
                                ? "bg-[#D8A84E]"
                                : "bg-[#6F8FAF]"
                            }
                          `}
                        />

                        <span
                          className="
                            text-[9px]
                            font-bold
                            uppercase
                            tracking-[0.16em]
                            text-[#B9C1C9]
                          "
                        >
                          {node.label}
                        </span>
                      </div>
                    </div>
                  );
                }
              )}

              {/* GRAPHIC FOOTER */}

              <div
                className="
                  absolute
                  bottom-5
                  left-5
                  right-5
                  z-20
                  rounded-2xl
                  border
                  border-white/[0.08]
                  bg-[#080B0F]/75
                  p-4
                  backdrop-blur-2xl
                "
              >
                <div
                  className="
                    flex
                    items-center
                    justify-between
                  "
                >
                  <div>
                    <div
                      className="
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.18em]
                        text-[#7F8994]
                      "
                    >
                      Current module
                    </div>

                    <div
                      className="
                        mt-1
                        text-sm
                        font-bold
                        text-[#F4F1EA]
                      "
                    >
                      {
                        activeModule.label
                      }
                    </div>
                  </div>

                  <div
                    className="
                      flex
                      items-center
                      gap-2
                      rounded-full
                      border
                      border-[#6F9C83]/20
                      bg-[#6F9C83]/[0.08]
                      px-3
                      py-1.5
                    "
                  >
                    <span
                      className="
                        h-1.5
                        w-1.5
                        animate-pulse
                        rounded-full
                        bg-[#6F9C83]
                      "
                    />

                    <span
                      className="
                        text-[8px]
                        font-bold
                        uppercase
                        tracking-[0.16em]
                        text-[#84B396]
                      "
                    >
                      Active
                    </span>
                  </div>
                </div>

                <div
                  className="
                    mt-3
                    h-px
                    overflow-hidden
                    bg-white/[0.06]
                  "
                >
                  <div
                    className="
                      cx-scan
                      h-full
                      w-2/3
                      bg-gradient-to-r
                      from-transparent
                      via-[#D8A84E]
                      to-transparent
                    "
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ====================================================
              FOUR MODULE CONTROLS
          ==================================================== */}

          <div
            className="
              mt-12
              grid
              gap-2
              rounded-2xl
              border
              border-white/[0.07]
              bg-white/[0.018]
              p-2
              backdrop-blur-xl
              md:grid-cols-4
            "
          >
            {platformModules.map(
              (module) => {
                const active =
                  module.id === activeTab;

                return (
                  <button
                    key={module.id}
                    onClick={() =>
                      setActiveTab(
                        module.id
                      )
                    }
                    className={`
                      group
                      relative
                      overflow-hidden
                      rounded-xl
                      px-4
                      py-4
                      text-left
                      transition-all
                      duration-300

                      ${
                        active
                          ? `
                            bg-[#F4F1EA]/[0.07]
                            shadow-[inset_0_0_0_1px_rgba(216,168,78,0.2)]
                          `
                          : `
                            hover:bg-white/[0.035]
                          `
                      }
                    `}
                  >
                    <div
                      className="
                        flex
                        items-center
                        justify-between
                        gap-3
                      "
                    >
                      <span
                        className={`
                          text-[9px]
                          font-bold
                          uppercase
                          tracking-[0.18em]

                          ${
                            active
                              ? "text-[#D8A84E]"
                              : "text-[#707A86]"
                          }
                        `}
                      >
                        {module.kicker}
                      </span>

                      <ChevronRight
                        className={`
                          h-4
                          w-4
                          transition-all

                          ${
                            active
                              ? `
                                translate-x-0
                                text-[#D8A84E]
                              `
                              : `
                                -translate-x-1
                                text-[#5F6872]
                                group-hover:translate-x-0
                              `
                          }
                        `}
                      />
                    </div>

                    <div
                      className={`
                        mt-2
                        text-sm
                        font-black
                        tracking-[-0.02em]

                        ${
                          active
                            ? "text-[#F4F1EA]"
                            : "text-[#AEB7C0]"
                        }
                      `}
                    >
                      {module.label}
                    </div>

                    <div
                      className="
                        mt-1
                        text-[10px]
                        leading-4
                        text-[#707A86]
                      "
                    >
                      {module.description}
                    </div>

                    {active && (
                      <div
                        className="
                          absolute
                          bottom-0
                          left-4
                          right-4
                          h-px
                          bg-gradient-to-r
                          from-transparent
                          via-[#D8A84E]
                          to-transparent
                        "
                      />
                    )}
                  </button>
                );
              }
            )}
          </div>
        </section>

        {/* ======================================================
            MODULE DISPLAY
        ====================================================== */}

        <section
          className="
            mx-auto
            max-w-7xl
            px-5
            pb-20
          "
        >
          <div
            className="
              overflow-hidden
              rounded-[26px]
              border
              border-white/[0.07]
              bg-[#080B0F]/80
              shadow-2xl
              backdrop-blur-2xl
            "
          >
            {/* MODULE HEADER */}

            <div
              className="
                flex
                flex-col
                justify-between
                gap-4
                border-b
                border-white/[0.07]
                px-6
                py-5
                md:flex-row
                md:items-center
                md:px-8
              "
            >
              <div>
                <div
                  className="
                    text-[9px]
                    font-bold
                    uppercase
                    tracking-[0.2em]
                    text-[#D8A84E]
                  "
                >
                  {activeModule.kicker}
                </div>

                <h2
                  className="
                    mt-1
                    text-2xl
                    font-black
                    tracking-[-0.04em]
                    text-[#F4F1EA]
                  "
                >
                  {activeModule.label}
                </h2>
              </div>

              <div
                className="
                  flex
                  items-center
                  gap-2
                  text-[9px]
                  font-bold
                  uppercase
                  tracking-[0.15em]
                  text-[#7F8994]
                "
              >
                <span
                  className="
                    h-1.5
                    w-1.5
                    animate-pulse
                    rounded-full
                    bg-[#6F9C83]
                  "
                />

                Active
              </div>
            </div>

            {/* ==================================================
                ASK CONTRACTX
            ================================================== */}

            {activeTab === "ASK" && (
              <div
                className="
                  grid
                  gap-8
                  p-6
                  md:p-8
                  lg:grid-cols-[0.95fr_1.05fr]
                "
              >
                {/* INTELLIGENCE PIPELINE */}

                <div>
                  <div
                    className="
                      rounded-2xl
                      border
                      border-white/[0.07]
                      bg-white/[0.02]
                      p-5
                    "
                  >
                    <div
                      className="
                        flex
                        items-center
                        gap-2
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.17em]
                        text-[#87919C]
                      "
                    >
                      <Sparkles
                        className="
                          h-3.5
                          w-3.5
                          text-[#D8A84E]
                        "
                      />

                      ContractX Intelligence
                      in Motion
                    </div>

                    <div
                      className="
                        mt-5
                        space-y-2
                      "
                    >
                      {[
                        "Authorized project context",
                        "Contract intelligence",
                        "Project evidence",
                        "Schedule intelligence",
                        "AI reasoning",
                      ].map(
                        (
                          item,
                          index
                        ) => {
                          const active =
                            index ===
                            queryStep;

                          const complete =
                            index <
                            queryStep;

                          return (
                            <div
                              key={
                                item
                              }
                              className={`
                                flex
                                items-center
                                gap-3
                                rounded-xl
                                border
                                px-3
                                py-3
                                transition-all

                                ${
                                  active
                                    ? `
                                      border-[#D8A84E]/25
                                      bg-[#D8A84E]/[0.06]
                                    `
                                    : complete
                                    ? `
                                      border-[#6F9C83]/20
                                      bg-[#6F9C83]/[0.035]
                                    `
                                    : `
                                      border-white/[0.05]
                                      bg-white/[0.015]
                                    `
                                }
                              `}
                            >
                              <div
                                className={`
                                  flex
                                  h-7
                                  w-7
                                  items-center
                                  justify-center
                                  rounded-full

                                  ${
                                    active
                                      ? `
                                        bg-[#D8A84E]
                                        text-[#050608]
                                      `
                                      : complete
                                      ? `
                                        bg-[#6F9C83]/15
                                        text-[#84B396]
                                      `
                                      : `
                                        bg-white/[0.04]
                                        text-[#707A86]
                                      `
                                  }
                                `}
                              >
                                {complete ? (
                                  <CheckCircle2
                                    className="
                                      h-4
                                      w-4
                                    "
                                  />
                                ) : (
                                  <span
                                    className="
                                      text-[9px]
                                      font-black
                                    "
                                  >
                                    {index +
                                      1}
                                  </span>
                                )}
                              </div>

                              <span
                                className={`
                                  text-xs
                                  font-semibold

                                  ${
                                    active
                                      ? "text-[#F4F1EA]"
                                      : "text-[#8A949F]"
                                  }
                                `}
                              >
                                {item}
                              </span>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>

                {/* RESPONSE SIMULATION */}

                <div
                  className="
                    flex
                    flex-col
                    rounded-2xl
                    border
                    border-white/[0.07]
                    bg-[#050608]
                    p-5
                  "
                >
                  <div
                    className="
                      flex
                      items-center
                      justify-between
                      gap-3
                      border-b
                      border-white/[0.06]
                      pb-4
                    "
                  >
                    <div>
                      <div
                        className="
                          text-[9px]
                          font-bold
                          uppercase
                          tracking-[0.17em]
                          text-[#7F8994]
                        "
                      >
                        Example Query
                      </div>

                      <p
                        className="
                          mt-1
                          text-sm
                          font-semibold
                          leading-6
                          text-[#F4F1EA]
                        "
                      >
                        “What is the
                        contractual
                        significance of
                        the delayed Site
                        Access event, and
                        what does the
                        current programme
                        and project
                        evidence indicate?”
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        setIsPlaying(
                          (previous) =>
                            !previous
                        )
                      }
                      className="
                        shrink-0
                        rounded-full
                        border
                        border-white/[0.08]
                        bg-white/[0.03]
                        p-2.5
                        text-[#B9C1C9]
                        transition-colors
                        hover:border-[#D8A84E]/40
                        hover:text-[#D8A84E]
                      "
                    >
                      {isPlaying ? (
                        <Pause
                          className="
                            h-4
                            w-4
                          "
                        />
                      ) : (
                        <Play
                          className="
                            h-4
                            w-4
                          "
                        />
                      )}
                    </button>
                  </div>

                  <div
                    className="
                      mt-5
                      flex-1
                      rounded-xl
                      border
                      border-[#D8A84E]/15
                      bg-[#D8A84E]/[0.035]
                      p-5
                    "
                  >
                    <div
                      className="
                        flex
                        items-center
                        justify-between
                      "
                    >
                      <span
                        className="
                          inline-flex
                          items-center
                          gap-2
                          text-[9px]
                          font-bold
                          uppercase
                          tracking-[0.18em]
                          text-[#D8A84E]
                        "
                      >
                        {
                          currentStage.icon
                        }

                        {
                          currentStage.tag
                        }
                      </span>

                      <span
                        className="
                          text-[9px]
                          font-mono
                          text-[#69747F]
                        "
                      >
                        STEP{" "}
                        {queryStep + 1}
                        /5
                      </span>
                    </div>

                    <h3
                      className="
                        mt-5
                        text-xl
                        font-black
                        tracking-[-0.03em]
                        text-[#F4F1EA]
                      "
                    >
                      {
                        currentStage.title
                      }
                    </h3>

                    <p
                      className="
                        mt-2
                        max-w-2xl
                        text-sm
                        leading-6
                        text-[#AAB3BD]
                      "
                    >
                      {
                        currentStage.description
                      }
                    </p>

                    <div
                      className="
                        mt-6
                        h-1
                        overflow-hidden
                        rounded-full
                        bg-white/[0.05]
                      "
                    >
                      <div
                        className="
                          h-full
                          rounded-full
                          bg-gradient-to-r
                          from-[#6F8FAF]
                          via-[#D8A84E]
                          to-[#F4F1EA]
                          transition-all
                          duration-700
                        "
                        style={{
                          width: `${
                            ((queryStep +
                              1) /
                              5) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div
                    className="
                      mt-5
                      flex
                      flex-col
                      gap-3
                      border-t
                      border-white/[0.06]
                      pt-4
                      sm:flex-row
                      sm:items-center
                      sm:justify-between
                    "
                  >
                    <span
                      className="
                        text-[10px]
                        leading-5
                        text-[#68727D]
                      "
                    >
                      Curated reference
                      knowledge + private
                      project evidence +
                      verified schedule
                      intelligence.
                    </span>

                    <button
                      onClick={() =>
                        openAccessModal(
                          "DEMO"
                        )
                      }
                      className="
                        inline-flex
                        items-center
                        justify-center
                        gap-2
                        rounded-full
                        bg-[#D8A84E]
                        px-5
                        py-2.5
                        text-[10px]
                        font-black
                        uppercase
                        tracking-[0.12em]
                        text-[#050608]
                      "
                    >
                      Explore Ask
                      ContractX

                      <ArrowRight
                        className="
                          h-3.5
                          w-3.5
                        "
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ==================================================
                BESPOKE REVIEW
            ================================================== */}

            {activeTab ===
              "BESPOKE" && (
              <div
                className="
                  grid
                  gap-5
                  p-6
                  md:p-8
                  lg:grid-cols-3
                "
              >
                {[
                  {
                    icon: (
                      <FileText
                        className="
                          h-5
                          w-5
                        "
                      />
                    ),
                    title:
                      "Clause Mapping",
                    value:
                      "Structured Review",
                    text:
                      "Map the bespoke contract structure against curated construction contract and claims reference knowledge.",
                  },

                  {
                    icon: (
                      <TriangleAlert
                        className="
                          h-5
                          w-5
                        "
                      />
                    ),
                    title:
                      "Risk Intelligence",
                    value:
                      "Deviation → Exposure",
                    text:
                      "Identify restrictive notices, liability shifts, ambiguous provisions, missing protections and material risk allocation.",
                  },

                  {
                    icon: (
                      <Send
                        className="
                          h-5
                          w-5
                        "
                      />
                    ),
                    title:
                      "Recommendation",
                    value:
                      "Action Ready",
                    text:
                      "Produce structured recommendations, negotiation positions and proposed amendment wording for professional review.",
                  },
                ].map(
                  (
                    card,
                    index
                  ) => (
                    <div
                      key={
                        card.title
                      }
                      className="
                        group
                        rounded-2xl
                        border
                        border-white/[0.07]
                        bg-white/[0.02]
                        p-5
                        transition-all
                        hover:-translate-y-1
                        hover:border-[#D8A84E]/20
                      "
                    >
                      <div
                        className="
                          flex
                          h-10
                          w-10
                          items-center
                          justify-center
                          rounded-xl
                          border
                          border-[#D8A84E]/15
                          bg-[#D8A84E]/[0.06]
                          text-[#D8A84E]
                        "
                      >
                        {card.icon}
                      </div>

                      <div
                        className="
                          mt-6
                          text-[9px]
                          font-bold
                          uppercase
                          tracking-[0.18em]
                          text-[#7F8994]
                        "
                      >
                        0
                        {index +
                          1}{" "}
                        /{" "}
                        {
                          card.title
                        }
                      </div>

                      <h3
                        className="
                          mt-2
                          text-lg
                          font-black
                          tracking-[-0.03em]
                          text-[#F4F1EA]
                        "
                      >
                        {card.value}
                      </h3>

                      <p
                        className="
                          mt-2
                          text-sm
                          leading-6
                          text-[#8E98A3]
                        "
                      >
                        {card.text}
                      </p>
                    </div>
                  )
                )}
              </div>
            )}

            {/* ==================================================
                DELAY / FORENSIC ANALYTICS
            ================================================== */}

            {activeTab ===
              "DELAY" && (
              <div
                className="
                  p-6
                  md:p-8
                "
              >
                <div
                  className="
                    grid
                    gap-4
                    md:grid-cols-4
                  "
                >
                  {[
                    [
                      "Critical Path",
                      "Zone B Handover",
                      "0d Float",
                    ],

                    [
                      "Float Movement",
                      "-18d",
                      "High erosion",
                    ],

                    [
                      "Current Slippage",
                      "+42d",
                      "Update #06",
                    ],

                    [
                      "Method",
                      "Window Analysis",
                      "Verified analysis",
                    ],
                  ].map(
                    ([
                      label,
                      value,
                      detail,
                    ]) => (
                      <div
                        key={
                          label
                        }
                        className="
                          rounded-2xl
                          border
                          border-white/[0.07]
                          bg-white/[0.02]
                          p-5
                        "
                      >
                        <div
                          className="
                            text-[9px]
                            font-bold
                            uppercase
                            tracking-[0.16em]
                            text-[#7F8994]
                          "
                        >
                          {label}
                        </div>

                        <div
                          className="
                            mt-3
                            text-lg
                            font-black
                            tracking-[-0.03em]
                            text-[#F4F1EA]
                          "
                        >
                          {value}
                        </div>

                        <div
                          className="
                            mt-1
                            text-[10px]
                            font-semibold
                            text-[#B85C5C]
                          "
                        >
                          {detail}
                        </div>
                      </div>
                    )
                  )}
                </div>

                <div
                  className="
                    mt-5
                    rounded-2xl
                    border
                    border-white/[0.07]
                    bg-[#050608]
                    p-5
                  "
                >
                  <div
                    className="
                      flex
                      flex-col
                      gap-4
                      md:flex-row
                      md:items-center
                      md:justify-between
                    "
                  >
                    <div>
                      <div
                        className="
                          text-[9px]
                          font-bold
                          uppercase
                          tracking-[0.18em]
                          text-[#6F8FAF]
                        "
                      >
                        Deterministic
                        Schedule Analytics
                      </div>

                      <h3
                        className="
                          mt-1
                          text-xl
                          font-black
                          text-[#F4F1EA]
                        "
                      >
                        CPM + Critical
                        Path + Float +
                        Delay Analysis
                      </h3>
                    </div>

                    <div
                      className="
                        flex
                        items-center
                        gap-2
                        rounded-full
                        border
                        border-[#6F9C83]/20
                        bg-[#6F9C83]/[0.07]
                        px-3
                        py-1.5
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.15em]
                        text-[#84B396]
                      "
                    >
                      <Activity
                        className="
                          h-3.5
                          w-3.5
                        "
                      />

                      Deterministic
                    </div>
                  </div>

                  {/* PROGRAMME VISUAL */}

                  <div
                    className="
                      mt-6
                      overflow-hidden
                      rounded-xl
                      border
                      border-white/[0.06]
                      bg-white/[0.015]
                    "
                  >
                    {[
                      [
                        "A1020",
                        "Foundation Release",
                        8,
                        20,
                      ],

                      [
                        "A1040",
                        "Zone B Access",
                        20,
                        29,
                      ],

                      [
                        "A1110",
                        "MEP Installation",
                        42,
                        30,
                      ],
                    ].map(
                      ([
                        code,
                        name,
                        left,
                        width,
                      ]) => (
                        <div
                          key={
                            code
                          }
                          className="
                            flex
                            min-h-[64px]
                            items-center
                            border-b
                            border-white/[0.04]
                            px-4
                            last:border-0
                          "
                        >
                          <div
                            className="
                              w-44
                              shrink-0
                            "
                          >
                            <div
                              className="
                                text-[10px]
                                font-mono
                                font-bold
                                text-[#D8A84E]
                              "
                            >
                              {code}
                            </div>

                            <div
                              className="
                                mt-0.5
                                text-xs
                                text-[#9099A3]
                              "
                            >
                              {name}
                            </div>
                          </div>

                          <div
                            className="
                              relative
                              h-14
                              flex-1
                              bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]
                              [background-size:10%_100%]
                            "
                          >
                            <div
                              className="
                                absolute
                                top-[21px]
                                h-3
                                rounded-sm
                                bg-[#6F8FAF]/65
                              "
                              style={{
                                left:
                                  `${left}%`,
                                width:
                                  `${width}%`,
                              }}
                            />
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ==================================================
                CLAIMS & RESOLUTION
            ================================================== */}

            {activeTab ===
              "RESOLUTION" && (
              <div
                className="
                  grid
                  gap-6
                  p-6
                  md:p-8
                  lg:grid-cols-[1fr_0.95fr]
                "
              >
                <div
                  className="
                    space-y-3
                  "
                >
                  {[
                    [
                      "01",
                      "Verified project evidence",
                      "Contract, correspondence, reports, notices and contemporaneous records.",
                    ],

                    [
                      "02",
                      "Forensic schedule findings",
                      "Validated critical path, delay, float and programme metrics.",
                    ],

                    [
                      "03",
                      "Contractual position",
                      "Applicable provisions, evidence, exposure, entitlement and response considerations.",
                    ],

                    [
                      "04",
                      "Resolution-ready output",
                      "Structured claim, assessment, response, chronology or professional report.",
                    ],
                  ].map(
                    ([
                      step,
                      title,
                      description,
                    ]) => (
                      <div
                        key={
                          step
                        }
                        className="
                          flex
                          gap-4
                          rounded-2xl
                          border
                          border-white/[0.07]
                          bg-white/[0.02]
                          p-4
                        "
                      >
                        <div
                          className="
                            text-xs
                            font-mono
                            font-bold
                            text-[#D8A84E]
                          "
                        >
                          {step}
                        </div>

                        <div>
                          <div
                            className="
                              text-sm
                              font-bold
                              text-[#F4F1EA]
                            "
                          >
                            {title}
                          </div>

                          <div
                            className="
                              mt-1
                              text-xs
                              leading-5
                              text-[#838E99]
                            "
                          >
                            {
                              description
                            }
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>

                <div
                  className="
                    relative
                    overflow-hidden
                    rounded-2xl
                    border
                    border-white/[0.07]
                    bg-[#050608]
                    p-6
                  "
                >
                  <div
                    className="
                      absolute
                      right-0
                      top-0
                      h-40
                      w-40
                      rounded-full
                      bg-[#D8A84E]/[0.06]
                      blur-3xl
                    "
                  />

                  <div className="relative">
                    <div
                      className="
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.18em]
                        text-[#D8A84E]
                      "
                    >
                      Claims & Resolution
                    </div>

                    <h3
                      className="
                        mt-2
                        text-2xl
                        font-black
                        tracking-[-0.04em]
                        text-[#F4F1EA]
                      "
                    >
                      Evidence → Position →
                      Resolution.
                    </h3>

                    <p
                      className="
                        mt-3
                        text-sm
                        leading-6
                        text-[#8E98A3]
                      "
                    >
                      Build, assess or
                      respond to
                      contractual issues
                      using verified
                      evidence and schedule
                      findings without
                      mixing deterministic
                      results with
                      generative
                      assumptions.
                    </p>

                    <div
                      className="
                        mt-7
                        grid
                        gap-2
                      "
                    >
                      {[
                        "Claim preparation",
                        "Claim assessment",
                        "Response / rebuttal",
                        "EOT position",
                        "Chronology",
                        "Evidence register",
                        "Executive summary",
                        "PDF / DOCX output",
                      ].map(
                        (item) => (
                          <div
                            key={
                              item
                            }
                            className="
                              flex
                              items-center
                              gap-2
                              rounded-lg
                              border
                              border-white/[0.05]
                              bg-white/[0.02]
                              px-3
                              py-2
                            "
                          >
                            <CheckCircle2
                              className="
                                mt-0.5
                                h-3.5
                                w-3.5
                                text-[#6F9C83]
                              "
                            />

                            <span
                              className="
                                text-xs
                                font-medium
                                text-[#B2BAC3]
                              "
                            >
                              {item}
                            </span>
                          </div>
                        )
                      )}
                    </div>

                    <button
                      onClick={() =>
                        openAccessModal(
                          "DEMO"
                        )
                      }
                      className="
                        mt-7
                        inline-flex
                        items-center
                        gap-2
                        rounded-full
                        bg-[#D8A84E]
                        px-5
                        py-2.5
                        text-[10px]
                        font-black
                        uppercase
                        tracking-[0.12em]
                        text-[#050608]
                      "
                    >
                      Explore Claims &
                      Resolution

                      <ArrowRight
                        className="
                          h-3.5
                          w-3.5
                        "
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ======================================================
            REVIEW MONITOR RESOLVE
        ====================================================== */}

        <section
          id="solutions"
          className="
            border-y
            border-white/[0.06]
            bg-white/[0.012]
          "
        >
          <div
            className="
              mx-auto
              max-w-7xl
              px-5
              py-20
            "
          >
            <div className="max-w-3xl">
              <div
                className="
                  text-[9px]
                  font-bold
                  uppercase
                  tracking-[0.2em]
                  text-[#D8A84E]
                "
              >
                Construction Contract
                Lifecycle
              </div>

              <h2
                className="
                  mt-3
                  text-4xl
                  font-black
                  tracking-[-0.05em]
                  text-[#F4F1EA]
                  md:text-5xl
                "
              >
                Review. Monitor. Resolve.
              </h2>

              <p
                className="
                  mt-4
                  text-sm
                  leading-6
                  text-[#838E99]
                  md:text-base
                "
              >
                contractX.co supports the
                construction contract
                lifecycle from
                pre-contract review and
                live project monitoring
                through entitlement
                assessment, claims
                evaluation and dispute
                resolution.
              </p>
            </div>

            <div
              className="
                mt-10
                grid
                gap-4
                lg:grid-cols-3
              "
            >
              {[
                {
                  label:
                    "REVIEW",
                  title:
                    "Understand the contractual position before risk becomes exposure.",
                  text:
                    "Review contract provisions, benchmark deviations, obligations, notice requirements, liability allocation and recommended amendments before and during project execution.",
                  icon: (
                    <FileCheck2
                      className="
                        h-5
                        w-5
                      "
                    />
                  ),
                },

                {
                  label:
                    "MONITOR",
                  title:
                    "Connect the contract to what is actually happening on the project.",
                  text:
                    "Monitor project events, correspondence, programme movement, critical path, notices and contemporaneous evidence against contractual obligations and positions.",
                  icon: (
                    <Activity
                      className="
                        h-5
                        w-5
                      "
                    />
                  ),
                },

                {
                  label:
                    "RESOLVE",
                  title:
                    "Turn project evidence into a defensible contractual position.",
                  text:
                    "Build, assess or respond to claims and contractual issues using verified project evidence, forensic schedule findings and the applicable contractual framework.",
                  icon: (
                    <Target
                      className="
                        h-5
                        w-5
                      "
                    />
                  ),
                },
              ].map(
                (item) => (
                  <div
                    key={
                      item.label
                    }
                    className="
                      group
                      rounded-[22px]
                      border
                      border-white/[0.07]
                      bg-[#080B0F]/75
                      p-6
                      transition-all
                      hover:-translate-y-1
                      hover:border-[#D8A84E]/20
                    "
                  >
                    <div
                      className="
                        flex
                        items-center
                        justify-between
                      "
                    >
                      <span
                        className="
                          text-[9px]
                          font-bold
                          uppercase
                          tracking-[0.2em]
                          text-[#D8A84E]
                        "
                      >
                        {
                          item.label
                        }
                      </span>

                      <div
                        className="
                          flex
                          h-9
                          w-9
                          items-center
                          justify-center
                          rounded-xl
                          border
                          border-white/[0.07]
                          bg-white/[0.025]
                          text-[#B9C1C9]
                        "
                      >
                        {
                          item.icon
                        }
                      </div>
                    </div>

                    <h3
                      className="
                        mt-7
                        text-xl
                        font-black
                        tracking-[-0.035em]
                        text-[#F4F1EA]
                      "
                    >
                      {item.title}
                    </h3>

                    <p
                      className="
                        mt-3
                        text-sm
                        leading-6
                        text-[#858F9A]
                      "
                    >
                      {item.text}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        {/* ======================================================
            TARGET USERS
        ====================================================== */}

        <section
          className="
            mx-auto
            max-w-7xl
            px-5
            py-20
          "
        >
          <div
            className="
              grid
              gap-8
              lg:grid-cols-[0.85fr_1.15fr]
            "
          >
            <div>
              <div
                className="
                  text-[9px]
                  font-bold
                  uppercase
                  tracking-[0.2em]
                  text-[#D8A84E]
                "
              >
                Built for Construction
                Professionals
              </div>

              <h2
                className="
                  mt-3
                  text-4xl
                  font-black
                  tracking-[-0.05em]
                  text-[#F4F1EA]
                "
              >
                One intelligence layer
                across project, commercial
                and legal teams.
              </h2>

              <p
                className="
                  mt-4
                  max-w-xl
                  text-sm
                  leading-6
                  text-[#838E99]
                "
              >
                Designed for the
                organisations and
                professionals responsible
                for planning,
                administering, assessing
                and resolving construction
                contract and project
                issues.
              </p>
            </div>

            <div
              className="
                grid
                gap-3
                sm:grid-cols-2
              "
            >
              {[
                "Construction Planners",
                "Project Managers",
                "Contract Managers",
                "Construction Legal Professionals",
                "Law Firms",
                "PMC Firms",
                "Contractors",
                "Employers / Developers",
              ].map(
                (item) => (
                  <div
                    key={item}
                    className="
                      group
                      flex
                      items-center
                      justify-between
                      rounded-xl
                      border
                      border-white/[0.06]
                      bg-white/[0.018]
                      px-4
                      py-3.5
                    "
                  >
                    <span
                      className="
                        text-sm
                        font-semibold
                        text-[#B8C0C8]
                      "
                    >
                      {item}
                    </span>

                    <ArrowRight
                      className="
                        h-4
                        w-4
                        text-[#4F5963]
                        transition-transform
                        group-hover:translate-x-1
                        group-hover:text-[#D8A84E]
                      "
                    />
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        {/* ======================================================
            SECURITY / REFERENCE KNOWLEDGE
        ====================================================== */}

        <section
          id="security"
          className="
            cx-security-section
            border-y
            border-white/[0.06]
            bg-[#07090C]
          "
        >
          <div
            className="
              mx-auto
              max-w-7xl
              px-5
              py-20
            "
          >
            <div
              className="
                grid
                gap-8
                lg:grid-cols-[0.9fr_1.1fr]
              "
            >
              <div>
                <div
                  className="
                    inline-flex
                    items-center
                    gap-2
                    rounded-full
                    border
                    border-[#6F9C83]/20
                    bg-[#6F9C83]/[0.06]
                    px-3
                    py-1.5
                  "
                >
                  <ShieldCheck
                    className="
                      h-3.5
                      w-3.5
                      text-[#84B396]
                    "
                  />

                  <span
                    className="
                      text-[9px]
                      font-bold
                      uppercase
                      tracking-[0.16em]
                      text-[#84B396]
                    "
                  >
                    Secure Project
                    Intelligence
                  </span>
                </div>

                <h2
                  className="
                    mt-5
                    text-4xl
                    font-black
                    tracking-[-0.05em]
                    text-[#F4F1EA]
                  "
                >
                  Reference knowledge is
                  separated from private
                  project evidence.
                </h2>

                <p
                  className="
                    mt-4
                    max-w-xl
                    text-sm
                    leading-6
                    text-[#89939E]
                  "
                >
                  contractX.co combines
                  curated construction
                  contract and claims
                  reference knowledge
                  with authorised customer
                  project evidence while
                  maintaining tenant and
                  project-scoped data
                  boundaries.
                </p>
              </div>

              <div
                className="
                  grid
                  gap-3
                  sm:grid-cols-2
                "
              >
                {[
                  [
                    "REFERENCE KNOWLEDGE",
                    "Curated general industry standard construction contract, claims, delay and commercial reference knowledge available to the platform.",
                  ],

                  [
                    "PRIVATE PROJECT EVIDENCE",
                    "Project contracts, reports, schedules, notices, meeting records and other authorised project documents remain project scoped.",
                  ],

                  [
                    "CONTROLLED AI REASONING",
                    "AI-assisted interpretation operates against authorised project context and available reference knowledge.",
                  ],

                  [
                    "AUDITABLE OUTPUT",
                    "Structured outputs can retain document, clause, date, schedule and evidence provenance where available.",
                  ],
                ].map(
                  ([
                    title,
                    text,
                  ]) => (
                    <div
                      key={
                        title
                      }
                      className="
                        cx-security-card
                        rounded-2xl
                        border
                        border-white/[0.06]
                        bg-white/[0.018]
                        p-5
                      "
                    >
                      <div
                        className="
                          text-[9px]
                          font-bold
                          uppercase
                          tracking-[0.17em]
                          text-[#D8A84E]
                        "
                      >
                        {title}
                      </div>

                      <p
                        className="
                          mt-2
                          text-sm
                          leading-6
                          text-[#7F8994]
                        "
                      >
                        {text}
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================
            PRICING
        ====================================================== */}

        <section
          id="pricing"
          className="
            mx-auto
            max-w-7xl
            px-5
            py-20
          "
        >
          <div
            className="
              mx-auto
              max-w-3xl
              text-center
            "
          >
            <div
              className="
                text-[9px]
                font-bold
                uppercase
                tracking-[0.2em]
                text-[#D8A84E]
              "
            >
              Platform Access
            </div>

            <h2
              className="
                mt-3
                text-4xl
                font-black
                tracking-[-0.05em]
                text-[#F4F1EA]
                md:text-5xl
              "
            >
              Built for a project.
              Ready for a portfolio.
            </h2>

            <p
              className="
                mt-4
                text-sm
                leading-6
                text-[#838E99]
                md:text-base
              "
            >
              Start with controlled
              demo access, deploy
              contractX.co on a single
              project, or scale across
              multiple projects and
              teams.
            </p>
          </div>

          <div
            className="
              mt-12
              grid
              gap-4
              lg:grid-cols-3
            "
          >
            {pricingPlans.map(
              (plan) => (
                <div
                  key={plan.name}
                  className={`
                    relative
                    rounded-[22px]
                    p-6

                    ${
                      plan.featured
                        ? `
                          border
                          border-[#D8A84E]/30
                          bg-[#D8A84E]/[0.035]
                          shadow-[0_0_50px_rgba(216,168,78,0.05)]
                        `
                        : `
                          border
                          border-white/[0.07]
                          bg-white/[0.018]
                        `
                    }
                  `}
                >
                  {plan.featured && (
                    <div
                      className="
                        absolute
                        right-5
                        top-5
                        rounded-full
                        border
                        border-[#D8A84E]/25
                        bg-[#D8A84E]/10
                        px-3
                        py-1
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[0.14em]
                        text-[#D8A84E]
                      "
                    >
                      Project
                    </div>
                  )}

                  <div
                    className={`
                      text-[9px]
                      font-bold
                      uppercase
                      tracking-[0.18em]

                      ${
                        plan.featured
                          ? "text-[#D8A84E]"
                          : "text-[#7F8994]"
                      }
                    `}
                  >
                    {plan.eyebrow}
                  </div>

                  <h3
                    className="
                      mt-3
                      text-2xl
                      font-black
                      text-[#F4F1EA]
                    "
                  >
                    {plan.name}
                  </h3>

                  <p
                    className="
                      mt-3
                      min-h-[72px]
                      text-sm
                      leading-6
                      text-[#838E99]
                    "
                  >
                    {plan.description}
                  </p>

                  <div
                    className="
                      mt-7
                      text-3xl
                      font-black
                      text-[#F4F1EA]
                    "
                  >
                    {plan.price}
                  </div>

                  <p
                    className="
                      mt-1
                      text-[10px]
                      uppercase
                      tracking-[0.12em]
                      text-[#69747F]
                    "
                  >
                    {plan.note}
                  </p>

                  <div
                    className="
                      mt-7
                      space-y-3
                    "
                  >
                    {plan.features.map(
                      (feature) => (
                        <div
                          key={
                            feature
                          }
                          className="
                            flex
                            items-start
                            gap-2
                          "
                        >
                          <CheckCircle2
                            className="
                              mt-0.5
                              h-4
                              w-4
                              shrink-0
                              text-[#6F9C83]
                            "
                          />

                          <span
                            className="
                              text-xs
                              leading-5
                              text-[#A3ADB7]
                            "
                          >
                            {feature}
                          </span>
                        </div>
                      )
                    )}
                  </div>

                  <button
                    onClick={() =>
                      openAccessModal(
                        plan.plan
                      )
                    }
                    className={`
                      mt-8
                      w-full
                      rounded-full
                      px-5
                      py-3
                      text-[10px]
                      font-black
                      uppercase
                      tracking-[0.12em]
                      transition-all

                      ${
                        plan.featured
                          ? `
                            bg-[#D8A84E]
                            text-[#050608]
                            hover:bg-[#E7BC69]
                          `
                          : `
                            border
                            border-white/10
                            bg-white/[0.03]
                            text-[#E2E6EA]
                            hover:border-[#D8A84E]/30
                          `
                      }
                    `}
                  >
                    {plan.cta}
                  </button>
                </div>
              )
            )}
          </div>

          <div
            className="
              mt-5
              text-center
              text-[10px]
              leading-5
              text-[#5E6873]
            "
          >
            Demo access is currently
            available without Stripe.
            Pricing, subscriptions and
            online payment can be enabled
            after launch.
          </div>
        </section>

        {/* ======================================================
            STAKEHOLDER POSITIONING
        ====================================================== */}

        <section
          className="
            border-y
            border-white/[0.06]
            bg-white/[0.012]
          "
        >
          <div
            className="
              mx-auto
              max-w-7xl
              px-5
              py-20
            "
          >
            <div
              className="
                grid
                gap-5
                md:grid-cols-3
              "
            >
              {[
                {
                  icon: (
                    <Building2
                      className="
                        h-5
                        w-5
                      "
                    />
                  ),
                  label:
                    "Employers & Developers",
                  title:
                    "Assess exposure. Challenge positions. Govern risk.",
                  text:
                    "Evaluate contractor positions, programme effects, contractual obligations, contemporaneous evidence and potential project exposure.",
                },

                {
                  icon: (
                    <Activity
                      className="
                        h-5
                        w-5
                      "
                    />
                  ),
                  label:
                    "Contractors & PMCs",
                  title:
                    "Protect position. Understand delay. Act earlier.",
                  text:
                    "Connect contract requirements to project events, programme impacts, notices, evidence and commercial actions throughout delivery.",
                },

                {
                  icon: (
                    <ShieldCheck
                      className="
                        h-5
                        w-5
                      "
                    />
                  ),
                  label:
                    "Law Firms & Legal Teams",
                  title:
                    "Organise evidence. Analyse position. Support resolution.",
                  text:
                    "Accelerate construction-specific factual, contractual and schedule analysis while retaining professional review and judgement.",
                },
              ].map(
                (item) => (
                  <div
                    key={
                      item.label
                    }
                    className="
                      rounded-[22px]
                      border
                      border-white/[0.07]
                      bg-[#080B0F]/75
                      p-6
                    "
                  >
                    <div
                      className="
                        flex
                        h-10
                        w-10
                        items-center
                        justify-center
                        rounded-xl
                        border
                        border-[#D8A84E]/15
                        bg-[#D8A84E]/[0.05]
                        text-[#D8A84E]
                      "
                    >
                      {item.icon}
                    </div>

                    <div
                      className="
                        mt-6
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.18em]
                        text-[#7F8994]
                      "
                    >
                      {item.label}
                    </div>

                    <h3
                      className="
                        mt-2
                        text-xl
                        font-black
                        tracking-[-0.03em]
                        text-[#F4F1EA]
                      "
                    >
                      {item.title}
                    </h3>

                    <p
                      className="
                        mt-3
                        text-sm
                        leading-6
                        text-[#858F9A]
                      "
                    >
                      {item.text}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        {/* ======================================================
            DEMO CTA
        ====================================================== */}

        <section
          id="demo"
          className="
            mx-auto
            max-w-7xl
            px-5
            py-20
          "
        >
          <div
            className="
              cx-demo-access
              relative
              overflow-hidden
              rounded-[28px]
              border
              border-[#D8A84E]/15
              bg-gradient-to-br
              from-[#0D1015]
              via-[#080B0F]
              to-[#11100C]
              p-7
              md:p-10
            "
          >
            <div
              className="
                absolute
                -right-24
                -top-24
                h-64
                w-64
                rounded-full
                bg-[#D8A84E]/10
                blur-3xl
              "
            />

            <div
              className="
                absolute
                -bottom-24
                -left-24
                h-64
                w-64
                rounded-full
                bg-[#6F8FAF]/10
                blur-3xl
              "
            />

            <div
              className="
                relative
                grid
                gap-8
                lg:grid-cols-[1fr_auto]
                lg:items-center
              "
            >
              <div>
                <div
                  className="
                    text-[9px]
                    font-bold
                    uppercase
                    tracking-[0.2em]
                    text-[#D8A84E]
                  "
                >
                  Request Access
                </div>

                <h2
                  className="
                    mt-3
                    text-4xl
                    font-black
                    tracking-[-0.05em]
                    text-[#F4F1EA]
                  "
                >
                  Explore ContractX
                </h2>

                <p
                  className="
                    mt-3
                    max-w-xl
                    text-sm
                    leading-6
                    text-[#838E99]
                  "
                >
                  Experience how
                  contractX.co transforms
                  construction contract
                  management and claims
                  resolution. Available for
                  contractors, employers and
                  consultancies.
                </p>
              </div>

              <div
                className="
                  flex
                  flex-col
                  gap-3
                  sm:flex-row
                "
              >
                <button
                  onClick={() =>
                    openAccessModal(
                      "DEMO"
                    )
                  }
                  className="
                    group
                    inline-flex
                    items-center
                    justify-center
                    gap-2
                    rounded-full
                    bg-[#D8A84E]
                    px-6
                    py-3.5
                    text-xs
                    font-black
                    uppercase
                    tracking-[0.12em]
                    text-[#050608]
                    transition-all
                    hover:-translate-y-0.5
                    hover:bg-[#E7BC69]
                  "
                >
                  Start 1-Day Demo

                  <ArrowRight
                    className="
                      h-4
                      w-4
                      transition-transform
                      group-hover:translate-x-1
                    "
                  />
                </button>

                <button
                  onClick={() =>
                    openAccessModal(
                      "BUSINESS"
                    )
                  }
                  className="
                    cx-demo-sales
                    inline-flex
                    items-center
                    justify-center
                    rounded-full
                    border
                    border-white/10
                    bg-white/[0.03]
                    px-6
                    py-3.5
                    text-xs
                    font-black
                    uppercase
                    tracking-[0.12em]
                    text-[#E2E6EA]
                    transition-all
                    hover:border-[#D8A84E]/40
                    hover:bg-white/[0.06]
                  "
                >
                  Contact Sales
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================
         FOOTER
      ======================================================== */}

      <footer
        className="
          border-t
          border-white/[0.06]
          bg-[#050608]
          px-5
          py-12
        "
      >
        <div className="mx-auto max-w-7xl">
          <div
            className="
              grid
              gap-8
              border-b
              border-white/[0.06]
              pb-8
              lg:grid-cols-[1.25fr_0.75fr]
            "
          >
            <div>
              <div className="flex items-center gap-3">
                <div className="text-xl font-black tracking-[-0.04em] text-[#F4F1EA]">
                  contract<span className="text-[#D8A84E]">X</span>
                  <span className="text-sm text-[#8F99A5]">.co</span>
                </div>
                <div className="h-4 w-px bg-white/10" />
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#69747F]">
                  Review. Monitor. Resolve.
                </span>
              </div>

              <p className="mt-4 max-w-3xl text-xs leading-6 text-[#7F8994]">
                contractX.co provides AI-assisted contractual, commercial, project and
                schedule intelligence. Outputs should be reviewed by appropriately
                qualified contract, commercial, project or legal professionals.
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <a
                href={`mailto:${PUBLIC_CONTACT_EMAIL}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#D6DCE1] transition-colors hover:text-[#D8A84E]"
              >
                <Mail className="h-4 w-4" />
                {PUBLIC_CONTACT_EMAIL}
              </a>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                {currentWhatsAppLeadUrl && (
                  <a
                    href={currentWhatsAppLeadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-[#6F9C83]/25 bg-[#6F9C83]/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#9AC7A9] transition-all hover:border-[#6F9C83]/45 hover:bg-[#6F9C83]/[0.12]"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </a>
                )}

                <button
                  onClick={() => openAccessModal("BUSINESS")}
                  className="inline-flex items-center gap-2 rounded-full border border-[#D8A84E]/25 bg-[#D8A84E]/[0.06] px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#D8A84E] transition-all hover:bg-[#D8A84E]/[0.1]"
                >
                  Leave Details
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center justify-between gap-5 md:flex-row">
            <span className="text-[10px] font-semibold text-[#69747F]">
              © {new Date().getFullYear()} contractX.co. All rights reserved.
            </span>

            <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-[0.15em] text-[#8F99A5]">
              <a href="/privacy" className="transition-colors hover:text-white">
                Privacy
              </a>
              <a href="/terms" className="transition-colors hover:text-white">
                Terms
              </a>
              <a href="/security" className="transition-colors hover:text-white">
                Security
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* ========================================================
         PUBLIC LANDING CHATBOT
      ======================================================== */}

      <div className="fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-3">
        {isChatOpen && (
          <div
            className="
              flex
              h-[min(650px,78vh)]
              w-[min(390px,calc(100vw-40px))]
              flex-col
              overflow-hidden
              rounded-[24px]
              border
              border-white/[0.09]
              bg-[#080B0F]/95
              shadow-[0_24px_90px_rgba(0,0,0,0.55)]
              backdrop-blur-2xl
            "
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] p-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#D8A84E]/25 bg-[#D8A84E]/[0.08] text-[#D8A84E]">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-[#F4F1EA]">
                      ContractX Assistant
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#7F8994]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#6F9C83]" />
                      Public product guidance
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsChatOpen(false)}
                aria-label="Close chatbot"
                className="rounded-full border border-white/[0.07] p-2 text-[#8F99A5] transition-colors hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[86%] rounded-2xl px-3.5 py-3 text-xs leading-5 ${
                      message.role === "user"
                        ? "bg-[#D8A84E] text-[#050608]"
                        : "border border-white/[0.07] bg-white/[0.035] text-[#B9C1C9]"
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}

              <div className="pt-1">
                <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.15em] text-[#69747F]">
                  Suggested questions
                </div>
                <div className="flex flex-wrap gap-2">
                  {publicChatPrompts.slice(0, 6).map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => submitPublicChatQuestion(prompt)}
                      className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left text-[9px] font-semibold leading-4 text-[#9CA5B0] transition-all hover:border-[#D8A84E]/30 hover:text-[#E7BC69]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-white/[0.07] p-3">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitPublicChatQuestion(chatInput);
                }}
                className="flex gap-2"
              >
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask about contractX.co..."
                  className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-xs text-white outline-none placeholder:text-white/25 focus:border-[#D8A84E]/40"
                />
                <button
                  type="submit"
                  aria-label="Send question"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D8A84E] text-[#050608] transition-colors hover:bg-[#E7BC69]"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {currentWhatsAppLeadUrl ? (
                  <a
                    href={currentWhatsAppLeadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#6F9C83]/20 bg-[#6F9C83]/[0.06] px-2 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-[#9AC7A9]"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAccessModal("BUSINESS")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-2 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-[#8F99A5]"
                    title="Configure NEXT_PUBLIC_WHATSAPP_NUMBER to enable direct WhatsApp"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </button>
                )}

                <a
                  href={`mailto:${PUBLIC_CONTACT_EMAIL}?subject=${encodeURIComponent(
                    "contractX.co enquiry"
                  )}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-2 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-[#AEB7C0]"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setIsChatOpen(false);
                    openAccessModal("BUSINESS");
                  }}
                  className="rounded-xl border border-[#D8A84E]/20 bg-[#D8A84E]/[0.06] px-2 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-[#D8A84E]"
                >
                  Leave Details
                </button>
              </div>

              <p className="mt-2 text-center text-[8px] leading-4 text-[#59636E]">
                Public assistant only. No project-specific or internal system information is disclosed here.
              </p>
            </div>
          </div>
        )}

        <button
          onClick={() => setIsChatOpen((previous) => !previous)}
          className="group flex items-center gap-3 rounded-full border border-[#D8A84E]/25 bg-[#0B0E12]/95 px-4 py-3 text-[#F4F1EA] shadow-[0_15px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-[#D8A84E]/45"
          aria-label="Open ContractX Assistant"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D8A84E] text-[#050608]">
            {isChatOpen ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[#D8A84E]">
              Ask ContractX
            </span>
            <span className="mt-0.5 block text-[9px] text-[#7F8994]">
              Public product assistant
            </span>
          </span>
        </button>
      </div>

      {/* ========================================================
         REGISTRATION MODAL
      ======================================================== */}

      {isModalOpen && (
        <div
          className="
            fixed
            inset-0
            z-[100]
            flex
            items-center
            justify-center
            p-5
          "
        >
          <div
            className="
              absolute
              inset-0
              bg-[#050608]/80
              backdrop-blur-sm
            "
            onClick={closeModal}
          />

          <div
            className="
              relative
              w-full
              max-w-md
              overflow-hidden
              rounded-3xl
              border
              border-white/[0.08]
              bg-[#080B0F]
              p-8
              shadow-2xl
            "
          >
            <button
              onClick={closeModal}
              className="
                absolute
                right-5
                top-5
                rounded-full
                p-2
                text-[#69747F]
                transition-colors
                hover:bg-white/5
                hover:text-white
              "
            >
              <X
                className="
                  h-4
                  w-4
                "
              />
            </button>

            {submitted ? (
              <div
                className="
                  flex
                  flex-col
                  items-center
                  text-center
                "
              >
                <div
                  className="
                    flex
                    h-16
                    w-16
                    items-center
                    justify-center
                    rounded-full
                    bg-[#6F9C83]/10
                    text-[#6F9C83]
                  "
                >
                  <CheckCircle2
                    className="
                      h-8
                      w-8
                    "
                  />
                </div>

                <h3
                  className="
                    mt-6
                    text-2xl
                    font-black
                    tracking-[-0.03em]
                    text-[#F4F1EA]
                  "
                >
                  Request Received
                </h3>

                <p
                  className="
                    mt-3
                    text-sm
                    leading-6
                    text-[#89939E]
                  "
                >
                  Thank you for your
                  interest in contractX.
                  Our team will review
                  your details and provide
                  access instructions to
                  your registered email.
                </p>

                <button
                  onClick={closeModal}
                  className="
                    mt-8
                    w-full
                    rounded-full
                    bg-white/[0.04]
                    py-3.5
                    text-[10px]
                    font-black
                    uppercase
                    tracking-[0.12em]
                    text-white
                    transition-colors
                    hover:bg-white/[0.08]
                  "
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div>
                  <div
                    className="
                      text-[9px]
                      font-bold
                      uppercase
                      tracking-[0.2em]
                      text-[#D8A84E]
                    "
                  >
                    Request Access
                  </div>

                  <h3
                    className="
                      mt-2
                      text-2xl
                      font-black
                      tracking-[-0.03em]
                      text-[#F4F1EA]
                    "
                  >
                    Start your evaluation.
                  </h3>

                  <p
                    className="
                      mt-2
                      text-sm
                      leading-6
                      text-[#89939E]
                    "
                  >
                    Register your interest
                    for launch access to
                    contractX.co
                  </p>
                </div>

                <form
                  onSubmit={
                    handleRegisterSubmit
                  }
                  className="
                    mt-8
                    space-y-4
                  "
                >
                  <div className="space-y-1.5">
                    <label
                      className="
                        text-[10px]
                        font-bold
                        uppercase
                        tracking-[0.1em]
                        text-[#89939E]
                      "
                    >
                      Full Name
                    </label>

                    <input
                      required
                      type="text"
                      className="
                        w-full
                        rounded-xl
                        border
                        border-white/[0.08]
                        bg-white/[0.02]
                        px-4
                        py-3
                        text-sm
                        text-white
                        placeholder:text-white/20
                        outline-none
                        transition-colors
                        focus:border-[#D8A84E]/50
                        focus:bg-white/[0.04]
                      "
                      placeholder="Jane Doe"
                      value={
                        formData.full_name
                      }
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          full_name:
                            e.target
                              .value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className="
                        text-[10px]
                        font-bold
                        uppercase
                        tracking-[0.1em]
                        text-[#89939E]
                      "
                    >
                      Work Email
                    </label>

                    <input
                      required
                      type="email"
                      className="
                        w-full
                        rounded-xl
                        border
                        border-white/[0.08]
                        bg-white/[0.02]
                        px-4
                        py-3
                        text-sm
                        text-white
                        placeholder:text-white/20
                        outline-none
                        transition-colors
                        focus:border-[#D8A84E]/50
                        focus:bg-white/[0.04]
                      "
                      placeholder="jane@company.com"
                      value={
                        formData.work_email
                      }
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          work_email:
                            e.target
                              .value,
                        })
                      }
                    />
                  </div>

                  <div
                    className="
                      grid
                      gap-4
                      sm:grid-cols-2
                    "
                  >
                    <div className="space-y-1.5">
                      <label
                        className="
                          text-[10px]
                          font-bold
                          uppercase
                          tracking-[0.1em]
                          text-[#89939E]
                        "
                      >
                        Company
                      </label>

                      <input
                        required
                        type="text"
                        className="
                          w-full
                          rounded-xl
                          border
                          border-white/[0.08]
                          bg-white/[0.02]
                          px-4
                          py-3
                          text-sm
                          text-white
                          placeholder:text-white/20
                          outline-none
                          transition-colors
                          focus:border-[#D8A84E]/50
                          focus:bg-white/[0.04]
                        "
                        placeholder="Company Name"
                        value={
                          formData.company_name
                        }
                        onChange={(
                          e
                        ) =>
                          setFormData(
                            {
                              ...formData,
                              company_name:
                                e.target
                                  .value,
                            }
                          )
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        className="
                          text-[10px]
                          font-bold
                          uppercase
                          tracking-[0.1em]
                          text-[#89939E]
                        "
                      >
                        Role
                      </label>

                      <select
                        className="
                          w-full
                          rounded-xl
                          border
                          border-white/[0.08]
                          bg-[#0B0E13]
                          px-4
                          py-3
                          text-sm
                          text-white
                          outline-none
                          transition-colors
                          focus:border-[#D8A84E]/50
                        "
                        value={
                          formData.industry_role
                        }
                        onChange={(
                          e
                        ) =>
                          setFormData(
                            {
                              ...formData,
                              industry_role:
                                e.target
                                  .value,
                            }
                          )
                        }
                      >
                        <option>
                          Main Contractor
                        </option>

                        <option>
                          Subcontractor
                        </option>

                        <option>
                          Employer /
                          Developer
                        </option>

                        <option>
                          Law Firm
                        </option>

                        <option>
                          Consultancy
                        </option>

                        <option>
                          Other
                        </option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className={`
                      mt-6
                      w-full
                      rounded-full
                      bg-[#D8A84E]
                      py-3.5
                      text-[10px]
                      font-black
                      uppercase
                      tracking-[0.12em]
                      text-[#050608]
                      transition-all

                      ${
                        submitting
                          ? "opacity-70"
                          : "hover:bg-[#E7BC69]"
                      }
                    `}
                  >
                    {submitting
                      ? "Requesting..."
                      : "Submit Request"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
