# Radiant

> Your personal AI agent. It acts, remembers, builds, and earns on your behalf.

---

## What is Radiant?

Radiant is your personal AI agent with a wallet, a memory, and hands.

It is not a chatbot. It is not a DeFi app. It is not a no-code tool. It is all of those things collapsed into one experience — an agent that lives with you, knows you, acts for you, and builds for you.

You talk to it in plain language. It does things.

---

## Your agent wallet

When you create a Radiant account — Google, GitHub, or email — **your agent gets its own Sui wallet automatically**. You do not connect a wallet to sign up. Radiant generates the keypair, encrypts it, and ties it to your account. You hold the keys; Radiant never does.

**Fund the agent** in Settings (or ask it in chat):

1. **Send SUI to the agent address** — copy the full address and transfer from an exchange or any wallet.
2. **Deposit from your personal wallet** — connect Slush, Sui Wallet, or another wallet *only to move funds in*. This is not login; it is a one-off transfer into your agent's wallet.

Once funded, the agent signs transactions, deploys apps, and pays fees on your behalf. You approve big moves; small ones can auto-run based on your permissions.

You never need to connect a wallet to use Radiant day to day. The agent already has one.

---

## What can Radiant do?

### It acts for you

Tell Radiant to do something and it does it.

_"Pay Alex 5 SUI."_ Done.
_"Swap my USDC for SUI at the best rate right now."_ Done.
_"Sign me up for this protocol and connect my wallet."_ Done.
_"Send my weekly contribution to the group wallet."_ Done.

You don't navigate interfaces. You don't connect wallets manually. You don't copy addresses. You just say what you want.

### It remembers everything

Radiant has a persistent memory. It knows your wallets, your preferences, your history, and your apps across every session. You never repeat yourself.

It works like a password manager built into your agent. Every app you connect to, every wallet you use, every service you sign up for — Radiant remembers it. Next time you say _"log me into that DEX I used last week"_, Radiant knows exactly which one, connects your wallet, and gets you in.

No more manually reconnecting wallets. No more searching for contract addresses. No more remembering which account you used where.

### It builds permanent tools for you

When a task is worth doing more than once, Radiant doesn't just execute it — it builds you a dedicated app.

_"I want a tool that sends payroll to my team every month."_
_"Build me a tracker for my onchain portfolio."_
_"Create a payment page I can send to clients."_
_"Make me a voting tool for my community."_

Radiant builds it, deploys it permanently to decentralized storage, and adds it to your personal dashboard. It lives there forever, owned by your wallet. No server to maintain. No subscription to pay.

Your apps are not hosted on Radiant's servers. They live on the blockchain and on Walrus decentralized storage. Even if Radiant disappeared tomorrow, your apps would still be there.

### It lets you share what you build

Every app you build is private by default. But if you think others could use it, you can list it in the Radiant explorer with one click.

Set a fee. Anyone — human or AI agent — can discover your app, use it, and your fee lands in your wallet automatically. You built it once. It earns for you indefinitely.

---

## What makes Radiant different

**It has memory.** Most AI tools reset you between sessions. Radiant doesn't. It accumulates context about who you are, what you have, and what you need — like a personal assistant who has worked with you for years.

**It has hands.** Most AI tools tell you what to do. Radiant does it. It can sign transactions, connect wallets, execute swaps, register accounts, and interact with onchain protocols on your behalf.

**What you build is permanent.** Apps built on Radiant are not generated once and discarded. They are deployed to the blockchain and decentralized storage. They belong to your wallet address. They exist independently of Radiant.

**It is API-first.** Every app you build exposes an API automatically. Other developers, other apps, and other AI agents can call your apps programmatically. Your tools become composable building blocks in a larger ecosystem.

**Anyone can use it.** You do not need to understand blockchain to use Radiant. You just need to describe what you want. The complexity is handled entirely by the agent.

---

## The explorer

The Radiant explorer is a public marketplace of apps built by Radiant users. Every listing is a live, permanent, callable application — not a mockup or a template.

Browse by category. Use any app directly in your browser. Or call its API endpoint from your own code or agent.

Creators earn a fee on every use. Automatically. Onchain.

---

## Example sessions

**Session 1 — Pure action**

> _"Check what my SUI wallet balance is and tell me the current SUI/USDC rate."_
> Radiant fetches your balance and the live rate. No wallet connection prompt. It already knows your wallet.

**Session 2 — Credential management**

> _"Sign me up for Scallop and deposit 20 SUI into the lending pool."_
> Radiant signs up with credentials from its vault, executes the deposit from your agent wallet, and saves your Scallop login for next time.

**Session 3 — Building a personal tool**

> _"I keep doing this manually. Just build me an app that does my weekly SUI staking automatically."_
> Radiant builds a staking automation app, deploys it, adds it to your dashboard. Next week it runs without you touching it.

**Session 4 — Earning from what you built**

> _"List my payment splitter app publicly with a 0.2% fee."_
> Radiant publishes it to the explorer. Other users start using it. You earn on every transaction.

---

---

## Technical Documentation

---

## Architecture Overview

Radiant is built on four layers: a conversational frontend, a TypeScript orchestration backend, an AI agent core that drives all actions and app generation, and a decentralized persistence layer. The system is Sui-first but designed with a chain abstraction layer that allows additional networks to be added as adapters.

```
User (browser)
    │
    ▼
┌──────────────────────────────────────────┐
│             Next.js Frontend              │
│   Chat UI · Dashboard · Explorer · Settings │
│   Auth (Google / GitHub / email)            │
│   Agent wallet (generated on signup)        │
│   Optional @mysten/dapp-kit for deposits    │
└───────────────────┬──────────────────────┘
                    │ HTTP / WebSocket
                    ▼
┌──────────────────────────────────────────┐
│          TypeScript Backend               │
│          Hono HTTP server                 │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │          Claude API                 │  │
│  │          (tool use mode)            │  │
│  │                                     │  │
│  │  Agent tools:                       │  │
│  │  - execute_transaction()            │  │
│  │  - manage_credentials()             │  │
│  │  - select_template()                │  │
│  │  - generate_app()                   │  │
│  │  - deploy_app()                     │  │
│  │  - register_app()                   │  │
│  │  - query_chain()                    │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │      Chain Abstraction Layer        │  │
│  │  ChainAdapter interface             │  │
│  │  └── SuiAdapter (active)            │  │
│  │  └── EvmAdapter (planned)           │  │
│  │  └── SolanaAdapter (planned)        │  │
│  └─────────────────────────────────────┘  │
└───────────────────┬──────────────────────┘
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
┌─────────────────┐   ┌─────────────────┐
│   E2B Sandbox   │   │    Sui RPC       │
│   Sui CLI       │   │    Registry      │
│   Walrus CLI    │   │    DeepBook      │
│   Node / npm    │   │    queries       │
└────────┬────────┘   └─────────────────┘
         │
   ┌─────┴──────────────────┐
   ▼                        ▼
Sui Mainnet             Walrus Network
Move contracts          Sites (app frontends)
AppRegistry objects     Blobs (memory + config)
```

---

## Tech Stack

| Layer             | Technology                                  |
| ----------------- | ------------------------------------------- |
| Frontend          | Next.js 14, React, Tailwind CSS             |
| Wallet            | Agent-generated Sui wallet; `@mysten/dapp-kit` for optional deposits |
| Backend           | TypeScript, Hono                            |
| AI / Agent        | Anthropic Claude API (tool use mode)        |
| Agent memory      | Walrus blobs (persistent across sessions)   |
| Credential store  | Walrus blobs (encrypted, per-user)          |
| Sandbox execution | E2B (REST API + gRPC)                       |
| Onchain (active)  | Sui Move, Sui TypeScript SDK                |
| Order execution   | DeepBook SDK (`@mysten/deepbook-v3`)        |
| App hosting       | Walrus Sites                                |
| Chain abstraction | Custom `ChainAdapter` interface (see below) |
| Monorepo          | Turborepo                                   |

---

## Repository Structure

The UI prototype lives in `client/` today. Backend and Move contracts are planned alongside it.

```
Radiant/
├── client/                                   # Next.js frontend (current)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                      # Landing
│   │   │   ├── auth/                         # Sign up / log in
│   │   │   ├── app/                          # Chat, projects, settings
│   │   │   │   ├── page.tsx                  # Chat
│   │   │   │   ├── projects/
│   │   │   │   └── settings/                 # Profile, agent wallet, vault
│   │   │   └── explorer/                     # Public marketplace
│   │   ├── components/
│   │   │   ├── app/                          # Sidebar, AgentWalletSection
│   │   │   ├── auth/                         # AuthCard
│   │   │   ├── explorer/                     # Charts, TxTable, AgentGrid
│   │   │   └── landing/                      # Hero, pillars, footer
│   │   └── lib/
│   │       ├── app-data.ts                   # Mock chats, USER, credentials
│   │       └── explorer-data.ts              # Mock explorer stats & agents
│
├── apps/                                     # Planned monorepo layout
│   ├── web/                                  # Production Next.js (future merge)
│   │   ├── app/
│   │   │   ├── page.tsx                      # Chat interface (entry point)
│   │   │   ├── dashboard/                    # Personal apps + history
│   │   │   │   └── page.tsx
│   │   │   └── explore/                      # Public marketplace
│   │   │       └── page.tsx
│   │   ├── components/
│   │   │   ├── Chat.tsx                      # Conversational interface
│   │   │   ├── ActionConfirm.tsx             # Transaction confirmation modal
│   │   │   ├── BuildConfirm.tsx              # App deploy confirmation
│   │   │   ├── AppCard.tsx                   # Explorer listing card
│   │   │   └── DepositButton.tsx             # Optional personal-wallet deposit
│   │   └── lib/
│   │       ├── sui.ts                        # Sui client config
│   │       └── api.ts                        # Backend API client
│   │
│   └── api/                                  # TypeScript backend
│       ├── src/
│       │   ├── index.ts                      # Hono server entry
│       │   ├── routes/
│       │   │   ├── chat.ts                   # POST /chat
│       │   │   ├── build.ts                  # POST /build
│       │   │   ├── deploy.ts                 # POST /deploy
│       │   │   ├── apps.ts                   # GET /apps
│       │   │   └── app/[id].ts               # GET+POST /app/:id
│       │   ├── agent/
│       │   │   ├── claude.ts                 # Claude API client
│       │   │   ├── tools.ts                  # Tool handler implementations
│       │   │   └── templates.ts              # App template selection
│       │   ├── chains/                       # Chain abstraction layer
│       │   │   ├── adapter.ts                # ChainAdapter interface
│       │   │   ├── registry.ts               # Chain registry (active adapters)
│       │   │   └── adapters/
│       │   │       ├── sui.ts                # Sui adapter (active)
│       │   │       ├── evm.ts                # EVM adapter (stub)
│       │   │       └── solana.ts             # Solana adapter (stub)
│       │   ├── memory/
│       │   │   ├── agent-memory.ts           # Per-user agent memory (Walrus)
│       │   │   └── credentials.ts            # Credential store (Walrus, encrypted)
│       │   ├── sandbox/
│       │   │   └── e2b.ts                    # E2B sandbox client
│       │   └── walrus/
│       │       ├── sites.ts                  # Walrus Sites deployment
│       │       └── blobs.ts                  # Walrus blob store/fetch
│       └── tsconfig.json
│
├── packages/
│   ├── move/                                 # Sui Move contracts
│   │   ├── registry/                         # Radiant AppRegistry module
│   │   └── templates/
│   │       ├── swap/
│   │       ├── prediction/
│   │       └── escrow/
│   │
│   └── shared/                               # Shared TypeScript types
│       └── src/
│           └── types.ts
│
├── turbo.json
├── package.json
└── README.md
```

---

## Chain Abstraction Layer

Radiant is Sui-first but designed to support multiple chains through a `ChainAdapter` interface. Every chain-specific operation in the backend goes through this interface. Adding a new chain means implementing the adapter — nothing else in the codebase changes.

```typescript
// apps/api/src/chains/adapter.ts

export interface ChainAdapter {
  chainId: string;
  name: string;

  // Querying
  getBalance(address: string, token?: string): Promise<bigint>;
  getTokenPrice(token: string): Promise<number>;
  getTransactionStatus(txId: string): Promise<TransactionStatus>;

  // Execution
  transfer(
    to: string,
    amount: bigint,
    token: string,
    signer: Signer,
  ): Promise<string>;
  executeTransaction(tx: UnsignedTransaction, signer: Signer): Promise<string>;

  // App deployment
  deployContract(
    bytecode: Uint8Array,
    params: Record<string, unknown>,
    signer: Signer,
  ): Promise<string>;

  // Credential / wallet management
  resolveAddress(nameOrAddress: string): Promise<string>;
  signMessage(message: string, signer: Signer): Promise<string>;
}
```

### Active adapter — Sui

```typescript
// apps/api/src/chains/adapters/sui.ts

import { SuiClient } from "@mysten/sui/client";
import { DeepBookClient } from "@mysten/deepbook-v3";

export class SuiAdapter implements ChainAdapter {
  chainId = "sui:mainnet";
  name = "Sui";

  private client: SuiClient;
  private deepbook: DeepBookClient;

  constructor() {
    this.client = new SuiClient({ url: process.env.SUI_RPC_URL! });
    this.deepbook = new DeepBookClient({ client: this.client, env: "mainnet" });
  }

  async getBalance(address: string, token = "SUI"): Promise<bigint> {
    const { totalBalance } = await this.client.getBalance({
      owner: address,
      coinType: token,
    });
    return BigInt(totalBalance);
  }

  async transfer(
    to: string,
    amount: bigint,
    token: string,
    signer: Signer,
  ): Promise<string> {
    // Build and execute Sui PTB
    // ...
  }

  // ... rest of implementation
}
```

### Stub adapters — future chains

```typescript
// apps/api/src/chains/adapters/evm.ts

export class EvmAdapter implements ChainAdapter {
  chainId: string;
  name: string;

  constructor(chainId: string, name: string, rpcUrl: string) {
    this.chainId = chainId;
    this.name = name;
    // viem or ethers.js client setup
  }

  // Implement ChainAdapter interface using viem
  // One class covers Ethereum, Base, Arbitrum, Polygon, etc.
  // Instantiate with different rpcUrl per chain
}
```

```typescript
// apps/api/src/chains/adapters/solana.ts

export class SolanaAdapter implements ChainAdapter {
  chainId = "solana:mainnet";
  name = "Solana";
  // Implement using @solana/web3.js
}
```

### Chain registry

```typescript
// apps/api/src/chains/registry.ts

import { SuiAdapter } from "./adapters/sui";

const adapters: Map<string, ChainAdapter> = new Map();

// Only Sui active now — add others here when ready
adapters.set("sui:mainnet", new SuiAdapter());

// Future:
// adapters.set('eip155:1',      new EvmAdapter('eip155:1', 'Ethereum', process.env.ETH_RPC_URL!))
// adapters.set('eip155:8453',   new EvmAdapter('eip155:8453', 'Base', process.env.BASE_RPC_URL!))
// adapters.set('solana:mainnet', new SolanaAdapter())

export function getAdapter(chainId: string): ChainAdapter {
  const adapter = adapters.get(chainId);
  if (!adapter) throw new Error(`No adapter registered for chain: ${chainId}`);
  return adapter;
}

export function getActiveChains(): ChainAdapter[] {
  return Array.from(adapters.values());
}
```

When the agent needs to execute something on a specific chain, it calls `getAdapter(chainId)` and uses the returned adapter. The agent tool implementations never import a chain SDK directly — they always go through the registry.

---

## Agent Memory and Credential Store

Both agent memory and the credential store are stored as encrypted Walrus blobs, keyed to the user's wallet address. This means memory is decentralized, owned by the user, and persists across sessions without Radiant needing a database.

```typescript
// apps/api/src/memory/agent-memory.ts

export interface AgentMemory {
  wallets: Record<string, string>; // chain → address
  preferences: Record<string, unknown>;
  app_history: string[]; // registry object IDs of built apps
  last_active: number;
}

export async function loadMemory(userAddress: string): Promise<AgentMemory> {
  const blobId = await lookupMemoryBlobId(userAddress); // from AppRegistry index
  if (!blobId) return defaultMemory();
  const raw = await walrusBlobs.fetch(blobId);
  return decrypt(raw, userAddress);
}

export async function saveMemory(
  userAddress: string,
  memory: AgentMemory,
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(memory), userAddress);
  const blobId = await walrusBlobs.store(encrypted);
  await updateMemoryIndex(userAddress, blobId);
}
```

```typescript
// apps/api/src/memory/credentials.ts

export interface CredentialEntry {
  service: string; // e.g. "scallop", "cetus", "turbos"
  chain: string;
  wallet_address: string;
  metadata: Record<string, string>; // session tokens, account IDs, etc.
  created_at: number;
}

export async function saveCredential(
  userAddress: string,
  entry: CredentialEntry,
): Promise<void>;
export async function getCredential(
  userAddress: string,
  service: string,
): Promise<CredentialEntry | null>;
export async function listCredentials(
  userAddress: string,
): Promise<CredentialEntry[]>;
```

---

## Agent Tool Definitions

```typescript
// apps/api/src/agent/tools.ts

const tools: Tool[] = [
  {
    name: "execute_transaction",
    description:
      "Execute any onchain transaction on behalf of the user — transfer, swap, stake, deposit, etc.",
    input_schema: {
      type: "object",
      properties: {
        chain_id: { type: "string" },
        action: { type: "string" },
        params: { type: "object" },
      },
      required: ["chain_id", "action", "params"],
    },
  },
  {
    name: "query_chain",
    description:
      "Read onchain data — balances, prices, transaction status, protocol state",
    input_schema: {
      type: "object",
      properties: {
        chain_id: { type: "string" },
        query: { type: "string" },
        params: { type: "object" },
      },
      required: ["chain_id", "query"],
    },
  },
  {
    name: "manage_credentials",
    description:
      "Save, retrieve, or list credentials for services and protocols the user has connected",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["save", "get", "list"] },
        service: { type: "string" },
        data: { type: "object" },
      },
      required: ["action"],
    },
  },
  {
    name: "update_memory",
    description: "Update the agent's persistent memory for this user",
    input_schema: {
      type: "object",
      properties: {
        updates: { type: "object" },
      },
      required: ["updates"],
    },
  },
  {
    name: "select_template",
    description: "Select and parameterize an app template based on user intent",
    input_schema: {
      type: "object",
      properties: {
        template: { type: "string" },
        params: { type: "object" },
      },
      required: ["template", "params"],
    },
  },
  {
    name: "generate_app",
    description: "Generate a React frontend for the selected template",
    input_schema: {
      type: "object",
      properties: {
        template: { type: "string" },
        package_id: { type: "string" },
        customization: { type: "object" },
      },
      required: ["template", "package_id"],
    },
  },
  {
    name: "deploy_app",
    description:
      "Deploy Move contract via E2B and upload frontend to Walrus Sites",
    input_schema: {
      type: "object",
      properties: {
        template: { type: "string" },
        params: { type: "object" },
        app_name: { type: "string" },
      },
      required: ["template", "params", "app_name"],
    },
  },
  {
    name: "register_app",
    description: "Register the deployed app in the Radiant onchain registry",
    input_schema: {
      type: "object",
      properties: {
        package_id: { type: "string" },
        walrus_url: { type: "string" },
        walrus_blob_id: { type: "string" },
        fee_bps: { type: "number" },
        category: { type: "string" },
        description: { type: "string" },
        is_public: { type: "boolean" },
      },
      required: ["package_id", "walrus_url", "fee_bps", "is_public"],
    },
  },
];
```

---

## Deploy Pipeline

```
1. POST /deploy received
   { template, params, wallet_address, is_public, fee_bps, app_name }

2. E2B sandbox spawned
   - Sui CLI pre-installed
   - Walrus CLI pre-installed
   - Node.js + npm pre-installed

3. Contract deployment
   - Move template parameterized and written to sandbox
   - `sui client publish --gas-budget 100000000`
   - Package ID extracted from stdout

4. Frontend generation
   - Claude generates React component for template
   - Package ID injected into contract bindings
   - `npm install && npm run build` runs in sandbox

5. Walrus Sites deployment
   - `walrus site-builder deploy ./dist --name <app_name>`
   - Walrus Site URL returned

6. Config stored as Walrus blob
   - { package_id, walrus_url, template, params, creator, api_endpoint }
   - Blob ID returned

7. AppRegistry object created onchain
   - { creator, walrus_url, package_id, walrus_blob_id, fee_bps, is_public }

8. User agent memory updated
   - App added to user's app_history in their Walrus memory blob

9. E2B sandbox killed

10. Response returned
    { package_id, walrus_url, registry_object_id, api_endpoint }
```

---

## Move Contracts

### App Registry

```move
public struct AppRegistry has key, store {
    id: UID,
    creator: address,
    walrus_url: String,
    package_id: String,
    walrus_blob_id: String,
    fee_bps: u64,
    category: String,
    is_public: bool,
    created_at: u64,
    usage_count: u64,
}
```

### Swap Template (DeepBook)

```move
public fun swap(
    pool: &mut Pool<BaseAsset, QuoteAsset>,
    input: Coin<BaseAsset>,
    min_output: u64,
    fee_recipient: address,
    fee_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext
): Coin<QuoteAsset>
```

### Prediction Market Template

```move
public struct Market has key {
    id: UID,
    creator: address,
    question: String,
    expiry: u64,
    fee_bps: u64,
    yes_pool: Balance<SUI>,
    no_pool: Balance<SUI>,
    resolved: bool,
    outcome: Option<bool>,
}
```

### Escrow Template

```move
public struct Escrow has key {
    id: UID,
    sender: address,
    recipient: address,
    amount: Balance<SUI>,
    fee_recipient: address,
    fee_bps: u64,
    released: bool,
}
```

---

## API Reference

### `POST /chat`

General conversation. Agent reads user memory and credentials before responding.

```json
// Request
{ "message": "What's my SUI balance?", "session_id": "abc123", "wallet": "0x..." }

// Response
{ "reply": "You have 142.5 SUI in your main wallet.", "session_id": "abc123" }
```

### `POST /build`

Returns a preview of what will be built without deploying.

```json
// Request
{ "prompt": "Build me a tool that splits payments between 3 wallets", "wallet": "0x..." }

// Response
{
  "template": "escrow",
  "params": { "recipients": 3, "fee_bps": 0 },
  "description": "A payment splitter that divides any incoming SUI equally between 3 wallet addresses.",
  "estimated_gas": "0.05 SUI"
}
```

### `POST /deploy`

Full deployment pipeline.

```json
// Request
{
  "template": "escrow",
  "params": { "recipients": 3 },
  "wallet_address": "0x...",
  "is_public": false,
  "app_name": "my-payment-splitter"
}

// Response
{
  "package_id": "0x...",
  "walrus_url": "https://<blob-id>.walrus.site",
  "registry_object_id": "0x...",
  "api_endpoint": "https://Radiant.so/app/0x..."
}
```

### `GET /apps`

Public marketplace listings.

```json
// Response
{
  "apps": [
    {
      "registry_object_id": "0x...",
      "creator": "0x...",
      "walrus_url": "https://<blob-id>.walrus.site",
      "api_endpoint": "https://Radiant.so/app/0x...",
      "fee_bps": 30,
      "category": "swap",
      "usage_count": 142,
      "description": "SUI/USDC swap with 0.3% fee"
    }
  ],
  "total": 38
}
```

### `POST /app/:id/call`

Call any listed app programmatically. Used by external agents and developers.

```json
// Request
{ "action": "swap", "input_amount": 10000000, "min_output": 9500000, "wallet": "0x..." }

// Response
{ "tx_digest": "0x...", "output_amount": 9750000, "fee_charged": 29250 }
```

---

## Environment Variables

```bash
# Backend — apps/api/.env
ANTHROPIC_API_KEY=sk-ant-...
E2B_API_KEY=e2b_...
SUI_PRIVATE_KEY=...
SUI_RPC_URL=https://fullnode.mainnet.sui.io
WALRUS_API_URL=https://api.walrus.site
WALRUS_PUBLISHER_URL=https://publisher.walrus.site
Radiant_REGISTRY_PACKAGE_ID=0x...

# Future chains — add when adapters are activated
# ETH_RPC_URL=https://mainnet.infura.io/v3/...
# BASE_RPC_URL=https://mainnet.base.org
# SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Frontend — client/.env.local (or apps/web/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUI_NETWORK=mainnet
NEXT_PUBLIC_REGISTRY_PACKAGE_ID=0x...
```

### Run the frontend prototype

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up at `/auth`, then fund your agent at `/app/settings`.

---

## Hackathon Track

**Primary track:** Agentic Web

**Specialized integrations:**

- **Walrus** — Walrus Sites for permanent decentralized app hosting; Walrus blobs for agent memory and credential storage
- **DeepBook** — swap template routes all order execution through DeepBook's shared orderbook

---

## Roadmap

**v1 — Hackathon**
Conversational agent, direct transaction execution, credential memory, app builder with swap + prediction + escrow templates, Walrus hosting, public explorer, API-first app layer. Sui only.

**v2 — Multi-chain**
Activate EVM adapter (Ethereum, Base, Arbitrum) and Solana adapter. Cross-chain swaps and transfers via agent. Multi-chain credential store.

**v3 — Ecosystem**
Agent memory marketplace — buy and sell Walrus-stored agent knowledge packs. Third-party template SDK so developers can publish their own app templates. Revenue analytics for creators. Agent-to-agent app calls with automatic fee settlement.
