"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import LegalFooter from "@/components/LegalFooter";
import ContractXNoticeModal from "@/components/ContractXNoticeModal";
import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";
import { useActiveProject } from "@/hooks/useActiveProject";
import { createClient } from "@/lib/supabase/client";

type Theme = "dark" | "light";

type VaultSummary = {
  total_documents: number;
  indexed_documents: number;
  index_coverage_percent: number;
  last_upload_at?: string | null;
  category_counts: Record<string, number>;
  connected_sources: any[];
  security: {
    data_ownership: string;
    tenant_isolation: string;
    ai_training: string;
  };
};

type VaultDocument = {
  id: string;
  file_name?: string;
  subject?: string;
  letter_ref?: string;
  sender?: string;
  recipient?: string;
  document_date?: string;
  uploaded_at?: string;
  category?: string;
  document_type?: string;
  file_extension?: string;
  source_id?: string;
  storage_mode?: string;
  index_status?: string;
  processing_percent?: number;
  sync_status?: string;
};

type ApprovedModel = {
  key: string;
  provider: string;
  model_id: string;
  display_name: string;
  status: string;
  customer_selectable?: boolean;
};

// All browser API calls go through the same-origin Next.js proxy.
// The proxy forwards to the ContractX FastAPI backend configured by
// CONTRACTX_BACKEND_URL in contractx-ui/.env.local.
const API = "/api/contractx";

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function short(v?: string | null, fallback = "—") {
  return v && v.trim() ? v : fallback;
}

function friendlyApiModel(modelId?: string | null) {
  const id = (modelId || "").trim();
  return id || "Not configured";
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "green" | "blue" | "amber" | "red";
}) {
  const s = {
    neutral: "cx-pill-neutral border-white/10 bg-white/[0.04] text-[#AAB3BD]",
    gold: "cx-pill-gold border-[#D8A84E]/30 bg-[#D8A84E]/10 text-[#E6C274]",
    green: "cx-pill-green border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    blue: "cx-pill-blue border-sky-400/20 bg-sky-400/10 text-sky-200",
    amber: "cx-pill-amber border-amber-400/20 bg-amber-400/10 text-amber-200",
    red: "cx-pill-red border-rose-400/20 bg-rose-400/10 text-rose-200",
  };

  return (
    <span className={cx("cx-pill rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]", s[tone])}>
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0D0F12] p-4">
      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#69747F]">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#F4F1EA]">{value}</div>
      {note && <div className="mt-1 text-[11px] text-[#69747F]">{note}</div>}
    </div>
  );
}

export default function DocumentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [theme, setTheme] = useState<Theme>("dark");

  const {
    projectId,
    project,
    tenantId,
    loading: projectLoading,
    error: projectError,
  } = useActiveProject();

  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [models, setModels] = useState<ApprovedModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("openai");
  const [modelPolicySource, setModelPolicySource] = useState("default_policy");
  const [modelRegistryStatus, setModelRegistryStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [modelRegistryMessage, setModelRegistryMessage] = useState("");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [fileType, setFileType] = useState("");
  const [indexStatus, setIndexStatus] = useState("");
  const [sourceId, setSourceId] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [uploadFrom, setUploadFrom] = useState("");
  const [uploadTo, setUploadTo] = useState("");

  const [sortBy, setSortBy] = useState("document_date");
  const [sortDirection, setSortDirection] = useState("desc");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [connectorReadiness, setConnectorReadiness] = useState<Record<string, any>>({});

  const [showSecurity, setShowSecurity] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showAiPolicy, setShowAiPolicy] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [uploadDetailsOpen, setUploadDetailsOpen] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("client_correspondence");
  const [uploadDocDate, setUploadDocDate] = useState("");
  const [uploadRef, setUploadRef] = useState("");
  const [uploadSubject, setUploadSubject] = useState("");
  const [uploadSender, setUploadSender] = useState("");
  const [uploadRecipient, setUploadRecipient] = useState("");
  const [uploadStakeholderTier, setUploadStakeholderTier] = useState("THIRD_PARTY");
  const [uploadFlowDirection, setUploadFlowDirection] = useState("INTERNAL");
  const [transferPct, setTransferPct] = useState(0);
  const [processingPct, setProcessingPct] = useState(0);
  const [uploadStage, setUploadStage] = useState("idle");

  const [newSourceType, setNewSourceType] = useState("contractx_vault");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceRegion, setNewSourceRegion] = useState("");
  const [sourceActionId, setSourceActionId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [scopeSource, setScopeSource] = useState<any | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeItems, setScopeItems] = useState<any[]>([]);
  const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);
  const [scopeMode, setScopeMode] = useState("read_index");

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const uploadSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Keep this page synchronized with ContractXAppShell, which is the
    // application-level source of truth for light/dark mode.
    const syncThemeFromShell = () => {
      const shell = document.querySelector(".cx-platform");

      if (shell) {
        setTheme(
          shell.classList.contains("cx-platform-light")
            ? "light"
            : "dark"
        );
        return;
      }

      const saved = window.localStorage.getItem("contractx-theme");
      setTheme(saved === "light" ? "light" : "dark");
    };

    const onThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<Theme>;

      if (
        customEvent.detail === "light" ||
        customEvent.detail === "dark"
      ) {
        setTheme(customEvent.detail);
      } else {
        syncThemeFromShell();
      }
    };

    syncThemeFromShell();

    window.addEventListener(
      "contractx-theme-change",
      onThemeChange as EventListener
    );

    const shell = document.querySelector(".cx-platform");
    const observer = shell
      ? new MutationObserver(syncThemeFromShell)
      : null;

    observer?.observe(shell as Element, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      window.removeEventListener(
        "contractx-theme-change",
        onThemeChange as EventListener
      );
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!message) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMessage("");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [message]);

  const setDocumentsTheme = (nextTheme: Theme) => {
    // Update local rendering immediately, then notify the App Shell so both
    // controls remain synchronized.
    setTheme(nextTheme);
    window.localStorage.setItem("contractx-theme", nextTheme);
    window.dispatchEvent(
      new CustomEvent("contractx-theme-change", {
        detail: nextTheme,
      })
    );
  };

  async function getAuthHeaders(
    includeJson = false
  ): Promise<Record<string, string>> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      throw new Error(
        `Unable to verify the authenticated session: ${error.message}`
      );
    }

    if (!session?.access_token) {
      throw new Error(
        "Your ContractX session has expired. Please sign in again."
      );
    }

    return {
      ...(includeJson ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  async function authFetch(
    input: RequestInfo | URL,
    init: RequestInit = {}
  ) {
    const headers = await getAuthHeaders(false);

    return fetch(input, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers || {}),
      },
    });
  }

  const hasProjectContext =
    !projectLoading && !projectError && Boolean(tenantId && projectId);

  const requireProjectContext = () => {
    if (projectLoading) {
      setMessage("Loading selected project context...");
      return false;
    }

    if (projectError || !tenantId || !projectId) {
      setMessage(
        projectError ||
          "No active project is selected. Open Documents from Portfolio."
      );
      return false;
    }

    return true;
  };

  const focusUploadSection = () => {
    if (!requireProjectContext()) return;

    const section = uploadSectionRef.current;
    if (!section) return;

    section.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    window.setTimeout(() => {
      section.focus({ preventScroll: true });
    }, 350);
  };

  async function loadModels() {
    setModelRegistryStatus("loading");
    setModelRegistryMessage("");

    try {
      const r = await authFetch(`${API}/api/v1/models/approved`, {
        cache: "no-store",
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setModels([]);
        setModelRegistryStatus("error");
        setModelRegistryMessage(
          data.detail || `Model registry unavailable (HTTP ${r.status}).`
        );
        return;
      }

      const registry = Array.isArray(data.models)
        ? data.models
        : Array.isArray(data.approved_models)
        ? data.approved_models
        : [];

      setModels(registry);

      if (registry.length === 0) {
        setModelRegistryStatus("error");
        setModelRegistryMessage(
          "The model registry responded but returned no approved models."
        );
        return;
      }

      setModelRegistryStatus("ready");
      setModelRegistryMessage("");
    } catch (error) {
      setModels([]);
      setModelRegistryStatus("error");
      setModelRegistryMessage(
        error instanceof Error
          ? `Unable to reach model registry: ${error.message}`
          : "Unable to reach model registry."
      );
    }
  }

  async function loadModelPolicy() {
    if (!requireProjectContext()) return;

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const r = await authFetch(`${API}/api/v1/models/project?${qs}`, {
        cache: "no-store",
      });

      if (!r.ok) return;

      const data = await r.json().catch(() => ({}));
      const policy = data.policy || {};

      if (policy.model_key) setSelectedModel(policy.model_key);
      setModelPolicySource(policy.source || "default_policy");
    } catch {}
  }

  async function loadConnectorReadiness() {
    try {
      const r = await authFetch(`${API}/api/v1/vault/connectors/status`, {
        cache: "no-store",
      });

      if (!r.ok) return;

      const data = await r.json().catch(() => ({}));
      setConnectorReadiness(data.connectors || {});
    } catch {
      // Vault remains usable even if readiness telemetry is unavailable.
    }
  }

  async function loadVault(clearMessage = true) {
    if (!requireProjectContext()) return;

    setLoading(true);
    if (clearMessage) setMessage("");

    try {
      void loadConnectorReadiness();

      const summaryQs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const docQs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
        page: String(page),
        page_size: "20",
        sort_by: sortBy,
        sort_direction: sortDirection,
      });

      if (query) docQs.set("query", query);
      if (category) docQs.set("category", category);
      if (fileType) docQs.set("file_extension", fileType);
      if (indexStatus) docQs.set("index_status", indexStatus);
      if (sourceId) docQs.set("source_id", sourceId);
      if (dateFrom) docQs.set("document_date_from", dateFrom);
      if (dateTo) docQs.set("document_date_to", dateTo);
      if (uploadFrom) docQs.set("uploaded_from", uploadFrom);
      if (uploadTo) docQs.set("uploaded_to", uploadTo);

      const [sr, dr] = await Promise.all([
        authFetch(`${API}/api/v1/vault/summary?${summaryQs}`),
        authFetch(`${API}/api/v1/vault/documents?${docQs}`),
      ]);

      if (sr.ok) setSummary(await sr.json());

      if (dr.ok) {
        const d = await dr.json();
        setDocuments(d.documents || []);
        setPages(d.pages || 1);
        setTotal(d.total || 0);
      } else {
        const e = await dr.json().catch(() => ({}));
        setMessage(e.detail || "Unable to load Project Vault.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect to the ContractX Vault API."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    if (!hasProjectContext) return;
    void loadModelPolicy();
  }, [tenantId, projectId, projectLoading, projectError]);

  useEffect(() => {
    if (!hasProjectContext) {
      setSummary(null);
      setDocuments([]);
      setPages(1);
      setTotal(0);
      return;
    }

    void loadVault();
  }, [
    tenantId,
    projectId,
    projectLoading,
    projectError,
    page,
    sortBy,
    sortDirection,
    category,
    fileType,
    indexStatus,
    sourceId,
    dateFrom,
    dateTo,
    uploadFrom,
    uploadTo,
  ]);

  useEffect(() => {
    setSummary(null);
    setDocuments([]);
    setPage(1);
    setPages(1);
    setTotal(0);
    setQuery("");
    setCategory("");
    setFileType("");
    setIndexStatus("");
    setSourceId("");
    setDateFrom("");
    setDateTo("");
    setUploadFrom("");
    setUploadTo("");
    setUploadFile(null);
    setScopeModalOpen(false);
    setScopeSource(null);
    setScopeItems([]);
    setSelectedScopeIds([]);
    setMessage("");
  }, [projectId]);

  const applyQuery = () => {
    if (!requireProjectContext()) return;
    setPage(1);
    void loadVault();
  };

  const clearFilters = () => {
    setQuery("");
    setCategory("");
    setFileType("");
    setIndexStatus("");
    setSourceId("");
    setDateFrom("");
    setDateTo("");
    setUploadFrom("");
    setUploadTo("");
    setSortBy("document_date");
    setSortDirection("desc");
    setPage(1);
  };

  const saveModel = async () => {
    if (!requireProjectContext()) return;

    setMessage("");
    const selected = models.find((m) => m.key === selectedModel);
    if (!selected || selected.status !== "active") {
      setMessage("Select an active AI provider before saving the project policy.");
      return;
    }
    const r = await authFetch(`${API}/api/v1/models/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        project_id: projectId ?? "",
        model_key: selectedModel,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMessage(
        data.detail ||
          "Unable to update AI processing policy. Verify the backend Supabase environment configuration."
      );
      return;
    }
    setMessage("AI processing policy saved successfully.");
    await loadModelPolicy();
  };

  const sourceTypeLabel = (sourceType: string) => {
    const labels: Record<string, string> = {
      contractx_vault: "ContractX Managed Vault",
      sharepoint: "Microsoft SharePoint",
      onedrive: "Microsoft OneDrive",
      aconex: "Oracle Aconex",
      procore: "Procore",
      autodesk_acc: "Autodesk Construction Cloud",
      aws_s3: "AWS S3",
      azure_blob: "Azure Blob Storage",
      private_server: "Private Server / On-Prem",
      other_cde: "Other CDE",
    };

    return labels[sourceType] || sourceType.replaceAll("_", " ");
  };

  const connectorInfo = (source: any) => {
    const sourceType = String(source?.source_type || "").toLowerCase();
    const connectorMode = String(
      source?.configuration?.connector_mode || ""
    ).toLowerCase();

    if (sourceType === "contractx_vault") {
      return {
        ready: true,
        status: "Native",
        button: "Native Vault",
        message:
          "ContractX Managed Vault uses ContractX-managed Supabase project storage. Files are uploaded directly, registered in project_documents and indexed into private project evidence. No external provider adapter or customer authorization is required.",
      };
    }

    if (
      sourceType === "private_server" &&
      connectorMode === "local_simulator"
    ) {
      return {
        ready: true,
        status: "Available",
        button: "Connect Local",
        message: "Local CDE Test adapter is available.",
      };
    }

    const live = connectorReadiness[sourceType];

    if (live?.ready) {
      return {
        ready: true,
        status: "Available",
        button: sourceType === "onedrive" || sourceType === "sharepoint"
          ? "Connect Microsoft"
          : "Connect",
        message: live.message || `${sourceTypeLabel(sourceType)} connector is available.`,
      };
    }

    const messages: Record<string, string> = {
      onedrive:
        "ContractX Microsoft integration has not yet been activated at platform level. Customer connection will become available once the ContractX Microsoft connector is enabled. No customer Microsoft credentials are required at this stage.",
      sharepoint:
        "ContractX Microsoft integration has not yet been activated at platform level. Customer connection will become available once the ContractX Microsoft connector is enabled. No customer Microsoft credentials are required at this stage.",
      procore:
        "ContractX Procore integration is not yet activated at platform level. ContractX must complete the Procore developer-app and OAuth integration first; after activation, the customer will only authorize their Procore account and select the required company/project scope.",
      aconex:
        "ContractX Oracle Aconex integration is not yet activated at platform level. ContractX must register and publish its Aconex OAuth integration first; after activation, the customer will sign in to Aconex and authorize access to the required project data.",
      autodesk_acc:
        "ContractX Autodesk Construction Cloud integration is not yet activated at platform level. ContractX must activate its Autodesk Platform Services application first; after activation, the customer will sign in with Autodesk and authorize the required project/folder access.",
      aws_s3:
        "ContractX AWS S3 connector is not yet activated. After the connector is enabled, customer IT will grant read-only access using a cross-account IAM role and ContractX-issued External ID. Long-term customer AWS access keys should not be supplied to ContractX.",
      azure_blob:
        "ContractX Azure Blob connector is not yet activated. After the connector is enabled, customer IT will grant scoped read access using Microsoft Entra/RBAC or an approved time-limited SAS method. Storage account keys should not be supplied to ContractX.",
      private_server:
        "ContractX Private Server / On-Prem connector is not yet activated. Production access will use a customer-controlled gateway/agent or approved API/SFTP connection; ContractX cloud cannot directly browse a customer's local Windows filesystem.",
      other_cde:
        "This hosted CDE requires a provider-specific integration assessment. ContractX will enable the appropriate API/OAuth or customer-managed service connection before customer authorization is requested.",
    };

    return {
      ready: false,
      status: "Platform Setup Pending",
      button: "Setup Pending",
      message:
        live?.message ||
        messages[sourceType] ||
        `${sourceTypeLabel(sourceType)} connector is not yet activated at ContractX platform level.`,
    };
  };

  const registerSource = async () => {
    if (!requireProjectContext()) return;

    setMessage("");

    const isLocalSimulator = newSourceType === "local_cde";
    const dbSourceType = isLocalSimulator
      ? "private_server"
      : newSourceType;

    const displayName =
      newSourceName.trim() ||
      (isLocalSimulator ? "Local CDE Test" : sourceTypeLabel(newSourceType));

    try {
      const r = await authFetch(`${API}/api/v1/vault/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          project_id: projectId ?? "",
          source_type: dbSourceType,
          connector_mode: isLocalSimulator ? "local_simulator" : null,
          display_name: displayName,
          hosting_mode:
            dbSourceType === "contractx_vault"
              ? "contractx_managed"
              : "customer_controlled",
          data_region: newSourceRegion.trim() || null,
          customer_controlled: dbSourceType !== "contractx_vault",
          access_mode: "read_index",
        }),
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setMessage(
          data.detail ||
            `Unable to create the CDE connection (HTTP ${r.status}).`
        );
        return;
      }

      setNewSourceName("");
      setNewSourceRegion("");

      if (data.source?.id && isLocalSimulator) {
        await authorizeSource(data.source);
        return;
      }

      if (data.source?.id && dbSourceType === "contractx_vault") {
        setMessage(
          data.message ||
            "ContractX Managed Vault is connected natively to this project."
        );
        await loadVault(false);
        return;
      }

      setMessage(
        data.message ||
          "CDE source created. Customer setup is required before ContractX can verify the connection."
      );

      await loadVault(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Unable to reach the Vault API: ${error.message}`
          : "Unable to reach the Vault API."
      );
    }
  };

  const clearSourceRegistrationForm = () => {
    setNewSourceType("contractx_vault");
    setNewSourceName("");
    setNewSourceRegion("");
    setMessage("");
  };

  const disconnectSource = async (source: any) => {
    if (!requireProjectContext()) return;

    if (!source?.id) return;

    const confirmed = window.confirm(
      `Disconnect "${source.display_name}" from ContractX?\n\nThis revokes the ContractX connection record but does not delete any files in the customer's CDE.`
    );
    if (!confirmed) return;

    setSourceActionId(source.id);
    setMessage("");

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const r = await authFetch(
        `${API}/api/v1/vault/sources/${source.id}/disconnect?${qs}`,
        { method: "POST" }
      );

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage(data.detail || "Unable to disconnect data source.");
        return;
      }

      setMessage(
        `Data source "${source.display_name}" disconnected. Customer source files were not changed.`
      );
      await loadVault(false);
    } finally {
      setSourceActionId(null);
    }
  };

  const phaseOutSource = async (source: any) => {
    if (!requireProjectContext()) return;

    if (!source?.id) return;

    const confirmed = window.confirm(
      `Phase out "${source.display_name}" from this ContractX project?\n\n` +
        "The source registration and audit history are retained, but ContractX access is revoked. " +
        "No customer CDE files are deleted."
    );

    if (!confirmed) return;

    setSourceActionId(source.id);
    setMessage("");

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const r = await authFetch(
        `${API}/api/v1/vault/sources/${source.id}/phase-out?${qs}`,
        { method: "POST" }
      );

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setMessage(data.detail || "Unable to phase out the CDE source.");
        return;
      }

      setMessage(
        data.message ||
          `CDE source "${source.display_name}" has been phased out.`
      );
      await loadVault(false);
    } finally {
      setSourceActionId(null);
    }
  };

  const removeSource = async (source: any) => {
    if (!requireProjectContext()) return;

    if (!source?.id) return;

    const confirmed = window.confirm(
      `Delete the ContractX CDE registration for "${source.display_name}"?\n\nThis permanently removes the ContractX source registration when no project documents are linked to it. It never deletes files from the customer's external CDE.`
    );
    if (!confirmed) return;

    setSourceActionId(source.id);
    setMessage("");

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const r = await authFetch(
        `${API}/api/v1/vault/sources/${source.id}/remove?${qs}`,
        { method: "POST" }
      );

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage(data.detail || "Unable to remove data source registration.");
        return;
      }

      if (sourceId === source.id) setSourceId("");

      setMessage(
        `Data source "${source.display_name}" removed from this ContractX project.`
      );
      await loadVault(false);
    } finally {
      setSourceActionId(null);
    }
  };

  const authorizeSource = async (source: any) => {
    if (!requireProjectContext()) return;

    if (!source?.id) return;

    const info = connectorInfo(source);
    const alreadyConnected = String(source.connection_status || "").toLowerCase() === "connected";

    if (!info.ready && !alreadyConnected) {
      setMessage(info.message);
      return;
    }

    setSourceActionId(source.id);
    setMessage("");

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const r = await authFetch(
        `${API}/api/v1/vault/sources/${source.id}/authorize?${qs}`,
        { method: "POST" }
      );

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setMessage(data.detail || "CDE connection could not be completed.");
        await loadVault(false);
        return;
      }

      if (data.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }

      setMessage(data.message || "CDE connection request accepted.");
      await loadVault(false);
    } finally {
      setSourceActionId(null);
    }
  };

  const testSourceConnection = async (source: any) => {
    if (!requireProjectContext()) return;

    if (!source?.id) return;

    setSourceActionId(source.id);
    setMessage("");

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const r = await authFetch(
        `${API}/api/v1/vault/sources/${source.id}/test?${qs}`,
        { method: "POST" }
      );

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setMessage(data.detail || "CDE connection test failed.");
        await loadVault(false);
        return;
      }

      setMessage(data.message || "CDE connection test completed.");
      await loadVault(false);
    } finally {
      setSourceActionId(null);
    }
  };

  const openScopeSelector = async (source: any) => {
    if (!requireProjectContext()) return;

    if (!source?.id) return;

    setScopeSource(source);
    setScopeModalOpen(true);
    setScopeLoading(true);
    setScopeItems([]);
    setSelectedScopeIds([]);
    setScopeMode(source.access_mode || "read_index");

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const r = await authFetch(
        `${API}/api/v1/vault/sources/${source.id}/browse?${qs}`
      );

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setMessage(
          data.detail ||
            "Source browsing is available after the customer connection is verified."
        );
        return;
      }

      setScopeItems(data.items || []);
      setSelectedScopeIds(
        Array.isArray(data.selected_ids) ? data.selected_ids : []
      );
      if (data.access_mode) setScopeMode(data.access_mode);
    } finally {
      setScopeLoading(false);
    }
  };

  const toggleScopeItem = (id: string) => {
    setSelectedScopeIds((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]
    );
  };

  const saveScope = async () => {
    if (!requireProjectContext()) return;

    if (!scopeSource?.id) return;

    if (selectedScopeIds.length === 0) {
      setMessage("Select at least one CDE file or folder.");
      return;
    }

    setScopeLoading(true);
    setMessage("");

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const r = await authFetch(
        `${API}/api/v1/vault/sources/${scopeSource.id}/scope?${qs}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selected_ids: selectedScopeIds,
            access_mode: scopeMode,
          }),
        }
      );

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setMessage(data.detail || "Unable to save CDE sync scope.");
        return;
      }

      // For Read & Index / Read & Process, the user's Save action should
      // actually register the chosen CDE files in the project document list.
      if (scopeMode === "read_index" || scopeMode === "read_process") {
        const syncResponse = await authFetch(
          `${API}/api/v1/vault/sources/${scopeSource.id}/sync?${qs}`,
          { method: "POST" }
        );

        const syncData = await syncResponse.json().catch(() => ({}));

        if (!syncResponse.ok) {
          setMessage(
            syncData.detail ||
              "CDE scope was saved, but the selected documents could not be synchronized."
          );
          return;
        }

        setScopeModalOpen(false);
        setMessage(
          syncData.message ||
            "Selected CDE documents were registered for indexing."
        );

        await loadVault(false);
        return;
      }

      setScopeModalOpen(false);
      setMessage(data.message || "CDE sync scope saved.");
      await loadVault(false);
    } finally {
      setScopeLoading(false);
    }
  };

  const syncSourceNow = async (source: any) => {
    if (!requireProjectContext()) return;

    if (!source?.id) return;

    setSourceActionId(source.id);
    setMessage("");

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const r = await authFetch(
        `${API}/api/v1/vault/sources/${source.id}/sync?${qs}`,
        { method: "POST" }
      );

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setMessage(
          data.detail ||
            "CDE sync cannot start until connection and scope configuration are complete."
        );
        return;
      }

      setMessage(data.message || "CDE sync started.");
      await loadVault(false);
    } finally {
      setSourceActionId(null);
    }
  };

  const documentProcessingLabel = (document: VaultDocument) => {
    const status = String(document.index_status || "pending").toLowerCase();
    const extension = String(document.file_extension || "").toLowerCase();

    if (extension === "xer" && status === "not_requested") {
      return "Stored · Programme file";
    }

    if (status === "ready") return "Ready";
    if (status === "failed") return "Indexing failed";
    if (status === "not_requested") return "Stored";
    return "Uploaded · Awaiting indexing";
  };

  const documentDisplayPercent = (document: VaultDocument) => {
    const status = String(document.index_status || "pending").toLowerCase();

    if (status === "ready" || status === "not_requested") return 100;
    if (status === "failed") return 10;
    return 10;
  };

  const deleteDocument = async (document: VaultDocument) => {
    if (!requireProjectContext()) return;

    if (!document?.id) return;

    const confirmed = window.confirm(
      `Delete "${document.file_name || "this document"}" from the ContractX project vault?\n\n` +
        "This removes the ContractX-managed file, document register entry and upload tracking record. " +
        "It does not delete files from an external customer CDE."
    );

    if (!confirmed) return;

    setDeletingDocumentId(document.id);
    setMessage("");

    try {
      const qs = new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId ?? "",
      });

      const r = await authFetch(
        `${API}/api/v1/vault/documents/${document.id}/remove?${qs}`,
        { method: "POST" }
      );

      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        setMessage(data.detail || "Unable to delete document.");
        return;
      }

      setMessage(
        data.message ||
          `Document "${document.file_name || document.id}" deleted from the ContractX Vault.`
      );

      await loadVault(false);
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const upload = async () => {
    if (!requireProjectContext()) return;

    if (!uploadFile) {
      setMessage("Choose a document to upload.");
      return;
    }

    setTransferPct(0);
    setProcessingPct(0);
    setUploadStage("checking");
    setMessage("");

    try {
      const health = await authFetch(`${API}/api/v1/vault/health`, {
        cache: "no-store",
      });

      const healthData = await health.json().catch(() => ({}));

      if (!health.ok) {
        setUploadStage("failed");
        setMessage(
          healthData.detail ||
            `Vault API health check failed (HTTP ${health.status}).`
        );
        return;
      }

      if (!healthData.database_configured) {
        setUploadStage("failed");
        setMessage(
          "Vault database is not configured on the backend. Check SUPABASE_URL and the backend service-role key."
        );
        return;
      }
    } catch (error) {
      setUploadStage("failed");
      setMessage(
        error instanceof Error
          ? `Vault API is unreachable: ${error.message}`
          : "Vault API is unreachable."
      );
      return;
    }

    const form = new FormData();
    form.append("file", uploadFile);
    form.append("tenant_id", tenantId);
    form.append("project_id", projectId ?? "");
    form.append("category", uploadCategory);
    form.append("stakeholder_tier", uploadStakeholderTier);
    form.append("flow_direction", uploadFlowDirection);

    if (uploadDocDate) form.append("document_date", uploadDocDate);
    if (uploadRef) form.append("letter_ref", uploadRef);
    if (uploadSubject) form.append("subject", uploadSubject);
    if (uploadSender) form.append("sender", uploadSender);
    if (uploadRecipient) form.append("recipient", uploadRecipient);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.timeout = 120000;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setTransferPct(
          Math.round((event.loaded / event.total) * 100)
        );
      }
    };

    xhr.onload = () => {
      let data: any = {};

      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {}

      if (xhr.status >= 200 && xhr.status < 300) {
        setTransferPct(100);
        setProcessingPct(Number(data.processing_percent || 10));
        setUploadStage(data.stage || "uploaded");
        setMessage(
          data.message ||
            "Document uploaded successfully to the ContractX Private Vault."
        );
        setUploadFile(null);
        void loadVault(false);

        window.setTimeout(() => {
          uploadSectionRef.current?.focus({
            preventScroll: true,
          });
        }, 50);

        return;
      }

      setUploadStage("failed");
      setMessage(
        data.detail ||
          `Secure upload failed (HTTP ${xhr.status}). ${
            xhr.responseText ? String(xhr.responseText).slice(0, 500) : ""
          }`
      );
    };

    xhr.onerror = () => {
      setUploadStage("failed");
      setMessage(
        "Secure upload connection failed before the backend returned a response."
      );
    };

    xhr.ontimeout = () => {
      setUploadStage("failed");
      setMessage(
        "Secure upload timed out after 120 seconds. Check the FastAPI terminal for the request error."
      );
    };

    xhr.onabort = () => {
      setUploadStage("failed");
      setMessage("Secure upload was cancelled.");
    };

    setUploadStage("uploading");

    try {
      const authHeaders = await getAuthHeaders(false);

      xhr.open("POST", `${API}/api/v1/vault/upload`);
      xhr.setRequestHeader(
        "Authorization",
        authHeaders.Authorization
      );
      xhr.send(form);
    } catch (error) {
      setUploadStage("failed");
      setMessage(
        error instanceof Error
          ? error.message
          : "Authenticated session could not be verified."
      );
    }
  };

  const selectedModelInfo = models.find((m) => m.key === selectedModel);

  const categoryCount = (name: string) =>
    summary?.category_counts?.[name] ||
    summary?.category_counts?.[name.replace("_", " ")] ||
    0;

  const visiblePages = useMemo(() => {
    const max = Math.min(Math.max(pages, 1), 5);
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [pages]);

  return (
    <main
      className={cx(
        "cx-documents-shell min-h-screen bg-[#050608] text-[#F5F3EE]",
        theme === "light" && "cx-platform-light"
      )}
    >
      <style>{`
        .cx-documents-shell {
          --cx-background:#050608;
          --cx-foreground:#F5F3EE;
          --cx-panel:#0D0F12;
          --cx-panel-2:#080A0D;
          --cx-card:#0D0F12;
          --cx-text:#F4F1EA;
          --cx-muted:#737E89;
          --cx-muted-strong:#AAB3BD;
          --cx-border:rgba(255,255,255,.08);
          --cx-divider:rgba(255,255,255,.08);
          --cx-footer-bg:#050608;
          --cx-footer-text:#F4F1EA;
          --cx-footer-muted:rgba(244,241,234,.40);
          --cx-footer-muted-strong:rgba(244,241,234,.48);
          --cx-footer-border:rgba(255,255,255,.065);
          --cx-footer-divider:rgba(255,255,255,.10);
          --cx-footer-hover:#F4F1EA;
          --cx-footer-accent:#D8A84E;
          --cx-gold:#D8A84E;
        }

        .cx-platform-light {
          color-scheme:light;
          background:#f3f0e9!important;
          color:#17191c!important;
          --cx-background:#f3f0e9;
          --cx-foreground:#17191c;
          --cx-panel:#fffdf8;
          --cx-panel-2:#f7f4ed;
          --cx-card:#fffdf8;
          --cx-text:#17191c;
          --cx-muted:#59616a;
          --cx-muted-strong:#34383d;
          --cx-border:rgba(23,25,28,.14);
          --cx-divider:rgba(23,25,28,.11);
          --cx-footer-bg:#ebe7de;
          --cx-footer-text:#17191c;
          --cx-footer-muted:#5b6269;
          --cx-footer-muted-strong:#4f565d;
          --cx-footer-border:rgba(23,25,28,.12);
          --cx-footer-divider:rgba(23,25,28,.12);
          --cx-footer-hover:#17191c;
          --cx-footer-accent:#765114;
        }
        .cx-platform-light [class*="bg-[#050608]"]{background:#f3f0e9!important;}
        .cx-platform-light [class*="bg-[#0D0F12]"],
        .cx-platform-light [class*="bg-[#080A0D]"]{background:rgba(255,255,255,.92)!important;}
        .cx-platform-light [class*="border-white"]{border-color:rgba(23,25,28,.11)!important;}
        .cx-platform-light [class*="text-[#F5F3EE]"],
        .cx-platform-light [class*="text-[#F4F1EA]"],
        .cx-platform-light [class*="text-[#D8DCE0]"]{color:#17191c!important;}
        .cx-platform-light [class*="text-[#AAB3BD]"],
        .cx-platform-light [class*="text-[#737E89]"],
        .cx-platform-light [class*="text-[#69747F]"]{color:rgba(23,25,28,.78)!important;}
        .cx-platform-light [class*="bg-white/"]{background:rgba(23,25,28,.055)!important;}
        .cx-platform-light input,
        .cx-platform-light select{
          background:#fffdf8!important;
          color:#17191c!important;
          border-color:rgba(23,25,28,.20)!important;
        }
        .cx-platform-light button:not([class*="bg-[#D8A84E]"]){
          color:#34383d!important;
        }
        .cx-platform-light button[class*="border-[#D8A84E]"]{
          background:#fff7e8!important;
          color:#6e4d12!important;
          border-color:rgba(159,111,28,.42)!important;
        }
        .cx-platform-light [class*="text-[#E6C274]"]{
          color:#765114!important;
        }
        .cx-platform-light thead{
          background:rgba(23,25,28,.055)!important;
          color:#454b52!important;
        }
        .cx-platform-light tbody tr:hover{
          background:rgba(23,25,28,.045)!important;
        }

        /* Light mode navigation / tab contrast */
        .cx-platform-light [role="tab"],
        .cx-platform-light nav a,
        .cx-platform-light .cx-cde-action{
          color:#34383d!important;
          border-color:rgba(23,25,28,.18)!important;
        }

        .cx-platform-light [role="tab"][aria-selected="true"],
        .cx-platform-light nav a[aria-current="page"]{
          background:#fff3d7!important;
          color:#5e4212!important;
          border-color:rgba(159,111,28,.42)!important;
          box-shadow:0 0 0 1px rgba(159,111,28,.08)!important;
        }

        .cx-platform-light [role="tab"]:hover,
        .cx-platform-light nav a:hover,
        .cx-platform-light .cx-cde-action:hover:not(:disabled){
          background:rgba(23,25,28,.065)!important;
          color:#17191c!important;
        }

        .cx-platform-light .cx-source-card{
          background:#fffdf8!important;
          border-color:rgba(23,25,28,.14)!important;
          box-shadow:0 8px 24px rgba(23,25,28,.035)!important;
        }

        .cx-platform-light .cx-source-card [class*="text-[#F4F1EA]"]{
          color:#17191c!important;
        }

        .cx-platform-light .cx-source-card [class*="text-[#69747F]"]{
          color:#59616a!important;
        }

        .cx-platform-light .cx-source-card button:disabled{
          color:#858b91!important;
          opacity:.58!important;
        }

        .cx-platform-light .cx-model-card{
          background:#fff7e8!important;
          border-color:rgba(159,111,28,.34)!important;
        }

        .cx-platform-light .cx-model-card [class*="text-[#F4F1EA]"]{
          color:#3f2c0c!important;
        }

        .cx-platform-light .cx-model-card .text-emerald-300{
          color:#176336!important;
        }

        .cx-platform-light .cx-delete-document{
          background:#fdebec!important;
          border-color:#d9787f!important;
          color:#8d2730!important;
        }

        .cx-platform-light .cx-delete-document:hover:not(:disabled){
          background:#f9dadd!important;
          border-color:#c95963!important;
          color:#721e26!important;
        }

        /* Strong light-mode semantic badges */
        .cx-platform-light .cx-pill-green{
          background:#e8f7ee!important;
          border-color:#73b78c!important;
          color:#176336!important;
        }

        .cx-platform-light .cx-pill-blue{
          background:#e8f2fb!important;
          border-color:#79a9d2!important;
          color:#245f8d!important;
        }

        .cx-platform-light .cx-pill-amber{
          background:#fff3d6!important;
          border-color:#d8a84e!important;
          color:#755013!important;
        }

        .cx-platform-light .cx-pill-red{
          background:#fdebec!important;
          border-color:#d9787f!important;
          color:#8d2730!important;
        }

        .cx-platform-light .cx-pill-gold{
          background:#fff3d7!important;
          border-color:#c99534!important;
          color:#69470d!important;
        }

        .cx-platform-light .cx-pill-neutral{
          background:#eef0f2!important;
          border-color:#b9bec3!important;
          color:#4b535b!important;
        }

        .cx-platform-light .cx-standard-footer{
          background:#ebe7de!important;
          border-color:rgba(23,25,28,.12)!important;
        }

        .cx-platform-light .cx-standard-footer [class*="text-[#F4F1EA]"]{
          color:#17191c!important;
        }

        .cx-platform-light .cx-standard-footer [class*="text-white/"]{
          color:#5b6269!important;
        }

        .cx-platform-light .cx-standard-footer a{
          color:#5b6269!important;
        }

        .cx-platform-light .cx-standard-footer a:hover{
          color:#765114!important;
        }

        .cx-platform-light .cx-scope-dialog{
          background:#fffdf8!important;
          border-color:rgba(23,25,28,.14)!important;
          box-shadow:0 28px 90px rgba(23,25,28,.24)!important;
        }

        .cx-platform-light .cx-scope-dialog [class*="text-[#F4F1EA]"],
        .cx-platform-light .cx-scope-dialog [class*="text-[#D8DCE0]"]{
          color:#202428!important;
        }

        .cx-platform-light .cx-scope-dialog [class*="text-[#69747F]"]{
          color:#626a72!important;
        }

        .cx-platform-light .cx-scope-dialog [class*="bg-[#080A0D]"]{
          background:#f7f4ed!important;
        }

        .cx-platform-light .cx-message-dialog{
          background:#fffdf8!important;
          border-color:rgba(159,111,28,.30)!important;
          box-shadow:0 28px 90px rgba(23,25,28,.24)!important;
        }

        .cx-platform-light .cx-message-dialog p{
          color:#25292d!important;
        }

        .cx-platform-light .cx-message-close{
          background:rgba(23,25,28,.04)!important;
          border-color:rgba(23,25,28,.14)!important;
          color:#525960!important;
        }

        .cx-platform-light button:focus-visible,
        .cx-platform-light input:focus-visible,
        .cx-platform-light select:focus-visible,
        .cx-platform-light [role="tab"]:focus-visible{
          outline:2px solid rgba(159,111,28,.50)!important;
          outline-offset:2px!important;
        }
      `}</style>

      <div className="mx-auto max-w-[1700px] px-5 py-6 lg:px-8">
        <header className="rounded-2xl border border-white/[0.07] bg-[#0D0F12] p-5 lg:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="text-[10px] font-black uppercase tracking-[0.17em] text-[#D8A84E]">
                Project Data
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#F4F1EA] lg:text-4xl">
                Documents
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#737E89]">
                Upload, find and manage project evidence in the ContractX Private Vault,
                or connect an authorised customer-controlled data source.
              </p>
              <div className="mt-3 text-[10px] leading-5 text-[#7F8994]">
                Customer-owned data · Project-isolated access · Private data is not used to train shared AI models
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ContractXThemeSwitch
                theme={theme}
                onChange={setDocumentsTheme}
              />

              <button
                onClick={focusUploadSection}
                disabled={!hasProjectContext}
                className="rounded-md bg-[#D8A84E] px-4 py-3 text-[10px] font-black uppercase tracking-[0.11em] text-[#050608] disabled:cursor-not-allowed disabled:opacity-40"
              >
                + Upload Document
              </button>
            </div>
          </div>
        </header>

        {projectLoading && (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3 text-xs text-amber-400">
            Loading selected project context...
          </div>
        )}

        {projectError && (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.055] px-4 py-3 text-xs text-rose-400">
            {projectError}
          </div>
        )}

        <section className="mt-4 rounded-2xl border border-white/[0.07] bg-[#0D0F12]">
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#69747F]">
                Current Project
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-[#F4F1EA]">
                {project?.project_name
                  ? `${project.project_name}${project.project_code ? ` · ${project.project_code}` : ""}`
                  : projectLoading
                  ? "Loading selected project…"
                  : "No project selected"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowTechnicalDetails((current) => !current)}
              className="w-fit rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[9px] font-black uppercase tracking-[0.09em] text-[#7F8994]"
            >
              {showTechnicalDetails ? "Hide Technical Details" : "Technical Details"}
            </button>
          </div>

          {showTechnicalDetails && (
            <div className="grid gap-3 border-t border-white/[0.06] px-5 py-4 md:grid-cols-2">
              <div>
                <div className="text-[8px] font-black uppercase tracking-[0.13em] text-[#69747F]">
                  Tenant ID
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-[#AAB3BD]">
                  {tenantId || "—"}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-black uppercase tracking-[0.13em] text-[#69747F]">
                  Project ID
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-[#AAB3BD]">
                  {projectId || "—"}
                </div>
              </div>
            </div>
          )}
        </section>

        {scopeModalOpen && (
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contractx-scope-title"
          >
            <div className="cx-scope-dialog w-full max-w-3xl rounded-3xl border border-white/[0.08] bg-[#0D0F12] shadow-[0_28px_90px_rgba(0,0,0,.55)]">
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-5">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#D8A84E]">
                    CDE Sync Scope
                  </div>
                  <h3 id="contractx-scope-title" className="mt-1 text-lg font-bold text-[#F4F1EA]">
                    {scopeSource?.display_name || "Connected Data Source"}
                  </h3>
                  <p className="mt-1 text-[11px] leading-5 text-[#69747F]">
                    Select the folders, files or records ContractX is permitted to synchronize.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setScopeModalOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-lg text-[#AAB3BD]"
                  aria-label="Close scope selector"
                >
                  ×
                </button>
              </div>

              <div className="grid gap-5 p-6 md:grid-cols-[1fr_220px]">
                <div>
                  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#69747F]">
                    Source Browser
                  </div>

                  <div className="max-h-[360px] overflow-auto rounded-2xl border border-white/[0.06] bg-[#080A0D] p-3">
                    {scopeLoading ? (
                      <div className="px-3 py-8 text-center text-xs text-[#69747F]">
                        Loading source structure…
                      </div>
                    ) : scopeItems.length === 0 ? (
                      <div className="px-3 py-8 text-center">
                        <div className="text-xs font-semibold text-[#D8DCE0]">
                          No source folders are available yet.
                        </div>
                        <div className="mt-2 text-[11px] leading-5 text-[#69747F]">
                          The source folder/file tree will appear here after the customer connection is verified. Local CDE Test can be browsed immediately after connection.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {scopeItems.map((item: any) => {
                          const id = String(item.id);
                          const selected = selectedScopeIds.includes(id);

                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => toggleScopeItem(id)}
                              className={cx(
                                "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                                selected
                                  ? "border-[#D8A84E]/35 bg-[#D8A84E]/[0.07]"
                                  : "border-white/[0.06] bg-white/[0.018] hover:bg-white/[0.035]"
                              )}
                            >
                              <span
                                className={cx(
                                  "flex h-4 w-4 items-center justify-center rounded border text-[9px]",
                                  selected
                                    ? "border-[#D8A84E] bg-[#D8A84E] text-[#050608]"
                                    : "border-white/20 text-transparent"
                                )}
                              >
                                ✓
                              </span>

                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-semibold text-[#D8DCE0]">
                                  {item.name || item.display_name || id}
                                </div>
                                <div className="mt-1 text-[10px] uppercase tracking-[0.10em] text-[#69747F]">
                                  {item.type || item.kind || "record"}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#69747F]">
                    Sync Mode
                  </div>

                  <div className="mt-3 space-y-2">
                    {[
                      ["metadata_only", "Metadata only"],
                      ["read_only", "Read only"],
                      ["read_index", "Read + Index"],
                      ["read_process", "Read + Process"],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-[#080A0D] px-3 py-3"
                      >
                        <input
                          type="radio"
                          name="scope-mode"
                          value={value}
                          checked={scopeMode === value}
                          onChange={() => setScopeMode(value)}
                        />
                        <span className="text-[11px] font-semibold text-[#D8DCE0]">
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3 text-[10px] leading-5 text-[#69747F]">
                    Selected records: <span className="font-bold text-[#D8DCE0]">{selectedScopeIds.length}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
                <button
                  type="button"
                  onClick={() => setScopeModalOpen(false)}
                  className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#AAB3BD]"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={saveScope}
                  disabled={scopeLoading}
                  className="rounded-xl bg-[#D8A84E] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#050608] disabled:opacity-40"
                >
                  {scopeLoading ? "Saving…" : "Save Scope"}
                </button>
              </div>
            </div>
          </div>
        )}

        <ContractXNoticeModal
          open={Boolean(message)}
          variant={
            /success|saved|connected|completed|created|registered|uploaded|deleted|removed|disconnected|phased out|accepted|started/i.test(message)
              ? "success"
              : /loading|pending|available|select|requires|not yet activated|setup/i.test(message)
              ? "info"
              : "error"
          }
          title={
            /success|saved|connected|completed|created|registered|uploaded|deleted|removed|disconnected|phased out|accepted|started/i.test(message)
              ? "Completed"
              : /loading|pending|available|select|requires|not yet activated|setup/i.test(message)
              ? "Information"
              : "Action Required"
          }
          message={message}
          onClose={() => setMessage("")}
        />

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Project Documents" value={summary?.total_documents ?? 0} />
          <Stat
            label="Indexed"
            value={summary?.indexed_documents ?? 0}
            note={`${summary?.index_coverage_percent ?? 0}% coverage`}
          />
          <Stat
            label="Evidence Records"
            value={
              categoryCount("client_correspondence") +
              categoryCount("subcontractor_correspondence") +
              categoryCount("formal_notice") +
              categoryCount("eot_claim_submission")
            }
            note="Correspondence · Notices · Claims"
          />
          <Stat label="Last Upload" value={fmtDate(summary?.last_upload_at)} />
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0D0F12]">
          <button
            type="button"
            onClick={() => setShowSecurity((value) => !value)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D8A84E]">
                Data Protection
              </div>
              <div className="mt-1 text-sm font-semibold text-[#F4F1EA]">
                Ownership, isolation and access controls
              </div>
            </div>
            <span className="text-[#69747F]">{showSecurity ? "−" : "+"}</span>
          </button>

          {showSecurity && (
            <div className="grid gap-3 border-t border-white/[0.06] p-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Data Ownership", "Customer Retained"],
                [
                  "Storage Mode",
                  summary?.connected_sources?.length
                    ? "Connected / Hybrid"
                    : "ContractX Private Vault",
                ],
                ["Tenant Isolation", "Active"],
                ["AI Training", "Disabled"],
                ["Access Scope", "Authorised Project Data"],
                [
                  "Original File Location",
                  summary?.connected_sources?.length
                    ? "Customer / Hybrid"
                    : "ContractX Vault",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/[0.06] bg-[#080A0D] p-3"
                >
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#69747F]">
                    {label}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[#D8DCE0]">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0D0F12]">
          <button
            type="button"
            onClick={() => setShowAiPolicy((value) => !value)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#D8A84E]">
                AI Processing Policy
              </div>
              <div className="mt-1 text-sm font-semibold text-[#F4F1EA]">
                Approved model configuration
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cx(
                  "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em]",
                  modelRegistryStatus === "ready"
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                    : modelRegistryStatus === "error"
                    ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
                    : "border-amber-400/20 bg-amber-400/10 text-amber-200"
                )}
              >
                {modelRegistryStatus === "ready"
                  ? "Registry Online"
                  : modelRegistryStatus === "error"
                  ? "Registry Error"
                  : "Loading"}
              </span>
              <span className="text-[#69747F]">{showAiPolicy ? "−" : "+"}</span>
            </div>
          </button>

          {showAiPolicy && (
            <div className="border-t border-white/[0.06] p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#69747F]">
                    Approved Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs text-[#D8DCE0]"
                  >
                    {models.length === 0 && (
                      <option value={selectedModel}>
                        {modelRegistryStatus === "loading"
                          ? "Loading approved model…"
                          : "No approved model available"}
                      </option>
                    )}
                    {models.map((m) => (
                      <option
                        key={m.key}
                        value={m.key}
                        disabled={m.status !== "active"}
                      >
                        {m.display_name || m.key}
                        {m.status !== "active" ? " (Coming Soon)" : ""}
                      </option>
                    ))}
                  </select>

                  {modelRegistryMessage && (
                    <div className="mt-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.045] px-3 py-2 text-[10px] leading-4 text-rose-200">
                      {modelRegistryMessage}
                    </div>
                  )}
                </div>

                <div className="cx-model-card rounded-xl border border-[#D8A84E]/20 bg-[#D8A84E]/[0.045] p-3">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-[#69747F]">
                    Configured API Model
                  </div>
                  <div className="mt-1 text-sm font-bold text-[#F4F1EA]">
                    {friendlyApiModel(selectedModelInfo?.model_id)}
                  </div>
                  <div className="mt-1 text-[10px] text-[#69747F]">
                    Provider: {selectedModelInfo?.provider || "—"} · Policy: {modelPolicySource}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={saveModel}
                  className="rounded-md border border-[#D8A84E]/30 bg-[#D8A84E]/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.10em] text-[#E6C274]"
                >
                  Save AI Processing Policy
                </button>
              </div>
            </div>
          )}
        </section>

        <section
          ref={uploadSectionRef}
          tabIndex={-1}
          aria-label="Upload documents"
          className="mt-5 scroll-mt-5 rounded-2xl border border-[#D8A84E]/20 bg-[#0D0F12] p-5 outline-none focus:ring-2 focus:ring-[#D8A84E]/35"
        >
          <div className="flex flex-col gap-2 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D8A84E]">
                Upload
              </div>
              <div className="mt-1 text-lg font-semibold text-[#F4F1EA]">
                Add Document to Project Vault
              </div>
            </div>
            <div className="text-[10px] text-[#69747F]">
              Maximum individual file size: 250 MB
            </div>
          </div>

          <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="cursor-pointer rounded-xl border border-dashed border-white/[0.12] bg-[#080A0D] p-4 text-xs transition hover:border-[#D8A84E]/30">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-[#69747F]">
                    Document File
                  </span>
                  <span className="mt-2 block font-semibold text-[#D8DCE0]">
                    {uploadFile ? uploadFile.name : "Choose file"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.pptx,.csv,.txt,.md,.xml,.json,.html,.htm,.eml,.log,.xer"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] || null;
                      setUploadFile(selected);
                      if (
                        selected &&
                        selected.name.toLowerCase().endsWith(".xer")
                      ) {
                        setUploadCategory("programme_schedule");
                      }
                    }}
                    className="sr-only"
                  />
                </label>

                <label>
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#69747F]">
                    Category
                  </span>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="mt-2 h-[58px] w-full rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 text-xs text-[#E2E6EA]"
                    aria-label="Document category"
                  >
                    <optgroup label="Programme">
                      <option value="programme_schedule">
                        Programme / Schedule
                      </option>
                    </optgroup>
                    <optgroup label="Contracts & Project Records">
                      <option value="executed_contract">Executed Contract</option>
                      <option value="client_correspondence">Client Correspondence</option>
                      <option value="subcontractor_correspondence">
                        Subcontractor Correspondence
                      </option>
                      <option value="site_instruction">Site Instruction</option>
                      <option value="formal_notice">Formal Notice</option>
                      <option value="eot_claim_submission">EOT Claim Submission</option>
                      <option value="minutes_of_meeting">Minutes of Meeting</option>
                      <option value="variation_order">Variation Order</option>
                      <option value="commercial_payment">Commercial / Payment</option>
                    </optgroup>
                  </select>
                </label>
              </div>

              {uploadCategory === "programme_schedule" && (
                <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-400/[0.055] px-3 py-2 text-[10px] leading-4 text-sky-200">
                  Programme files are stored in the Project Vault and routed to Delay Analysis rather than generic document-vector indexing.
                </div>
              )}

              <button
                type="button"
                onClick={() => setUploadDetailsOpen((current) => !current)}
                className="mt-4 rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[9px] font-black uppercase tracking-[0.09em] text-[#7F8994]"
              >
                {uploadDetailsOpen ? "Hide Metadata" : "Add Document Metadata"}
              </button>

              {uploadDetailsOpen && (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <select
                    value={uploadStakeholderTier}
                    onChange={(e) => setUploadStakeholderTier(e.target.value)}
                    className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs"
                  >
                    <option value="EMPLOYER_CLIENT">Employer / Client</option>
                    <option value="MAIN_CONTRACTOR">Main Contractor</option>
                    <option value="SUBCONTRACTOR">Subcontractor</option>
                    <option value="SUPERPORTING_CONSULTANT">Consultant</option>
                    <option value="THIRD_PARTY">Third Party / Other</option>
                  </select>

                  <select
                    value={uploadFlowDirection}
                    onChange={(e) => setUploadFlowDirection(e.target.value)}
                    className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs"
                  >
                    <option value="INCOMING">Incoming</option>
                    <option value="OUTGOING">Outgoing</option>
                    <option value="INTERNAL">Internal / Project Record</option>
                  </select>

                  <input
                    type="date"
                    value={uploadDocDate}
                    onChange={(e) => setUploadDocDate(e.target.value)}
                    className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs"
                  />
                  <input
                    value={uploadRef}
                    onChange={(e) => setUploadRef(e.target.value)}
                    placeholder="Reference / letter no."
                    className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs"
                  />
                  <input
                    value={uploadSubject}
                    onChange={(e) => setUploadSubject(e.target.value)}
                    placeholder="Subject"
                    className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs md:col-span-2"
                  />
                  <input
                    value={uploadSender}
                    onChange={(e) => setUploadSender(e.target.value)}
                    placeholder="Sender"
                    className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs"
                  />
                  <input
                    value={uploadRecipient}
                    onChange={(e) => setUploadRecipient(e.target.value)}
                    placeholder="Recipient"
                    className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={upload}
                disabled={!uploadFile}
                className="mt-4 rounded-md bg-[#D8A84E] px-5 py-3 text-[10px] font-black uppercase tracking-[0.11em] text-[#050608] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Upload Document
              </button>
            </div>

            <div className="h-fit rounded-xl border border-white/[0.07] bg-[#080A0D] p-4">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#69747F]">
                Upload Status
              </div>

              <div className="mt-4 flex items-center justify-between text-[10px] text-[#AAB3BD]">
                <span>Transfer</span>
                <span>{transferPct}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full bg-[#D8A84E]"
                  style={{ width: `${transferPct}%` }}
                />
              </div>

              <div className="mt-4 flex items-center justify-between text-[10px] text-[#AAB3BD]">
                <span>Processing</span>
                <span>{processingPct}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full bg-sky-400"
                  style={{ width: `${processingPct}%` }}
                />
              </div>

              <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="text-[8px] uppercase tracking-[0.14em] text-[#69747F]">
                  Stage
                </div>
                <div className="mt-1 text-xs font-semibold capitalize text-[#D8DCE0]">
                  {uploadStage}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-white/[0.07] bg-[#0D0F12]">
          <button
            onClick={() => setShowSources((v) => !v)}
            className="flex w-full items-center justify-between border-b border-white/[0.06] px-5 py-4 text-left"
          >
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D8A84E]">Data Sources</div>
              <div className="mt-1 text-sm font-semibold text-[#F4F1EA]">Connected repositories and customer-controlled CDE access</div>
            </div>
            <span className="text-[#69747F]">{showSources ? "−" : "+"}</span>
          </button>

          {showSources && (
            <div className="p-5">
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_520px]">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#69747F]">
                        Connected / Registered Sources
                      </div>
                      <div className="mt-1 text-[11px] text-[#69747F]">
                        Connection status is shown only after ContractX verifies the source.
                      </div>
                    </div>

                    <Pill tone="neutral">
                      {(summary?.connected_sources || []).length} Sources
                    </Pill>
                  </div>

                  {(summary?.connected_sources || []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/[0.10] bg-[#080A0D] px-5 py-10 text-center">
                      <div className="text-sm font-semibold text-[#D8DCE0]">
                        No CDE sources registered
                      </div>
                      <div className="mt-2 text-[11px] text-[#69747F]">
                        Use the Connect CDE panel to register a customer source or the Local CDE Test.
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {(summary?.connected_sources || []).map((s: any) => {
                        const busy = sourceActionId === s.id;
                        const pending = s.connection_status === "pending";
                        const connected = s.connection_status === "connected";
                        const failed = s.connection_status === "error";
                        const revoked =
                          s.connection_status === "revoked" ||
                          s.connection_status === "disconnected";

                        const statusLabel = connected
                          ? "Connected"
                          : failed
                          ? "Connection Failed"
                          : revoked
                          ? "Disconnected"
                          : pending
                          ? "Customer Setup Required"
                          : s.connection_status || "Unknown";

                        const statusTone = connected
                          ? "green"
                          : failed
                          ? "red"
                          : revoked
                          ? "neutral"
                          : "amber";

                        const providerInfo = connectorInfo(s);
                        const nativeVault =
                          String(s.source_type || "").toLowerCase() ===
                          "contractx_vault";

                        const indicatorClass = connected
                          ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,.12)]"
                          : failed
                          ? "bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,.12)]"
                          : pending
                          ? "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,.10)]"
                          : "bg-slate-400";

                        return (
                          <div
                            key={s.id}
                            className="cx-source-card rounded-2xl border border-white/[0.07] bg-[#080A0D] p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cx(
                                      "h-2.5 w-2.5 shrink-0 rounded-full",
                                      indicatorClass
                                    )}
                                    aria-hidden="true"
                                  />
                                  <div className="truncate text-xs font-semibold text-[#F4F1EA]">
                                    {s.display_name}
                                  </div>
                                </div>

                                <div className="mt-1 pl-[18px] text-[10px] uppercase tracking-[0.12em] text-[#69747F]">
                                  {sourceTypeLabel(String(s.source_type || "source"))}
                                </div>
                              </div>

                              <Pill tone={statusTone as any}>{statusLabel}</Pill>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] leading-5 text-[#69747F]">
                              <div>Hosting</div>
                              <div className="text-right text-[#AAB3BD]">
                                {s.hosting_mode || "customer_controlled"}
                              </div>
                              <div>Access</div>
                              <div className="text-right text-[#AAB3BD]">
                                {s.access_mode || "read_index"}
                              </div>
                              <div>Connector</div>
                              <div className={cx(
                                "text-right font-semibold",
                                providerInfo.ready ? "text-emerald-300" : "text-amber-300"
                              )}>
                                {connected ? "Connected" : providerInfo.status}
                              </div>
                              <div>Last Sync</div>
                              <div className="text-right text-[#AAB3BD]">
                                {s.last_sync_at
                                  ? new Date(s.last_sync_at).toLocaleString()
                                  : "Never"}
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                              <button
                                type="button"
                                disabled={busy || connected}
                                onClick={() => authorizeSource(s)}
                                className="cx-cde-action rounded-lg border border-[#D8A84E]/25 bg-[#D8A84E]/8 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.10em] text-[#E6C274] disabled:opacity-40"
                              >
                                {busy
                                  ? "Connecting…"
                                  : revoked && providerInfo.ready
                                  ? "Reconnect"
                                  : providerInfo.button}
                              </button>

                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => testSourceConnection(s)}
                                className="cx-cde-action rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.10em] text-[#AAB3BD] disabled:opacity-35"
                              >
                                Test
                              </button>

                              <button
                                type="button"
                                disabled={busy || !connected || nativeVault}
                                onClick={() => openScopeSelector(s)}
                                className="cx-cde-action rounded-lg border border-sky-400/20 bg-sky-400/[0.055] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.10em] text-sky-200 disabled:opacity-35"
                                title={
                                  nativeVault
                                    ? "Native ContractX storage does not require CDE scope selection."
                                    : "Select CDE synchronization scope."
                                }
                              >
                                {nativeVault ? "Native Storage" : "Select Scope"}
                              </button>

                              <button
                                type="button"
                                disabled={busy || !connected || nativeVault}
                                onClick={() => syncSourceNow(s)}
                                className="cx-cde-action rounded-lg border border-emerald-400/20 bg-emerald-400/[0.055] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.10em] text-emerald-200 disabled:opacity-35"
                                title={
                                  nativeVault
                                    ? "ContractX Managed Vault is synchronized natively."
                                    : "Synchronize the selected external CDE scope."
                                }
                              >
                                {nativeVault ? "Auto Synced" : "Sync"}
                              </button>

                              <button
                                type="button"
                                disabled={busy || revoked}
                                onClick={() => phaseOutSource(s)}
                                className="cx-cde-action rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.10em] text-amber-200 disabled:opacity-40"
                              >
                                Phase Out
                              </button>

                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => removeSource(s)}
                                className="cx-cde-action rounded-lg border border-rose-400/20 bg-rose-400/[0.055] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.10em] text-rose-200 disabled:opacity-40"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="cx-source-card h-fit rounded-2xl border border-[#D8A84E]/20 bg-[#080A0D] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D8A84E]">
                        Connect CDE
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[#F4F1EA]">
                        Customer self-service connection
                      </div>
                    </div>
                    <Pill tone="gold">Customer Controlled</Pill>
                  </div>

                  <p className="mt-2 text-[10px] leading-4 text-[#69747F]">
                    Choose the customer's platform. Local CDE Test is available for development now.
                    Online platforms remain pending until their real customer-managed adapter is enabled.
                  </p>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <label className="sm:col-span-2">
                      <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#69747F]">
                        Platform
                      </span>
                      <select
                        value={newSourceType}
                        onChange={(e) => setNewSourceType(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#0D0F12] px-2 py-2.5 text-[11px]"
                      >
                        <optgroup label="ContractX">
                          <option value="contractx_vault">ContractX Managed Vault</option>
                        </optgroup>
                        <optgroup label="CDE / Collaboration">
                          <option value="sharepoint">Microsoft SharePoint</option>
                          <option value="onedrive">Microsoft OneDrive</option>
                          <option value="aconex">Oracle Aconex</option>
                          <option value="procore">Procore</option>
                          <option value="autodesk_acc">Autodesk Construction Cloud</option>
                        </optgroup>
                        <optgroup label="Cloud / Private">
                          <option value="aws_s3">AWS S3</option>
                          <option value="azure_blob">Azure Blob Storage</option>
                          <option value="private_server">Private Server / On-Prem</option>
                          <option value="other_cde">Other CDE</option>
                        </optgroup>
                        <optgroup label="Development">
                          <option value="local_cde">Local CDE Test</option>
                        </optgroup>
                      </select>
                    </label>

                    <label>
                      <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#69747F]">
                        Display Name
                      </span>
                      <input
                        value={newSourceName}
                        onChange={(e) => setNewSourceName(e.target.value)}
                        placeholder={sourceTypeLabel(newSourceType)}
                        className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#0D0F12] px-2 py-2.5 text-[11px]"
                      />
                    </label>

                    <label>
                      <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#69747F]">
                        Region
                      </span>
                      <input
                        value={newSourceRegion}
                        onChange={(e) => setNewSourceRegion(e.target.value)}
                        placeholder="Optional"
                        className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#0D0F12] px-2 py-2.5 text-[11px]"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={registerSource}
                      className="flex-1 rounded-lg bg-[#D8A84E] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.10em] text-[#050608]"
                    >
                      Connect CDE
                    </button>

                    <button
                      type="button"
                      onClick={clearSourceRegistrationForm}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-[10px] font-bold uppercase text-[#AAB3BD]"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.018] px-3 py-2.5 text-[9px] leading-4 text-[#69747F]">
                    Local CDE Test → immediate local verification. Online CDE → customer setup required until the corresponding live adapter is installed.
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-5 rounded-2xl border border-white/[0.07] bg-[#0D0F12] p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <label className="flex-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#69747F]">
                Search Documents
              </span>
              <div className="mt-2 flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyQuery()}
                  placeholder="Document name, reference or subject…"
                  className="w-full rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs"
                />
                <button
                  type="button"
                  onClick={applyQuery}
                  className="rounded-md bg-[#D8A84E] px-4 text-[10px] font-black uppercase text-[#050608]"
                >
                  Search
                </button>
              </div>
            </label>

            <div className="grid gap-2 sm:grid-cols-3 xl:w-[620px]">
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs"
              >
                <option value="">All Categories</option>
                <option value="executed_contract">Executed Contract</option>
                <option value="client_correspondence">Client Correspondence</option>
                <option value="subcontractor_correspondence">
                  Subcontractor Correspondence
                </option>
                <option value="site_instruction">Site Instruction</option>
                <option value="formal_notice">Formal Notice</option>
                <option value="eot_claim_submission">EOT Claim Submission</option>
                <option value="minutes_of_meeting">Minutes of Meeting</option>
                <option value="variation_order">Variation Order</option>
                <option value="commercial_payment">Commercial / Payment</option>
                <option value="programme_schedule">Programme / Schedule</option>
              </select>

              <select
                value={fileType}
                onChange={(e) => {
                  setFileType(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs"
              >
                <option value="">All File Types</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
                <option value="xlsx">XLSX</option>
                <option value="xer">XER</option>
                <option value="xml">XML</option>
                <option value="csv">CSV</option>
                <option value="pptx">PPTX</option>
                <option value="msg">MSG</option>
                <option value="eml">EML</option>
              </select>

              <select
                value={indexStatus}
                onChange={(e) => {
                  setIndexStatus(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-3 text-xs"
              >
                <option value="">All Index States</option>
                <option value="ready">Ready</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="not_requested">Stored / Programme</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((current) => !current)}
              className="rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[9px] font-black uppercase tracking-[0.09em] text-[#7F8994]"
            >
              {showAdvancedFilters ? "Hide Advanced Filters" : "Advanced Filters"}
            </button>

            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[9px] font-black uppercase tracking-[0.09em] text-[#AAB3BD]"
            >
              Clear Filters
            </button>
          </div>

          {showAdvancedFilters && (
            <div className="mt-4 grid gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <select
                value={sourceId}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-2.5 text-xs"
              >
                <option value="">All Sources</option>
                {(summary?.connected_sources || []).map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-2.5 text-xs"
              >
                <option value="document_date">Document Date</option>
                <option value="uploaded_at">Latest Upload</option>
                <option value="file_name">Document Name</option>
                <option value="letter_ref">Reference</option>
                <option value="sender">Sender</option>
                <option value="recipient">Recipient</option>
                <option value="processing_percent">Processing</option>
              </select>

              <select
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value)}
                className="rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-2.5 text-xs"
              >
                <option value="desc">Newest / Z–A</option>
                <option value="asc">Oldest / A–Z</option>
              </select>

              <div className="hidden lg:block" />

              <label>
                <span className="text-[9px] uppercase tracking-[0.14em] text-[#69747F]">
                  Document Date From
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-2.5 text-xs"
                />
              </label>
              <label>
                <span className="text-[9px] uppercase tracking-[0.14em] text-[#69747F]">
                  Document Date To
                </span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-2.5 text-xs"
                />
              </label>
              <label>
                <span className="text-[9px] uppercase tracking-[0.14em] text-[#69747F]">
                  Uploaded From
                </span>
                <input
                  type="date"
                  value={uploadFrom}
                  onChange={(e) => {
                    setUploadFrom(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-2.5 text-xs"
                />
              </label>
              <label>
                <span className="text-[9px] uppercase tracking-[0.14em] text-[#69747F]">
                  Uploaded To
                </span>
                <input
                  type="date"
                  value={uploadTo}
                  onChange={(e) => {
                    setUploadTo(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-[#080A0D] px-3 py-2.5 text-xs"
                />
              </label>
            </div>
          )}
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0D0F12]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D8A84E]">Document Register</div>
              <div className="mt-1 text-sm font-semibold text-[#F4F1EA]">Project evidence register</div>
            </div>
            <Pill tone="blue">{loading ? "Loading" : `${total} records`}</Pill>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1500px] w-full text-left text-xs">
              <thead className="bg-white/[0.025] text-[9px] uppercase tracking-[0.12em] text-[#69747F]">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 min-w-[280px]">Document / Subject</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Sender</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Document Date</th>
                  <th className="px-4 py-3">Uploaded / Synced</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3">Index</th>
                  <th className="px-4 py-3 min-w-[190px]">Processing</th>
                  <th className="px-4 py-3 text-center">Delete</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                    <td className="px-4 py-3"><Pill>{short(d.category || d.document_type, "Other")}</Pill></td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#D8DCE0]">{short(d.file_name)}</div>
                      <div className="mt-1 max-w-[340px] truncate text-[10px] text-[#69747F]">{short(d.subject, "No subject metadata")}</div>
                    </td>
                    <td className="px-4 py-3 text-[#AAB3BD]">{short(d.letter_ref)}</td>
                    <td className="px-4 py-3 text-[#AAB3BD]">{short(d.sender)}</td>
                    <td className="px-4 py-3 text-[#AAB3BD]">{short(d.recipient)}</td>
                    <td className="px-4 py-3 text-[#AAB3BD]">{fmtDate(d.document_date)}</td>
                    <td className="px-4 py-3 text-[#AAB3BD]">{fmtDate(d.uploaded_at)}</td>
                    <td className="px-4 py-3">
                      <div className="text-[#D8DCE0]">{d.storage_mode === "contractx_managed" ? "ContractX Vault" : "Customer Source"}</div>
                      <div className="mt-1 text-[10px] text-[#69747F]">Ownership: Customer</div>
                    </td>
                    <td className="px-4 py-3 uppercase text-[#AAB3BD]">{short(d.file_extension)}</td>
                    <td className="px-4 py-3">
                      <Pill tone={d.index_status === "ready" ? "green" : "amber"}>{short(d.index_status, "pending")}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-[170px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className={cx(
                                "h-full",
                                d.index_status === "ready"
                                  ? "bg-emerald-400"
                                  : d.index_status === "failed"
                                  ? "bg-rose-500"
                                  : "bg-[#D8A84E]"
                              )}
                              style={{ width: `${Math.min(100, Math.max(0, d.processing_percent || 0))}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-[#69747F]">
                            {d.processing_percent || 0}%
                          </span>
                        </div>

                        <div className="mt-1.5 text-[10px] text-[#69747F]">
                          {documentProcessingLabel(d)}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => deleteDocument(d)}
                        disabled={deletingDocumentId === d.id}
                        title="Delete document from ContractX Vault"
                        aria-label={`Delete ${d.file_name || "document"}`}
                        className="cx-delete-document inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-400/20 bg-rose-400/[0.055] text-sm font-black text-rose-200 transition hover:border-rose-400/40 hover:bg-rose-400/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {deletingDocumentId === d.id ? "…" : "×"}
                      </button>
                    </td>
                  </tr>
                ))}

                {!documents.length && (
                  <tr>
                    <td colSpan={12} className="px-6 py-16 text-center text-xs text-[#69747F]">
                      No documents match the current Vault filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] text-[#69747F]">
              Showing {total ? (page - 1) * 20 + 1 : 0}–{Math.min(page * 20, total)} of {total} documents
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-[#AAB3BD] disabled:opacity-30">
                Previous
              </button>

              {visiblePages.map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={cx(
                    "h-8 w-8 rounded-lg border text-[10px] font-bold",
                    page === n
                      ? "border-[#D8A84E]/50 bg-[#D8A84E]/15 text-[#E6C274]"
                      : "border-white/[0.08] text-[#AAB3BD]"
                  )}
                >
                  {n}
                </button>
              ))}

              {pages > 5 && <span className="text-[#69747F]">…</span>}

              <button disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-[#AAB3BD] disabled:opacity-30">
                Next
              </button>
            </div>
          </div>
        </section>

      </div>

      <div className="mt-8">
        <LegalFooter compact />
      </div>
    </main>
  );
}
