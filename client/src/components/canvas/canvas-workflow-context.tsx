"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import type { CanvasBuildConfig } from "@/lib/canvas-api";
import {
  createCanvasWorkflow,
  getCanvasWorkflow,
  listCanvasWorkflows,
  patchCanvasWorkflowBuildConfig,
  patchCanvasWorkflowTesterConfig,
  type CanvasWorkflowDetail,
  type CanvasWorkflowListItem,
} from "@/lib/canvas-api";
import { ApiError } from "@/lib/api";
import { useFeatureFlags } from "@/lib/feature-flags-context";

/** Wait for Privy session + auth/me (CSRF + user row) before canvas API calls. */
function useCanvasApiReady(): {
  ready: boolean;
  waiting: boolean;
} {
  const { ready: privyReady, authenticated } = usePrivy();
  const { features, loaded: featuresLoaded } = useFeatureFlags();
  const canvasEnabled = features.canvas;
  const waiting =
    privyReady && authenticated && canvasEnabled && !featuresLoaded;
  const ready =
    privyReady && authenticated && featuresLoaded && canvasEnabled;
  return { ready, waiting };
}

type CanvasWorkflowsContextValue = {
  workflows: CanvasWorkflowListItem[];
  loading: boolean;
  error: string | null;
  refreshWorkflows: (opts?: { silent?: boolean }) => Promise<void>;
  createWorkflow: (name?: string) => Promise<CanvasWorkflowDetail>;
};

const CanvasWorkflowsContext = createContext<CanvasWorkflowsContextValue | null>(null);

export function CanvasWorkflowsProvider({ children }: { children: ReactNode }) {
  const [workflows, setWorkflows] = useState<CanvasWorkflowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { ready: apiReady, waiting } = useCanvasApiReady();
  const router = useRouter();

  const refreshWorkflows = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!apiReady) {
        if (!opts?.silent) setLoading(waiting);
        return;
      }
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const data = await listCanvasWorkflows();
        setWorkflows(data.workflows);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load workflows");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [apiReady, waiting],
  );

  useEffect(() => {
    let cancelled = false;

    if (!apiReady) {
      setLoading(waiting);
      if (!waiting) {
        setWorkflows([]);
        setError(null);
      }
      return () => {
        cancelled = true;
      };
    }

    async function loadWorkflows() {
      setLoading(true);
      setError(null);
      try {
        const data = await listCanvasWorkflows();
        if (!cancelled) setWorkflows(data.workflows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load workflows");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkflows();
    return () => {
      cancelled = true;
    };
  }, [apiReady, waiting]);

  const createWorkflow = useCallback(
    async (name?: string) => {
      const created = await createCanvasWorkflow(name ? { name } : undefined);
      await refreshWorkflows({ silent: true });
      router.push(`/app/canvas/${created.id}`);
      return created;
    },
    [refreshWorkflows, router],
  );

  const value = useMemo(
    () => ({
      workflows,
      loading,
      error,
      refreshWorkflows,
      createWorkflow,
    }),
    [workflows, loading, error, refreshWorkflows, createWorkflow],
  );

  return (
    <CanvasWorkflowsContext.Provider value={value}>{children}</CanvasWorkflowsContext.Provider>
  );
}

export function useCanvasWorkflows(): CanvasWorkflowsContextValue {
  const ctx = useContext(CanvasWorkflowsContext);
  if (!ctx) {
    throw new Error("useCanvasWorkflows must be used within CanvasWorkflowsProvider");
  }
  return ctx;
}

type ActiveWorkflowContextValue = {
  workflow: CanvasWorkflowDetail | null;
  loading: boolean;
  error: string | null;
  buildConfig: CanvasBuildConfig;
  testerConfig: CanvasBuildConfig;
  setBuildConfig: (config: CanvasBuildConfig) => Promise<void>;
  setTesterConfig: (config: CanvasBuildConfig) => Promise<void>;
  refreshWorkflow: () => Promise<void>;
  dryRunReady: boolean;
  setDryRunReady: (ready: boolean) => void;
  buildLog: string[];
  appendBuildLog: (line: string) => void;
  clearBuildLog: () => void;
  dryRunLog: string[];
  appendDryRunLog: (line: string) => void;
  clearDryRunLog: () => void;
};

const ActiveWorkflowContext = createContext<ActiveWorkflowContextValue | null>(null);

export function ActiveCanvasWorkflowProvider({
  workflowId,
  children,
}: {
  workflowId: string;
  children: ReactNode;
}) {
  const [workflow, setWorkflow] = useState<CanvasWorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dryRunReady, setDryRunReady] = useState(false);
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const [dryRunLog, setDryRunLog] = useState<string[]>([]);

  const buildConfig = useMemo(
    (): CanvasBuildConfig =>
      workflow?.build_config ?? { model_tier: "lite", provider: "openai" },
    [workflow?.build_config],
  );

  const testerConfig = useMemo(
    (): CanvasBuildConfig =>
      workflow?.tester_config ?? { model_tier: "lite", provider: "openai" },
    [workflow?.tester_config],
  );

  const { ready: apiReady, waiting } = useCanvasApiReady();

  const refreshWorkflow = useCallback(async () => {
    if (!apiReady) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCanvasWorkflow(workflowId);
      setWorkflow(data);
      setDryRunReady(data.status === "dry_run_ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load workflow");
    } finally {
      setLoading(false);
    }
  }, [apiReady, workflowId]);

  useEffect(() => {
    let cancelled = false;

    if (!apiReady) {
      setLoading(waiting);
      if (!waiting) {
        setWorkflow(null);
        setError(null);
      }
      return () => {
        cancelled = true;
      };
    }

    async function loadWorkflow() {
      setLoading(true);
      setError(null);
      try {
        const data = await getCanvasWorkflow(workflowId);
        if (!cancelled) {
          setWorkflow(data);
          setDryRunReady(data.status === "dry_run_ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load workflow");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkflow();
    return () => {
      cancelled = true;
    };
  }, [apiReady, waiting, workflowId]);

  const setBuildConfig = useCallback(
    async (config: CanvasBuildConfig) => {
      const updated = await patchCanvasWorkflowBuildConfig(workflowId, config);
      setWorkflow(updated);
    },
    [workflowId],
  );

  const setTesterConfig = useCallback(
    async (config: CanvasBuildConfig) => {
      const updated = await patchCanvasWorkflowTesterConfig(workflowId, config);
      setWorkflow(updated);
    },
    [workflowId],
  );

  const appendBuildLog = useCallback((line: string) => {
    setBuildLog((prev) => [...prev, line]);
  }, []);

  const clearBuildLog = useCallback(() => setBuildLog([]), []);

  const appendDryRunLog = useCallback((line: string) => {
    setDryRunLog((prev) => [...prev, line]);
  }, []);

  const clearDryRunLog = useCallback(() => setDryRunLog([]), []);

  const value = useMemo(
    () => ({
      workflow,
      loading,
      error,
      buildConfig,
      testerConfig,
      setBuildConfig,
      setTesterConfig,
      refreshWorkflow,
      dryRunReady,
      setDryRunReady,
      buildLog,
      appendBuildLog,
      clearBuildLog,
      dryRunLog,
      appendDryRunLog,
      clearDryRunLog,
    }),
    [
      workflow,
      loading,
      error,
      buildConfig,
      testerConfig,
      setBuildConfig,
      setTesterConfig,
      refreshWorkflow,
      dryRunReady,
      setDryRunReady,
      buildLog,
      appendBuildLog,
      clearBuildLog,
      dryRunLog,
      appendDryRunLog,
      clearDryRunLog,
    ],
  );

  return (
    <ActiveWorkflowContext.Provider value={value}>{children}</ActiveWorkflowContext.Provider>
  );
}

export function useActiveCanvasWorkflow(): ActiveWorkflowContextValue {
  const ctx = useContext(ActiveWorkflowContext);
  if (!ctx) {
    throw new Error("useActiveCanvasWorkflow must be used within ActiveCanvasWorkflowProvider");
  }
  return ctx;
}

export function useMarkDryRunReady() {
  return useActiveCanvasWorkflow().setDryRunReady;
}
