import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import {
  buildPendingTransactionPreview,
  createPendingTransaction,
  rejectPendingTransaction,
  transferRequiresApprovalWithPermissions,
} from "../../../src/services/agent/transaction-approval.service.js";
import {
  setCoingeckoFetchForTests,
} from "../../../src/services/market/coingecko.client.js";
import {
  mockUnitUsdPricesForAutoApproveTests,
  resetAutoApprovePriceMocksForTests,
} from "../../helpers/auto-approve-prices.js";

describe("transaction approval", () => {
  before(() => {
    process.env.COINGECKO_API_KEY = "CG-test-key";
    mockUnitUsdPricesForAutoApproveTests();
  });

  afterEach(() => {
    resetAutoApprovePriceMocksForTests();
    mockUnitUsdPricesForAutoApproveTests();
  });

  it("auto-approves transfers at or below default USD threshold", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "transfer_native",
        params: {
          recipient:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          amount_atomic: String(25n * 1_000_000_000n),
        },
      }),
      false,
    );
  });

  it("requires approval above default USD threshold", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "transfer_native",
        params: {
          recipient:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          amount_atomic: String(26n * 1_000_000_000n),
        },
      }),
      true,
    );
  });

  it("requires approval for execute_bytes when auto-approve is disabled", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(
        { ...defaultAgentPermissions(), auto_approve_enabled: false },
        {
          chain_id: "sui",
          action: "execute_bytes",
          params: { transaction_bytes: "abcd" },
        },
      ),
      true,
    );
  });

  it("always requires approval for execute_bytes when auto-approve is enabled", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "execute_bytes",
        params: { transaction_bytes: "YWJjZA==" },
      }),
      true,
    );
  });

  it("requires approval for every transfer when auto-approve is disabled", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(
        { ...defaultAgentPermissions(), auto_approve_enabled: false },
        {
          chain_id: "sui",
          action: "transfer_native",
          params: {
            recipient:
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            amount_atomic: "1000000",
          },
        },
      ),
      true,
    );
  });

  it("uses custom max USD threshold when auto-approve is enabled", async () => {
    const permissions = { ...defaultAgentPermissions(), auto_approve_max_usd: 100 };
    assert.equal(
      await transferRequiresApprovalWithPermissions(permissions, {
        chain_id: "sui",
        action: "transfer_native",
        params: {
          recipient:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          amount_atomic: String(50n * 1_000_000_000n),
        },
      }),
      false,
    );
    assert.equal(
      await transferRequiresApprovalWithPermissions(permissions, {
        chain_id: "sui",
        action: "transfer_native",
        params: {
          recipient:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          amount_atomic: String(101n * 1_000_000_000n),
        },
      }),
      true,
    );
  });

  it("requires approval when USD value is unknown", async () => {
    resetAutoApprovePriceMocksForTests();
    setCoingeckoFetchForTests(
      async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "transfer_native",
        params: {
          recipient:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          amount_atomic: "1000000",
        },
      }),
      true,
    );
    mockUnitUsdPricesForAutoApproveTests();
  });

  it("creates pending provision manager with gas-only display", async () => {
    const pending = await buildPendingTransactionPreview("did:privy:test", {
      chain_id: "sui",
      action: "deepbook_provision_manager",
      params: {},
    });

    assert.match(pending.summary, /Create DeepBook balance manager/i);
    assert.match(pending.amount_display, /Network fee only/i);
  });

  it("provision manager always requires approval when auto-approve is on", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "deepbook_provision_manager",
        params: {},
      }),
      true,
    );
  });

  it("always requires approval for stake and governance actions", async () => {
    const permissions = defaultAgentPermissions();
    assert.equal(
      await transferRequiresApprovalWithPermissions(permissions, {
        chain_id: "sui",
        action: "deepbook_stake",
        params: { pool_key: "SUI_USDC", amount: 10 },
      }),
      true,
    );
    assert.equal(
      await transferRequiresApprovalWithPermissions(permissions, {
        chain_id: "sui",
        action: "deepbook_submit_proposal",
        params: {
          pool_key: "SUI_USDC",
          taker_fee: 0.001,
          maker_fee: 0.0005,
          stake_required: 100,
        },
      }),
      true,
    );
    assert.equal(
      await transferRequiresApprovalWithPermissions(permissions, {
        chain_id: "sui",
        action: "deepbook_vote",
        params: {
          pool_key: "SUI_USDC",
          proposal_id:
            "0x6149bfe6808f0d6a9db1c766552b7ae1df477f5885493436214ed4228e842393",
        },
      }),
      true,
    );
  });

  it("rejects deposit pending without amount", async () => {
    await assert.rejects(
      () =>
        createPendingTransaction("did:privy:test", {
          chain_id: "sui",
          action: "deepbook_deposit",
          params: { coin_key: "SUI" },
        }),
      /VALIDATION_ERROR|amount/i,
    );
  });

  it("builds pending transfer preview", async () => {
    const pending = await buildPendingTransactionPreview("did:privy:test", {
      chain_id: "sui",
      action: "transfer_native",
      params: {
        recipient:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        amount_atomic: String(30n * 1_000_000_000n),
      },
    });

    assert.ok(pending.id);
    assert.match(pending.summary, /Send/);
  });
});
