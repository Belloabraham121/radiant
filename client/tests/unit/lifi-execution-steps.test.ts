import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLifiExecutionSteps } from "../../src/lib/chat-execution-steps";

describe("buildLifiExecutionSteps", () => {
  it("builds running bridge steps for pending Li-Fi execute result", () => {
    const steps = buildLifiExecutionSteps([
      {
        name: "query_chain",
        query: "cross_chain_routes",
        result: {
          routes: [
            {
              from_token_symbol: "USDC",
              to_token_symbol: "USDC",
              bridges: ["stargate"],
              estimated_duration_seconds: 90,
            },
          ],
        },
      },
      {
        name: "execute_transaction",
        action: "cross_chain_swap",
        result: {
          status: "executed",
          agent_transaction_id: "tx-1",
          result: {
            chain_id: "ethereum",
            digest: "0xabc1234567890",
            effects_status: "pending",
            lifi: {
              tx_hashes: ["0xabc1234567890"],
              bridge_tool: "stargate",
              estimated_duration_seconds: 90,
              tracking_status: "PENDING",
              from_chain_id: "ethereum",
              to_chain_id: "ethereum",
              from_evm_chain_id: 1,
              to_evm_chain_id: 8453,
            },
          },
        },
      },
    ]);

    assert.ok(steps);
    assert.equal(steps?.some((step) => step.id === "lifi-bridge" && step.status === "running"), true);
    const bridgeStep = steps?.find((step) => step.id === "lifi-bridge");
    assert.equal(bridgeStep?.label, "Bridging (~2m)");
    assert.equal(bridgeStep?.estimatedDurationSeconds, 90);
  });

  it("uses live countdown fields when bridge_started_at is present", () => {
    const steps = buildLifiExecutionSteps([
      {
        name: "execute_transaction",
        action: "cross_chain_swap",
        result: {
          status: "executed",
          result: {
            chain_id: "ethereum",
            digest: "0xabc",
            effects_status: "pending",
            lifi: {
              tx_hashes: ["0xabc"],
              estimated_duration_seconds: 90,
              bridge_started_at: "2026-01-01T00:00:00.000Z",
              tracking_status: "PENDING",
              from_chain_id: "ethereum",
              to_chain_id: "ethereum",
              from_evm_chain_id: 1,
              to_evm_chain_id: 8453,
            },
          },
        },
      },
    ]);

    const bridgeStep = steps?.find((step) => step.id === "lifi-bridge");
    assert.equal(bridgeStep?.label, "Bridging");
    assert.equal(bridgeStep?.bridgeStartedAt, "2026-01-01T00:00:00.000Z");
    assert.equal(bridgeStep?.countdownKind, "bridge");
  });

  it("builds complete steps when tracking status is DONE", () => {
    const steps = buildLifiExecutionSteps([
      {
        name: "execute_transaction",
        action: "cross_chain_swap",
        result: {
          status: "executed",
          result: {
            chain_id: "ethereum",
            digest: "0xabc",
            effects_status: "success",
            lifi: {
              tx_hashes: ["0xabc"],
              tracking_status: "DONE",
              receiving_tx_hash: "0xdest",
              estimated_duration_seconds: 60,
            },
          },
        },
      },
    ]);

    assert.ok(steps?.some((step) => step.id === "lifi-complete" && step.status === "ok"));
  });
});
