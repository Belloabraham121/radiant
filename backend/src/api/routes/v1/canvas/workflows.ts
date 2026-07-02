import { Router } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import { requireFeature } from "../../../middleware/require-feature.js";
import {
  canvasBuildStreamRequestSchema,
  canvasDryRunStreamRequestSchema,
  canvasLiveStreamRequestSchema,
  createCanvasWorkflowSchema,
  patchCanvasBuildConfigSchema,
  patchCanvasPolicySchema,
  patchCanvasTesterConfigSchema,
  updateCanvasWorkflowSchema,
} from "../../../../services/canvas/canvas-workflow.types.js";
import {
  createUserWorkflow,
  getUserWorkflow,
  listUserWorkflows,
  patchUserWorkflowBuildConfig,
  patchUserWorkflowTesterConfig,
  updateUserWorkflow,
} from "../../../../services/canvas/canvas-workflow.service.js";
import {
  getWorkflowRun,
  listWorkflowRuns,
} from "../../../../services/canvas/canvas-workflow-run.service.js";
import { getCanvasNodePreview } from "../../../../services/canvas/preview/canvas-node-preview.service.js";
import {
  runCanvasBuildStream,
  runCanvasBuildStreamStub,
} from "../../../../services/canvas/build/canvas-builder-agent.service.js";
import {
  runCanvasDryRunStream,
} from "../../../../services/canvas/test/canvas-tester-agent.service.js";
import {
  activateKillSwitch,
  getWorkflowPolicy,
  patchWorkflowPolicy,
} from "../../../../services/canvas/policy/canvas-policy.service.js";
import { runCanvasLiveStream } from "../../../../services/canvas/runtime/canvas-live-run.service.js";
import { useCanvasBuilderStub } from "../../../../config/canvas.js";
import { stopLiveWorkflow } from "../../../../services/canvas/runtime/graph-executor.js";
import {
  clearBuildMessages,
  loadBuildMessages,
} from "../../../../services/canvas/build/canvas-build-memory.service.js";
import { CANVAS_LIVE_PROGRESS_EVENT_NAMES } from "../../../../services/canvas/runtime/canvas-live-progress-context.js";
import { fail, ok } from "../../../../utils/http-response.js";
import { writeSseEvent } from "../../../../utils/chat-sse.js";
import { CANVAS_BUILD_PROGRESS_EVENT_NAMES } from "../../../../services/canvas/build/canvas-build-progress.types.js";
import { CANVAS_DRY_RUN_PROGRESS_EVENT_NAMES } from "../../../../services/canvas/test/canvas-test-progress.types.js";

export const canvasWorkflowsRouter = Router();

const canvasGuard = [requireAuth, requireFeature("canvas")];

canvasWorkflowsRouter.get("/api/v1/canvas/workflows", ...canvasGuard, async (req, res, next) => {
  try {
    const data = await listUserWorkflows(req.user.privyUserId);
    return ok(req, res, data);
  } catch (err) {
    next(err);
  }
});

canvasWorkflowsRouter.post("/api/v1/canvas/workflows", ...canvasGuard, async (req, res, next) => {
  try {
    const body = createCanvasWorkflowSchema.parse(req.body ?? {});
    const data = await createUserWorkflow(req.user.privyUserId, body);
    return ok(req, res, data, 201);
  } catch (err) {
    if (err instanceof ZodError) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: err.flatten(),
      });
    }
    next(err);
  }
});

canvasWorkflowsRouter.get(
  "/api/v1/canvas/workflows/:workflowId",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const data = await getUserWorkflow(req.user.privyUserId, workflowId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

canvasWorkflowsRouter.get(
  "/api/v1/canvas/workflows/:workflowId/nodes/:nodeId/preview",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      const nodeId = req.params.nodeId;
      if (!workflowId || !nodeId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId and nodeId are required",
        });
      }
      const data = await getCanvasNodePreview(req.user.privyUserId, workflowId, nodeId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

canvasWorkflowsRouter.patch(
  "/api/v1/canvas/workflows/:workflowId",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const body = updateCanvasWorkflowSchema.parse(req.body ?? {});
      const data = await updateUserWorkflow(req.user.privyUserId, workflowId, body);
      return ok(req, res, data);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: err.flatten(),
        });
      }
      next(err);
    }
  },
);

canvasWorkflowsRouter.patch(
  "/api/v1/canvas/workflows/:workflowId/build_config",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const body = patchCanvasBuildConfigSchema.parse(req.body ?? {});
      const data = await patchUserWorkflowBuildConfig(req.user.privyUserId, workflowId, body);
      return ok(req, res, data);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: err.flatten(),
        });
      }
      next(err);
    }
  },
);

canvasWorkflowsRouter.patch(
  "/api/v1/canvas/workflows/:workflowId/tester_config",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const body = patchCanvasTesterConfigSchema.parse(req.body ?? {});
      const data = await patchUserWorkflowTesterConfig(req.user.privyUserId, workflowId, body);
      return ok(req, res, data);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: err.flatten(),
        });
      }
      next(err);
    }
  },
);

canvasWorkflowsRouter.get(
  "/api/v1/canvas/workflows/:workflowId/policy",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const data = await getWorkflowPolicy(req.user.privyUserId, workflowId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

canvasWorkflowsRouter.patch(
  "/api/v1/canvas/workflows/:workflowId/policy",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const body = patchCanvasPolicySchema.parse(req.body ?? {});
      const data = await patchWorkflowPolicy(req.user.privyUserId, workflowId, body);
      return ok(req, res, data);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: err.flatten(),
        });
      }
      next(err);
    }
  },
);

canvasWorkflowsRouter.post(
  "/api/v1/canvas/workflows/:workflowId/kill",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const data = await activateKillSwitch(req.user.privyUserId, workflowId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

canvasWorkflowsRouter.post(
  "/api/v1/canvas/workflows/:workflowId/live/stop",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const data = await stopLiveWorkflow(req.user.privyUserId, workflowId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

canvasWorkflowsRouter.post(
  "/api/v1/canvas/workflows/:workflowId/live/stream",
  ...canvasGuard,
  async (req, res, next) => {
    const workflowId = req.params.workflowId;
    if (!workflowId) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "workflowId is required",
      });
    }

    try {
      const body = canvasLiveStreamRequestSchema.parse(req.body ?? {});

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      writeSseEvent(res, "connected", {
        workflow_id: workflowId,
        mode: "live",
      });

      const send = (event: (typeof CANVAS_LIVE_PROGRESS_EVENT_NAMES)[number], data: unknown) => {
        writeSseEvent(res, event, data);
      };

      try {
        await runCanvasLiveStream({
          privyUserId: req.user.privyUserId,
          workflowId,
          confirmLive: body.confirm_live,
          send,
        });
      } catch (err) {
        if (!res.writableEnded) {
          const message = err instanceof Error ? err.message : "Live stream failed.";
          writeSseEvent(res, "workflow.run.error", {
            code: "LIVE_RUN_ERROR",
            message,
          });
        }
      }

      res.end();
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: err.flatten(),
        });
      }
      next(err);
    }
  },
);

canvasWorkflowsRouter.get(
  "/api/v1/canvas/workflows/:workflowId/runs",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const data = await listWorkflowRuns(req.user.privyUserId, workflowId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

canvasWorkflowsRouter.get(
  "/api/v1/canvas/workflows/:workflowId/runs/:runId",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      const runId = req.params.runId;
      if (!workflowId || !runId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId and runId are required",
        });
      }
      const data = await getWorkflowRun(req.user.privyUserId, workflowId, runId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

canvasWorkflowsRouter.post(
  "/api/v1/canvas/workflows/:workflowId/dry-run/stream",
  ...canvasGuard,
  async (req, res, next) => {
    const workflowId = req.params.workflowId;
    if (!workflowId) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "workflowId is required",
      });
    }

    try {
      const body = canvasDryRunStreamRequestSchema.parse(req.body ?? {});
      const workflow = await getUserWorkflow(req.user.privyUserId, workflowId);

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      writeSseEvent(res, "connected", {
        workflow_id: workflowId,
        model_tier: workflow.tester_config?.model_tier ?? "lite",
        provider: workflow.tester_config?.provider ?? "openai",
        mode: "dry",
      });

      const send = (event: (typeof CANVAS_DRY_RUN_PROGRESS_EVENT_NAMES)[number], data: unknown) => {
        writeSseEvent(res, event, data);
      };

      try {
        await runCanvasDryRunStream({
          privyUserId: req.user.privyUserId,
          workflowId,
          message: body.message,
          send,
          tester_config: workflow.tester_config ?? undefined,
        });
      } catch (err) {
        if (!res.writableEnded) {
          const message = err instanceof Error ? err.message : "Dry run stream failed.";
          writeSseEvent(res, "workflow.run.error", {
            code: "DRY_RUN_ERROR",
            message,
          });
        }
      }

      res.end();
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: err.flatten(),
        });
      }
      next(err);
    }
  },
);

canvasWorkflowsRouter.get(
  "/api/v1/canvas/workflows/:workflowId/build/messages",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const data = await loadBuildMessages(req.user.privyUserId, workflowId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

canvasWorkflowsRouter.delete(
  "/api/v1/canvas/workflows/:workflowId/build/messages",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const workflowId = req.params.workflowId;
      if (!workflowId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "workflowId is required",
        });
      }
      const data = await clearBuildMessages(req.user.privyUserId, workflowId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

canvasWorkflowsRouter.post(
  "/api/v1/canvas/workflows/:workflowId/build/stream",
  ...canvasGuard,
  async (req, res, next) => {
    const workflowId = req.params.workflowId;
    if (!workflowId) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "workflowId is required",
      });
    }

    try {
      const body = canvasBuildStreamRequestSchema.parse(req.body ?? {});
      const workflow = await getUserWorkflow(req.user.privyUserId, workflowId);

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      writeSseEvent(res, "connected", {
        workflow_id: workflowId,
        model_tier: workflow.build_config?.model_tier ?? "lite",
        provider: workflow.build_config?.provider ?? "openai",
      });

      const send = (event: (typeof CANVAS_BUILD_PROGRESS_EVENT_NAMES)[number], data: unknown) => {
        writeSseEvent(res, event, data);
      };

      const useStub = useCanvasBuilderStub();

      try {
        if (useStub) {
          await runCanvasBuildStreamStub(
            req.user.privyUserId,
            workflowId,
            send,
            workflow.build_config ?? undefined,
          );
        } else {
          await runCanvasBuildStream({
            privyUserId: req.user.privyUserId,
            workflowId,
            message: body.message,
            send,
            build_config: workflow.build_config ?? undefined,
            selected_node_id: body.selected_node_id,
            edit_intent: body.edit_intent,
            builder_intent: body.builder_intent,
          });
        }
      } catch (err) {
        if (!res.writableEnded) {
          const message = err instanceof Error ? err.message : "Build stream failed.";
          writeSseEvent(res, "workflow.build.error", {
            code: "BUILD_ERROR",
            message,
          });
        }
      }

      res.end();
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: err.flatten(),
        });
      }
      next(err);
    }
  },
);
