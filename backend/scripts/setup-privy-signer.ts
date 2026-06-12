import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrivyClient } from "@privy-io/node";
import { logger } from "../src/shared/logger.js";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientEnvPath = join(backendRoot, "..", "client", ".env.local");

function generateSignerKeyPair(): { privateKeyPem: string; publicKeyDerBase64: string } {
  const privateKeyPem = execSync(
    "openssl ecparam -name prime256v1 -genkey -noout | openssl ec -outform PEM",
    { encoding: "utf8" },
  ).trim();

  const publicKeyDer = execSync("openssl ec -pubout -outform DER", {
    input: privateKeyPem,
  });

  return {
    privateKeyPem,
    publicKeyDerBase64: publicKeyDer.toString("base64"),
  };
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
}

function quotePemForEnv(pem: string): string {
  return `"${pem.replace(/\n/g, "\\n")}"`;
}

async function main() {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const existingQuorumId = process.env.PRIVY_SIGNER_QUORUM_ID?.trim();

  if (!appId || !appSecret) {
    throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET must be set in backend/.env");
  }

  if (existingQuorumId) {
    logger.info("Privy signer already configured", { quorumId: existingQuorumId });
    return;
  }

  const { privateKeyPem, publicKeyDerBase64 } = generateSignerKeyPair();
  const privy = new PrivyClient({ appId, appSecret });

  const keyQuorum = await privy.keyQuorums().create({
    display_name: "Radiant agent signer",
    authorization_threshold: 1,
    public_keys: [publicKeyDerBase64],
  });

  const backendEnvPath = join(backendRoot, ".env");
  let backendEnv = readFileSync(backendEnvPath, "utf8");
  backendEnv = upsertEnvLine(
    backendEnv,
    "PRIVY_AUTHORIZATION_PRIVATE_KEY",
    quotePemForEnv(privateKeyPem),
  );
  backendEnv = upsertEnvLine(backendEnv, "PRIVY_SIGNER_QUORUM_ID", keyQuorum.id);
  writeFileSync(backendEnvPath, backendEnv);

  let clientEnv = readFileSync(clientEnvPath, "utf8");
  clientEnv = upsertEnvLine(
    clientEnv,
    "NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID",
    keyQuorum.id,
  );
  writeFileSync(clientEnvPath, clientEnv);

  logger.info("Privy signer key quorum created", {
    quorumId: keyQuorum.id,
    backendEnv: backendEnvPath,
    clientEnv: clientEnvPath,
  });
}

main().catch((err) => {
  logger.error("Privy signer setup failed", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
