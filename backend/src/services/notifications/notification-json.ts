import { Prisma } from "@prisma/client";

export function toNotificationJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Map explicit null to Prisma.JsonNull for nullable JSON columns. */
export function toNullableNotificationJsonValue(
  value: unknown | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.JsonNull;
  }
  return toNotificationJsonValue(value);
}
