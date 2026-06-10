export type AgentCategory =
  | "swap"
  | "payments"
  | "automation"
  | "savings"
  | "markets"
  | "escrow"
  | "alerts"
  | "offramp"
  | "staking"
  | "portfolio";

export type Agent = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: AgentCategory;
  accent: string;
  feeBps: number;
  uses: number;
  txCount: number;
  volumeSui: number;
  tvlSui: number;
  feesEarnedSui: number;
  creator: string;
  deployedAt: string;
  walrusUrl: string;
};

export type AgentTx = {
  /** Truncated for list views. */
  hash: string;
  fullHash: string;
  action: string;
  /** Truncated for list views. */
  from: string;
  fullFrom: string;
  /** Truncated for list views. */
  to: string;
  fullTo: string;
  amountSui: number;
  gasSui: number;
  block: number;
  minutesAgo: number;
  status: "success" | "pending";
};

/* Deterministic PRNG so server and client render identical mock data. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const C = {
  coral: "#ff5d46",
  blue: "#3865ff",
  mint: "#00c478",
  amber: "#ffb01f",
  violet: "#8e5bff",
};

export const AGENTS: Agent[] = [
  {
    id: "sui-usdc-swap",
    name: "SUI ⇄ USDC Swap",
    tagline: "Best-rate swaps via DeepBook",
    description:
      "Routes every order through DeepBook's shared orderbook for the best executable rate. Callable by humans and agents alike.",
    category: "swap",
    accent: C.blue,
    feeBps: 30,
    uses: 1240,
    txCount: 8412,
    volumeSui: 612400,
    tvlSui: 48200,
    feesEarnedSui: 1837,
    creator: "0x8f3c…9a21",
    deployedAt: "Feb 2026",
    walrusUrl: "https://5xk2…m9q4.walrus.site",
  },
  {
    id: "payroll-bot",
    name: "Payroll Bot",
    tagline: "Monthly payroll on autopilot",
    description:
      "Pays your whole team on a schedule. Set wallets and amounts once — every month it just happens, gas included.",
    category: "payments",
    accent: C.coral,
    feeBps: 10,
    uses: 847,
    txCount: 5083,
    volumeSui: 291800,
    tvlSui: 22400,
    feesEarnedSui: 291,
    creator: "0x2bd1…77e0",
    deployedAt: "Jan 2026",
    walrusUrl: "https://7pq1…r2k8.walrus.site",
  },
  {
    id: "dca-weekly",
    name: "DCA Weekly",
    tagline: "Dollar-cost averaging, hands-free",
    description:
      "Buys a fixed amount of SUI every week, whatever the price. The most boring strategy in finance, fully automated.",
    category: "automation",
    accent: C.mint,
    feeBps: 20,
    uses: 634,
    txCount: 3122,
    volumeSui: 188100,
    tvlSui: 31700,
    feesEarnedSui: 376,
    creator: "0xa4e9…1c5f",
    deployedAt: "Mar 2026",
    walrusUrl: "https://2mz8…w4t1.walrus.site",
  },
  {
    id: "group-vault",
    name: "Group Vault",
    tagline: "Shared savings with rules",
    description:
      "A multi-member vault with contribution schedules and withdrawal votes. Your group's treasury, minus the spreadsheet.",
    category: "savings",
    accent: C.violet,
    feeBps: 15,
    uses: 412,
    txCount: 2940,
    volumeSui: 142600,
    tvlSui: 96400,
    feesEarnedSui: 213,
    creator: "0x61f7…b3a8",
    deployedAt: "Feb 2026",
    walrusUrl: "https://9hb3…k7p2.walrus.site",
  },
  {
    id: "prediction-market",
    name: "Prediction Market",
    tagline: "Yes/no markets on anything",
    description:
      "Spin up a binary market in one sentence. Pools settle onchain, odds update live, the house edge goes to the creator.",
    category: "markets",
    accent: C.amber,
    feeBps: 50,
    uses: 2310,
    txCount: 11206,
    volumeSui: 489300,
    tvlSui: 67800,
    feesEarnedSui: 2446,
    creator: "0xc8d2…04e6",
    deployedAt: "Jan 2026",
    walrusUrl: "https://4vn6…j1s9.walrus.site",
  },
  {
    id: "escrow-deal",
    name: "Escrow Deal",
    tagline: "Trustless deals between strangers",
    description:
      "Locks funds until both sides confirm. Disputes resolve by timeout rules written into the contract.",
    category: "escrow",
    accent: C.blue,
    feeBps: 25,
    uses: 356,
    txCount: 1424,
    volumeSui: 96200,
    tvlSui: 18900,
    feesEarnedSui: 240,
    creator: "0x3a90…ff12",
    deployedAt: "Apr 2026",
    walrusUrl: "https://8qw2…c5m7.walrus.site",
  },
  {
    id: "tip-jar",
    name: "Tip Jar",
    tagline: "One link, any amount",
    description:
      "A zero-fee tip page for creators. Drop the link anywhere — tips land straight in your wallet with a note.",
    category: "payments",
    accent: C.coral,
    feeBps: 0,
    uses: 5120,
    txCount: 14883,
    volumeSui: 73900,
    tvlSui: 0,
    feesEarnedSui: 0,
    creator: "0x77be…2d40",
    deployedAt: "Dec 2025",
    walrusUrl: "https://1kd9…t6f3.walrus.site",
  },
  {
    id: "floor-alert",
    name: "Floor Alert",
    tagline: "NFT floor price watchdog",
    description:
      "Watches collection floors and pings your agent when thresholds break. Other agents subscribe to its feed.",
    category: "alerts",
    accent: C.mint,
    feeBps: 10,
    uses: 928,
    txCount: 6710,
    volumeSui: 12400,
    tvlSui: 0,
    feesEarnedSui: 12,
    creator: "0x5e2c…88a9",
    deployedAt: "Mar 2026",
    walrusUrl: "https://6rt4…p8n1.walrus.site",
  },
  {
    id: "stash",
    name: "Stash",
    tagline: "Personal savings with goals",
    description:
      "Weekly auto-stash toward named goals. Built by a Radiant user in one sentence, now used by hundreds.",
    category: "savings",
    accent: C.coral,
    feeBps: 15,
    uses: 1105,
    txCount: 7233,
    volumeSui: 154800,
    tvlSui: 88200,
    feesEarnedSui: 232,
    creator: "0x90af…6b77",
    deployedAt: "Feb 2026",
    walrusUrl: "https://3jx7…h2v5.walrus.site",
  },
  {
    id: "cashout",
    name: "Cashout",
    tagline: "Crypto off-ramp to your bank",
    description:
      "SUI to fiat in one call. Routes the best rate through DeepBook and settles to a linked bank account.",
    category: "offramp",
    accent: C.blue,
    feeBps: 40,
    uses: 1890,
    txCount: 9341,
    volumeSui: 731500,
    tvlSui: 12800,
    feesEarnedSui: 2926,
    creator: "0xb1c4…3e09",
    deployedAt: "Jan 2026",
    walrusUrl: "https://5fm1…q9z6.walrus.site",
  },
  {
    id: "autostake",
    name: "AutoStake",
    tagline: "Staking automation",
    description:
      "Restakes rewards every Monday at 9:00. Compound interest for people who never want to think about it.",
    category: "staking",
    accent: C.mint,
    feeBps: 20,
    uses: 763,
    txCount: 4108,
    volumeSui: 207300,
    tvlSui: 156900,
    feesEarnedSui: 414,
    creator: "0x44d8…a1f2",
    deployedAt: "Mar 2026",
    walrusUrl: "https://7bn5…x3k8.walrus.site",
  },
  {
    id: "splitz",
    name: "Splitz",
    tagline: "Payment splitter",
    description:
      "Splits any incoming payment between wallets by percentage. Dinner, rent, royalties — one tap each.",
    category: "payments",
    accent: C.amber,
    feeBps: 20,
    uses: 1462,
    txCount: 6650,
    volumeSui: 98700,
    tvlSui: 4100,
    feesEarnedSui: 197,
    creator: "0xe7a3…50cd",
    deployedAt: "Feb 2026",
    walrusUrl: "https://2gw9…d7r4.walrus.site",
  },
  {
    id: "pulse",
    name: "Pulse",
    tagline: "Portfolio tracker",
    description:
      "Live tracking for everything a wallet holds, with daily digests pushed to your agent's memory.",
    category: "portfolio",
    accent: C.violet,
    feeBps: 10,
    uses: 2034,
    txCount: 3805,
    volumeSui: 8900,
    tvlSui: 0,
    feesEarnedSui: 9,
    creator: "0x19fb…c2e8",
    deployedAt: "Apr 2026",
    walrusUrl: "https://8ks2…m1j7.walrus.site",
  },
];

export function getAgent(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}

/** 30-day series derived deterministically from an agent id (or any seed string). */
export function makeSeries(seedKey: string, base: number, volatility: number): number[] {
  const rand = mulberry32(hashSeed(seedKey));
  let v = base;
  return Array.from({ length: 30 }, () => {
    v = Math.max(base * 0.2, v + (rand() - 0.44) * volatility);
    return Math.round(v);
  });
}

const ACTIONS: Record<AgentCategory, string[]> = {
  swap: ["swap SUI→USDC", "swap USDC→SUI", "route via DeepBook"],
  payments: ["send payment", "split payment", "schedule payout"],
  automation: ["execute weekly buy", "rebalance", "trigger schedule"],
  savings: ["deposit to vault", "auto-stash", "withdraw vote"],
  markets: ["place YES bet", "place NO bet", "settle market"],
  escrow: ["lock funds", "release funds", "confirm delivery"],
  alerts: ["floor check", "send alert", "subscribe feed"],
  offramp: ["off-ramp to bank", "quote rate", "settle fiat"],
  staking: ["restake rewards", "delegate stake", "claim rewards"],
  portfolio: ["sync balances", "daily digest", "price refresh"],
};

const HEX = "0123456789abcdef";

function hexAddr(rand: () => number): string {
  return (
    "0x" + Array.from({ length: 64 }, () => HEX[Math.floor(rand() * 16)]).join("")
  );
}

function truncAddr(full: string): string {
  return `${full.slice(0, 6)}…${full.slice(-4)}`;
}

export function makeTxs(agent: Agent, count = 8): AgentTx[] {
  const rand = mulberry32(hashSeed(agent.id + ":txs"));
  const actions = ACTIONS[agent.category];
  let minutes = 0;
  return Array.from({ length: count }, (_, i) => {
    minutes += 1 + Math.floor(rand() * 42);
    const fullHash = hexAddr(rand);
    const fullFrom = hexAddr(rand);
    const fullTo = hexAddr(rand);
    return {
      hash: truncAddr(fullHash),
      fullHash,
      action: actions[Math.floor(rand() * actions.length)],
      from: truncAddr(fullFrom),
      fullFrom,
      to: truncAddr(fullTo),
      fullTo,
      amountSui: Math.round((5 + rand() * 480) * 10) / 10,
      gasSui: Math.round((0.001 + rand() * 0.012) * 10000) / 10000,
      block: 18_420_000 + Math.floor(rand() * 48_000) - minutes * 12,
      minutesAgo: minutes,
      status: i === 0 && rand() > 0.5 ? "pending" : "success",
    };
  });
}

export const NETWORK = {
  totalAgents: AGENTS.length,
  totalTxs: AGENTS.reduce((s, a) => s + a.txCount, 0),
  totalVolumeSui: AGENTS.reduce((s, a) => s + a.volumeSui, 0),
  totalTvlSui: AGENTS.reduce((s, a) => s + a.tvlSui, 0),
  totalFeesSui: AGENTS.reduce((s, a) => s + a.feesEarnedSui, 0),
};

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString("en-US");
}

export function fmtAgo(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
