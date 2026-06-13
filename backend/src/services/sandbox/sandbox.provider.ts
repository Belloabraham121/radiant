export type SandboxRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type SandboxFileWrite = { path: string; content: string };

export type SandboxCreateContext = {
  jobId: string;
  projectId: string;
  userId: string;
};

export type SandboxProviderName = "none" | "e2b" | "docker" | "mock";

export interface SandboxProvider {
  readonly name: SandboxProviderName;

  create(ctx: SandboxCreateContext): Promise<{ handleId: string; sandboxId?: string }>;

  writeFiles(handleId: string, files: SandboxFileWrite[]): Promise<void>;

  run(
    handleId: string,
    command: string,
    options: { cwd: string; timeoutMs: number; onLine?: (line: string) => void },
  ): Promise<SandboxRunResult>;

  readFile(handleId: string, path: string): Promise<Buffer>;

  listDir(handleId: string, path: string): Promise<string[]>;

  kill(handleId: string): Promise<void>;
}
