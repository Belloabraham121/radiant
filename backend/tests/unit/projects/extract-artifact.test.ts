import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractArtifactFromToolCalls } from "../../../src/services/projects/extract-artifact.js";
import { GENERATE_APP_TOOL_NAME } from "../../../src/services/projects/generate-app.tool.js";

describe("extractArtifactFromToolCalls", () => {
  it("returns artifact from generate_app tool result", () => {
    const artifact = {
      project_id: "proj-1",
      name: "Demo",
      tagline: "Hi",
      template: "custom",
      revision: 0,
      files: [{ path: "src/App.tsx", content: "export default () => null" }],
    };

    const result = extractArtifactFromToolCalls([
      { name: GENERATE_APP_TOOL_NAME, result: { artifact, project_id: "proj-1" } },
      { name: "query_chain", result: { balance: 1 } },
    ]);

    assert.deepEqual(result, artifact);
  });

  it("returns null when no generate_app success", () => {
    assert.equal(
      extractArtifactFromToolCalls([{ name: "query_chain", result: { balance: 1 } }]),
      null,
    );
    assert.equal(extractArtifactFromToolCalls([]), null);
  });
});
