export type Chat = {
  id: string;
  title: string;
  preview: string;
  time: string;
};

export type Receipt = {
  label: string;
  detail?: string;
};

export type Message = {
  id: string;
  role: "user" | "agent";
  text: string;
  receipts?: Receipt[];
  appCard?: { name: string; url: string; projectId: string; accent: string };
};

export type Credential = {
  id: string;
  app: string;
  site: string;
  username: string;
  password: string;
  hasPasskey: boolean;
  accent: string;
  createdAt: string;
  note: string;
};

export type Project = {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  status: "live" | "draft";
  builtIn: string;
  deployedAt?: string;
  walrusUrl?: string;
  /** Links a live project to its explorer agent for metrics. */
  agentId?: string;
};

export const USER = {
  name: "Kisi",
  email: "kisi@radiant.so",
  /** Truncated — sidebar & profile chips */
  wallet: "0x8f3c…9a21",
  /** Full Sui address for funding & onchain identity */
  walletFull:
    "0x8f3c2a1b9d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789a21",
  balanceSui: 12.48,
  network: "Sui Mainnet",
};

export const CHATS: Chat[] = [
  {
    id: "japan-trip",
    title: "Japan trip savings",
    preview: "Stash is live — first 50 SUI locked in.",
    time: "now",
  },
  {
    id: "dinner-splits",
    title: "Dinner splits",
    preview: "Sent 18 SUI requests to Maya and Jide.",
    time: "2h",
  },
  {
    id: "staking",
    title: "Staking on autopilot",
    preview: "AutoStake restaked 4.2 SUI of rewards.",
    time: "1d",
  },
  {
    id: "floor-alerts",
    title: "NFT floor alerts",
    preview: "Watching 3 collections for you.",
    time: "3d",
  },
  {
    id: "suilend-login",
    title: "New login for Suilend",
    preview: "Created an account — credentials in your vault.",
    time: "1w",
  },
];

export const MESSAGES: Message[] = [
  {
    id: "m1",
    role: "user",
    text: "I want to save 50 SUI every Friday for a Japan trip. Target is 1,200 SUI.",
  },
  {
    id: "m2",
    role: "agent",
    text: "Nice goal. I'll build you a small savings app: weekly auto-stash every Friday at 9:00, a progress bar to 1,200 SUI, and a panic-proof withdraw button. Building it now…",
  },
  {
    id: "m3",
    role: "agent",
    text: "Done — it's deployed to Walrus and your wallet owns it. I moved the first 50 SUI in already.",
    receipts: [
      { label: "Deployed to Walrus", detail: "3jx7…h2v5.walrus.site" },
      { label: "Transferred 50 SUI", detail: "0x82ac…41fe" },
    ],
    appCard: {
      name: "Stash",
      url: "https://3jx7…h2v5.walrus.site",
      projectId: "stash",
      accent: "#ff5d46",
    },
  },
  {
    id: "m4",
    role: "user",
    text: "Also split last night's dinner — 54 SUI between me, Maya and Jide.",
  },
  {
    id: "m5",
    role: "agent",
    text: "Done. You covered it, so I sent payment requests of 18 SUI each to Maya and Jide through Splitz. Maya already paid.",
    receipts: [
      { label: "Request sent — Maya", detail: "paid ✓" },
      { label: "Request sent — Jide", detail: "pending" },
    ],
  },
];

export const CANNED_REPLIES: string[] = [
  "On it — give me a second…",
  "Done. Want me to make this a weekly thing?",
  "Handled. I signed it with your wallet and saved the receipt to your memory.",
  "Built it. It's live on Walrus, your wallet owns it, and I added it to your projects.",
];

export const CREDENTIALS: Credential[] = [
  {
    id: "suilend",
    app: "Suilend",
    site: "suilend.fi",
    username: "kisi@radiant.so",
    password: "walrus-otter-9472!",
    hasPasskey: true,
    accent: "#3865ff",
    createdAt: "Jun 2, 2026",
    note: "Created while setting up your lending position.",
  },
  {
    id: "deepbook",
    app: "DeepBook Pro",
    site: "deepbook.tech",
    username: "kisi.radiant",
    password: "coral-lantern-3318$",
    hasPasskey: false,
    accent: "#00c478",
    createdAt: "May 27, 2026",
    note: "Used for best-rate swap routing.",
  },
  {
    id: "tradeport",
    app: "Tradeport",
    site: "tradeport.xyz",
    username: "kisi@radiant.so",
    password: "minty-comet-7765?",
    hasPasskey: true,
    accent: "#8e5bff",
    createdAt: "May 14, 2026",
    note: "Needed to watch NFT floors for your alerts.",
  },
  {
    id: "sui-ns",
    app: "Sui Name Service",
    site: "suins.io",
    username: "kisi.sui",
    password: "ember-walrus-1204#",
    hasPasskey: false,
    accent: "#ffb01f",
    createdAt: "Apr 30, 2026",
    note: "Registered kisi.sui and pointed it at your wallet.",
  },
];

export const PROJECTS: Project[] = [
  {
    id: "stash",
    name: "Stash",
    tagline: "Weekly savings for the Japan trip",
    accent: "#ff5d46",
    status: "live",
    builtIn: "Japan trip savings",
    deployedAt: "Jun 5, 2026",
    walrusUrl: "https://3jx7…h2v5.walrus.site",
    agentId: "stash",
  },
  {
    id: "splitz",
    name: "Splitz",
    tagline: "Payment splitter for the friend group",
    accent: "#ffb01f",
    status: "live",
    builtIn: "Dinner splits",
    deployedAt: "May 22, 2026",
    walrusUrl: "https://2gw9…d7r4.walrus.site",
    agentId: "splitz",
  },
  {
    id: "dca-weekly",
    name: "DCA Weekly",
    tagline: "Buys 25 SUI every Monday, rain or shine",
    accent: "#00c478",
    status: "live",
    builtIn: "Staking on autopilot",
    deployedAt: "Mar 18, 2026",
    walrusUrl: "https://2mz8…w4t1.walrus.site",
    agentId: "dca-weekly",
  },
  {
    id: "subs-tracker",
    name: "Subs Tracker",
    tagline: "Tracks and cancels unused subscriptions",
    accent: "#8e5bff",
    status: "draft",
    builtIn: "New login for Suilend",
  },
];

export function getProject(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}
