"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ArtifactPayload } from "@/lib/artifact-types";
import { mergeArtifactPayload, normalizeArtifactPayload } from "@/lib/artifact-merge";

type SessionArtifactState = {
  panelOpen: boolean;
  payload: ArtifactPayload | null;
  activePath: string;
  streaming: boolean;
  userDismissed: boolean;
};

const emptyState = (): SessionArtifactState => ({
  panelOpen: false,
  payload: null,
  activePath: "",
  streaming: false,
  userDismissed: false,
});

type UpdateArtifactOptions = {
  streaming?: boolean;
  open?: boolean;
  activePath?: string;
};

type ArtifactContextValue = {
  getSessionState: (sessionKey: string) => SessionArtifactState;
  openArtifact: (sessionKey: string, payload: ArtifactPayload) => void;
  updateArtifact: (sessionKey: string, payload: ArtifactPayload, options?: UpdateArtifactOptions) => void;
  closePanel: (sessionKey: string) => void;
  setActivePath: (sessionKey: string, path: string) => void;
  setArtifactStreaming: (sessionKey: string, streaming: boolean) => void;
  migrateArtifactSession: (fromKey: string, toKey: string) => void;
};

const ArtifactContext = createContext<ArtifactContextValue | null>(null);

function pickActivePath(payload: ArtifactPayload, preferred?: string): string {
  if (preferred && payload.files.some((file) => file.path === preferred)) {
    return preferred;
  }
  const appPath =
    payload.files.find((file) => file.path === "app/page.tsx")?.path ??
    payload.files.find((file) => file.path === "src/App.tsx")?.path ??
    payload.files.find((file) => file.path === "src/App.jsx")?.path;
  return appPath ?? payload.files[0]?.path ?? "app/page.tsx";
}

export function ArtifactProvider({ children }: { children: ReactNode }) {
  const [bySession, setBySession] = useState<Record<string, SessionArtifactState>>({});

  const getSessionState = useCallback(
    (sessionKey: string): SessionArtifactState => bySession[sessionKey] ?? emptyState(),
    [bySession],
  );

  const openArtifact = useCallback((sessionKey: string, payload: ArtifactPayload) => {
    const normalized = normalizeArtifactPayload(payload);
    const firstPath = pickActivePath(normalized);
    setBySession((current) => ({
      ...current,
      [sessionKey]: {
        panelOpen: true,
        payload: normalized,
        activePath: firstPath,
        streaming: false,
        userDismissed: false,
      },
    }));
  }, []);

  const updateArtifact = useCallback(
    (sessionKey: string, payload: ArtifactPayload, options: UpdateArtifactOptions = {}) => {
      setBySession((current) => {
        const prev = current[sessionKey] ?? emptyState();
        const merged = mergeArtifactPayload(prev.payload, payload);
        const streaming = options.streaming ?? prev.streaming;
        const activePath = pickActivePath(merged, options.activePath ?? prev.activePath);

        let panelOpen = prev.panelOpen;
        let userDismissed = prev.userDismissed;
        if (options.open === true) {
          panelOpen = true;
          userDismissed = false;
        } else if (options.open === false) {
          panelOpen = false;
        }

        return {
          ...current,
          [sessionKey]: {
            panelOpen,
            payload: merged,
            activePath,
            streaming,
            userDismissed,
          },
        };
      });
    },
    [],
  );

  const closePanel = useCallback((sessionKey: string) => {
    setBySession((current) => {
      const prev = current[sessionKey] ?? emptyState();
      return {
        ...current,
        [sessionKey]: {
          ...prev,
          panelOpen: false,
          streaming: false,
          userDismissed: true,
        },
      };
    });
  }, []);

  const setActivePath = useCallback((sessionKey: string, path: string) => {
    setBySession((current) => {
      const prev = current[sessionKey] ?? emptyState();
      return {
        ...current,
        [sessionKey]: { ...prev, activePath: path },
      };
    });
  }, []);

  const setArtifactStreaming = useCallback((sessionKey: string, streaming: boolean) => {
    setBySession((current) => {
      const prev = current[sessionKey] ?? emptyState();
      return {
        ...current,
        [sessionKey]: { ...prev, streaming },
      };
    });
  }, []);

  const migrateArtifactSession = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setBySession((current) => {
      const fromState = current[fromKey];
      if (!fromState?.payload) return current;
      const toState = current[toKey] ?? emptyState();
      return {
        ...current,
        [toKey]: {
          ...fromState,
          panelOpen: fromState.panelOpen || toState.panelOpen,
          streaming: false,
          userDismissed: fromState.userDismissed && !fromState.panelOpen,
        },
        [fromKey]: emptyState(),
      };
    });
  }, []);

  const value = useMemo(
    () => ({
      getSessionState,
      openArtifact,
      updateArtifact,
      closePanel,
      setActivePath,
      setArtifactStreaming,
      migrateArtifactSession,
    }),
    [
      closePanel,
      getSessionState,
      migrateArtifactSession,
      openArtifact,
      setActivePath,
      setArtifactStreaming,
      updateArtifact,
    ],
  );

  return <ArtifactContext.Provider value={value}>{children}</ArtifactContext.Provider>;
}

export function useArtifactContext(): ArtifactContextValue {
  const context = useContext(ArtifactContext);
  if (!context) {
    throw new Error("useArtifactContext must be used within ArtifactProvider");
  }
  return context;
}

export function useArtifactSession(sessionKey: string) {
  const {
    getSessionState,
    openArtifact,
    updateArtifact,
    closePanel,
    setActivePath,
    setArtifactStreaming,
    migrateArtifactSession,
  } = useArtifactContext();
  const state = getSessionState(sessionKey);

  return {
    panelOpen: state.panelOpen,
    payload: state.payload,
    activePath: state.activePath,
    streaming: state.streaming,
    openArtifact: (payload: ArtifactPayload) => openArtifact(sessionKey, payload),
    updateArtifact: (payload: ArtifactPayload, options?: UpdateArtifactOptions) =>
      updateArtifact(sessionKey, payload, options),
    setArtifactStreaming: (streaming: boolean) => setArtifactStreaming(sessionKey, streaming),
    migrateArtifactSession: (fromKey: string, toKey: string) =>
      migrateArtifactSession(fromKey, toKey),
    closePanel: () => closePanel(sessionKey),
    setActivePath: (path: string) => setActivePath(sessionKey, path),
  };
}
