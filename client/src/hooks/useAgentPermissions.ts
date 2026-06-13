"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuthMe } from "@/lib/auth-api";
import { ApiError } from "@/lib/api";
import {
  updateAgentPermissions,
  type AgentPermissions,
} from "@/lib/agent-permissions-api";

const DEFAULT_PERMISSIONS: AgentPermissions = {
  auto_approve_enabled: true,
  auto_approve_max_sui: 25,
  allow_flash_loans: false,
  auto_approve_flash_loans: false,
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
          setPermissions({
            ...DEFAULT_PERMISSIONS,
            ...me.agent_permissions,
          });
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
      setPermissions({ ...DEFAULT_PERMISSIONS, ...updated });
      return updated;
    } catch (err) {
      setPermissions(permissions);
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save agent permissions.",
      );
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
    setAllowFlashLoans: (enabled: boolean) =>
      savePermissions({
        allow_flash_loans: enabled,
        ...(enabled ? {} : { auto_approve_flash_loans: false }),
      }),
    setAutoApproveFlashLoans: (enabled: boolean) =>
      savePermissions({ auto_approve_flash_loans: enabled }),
  };
}
