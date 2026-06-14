export const APP_CATEGORIES = [
  "swap",
  "payments",
  "automation",
  "savings",
  "markets",
  "escrow",
  "alerts",
  "offramp",
  "staking",
  "portfolio",
] as const;

export type AppCategory = (typeof APP_CATEGORIES)[number];

export type PublicAppListing = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  accent: string;
  fee_bps: number;
  template: string;
  install_count: number;
  creator: string;
  published_at: string;
  artifact_revision: number;
};

export type PublicAppsCatalog = {
  apps: PublicAppListing[];
  stats: {
    total_apps: number;
    total_installs: number;
  };
};
