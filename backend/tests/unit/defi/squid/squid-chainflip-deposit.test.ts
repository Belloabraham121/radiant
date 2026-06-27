import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SquidDataType } from "@0xsquid/squid-types";
import { AppError } from "../../../../src/errors/app-error.js";
import { executeSquidChainflipDepositRoute } from "../../../../src/services/defi/squid/squid-execute-providers.service.js";
import {
  setGetSquidChainflipDepositAddressForTests,
} from "../../../../src/services/defi/squid/squid-deposit.service.js";
import { setSendSolanaChainflipDepositForTests } from "../../../../src/services/wallet/solana-transaction.service.js";

describe("executeSquidChainflipDepositRoute validation order", () => {
  let transferCalled = false;

  afterEach(() => {
    transferCalled = false;
    setSendSolanaChainflipDepositForTests(null);
    setGetSquidChainflipDepositAddressForTests(null);
  });

  it("validates bridge type before broadcasting Solana deposit transfer", async () => {
    setGetSquidChainflipDepositAddressForTests(async () => ({
      depositAddress: "35tWpkpFr7UawcpuXm6ir1nN1v5tfoJgKj84xv1YukZn",
      amount: "100000000",
      chainflipStatusTrackingId: "5994435-Solana-26351",
    }));
    setSendSolanaChainflipDepositForTests(async () => {
      transferCalled = true;
      return {
        hash: "0xtransfer",
        solana_address: "SolanaAddress1111111111111111111111111111",
        effects_status: "success",
      };
    });

    await assert.rejects(
      executeSquidChainflipDepositRoute({
        privyUserId: "user-1",
        quoteId: "quote-1",
        toEvmChainId: undefined,
        agentWallet: {
          privy_wallet_id: "wallet-1",
          address: "SolanaAddress1111111111111111111111111111",
          chain_id: "solana",
          signer_added: true,
        },
        route: {
          quoteId: "quote-1",
          params: {
            fromChain: "solana-mainnet-beta",
            toChain: "8453",
            fromToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            toToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
            fromAmount: "100000000",
          },
          transactionRequest: {
            type: SquidDataType.ChainflipDepositAddress,
            request: { quote: {} },
          },
        },
      }),
      (err: unknown) =>
        err instanceof AppError && err.code === "SQUID_VALIDATION_ERROR",
    );
    assert.equal(transferCalled, false);
  });
});
