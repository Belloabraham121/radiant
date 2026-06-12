/** Normalize user/agent pool names to DeepBook indexer keys (e.g. DEEP/USDC → DEEP_USDC). */
export function normalizePoolKey(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/\//g, "_")
    .replace(/-/g, "_");
}
