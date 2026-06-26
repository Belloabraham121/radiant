import OpenAI from "openai";
import { getOpenAiConfig } from "../../../config/agent.js";
import type {
  ClarificationQuestionContext,
  ClarificationQuestionTemplate,
} from "./clarification-question-context.js";
import { openAiMaxOutputTokens } from "../runtime/openai-completion-params.js";

const SYNTHESIS_TIMEOUT_MS = 4_000;

type SynthesizedClarificationPayload = {
  question: string;
  hint?: string;
};

type SynthesisDeps = {
  getConfig: typeof getOpenAiConfig;
  createCompletion: typeof createClarificationCompletion;
};

let synthesisDeps: SynthesisDeps = {
  getConfig: getOpenAiConfig,
  createCompletion: createClarificationCompletion,
};

export function setClarificationSynthesisDepsForTests(deps: Partial<SynthesisDeps> | null): void {
  if (!deps) {
    synthesisDeps = {
      getConfig: getOpenAiConfig,
      createCompletion: createClarificationCompletion,
    };
    return;
  }
  synthesisDeps = { ...synthesisDeps, ...deps };
}

function buildSynthesisPrompt(ctx: ClarificationQuestionContext): string {
  const knownLines = Object.entries(ctx.known)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `- ${key}: ${value}`);

  const optionLines =
    ctx.options?.map((option) => `- ${option.id}: ${option.label}`) ?? [];

  const workflowAction =
    ctx.action === "workflow" && ctx.known.workflow_action
      ? `Workflow execute action: ${ctx.known.workflow_action}`
      : null;

  return [
    "Rewrite a clarification question for a DeFi assistant.",
    "Ask ONLY about the missing field — do not re-ask for information already known.",
    `Action: ${ctx.action}`,
    workflowAction,
    `Missing field: ${ctx.field}`,
    `Interaction: ${ctx.interaction_type}`,
    knownLines.length > 0 ? `Known facts:\n${knownLines.join("\n")}` : "Known facts: (none yet)",
    optionLines.length > 0 ? `User will choose from:\n${optionLines.join("\n")}` : "",
    `Template (style reference, same intent): ${ctx.template_question}`,
    ctx.template_hint ? `Template hint: ${ctx.template_hint}` : "",
    'Return JSON: { "question": string, "hint"?: string }',
    "Keep question under 200 characters. Hint is optional, under 120 characters.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function createClarificationCompletion(
  client: OpenAI,
  model: string,
  prompt: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNTHESIS_TIMEOUT_MS);

  try {
    const response = await client.chat.completions.create(
      {
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write short, friendly clarification questions for a crypto wallet assistant. " +
              "Output valid JSON only. Never ask for fields already listed under known facts.",
          },
          { role: "user", content: prompt },
        ],
        ...openAiMaxOutputTokens(model, 256),
      },
      { signal: controller.signal },
    );

    return response.choices[0]?.message?.content?.trim() ?? null;
  } finally {
    clearTimeout(timer);
  }
}

function parseSynthesizedPayload(raw: string): SynthesizedClarificationPayload | null {
  try {
    const parsed = JSON.parse(raw) as SynthesizedClarificationPayload;
    if (typeof parsed.question !== "string") {
      return null;
    }
    const question = parsed.question.trim();
    if (!question) {
      return null;
    }
    const hint =
      typeof parsed.hint === "string" && parsed.hint.trim() ? parsed.hint.trim() : undefined;
    return { question, hint };
  } catch {
    return null;
  }
}

const REASK_PATTERNS: Array<{
  factKey: keyof ClarificationQuestionContext["known"];
  field: string;
  patterns: RegExp[];
}> = [
  {
    factKey: "from_chain",
    field: "from_chain",
    patterns: [/which (?:network|chain).*(?:on now|currently|source|from)/i, /where.*tokens.*(?:are|now)/i],
  },
  {
    factKey: "to_chain",
    field: "to_chain",
    patterns: [/which (?:network|chain).*(?:receive|destination|to)/i, /where.*(?:receive|send them)/i],
  },
  {
    factKey: "network",
    field: "chain_id",
    patterns: [/which network/i],
  },
  {
    factKey: "from_token",
    field: "from_token",
    patterns: [/which token.*(?:send|bridg|moving)/i],
  },
  {
    factKey: "to_token",
    field: "to_token",
    patterns: [/which token.*(?:receive|arrive|get)/i, /what.*(?:receive|arrive)/i],
  },
  {
    factKey: "input_coin",
    field: "input_coin",
    patterns: [/which token.*(?:swap from|pay|spend)/i],
  },
  {
    factKey: "output_coin",
    field: "output_coin",
    patterns: [/which token.*(?:receive|get|swap to)/i, /what.*receive/i],
  },
  {
    factKey: "amount",
    field: "amount",
    patterns: [/how much/i],
  },
];

/** Returns true when the question appears to re-ask a field we already know. */
export function questionReAsksKnownField(
  question: string,
  ctx: ClarificationQuestionContext,
): boolean {
  for (const rule of REASK_PATTERNS) {
    const known = ctx.known[rule.factKey];
    if (!known || ctx.field === rule.field) {
      continue;
    }
    if (rule.patterns.some((pattern) => pattern.test(question))) {
      return true;
    }
  }
  return false;
}

export function validateSynthesizedClarificationQuestion(
  payload: SynthesizedClarificationPayload,
  ctx: ClarificationQuestionContext,
): boolean {
  if (payload.question.length < 8 || payload.question.length > 280) {
    return false;
  }
  if (payload.hint !== undefined && payload.hint.length > 160) {
    return false;
  }
  if (questionReAsksKnownField(payload.question, ctx)) {
    return false;
  }
  return true;
}

export async function synthesizeClarificationQuestion(
  ctx: ClarificationQuestionContext,
  templateFallback: ClarificationQuestionTemplate,
): Promise<ClarificationQuestionTemplate> {
  const { apiKey, model } = synthesisDeps.getConfig();
  if (!apiKey) {
    return templateFallback;
  }

  const client = new OpenAI({ apiKey });

  try {
    const raw = await synthesisDeps.createCompletion(
      client,
      model,
      buildSynthesisPrompt(ctx),
    );
    if (!raw) {
      return templateFallback;
    }

    const parsed = parseSynthesizedPayload(raw);
    if (!parsed || !validateSynthesizedClarificationQuestion(parsed, ctx)) {
      return templateFallback;
    }

    return {
      question: parsed.question,
      hint: parsed.hint ?? templateFallback.hint,
    };
  } catch {
    return templateFallback;
  }
}
