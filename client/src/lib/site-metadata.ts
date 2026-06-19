const DEFAULT_SITE_URL = "https://useradiant.xyz";

export const siteName = "Radiant";

export const siteTitle =
  "Radiant — Your personal AI agent that acts, remembers, and builds";

/** Default meta description for tabs and search snippets. */
export const siteDescription =
  "Radiant acts, remembers, builds, and earns on your behalf. Research, automate tasks, ship personal apps, and handle onchain work — tell it what you want in plain language.";

/** Richer copy for link previews (Open Graph, iMessage, Slack, X). */
export const siteShareDescription =
  "Radiant is your personal AI agent with durable memory and real execution. Research topics, automate workflows, build apps for yourself, set reminders, and move onchain when you need to — swaps, payments, deploys, and more.";

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
