import { AppError } from "../../errors/app-error.js";
import type {
  SandboxCreateContext,
  SandboxFileWrite,
  SandboxProvider,
  SandboxRunResult,
} from "./sandbox.provider.js";

/** Template-only deploy — no remote sandbox; pipeline reads pre-built dist from disk. */
export class NoneSandboxProvider implements SandboxProvider {
  readonly name = "none" as const;

  async create(ctx: SandboxCreateContext): Promise<{ handleId: string; sandboxId?: string }> {
    return { handleId: ctx.jobId, sandboxId: `none-${ctx.jobId}` };
  }

  async writeFiles(_handleId: string, _files: SandboxFileWrite[]): Promise<void> {
    // Fixed templates do not write into a sandbox.
  }

  async run(
    _handleId: string,
    _command: string,
    _options: { cwd: string; timeoutMs: number; onLine?: (line: string) => void },
  ): Promise<SandboxRunResult> {
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
  }

  async readFile(_handleId: string, _path: string): Promise<Buffer> {
    throw new AppError(
      400,
      "SANDBOX_NOT_USED",
      "NoneSandboxProvider does not read files — use template dist on disk",
    );
  }

  async listDir(_handleId: string, _path: string): Promise<string[]> {
    throw new AppError(
      400,
      "SANDBOX_NOT_USED",
      "NoneSandboxProvider does not list directories — use template dist on disk",
    );
  }

  async kill(_handleId: string): Promise<void> {
    // No sandbox to tear down.
  }
}
