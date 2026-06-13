import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { getWalrusConfig } from "../../config/walrus.js";
import { AppError } from "../../errors/app-error.js";

export type WalrusSiteDeployResult = {
  walrus_url: string;
  site_object_id: string | null;
  raw_output: string;
};

function buildMockWalrusUrl(): string {
  const id = randomBytes(16).toString("hex");
  return `https://${id}.walrus.site`;
}

async function runSiteBuilder(distDir: string): Promise<WalrusSiteDeployResult> {
  const config = getWalrusConfig();
  const args = ["deploy", "--epochs", config.epochs, distDir];

  if (config.sitesConfigPath) {
    args.unshift("--sites-config", config.sitesConfigPath);
  }

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
          new AppError(500, "WALRUS_DEPLOY_FAILED", "site-builder deploy failed", {
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
  const siteObjectId = objectMatch?.[0] ?? null;
  const walrusUrl = siteObjectId
    ? `${config.portalBaseUrl.replace(/\/$/, "")}/object/${siteObjectId}`
    : buildMockWalrusUrl();

  return {
    walrus_url: walrusUrl,
    site_object_id: siteObjectId,
    raw_output: stdout,
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
      walrus_url: buildMockWalrusUrl(),
      site_object_id: null,
      raw_output: "WALRUS_DEPLOY_MOCK=true",
    };
  }

  let tempDir: string | null = null;
  try {
    if (metadata && Object.keys(metadata).length > 0) {
      tempDir = await mkdtemp(join(tmpdir(), "radiant-walrus-"));
      const { cp } = await import("node:fs/promises");
      await cp(distDir, tempDir, { recursive: true });
      await writeFile(
        join(tempDir, "ws-resources.json"),
        JSON.stringify({ metadata }, null, 2),
        "utf8",
      );
      return await runSiteBuilder(tempDir);
    }

    return await runSiteBuilder(distDir);
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
