import type { NotificationPushSubscription } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

export type UpsertPushSubscriptionInput = {
  userId: bigint;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

export async function findPushSubscriptionByEndpoint(
  endpoint: string,
): Promise<NotificationPushSubscription | null> {
  return prisma.notificationPushSubscription.findUnique({
    where: { endpoint },
  });
}

export async function listActivePushSubscriptionsForUser(
  userId: bigint,
): Promise<NotificationPushSubscription[]> {
  return prisma.notificationPushSubscription.findMany({
    where: {
      user_id: userId,
      revoked_at: null,
    },
    orderBy: { created_at: "desc" },
  });
}

export async function upsertPushSubscription(
  input: UpsertPushSubscriptionInput,
): Promise<NotificationPushSubscription> {
  const existing = await findPushSubscriptionByEndpoint(input.endpoint);

  if (existing) {
    if (existing.user_id !== input.userId) {
      await prisma.notificationPushSubscription.delete({
        where: { id: existing.id },
      });
    } else {
      return prisma.notificationPushSubscription.update({
        where: { id: existing.id },
        data: {
          p256dh: input.p256dh,
          auth: input.auth,
          user_agent: input.userAgent ?? null,
          revoked_at: null,
          last_used_at: new Date(),
        },
      });
    }
  }

  return prisma.notificationPushSubscription.create({
    data: {
      user_id: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
    },
  });
}

export async function findPushSubscriptionForUser(
  subscriptionId: string,
  userId: bigint,
): Promise<NotificationPushSubscription | null> {
  return prisma.notificationPushSubscription.findFirst({
    where: {
      id: subscriptionId,
      user_id: userId,
      revoked_at: null,
    },
  });
}

export async function revokePushSubscription(
  subscriptionId: string,
  userId: bigint,
): Promise<NotificationPushSubscription | null> {
  const existing = await findPushSubscriptionForUser(subscriptionId, userId);
  if (!existing) {
    return null;
  }

  return prisma.notificationPushSubscription.update({
    where: { id: subscriptionId },
    data: { revoked_at: new Date() },
  });
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await prisma.notificationPushSubscription.deleteMany({
    where: { endpoint },
  });
}

export async function touchPushSubscriptionUsed(subscriptionId: string): Promise<void> {
  await prisma.notificationPushSubscription.update({
    where: { id: subscriptionId },
    data: { last_used_at: new Date() },
  });
}
