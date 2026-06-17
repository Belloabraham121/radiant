import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetPrivyWalletEnvForTests } from "../../../src/config/privy.js";
import { resolveSuiRpcConnection } from "../../../src/infrastructure/sui/rpc-config.js";
import { resetSuiClientForTests } from "../../../src/infrastructure/sui/client.js";

describe("resolveSuiRpcConnection", () => {
  beforeEach(() => {
    resetPrivyWalletEnvForTests();
    resetSuiClientForTests();
    delete process.env.SUI_RPC_API_KEY;
  });

  afterEach(() => {
    resetPrivyWalletEnvForTests();
    resetSuiClientForTests();
    delete process.env.SUI_RPC_API_KEY;
  });

  it("uses JSON-RPC mode for Alchemy HTTP URLs", () => {
    process.env.SUI_RPC_URL =
      "https://sui-mainnet.g.alchemy.com/v2/test-api-key-123";
    const conn = resolveSuiRpcConnection();
    assert.equal(conn.mode, "json-rpc");
    if (conn.mode !== "json-rpc") return;
    assert.equal(conn.network, "mainnet");
    assert.equal(conn.url, "https://sui-mainnet.g.alchemy.com/v2/test-api-key-123");
  });

  it("does not treat Alchemy URLs as gRPC-web base URLs with /v2/ in the path", () => {
    process.env.SUI_RPC_URL =
      "https://sui-mainnet.g.alchemy.com/v2/test-api-key-123";
    const conn = resolveSuiRpcConnection();
    assert.notEqual(conn.mode, "grpc-web");
  });

  it("supports Mysten fullnode URLs over gRPC-web", () => {
    process.env.SUI_RPC_URL = "https://fullnode.mainnet.sui.io";
    const conn = resolveSuiRpcConnection();
    assert.equal(conn.mode, "grpc-web");
    if (conn.mode !== "grpc-web") return;
    assert.equal(conn.network, "mainnet");
    assert.equal(conn.baseUrl, "https://fullnode.mainnet.sui.io:443");
    assert.equal(conn.apiKey, undefined);
  });

  it("prefers SUI_RPC_API_KEY over path segment for gRPC-web hosts", () => {
    process.env.SUI_RPC_URL = "https://sui-mainnet.g.alchemy.com:443";
    process.env.SUI_RPC_API_KEY = "from-env";
    const conn = resolveSuiRpcConnection();
    assert.equal(conn.mode, "grpc-web");
    if (conn.mode !== "grpc-web") return;
    assert.equal(conn.apiKey, "from-env");
  });
});
