import { randomUUID } from "node:crypto";
import { isCanvasRuntimeMock } from "../../../../config/canvas.js";
import { AppError } from "../../../../errors/app-error.js";
import { resolveAgentWalletByPrivyUserId } from "../../../wallet/agent-wallet.service.js";
import { assertKillSwitchClear } from "../../policy/canvas-kill-switch.js";
import {
  evaluateWorkflowAction,
  recordSpend24h,
} from "../../policy/canvas-policy.service.js";
import type { CanvasPolicy } from "../../policy/canvas-policy.types.js";
import type { CompiledWorkflowNode } from "../../compiler/compiled-workflow.types.js";
import {
  submitPolymarketOrder,
  type PolymarketOrderIntent,
} from "../../adapters/polymarket/polymarket-order.service.js";
import type { LiveNodeContext, LiveNodeResult } from "../live-node-registry.js";

function readEstUsd(node: CompiledWorkflowNode, upstream: Map<string, unknown>): number {
  if (typeof node.config.est_usd === "number") return node.config.est_usd;
  for (const [, value] of upstream) {
    if (typeof value === "object" && value && "est_usd" in value) {
      const parsed = Number((value as { est_usd: unknown }).est_usd);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return Number(node.config.est_usd ?? 0) || 0;
}

function readTokenId(node: CompiledWorkflowNode): string {
  const tokenId =
    (typeof node.config.token_id === "string" && node.config.token_id) ||
    (typeof node.config.asset_id === "string" && node.config.asset_id) ||
    (typeof node.config.clob_token_id === "string" && node.config.clob_token_id);
  if (!tokenId) {
    throw new AppError(400, "MISSING_TOKEN_ID", "Polymarket node requires token_id or asset_id.");
  }
  return tokenId;
}

export async function executeLivePolymarketOrder(ctx: LiveNodeContext): Promise<LiveNodeResult> {
  await assertKillSwitchClear(ctx.workflowId);

  const wallet = await resolveAgentWalletByPrivyUserId(ctx.privyUserId, "ethereum");
  if (!wallet?.signer_added) {
    throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "EVM agent wallet not ready for Live.");
  }

  const estUsd = readEstUsd(ctx.node, ctx.upstream);
  const evaluation = await evaluateWorkflowAction(ctx.workflowId, ctx.policy, {
    action_type: ctx.node.resolved_type,
    est_usd: estUsd,
  });
  if (!evaluation.allowed) {
    throw new AppError(403, evaluation.code, evaluation.message);
  }

  const side =
    ctx.node.config.side === "sell" || ctx.node.config.side === "SELL" ? "sell" : "buy";
  const intent: PolymarketOrderIntent = {
    workflow_id: ctx.workflowId,
    token_id: readTokenId(ctx.node),
    side,
    size: Number(ctx.node.config.size ?? ctx.node.config.amount ?? 1),
    price: ctx.node.config.price != null ? Number(ctx.node.config.price) : undefined,
    order_type: ctx.node.resolved_type === "polymarket_place_market" ? "market" : "limit",
    est_usd: estUsd,
  };

  const result = await submitPolymarketOrder({
    privyUserId: ctx.privyUserId,
    privyWalletId: wallet.privy_wallet_id,
    address: wallet.address,
    workflowId: ctx.workflowId,
    intent,
  });

  if (estUsd > 0) {
    await recordSpend24h(ctx.workflowId, estUsd);
  }

  return {
    outputs: { data: result },
    detail: `Polymarket order ${result.order_id}`,
    executed: true,
    tx_hash: result.tx_hash,
    explorer_url: result.explorer_url,
    evm_chain_id: 137,
    fee_usd: estUsd > 0 ? estUsd * 0.0025 : undefined,
  };
}

export async function executeLiveLifiAction(ctx: LiveNodeContext): Promise<LiveNodeResult> {
  await assertKillSwitchClear(ctx.workflowId);

  const estUsd = readEstUsd(ctx.node, ctx.upstream);
  const evaluation = await evaluateWorkflowAction(ctx.workflowId, ctx.policy, {
    action_type: ctx.node.resolved_type,
    est_usd: estUsd,
    from_chain: typeof ctx.node.config.from_chain === "string" ? ctx.node.config.from_chain : undefined,
    to_chain: typeof ctx.node.config.to_chain === "string" ? ctx.node.config.to_chain : undefined,
    token_symbol:
      typeof ctx.node.config.token_symbol === "string" ? ctx.node.config.token_symbol : undefined,
  });
  if (!evaluation.allowed) {
    throw new AppError(403, evaluation.code, evaluation.message);
  }

  if (!isCanvasRuntimeMock()) {
    throw new AppError(
      501,
      "LIFI_LIVE_NOT_CONFIGURED",
      "Li-Fi Live execution requires CANVAS_RUNTIME_MOCK=false and full route config — use mock mode for dev.",
    );
  }

  const txHash = `0x${randomUUID().replace(/-/g, "").slice(0, 64)}`;
  const chainId = Number(ctx.node.config.chain_id ?? 1);

  if (estUsd > 0) {
    await recordSpend24h(ctx.workflowId, estUsd);
  }

  return {
    outputs: {
      data: {
        status: "submitted",
        mock: true,
        node_type: ctx.node.resolved_type,
        tx_hash: txHash,
      },
    },
    detail: `Li-Fi ${ctx.node.resolved_type.replace(/_/g, " ")} (mock)`,
    executed: true,
    tx_hash: txHash,
    explorer_url: chainId === 137 ? `https://polygonscan.com/tx/${txHash}` : `https://etherscan.io/tx/${txHash}`,
    evm_chain_id: chainId,
    fee_usd: estUsd > 0 ? estUsd * 0.0025 : undefined,
  };
}
