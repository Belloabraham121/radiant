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
  const digestRegex = new RegExp(`\\b(Digest:\\s*)(${SUI_DIGEST_PATTERN})\\b`, "gi");
  let linked = text.replace(digestRegex, (_match, prefix: string, digest: string) => {
    const url = explorerLink(digest, chainId);
    return url ? `${prefix}[${digest}](${url})` : `${prefix}${digest}`;
  });

  const txDigestRegex = new RegExp(`\\b(Tx digest:\\s*)(${SUI_DIGEST_PATTERN})\\b`, "gi");
  linked = linked.replace(txDigestRegex, (_match, prefix: string, digest: string) => {
    const url = explorerLink(digest, chainId);
    return url ? `${prefix}[${digest}](${url})` : `${prefix}${digest}`;
  });

  const parenRegex = new RegExp(`\\(digest\\s+(${SUI_DIGEST_PATTERN})\\)`, "gi");
  linked = linked.replace(parenRegex, (_match, digest: string) => {
    const url = explorerLink(digest, chainId);
    return url ? `([View on Sui Explorer](${url}))` : `(digest ${digest})`;
  });

  if (!linked.includes("](") && /flash loan executed/i.test(text)) {
    const bareDigestRegex = new RegExp(`\\b(${SUI_DIGEST_PATTERN})\\b`, "g");
    linked = linked.replace(bareDigestRegex, (digest) => {
      const url = explorerLink(digest, chainId);
      return url ? `[${digest}](${url})` : digest;
    });
  }

  return linked;
}
