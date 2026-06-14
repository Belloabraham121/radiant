import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RateLimitError } from "e2b";
import { AppError } from "../../../src/errors/app-error.js";
import { E2bSandboxProvider } from "../../../src/services/sandbox/e2b.provider.js";

describe("E2bSandboxProvider", () => {
  it("creates sandbox, copies scaffold, and kills on failure", async () => {
    const calls: string[] = [];
    const killed = { value: false };

    const provider = new E2bSandboxProvider({
      createSandbox: async () => ({
        commands: {
          run: async (cmd: string) => {
            calls.push(cmd);
            return { exitCode: 1, stdout: "", stderr: "copy failed" };
          },
        },
        files: {
          write: async () => [],
          read: async () => new Uint8Array(),
          list: async () => [],
        },
        kill: async () => {
          killed.value = true;
        },
      }),
    });

    await assert.rejects(
      () =>
        provider.create({
          jobId: "job-fail",
          projectId: "proj-1",
          userId: "user-1",
        }),
      (error: unknown) => error instanceof AppError && error.code === "SANDBOX_SETUP_FAILED",
    );

    assert.ok(calls.some((cmd) => cmd.includes("cp -a")));
    assert.equal(killed.value, true);
  });

  it("retries sandbox creation on RateLimitError", async () => {
    let attempts = 0;

    const provider = new E2bSandboxProvider({
      createSandbox: async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new RateLimitError("rate limited");
        }

        return {
          commands: {
            run: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
          },
          files: {
            write: async () => [],
            read: async () => new Uint8Array(),
            list: async () => [],
          },
          kill: async () => {},
        };
      },
    });

    const { handleId } = await provider.create({
      jobId: "job-retry",
      projectId: "proj-1",
      userId: "user-1",
    });

    assert.equal(handleId, "job-retry");
    assert.equal(attempts, 2);

    await provider.kill(handleId);
  });

  it("writeFiles validates paths before writing", async () => {
    const provider = new E2bSandboxProvider({
      createSandbox: async () => ({
        commands: {
          run: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        },
        files: {
          write: async () => [],
          read: async () => new Uint8Array(),
          list: async () => [],
        },
        kill: async () => {},
      }),
    });

    const { handleId } = await provider.create({
      jobId: "job-write",
      projectId: "proj-1",
      userId: "user-1",
    });

    await assert.rejects(
      () => provider.writeFiles(handleId, [{ path: "/etc/passwd", content: "x" }]),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );

    await provider.kill(handleId);
  });
});
