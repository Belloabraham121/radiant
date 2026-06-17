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
  allow_governance: false,
  allow_margin: false,
  allow_predict: false,
};

/**
 * @param fetchEnabled — when true (e.g. accordion open), loads permissions from the server.
 */
export function useAgentPermissions(authenticated: boolean, fetchEnabled = false) {
  const [permissions, setPermissions] = useState<AgentPermissions>(DEFAULT_PERMISSIONS);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated || !fetchEnabled || loaded) {
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
        if (!cancelled) {
          setLoaded(true);
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
  }, [authenticated, fetchEnabled, loaded]);

  const effectivePermissions = authenticated ? permissions : DEFAULT_PERMISSIONS;
  const controlsDisabled = authenticated && (loading || saving || !loaded);

  const savePermissions = useCallback(async (patch: Partial<AgentPermissions>) => {
    if (!loaded) return null;

    setSaving(true);
    setError(null);
    const previous = permissions;
    const optimistic = { ...permissions, ...patch };
    setPermissions(optimistic);

    try {
      const updated = await updateAgentPermissions(patch);
      setPermissions({ ...DEFAULT_PERMISSIONS, ...updated });
      return updated;
    } catch (err) {
      setPermissions(previous);
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save agent permissions.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  }, [loaded, permissions]);

  return {
    permissions: effectivePermissions,
    loaded: authenticated && loaded,
    loading: authenticated && loading,
    saving,
    controlsDisabled,
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
    setAllowGovernance: (enabled: boolean) =>
      savePermissions({ allow_governance: enabled }),
    setAllowMargin: (enabled: boolean) =>
      savePermissions({ allow_margin: enabled }),
    setAllowPredict: (enabled: boolean) =>
      savePermissions({ allow_predict: enabled }),
  };
}
