import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { getWalrusConfig } from "../../config/walrus.js";
import { AppError } from "../../errors/app-error.js";
import { mergeWsResourcesJson } from "./ws-resources.js";
import { resolveWalrusPortalUrl } from "./walrus-portal-url.js";
import { siteBuilderGlobalArgs } from "./site-builder-args.js";

export type WalrusSiteDeployResult = {
  walrus_url: string | null;
  site_object_id: string | null;
  raw_output: string;
  mock_deploy: boolean;
};

async function readExistingWsResources(distDir: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(join(distDir, "ws-resources.json"), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function prepareDistWithWsResources(
  distDir: string,
  metadata?: Record<string, string>,
): Promise<{ tempDir: string; existingSiteId: string | null }> {
  const tempDir = await mkdtemp(join(tmpdir(), "radiant-walrus-"));
  await cp(distDir, tempDir, { recursive: true });

  const existing = await readExistingWsResources(distDir);
  const existingSiteId =
    typeof existing?.object_id === "string" && existing.object_id.startsWith("0x")
      ? existing.object_id
      : null;

  await writeFile(
    join(tempDir, "ws-resources.json"),
    JSON.stringify(mergeWsResourcesJson(existing, metadata), null, 2),
    "utf8",
  );

  return { tempDir, existingSiteId };
}

async function runSiteBuilder(
  distDir: string,
  existingSiteId: string | null,
): Promise<WalrusSiteDeployResult> {
  const config = getWalrusConfig();
  const command = existingSiteId ? "update" : "publish";
  const args = [...siteBuilderGlobalArgs(config), command, "--epochs", config.epochs, distDir];

  const env = { ...process.env };
  if (config.walrusConfigPath) {
    env.WALRUS_CONFIG_PATH = config.walrusConfigPath;
  }

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(config.siteBuilderBin, args, {
      cwd: distDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new AppError(500, "WALRUS_DEPLOY_FAILED", `site-builder ${command} failed`, {
            exitCode: code,
            stderr: err,
            stdout: out,
          }),
        );
        return;
      }
      resolve(out + err);
    });
  });

  const objectMatch = stdout.match(/0x[a-fA-F0-9]{64}/);
  const siteObjectId = objectMatch?.[0] ?? existingSiteId;
  const walrusUrl = await resolveWalrusPortalUrl(stdout, siteObjectId, config);

  if (!walrusUrl) {
    throw new AppError(500, "WALRUS_URL_RESOLVE_FAILED", "Could not resolve Walrus portal URL", {
      site_object_id: siteObjectId,
      stdout,
    });
  }

  return {
    walrus_url: walrusUrl,
    site_object_id: siteObjectId,
    raw_output: stdout,
    mock_deploy: false,
  };
}

/** Deploy a static dist directory to Walrus Sites (or mock URL in dev). */
export async function deployWalrusSite(
  distDir: string,
  metadata?: Record<string, string>,
): Promise<WalrusSiteDeployResult> {
  const config = getWalrusConfig();

  if (config.mockDeploy) {
    return {
      walrus_url: null,
      site_object_id: null,
      raw_output: "WALRUS_DEPLOY_MOCK=true",
      mock_deploy: true,
    };
  }

  let tempDir: string | null = null;
  try {
    const prepared = await prepareDistWithWsResources(distDir, metadata);
    tempDir = prepared.tempDir;
    return await runSiteBuilder(tempDir, prepared.existingSiteId);
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
