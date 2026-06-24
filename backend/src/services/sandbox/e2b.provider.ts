import { RateLimitError, Sandbox } from "e2b";
import { AppError } from "../../errors/app-error.js";
import { getSandboxConfig } from "../../config/sandbox.js";
import {
  normalizeSandboxReadPath,
  validateArtifactBatch,
} from "./sandbox-paths.js";
import type {
  SandboxCreateContext,
  SandboxFileWrite,
  SandboxProvider,
  SandboxRunResult,
} from "./sandbox.provider.js";

const SCAFFOLD_COPY_TIMEOUT_MS = 120_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_BACKOFF_MS = 1_000;

type E2bCommandRunOptions = {
  cwd?: string;
  timeoutMs?: number;
  onStdout?: (data: string) => void | Promise<void>;
  onStderr?: (data: string) => void | Promise<void>;
};

type E2bCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/** Minimal E2B surface used by deploy pipeline — enables lean mocks in tests. */
export type E2bSandboxHandle = {
  sandboxId?: string;
  commands: {
    run: (cmd: string, opts?: E2bCommandRunOptions) => Promise<E2bCommandResult>;
  };
  files: {
    write: (entries: { path: string; data: string }[]) => Promise<unknown>;
    read: (path: string, opts: { format: "bytes" }) => Promise<Uint8Array>;
    list: (path: string, opts?: { depth?: number }) => Promise<{ path: string }[]>;
  };
  kill: () => Promise<void>;
};

type E2bSandboxCreateOptions = NonNullable<Parameters<typeof Sandbox.create>[1]>;

export type E2bSandboxFactory = (
  template: string,
  options?: E2bSandboxCreateOptions,
) => Promise<E2bSandboxHandle>;

export type E2bSandboxProviderOptions = {
  createSandbox?: E2bSandboxFactory;
};

/** Safe dependency install — lifecycle scripts are ignored; build runs explicitly afterward. */
export const E2B_WORKSPACE_INSTALL_COMMAND = "cd /workspace && npm ci --ignore-scripts";
export const E2B_WORKSPACE_BUILD_COMMAND = "cd /workspace && npm run build";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitLines(chunk: string, onLine?: (line: string) => void): void {
  if (!onLine || chunk.length === 0) return;
  const parts = chunk.split(/\r?\n/);
  for (const line of parts) {
    if (line.length > 0) onLine(line);
  }
}

export class E2bSandboxProvider implements SandboxProvider {
  readonly name = "e2b" as const;

  private readonly createSandbox: E2bSandboxFactory;
  private readonly sandboxes = new Map<string, E2bSandboxHandle>();

  constructor(options: E2bSandboxProviderOptions = {}) {
    this.createSandbox =
      options.createSandbox ??
      ((template, opts) => Sandbox.create(template, opts));
  }

  async create(ctx: SandboxCreateContext): Promise<{ handleId: string; sandboxId?: string }> {
    const { e2bTemplateAlias, sandboxTimeoutMs } = getSandboxConfig();

    const sandbox = await this.createSandboxWithRetry(e2bTemplateAlias, {
      timeoutMs: sandboxTimeoutMs,
      metadata: {
        projectId: ctx.projectId,
        jobId: ctx.jobId,
        userId: ctx.userId,
        app: "radiant",
      },
      lifecycle: {
        onTimeout: "kill",
        autoResume: false,
      },
    });

    this.sandboxes.set(ctx.jobId, sandbox);

    const copy = await sandbox.commands.run("cp -a /opt/radiant-scaffold/. /workspace/", {
      cwd: "/",
      timeoutMs: SCAFFOLD_COPY_TIMEOUT_MS,
    });

    if (copy.exitCode !== 0) {
      await this.kill(ctx.jobId);
      throw new AppError(
        500,
        "SANDBOX_SETUP_FAILED",
        "Failed to copy scaffold into /workspace",
        { stderr: copy.stderr },
      );
    }

    return { handleId: ctx.jobId, sandboxId: (sandbox as { sandboxId?: string }).sandboxId };
  }

  async writeFiles(handleId: string, files: SandboxFileWrite[]): Promise<void> {
    const sandbox = this.getSandbox(handleId);
    const normalized = validateArtifactBatch(files);

    const entries = normalized.map((file) => ({
      path: file.path,
      data: file.content,
    }));

    await sandbox.files.write(entries);
  }

  async run(
    handleId: string,
    command: string,
    options: { cwd: string; timeoutMs: number; onLine?: (line: string) => void },
  ): Promise<SandboxRunResult> {
    const sandbox = this.getSandbox(handleId);
    const started = Date.now();

    const result = await sandbox.commands.run(command, {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      onStdout: (data) => emitLines(data, options.onLine),
      onStderr: (data) => emitLines(data, options.onLine),
    });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: Date.now() - started,
    };
  }

  async readFile(handleId: string, path: string): Promise<Buffer> {
    const sandbox = this.getSandbox(handleId);
    const normalized = normalizeSandboxReadPath(path);
    const bytes = await sandbox.files.read(normalized, { format: "bytes" });
    return Buffer.from(bytes);
  }

  async listDir(handleId: string, path: string): Promise<string[]> {
    const sandbox = this.getSandbox(handleId);
    const normalized = normalizeSandboxReadPath(path);
    const dir = normalized.replace(/\/$/, "");
    // files.list includes directories and may omit deep paths — find returns files only.
    const result = await sandbox.commands.run(`find "${dir}" -type f 2>/dev/null | sort`, {
      cwd: "/",
      timeoutMs: 120_000,
    });
    if (result.exitCode !== 0) return [];
    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  async kill(handleId: string): Promise<void> {
    const sandbox = this.sandboxes.get(handleId);
    if (!sandbox) return;

    try {
      await sandbox.kill();
    } finally {
      this.sandboxes.delete(handleId);
    }
  }

  private getSandbox(handleId: string): E2bSandboxHandle {
    const sandbox = this.sandboxes.get(handleId);
    if (!sandbox) {
      throw new AppError(404, "SANDBOX_NOT_FOUND", `E2B sandbox handle not found: ${handleId}`);
    }
    return sandbox;
  }

  private async createSandboxWithRetry(
    template: string,
    options: E2bSandboxCreateOptions,
  ): Promise<E2bSandboxHandle> {
    for (let attempt = 1; attempt <= RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
      try {
        return await this.createSandbox(template, options);
      } catch (error) {
        if (error instanceof RateLimitError && attempt < RATE_LIMIT_MAX_ATTEMPTS) {
          await sleep(RATE_LIMIT_BACKOFF_MS * attempt);
          continue;
        }
        throw error;
      }
    }

    throw new AppError(429, "RATE_LIMITED", "E2B sandbox creation rate limited");
  }
}
