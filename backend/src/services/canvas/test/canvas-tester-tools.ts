import { z } from "zod";
import { executeDryRunSimulation } from "../runtime/dry-run-simulator.js";

const runDryRunArgsSchema = z.object({
  auto_approve: z.boolean().optional(),
});

const completeArgsSchema = z.object({
  summary: z.string().min(1).max(2000),
});

export type TesterRunState = {
  workflowId: string;
  privyUserId: string;
  lastRunId?: string;
  completed?: boolean;
};

export type TesterToolResult = {
  ok: true;
  message: string;
  completed?: boolean;
  run_id?: string;
};

export const CANVAS_TESTER_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "run_dry_run",
      description: "Execute a full dry-run simulation of the workflow graph with simulated actions.",
      parameters: {
        type: "object",
        properties: {
          auto_approve: {
            type: "boolean",
            description: "Auto-approve workflow-approve gates in dry run (default true).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "complete",
      description: "Finish the Tester session after dry run completes.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Short summary of dry run results." },
        },
        required: ["summary"],
      },
    },
  },
];

export async function runTesterTool(
  name: string,
  rawArgs: unknown,
  state: TesterRunState,
): Promise<TesterToolResult> {
  switch (name) {
    case "run_dry_run": {
      const args = runDryRunArgsSchema.parse(rawArgs ?? {});
      const result = await executeDryRunSimulation({
        privyUserId: state.privyUserId,
        workflowId: state.workflowId,
        autoApprove: args.auto_approve ?? true,
      });
      state.lastRunId = result.runId;
      return {
        ok: true,
        message: result.summary,
        run_id: result.runId,
      };
    }
    case "complete": {
      const args = completeArgsSchema.parse(rawArgs);
      state.completed = true;
      return {
        ok: true,
        message: args.summary,
        completed: true,
        run_id: state.lastRunId,
      };
    }
    default:
      return { ok: true, message: `Unknown tool: ${name}` };
  }
}
