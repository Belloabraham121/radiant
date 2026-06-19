import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureAppEntry, ensureTailwindInGlobalsCss } from "../../../src/services/projects/ensure-app-entry.js";
import { RADIANT_CLIENT_TEMPLATE_VERSION } from "../../../src/services/projects/radiant-client-template.js";

describe("ensureAppEntry", () => {
  it("keeps legacy src/App.tsx and adds radiant-client", () => {
    const files = [
      { path: "src/App.tsx", content: "export default () => null;" },
      { path: "src/components/SwapForm.tsx", content: "export default () => <div />" },
    ];
    const result = ensureAppEntry(files);
    assert.ok(result.length >= 3);
    assert.ok(result.some((f) => f.path === "lib/radiant-client.ts"));
    assert.ok(result.some((f) => f.path === "lib/radiant-agent-runtime.ts"));
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

  it("injects current radiant-client template with browser-safe env and swap helpers", () => {
    const result = ensureAppEntry([{ path: "app/page.tsx", content: "export default function Page() { return null; }" }]);
    const client = result.find((f) => f.path === "lib/radiant-client.ts");
    assert.ok(client);
    assert.match(client!.content, /export async function executeAction/);
    assert.match(client!.content, /export async function executeSwap/);
    assert.match(client!.content, new RegExp(`Template v${RADIANT_CLIENT_TEMPLATE_VERSION}`));
    assert.match(client!.content, /export async function deepbookPools/);
    assert.match(client!.content, /export async function tokenBalances/);
    assert.match(client!.content, /readPublicEnv/);
    assert.match(client!.content, /resolveSwapSide/);
  });

  it("upgrades stale lib/radiant-client.ts to the current template", () => {
    const result = ensureAppEntry([
      { path: "app/page.tsx", content: "export default function Page() { return null; }" },
      { path: "lib/radiant-client.ts", content: "/** Template v4 */\nthrow new Error('stale');" },
    ]);
    const client = result.find((f) => f.path === "lib/radiant-client.ts");
    assert.ok(client);
    assert.match(client!.content, new RegExp(`Template v${RADIANT_CLIENT_TEMPLATE_VERSION}`));
    assert.doesNotMatch(client!.content, /stale/);
  });

  it("injects agent runtime import into existing app/page.tsx", () => {
    const result = ensureAppEntry([
      {
        path: "app/page.tsx",
        content: `"use client";\n\nexport default function Page() { return null; }`,
      },
    ]);
    const page = result.find((f) => f.path === "app/page.tsx");
    assert.ok(page);
    assert.match(page!.content, /radiant-agent-runtime/);
  });

  it("injects agent runtime, indicator, charts, and agent CSS", () => {
    const result = ensureAppEntry([{ path: "app/page.tsx", content: "export default function Page() { return null; }" }]);
    assert.ok(result.some((f) => f.path === "lib/radiant-agent-runtime.ts"));
    assert.ok(result.some((f) => f.path === "lib/radiant-charts.tsx"));
    assert.ok(result.some((f) => f.path === "components/AgentIndicator.tsx"));
    const layout = result.find((f) => f.path === "app/layout.tsx");
    assert.ok(layout);
    assert.match(layout!.content, /AgentIndicator/);
    assert.match(layout!.content, /radiant-agent-runtime/);
    const globals = result.find((f) => f.path === "app/globals.css");
    assert.ok(globals);
    assert.match(globals!.content, /\.radiant-agent-indicator/);
    assert.match(globals!.content, /\.agent-focused/);
  });

  it("does not inject prebuilt DexApp when template is swap", () => {
    const result = ensureAppEntry([], { template: "swap" });
    assert.equal(result.some((f) => f.path === "components/DexApp.tsx"), false);
    assert.equal(result.some((f) => f.path === "components/SwapForm.tsx"), false);
    assert.ok(result.some((f) => f.path === "lib/radiant-client.ts"));
    assert.ok(result.some((f) => f.path === "lib/radiant-agent-runtime.ts"));
  });

  it("injects reference MarginTradingApp when template is margin", () => {
    const result = ensureAppEntry([], { template: "margin" });
    assert.ok(result.some((f) => f.path === "components/MarginTradingApp.tsx"));
    assert.ok(result.some((f) => f.path === "components/MarginMarketTrend.tsx"));
    assert.ok(result.some((f) => f.path === "lib/radiant-charts.tsx"));
    assert.ok(result.some((f) => f.path === "lib/radiant-actions.ts"));
    assert.ok(result.some((f) => f.path === "lib/margin-agent-handlers.ts"));
    const page = result.find((f) => f.path === "app/page.tsx");
    assert.ok(page);
    assert.match(page!.content, /MarginTradingApp/);
    assert.match(page!.content, /MarginMarketTrend/);
    assert.match(page!.content, /margin-agent-handlers/);
    const trend = result.find((f) => f.path === "components/MarginMarketTrend.tsx");
    assert.ok(trend);
    assert.match(trend!.content, /OhlcvAreaChart/);
    assert.match(trend!.content, /radiant-charts/);
    const manifest = result.find((f) => f.path === "lib/radiant-actions.ts");
    assert.ok(manifest);
    assert.match(manifest!.content, /margin_provision_manager/);
    assert.match(manifest!.content, /margin_deposit/);
    const component = result.find((f) => f.path === "components/MarginTradingApp.tsx");
    assert.ok(component);
    assert.match(component!.content, /marginManagerInfo/);
    assert.match(component!.content, /marginRiskRatio/);
    assert.match(component!.content, /margin-provision-submit/);
  });

  it("preserves agent-authored margin files over reference defaults", () => {
    const custom = "export default function MarginTradingApp() { return <div>Custom</div>; }";
    const result = ensureAppEntry(
      [{ path: "components/MarginTradingApp.tsx", content: custom }],
      { template: "margin" },
    );
    const component = result.find((f) => f.path === "components/MarginTradingApp.tsx");
    assert.equal(component?.content, custom);
    assert.ok(result.some((f) => f.path === "lib/radiant-actions.ts"));
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
