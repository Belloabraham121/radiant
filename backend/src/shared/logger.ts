import winston from "winston";
import { getServerEnv } from "../config/env.js";

const { nodeEnv, logLevel } = getServerEnv();

const devFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaKeys = Object.keys(meta).filter((k) => k !== "service");
    const metaSuffix =
      metaKeys.length > 0
        ? ` ${JSON.stringify(Object.fromEntries(metaKeys.map((k) => [k, meta[k]])))}`
        : "";
    const line = `${timestamp} ${level}: ${message}${metaSuffix}`;
    return stack ? `${line}\n${stack}` : line;
  }),
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: { service: "radiant-backend" },
  format: nodeEnv === "production" ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
});

export function createLogger(module: string) {
  return logger.child({ module });
}
