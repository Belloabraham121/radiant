import { AppError } from "../../../errors/app-error.js";
import { executeLiveGraphRun } from "../runtime/graph-executor.js";
import {
  emitLiveRunError,
  runWithCanvasLiveProgress,
} from "../runtime/canvas-live-progress-context.js";
import type { CanvasLiveStreamSender } from "../runtime/canvas-live-progress-context.js";

export type RunCanvasLiveStreamInput = {
  privyUserId: string;
  workflowId: string;
  confirmLive?: boolean;
  send: CanvasLiveStreamSender;
};

export async function runCanvasLiveStream(input: RunCanvasLiveStreamInput): Promise<void> {
  await runWithCanvasLiveProgress({ send: input.send }, async () => {
    try {
      await executeLiveGraphRun({
        privyUserId: input.privyUserId,
        workflowId: input.workflowId,
        confirmLive: input.confirmLive ?? false,
        autoApprove: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Live run failed.";
      const code = err instanceof AppError ? err.code : "LIVE_RUN_ERROR";
      emitLiveRunError(code, message);
    }
  });
}
