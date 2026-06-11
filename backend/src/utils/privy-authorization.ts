import { createPrivateKey } from "node:crypto";
import type { AuthorizationContext } from "@privy-io/node";
import { AppError } from "../errors/app-error.js";
import { getAuthorizationPrivateKey } from "../config/privy.js";

/** PEM EC private key → base64 PKCS8 (no headers), as Privy expects. */
export function pemToPkcs8Base64(pem: string): string {
  const key = createPrivateKey(pem);
  const der = key.export({ type: "pkcs8", format: "der" });
  return Buffer.from(der).toString("base64");
}

export function buildSignerAuthorizationContext(): AuthorizationContext {
  const pem = getAuthorizationPrivateKey();
  if (!pem) {
    throw new AppError(
      503,
      "SIGNER_NOT_CONFIGURED",
      "PRIVY_AUTHORIZATION_PRIVATE_KEY is not configured on the server",
    );
  }

  return {
    authorization_private_keys: [pemToPkcs8Base64(pem)],
  };
}
