"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArtifactPanel } from "@/components/app/ArtifactPanel";
import type { ArtifactPayload } from "@/lib/artifact-types";

const STORAGE_KEY = "radiant:artifact-panel-width";
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 300;
const MAX_WIDTH = 960;

function clampWidth(value: number): number {
  const max = Math.min(MAX_WIDTH, Math.round(window.innerWidth * 0.85));
  return Math.min(max, Math.max(MIN_WIDTH, Math.round(value)));
}

function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return clampWidth(DEFAULT_WIDTH);
  return clampWidth(parsed);
}

export function ResizableArtifactPanel({
  payload,
  activePath,
  onActivePathChange,
  onClose,
}: {
  payload: ArtifactPayload;
  activePath: string;
  onActivePathChange: (path: string) => void;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const widthRef = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    const stored = readStoredWidth();
    setWidth(stored);
    widthRef.current = stored;
  }, []);

  const persistWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    widthRef.current = clamped;
    setWidth(clamped);
    window.localStorage.setItem(STORAGE_KEY, String(clamped));
  }, []);

  const startResize = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = widthRef.current;

      function onMouseMove(moveEvent: MouseEvent) {
        const delta = startX - moveEvent.clientX;
        const next = clampWidth(startWidth + delta);
        widthRef.current = next;
        setWidth(next);
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        persistWidth(widthRef.current);
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [persistWidth],
  );

  const shellStyle = {
    "--artifact-panel-width": `${width}px`,
  } as CSSProperties;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 h-[52vh] w-full lg:relative lg:z-0 lg:h-full lg:shrink-0 lg:w-[var(--artifact-panel-width)]"
      style={shellStyle}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize artifact panel"
        title="Drag to resize"
        className="absolute -left-1 top-0 z-20 hidden h-full w-3 cursor-col-resize touch-none lg:block"
        onMouseDown={startResize}
      >
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[var(--hero-ink)]/10 transition-colors hover:bg-[var(--hero-ink)]/25" />
      </div>
      <ArtifactPanel
        payload={payload}
        activePath={activePath}
        onActivePathChange={onActivePathChange}
        onClose={onClose}
        className="h-full w-full"
      />
    </div>
  );
}
