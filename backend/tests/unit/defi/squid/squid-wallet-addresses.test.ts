import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertBridgeWalletAddressShapes,
  resolveSquidQuoteAddressesFromBook,
} from "../../../../src/services/defi/squid/squid-wallet-addresses.js";
import { AppError } from "../../../../src/errors/app-error.js";

const EVM = "0x1111111111111111111111111111111111111111";
const SUI =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const SOL = "7EqQdEUFq1MX3wUoSqDHbJ7R9tJhJdJdJdJdJdJdJdJdJd";
const STELLAR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

describe("squid-wallet-addresses", () => {
  it("resolves EVM→EVM with same 0x address on both sides", () => {
    const resolved = resolveSquidQuoteAddressesFromBook(
      { chain_id: "ethereum", evm_chain_id: 1 },
      { chain_id: "ethereum", evm_chain_id: 8453 },
      { ethereum: EVM },
    );
    assert.equal(resolved.fromAddress, EVM);
    assert.equal(resolved.toAddress, EVM);
  });

  it("resolves Sui→Base corridor addresses", () => {
    const resolved = resolveSquidQuoteAddressesFromBook(
      { chain_id: "sui" },
      { chain_id: "ethereum", evm_chain_id: 8453 },
      { sui: SUI, ethereum: EVM },
    );
    assert.equal(resolved.fromAddress, SUI);
    assert.equal(resolved.toAddress, EVM);
  });

  it("resolves Solana→Arbitrum corridor addresses", () => {
    const resolved = resolveSquidQuoteAddressesFromBook(
      { chain_id: "solana" },
      { chain_id: "ethereum", evm_chain_id: 42161 },
      { solana: SOL, ethereum: EVM },
    );
    assert.equal(resolved.fromAddress, SOL);
    assert.equal(resolved.toAddress, EVM);
  });

  it("rejects Sui address as EVM destination", () => {
    assert.throws(
      () =>
        assertBridgeWalletAddressShapes(
          { chain_id: "sui" },
          { chain_id: "ethereum", evm_chain_id: 8453 },
          SUI,
          SUI,
        ),
      (err: unknown) => err instanceof AppError && err.code === "WALLET_ADDRESS_MISMATCH",
    );
  });

  it("rejects invalid Solana address shape", () => {
    assert.throws(
      () =>
        assertBridgeWalletAddressShapes(
          { chain_id: "solana" },
          { chain_id: "ethereum", evm_chain_id: 1 },
          "0xnotsolana",
          EVM,
        ),
      (err: unknown) => err instanceof AppError && err.code === "WALLET_ADDRESS_MISMATCH",
    );
  });

  it("accepts Stellar G-address on stellar corridor", () => {
    assert.doesNotThrow(() =>
      assertBridgeWalletAddressShapes(
        { chain_id: "stellar" },
        { chain_id: "ethereum", evm_chain_id: 1 },
        STELLAR,
        EVM,
      ),
    );
  });
});
