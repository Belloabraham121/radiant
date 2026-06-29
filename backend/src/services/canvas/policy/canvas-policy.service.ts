import type { Prisma } from "@prisma/client";
import { AppError } from "../../../errors/app-error.js";
import { getCanvasConfig } from "../../../config/canvas.js";
import { prisma } from "../../../infrastructure/postgres/client.js";
import { findUserByPrivyId } from "../../auth/user.repository.js";
import {
  createDefaultCanvasPolicy,
  parseCanvasPolicy,
  safeParseCanvasPolicy,
} from "./canvas-policy.schema.js";
import type { CanvasPolicy } from "./canvas-policy.types.js";
import {
  evaluatePolicyAction,
  type PolicyActionIntent,
  type PolicyEvaluationResult,
} from "./evaluate-policy.js";
import { getKillSwitchState, setKillSwitchState } from "./canvas-kill-switch.js";
import { cacheGet, cacheSet } from "../../../infrastructure/redis/cache.js";

export type CanvasPolicyDetail = CanvasPolicy & {
  kill_switch_active: boolean;
  spend_usd_24h: number;
};

export type PatchCanvasPolicyInput = Partial<
  Pick<
    CanvasPolicy,
    | "max_spend_usd_24h"
    | "max_single_action_usd"
    | "allowed_actions"
    | "forbidden_transfers"
    | "copy_trade_limits"
    | "region_profile"
    | "kill_switch"
    | "require_deploy_approval"
  >
>;

const SPEND_KEY_PREFIX = "canvas:policy:spend:";

async function requireUserId(privyUserId: string): Promise<bigint> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User profile not found.");
  }
  return user.id;
}

async function requireOwnedWorkflow(workflowId: string, userId: bigint) {
  const workflow = await prisma.canvasWorkflow.findFirst({
    where: { id: workflowId, user_id: userId },
  });
  if (!workflow) {
    throw new AppError(404, "WORKFLOW_NOT_FOUND", "Canvas workflow not found.");
  }
  return workflow;
}

async function loadPolicyRow(workflowId: string, policyId: string) {
  const row = await prisma.canvasWorkflowPolicy.findFirst({
    where: { id: policyId, workflow_id: workflowId },
  });
  if (!row) {
    throw new AppError(404, "POLICY_NOT_FOUND", "Canvas workflow policy not found.");
  }
  return row;
}

function spendKey(workflowId: string): string {
  return `${SPEND_KEY_PREFIX}${workflowId}`;
}

export async function getSpend24hUsd(workflowId: string): Promise<number> {
  const ledger = await cacheGet<{ total_usd: number }>(spendKey(workflowId));
  return ledger?.total_usd ?? 0;
}

export async function recordSpend24h(workflowId: string, usd: number): Promise<number> {
  const current = await getSpend24hUsd(workflowId);
  const next = current + usd;
  const ttl = getCanvasConfig().spendLedgerTtlSeconds;
  await cacheSet(spendKey(workflowId), { total_usd: next }, ttl);
  return next;
}

export async function getWorkflowPolicy(
  privyUserId: string,
  workflowId: string,
): Promise<CanvasPolicyDetail> {
  const userId = await requireUserId(privyUserId);
  const workflow = await requireOwnedWorkflow(workflowId, userId);
  const row = await loadPolicyRow(workflowId, workflow.policy_id);
  const policy = parseCanvasPolicy(row.policy);
  const killSwitchActive = policy.kill_switch || (await getKillSwitchState(workflowId));

  return {
    ...policy,
    kill_switch_active: killSwitchActive,
    spend_usd_24h: await getSpend24hUsd(workflowId),
  };
}

export async function patchWorkflowPolicy(
  privyUserId: string,
  workflowId: string,
  patch: PatchCanvasPolicyInput,
): Promise<CanvasPolicyDetail> {
  const userId = await requireUserId(privyUserId);
  const workflow = await requireOwnedWorkflow(workflowId, userId);
  const row = await loadPolicyRow(workflowId, workflow.policy_id);
  const current = parseCanvasPolicy(row.policy);

  const merged: CanvasPolicy = {
    ...current,
    ...patch,
    workflow_id: workflowId,
    policy_version: current.policy_version,
  };

  const parsed = safeParseCanvasPolicy(merged);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid policy update.", {
      details: parsed.error.flatten(),
    });
  }

  await prisma.canvasWorkflowPolicy.update({
    where: { id: row.id },
    data: {
      policy: parsed.data as Prisma.InputJsonValue,
      kill_switch: parsed.data.kill_switch,
    },
  });

  await setKillSwitchState(workflowId, parsed.data.kill_switch);

  return getWorkflowPolicy(privyUserId, workflowId);
}

export async function activateKillSwitch(
  privyUserId: string,
  workflowId: string,
): Promise<CanvasPolicyDetail> {
  return patchWorkflowPolicy(privyUserId, workflowId, { kill_switch: true });
}

export async function evaluateWorkflowAction(
  workflowId: string,
  policy: CanvasPolicy,
  intent: PolicyActionIntent,
): Promise<PolicyEvaluationResult> {
  const killActive = policy.kill_switch || (await getKillSwitchState(workflowId));
  if (killActive) {
    return {
      allowed: false,
      code: "POLICY_KILL_SWITCH",
      message: "Kill switch is active.",
    };
  }

  const spend24h = await getSpend24hUsd(workflowId);
  return evaluatePolicyAction(policy, intent, spend24h);
}

export async function loadPolicyForWorkflow(workflowId: string, policyId: string): Promise<CanvasPolicy> {
  const row = await loadPolicyRow(workflowId, policyId);
  return parseCanvasPolicy(row.policy);
}

export { createDefaultCanvasPolicy };
