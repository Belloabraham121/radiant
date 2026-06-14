import { createHash } from "node:crypto";

/** E2B webhook verification — sha256(secret + rawBody), base64, strip trailing `=`. */
export function verifyE2bWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  const expected = createHash("sha256")
    .update(secret + rawBody, "utf8")
    .digest("base64")
    .replace(/=+$/, "");

  const provided = signatureHeader.trim().replace(/=+$/, "");
  return expected === provided;
}
