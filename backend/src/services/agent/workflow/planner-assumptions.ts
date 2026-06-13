import type { PlannerAssumption } from "./planner.types.js";

function pickString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

export function normalizePlannerAssumption(raw: unknown): PlannerAssumption | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const interpreted = pickString(
    record,
    "interpreted",
    "interpretation",
    "meaning",
    "resolved",
    "value",
  );
  const from_phrase = pickString(
    record,
    "from_phrase",
    "from",
    "phrase",
    "source",
    "original",
    "original_text",
    "original_phrase",
    "user_phrase",
  );

  if (!interpreted || !from_phrase) {
    return null;
  }

  const field = pickString(record, "field", "slot", "param", "key") ?? "intent";

  return { field, interpreted, from_phrase };
}

export function normalizePlannerAssumptions(raw: unknown): PlannerAssumption[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const assumptions: PlannerAssumption[] = [];
  for (const item of raw) {
    const normalized = normalizePlannerAssumption(item);
    if (normalized) {
      assumptions.push(normalized);
    }
  }
  return assumptions;
}

export function isValidPlannerAssumption(assumption: PlannerAssumption): boolean {
  return normalizePlannerAssumption(assumption) !== null;
}
