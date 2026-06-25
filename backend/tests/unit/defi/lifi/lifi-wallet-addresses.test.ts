import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../../src/errors/app-error.js";
import {
  assertBridgeWalletAddressShapes,
  resolveLifiQuoteAddressesFromBook,
} from "../../../../src/services/defi/lifi/lifi-wallet-addresses.js";

const SUI_ADDRESS =
  "0xf0e04844ba209c829c28608164f500d835d18a11a1b5697eaf81817c52c694e5";
const EVM_ADDRESS = "0xAbC12345678901234567890123456789012345678";
const SOLANA_ADDRESS = "7EqQdEUGxqMLqE5X8b8Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y";

describe("resolveLifiQuoteAddressesFromBook", () => {
  it("resolves Sui source and Base destination wallets for Sui→Base", () => {
    const addresses = resolveLifiQuoteAddressesFromBook(
      { chain_id: "sui" },
      { chain_id: "ethereum", evm_chain_id: 8453 },
      { sui: SUI_ADDRESS, ethereum: EVM_ADDRESS },
    );

    assert.equal(addresses.fromAddress, SUI_ADDRESS);
    assert.equal(addresses.toAddress, EVM_ADDRESS);
    assert.notEqual(addresses.fromAddress, addresses.toAddress);
  });

  it("resolves Base source and Sui destination wallets for Base→Sui", () => {
    const addresses = resolveLifiQuoteAddressesFromBook(
      { chain_id: "ethereum", evm_chain_id: 8453 },
      { chain_id: "sui" },
      { sui: SUI_ADDRESS, ethereum: EVM_ADDRESS },
    );

    assert.equal(addresses.fromAddress, EVM_ADDRESS);
    assert.equal(addresses.toAddress, SUI_ADDRESS);
  });

  it("uses the same EVM wallet for EVM L2→L1 bridges", () => {
    const addresses = resolveLifiQuoteAddressesFromBook(
      { chain_id: "ethereum", evm_chain_id: 8453 },
      { chain_id: "ethereum", evm_chain_id: 1 },
      { ethereum: EVM_ADDRESS },
    );

    assert.equal(addresses.fromAddress, EVM_ADDRESS);
    assert.equal(addresses.toAddress, EVM_ADDRESS);
  });

  it("resolves Solana source and EVM destination for Solana→Base", () => {
    const addresses = resolveLifiQuoteAddressesFromBook(
      { chain_id: "solana" },
      { chain_id: "ethereum", evm_chain_id: 8453 },
      { solana: SOLANA_ADDRESS, ethereum: EVM_ADDRESS },
    );

    assert.equal(addresses.fromAddress, SOLANA_ADDRESS);
    assert.equal(addresses.toAddress, EVM_ADDRESS);
  });

  it("rejects from_address that does not match the source agent wallet", () => {
    assert.throws(
      () =>
        resolveLifiQuoteAddressesFromBook(
          { chain_id: "sui" },
          { chain_id: "ethereum", evm_chain_id: 8453 },
          { sui: SUI_ADDRESS, ethereum: EVM_ADDRESS },
          { fromAddress: EVM_ADDRESS },
        ),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "VALIDATION_ERROR" &&
        /from_address must match/i.test(err.message),
    );
  });

  it("rejects missing destination wallet for cross-ecosystem bridge", () => {
    assert.throws(
      () =>
        resolveLifiQuoteAddressesFromBook(
          { chain_id: "sui" },
          { chain_id: "ethereum", evm_chain_id: 8453 },
          { sui: SUI_ADDRESS },
        ),
      (err: unknown) => err instanceof AppError && err.code === "WALLET_NOT_FOUND",
    );
  });

  it("matches EVM addresses case-insensitively for explicit from_address", () => {
    const addresses = resolveLifiQuoteAddressesFromBook(
      { chain_id: "ethereum", evm_chain_id: 8453 },
      { chain_id: "ethereum", evm_chain_id: 1 },
      { ethereum: EVM_ADDRESS },
      { fromAddress: EVM_ADDRESS.toLowerCase() },
    );

    assert.equal(addresses.fromAddress, EVM_ADDRESS);
  });

  it("rejects Sui address as EVM destination wallet", () => {
    assert.throws(
      () =>
        assertBridgeWalletAddressShapes(
          { chain_id: "sui" },
          { chain_id: "ethereum", evm_chain_id: 8453 },
          SUI_ADDRESS,
          SUI_ADDRESS,
        ),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "WALLET_ADDRESS_MISMATCH" &&
        /not your Sui address/i.test(err.message),
    );
  });
});
