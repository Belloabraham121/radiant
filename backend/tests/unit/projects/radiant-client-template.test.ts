import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RADIANT_CLIENT_TEMPLATE_VERSION,
  RADIANT_CLIENT_TS,
} from "../../../src/services/projects/radiant-client-template.js";
import {
  RADIANT_AGENT_RUNTIME_TS,
  RADIANT_AGENT_RUNTIME_VERSION,
} from "../../../src/services/projects/radiant-agent-runtime-template.js";

describe("radiant-client template", () => {
  it("is at expected version with execute helpers", () => {
    assert.equal(RADIANT_CLIENT_TEMPLATE_VERSION, 6);
    assert.match(RADIANT_CLIENT_TS, /export async function executeAction/);
    assert.match(RADIANT_CLIENT_TS, /export async function executeSwap/);
    assert.match(RADIANT_CLIENT_TS, /export async function executeFlashLoan/);
    assert.match(RADIANT_CLIENT_TS, /export async function executeStake/);
    assert.match(RADIANT_CLIENT_TS, /export async function executeUnstake/);
    assert.match(RADIANT_CLIENT_TS, /export async function flashLoanQuote/);
    assert.match(RADIANT_CLIENT_TS, /export async function openOrders/);
    assert.match(RADIANT_CLIENT_TS, /export async function stakeBalance/);
    assert.match(RADIANT_CLIENT_TS, /export async function governanceState/);
    assert.match(RADIANT_CLIENT_TS, /__RADIANT_INSTALLATION_ID__/);
    assert.match(RADIANT_CLIENT_TS, /__RADIANT_SESSION_ID__/);
    assert.match(RADIANT_CLIENT_TS, /readPublicEnv/);
    assert.match(RADIANT_CLIENT_TS, /resolveSwapSide/);
    assert.match(RADIANT_CLIENT_TS, /\/api\/v1\/chat\/sessions\//);
    assert.match(RADIANT_CLIENT_TS, /isApprovalRequired/);
    assert.match(RADIANT_CLIENT_TS, /approveAgentTransaction/);
    assert.match(RADIANT_CLIENT_TS, /rejectAgentTransaction/);
    assert.match(RADIANT_CLIENT_TS, /RadiantActionError/);
    assert.equal(RADIANT_AGENT_RUNTIME_VERSION, 6);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /notifyParentExecuteResult/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /showInAppApprovalModal/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /resolveApprovalIfNeeded/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /execute_in_app/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /data\.animate === true/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /setFieldValue/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /ctx\.executeAction/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /ctx\.delay/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /ctx\.setField/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /radiant-agent-set-field/);
  });
});
