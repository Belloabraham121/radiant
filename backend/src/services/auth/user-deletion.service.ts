import { createLogger } from "../../shared/logger.js";
import { deleteNotificationDataForUser } from "../notifications/notification-user-data.service.js";
import { deleteUserByPrivyId, findUserByPrivyId } from "./user.repository.js";

const log = createLogger("user-deletion");

export async function deleteUserAccountByPrivyId(privyUserId: string): Promise<{ deleted: boolean }> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    return { deleted: false };
  }

  await deleteNotificationDataForUser(user.id);
  await deleteUserByPrivyId(privyUserId);

  log.info("user_account_deleted", {
    privy_user_id: privyUserId,
    user_id: user.id.toString(),
  });

  return { deleted: true };
}
