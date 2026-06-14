import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureAppEntry, ensureTailwindInGlobalsCss } from "../../../src/services/projects/ensure-app-entry.js";

describe("ensureAppEntry", () => {
  it("keeps legacy src/App.tsx and adds radiant-client", () => {
    const files = [
      { path: "src/App.tsx", content: "export default () => null;" },
      { path: "src/components/SwapForm.tsx", content: "export default () => <div />" },
    ];
    const result = ensureAppEntry(files);
    assert.equal(result.length, 3);
    assert.ok(result.some((f) => f.path === "lib/radiant-client.ts"));
    assert.ok(result.some((f) => f.path === "src/App.tsx"));
  });

  it("adds Next app entry importing first component when missing", () => {
    const files = [
      {
        path: "components/SwapForm.tsx",
        content: "export default function SwapForm() { return null; }",
      },
    ];
    const result = ensureAppEntry(files);
    const page = result.find((f) => f.path === "app/page.tsx");
    assert.ok(page);
    assert.match(page!.content, /from "\.\.\/components\/SwapForm"/);
    assert.ok(result.some((f) => f.path === "app/layout.tsx"));
    assert.ok(result.some((f) => f.path === "app/globals.css"));
    assert.ok(result.some((f) => f.path === "lib/radiant-client.ts"));
  });

  it("imports src/components via parent-relative path from app/page.tsx", () => {
    const files = [
      {
        path: "src/components/SwapForm.tsx",
        content: "export default function SwapForm() { return null; }",
      },
    ];
    const result = ensureAppEntry(files);
    const page = result.find((f) => f.path === "app/page.tsx");
    assert.ok(page);
    assert.match(page!.content, /from "\.\.\/src\/components\/SwapForm"/);
  });

  it("fills layout and globals when app/page.tsx exists", () => {
    const files = [{ path: "app/page.tsx", content: '"use client";\nexport default function Page() { return null; }' }];
    const result = ensureAppEntry(files);
    assert.ok(result.some((f) => f.path === "app/layout.tsx"));
    assert.ok(result.some((f) => f.path === "app/globals.css"));
    assert.ok(result.some((f) => f.path === "lib/radiant-client.ts"));
  });

  it("injects radiant-client template v3 with execute helpers", () => {
    const result = ensureAppEntry([{ path: "app/page.tsx", content: "export default function Page() { return null; }" }]);
    const client = result.find((f) => f.path === "lib/radiant-client.ts");
    assert.ok(client);
    assert.match(client!.content, /export async function executeAction/);
    assert.match(client!.content, /export async function executeSwap/);
    assert.match(client!.content, /Template v3/);
  });

  it("injects Tailwind import into globals.css for deploy builds", () => {
    assert.match(
      ensureTailwindInGlobalsCss(":root { --hero-bg: #fff; }"),
      /@import "tailwindcss"/,
    );
    assert.match(
      ensureAppEntry([{ path: "app/globals.css", content: ":root { --hero-bg: #fff; }" }]).find(
        (f) => f.path === "app/globals.css",
      )!.content,
      /@import "tailwindcss"/,
    );
  });
});
