import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filePathsFromFlatListing } from "../../../src/services/deploy/dist-collector.js";

describe("filePathsFromFlatListing", () => {
  it("drops directory paths from a recursive listing", () => {
    const paths = filePathsFromFlatListing([
      "/workspace/out/index.html",
      "/workspace/out/_next",
      "/workspace/out/_next/static",
      "/workspace/out/_next/static/chunks/main.js",
    ]);

    assert.deepEqual(paths, [
      "/workspace/out/index.html",
      "/workspace/out/_next/static/chunks/main.js",
    ]);
  });

  it("ignores trailing-slash directory entries", () => {
    const paths = filePathsFromFlatListing([
      "/workspace/out/",
      "/workspace/out/_next/",
      "/workspace/out/_next/static/app.css",
    ]);

    assert.deepEqual(paths, ["/workspace/out/_next/static/app.css"]);
  });

  it("documents orphan directory false positives in flat listings", () => {
    const paths = filePathsFromFlatListing([
      "/workspace/out/index.html",
      "/workspace/out/_next/iN5IRfTWzZRoooXjcgA8h",
    ]);

    // Without child paths this looks like a file — E2B listDir now uses find -type f instead.
    assert.deepEqual(paths, [
      "/workspace/out/index.html",
      "/workspace/out/_next/iN5IRfTWzZRoooXjcgA8h",
    ]);
  });
});
