"use client";

import { useEffect, useRef, useState } from "react";
import {
  createPhraseDeck,
  pickRandomPhrase,
  type AgentStatusPhraseCategory,
} from "@/lib/agent-status-phrases";

const DEFAULT_INTERVAL_MS = 2400;

export function useRotatingStatusPhrase(
  active: boolean,
  category: AgentStatusPhraseCategory = "thinking",
  intervalMs = DEFAULT_INTERVAL_MS,
): string {
  const deckRef = useRef<string[]>([]);
  const deckIndexRef = useRef(0);
  const categoryRef = useRef(category);
  const [phrase, setPhrase] = useState(() => pickRandomPhrase(undefined, category));

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

  useEffect(() => {
    if (!active) {
      return;
    }

    deckRef.current = createPhraseDeck(category);
    deckIndexRef.current = 0;
    setPhrase(pickRandomPhrase(undefined, category));

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      return;
    }

    const id = window.setInterval(() => {
      const activeCategory = categoryRef.current;

      if (
        deckRef.current.length === 0 ||
        deckIndexRef.current >= deckRef.current.length
      ) {
        deckRef.current = createPhraseDeck(activeCategory);
        deckIndexRef.current = 0;
      }

      const next = deckRef.current[deckIndexRef.current]!;
      deckIndexRef.current += 1;
      setPhrase(next);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [active, category, intervalMs]);

  return phrase;
}
