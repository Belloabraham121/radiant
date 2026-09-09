const DEFAULT_SITE_URL = "https://useradiant.xyz";

export const siteName = "Radiant";

export const siteTitle =
  "Radiant — The Universal Agentic Terminal for Base";

/** Default meta description for tabs and search snippets. */
export const siteDescription =
  "Don't navigate the ecosystem. Let the ecosystem generate around you. Join the Radiant private waitlist for Base.";

/** Richer copy for link previews (Open Graph, iMessage, Slack, X). */
export const siteShareDescription =
  "Radiant is the Universal Agentic Terminal for Base — type your intent, generate a custom dashboard, and orchestrate DeFi from one canvas. Join the private waitlist.";

export function getSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      // Fall through to production default.
    }
  }
  return new URL(DEFAULT_SITE_URL);
}
