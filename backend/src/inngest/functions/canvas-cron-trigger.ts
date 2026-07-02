import { inngest } from "../client.js";
import { CANVAS_WORKFLOW_TRIGGER_EVENT } from "../events.js";
import { executeLiveGraphRun } from "../../services/canvas/runtime/graph-executor.js";

export const canvasCronTriggerFunction = inngest.createFunction(
  {
    id: "canvas-cron-trigger",
    name: "Canvas schedule_cron workflow trigger",
    triggers: [{ event: CANVAS_WORKFLOW_TRIGGER_EVENT }],
    retries: 2,
    concurrency: [{ key: "event.data.workflowId", limit: 1 }],
  },
  async ({ event, step }) => {
    return step.run("execute-live-run", async () =>
      executeLiveGraphRun({
        privyUserId: event.data.privyUserId,
        workflowId: event.data.workflowId,
        confirmLive: true,
        autoApprove: true,
      }),
    );
  },
);
