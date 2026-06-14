import { AppError } from "../../errors/app-error.js";
import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import type { PendingTransaction, ToolCallRecord } from "../agent/agent.types.js";
import {
  messageHasBuildAppIntent,
  messageRequestsSaveToProjects,
} from "../agent/workflow/workflow-parser.js";
import { generateAppForUser } from "./generate-app.service.js";
import { GENERATE_APP_TOOL_NAME } from "./generate-app.tool.js";
import type { AppTemplate } from "./project.types.js";

export type BuildAppOutcome = {
  reply: string;
  tool_calls: ToolCallRecord[];
  pending_transaction: PendingTransaction | null;
};

const SWAP_DEX_PAGE_TSX = `"use client";

import "../lib/radiant-agent-runtime";
import DexApp from "../components/DexApp";

export default function Page() {
  return <DexApp />;
}
`;

function inferBuildAppTemplate(message: string): AppTemplate {
  if (/\bescrow\b/i.test(message)) return "escrow";
  if (/\bprediction\b/i.test(message) && /\bapp\b/i.test(message)) return "prediction";
  if (
    /\b(deepbook|uniswap|dex|swap\s+app|flash\s+loan|stake|governance|open\s+orders?|tabs?\s+for)\b/i.test(
      message,
    )
  ) {
    return "swap";
  }
  if (/\bswap\b/i.test(message) && /\b(app|ui|interface|uniswap|like)\b/i.test(message)) {
    return "swap";
  }
  return "custom";
}

function inferBuildAppName(message: string, template: AppTemplate): string {
  if (/\bdeepbook\b/i.test(message)) return "DeepBook DEX";
  if (/\buniswap\b/i.test(message)) return "Swap DEX";
  if (template === "swap") return "DeepBook DEX";
  if (template === "escrow") return "Escrow App";
  if (template === "prediction") return "Prediction Market";
  return "Radiant App";
}

function inferBuildAppTagline(message: string, template: AppTemplate): string {
  if (template === "swap") {
    return "Swap, flash loan, stake, governance, and open orders on DeepBook";
  }
  const trimmed = message.trim();
  if (trimmed.length <= 120) return trimmed;
  return trimmed.slice(0, 117) + "…";
}

function describeBuiltApp(template: AppTemplate, savedToProject: boolean): string {
  const tabs =
    template === "swap"
      ? "tabs for Swap, Flash loan, Stake, Governance, and Open orders"
      : "the requested UI";
  const location = savedToProject
    ? "It's saved in Projects — open it from Projects or keep iterating in chat."
    : "The artifact preview is open — ask me to save to Projects anytime.";
  return `Built your DeepBook DEX app with ${tabs}. ${location}`;
}

/** Deterministic BUILD path — avoids the LLM replying "Done" without calling generate_app. */
export async function tryBuildAppFromMessage(
  privyUserId: string,
  message: string,
  sessionId?: string,
): Promise<BuildAppOutcome | null> {
  if (!messageHasBuildAppIntent(message)) {
    return null;
  }

  const template = inferBuildAppTemplate(message);
  if (template === "custom") {
    return null;
  }

  const saveToProject = messageRequestsSaveToProjects(message);

  try {
    const result = await generateAppForUser(
      privyUserId,
      {
        name: inferBuildAppName(message, template),
        tagline: inferBuildAppTagline(message, template),
        template,
        save_to_project: saveToProject,
        files: [{ path: "app/page.tsx", content: SWAP_DEX_PAGE_TSX }],
      },
      sessionId ? { sessionId } : {},
    );

    return {
      reply: describeBuiltApp(template, result.saved_to_project),
      tool_calls: [{ name: GENERATE_APP_TOOL_NAME, result }],
      pending_transaction: null,
    };
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      reply:
        mapped instanceof AppError
          ? mapped.message
          : "Could not generate the app — try again or describe the UI you want.",
      tool_calls: [
        {
          name: GENERATE_APP_TOOL_NAME,
          result: {
            error: {
              code: mapped instanceof AppError ? mapped.code : "GENERATE_APP_FAILED",
              message: mapped instanceof AppError ? mapped.message : String(mapped),
            },
          },
        },
      ],
      pending_transaction: null,
    };
  }
}
