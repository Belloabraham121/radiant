import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAgentTransactionDate,
  formatAgentTransactionStatus,
  formatAgentTransactionsForChat,
} from "../../../src/services/agent-transaction/format-for-chat.js";
import type { AgentTransactionListItem } from "../../../src/services/agent-transaction/agent-transaction.types.js";

const sampleItem = (overrides: Partial<AgentTransactionListItem> = {}): AgentTransactionListItem => ({
  id: "00000000-0000-4000-8000-000000000001",
  status: "success",
  category: "swap",
  chain_id: "sui",
  title: "Swap on DeepBook (SUI_USDC)",
  amount_display: "0.5 SUI → ~1.2 USDC",
  digest: "9GjRb8giW9T2V5JorAeMnpXu66KzzA6m5HeBkqf5EVrm",
  explorer_url: "https://suiscan.xyz/mainnet/tx/9GjRb8giW9T2V5JorAeMnpXu66KzzA6m5HeBkqf5EVrm",
  effects_status: "success",
  session_id: "00000000-0000-4000-8000-000000000099",
  message_id: "00000000-0000-4000-8000-000000000098",
  created_at: "2026-06-13T00:48:00.000Z",
  completed_at: "2026-06-13T00:48:05.000Z",
  ...overrides,
});

describe("formatAgentTransactionsForChat", () => {
  it("formats status labels for chat", () => {
    assert.equal(formatAgentTransactionStatus("success"), "Success");
    assert.equal(formatAgentTransactionStatus("pending_approval"), "Awaiting approval");
    assert.equal(formatAgentTransactionStatus("failure"), "Failed");
  });

  it("formats created_at as a readable UTC date", () => {
    const formatted = formatAgentTransactionDate("2026-06-13T00:48:00.000Z");
    assert.match(formatted, /June 13, 2026/);
    assert.match(formatted, /UTC/);
  });

  it("includes date, amount, status, and digest for each item", () => {
    const summary = formatAgentTransactionsForChat([sampleItem()]);

    assert.match(summary, /0\.5 SUI → ~1\.2 USDC/);
    assert.match(summary, /Status: Success/);
    assert.match(summary, /Digest: 9GjRb8giW9T2V5JorAeMnpXu66KzzA6m5HeBkqf5EVrm/);
    assert.match(
      summary,
      /Explorer: https:\/\/suiscan\.xyz\/mainnet\/tx\/9GjRb8giW9T2V5JorAeMnpXu66KzzA6m5HeBkqf5EVrm/,
    );
    assert.match(summary, /Date: June 13, 2026/);
    assert.doesNotMatch(summary, /provide date/i);
  });

  it("omits digest line when digest is null", () => {
    const summary = formatAgentTransactionsForChat([sampleItem({ digest: null })]);
    assert.doesNotMatch(summary, /Digest:/);
  });

  it("returns empty-state copy when there are no items", () => {
    assert.equal(formatAgentTransactionsForChat([]), "No agent transactions found.");
  });
});
