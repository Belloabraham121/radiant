import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceMislabeledAppScopeFields,
  normalizeAppSearchTerm,
  scoreAppNameMatch,
} from "../../../src/services/projects/app-scope-resolver.service.js";
import { extractAppNameHintFromSegment } from "../../../src/services/agent/workflow/workflow-parser.js";

describe("app-scope-resolver", () => {
  it("normalizes app search terms", () => {
    assert.equal(normalizeAppSearchTerm("My Uniswap App"), "my uniswap");
    assert.equal(normalizeAppSearchTerm("uniswap-style DEX"), "uniswap style");
  });

  it("scores uniswap hint against uniswap project name", () => {
    assert.ok(scoreAppNameMatch("my uniswap app", "Uniswap Clone") >= 15);
    assert.ok(scoreAppNameMatch("uniswap", "DeepBook DEX") < 15);
  });

  it("prefers exact and substring matches", () => {
    assert.ok(
      scoreAppNameMatch("uniswap", "Uniswap") >
        scoreAppNameMatch("uniswap", "SUI Swap Dashboard"),
    );
  });

  it("extracts app name hints from user segments", () => {
    assert.equal(
      extractAppNameHintFromSegment("swap 1.6 SUI to USDC in my uniswap app"),
      "uniswap",
    );
    assert.equal(
      extractAppNameHintFromSegment("make a swap with my DeepBook DEX"),
      "DeepBook",
    );
  });
});
