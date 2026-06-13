import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../../errors/app-error.js";
import { getSandboxConfig } from "../../config/sandbox.js";
import type { SandboxProviderName } from "../sandbox/sandbox.provider.js";

export const FIXED_TEMPLATES = ["escrow", "swap", "prediction"] as const;
export type FixedTemplateName = (typeof FIXED_TEMPLATES)[number];

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, "../../../");

export function isFixedTemplate(template: string): template is FixedTemplateName {
  return FIXED_TEMPLATES.includes(template as FixedTemplateName);
}

export function getTemplateDistDir(template: string): string {
  if (!isFixedTemplate(template)) {
    throw new AppError(400, "VALIDATION_ERROR", `Unknown fixed template: ${template}`);
  }

  const distDir = resolve(backendRoot, "templates", template, "dist");
  if (!existsSync(distDir)) {
    throw new AppError(
      500,
      "TEMPLATE_DIST_MISSING",
      `Pre-built dist not found for template ${template}`,
      { path: distDir },
    );
  }

  return distDir;
}

/** Fixed templates use NoneSandboxProvider; custom uses configured sandbox provider. */
export function resolveDeployProvider(template: string): SandboxProviderName {
  if (isFixedTemplate(template)) {
    return "none";
  }

  if (template !== "custom") {
    throw new AppError(400, "VALIDATION_ERROR", `Unsupported project template: ${template}`);
  }

  const { provider } = getSandboxConfig();
  if (provider === "none") {
    throw new AppError(
      400,
      "SANDBOX_REQUIRED",
      "Custom apps require SANDBOX_PROVIDER=e2b (or mock for tests). Fixed templates deploy without a sandbox.",
    );
  }

  return provider;
}
