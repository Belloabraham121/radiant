import { BROWSING_PHRASES } from "./browsing";
import { CALLING_API_PHRASES } from "./calling_api";
import { DEFI_PHRASES } from "./defi";
import { PLAYFUL_PHRASES } from "./playful";
import { RESEARCHING_PHRASES } from "./researching";
import { THINKING_PHRASES } from "./thinking";
import { WAITING_PHRASES } from "./waiting";

/**
 * Rotating status phrases shown while Radiant is working.
 *
 * To add more: append strings to any category file in this folder, or add a
 * new category file and spread it into `AGENT_STATUS_PHRASE_CATEGORIES` below.
 */
export const AGENT_STATUS_PHRASE_CATEGORIES = {
  thinking: THINKING_PHRASES,
  researching: RESEARCHING_PHRASES,
  browsing: BROWSING_PHRASES,
  calling_api: CALLING_API_PHRASES,
  defi: DEFI_PHRASES,
  playful: PLAYFUL_PHRASES,
  waiting: WAITING_PHRASES,
} as const;

export type AgentStatusPhraseCategory = keyof typeof AGENT_STATUS_PHRASE_CATEGORIES;

/** Weighted blend — primary category dominates; playful adds variety. */
const CATEGORY_BLEND: Record<
  AgentStatusPhraseCategory,
  AgentStatusPhraseCategory[]
> = {
  thinking: ["thinking", "thinking", "thinking", "researching", "playful"],
  researching: ["researching", "researching", "researching", "thinking", "playful"],
  browsing: ["browsing", "browsing", "browsing", "researching", "playful"],
  calling_api: ["calling_api", "calling_api", "calling_api", "researching", "playful"],
  defi: ["defi", "defi", "defi", "waiting", "playful"],
  playful: ["playful", "playful", "thinking", "researching"],
  waiting: ["waiting", "waiting", "waiting", "defi", "playful"],
};

/** Phrases for a given agent phase (primary category + light mix-ins). */
export function getPhrasePoolForCategory(
  category: AgentStatusPhraseCategory,
): readonly string[] {
  const blend = CATEGORY_BLEND[category] ?? [category];
  return blend.flatMap((key) => [...AGENT_STATUS_PHRASE_CATEGORIES[key]]);
}

/** Flat list used by the rotator when no category is known. */
export const AGENT_STATUS_PHRASES: readonly string[] = Object.values(
  AGENT_STATUS_PHRASE_CATEGORIES,
).flat();

function shuffle<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Returns a shuffled copy of all phrases (no immediate repeats until the deck is exhausted). */
export function createPhraseDeck(category?: AgentStatusPhraseCategory): string[] {
  const pool = category ? getPhrasePoolForCategory(category) : AGENT_STATUS_PHRASES;
  return shuffle([...pool]);
}

export function pickRandomPhrase(
  exclude?: string,
  category?: AgentStatusPhraseCategory,
): string {
  const pool = category ? getPhrasePoolForCategory(category) : AGENT_STATUS_PHRASES;
  if (pool.length === 0) {
    return "Working…";
  }
  if (pool.length === 1) {
    return pool[0]!;
  }

  let phrase = pool[Math.floor(Math.random() * pool.length)]!;
  let guard = 0;
  while (phrase === exclude && guard < 8) {
    phrase = pool[Math.floor(Math.random() * pool.length)]!;
    guard += 1;
  }
  return phrase;
}
