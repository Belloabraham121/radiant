import type { AgentChainId } from "@/lib/agent-chains";
import { chainExplorerTxUrl } from "@/lib/chain-meta";

/** Base58 Sui transaction digest (typical length 43–44). */
const SUI_DIGEST_PATTERN = "[1-9A-HJ-NP-Za-km-z]{43,44}";

function explorerLink(digest: string, chainId: AgentChainId): string | null {
  return chainExplorerTxUrl(chainId, digest);
}

/** Turn plain-text digest mentions into markdown explorer links for agent replies. */
export function linkTransactionDigestsInMarkdown(
  text: string,
  chainId: AgentChainId = "sui",
): string {
  if (!text.includes("Digest") && !text.includes("digest")) {
    return text;
  }

  const digestRegex = new RegExp(`\\b(Digest:\\s*)(${SUI_DIGEST_PATTERN})\\b`, "gi");
  let linked = text.replace(digestRegex, (_match, prefix: string, digest: string) => {
    const url = explorerLink(digest, chainId);
    return url ? `${prefix}[${digest}](${url})` : `${prefix}${digest}`;
  });

  const parenRegex = new RegExp(`\\(digest\\s+(${SUI_DIGEST_PATTERN})\\)`, "gi");
  linked = linked.replace(parenRegex, (_match, digest: string) => {
    const url = explorerLink(digest, chainId);
    return url ? `([View on Sui Explorer](${url}))` : `(digest ${digest})`;
  });

  return linked;
}
