import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toSolanaBalanceResult } from "../../../src/services/chains/adapters/solana-balance.js";
import { lamportsToSol } from "../../../src/utils/solana-amount.js";

describe("solana adapter balance normalization", () => {
  it("maps lamports balance to BalanceResult with SOL fields", () => {
    const result = toSolanaBalanceResult({
      address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      balanceLamports: 2_500_000_000n,
      balanceSol: 2.5,
      funded: true,
    });

    assert.equal(result.chain_id, "solana");
    assert.equal(result.native_symbol, "SOL");
    assert.equal(result.balance_atomic, "2500000000");
    assert.equal(result.balance_display, 2.5);
    assert.equal(result.funded, true);
  });

  it("marks zero lamports as not funded", () => {
    const result = toSolanaBalanceResult({
      address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      balanceLamports: 0n,
      balanceSol: 0,
      funded: false,
    });

    assert.equal(result.funded, false);
    assert.equal(result.balance_atomic, "0");
  });
});

describe("lamportsToSol", () => {
  it("converts lamports to SOL", () => {
    assert.equal(lamportsToSol(1_000_000_000n), 1);
    assert.equal(lamportsToSol(0n), 0);
  });
});
