import { randomUUID } from "node:crypto";
import { areCanvasFeesDisabled, getCanvasConfig } from "../../../config/canvas.js";
import { prisma } from "../../../infrastructure/postgres/client.js";
import { cacheGet, cacheSet } from "../../../infrastructure/redis/cache.js";

export type CanvasFeeRecord = {
  idempotency_key: string;
  workflow_id: string;
  run_id: string;
  node_id: string;
  node_type: string;
  est_usd: number;
  fee_usd: number;
  recorded_at: string;
};

const FEE_LEDGER_PREFIX = "canvas:fees:";

function feeKey(idempotencyKey: string): string {
  return `${FEE_LEDGER_PREFIX}${idempotencyKey}`;
}

export function computeCanvasActionFeeUsd(estUsd: number): number {
  const bps = getCanvasConfig().feeBps;
  return Math.round((estUsd * bps) / 10_000 * 100) / 100;
}

export async function recordCanvasActionFee(input: {
  idempotencyKey: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  estUsd: number;
  privyUserId: string;
}): Promise<CanvasFeeRecord | null> {
  if (areCanvasFeesDisabled()) {
    return null;
  }

  const existing = await cacheGet<CanvasFeeRecord>(feeKey(input.idempotencyKey));
  if (existing) return existing;

  const feeUsd = computeCanvasActionFeeUsd(input.estUsd);
  const record: CanvasFeeRecord = {
    idempotency_key: input.idempotencyKey,
    workflow_id: input.workflowId,
    run_id: input.runId,
    node_id: input.nodeId,
    node_type: input.nodeType,
    est_usd: input.estUsd,
    fee_usd: feeUsd,
    recorded_at: new Date().toISOString(),
  };

  await cacheSet(feeKey(input.idempotencyKey), record, 86400 * 30);

  const user = await prisma.user.findUnique({ where: { privy_user_id: input.privyUserId } });
  if (user) {
    await prisma.canvasWorkflowRunEvent.create({
      data: {
        id: randomUUID(),
        run_id: input.runId,
        event_type: "canvas.fee.recorded",
        payload: record,
      },
    });
  }

  return record;
}
