import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { messageWithIntent } from "@mysten/sui/cryptography";
import {
  buildSuiTransactionIntentHex,
  parsePrivyEd25519Signature,
} from "../../src/services/wallet/sui-signing.service.js";

describe("sui-signing.service", () => {
  it("buildSuiTransactionIntentHex matches messageWithIntent hex encoding", () => {
    const txBytes = new Uint8Array([1, 2, 3, 4]);
    const intent = messageWithIntent("TransactionData", txBytes);
    const expected = Buffer.from(intent).toString("hex");

    assert.equal(buildSuiTransactionIntentHex(txBytes), expected);
  });

  it("parsePrivyEd25519Signature accepts 0x-prefixed 64-byte hex", () => {
    const sig = `0x${"ab".repeat(64)}`;
    const bytes = parsePrivyEd25519Signature(sig);
    assert.equal(bytes.length, 64);
    assert.equal(bytes[0], 0xab);
  });

  it("parsePrivyEd25519Signature rejects invalid length", () => {
    assert.throws(
      () => parsePrivyEd25519Signature("0xabcd"),
      /invalid Ed25519 signature/i,
    );
  });
});
