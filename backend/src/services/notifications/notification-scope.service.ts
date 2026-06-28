import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";

export type NotificationScope = {
  userId: bigint;
};

export async function resolveNotificationScope(privyUserId: string): Promise<NotificationScope> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  return { userId: user.id };
}
