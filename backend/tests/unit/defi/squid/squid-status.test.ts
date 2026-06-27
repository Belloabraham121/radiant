import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeSquidStatus,
} from "../../../../src/services/defi/squid/squid-normalize.js";
import {
  resolveSquidBridgeType,
  SQUID_CHAINFLIP_ARBITRUM_EVM_CHAIN_ID,
} from "../../../../src/services/defi/squid/squid-status.service.js";
import {
  buildSquidTrackingMeta,
  isTerminalSquidStatus,
  squidStatusInputFromTracking,
} from "../../../../src/services/defi/squid/squid-tracking.js";

describe("squid status normalization", () => {
  it("maps success status", () => {
    const result = normalizeSquidStatus({
      status: {
        status: "success",
        squidTransactionStatus: "success",
        toChain: {
          transactionId: "0xdest",
          blockNumber: "1",
          callEventStatus: "success",
          callEventLog: [],
          chainData: { chainId: "8453" } as never,
          transactionUrl: "",
        },
      },
      transactionId: "0xsource",
      quoteId: "quote-1",
      from: { chain_id: "ethereum", evm_chain_id: 1 },
      to: { chain_id: "ethereum", evm_chain_id: 8453 },
    });
    assert.equal(result.status, "SUCCESS");
    assert.equal(result.receiving_tx_hash, "0xdest");
  });

  it("maps needs_gas and not_found", () => {
    const needsGas = normalizeSquidStatus({
      status: { gasStatus: "needs_gas" },
      transactionId: "tx-1",
      quoteId: "quote-1",
      from: { chain_id: "sui" },
      to: { chain_id: "ethereum", evm_chain_id: 8453 },
    });
    assert.equal(needsGas.status, "NEEDS_GAS");
    assert.match(needsGas.substatus_message ?? "", /gas/i);

    const notFound = normalizeSquidStatus({
      status: { status: "not_found" },
      transactionId: "tx-2",
      quoteId: "quote-2",
      from: { chain_id: "solana" },
      to: { chain_id: "ethereum", evm_chain_id: 42161 },
    });
    assert.equal(notFound.status, "NOT_FOUND");
  });

  it("terminal helper recognizes completed states", () => {
    assert.equal(isTerminalSquidStatus("SUCCESS"), true);
    assert.equal(isTerminalSquidStatus("PARTIAL_SUCCESS"), true);
    assert.equal(isTerminalSquidStatus("FAILED"), true);
    assert.equal(isTerminalSquidStatus("NOT_FOUND"), true);
    assert.equal(isTerminalSquidStatus("PENDING"), false);
  });

  it("resolveSquidBridgeType maps Arbitrum vs other EVM destinations", () => {
    assert.equal(resolveSquidBridgeType(SQUID_CHAINFLIP_ARBITRUM_EVM_CHAIN_ID), "chainflip");
    assert.equal(resolveSquidBridgeType(8453), "chainflipmultihop");
    assert.equal(resolveSquidBridgeType(undefined), undefined);
  });

  it("squidStatusInputFromTracking passes chainflip id and bridgeType", () => {
    const tracking = buildSquidTrackingMeta(
      {
        from_chain_id: "solana",
        to_chain_id: "ethereum",
        to_evm_chain_id: 8453,
      },
      {
        route_id: "squid:route-1",
        quote_id: "quote-1",
        request_id: null,
        tx_hashes: ["sol-tx-1"],
        effects_status: "pending",
        approval_tx_hash: null,
        bridge_started_at: new Date().toISOString(),
        estimated_duration_seconds: 120,
        chainflip_deposit: {
          deposit_address: "Dep0s1tAddr3551111111111111111111111111111",
          amount: "100000000",
          chainflip_status_tracking_id: "5994435-Solana-26351",
          bridge_type: "chainflipmultihop",
        },
      },
    );

    const statusInput = squidStatusInputFromTracking(tracking);
    assert.equal(statusInput.transaction_id, "5994435-Solana-26351");
    assert.equal(statusInput.bridge_type, "chainflipmultihop");
    assert.equal(statusInput.quote_id, "quote-1");
  });
});
