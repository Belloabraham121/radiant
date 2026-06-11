import type { User } from "@privy-io/node/resources/users.mjs";
import { logger } from "../../shared/logger.js";
import { handleTransferredAccount, syncUserEmailFromPrivyUser } from "./user.service.js";

type PrivyWebhookEvent = {
  type: string;
  user?: User;
  toUser?: User;
  fromUser?: { id: string };
};

function isUserPayload(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  );
}

export async function handlePrivyWebhookEvent(event: unknown): Promise<void> {
  if (typeof event !== "object" || event === null || !("type" in event)) {
    throw new Error("Invalid Privy webhook payload");
  }

  const payload = event as PrivyWebhookEvent;

  switch (payload.type) {
    case "user.linked_account":
    case "user.unlinked_account":
    case "user.updated_account": {
      if (!isUserPayload(payload.user)) {
        logger.warn("Privy webhook missing user payload", { type: payload.type });
        return;
      }
      await syncUserEmailFromPrivyUser(payload.user);
      return;
    }
    case "user.transferred_account": {
      const fromPrivyUserId = payload.fromUser?.id;
      if (!fromPrivyUserId || !isUserPayload(payload.toUser)) {
        logger.warn("Privy transferred_account webhook missing from/to user", {
          fromPrivyUserId,
          hasToUser: isUserPayload(payload.toUser),
        });
        return;
      }
      await handleTransferredAccount({
        fromPrivyUserId,
        survivorPrivyUser: payload.toUser,
      });
      return;
    }
    default:
      logger.debug("Ignoring unsupported Privy webhook", { type: payload.type });
  }
}
