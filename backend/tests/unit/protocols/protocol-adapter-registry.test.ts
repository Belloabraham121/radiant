import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deepBookAppAdapter } from "../../../src/services/protocols/deepbook-app.adapter.js";
import { genericAppAdapter } from "../../../src/services/protocols/generic-app.adapter.js";
import {
  getAppProtocolAdapter,
  listAppProtocolIds,
} from "../../../src/services/protocols/protocol-adapter-registry.js";
import { polymarketAppAdapter } from "../../../src/services/protocols/polymarket-app.adapter.js";
import { resolveAppProtocolId } from "../../../src/services/protocols/resolve-project-protocol.js";

const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("protocol adapter registry", () => {
  it("lists deepbook, polymarket, and custom adapters", () => {
    assert.deepEqual(listAppProtocolIds().sort(), ["custom", "deepbook", "polymarket"]);
    assert.equal(getAppProtocolAdapter("deepbook").id, "deepbook");
    assert.equal(getAppProtocolAdapter("polymarket").id, "polymarket");
  });

  it("deepBookAppAdapter supports swap and not transfer", () => {
    assert.equal(deepBookAppAdapter.supportsAction("swap"), true);
    assert.equal(deepBookAppAdapter.supportsAction("transfer"), false);
    assert.ok(deepBookAppAdapter.supportedActions().includes("swap"));
  });

  it("genericAppAdapter supports transfer only", () => {
    assert.equal(genericAppAdapter.supportsAction("transfer"), true);
    assert.equal(genericAppAdapter.supportsAction("swap"), false);
  });

  it("polymarketAppAdapter is a stub with no supported actions", () => {
    assert.equal(polymarketAppAdapter.supportedActions().length, 0);
    assert.equal(polymarketAppAdapter.supportsAction("swap"), false);
  });
});

describe("resolveAppProtocolId", () => {
  it("maps swap action to deepbook", () => {
    assert.equal(resolveAppProtocolId("swap"), "deepbook");
  });

  it("maps transfer action to custom", () => {
    assert.equal(resolveAppProtocolId("transfer"), "custom");
  });

  it("uses project schema protocol polymarket when set", () => {
    assert.equal(
      resolveAppProtocolId("swap", {
        id: projectId,
        template: "custom",
        action_schema: {
          schema_version: 1,
          app_id: projectId,
          protocol: "polymarket",
          actions: [],
        },
      }),
      "polymarket",
    );
  });

  it("infers deepbook from swap template project", () => {
    assert.equal(
      resolveAppProtocolId("transfer", {
        id: projectId,
        template: "swap",
        action_schema: null,
      }),
      "deepbook",
    );
  });
});

describe("polymarketAppAdapter.execute", () => {
  it("returns PROTOCOL_NOT_IMPLEMENTED as thrown AppError", async () => {
    await assert.rejects(
      () =>
        polymarketAppAdapter.execute(
          "swap",
          {},
          { privyUserId: "did:privy:test", source: "ui" },
        ),
      (err: unknown) =>
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "PROTOCOL_NOT_IMPLEMENTED",
    );
  });
});
