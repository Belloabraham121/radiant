import { AppError } from "../../errors/app-error.js";
import { normalizeSandboxReadPath, validateArtifactBatch } from "./sandbox-paths.js";
import type {
  SandboxCreateContext,
  SandboxFileWrite,
  SandboxProvider,
  SandboxRunResult,
} from "./sandbox.provider.js";

type MockHandle = {
  files: Map<string, Buffer>;
};

/** In-memory sandbox for unit tests and CI (`SANDBOX_PROVIDER=mock`). */
export class MockSandboxProvider implements SandboxProvider {
  readonly name = "mock" as const;

  private readonly handles = new Map<string, MockHandle>();

  async create(ctx: SandboxCreateContext): Promise<{ handleId: string; sandboxId?: string }> {
    this.handles.set(ctx.jobId, { files: new Map() });
    return { handleId: ctx.jobId, sandboxId: `mock-${ctx.jobId}` };
  }

  async writeFiles(handleId: string, files: SandboxFileWrite[]): Promise<void> {
    const handle = this.getHandle(handleId);
    const normalized = validateArtifactBatch(files);

    for (const file of normalized) {
      handle.files.set(file.path, Buffer.from(file.content, "utf8"));
    }
  }

  async run(
    handleId: string,
    command: string,
    options: { cwd: string; timeoutMs: number; onLine?: (line: string) => void },
  ): Promise<SandboxRunResult> {
    const handle = this.getHandle(handleId);
    const started = Date.now();

    if (command.includes("pnpm build") || command.includes("npm run build")) {
      const html =
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Radiant mock</title></head>" +
        "<body><h1>Mock build output</h1></body></html>";
      handle.files.set("/workspace/dist/index.html", Buffer.from(html, "utf8"));
      options.onLine?.("mock build complete");
      return {
        exitCode: 0,
        stdout: "mock build complete\n",
        stderr: "",
        durationMs: Date.now() - started,
      };
    }

    return {
      exitCode: 0,
      stdout: `mock: ${command}\n`,
      stderr: "",
      durationMs: Date.now() - started,
    };
  }

  async readFile(handleId: string, path: string): Promise<Buffer> {
    const handle = this.getHandle(handleId);
    const normalized = normalizeSandboxReadPath(path);
    const file = handle.files.get(normalized);
    if (!file) {
      throw new AppError(404, "RESOURCE_NOT_FOUND", `Mock sandbox file not found: ${normalized}`);
    }
    return Buffer.from(file);
  }

  async listDir(handleId: string, path: string): Promise<string[]> {
    const handle = this.getHandle(handleId);
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const names: string[] = [];

    for (const key of handle.files.keys()) {
      if (key.startsWith(prefix)) {
        names.push(key);
      }
    }

    return names.sort();
  }

  async kill(handleId: string): Promise<void> {
    this.handles.delete(handleId);
  }

  private getHandle(handleId: string): MockHandle {
    const handle = this.handles.get(handleId);
    if (!handle) {
      throw new AppError(404, "SANDBOX_NOT_FOUND", `Mock sandbox handle not found: ${handleId}`);
    }
    return handle;
  }
}
