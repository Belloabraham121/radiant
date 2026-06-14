import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import type { SandboxProvider } from "../sandbox/sandbox.provider.js";
import { SANDBOX_PATHS, validateDistOutputBytes } from "../sandbox/sandbox-paths.js";
import { getTemplateDistDir, isFixedTemplate } from "./template-registry.js";

export type DistFile = {
  relativePath: string;
  content: Buffer;
};

export async function collectDistFromSandbox(
  provider: SandboxProvider,
  handleId: string,
): Promise<DistFile[]> {
  for (const prefix of [SANDBOX_PATHS.outPrefix, SANDBOX_PATHS.distPrefix]) {
    const paths = await provider.listDir(handleId, prefix);
    if (paths.length === 0) continue;

    const files: DistFile[] = [];
    let totalBytes = 0;

    for (const absolutePath of paths) {
      if (absolutePath.endsWith("/")) continue;
      const bytes = await provider.readFile(handleId, absolutePath);
      totalBytes += bytes.length;
      validateDistOutputBytes(totalBytes);

      const relativePath = absolutePath.startsWith(prefix)
        ? absolutePath.slice(prefix.length)
        : absolutePath;

      files.push({ relativePath, content: bytes });
    }

    if (files.length > 0) {
      return files;
    }
  }

  throw new Error("Build produced an empty out/ or dist/ directory");
}

export async function prepareFixedTemplateDist(
  template: string,
  templateParams: Record<string, unknown>,
  projectMeta: { name: string; tagline: string; accent: string },
): Promise<string> {
  if (!isFixedTemplate(template)) {
    throw new Error(`prepareFixedTemplateDist requires a fixed template, got ${template}`);
  }

  const sourceDir = getTemplateDistDir(template);
  const tempDir = await mkdtemp(join(tmpdir(), `radiant-template-${template}-`));
  await cp(sourceDir, tempDir, { recursive: true });

  const config = {
    template,
    name: projectMeta.name,
    tagline: projectMeta.tagline,
    accent: projectMeta.accent,
    params: templateParams,
  };

  await writeFile(join(tempDir, "config.json"), JSON.stringify(config, null, 2), "utf8");
  return tempDir;
}

export async function writeDistFilesToDir(files: DistFile[], targetDir: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  for (const file of files) {
    const dest = join(targetDir, file.relativePath);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, file.content);
  }
}

export async function readDistDirFromDisk(distDir: string): Promise<DistFile[]> {
  const { readdir } = await import("node:fs/promises");
  const files: DistFile[] = [];
  let totalBytes = 0;

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const content = await readFile(full);
      totalBytes += content.length;
      validateDistOutputBytes(totalBytes);
      files.push({
        relativePath: relative(distDir, full).replace(/\\/g, "/"),
        content,
      });
    }
  }

  await walk(distDir);
  return files;
}
