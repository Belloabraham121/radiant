import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import {
  findAgentMemoryByUserId,
  upsertAgentMemory,
} from "./agent-memory.repository.js";
import type {
  AgentMemoryData,
  AgentMemoryFact,
  UpdateMemoryInput,
  UpdateMemoryResult,
} from "./agent-memory.types.js";
import { updateMemoryInputSchema } from "./agent-memory.types.js";

const MAX_FACTS = 50;
const MAX_FACT_VALUE_LENGTH = 240;

const BLOCKED_MEMORY_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous\s+)?instructions/i,
  /always\s+auto[- ]?approve/i,
  /disregard\s+(the\s+)?(rules|instructions|approval)/i,
  /you\s+(must|should)\s+(always|never)/i,
  /^system\s*:/i,
  /override\s+(security|approval|policy)/i,
];

function sanitizeMemoryValue(raw: string): string {
  const trimmed = raw.trim().slice(0, MAX_FACT_VALUE_LENGTH);
  return trimmed.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function isBlockedMemoryContent(value: string): boolean {
  return BLOCKED_MEMORY_PATTERNS.some((pattern) => pattern.test(value));
}

export function emptyAgentMemoryData(): AgentMemoryData {
  return { preferences: {}, facts: [] };
}

function parseAgentMemoryData(raw: unknown): AgentMemoryData {
  if (!raw || typeof raw !== "object") {
    return emptyAgentMemoryData();
  }

  const record = raw as Record<string, unknown>;
  const preferences =
    record.preferences && typeof record.preferences === "object"
      ? (record.preferences as AgentMemoryData["preferences"])
      : {};

  const facts = Array.isArray(record.facts)
    ? record.facts
        .filter(
          (fact): fact is AgentMemoryFact =>
            typeof fact === "object" &&
            fact !== null &&
            typeof (fact as AgentMemoryFact).key === "string" &&
            typeof (fact as AgentMemoryFact).value === "string",
        )
        .slice(0, MAX_FACTS)
    : [];

  return { preferences, facts };
}

async function requireUserId(privyUserId: string): Promise<bigint> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User profile not found.");
  }
  return user.id;
}

export async function loadAgentMemory(privyUserId: string): Promise<AgentMemoryData> {
  const userId = await requireUserId(privyUserId);
  const row = await findAgentMemoryByUserId(userId);
  if (!row) return emptyAgentMemoryData();
  return parseAgentMemoryData(row.data);
}

export function formatMemoryBlock(data: AgentMemoryData): string {
  if (data.facts.length === 0 && !data.preferences.default_chain_id) {
    return "";
  }

  return JSON.stringify(
    {
      type: "user_memory_data",
      preferences: data.preferences,
      facts: data.facts.map(({ key, value }) => ({ key, value })),
    },
    null,
    0,
  );
}

export function mergeAgentMemoryData(
  current: AgentMemoryData,
  input: UpdateMemoryInput,
): AgentMemoryData {
  const next: AgentMemoryData = {
    preferences: { ...current.preferences },
    facts: [...current.facts],
  };

  if (input.default_chain_id) {
    next.preferences.default_chain_id = input.default_chain_id;
  }

  for (const factInput of input.facts ?? []) {
    const key = factInput.key.trim();
    if (!key) continue;

    if (factInput.action === "remove") {
      next.facts = next.facts.filter((fact) => fact.key !== key);
      continue;
    }

    const value = sanitizeMemoryValue(factInput.value?.trim() ?? "");
    if (isBlockedMemoryContent(value)) {
      throw new AppError(
        400,
        "MEMORY_CONTENT_BLOCKED",
        `Memory value for "${key}" contains disallowed instruction-like content.`,
      );
    }
    const updatedAt = new Date().toISOString();
    const existingIndex = next.facts.findIndex((fact) => fact.key === key);

    if (existingIndex >= 0) {
      next.facts[existingIndex] = { key, value, updated_at: updatedAt };
    } else {
      next.facts.push({ key, value, updated_at: updatedAt });
    }
  }

  if (next.facts.length > MAX_FACTS) {
    next.facts = next.facts
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, MAX_FACTS);
  }

  return next;
}

function summarizeUpdate(input: UpdateMemoryInput): string {
  const parts: string[] = [];
  if (input.default_chain_id) {
    parts.push(`default chain → ${input.default_chain_id}`);
  }

  for (const fact of input.facts ?? []) {
    if (fact.action === "remove") {
      parts.push(`removed ${fact.key}`);
    } else {
      parts.push(`set ${fact.key}`);
    }
  }

  return parts.length > 0 ? parts.join("; ") : "no changes";
}

export async function updateAgentMemory(
  privyUserId: string,
  rawInput: UpdateMemoryInput,
): Promise<UpdateMemoryResult> {
  const input = updateMemoryInputSchema.parse(rawInput);
  const userId = await requireUserId(privyUserId);
  const current = await loadAgentMemory(privyUserId);
  const merged = mergeAgentMemoryData(current, input);

  if (
    !input.default_chain_id &&
    (!input.facts || input.facts.length === 0)
  ) {
    return {
      status: "updated",
      summary: "no changes",
      data: current,
    };
  }

  await upsertAgentMemory(userId, merged);

  return {
    status: "updated",
    summary: summarizeUpdate(input),
    data: merged,
  };
}
