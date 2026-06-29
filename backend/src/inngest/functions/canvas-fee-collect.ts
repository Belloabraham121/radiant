import { inngest } from "../client.js";
import { CANVAS_ACTION_COMPLETED_EVENT } from "../events.js";
import { recordCanvasActionFee } from "../../services/canvas/fee/canvas-fee.service.js";

export const canvasFeeCollectFunction = inngest.createFunction(
  {
    id: "canvas-fee-collect",
    name: "Canvas action fee collection",
    triggers: [{ event: CANVAS_ACTION_COMPLETED_EVENT }],
    retries: 3,
    idempotency: "event.data.idempotencyKey",
  },
  async ({ event, step }) => {
    return step.run("record-fee", async () =>
      recordCanvasActionFee({
        idempotencyKey: event.data.idempotencyKey,
        workflowId: event.data.workflowId,
        runId: event.data.runId,
        nodeId: event.data.nodeId,
        nodeType: event.data.nodeType,
        estUsd: event.data.estUsd,
        privyUserId: event.data.privyUserId,
      }),
    );
  },
);
