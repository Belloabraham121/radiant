import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../src/errors/app-error.js";
import {
  parseAmountLamports,
  parseSolanaRecipient,
} from "../../src/services/wallet/solana-transaction.service.js";

describe("solana-transaction param parsing", () => {
  it("parseSolanaRecipient accepts recipient or to", () => {
    const address = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    assert.equal(parseSolanaRecipient({ recipient: address }), address);
    assert.equal(parseSolanaRecipient({ to: address }), address);
  });

  it("parseSolanaRecipient rejects invalid address", () => {
    assert.throws(
      () => parseSolanaRecipient({ recipient: "not-a-pubkey" }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("parseAmountLamports accepts amount_lamports or amount_atomic", () => {
    assert.equal(parseAmountLamports({ amount_lamports: "1000" }), 1000n);
    assert.equal(parseAmountLamports({ amount_atomic: "42" }), 42n);
  });
});
