import { PrismaClient } from "@prisma/client";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("prisma");

export const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? [{ emit: "event", level: "error" }, { emit: "event", level: "warn" }]
      : [{ emit: "event", level: "error" }],
});

prisma.$on("error", (e) => log.error("Prisma error", { message: e.message }));
prisma.$on("warn", (e) => log.warn("Prisma warning", { message: e.message }));
