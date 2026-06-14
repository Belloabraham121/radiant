import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeWsResourcesJson } from "../../../src/services/walrus/ws-resources.js";

describe("mergeWsResourcesJson", () => {
  it("adds SPA fallback route for HashRouter apps", () => {
    const result = mergeWsResourcesJson(undefined, { project: "abc" });
    assert.deepEqual(result.routes, { "/*": "/index.html" });
    assert.equal(result.metadata?.project, "abc");
  });

  it("preserves existing site object_id and merges routes", () => {
    const result = mergeWsResourcesJson({
      object_id: "0xabc",
      routes: { "/api/*": "/api/index.html" },
    });
    assert.equal(result.object_id, "0xabc");
    assert.equal(result.routes["/api/*"], "/api/index.html");
    assert.equal(result.routes["/*"], "/index.html");
  });
});
