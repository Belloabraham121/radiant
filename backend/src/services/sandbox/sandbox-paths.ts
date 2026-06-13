import { AppError } from "../../errors/app-error.js";
import { getSandboxConfig } from "../../config/sandbox.js";

/** Sandbox filesystem layout (E2B template + deploy pipeline). */
export const SANDBOX_PATHS = {
  scaffoldRoot: "/opt/radiant-scaffold",
  workspaceRoot: "/workspace",
  writePrefixes: ["/workspace/src/", "/workspace/public/"] as const,
  movePrefix: "/workspace/move/",
  distPrefix: "/workspace/dist/",
} as const;

/** Agent artifact writes (`generate_app`, sandbox `writeFiles`). */
export const SANDBOX_ALLOWED_WRITE_EXTENSIONS = [
  ".tsx",
  ".ts",
  ".css",
  ".json",
  ".html",
  ".svg",
] as const;

/** Move package sources under `/workspace/move/` (Phase 5 publish). */
export const SANDBOX_ALLOWED_MOVE_EXTENSIONS = [".move", ".toml", ".json"] as const;

export type SandboxArtifactFile = { path: string; content: string };

function collapseSlashes(path: string): string {
  return path.replace(/\/+/g, "/");
}

function toWorkspaceAbsolute(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (trimmed.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Sandbox path cannot be empty");
  }
  if (trimmed.includes("\0")) {
    throw new AppError(400, "VALIDATION_ERROR", "Sandbox path contains invalid characters");
  }
  const absolute = trimmed.startsWith("/") ? trimmed : `${SANDBOX_PATHS.workspaceRoot}/${trimmed}`;
  return collapseSlashes(absolute);
}

function rejectTraversal(normalized: string): void {
  if (normalized.includes("..")) {
    throw new AppError(400, "VALIDATION_ERROR", "Sandbox path must not contain '..'");
  }
}

function rejectOutsideWorkspace(normalized: string, action: "read" | "write"): void {
  if (!normalized.startsWith(SANDBOX_PATHS.workspaceRoot)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      action === "read"
        ? "Sandbox reads must stay under /workspace"
        : "Sandbox writes must stay under /workspace",
    );
  }
}

function fileExtension(normalized: string): string {
  const slash = normalized.lastIndexOf("/");
  const basename = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return "";
  return basename.slice(dot);
}

function assertAllowedExtension(
  normalized: string,
  allowed: readonly string[],
  label: string,
): void {
  const ext = fileExtension(normalized);
  if (!allowed.includes(ext)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${label} file extension not allowed: ${ext || "(none)"}`,
    );
  }
}

function assertUnderPrefixes(normalized: string, prefixes: readonly string[], label: string): void {
  const ok = prefixes.some(
    (prefix) => normalized.startsWith(prefix) && normalized.length > prefix.length,
  );
  if (!ok) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${label} paths must be under ${prefixes.join(" or ")}`,
    );
  }
}

/** Absolute path under /workspace (reads — dist upload, etc.). */
export function normalizeSandboxReadPath(path: string): string {
  const normalized = toWorkspaceAbsolute(path);
  rejectTraversal(normalized);
  rejectOutsideWorkspace(normalized, "read");
  return normalized;
}

/** Normalize and validate agent artifact write paths (`src/`, `public/` only). */
export function normalizeSandboxPath(path: string): string {
  const normalized = toWorkspaceAbsolute(path);
  rejectTraversal(normalized);
  rejectOutsideWorkspace(normalized, "write");
  assertUnderPrefixes(normalized, SANDBOX_PATHS.writePrefixes, "Artifact");
  assertAllowedExtension(normalized, SANDBOX_ALLOWED_WRITE_EXTENSIONS, "Artifact");
  return normalized;
}

/** Validate Move sources for `/workspace/move/` (separate from agent artifacts). */
export function normalizeMoveSourcePath(path: string): string {
  const normalized = toWorkspaceAbsolute(path);
  rejectTraversal(normalized);
  rejectOutsideWorkspace(normalized, "write");

  if (
    !normalized.startsWith(SANDBOX_PATHS.movePrefix) ||
    normalized.length <= SANDBOX_PATHS.movePrefix.length
  ) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Move sources must be files under /workspace/move/",
    );
  }

  assertAllowedExtension(normalized, SANDBOX_ALLOWED_MOVE_EXTENSIONS, "Move");
  return normalized;
}

/** Validate agent artifact batch (paths, extensions, file count, total bytes). */
export function validateArtifactBatch(files: SandboxArtifactFile[]): SandboxArtifactFile[] {
  const { maxArtifactBytes, maxArtifactFiles } = getSandboxConfig();

  if (files.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Artifact batch cannot be empty");
  }

  if (files.length > maxArtifactFiles) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Too many artifact files (max ${maxArtifactFiles})`,
    );
  }

  const seen = new Set<string>();
  let totalBytes = 0;
  const normalized: SandboxArtifactFile[] = [];

  for (const file of files) {
    const path = normalizeSandboxPath(file.path);

    if (seen.has(path)) {
      throw new AppError(400, "VALIDATION_ERROR", `Duplicate artifact path: ${path}`);
    }
    seen.add(path);

    const bytes = Buffer.byteLength(file.content, "utf8");
    totalBytes += bytes;
    if (totalBytes > maxArtifactBytes) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Artifact batch exceeds max size (${maxArtifactBytes} bytes)`,
      );
    }

    normalized.push({ path, content: file.content });
  }

  return normalized;
}

/** Validate Move source batch (Phase 5 — max 1 MB by default). */
export function validateMoveSourceBatch(files: SandboxArtifactFile[]): SandboxArtifactFile[] {
  const { maxMoveBytes, maxMoveFiles } = getSandboxConfig();

  if (files.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Move source batch cannot be empty");
  }

  if (files.length > maxMoveFiles) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Too many move source files (max ${maxMoveFiles})`,
    );
  }

  const seen = new Set<string>();
  let totalBytes = 0;
  const normalized: SandboxArtifactFile[] = [];

  for (const file of files) {
    const path = normalizeMoveSourcePath(file.path);
    if (seen.has(path)) {
      throw new AppError(400, "VALIDATION_ERROR", `Duplicate move source path: ${path}`);
    }
    seen.add(path);

    const bytes = Buffer.byteLength(file.content, "utf8");
    totalBytes += bytes;
    if (totalBytes > maxMoveBytes) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Move sources exceed max size (${maxMoveBytes} bytes)`,
      );
    }

    normalized.push({ path, content: file.content });
  }

  return normalized;
}

/** After Vite build — reject oversized `dist/` before Walrus upload. */
export function validateDistOutputBytes(totalBytes: number): void {
  const { maxDistBytes } = getSandboxConfig();
  if (totalBytes > maxDistBytes) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Build output exceeds max dist size (${maxDistBytes} bytes)`,
    );
  }
}
