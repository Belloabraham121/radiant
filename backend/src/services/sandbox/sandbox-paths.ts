import { AppError } from "../../errors/app-error.js";
import { getSandboxConfig } from "../../config/sandbox.js";

const WORKSPACE_ROOT = "/workspace";
const ALLOWED_PREFIXES = ["/workspace/src/", "/workspace/public/"];
const ALLOWED_EXTENSIONS = [".tsx", ".ts", ".css", ".json", ".html", ".svg"];

/** Absolute path under /workspace (reads — dist upload, etc.). */
export function normalizeSandboxReadPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (trimmed.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Sandbox path cannot be empty");
  }

  const absolute = trimmed.startsWith("/") ? trimmed : `${WORKSPACE_ROOT}/${trimmed}`;
  const normalized = absolute.replace(/\/+/g, "/");

  if (normalized.includes("..")) {
    throw new AppError(400, "VALIDATION_ERROR", "Sandbox path must not contain '..'");
  }

  if (!normalized.startsWith(WORKSPACE_ROOT)) {
    throw new AppError(400, "VALIDATION_ERROR", "Sandbox reads must stay under /workspace");
  }

  return normalized;
}

/** Normalize agent paths to absolute sandbox paths under /workspace (writes). */
export function normalizeSandboxPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (trimmed.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Sandbox path cannot be empty");
  }
  if (trimmed.includes("\0")) {
    throw new AppError(400, "VALIDATION_ERROR", "Sandbox path contains invalid characters");
  }

  const absolute = trimmed.startsWith("/") ? trimmed : `${WORKSPACE_ROOT}/${trimmed}`;
  const normalized = absolute.replace(/\/+/g, "/");

  if (normalized.includes("..")) {
    throw new AppError(400, "VALIDATION_ERROR", "Sandbox path must not contain '..'");
  }

  if (!normalized.startsWith(WORKSPACE_ROOT)) {
    throw new AppError(400, "VALIDATION_ERROR", "Sandbox writes must stay under /workspace");
  }

  const allowedPrefix = ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  if (!allowedPrefix) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Sandbox writes are limited to /workspace/src and /workspace/public",
    );
  }

  const ext = normalized.includes(".") ? normalized.slice(normalized.lastIndexOf(".")) : "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError(400, "VALIDATION_ERROR", `Sandbox file extension not allowed: ${ext}`);
  }

  return normalized;
}

export function validateArtifactBatch(files: { path: string; content: string }[]): void {
  const { maxArtifactBytes, maxArtifactFiles } = getSandboxConfig();

  if (files.length > maxArtifactFiles) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Too many artifact files (max ${maxArtifactFiles})`,
    );
  }

  let totalBytes = 0;
  for (const file of files) {
    const normalized = normalizeSandboxPath(file.path);
    const bytes = Buffer.byteLength(file.content, "utf8");
    totalBytes += bytes;
    if (totalBytes > maxArtifactBytes) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Artifact batch exceeds max size (${maxArtifactBytes} bytes)`,
      );
    }
    file.path = normalized;
  }
}
