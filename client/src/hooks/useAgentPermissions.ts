"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuthMe } from "@/lib/auth-api";
import {
  updateAgentPermissions,
  type AgentPermissions,
} from "@/lib/agent-permissions-api";

const DEFAULT_PERMISSIONS: AgentPermissions = {
  auto_approve_enabled: true,
  auto_approve_max_sui: 25,
};

export function useAgentPermissions(authenticated: boolean) {
  const [permissions, setPermissions] = useState<AgentPermissions>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let cancelled = false;

    async function loadPermissions() {
      setLoading(true);
      setError(null);
      try {
        const me = await fetchAuthMe();
        if (!cancelled && me.agent_permissions) {
          setPermissions(me.agent_permissions);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load agent permissions.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPermissions();

    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  const effectivePermissions = authenticated ? permissions : DEFAULT_PERMISSIONS;
  const effectiveLoading = authenticated && loading;

  const savePermissions = useCallback(async (patch: Partial<AgentPermissions>) => {
    setSaving(true);
    setError(null);
    const optimistic = { ...permissions, ...patch };
    setPermissions(optimistic);

    try {
      const updated = await updateAgentPermissions(patch);
      setPermissions(updated);
      return updated;
    } catch {
      setPermissions(permissions);
      setError("Could not save agent permissions.");
      return null;
    } finally {
      setSaving(false);
    }
  }, [permissions]);

  return {
    permissions: effectivePermissions,
    loading: effectiveLoading,
    saving,
    error,
    setAutoApproveEnabled: (enabled: boolean) => savePermissions({ auto_approve_enabled: enabled }),
    setAutoApproveMaxSui: (maxSui: number) => savePermissions({ auto_approve_max_sui: maxSui }),
  };
}
