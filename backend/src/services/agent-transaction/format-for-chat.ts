import type {
  AgentTransactionListItem,
  AgentTransactionStatus,
} from "./agent-transaction.types.js";

export function formatAgentTransactionStatus(
  status: AgentTransactionStatus,
): string {
  switch (status) {
    case "pending_approval":
      return "Awaiting approval";
    case "rejected":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "submitted":
      return "Submitted";
    case "success":
      return "Success";
    case "failure":
      return "Failed";
    default:
      return status;
  }
}

/** Human-readable UTC timestamp for chat responses. */
export function formatAgentTransactionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function formatTransactionBlock(
  item: AgentTransactionListItem,
  index: number,
): string {
  const lines = [
    `${index + 1}. ${item.title}`,
    `   Date: ${formatAgentTransactionDate(item.created_at)}`,
    `   Amount: ${item.amount_display}`,
    `   Status: ${formatAgentTransactionStatus(item.status)}`,
  ];

  if (item.digest) {
    lines.push(`   Digest: ${item.digest}`);
  }

  return lines.join("\n");
}

/** Pre-formatted ledger lines for the agent to quote when listing transaction history. */
export function formatAgentTransactionsForChat(
  items: AgentTransactionListItem[],
): string {
  if (items.length === 0) {
    return "No agent transactions found.";
  }

  const header =
    items.length === 1
      ? "Most recent agent transaction:"
      : `Here are your ${items.length} most recent agent transactions:`;

  return [
    header,
    "",
    ...items.map((item, index) => formatTransactionBlock(item, index)),
  ].join("\n");
}
