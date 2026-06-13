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

type SessionArtifactState = {
  panelOpen: boolean;
  payload: ArtifactPayload | null;
  activePath: string;
};

const emptyState = (): SessionArtifactState => ({
  panelOpen: false,
  payload: null,
  activePath: "",
});

type ArtifactContextValue = {
  getSessionState: (sessionKey: string) => SessionArtifactState;
  openArtifact: (sessionKey: string, payload: ArtifactPayload) => void;
  closePanel: (sessionKey: string) => void;
  setActivePath: (sessionKey: string, path: string) => void;
};

const ArtifactContext = createContext<ArtifactContextValue | null>(null);

export function ArtifactProvider({ children }: { children: ReactNode }) {
  const [bySession, setBySession] = useState<Record<string, SessionArtifactState>>({});

  const getSessionState = useCallback(
    (sessionKey: string): SessionArtifactState => bySession[sessionKey] ?? emptyState(),
    [bySession],
  );

  const openArtifact = useCallback((sessionKey: string, payload: ArtifactPayload) => {
    const firstPath = payload.files[0]?.path ?? "src/App.tsx";
    setBySession((current) => ({
      ...current,
      [sessionKey]: {
        panelOpen: true,
        payload,
        activePath: firstPath,
      },
    }));
  }, []);

  const closePanel = useCallback((sessionKey: string) => {
    setBySession((current) => {
      const prev = current[sessionKey] ?? emptyState();
      return {
        ...current,
        [sessionKey]: { ...prev, panelOpen: false },
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

  const value = useMemo(
    () => ({ getSessionState, openArtifact, closePanel, setActivePath }),
    [closePanel, getSessionState, openArtifact, setActivePath],
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
  const { getSessionState, openArtifact, closePanel, setActivePath } = useArtifactContext();
  const state = getSessionState(sessionKey);

  return {
    panelOpen: state.panelOpen,
    payload: state.payload,
    activePath: state.activePath,
    openArtifact: (payload: ArtifactPayload) => openArtifact(sessionKey, payload),
    closePanel: () => closePanel(sessionKey),
    setActivePath: (path: string) => setActivePath(sessionKey, path),
  };
}
