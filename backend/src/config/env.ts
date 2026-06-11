import "dotenv/config";

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function getServerEnv() {
  const nodeEnv = optional("NODE_ENV", "development");
  return {
    port: Number(optional("PORT", "3001")),
    nodeEnv,
    apiDefaultVersion: optional("API_DEFAULT_VERSION", "v1"),
    logLevel: optional("LOG_LEVEL", nodeEnv === "production" ? "info" : "debug"),
  };
}

export function getCorsEnv() {
  return {
    corsOrigin: optional("CORS_ORIGIN", "http://localhost:3000"),
  };
}
