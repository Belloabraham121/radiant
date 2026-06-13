import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockSandboxProvider } from "../../../src/services/sandbox/mock.provider.js";

describe("MockSandboxProvider", () => {
  it("writes, reads, lists, and kills a handle", async () => {
    const provider = new MockSandboxProvider();
    const { handleId } = await provider.create({
      jobId: "job-1",
      projectId: "proj-1",
      userId: "user-1",
    });

    await provider.writeFiles(handleId, [
      { path: "src/App.tsx", content: "export default function App() { return null; }" },
      { path: "src/index.css", content: "body { margin: 0; }" },
    ]);

    const run = await provider.run(handleId, "npm run build", {
      cwd: "/workspace",
      timeoutMs: 30_000,
      onLine: (line) => {
        assert.equal(line, "mock build complete");
      },
    });
    assert.equal(run.exitCode, 0);

    const app = await provider.readFile(handleId, "/workspace/src/App.tsx");
    assert.match(app.toString("utf8"), /export default/);

    const listed = await provider.listDir(handleId, "/workspace/src");
    assert.ok(listed.some((path) => path.includes("App.tsx")));

    await provider.kill(handleId);
  });
});
