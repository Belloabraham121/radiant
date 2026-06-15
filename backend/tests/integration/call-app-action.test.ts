import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { setExecuteTransactionWithApprovalHandlerForTests } from "../../src/services/agent/execute-transaction-with-approval.js";
import { runAgentTool } from "../../src/services/agent/tools.js";
import {
  CALL_APP_ACTION_TOOL_NAME,
  runCallAppActionTool,
} from "../../src/services/projects/call-app-action.tool.js";
import { buildDefaultDeepBookActionSchema } from "../../src/services/projects/app-action-schema.service.js";
import type { ProjectActionSchema } from "../../src/services/projects/app-action-schema.types.js";
import {
  createProject,
  setProjectActionSchema,
} from "../../src/services/projects/project.repository.js";

function actionSchemaToPrismaJson(schema: ProjectActionSchema): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(schema)) as Prisma.InputJsonValue;
}

const privyUserId = "did:privy:call-app-action-integration";

describe("call_app_action integration", () => {
  let userId: bigint;
  let projectId: string;

  before(async () => {
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });

    const user = await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "call-app-action-integration@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Test DEX",
      template: "swap",
    });
    projectId = project.id;

    await setProjectActionSchema(
      projectId,
      actionSchemaToPrismaJson(buildDefaultDeepBookActionSchema(projectId, ["swap"])),
    );
  });

  after(async () => {
    setExecuteTransactionWithApprovalHandlerForTests(null);
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });
    await prisma.$disconnect();
  });

  it("runCallAppActionTool returns approval_required for a schema-valid swap", async () => {
    setExecuteTransactionWithApprovalHandlerForTests(async (_privy, input, options) => {
      assert.equal(input.action, "swap");
      assert.equal(input.params.side, "sell");
      assert.equal(input.params.amount, 2);
      assert.equal(typeof options, "object");
      assert.equal((options as { sessionId?: string }).sessionId, "00000000-0000-4000-8000-000000000099");

      return {
        status: "approval_required",
        agent_transaction_id: "44444444-4444-4444-8444-444444444444",
        pending: {
          id: "44444444-4444-4444-8444-444444444444",
          chain_id: "sui",
          action: "swap",
          params: input.params,
          summary: "Swap 2 SUI",
          amount_display: "2 SUI",
        },
      };
    });

    const result = await runCallAppActionTool(
      privyUserId,
      {
        project_id: projectId,
        action: "swap",
        params: { amount: 2, side: "sell", pool_key: "SUI_USDC" },
      },
      { sessionId: "00000000-0000-4000-8000-000000000099" },
    );

    assert.equal(result.status, "approval_required");
    if (result.status !== "approval_required") {
      return;
    }
    assert.equal(result.action, "swap");
    assert.equal(result.pending.summary, "Swap 2 SUI");
  });

  it("runCallAppActionTool rejects actions outside the project schema", async () => {
    await assert.rejects(
      () =>
        runCallAppActionTool(privyUserId, {
          project_id: projectId,
          action: "flash_loan",
          params: { borrow_amount: 100, side: "sell" },
        }),
      (err: unknown) =>
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "ACTION_NOT_IN_SCHEMA",
    );
  });

  it("runAgentTool dispatches call_app_action and maps schema errors to tool errors", async () => {
    setExecuteTransactionWithApprovalHandlerForTests(async () => ({
      status: "executed",
      result: {
        chain_id: "sui",
        digest: "call-app-action-digest",
        address: "0xabc",
        effects_status: "success",
      },
    }));

    const executed = await runAgentTool(privyUserId, CALL_APP_ACTION_TOOL_NAME, {
      project_id: projectId,
      action: "swap",
      params: { amount: 1, side: "sell" },
    });
    assert.equal((executed as { status: string }).status, "executed");

    const blocked = await runAgentTool(privyUserId, CALL_APP_ACTION_TOOL_NAME, {
      project_id: projectId,
      action: "stake",
      params: { amount_display: 1 },
    });
    assert.equal((blocked as { error: { code: string } }).error.code, "ACTION_NOT_IN_SCHEMA");
  });
});
