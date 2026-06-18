import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";
import type { ToolCallRecord } from "../agent.types.js";
import { CREATE_NOTIFICATION_RULE_TOOL_NAME } from "../../notifications/notification-rules.tool.js";
import { runCreateNotificationRuleTool } from "../../notifications/notification-rules.tool.js";

export type ScheduledReminderIntent = {
  in_seconds: number;
  message: string;
  label: string;
};

const RESEARCH_OR_MANAGE_PATTERN =
  /\b(how do i|how to|what is|explain|list my|show my|delete|cancel|remove)\b/i;

const RELATIVE_REMINDER_PATTERN =
  /\bremind(?:\s+me)?\s+in\s+(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b(?:\s+(?:to|about|that|for)\s+(.+))?/i;

function normalizeDelayUnit(unit: string): number {
  const normalized = unit.toLowerCase();
  if (/^s(ec(ond)?s?)?$/.test(normalized)) {
    return 1;
  }
  if (/^m(in(ute)?s?)?$/.test(normalized)) {
    return 60;
  }
  if (/^h(our(s)?)?$/.test(normalized)) {
    return 3600;
  }
  return 1;
}

function formatDelay(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}

function truncateLabel(value: string, max = 120): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export function extractScheduledReminderIntent(message: string): ScheduledReminderIntent | null {
  const trimmed = message.trim();
  if (!trimmed || RESEARCH_OR_MANAGE_PATTERN.test(trimmed)) {
    return null;
  }

  const match = RELATIVE_REMINDER_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  const in_seconds = amount * normalizeDelayUnit(match[2]);
  if (in_seconds > 86_400) {
    return null;
  }

  const rawMessage = match[3]?.trim().replace(/[.!?]+$/, "") || "Reminder";
  const messageText = rawMessage.length > 0 ? rawMessage : "Reminder";

  return {
    in_seconds,
    message: messageText,
    label: truncateLabel(messageText),
  };
}

function isSuccessfulCreateReminderResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    !("error" in result) &&
    "id" in result &&
    typeof (result as { id?: unknown }).id === "string"
  );
}

export function hasSuccessfulCreateReminderRule(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some(
    (call) =>
      call.name === CREATE_NOTIFICATION_RULE_TOOL_NAME &&
      isSuccessfulCreateReminderResult(call.result),
  );
}

async function createScheduledReminderRule(
  privyUserId: string,
  intent: ScheduledReminderIntent,
  sessionId: string,
): Promise<{ toolCall: ToolCallRecord; reply: string } | null> {
  let result: unknown;
  try {
    result = await runCreateNotificationRuleTool(
      privyUserId,
      {
        notification_type: "radiant.platform.scheduled_reminder",
        condition: { message: intent.message },
        schedule: { kind: "once", in_seconds: intent.in_seconds },
        label: intent.label,
        trigger_once: true,
        channels: ["in_app"],
      },
      { sessionId },
    );
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      toolCall: {
        name: CREATE_NOTIFICATION_RULE_TOOL_NAME,
        result: {
          error: {
            code: mapped instanceof AppError ? mapped.code : "CREATE_REMINDER_FAILED",
            message: mapped instanceof AppError ? mapped.message : String(mapped),
          },
        },
      },
      reply:
        mapped instanceof AppError
          ? mapped.message
          : "I couldn't set that reminder — please try again.",
    };
  }

  if (!isSuccessfulCreateReminderResult(result)) {
    return null;
  }

  const delayLabel = formatDelay(intent.in_seconds);
  return {
    toolCall: {
      name: CREATE_NOTIFICATION_RULE_TOOL_NAME,
      result,
    },
    reply: `Done — I set a reminder for **${intent.message}** in **${delayLabel}**.`,
  };
}

/** Deterministic path for "remind me in N seconds/minutes" — bypasses LLM hand-waving. */
export async function tryCreateScheduledReminderFromMessage(
  privyUserId: string,
  message: string,
  sessionId: string,
): Promise<{ reply: string; tool_calls: ToolCallRecord[]; pending_transaction: null } | null> {
  const intent = extractScheduledReminderIntent(message);
  if (!intent) {
    return null;
  }

  const outcome = await createScheduledReminderRule(
    privyUserId,
    intent,
    sessionId,
  );
  if (!outcome) {
    return null;
  }

  return {
    reply: outcome.reply,
    tool_calls: [outcome.toolCall],
    pending_transaction: null,
  };
}

/** After an LLM turn, create the rule if the agent claimed success without calling the tool. */
export async function applyScheduledReminderFallback(
  privyUserId: string,
  message: string,
  sessionId: string,
  toolCalls: ToolCallRecord[],
  reply: string,
): Promise<{ toolCalls: ToolCallRecord[]; reply: string }> {
  if (hasSuccessfulCreateReminderRule(toolCalls)) {
    return { toolCalls, reply };
  }

  const intent = extractScheduledReminderIntent(message);
  if (!intent) {
    return { toolCalls, reply };
  }

  const outcome = await createScheduledReminderRule(
    privyUserId,
    intent,
    sessionId,
  );
  if (!outcome) {
    return { toolCalls, reply };
  }

  return {
    toolCalls: [...toolCalls, outcome.toolCall],
    reply: outcome.reply,
  };
}
