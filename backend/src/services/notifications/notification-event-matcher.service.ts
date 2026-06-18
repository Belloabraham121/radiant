/** Match incoming event payloads against notification rule conditions (trigger_kind: event). */

const THRESHOLD_PREFIX = /^(min|max)_(.+)$/;

function numericCompare(
  actual: unknown,
  expected: unknown,
  op: "min" | "max",
): boolean {
  if (typeof expected !== "number" || Number.isNaN(expected)) {
    return false;
  }
  if (typeof actual !== "number" || Number.isNaN(actual)) {
    return false;
  }
  return op === "min" ? actual >= expected : actual <= expected;
}

function valuesEqual(expected: unknown, actual: unknown): boolean {
  if (expected === actual) {
    return true;
  }
  if (expected == null && actual == null) {
    return true;
  }
  if (typeof expected === "object" && typeof actual === "object" && expected && actual) {
    return JSON.stringify(expected) === JSON.stringify(actual);
  }
  return false;
}

/**
 * Returns true when event data satisfies a rule's condition filters.
 * - Empty condition matches any event of the type.
 * - `min_<field>` requires event[field] >= threshold (e.g. min_profit_bps → profit_bps).
 * - `max_<field>` requires event[field] <= threshold.
 * - Other keys require exact equality on event[key].
 */
export function matchesNotificationEventCondition(
  ruleCondition: Record<string, unknown>,
  eventData: Record<string, unknown>,
): boolean {
  const entries = Object.entries(ruleCondition);
  if (entries.length === 0) {
    return true;
  }

  for (const [key, expected] of entries) {
    const threshold = THRESHOLD_PREFIX.exec(key);
    if (threshold) {
      const op = threshold[1];
      const fieldName = threshold[2];
      if ((op !== "min" && op !== "max") || !fieldName) {
        return false;
      }
      const actual = eventData[fieldName] ?? eventData[key];
      if (!numericCompare(actual, expected, op)) {
        return false;
      }
      continue;
    }

    if (!(key in eventData)) {
      return false;
    }

    if (!valuesEqual(expected, eventData[key])) {
      return false;
    }
  }

  return true;
}
