import { AppError } from "../../errors/app-error.js";
import { exportNotificationDataForUser } from "../notifications/notification-user-data.service.js";
import { findUserByPrivyId } from "./user.repository.js";

export type UserDataExport = {
  exported_at: string;
  privy_user_id: string;
  email: string | null;
  member_since: string;
  notifications: Awaited<ReturnType<typeof exportNotificationDataForUser>>;
};

export async function exportUserDataForPrivyUser(privyUserId: string): Promise<UserDataExport> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const notifications = await exportNotificationDataForUser(user.id);

  return {
    exported_at: new Date().toISOString(),
    privy_user_id: user.privy_user_id,
    email: user.email,
    member_since: user.created_at.toISOString(),
    notifications,
  };
}
