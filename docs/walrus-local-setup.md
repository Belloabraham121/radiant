# Walrus local setup (Radiant deploy)

Radiant publishes generated apps to **Walrus Sites** via `site-builder deploy`. By default the backend uses **`WALRUS_DEPLOY_MOCK=true`** so CI and local dev get synthetic URLs. Follow this guide for **real testnet deploys**.

Official references:

- [Walrus getting started](https://docs.wal.app/docs/getting-started)
- Skill: `backend/.agents/skills/walrus-sites/publishing/SKILL.md`
- Skill: `backend/.agents/skills/walrus-sites/portal/SKILL.md` (testnet portal)

---

## 1. Install CLI tools

```bash
# Sui + Walrus + site-builder (recommended)
suiup install sui walrus site-builder
```

Verify:

```bash
sui --version
walrus --version
site-builder --version
```

---

## 2. Sui testnet wallet

```bash
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io
sui client switch --env testnet
sui client new-address ed25519   # if you don't have one yet
sui client faucet
sui client balance
```

You need **SUI** (gas) and **WAL** (blob storage). On testnet, use the Walrus faucet after configuring Walrus (see below).

---

## 3. Walrus client config

Walrus reads network config from `client_config.yaml` (path varies by install). Typical location:

```bash
# Example — adjust to your suiup layout
export WALRUS_CONFIG_PATH="$HOME/.config/walrus/client_config.yaml"
```

Ensure the **testnet** context is active in that file. See [Walrus getting started](https://docs.wal.app/docs/getting-started).

Fund WAL on testnet:

```bash
walrus get-wal
```

---

## 4. site-builder / sites config

```bash
cat ~/.config/walrus/sites-config.yaml
```

Created automatically by `suiup install site-builder`. Point Radiant at it:

```bash
export WALRUS_SITES_CONFIG_PATH="$HOME/.config/walrus/sites-config.yaml"
```

---

## 5. Backend `.env` (real deploy)

Add or update in `backend/.env`:

```bash
# Real Walrus deploy (not mock URLs)
WALRUS_DEPLOY_MOCK=false
WALRUS_SITES_CONFIG_PATH=$HOME/.config/walrus/sites-config.yaml
WALRUS_CONFIG_PATH=$HOME/.config/walrus/client_config.yaml
WALRUS_SUI_NETWORK=testnet
WALRUS_SITE_EPOCHS=30

# Testnet: use local portal (wal.app is mainnet-only)
WALRUS_PORTAL_BASE_URL=http://localhost:3000
```

Keep `WALRUS_DEPLOY_MOCK=true` in CI and for developers who don't need on-chain publish.

---

## 6. Testnet local portal (required to view sites)

**`wal.app` only serves mainnet.** For testnet, run the Walrus Sites portal locally:

```bash
git clone --depth 1 https://github.com/MystenLabs/walrus-sites.git
cd walrus-sites/portal
bun install
cp server/portal-config.testnet.example.yaml server/portal-config.yaml
bun -F server start
```

Portal default: `http://localhost:3000`

Site URLs look like:

```text
http://<base36-site-id>.localhost:3000
```

After deploy, Radiant sets `Project.walrus_url` using `WALRUS_PORTAL_BASE_URL` + site object id. With the local portal running, open that URL in the browser.

Full details: `backend/.agents/skills/walrus-sites/portal/SKILL.md`

---

## 7. SPA routing (`ws-resources.json`)

Radiant merges a Walrus Sites route before deploy:

```json
{ "routes": { "/*": "/index.html" } }
```

This enables **HashRouter** and client-side routes on the portal. Next.js static export serves `index.html` at the site root.

---

## 8. Preflight check

From `backend/`:

```bash
npm run walrus:check
```

Reports missing binaries, config files, and mock-deploy status.

---

## 9. Manual QA checklist (Phase 3 exit)

- [ ] `WALRUS_DEPLOY_MOCK=false` in local `.env`
- [ ] Testnet wallet funded (SUI + WAL)
- [ ] Local portal running on port 3000
- [ ] Deploy a fixed template or custom app from artifact **Deploy** tab
- [ ] Poll shows progress → `completed` with `walrus_url`
- [ ] URL opens in browser (portal serves HTML/JS)
- [ ] **Projects** page lists project with `walrus_url`
- [ ] HashRouter routes work (e.g. `/sign-in` via artifact preview bar paths)

Mark these in [app-builder-deploy-TODO.md](../app-builder-deploy-TODO.md) Phase 3 when verified.

---

## Troubleshooting

| Symptom | Fix |
| -------- | ----- |
| Mock URL (`random hex`.walrus.site) | Set `WALRUS_DEPLOY_MOCK=false` and restart API |
| `site-builder deploy failed` | Check `sui client balance`, WAL balance, config paths |
| Portal 404 on testnet | Run local portal; don't use `wal.app` |
| Site expires quickly | Raise `WALRUS_SITE_EPOCHS` (default **30**, not 5) |
| Client routes 404 on portal | Confirm `ws-resources.json` has `"/*": "/index.html"` (Radiant adds this automatically) |
