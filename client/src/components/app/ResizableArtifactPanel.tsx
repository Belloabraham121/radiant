"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArtifactPanel } from "@/components/app/ArtifactPanel";
import type { ArtifactPayload } from "@/lib/artifact-types";

const STORAGE_KEY = "radiant:artifact-panel-width";
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 300;
const MAX_WIDTH = 960;

function clampWidth(value: number): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
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

function clearDocumentDragStyles() {
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  document.body.style.pointerEvents = "";
}

export function ResizableArtifactPanel({
  payload,
  activePath,
  streaming,
  sessionId,
  onActivePathChange,
  onPayloadChange,
  onClose,
}: {
  payload: ArtifactPayload;
  activePath: string;
  streaming?: boolean;
  sessionId?: string;
  onActivePathChange: (path: string) => void;
  onPayloadChange: (payload: ArtifactPayload) => void;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(() => readStoredWidth());
  const widthRef = useRef(width);
  const handleRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const stopDragging = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    clearDocumentDragStyles();
  }, []);

  useEffect(() => {
    return () => {
      stopDragging();
    };
  }, [stopDragging]);

  const persistWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    widthRef.current = clamped;
    setWidth(clamped);
    window.localStorage.setItem(STORAGE_KEY, String(clamped));
  }, []);

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      stopDragging();

      const handle = handleRef.current;
      if (!handle) return;

      handle.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth = widthRef.current;
      const pointerId = event.pointerId;

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        moveEvent.preventDefault();
        const delta = startX - moveEvent.clientX;
        const next = clampWidth(startWidth + delta);
        widthRef.current = next;
        setWidth(next);
      };

      const onPointerEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        persistWidth(widthRef.current);
        stopDragging();
      };

      const cleanup = () => {
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerEnd);
        handle.removeEventListener("pointercancel", onPointerEnd);
        handle.removeEventListener("lostpointercapture", onPointerEnd);
        try {
          if (handle.hasPointerCapture(pointerId)) {
            handle.releasePointerCapture(pointerId);
          }
        } catch {
          // Pointer may already be released after unmount.
        }
        clearDocumentDragStyles();
      };

      cleanupRef.current = cleanup;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerEnd);
      handle.addEventListener("pointercancel", onPointerEnd);
      handle.addEventListener("lostpointercapture", onPointerEnd);
    },
    [persistWidth, stopDragging],
  );

  const shellStyle = {
    "--artifact-panel-width": `${width}px`,
  } as CSSProperties;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 h-[52vh] w-full lg:relative lg:z-0 lg:h-full lg:max-w-[85vw] lg:shrink-0 lg:w-[var(--artifact-panel-width)]"
      style={shellStyle}
    >
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize artifact panel"
        title="Drag to resize"
        className="absolute -left-1 top-0 z-20 hidden h-full w-3 cursor-col-resize touch-none select-none lg:block"
        onPointerDown={startResize}
      >
        <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[var(--hero-ink)]/10 transition-colors hover:bg-[var(--hero-ink)]/25" />
      </div>
      <ArtifactPanel
        payload={payload}
        activePath={activePath}
        streaming={streaming}
        sessionId={sessionId}
        onActivePathChange={onActivePathChange}
        onPayloadChange={onPayloadChange}
        onClose={onClose}
        className="h-full w-full"
      />
    </div>
  );
}
