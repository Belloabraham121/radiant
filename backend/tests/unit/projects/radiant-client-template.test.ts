import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RADIANT_CLIENT_TEMPLATE_VERSION,
  RADIANT_CLIENT_TS,
} from "../../../src/services/projects/radiant-client-template.js";
import { RADIANT_AGENT_RUNTIME_TS } from "../../../src/services/projects/radiant-agent-runtime-template.js";

describe("radiant-client template", () => {
  it("is at expected version with execute helpers", () => {
    assert.equal(RADIANT_CLIENT_TEMPLATE_VERSION, 3);
    assert.match(RADIANT_CLIENT_TS, /export async function executeAction/);
    assert.match(RADIANT_CLIENT_TS, /export async function executeSwap/);
    assert.match(RADIANT_CLIENT_TS, /export async function executeFlashLoan/);
    assert.match(RADIANT_CLIENT_TS, /export async function executeStake/);
    assert.match(RADIANT_CLIENT_TS, /export async function executeUnstake/);
    assert.match(RADIANT_CLIENT_TS, /__RADIANT_INSTALLATION_ID__/);
    assert.match(RADIANT_CLIENT_TS, /isApprovalRequired/);
    assert.match(RADIANT_CLIENT_TS, /RadiantActionError/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /handleExternalEvent/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /data\.animate === true/);
    assert.match(RADIANT_AGENT_RUNTIME_TS, /setFieldValue/);
  });
});
