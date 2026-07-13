import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import {
  classifyRecipientAddress,
  parseSingleTransferIntent,
} from "../../../src/services/agent/transfer/transfer-intent-parser.js";
import { tryExecuteTransferFromMessage } from "../../../src/services/agent/transfer/single-transfer-flow.js";
import { setExecuteTransactionWithApprovalHandlerForTests } from "../../../src/services/agent/execute-transaction-with-approval.js";
import type { ExecuteTransactionInput } from "../../../src/services/chains/types.js";

const EVM_RECIPIENT = "0x28482b1279e442f49ee76351801232d58f341cb9";
const SUI_RECIPIENT =
  "0x7fbcb50e56e40b45c69eb75d5b5f34b1a3d5a4d7c2b8e6f1a2c3d4e5f6a7b8c9";

function enableTestChains(): void {
  process.env.ENABLED_CHAINS = "sui,ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_CHAIN_IDS = "1,42161,8453";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

function clearTestChains(): void {
  delete process.env.ENABLED_CHAINS;
  delete process.env.ENABLED_EVM_CHAIN_IDS;
  delete process.env.EVM_CHAIN_IDS;
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

describe("transfer-intent-parser", () => {
  beforeEach(enableTestChains);
  afterEach(clearTestChains);

  it("classifies recipient addresses by shape", () => {
    assert.equal(classifyRecipientAddress(EVM_RECIPIENT), "evm");
    assert.equal(classifyRecipientAddress(SUI_RECIPIENT), "sui");
    assert.equal(classifyRecipientAddress("0x1234"), null);
    assert.equal(classifyRecipientAddress("base"), null);
  });

  it("parses the exact user message — send USDC on Base to an address", () => {
    const intent = parseSingleTransferIntent(
      `send 6.097209 USDC on Base to ${EVM_RECIPIENT}`,
    );
    assert.ok(intent);
    assert.equal(intent!.input.chain_id, "ethereum");
    assert.equal(intent!.input.action, "transfer_token");
    assert.equal(intent!.input.params.token, "USDC");
    assert.equal(intent!.input.params.amount_display, 6.097209);
    assert.equal(intent!.input.params.evm_chain_id, 8453);
    assert.equal(intent!.input.params.recipient, EVM_RECIPIENT);
  });

  it("parses when the chain hint comes after the address", () => {
    const intent = parseSingleTransferIntent(
      `Send 6.097209 USDC to ${EVM_RECIPIENT} on Base`,
    );
    assert.ok(intent);
    assert.equal(intent!.input.params.evm_chain_id, 8453);
  });

  it("preserves recipient casing from the raw message", () => {
    const checksummed = "0x28482B1279E442f49eE76351801232d58F341CB9";
    const intent = parseSingleTransferIntent(
      `send 1 USDC on base to ${checksummed}`,
    );
    assert.ok(intent);
    assert.equal(intent!.input.params.recipient, checksummed);
  });

  it("parses native ETH transfers with a chain hint", () => {
    const intent = parseSingleTransferIntent(
      `send 0.005 eth on arbitrum to ${EVM_RECIPIENT}`,
    );
    assert.ok(intent);
    assert.equal(intent!.input.action, "transfer_eth");
    assert.equal(intent!.input.params.evm_chain_id, 42161);
    assert.equal(intent!.input.params.amount_display, 0.005);
  });

  it("infers the chain from a single-network token (ARB)", () => {
    const intent = parseSingleTransferIntent(`transfer 3 ARB to ${EVM_RECIPIENT}`);
    assert.ok(intent);
    assert.equal(intent!.input.params.evm_chain_id, 42161);
  });

  it("parses Sui native transfers to a Sui address", () => {
    const intent = parseSingleTransferIntent(`send 2.5 SUI to ${SUI_RECIPIENT}`);
    assert.ok(intent);
    assert.equal(intent!.input.chain_id, "sui");
    assert.equal(intent!.input.action, "transfer_sui");
    assert.equal(intent!.input.params.amount_mist, "2500000000");
  });

  it("declines ambiguity and non-transfer messages", () => {
    // USDC without a chain exists on several networks — needs the LLM to ask.
    assert.equal(parseSingleTransferIntent(`send 5 USDC to ${EVM_RECIPIENT}`), null);
    // ETH without a chain hint is ambiguous across enabled networks.
    assert.equal(parseSingleTransferIntent(`send 0.1 ETH to ${EVM_RECIPIENT}`), null);
    // USD amounts need a price conversion.
    assert.equal(
      parseSingleTransferIntent(`send $5 of USDC on base to ${EVM_RECIPIENT}`),
      null,
    );
    // No address → not a recipient transfer.
    assert.equal(parseSingleTransferIntent("send 5 usdc from base to arbitrum"), null);
    // No amount.
    assert.equal(parseSingleTransferIntent(`send USDC on base to ${EVM_RECIPIENT}`), null);
    // Non-native token to a Sui address is not supported by the fast path.
    assert.equal(parseSingleTransferIntent(`send 5 USDC to ${SUI_RECIPIENT}`), null);
    // No transfer verb.
    assert.equal(parseSingleTransferIntent(`balance of ${EVM_RECIPIENT}`), null);
  });
});

describe("single-transfer-flow", () => {
  beforeEach(enableTestChains);
  afterEach(() => {
    clearTestChains();
    setExecuteTransactionWithApprovalHandlerForTests(null);
  });

  it("routes the parsed transfer through execute-with-approval", async () => {
    let seen: ExecuteTransactionInput | null = null;
    setExecuteTransactionWithApprovalHandlerForTests(async (_userId, input) => {
      seen = input;
      return {
        status: "executed",
        result: {
          chain_id: "ethereum",
          digest: "0xabc",
          address: "0x" + "1".repeat(40),
          effects_status: "success",
          evm_chain_id: 8453,
        },
      };
    });

    const outcome = await tryExecuteTransferFromMessage(
      "user-1",
      `send 6.097209 USDC on Base to ${EVM_RECIPIENT}`,
      "session-1",
    );

    assert.ok(outcome);
    assert.ok(seen);
    assert.equal(seen!.action, "transfer_token");
    assert.equal(seen!.params.evm_chain_id, 8453);
    assert.match(outcome!.reply, /Transfer submitted: 6\.097209 USDC/);
    assert.match(outcome!.reply, /0xabc/);
    assert.equal(outcome!.pending_transaction, null);
  });

  it("surfaces the approval dialog when the amount is above threshold", async () => {
    setExecuteTransactionWithApprovalHandlerForTests(async (_userId, input) => ({
      status: "approval_required",
      pending: {
        id: "pending-1",
        chain_id: input.chain_id,
        action: input.action,
        params: input.params,
        summary: "Send 6.097209 USDC",
        amount_display: "6.097209 USDC",
        quote_expires_at: null,
        fiat_preview: null,
        defi_preview: null,
        approval_outcome: "approval_required",
      },
    }));

    const outcome = await tryExecuteTransferFromMessage(
      "user-1",
      `send 6.097209 USDC on Base to ${EVM_RECIPIENT}`,
      "session-1",
    );

    assert.ok(outcome);
    assert.match(outcome!.reply, /needs your approval/);
    assert.equal(outcome!.pending_transaction?.id, "pending-1");
  });

  it("returns null for messages the parser declines", async () => {
    setExecuteTransactionWithApprovalHandlerForTests(async () => {
      throw new Error("should not execute");
    });
    const outcome = await tryExecuteTransferFromMessage(
      "user-1",
      "send 5 usdc from base to arbitrum",
      "session-1",
    );
    assert.equal(outcome, null);
  });
});
