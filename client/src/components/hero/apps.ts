export const HERO_INK = "#1b1610";
export const HERO_BG = "#faf6ec";
export const SCREEN_BG = "#fffdf7";

export type PhoneApp = {
  id: "savings" | "offramp" | "staking" | "splitter" | "portfolio";
  name: string;
  tagline: string;
  accent: string;
  headline: string;
  description: string;
  command: string;
};

export const PHONE_APPS: PhoneApp[] = [
  {
    id: "savings",
    name: "Stash",
    tagline: "Personal savings",
    accent: "#ff5d46",
    headline: "Save without thinking",
    description:
      "Say it once. Radiant builds you a savings app with goals and weekly auto-stash — deployed to Walrus, owned by your wallet.",
    command: "Stash 25 SUI every Friday.",
  },
  {
    id: "offramp",
    name: "Cashout",
    tagline: "Crypto off-ramp",
    accent: "#3865ff",
    headline: "Cash out like a human",
    description:
      "No bridges. No twelve open tabs. Radiant routes the best rate through DeepBook and lands dollars in your bank.",
    command: "Turn 500 SUI into dollars.",
  },
  {
    id: "staking",
    name: "AutoStake",
    tagline: "Staking automation",
    accent: "#00c478",
    headline: "Stake while you sleep",
    description:
      "A personal automation that restakes every Monday at 9:00. Set it in one sentence, never touch it again.",
    command: "Stake 50 SUI every Monday.",
  },
  {
    id: "splitter",
    name: "Splitz",
    tagline: "Payment splitter",
    accent: "#ffb01f",
    headline: "Split bills, keep friends",
    description:
      "Three wallets, one tap. List it on the explorer and earn 0.2% every time strangers split dinner with it.",
    command: "Split dinner three ways.",
  },
  {
    id: "portfolio",
    name: "Pulse",
    tagline: "Portfolio tracker",
    accent: "#8e5bff",
    headline: "Every coin, one pulse",
    description:
      "A live tracker for everything you hold — built in a sentence, sitting on your dashboard forever.",
    command: "Build me a portfolio tracker.",
  },
];

export type HeroPhrase = {
  text: string;
  color: string;
  fg: string;
};

export const HERO_PHRASES: HeroPhrase[] = [
  { text: "acts for you", color: "#ff5d46", fg: "#fffdf7" },
  { text: "remembers everything", color: "#3865ff", fg: "#fffdf7" },
  { text: "builds you apps", color: "#00c478", fg: "#fffdf7" },
  { text: "earns while you sleep", color: "#ffb01f", fg: "#1b1610" },
];

export const MARQUEE_COMMANDS = [
  "Pay Alex 5 SUI",
  "Swap my USDC for SUI at the best rate",
  "Build me a portfolio tracker",
  "Stake weekly, automatically",
  "Split dinner three ways",
  "List my splitter app — 0.2% fee",
  "Log me into that DEX from last week",
  "Send the group wallet contribution",
];
