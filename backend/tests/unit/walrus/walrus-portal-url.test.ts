import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPortalUrlFromBase36,
  isMockWalrusSiteUrl,
  parsePortalUrlFromSiteBuilderOutput,
} from "../../../src/services/walrus/walrus-portal-url.js";

describe("walrus portal URLs", () => {
  it("detects mock deploy placeholder URLs", () => {
    assert.equal(
      isMockWalrusSiteUrl("https://07d61b6fc25d79ae470e675a66d82ba4.walrus.site/"),
      true,
    );
    assert.equal(
      isMockWalrusSiteUrl("http://3q7dwaf5a6egmuoi9fe0owij1x78d0csw1aid7opbwe8e7hp1m.localhost:3000"),
      false,
    );
  });

  it("parses portal URL from site-builder output", () => {
    const stdout = `
New site object ID: 0x95926fb4cd28705823af105900d704d1c56c17d55d994a0715479c175590f80a
For local development: http://3q7dwaf5a6egmuoi9fe0owij1x78d0csw1aid7opbwe8e7hp1m.localhost:3000
`;
    assert.equal(
      parsePortalUrlFromSiteBuilderOutput(stdout),
      "http://3q7dwaf5a6egmuoi9fe0owij1x78d0csw1aid7opbwe8e7hp1m.localhost:3000",
    );
  });

  it("builds testnet local portal URL from base36 id", () => {
    assert.equal(
      buildPortalUrlFromBase36("abc123", "http://localhost:3000"),
      "http://abc123.localhost:3000",
    );
  });

  it("builds mainnet wal.app URL from base36 id", () => {
    assert.equal(
      buildPortalUrlFromBase36("abc123", "https://wal.app"),
      "https://abc123.wal.app",
    );
  });
});
