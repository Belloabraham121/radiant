import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import { mapStellarSimulationError } from "../../../src/infrastructure/stellar/errors.js";
import { xlmBalanceStringToStroops, stroopsToAmountString } from "../../../src/utils/stellar-amount.js";
import { getStellarTransactionHashHex } from "../../../src/services/wallet/stellar-signing.service.js";
import { TransactionBuilder, Account, Asset, Operation, BASE_FEE, Keypair } from "@stellar/stellar-sdk";

describe("stellar adapter helpers", () => {
  it("parses Horizon XLM balance strings to stroops", () => {
    assert.equal(xlmBalanceStringToStroops("10.5"), 105_000_000n);
    assert.equal(xlmBalanceStringToStroops("0.0000001"), 1n);
  });

  it("formats stroops for payment amounts", () => {
    assert.equal(stroopsToAmountString(10_000_000n), "1");
    assert.equal(stroopsToAmountString(10_500_000n), "1.05");
  });

  it("maps trustline simulation errors to INSUFFICIENT_BALANCE", () => {
    const err = mapStellarSimulationError(new Error("op_no_trust"));
    assert.ok(err instanceof AppError);
    assert.equal(err.code, "INSUFFICIENT_BALANCE");
  });

  it("builds a deterministic transaction hash hex for Privy signing", () => {
    const destination = Keypair.random().publicKey();
    const tx = new TransactionBuilder(
      new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "1"),
      {
        fee: BASE_FEE,
        networkPassphrase: "Test SDF Network ; September 2015",
      },
    )
      .addOperation(
        Operation.payment({
          destination,
          asset: Asset.native(),
          amount: "1",
        }),
      )
      .setTimeout(30)
      .build();

    const hashHex = getStellarTransactionHashHex(tx);
    assert.match(hashHex, /^0x[0-9a-f]{64}$/);
  });
});
