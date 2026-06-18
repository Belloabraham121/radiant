import { AppError } from "../../errors/app-error.js";
import { getVapidConfig } from "../../config/vapid.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import {
  listActivePushSubscriptionsForUser,
  revokePushSubscription,
  upsertPushSubscription,
} from "./notification-push-subscription.repository.js";

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
};

export type PushConfigRecord = {
  enabled: boolean;
  public_key: string | null;
};

export type SubscribeWebPushInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  user_agent?: string;
};

function toRecord(row: {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: Date;
  last_used_at: Date | null;
}): PushSubscriptionRecord {
  return {
    id: row.id,
    endpoint: row.endpoint,
    user_agent: row.user_agent,
    created_at: row.created_at.toISOString(),
    last_used_at: row.last_used_at?.toISOString() ?? null,
  };
}

export function getWebPushConfigForClient(): PushConfigRecord {
  const config = getVapidConfig();
  return {
    enabled: config.enabled,
    public_key: config.publicKey ?? null,
  };
}

export async function listPushSubscriptionsForUser(
  privyUserId: string,
): Promise<PushSubscriptionRecord[]> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const rows = await listActivePushSubscriptionsForUser(user.id);
  return rows.map(toRecord);
}

export async function subscribeWebPushForUser(
  privyUserId: string,
  input: SubscribeWebPushInput,
): Promise<PushSubscriptionRecord> {
  const config = getVapidConfig();
  if (!config.enabled) {
    throw new AppError(503, "WEB_PUSH_DISABLED", "Web Push is not configured on this server");
  }

  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const row = await upsertPushSubscription({
    userId: user.id,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: input.user_agent ?? null,
  });

  return toRecord(row);
}

export async function unsubscribeWebPushForUser(
  privyUserId: string,
  subscriptionId: string,
): Promise<{ id: string; revoked: true }> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const row = await revokePushSubscription(subscriptionId, user.id);
  if (!row) {
    throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", "Push subscription not found");
  }

  return { id: row.id, revoked: true };
}
