"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ActiveProjectContext = {
  id: string;
  tenant_id: string;
  project_name: string;
  project_code?: string | null;
  status?: string | null;
  jurisdiction?: string | null;
  country?: string | null;
};

function readProjectIdFromUrl() {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const value = params.get("project");

  return value?.trim() || null;
}

export function useActiveProject() {
  const supabase = useMemo(() => createClient(), []);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);

  const [project, setProject] = useState<ActiveProjectContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const syncProjectId = () => {
      setProjectId(readProjectIdFromUrl());
      setUrlReady(true);
    };

    syncProjectId();

    window.addEventListener("popstate", syncProjectId);
    window.addEventListener("contractx-project-change", syncProjectId);

    return () => {
      window.removeEventListener("popstate", syncProjectId);
      window.removeEventListener("contractx-project-change", syncProjectId);
    };
  }, []);

  useEffect(() => {
    if (!urlReady) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setProject(null);

      try {
        if (!projectId) {
          throw new Error(
            "No project selected. Open the project from Portfolio."
          );
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error(
            "Authenticated session could not be verified."
          );
        }

        const membership = await supabase
          .from("project_users")
          .select("project_id,status")
          .eq("project_id", projectId)
          .eq("user_id", user.id)
          .eq("status", "ACTIVE")
          .maybeSingle();

        if (membership.error) {
          throw new Error(membership.error.message);
        }

        if (!membership.data) {
          throw new Error(
            "You do not have active access to this project."
          );
        }

        // IMPORTANT:
        // Only select columns confirmed to exist in the live projects table.
        // stakeholder_role is intentionally NOT selected here.
        const result = await supabase
          .from("projects")
          .select(
            "id,tenant_id,project_name,project_code,status,jurisdiction,country"
          )
          .eq("id", projectId)
          .single();

        if (result.error || !result.data) {
          throw new Error(
            result.error?.message || "Project not found."
          );
        }

        if (!cancelled) {
          setProject(result.data as ActiveProjectContext);
        }
      } catch (err) {
        if (!cancelled) {
          setProject(null);
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load project."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId, supabase, urlReady]);

  return {
    projectId,
    project,
    tenantId: project?.tenant_id || "",
    loading,
    error,
  };
}
