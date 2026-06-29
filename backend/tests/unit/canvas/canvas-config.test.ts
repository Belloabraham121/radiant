import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { useCanvasBuilderStub } from "../../../src/config/canvas.js";

describe("useCanvasBuilderStub", () => {
  const savedStub = process.env.CANVAS_BUILDER_STUB;
  const savedKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (savedStub === undefined) {
      delete process.env.CANVAS_BUILDER_STUB;
    } else {
      process.env.CANVAS_BUILDER_STUB = savedStub;
    }
    if (savedKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = savedKey;
    }
  });

  it("prefers OpenAI when OPENAI_API_KEY is set even if CANVAS_BUILDER_STUB=true", () => {
    process.env.CANVAS_BUILDER_STUB = "true";
    process.env.OPENAI_API_KEY = "sk-test";
    assert.equal(useCanvasBuilderStub(), false);
  });

  it("uses stub when no API key and stub not explicitly disabled", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.CANVAS_BUILDER_STUB = "true";
    assert.equal(useCanvasBuilderStub(), true);
  });

  it("uses stub by default when no API key and CANVAS_BUILDER_STUB unset", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.CANVAS_BUILDER_STUB;
    assert.equal(useCanvasBuilderStub(), true);
  });

  it("honors CANVAS_BUILDER_STUB=false without an API key", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.CANVAS_BUILDER_STUB = "false";
    assert.equal(useCanvasBuilderStub(), false);
  });
});
