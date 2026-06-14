/** Walrus Sites SPA routing — HashRouter / client routes need portal fallback. */
export const WALRUS_SPA_FALLBACK_ROUTE = "/*";
export const WALRUS_SPA_FALLBACK_TARGET = "/index.html";

export function mergeWsResourcesJson(
  existing?: Record<string, unknown>,
  metadata?: Record<string, string>,
): Record<string, unknown> {
  const existingRoutes =
    existing?.routes && typeof existing.routes === "object" && !Array.isArray(existing.routes)
      ? (existing.routes as Record<string, string>)
      : {};

  return {
    ...existing,
    ...(metadata ? { metadata } : {}),
    routes: {
      ...existingRoutes,
      [WALRUS_SPA_FALLBACK_ROUTE]: WALRUS_SPA_FALLBACK_TARGET,
    },
  };
}
