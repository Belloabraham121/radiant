Actionable comments posted: 1

Note

Due to the large number of review comments, Critical severity comments were prioritized as inline comments.

🟠 Major comments (26)
backend/src/services/agent-transaction/approval-preview/enrichers/soroswap.ts-64-65 (1)
64-65: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Preserve camelCase tradeType when building fallback offers.

The quote path already accepts both trade_type and tradeType, but this fallback builder only reads trade_type. A non-Stellar stellar_swap with tradeType: "EXACT_OUT" will store a fallback offer without trade_type, and the accepted fallback can be re-quoted on the wrong side. Normalize both aliases before calling buildStellarRoutingFallbackOffer().

Proposed fix

- const tradeType = input.params.trade_type;

* const rawTradeType = input.params.trade_type ?? input.params.tradeType;
* const tradeType =
* rawTradeType === "EXACT_IN" || rawTradeType === "EXACT_OUT"
*      ? rawTradeType
*      : undefined;
  const slippage = readNumber(input.params, "slippage") ?? undefined;
  @@

-      ...(tradeType === "EXACT_IN" || tradeType === "EXACT_OUT"
-        ? { trade_type: tradeType }
-        : {}),

*      ...(tradeType ? { trade_type: tradeType } : {}),
  Also applies to: 89-91

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In
`@backend/src/services/agent-transaction/approval-preview/enrichers/soroswap.ts`
around lines 64 - 65, The fallback offer builder in soroswap.ts only reads
input.params.trade_type, so it misses the camelCase tradeType alias and can
build a fallback with the wrong side. Update the fallback path around tradeType
and buildStellarRoutingFallbackOffer() to normalize both input.params.trade_type
and input.params.tradeType before constructing the offer, matching the alias
handling already used in the quote path.
backend/src/inngest/functions/soroswap-track-swap.ts-13-15 (1)
13-15: 🩺 Stability & Availability | 🟠 Major | ⚡ Quick win

Validate the queued payload at the function boundary. event.data as SoroswapTrackJobInput is only a compile-time assertion, so malformed or replayed events can still reach runSoroswapTrackPollLoop() and burn retries before tracking ever starts. Parse event.data here or bind the function to a typed Inngest event schema.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/inngest/functions/soroswap-track-swap.ts` around lines 13 - 15,
The function boundary in soroswap-track-swap currently trusts event.data via a
type assertion, so invalid queued payloads can still reach
runSoroswapTrackPollLoop. Validate or parse event.data before calling
runSoroswapTrackPollLoop, or update the Inngest function definition to use a
typed event schema so the payload is enforced at ingress rather than only by
TypeScript.
backend/src/services/defi/stellar-routing/stellar-routing-fallback.service.ts-49-57 (1)
49-57: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Don't synthesize a Sui selection when no chain was chosen.

detectStellarRoutingFallback() treats an absent intent.chainId as "sui", but partialSwapIntentToStellarRoutingIntent() rejects that same input. That lets the flow offer Stellar fallback for an intent it cannot later materialize.

Suggested fix
export function detectStellarRoutingFallback(intent: PartialSwapIntent): boolean {
const inputCoin = intent.inputCoin?.trim();
const outputCoin = intent.outputCoin?.trim();
if (!inputCoin || !outputCoin) {
return false;
}

- const selectedChain = intent.chainId ?? "sui";

* const selectedChain = intent.chainId;
* if (!selectedChain) {
* return false;
* }
  const selectedEvm = intent.evmChainId;
  if (selectedChain === "stellar") {
  return false;
  }
  Also applies to: 86-95

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In
`@backend/src/services/defi/stellar-routing/stellar-routing-fallback.service.ts`
around lines 49 - 57, detectStellarRoutingFallback() should not assume a missing
intent.chainId means "sui", because that makes the fallback eligible even when
partialSwapIntentToStellarRoutingIntent() cannot build it. Update the chain
selection logic in detectStellarRoutingFallback() (and any related branch around
the fallback eligibility check) to require an explicit Sui chain selection
instead of synthesizing one from an absent chainId, so the fallback is only
offered when the intent can actually be materialized.
backend/src/services/defi/stellar-routing/stellar-routing-fallback.service.ts-143-167 (1)
143-167: 🗄️ Data Integrity & Integration | 🟠 Major | 🏗️ Heavy lift

Make fallback offers single-use with an atomic state transition.

Both accept and reject do a read/validate/write sequence against Redis. Two concurrent requests can both observe status === "offered", and accept widens the race further by fetching a quote before marking the offer accepted. That makes the state machine last-write-wins instead of single-consume.

Move the transition into one compare-and-set/transaction at the cache layer, and only continue when that transition succeeds.

Also applies to: 175-198

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In
`@backend/src/services/defi/stellar-routing/stellar-routing-fallback.service.ts`
around lines 143 - 167, The fallback offer flow in acceptStellarRoutingFallback
and the matching reject path must use a single atomic
compare-and-set/transaction instead of read/validate/write. Update the Redis
cache helpers used by getStellarRoutingFallbackOffer,
markStellarRoutingFallbackAccepted, and markStellarRoutingFallbackRejected so
the status transition from “offered” only succeeds once, and have
acceptStellarRoutingFallback proceed to callGetSoroswapQuote only after that
transition succeeds. If the transition fails, return the appropriate AppError
based on the current state.
backend/src/services/defi/stellar-routing/stellar-routing-fallback.service.ts-75-83 (1)
75-83: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Preserve the original quote parameters in the fallback intent.

The stored offer snapshots trade_type, slippage, and from_address, but partialSwapIntentToStellarRoutingIntent() never copies them. Any non-default values are lost before acceptStellarRoutingFallback() re-quotes, so the fallback path can return a materially different quote from the user's original request.

Also applies to: 86-103, 120-135

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In
`@backend/src/services/defi/stellar-routing/stellar-routing-fallback.service.ts`
around lines 75 - 83, The fallback intent is dropping original quote fields, so
preserve the user’s `trade_type`, `slippage`, and `from_address` through
`partialSwapIntentToStellarRoutingIntent()` and into the
`StellarRoutingFallbackIntent` used by `acceptStellarRoutingFallback()`. Update
the intent conversion and any related snapshot/quote param shaping in
`stellar-routing-fallback.service.ts` so `snapshotQuoteParams()` re-quotes with
the exact original values instead of defaults.
backend/src/services/agent-transaction/stellar-routing-fallback-approval.service.ts-14-30 (1)
14-30: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Don't hand-roll the fallback execute params.

This helper bypasses the normal Soroswap quote→execute param builder and only copies a subset of fields. The regular Stellar swap path populates quote metadata that buildPendingTransactionPreview() and the client approval bar use for expiry/refresh handling; here those fields are dropped, so accepted fallback quotes can be approved without the normal stale-quote guard. Route this through the same helper path used by executeResolvedStellarSwap() instead of rebuilding the params here.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In
`@backend/src/services/agent-transaction/stellar-routing-fallback-approval.service.ts`
around lines 14 - 30, The stellarRoutingQuoteToExecuteInput helper is
hand-rolling execute params and dropping the normal quote metadata used by
buildPendingTransactionPreview() and the approval flow. Update this path to
reuse the same Stellar swap quote-to-execute builder used by
executeResolvedStellarSwap() so accepted fallback quotes carry the full
pending-transaction fields, including expiry/refresh-related data, instead of
reconstructing a partial ExecuteTransactionInput here.
backend/src/services/defi/soroswap/soroswap-status-tracker.service.ts-189-195 (1)
189-195: 🩺 Stability & Availability | 🟠 Major | ⚡ Quick win

Persist a terminal outcome when local polling gives up.

When attempt >= MAX_LOCAL_POLL_ATTEMPTS, both branches just return. If this poller is the active tracker, the transaction stays pending forever and the chat never gets a final state. Mark it timed out/failed, or hand off to the durable Inngest poller before returning.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/defi/soroswap/soroswap-status-tracker.service.ts` around
lines 189 - 195, The local polling exit paths in
soroswap-status-tracker.service.ts currently just return when attempt >=
MAX_LOCAL_POLL_ATTEMPTS, leaving the transaction stuck as pending. Update the
terminal handling in the poll loop around the outcome/try-catch branches so
that, before returning, the active tracker persists a terminal state such as
timed out/failed or explicitly hands off to the durable Inngest poller. Use the
existing tracker flow in soroswap-status-tracker.service.ts to ensure a final
status is written instead of silently stopping.
backend/src/services/agent-transaction/approval-preview/enrichers/soroswap-route-params.ts-181-184 (1)
181-184: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Avoid defaulting unresolved Soroswap quotes to XLM → USDC.

When a pending approval only still has quote_id/route_id, these fallbacks feed storedPayloadToSwapQuote() and fabricate the pair in the approval card. Let this path stay unresolved until real symbols are present.

Suggested change

- const tokenIn =
- readTokenSymbol(params, ["token_in", "input_coin", "from_token"]) ?? "XLM";
- const tokenOut =
- readTokenSymbol(params, ["token_out", "output_coin", "to_token"]) ?? "USDC";

* const tokenIn = readTokenSymbol(params, ["token_in", "input_coin", "from_token"]);
* const tokenOut = readTokenSymbol(params, ["token_out", "output_coin", "to_token"]);
  ...

-      const quote = storedPayloadToSwapQuote(stored, tokenIn, tokenOut);
-      return applySoroswapQuoteToExecuteParams(params, quote);

*      if (tokenIn && tokenOut) {
*        const quote = storedPayloadToSwapQuote(stored, tokenIn, tokenOut);
*        return applySoroswapQuoteToExecuteParams(params, quote);
*      }
  Also applies to: 199-207

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In
`@backend/src/services/agent-transaction/approval-preview/enrichers/soroswap-route-params.ts`
around lines 181 - 184, Avoid defaulting unresolved Soroswap approval quotes to
XLM → USDC in the Soroswap route params enricher. In soroswap-route-params.ts,
update the token resolution logic around readTokenSymbol and
storedPayloadToSwapQuote() so that when only quote_id/route_id is present and no
real symbols can be read, the path remains unresolved instead of fabricating
fallback tokens. Keep the pair unset/nullable until actual token_in/token_out
(or equivalent symbols) are available, and apply the same change to the related
token resolution block referenced by the comment.
backend/src/services/agent-transaction/deepbook/build-display.ts-143-170 (1)
143-170: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Keep Soroswap display aliases aligned with the preview builder.

This branch ignores from_token/to_token and then falls back to XLM/USDC. For the same input, buildSoroswapSwapPreview() can show one pair while the header/title shows another.

Suggested change
const inputCoin =
(typeof input.params.token_in === "string" && input.params.token_in) ||
(typeof input.params.input_coin === "string" && input.params.input_coin) ||

-      "XLM";

*      (typeof input.params.from_token === "string" && input.params.from_token) ||
*      "token";
  const outputCoin =
  (typeof input.params.token_out === "string" && input.params.token_out) ||
  (typeof input.params.output_coin === "string" && input.params.output_coin) ||

-      "USDC";

*      (typeof input.params.to_token === "string" && input.params.to_token) ||
*      "token";
  🤖 Prompt for AI Agents
  Verify each finding against current code. Fix only still-valid issues, skip the
  rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/agent-transaction/deepbook/build-display.ts` around
lines 143 - 170, The Soroswap display branch in buildDisplay is not using the
same token alias resolution as the preview builder, so the title and amount text
can diverge from buildSoroswapSwapPreview(). Update the token lookup in the
isSoroswapExecuteAction(input.action) / stellar branch to include from_token and
to_token alongside the existing token_in/input_coin and token_out/output_coin
fallbacks, and keep the final labels consistent with the same resolved pair used
by the preview logic.
backend/src/services/agent/transaction-approval.service.ts-305-311 (1)
305-311: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Don't synthesize quote expiry for XDR-only Stellar swaps.

coalesceDeFiQuoteExpiresAt(null) manufactures a TTL even when the execute input only has transaction_xdr. Those pending approvals will start expiring and can later fail with QUOTE_EXPIRED even though there is no Soroswap quote to refresh.

Suggested change
} else if (isSoroswapExecuteAction(enriched.action) && enriched.chain_id === "stellar") {

- const coalescedExpiry = coalesceDeFiQuoteExpiresAt(readDeFiQuoteExpiresAt(enriched.params));
- enriched.params = {
-      ...enriched.params,
-      expires_at: coalescedExpiry,
-      quote_expires_at: coalescedExpiry,
- };

* const rawExpiry = readDeFiQuoteExpiresAt(enriched.params);
* if (rawExpiry) {
*      const coalescedExpiry = coalesceDeFiQuoteExpiresAt(rawExpiry);
*      enriched.params = {
*        ...enriched.params,
*        expires_at: coalescedExpiry,
*        quote_expires_at: coalescedExpiry,
*      };
* }
  }
  🤖 Prompt for AI Agents
  Verify each finding against current code. Fix only still-valid issues, skip the
  rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/agent/transaction-approval.service.ts` around lines 305

- 311, The Stellar Soroswap branch in transaction-approval.service.ts is always
  calling coalesceDeFiQuoteExpiresAt on readDeFiQuoteExpiresAt(enriched.params),
  which synthesizes an expiry even when the execute input is XDR-only. Update the
  isSoroswapExecuteAction(enriched.action) and enriched.chain_id === "stellar"
  path to only set expires_at and quote_expires_at when a real quote expiry
  already exists in enriched.params, and leave XDR-only approvals unchanged so no
  synthetic TTL is created.
  backend/src/services/defi/soroswap/soroswap-quote.service.ts-121-136 (1)
  121-136: 🗄️ Data Integrity & Integration | 🟠 Major | ⚡ Quick win

Make quote_id unique to the full quote snapshot.

Lines 121-136 hash only the request params plus amountIn/amountOut. If Soroswap returns a different route with the same amounts, storeSoroswapQuote() will reuse the same id and overwrite the earlier snapshot, so build/execute can submit a route different from the one the user approved.

Suggested fix

- const quoteSeed = JSON.stringify({
- ...cacheParams,
- amountIn: quote.amountIn,
- amountOut: quote.amountOut,
- });

* const quoteSeed = JSON.stringify({
* request: cacheParams,
* quote,
* });
  const quoteId = createSoroswapQuoteId(quoteSeed);
  🤖 Prompt for AI Agents
  Verify each finding against current code. Fix only still-valid issues, skip the
  rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/defi/soroswap/soroswap-quote.service.ts` around lines
121 - 136, The current quote_id generation in soroswap-quote.service.ts only
hashes cacheParams plus amountIn/amountOut, so different Soroswap routes with
the same amounts can collide and overwrite each other in storeSoroswapQuote().
Update the quoteId derivation in the quote-building flow to include the full
quote snapshot from quote (or the exact route fields that define it), then store
that expanded seed before calling createSoroswapQuoteId so each persisted quote
maps to the exact approved route.
backend/src/services/defi/soroswap/soroswap-rate-limit.ts-16-31 (1)
16-31: 🩺 Stability & Availability | 🟠 Major | ⚡ Quick win

Don't spend the shared bucket before the user bucket succeeds.

If Lines 16-31 reject on the per-user bucket, the global token is already gone. That lets one noisy user burn shared Soroswap capacity with requests that never succeed.

Suggested fix
export async function consumeSoroswapOutboundQuota(userId: string, cost = 1): Promise<void> {
const config = outboundBucketConfig();

- const globalAllowed = await tryConsumeTokenBucket("soroswap:outbound:global", config, cost);
- if (!globalAllowed) {
- throw new AppError(
-      429,
-      "SOROSWAP_RATE_LIMITED",
-      "Stellar quotes are temporarily rate limited; try again shortly.",
- );
- }
- const userAllowed = await tryConsumeTokenBucket(`soroswap:outbound:user:${userId}`, config, cost);
  if (!userAllowed) {
  throw new AppError(
  429,
  "SOROSWAP_RATE_LIMITED",
  "Stellar quotes are temporarily rate limited; try again shortly.",
  );
  }

*
* const globalAllowed = await tryConsumeTokenBucket("soroswap:outbound:global", config, cost);
* if (!globalAllowed) {
* throw new AppError(
*      429,
*      "SOROSWAP_RATE_LIMITED",
*      "Stellar quotes are temporarily rate limited; try again shortly.",
* );
* }
  }
  If the bucket helper can do an atomic multi-key consume, that would be even better.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/defi/soroswap/soroswap-rate-limit.ts` around lines 16 -
31, The Soroswap rate-limit check in soroswap-rate-limit.ts consumes the shared
global bucket before verifying the per-user bucket, so failed user-specific
requests still burn global capacity. Update the rate-limit flow around the
token-bucket checks to validate the user bucket first, or better, use a single
atomic multi-key consume in tryConsumeTokenBucket if supported so global and
user quotas are decremented together only when both can succeed. Keep the
AppError handling in the same rate-limiting path.
backend/src/config/soroswap.ts-42-45 (1)
42-45: 🩺 Stability & Availability | 🟠 Major | ⚡ Quick win

Validate env-derived numeric config before returning it.

Lines 42-45 can return NaN for malformed env values, and that flows straight into slippageBpsFromFraction() and the token-bucket config. A single bad deploy var can turn quote requests into invalid Soroswap payloads or break throttling entirely.

Suggested fix
+const slippageSchema = z.coerce.number().finite().min(0).max(1);
+const positiveIntSchema = z.coerce.number().int().positive();

- export function getSoroswapConfig(): SoroswapConfig {
- const parsedSlippage = slippageSchema.safeParse(optional("SOROSWAP_DEFAULT_SLIPPAGE", "0.01"));
- const parsedCapacity = positiveIntSchema.safeParse(optional("SOROSWAP_RATE_LIMIT_CAPACITY", "30"));
- const parsedRefillMs = positiveIntSchema.safeParse(optional("SOROSWAP_RATE_LIMIT_REFILL_MS", "2000"));
- const networkRaw = process.env.SOROSWAP_NETWORK?.trim().toLowerCase();
  const network = soroswapNetworkSchema.safeParse(networkRaw).success
  ? (networkRaw as SoroswapNetwork)
  : "mainnet";
  @@
  return {
  enabled: process.env.SOROSWAP_ENABLED?.trim() === "true",
  apiBaseUrl: baseUrl.replace(/\/$/, ""),
  apiKey: process.env.SOROSWAP_API_KEY?.trim() ?? "",
  network,

* defaultSlippage: Number.parseFloat(optional("SOROSWAP_DEFAULT_SLIPPAGE", "0.01")),

- defaultSlippage: parsedSlippage.success ? parsedSlippage.data : 0.01,
  defaultTradeType,

* rateLimitCapacity: Number.parseInt(optional("SOROSWAP_RATE_LIMIT_CAPACITY", "30"), 10),
* rateLimitRefillIntervalMs: Number.parseInt(optional("SOROSWAP_RATE_LIMIT_REFILL_MS", "2000"), 10),

- rateLimitCapacity: parsedCapacity.success ? parsedCapacity.data : 30,
- rateLimitRefillIntervalMs: parsedRefillMs.success ? parsedRefillMs.data : 2000,
  };
  }
  🤖 Prompt for AI Agents
  Verify each finding against current code. Fix only still-valid issues, skip the
  rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/config/soroswap.ts` around lines 42 - 45, Validate the numeric
env-derived values in soroswap config before returning them from the config
builder, since defaultSlippage, rateLimitCapacity, and rateLimitRefillIntervalMs
can become NaN from malformed env vars. Update the Soroswap config parsing logic
in the function that returns these fields to fall back to safe defaults or throw
a clear error when parsing fails, so downstream callers like
slippageBpsFromFraction() and the token-bucket setup never receive invalid
numbers.
backend/src/services/defi/soroswap/soroswap.client.ts-36-37 (1)
36-37: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Preserve any base path in config.apiBaseUrl. new URL() treats a leading / as root-relative, so https://host/api + /quote resolves to https://host/quote. If SOROSWAP_API_BASE_URL includes a path suffix, Soroswap requests will hit the wrong endpoint.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/defi/soroswap/soroswap.client.ts` around lines 36 - 37,
The URL construction in soroswap.client.ts is dropping any base path from
config.apiBaseUrl because new URL() resolves a leading slash as root-relative.
Update the path handling around normalizedPath and the URL creation so requests
remain relative to the configured API base path when SOROSWAP_API_BASE_URL
includes one, while still supporting paths without a leading slash.
backend/src/services/defi/soroswap/soroswap.errors.ts-283-289 (1)
283-289: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Narrow isStellarSubmitResponse to real Stellar submit responses.
The current guard accepts any object with a string status, so unrelated { status, message } payloads can skip the Soroswap-specific slippage/HTTP mapping and get mislabeled as generic transaction failures. Check for the actual RPC response shape before calling mapStellarSubmitError().

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/defi/soroswap/soroswap.errors.ts` around lines 283 -
289, The isStellarSubmitResponse guard is too broad because it treats any object
with a string status as a Stellar submit response. Tighten the check in
isStellarSubmitResponse so it matches the real rpc.Api.SendTransactionResponse
shape before mapStellarSubmitError() is used, and reject unrelated payloads like
generic { status, message } objects so Soroswap-specific error mapping still
applies.
backend/src/services/defi/soroswap/soroswap-token-catalog.service.ts-30-35 (1)
30-35: 🔒 Security & Privacy | 🟠 Major | ⚡ Quick win

Filter Stellar assets by canonical identity, not symbol.

isSoroswapAllowedSymbol(token.symbol) lets any catalog entry with an allowed code through. On Stellar, non-native assets are identified by code + issuer, so a spoofed issuer for an allowed symbol would become quotable here. Gate on the canonical address/issuer pair instead, with a dedicated XLM exception.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/defi/soroswap/soroswap-token-catalog.service.ts` around
lines 30 - 35, The token allowlist in soroswap-token-catalog.service.ts is
currently checking only token.symbol in the soroswapTokensResponseSchema flow,
which can admit spoofed Stellar assets with the same code but different issuer.
Update the filtering in the token catalog service to use canonical asset
identity based on address/issuer (code + issuer pair) rather than symbol, and
keep a dedicated exception for the native XLM asset. Use the existing
soroswapCachedCatalogFetch and isSoroswapAllowedSymbol location as the place to
replace the symbol-based gate with an issuer-aware check.
backend/src/services/defi/soroswap/soroswap.types.ts-53-67 (1)
53-67: 🩺 Stability & Availability | 🟠 Major | ⚡ Quick win

Validate atomic amounts in the Zod schema.

normalizeSoroswapQuote() feeds amountIn and amountOut into BigInt(). These fields currently accept any non-empty string, so a malformed provider payload blows up later with a SyntaxError instead of failing cleanly at parse time.

Suggested fix
export const soroswapQuoteResponseSchema = z
.object({
assetIn: z.string().optional(),
assetOut: z.string().optional(),

- amountIn: z.string().optional(),
- amountOut: z.string().optional(),

* amountIn: z.string().regex(/^\d+$/).optional(),
* amountOut: z.string().regex(/^\d+$/).optional(),
  tradeType: soroswapTradeTypeSchema.optional(),
  expiresAt: z.string().optional(),
  expires_at: z.string().optional(),
  🤖 Prompt for AI Agents
  Verify each finding against current code. Fix only still-valid issues, skip the
  rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/defi/soroswap/soroswap.types.ts` around lines 53 - 67,
The Soroswap quote schema currently allows any string for amountIn and
amountOut, but normalizeSoroswapQuote() later passes them to BigInt(), so
invalid payloads fail too late. Tighten soroswapQuoteResponseSchema to validate
these fields as atomic integer strings at parse time (using a dedicated Zod
refinement/regex or similar) so malformed provider responses are rejected before
reaching normalizeSoroswapQuote(). Keep the change localized to the Soroswap
quote types/schema symbols.
backend/src/services/defi/soroswap/soroswap-trustline.service.ts-12-17 (1)
12-17: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

ensureSoroswapTrustline() currently guarantees nothing.

This helper always succeeds without checking or sponsoring a trustline, so callers can believe the precondition is satisfied until a non-native-asset swap fails later. Fail fast with an explicit unsupported/trustline-required error until the real implementation lands.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/defi/soroswap/soroswap-trustline.service.ts` around
lines 12 - 17, ensureSoroswapTrustline currently does nothing and always
resolves, so callers think the trustline precondition is satisfied when it is
not. Update the ensureSoroswapTrustline helper to fail immediately with an
explicit unsupported/trustline-required error instead of returning successfully,
until real sponsor-account wiring is implemented. Keep the change focused on
this function so any caller depending on the precheck gets a clear error before
attempting the swap flow.
backend/src/services/defi/soroswap/soroswap-quote-store.service.ts-107-123 (1)
107-123: 🩺 Stability & Availability | 🟠 Major | ⚡ Quick win

Don't collapse re-quote outages into SOROSWAP_QUOTE_EXPIRED.

If requoteFromSnapshot() fails with a timeout/network/unexpected error, this block falls through to a 400 expired-quote response. That hides real backend failures and tells the client to refresh when the actual problem is Soroswap availability.

Proposed fix
if (input.privyUserId && input.snapshotParams) {

- let requoteError: unknown = null;
  try {
  const refreshed = await requoteFromSnapshot(input.privyUserId, input.snapshotParams);
  if (refreshed && !isQuoteExpired(refreshed)) {
  return refreshed;
  }
  } catch (err) {
-      requoteError = err;
- }
-
- if (requoteError instanceof AppError) {
-      throw requoteError;

*      if (err instanceof AppError) {
*        throw err;
*      }
*      throw new AppError(
*        502,
*        "SOROSWAP_REQUOTE_FAILED",
*        "Couldn't refresh the quote right now. Please try again.",
*      );
       }
  }
  🤖 Prompt for AI Agents
  Verify each finding against current code. Fix only still-valid issues, skip the
  rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/defi/soroswap/soroswap-quote-store.service.ts` around
lines 107 - 123, The re-quote fallback in soroswap-quote-store.service.ts is
collapsing non-expiration failures into SOROSWAP_QUOTE_EXPIRED; update the retry
path around requoteFromSnapshot() so only real quote-expiry cases return the 400
expired-quote AppError. In the block that catches requoteError, detect and
rethrow unexpected timeout/network/system errors instead of falling through, and
keep the AppError passthrough for genuine quote-related failures. Preserve the
existing behavior in the input.privyUserId / input.snapshotParams branch and the
final expired-quote throw only for actual expiry.
backend/src/utils/agent-tool-errors.ts-153-154 (1)
153-154: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Use the real Soroswap field name in the retry guidance.

The Stellar swap prompt and execute path use trade_type, but this recovery text tells the agent to retry with tradeType. That mismatch will just reproduce the same validation error on the next stellar_swap_quote.

Proposed fix

-      return "Re-run stellar_swap_quote with corrected stroops amount, allowlisted symbols, and tradeType.";

*      return "Re-run stellar_swap_quote with corrected stroops amount, allowlisted symbols, and trade_type.";
  🤖 Prompt for AI Agents
  Verify each finding against current code. Fix only still-valid issues, skip the
  rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/utils/agent-tool-errors.ts` around lines 153 - 154, The retry
guidance for SOROSWAP_VALIDATION_ERROR in agent-tool-errors.ts uses the wrong
field name, so update the message returned in the switch case to reference the
actual Stellar swap field used by the prompt and execute path, `trade_type`,
instead of `tradeType`. Keep the rest of the recovery text the same, but make
sure the guidance matches the `stellar_swap_quote` input shape so the agent
retries with the correct parameter name.
backend/src/api/routes/v1/agent/transactions.ts-147-156 (1)
147-156: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Preserve AppError.statusCode for unhandled cases.

These catch blocks turn every unmapped AppError into HTTP 400, but the new accept service already throws AppError(500, "INTERNAL_ERROR", ...) on upstream failures. That misclassifies server faults as client errors. Use err.statusCode as the fallback instead of hardcoding 400.

Suggested fix
const status =
err.code === "FALLBACK_OFFER_NOT_FOUND"
? 404
: err.code === "FALLBACK_OFFER_FORBIDDEN"
? 403
: err.code === "SOROSWAP_ROUTE_NOT_FOUND"
? 404

-                : 400;

*                : err.statusCode;
  ...
  const status =
  err.code === "FALLBACK_OFFER_NOT_FOUND"
  ? 404
  : err.code === "FALLBACK_OFFER_FORBIDDEN"
  ? 403

-              : 400;

*              : err.statusCode;
  Also applies to: 182-189

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/api/routes/v1/agent/transactions.ts` around lines 147 - 156,
Update the AppError handling in transactions route catch blocks so unmapped
errors keep their original HTTP status instead of defaulting to 400. In the
error-to-response mapping around the AppError branch in the transactions route,
preserve err.statusCode as the fallback for any AppError not explicitly mapped,
including the same logic in the other catch block noted by the review. Keep the
existing special-case mappings for known error codes, but replace the hardcoded
client-error fallback with the statusCode from the thrown AppError.
backend/src/api/routes/v1/agent/transactions.ts-128-194 (1)
128-194: 🔒 Security & Privacy | 🟠 Major | ⚡ Quick win

Harden these new mutation routes the same way as the other transaction mutations.

The new POST handlers only use requireAuth, so they currently skip CSRF protection, mutation rate limiting, and audit logging even though they accept/reject sensitive transaction flow state. Add the same protections used on the other transaction mutation endpoints here as well. As per coding guidelines, backend/src/api/\*_/_.{ts,tsx,js}: "Apply csrfOriginMiddleware on all mutation endpoints to prevent cross-site request forgery attacks" and "Apply rate limits and structured audit logs to all sensitive routes".

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/api/routes/v1/agent/transactions.ts` around lines 128 - 194, The
new mutation handlers in agentTransactionsRouter.post for the
stellar-routing-fallback accept/reject routes are missing the same protections
used by other sensitive transaction mutations. Update both routes to include
csrfOriginMiddleware, the appropriate mutation rate limit middleware, and
structured audit logging alongside requireAuth, matching the existing
transaction mutation patterns. Keep the existing validation and AppError
handling intact while wiring these middleware into the
acceptStellarRoutingFallbackForApproval and
rejectStellarRoutingFallbackForApproval endpoints.
Source: Coding guidelines

client/src/lib/stellar-execution-tracking.ts-183-205 (1)
183-205: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Don't mark Stellar swaps complete from tx.status alone.

The poller still treats status === "success" && effects_status === "pending" as in-flight, but this branch turns the same transaction into "Complete" immediately and never handles effects_status === "failure". That can show a confirmed timeline and trigger downstream completion behavior before Soroswap tracking has actually settled. Use effects_status/tracking_status as the terminal signal, and only fall back to tx.status when no effects state exists.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@client/src/lib/stellar-execution-tracking.ts` around lines 183 - 205, The
Stellar swap completion logic in stellar-execution-tracking.ts is marking
transactions complete too early by relying on tx.status alone. Update the
swapComplete branch in the tracking step builder to use effects_status and
trackingStatus as the terminal condition, and only fall back to tx.status when
no effects state is available; make sure the failure path also accounts for
effects_status === "failure" so pending effects are not reported as Complete.
client/src/hooks/useChatSession.ts-1201-1268 (1)
1201-1268: 🎯 Functional Correctness | 🟠 Major | 🏗️ Heavy lift

Stellar fallback pendings still won't survive a reload.

These callbacks wire the new offer flow, but syncPendingContinuationFromSession() still restores only loadClaimableLifiContinuationPending(items). After a refresh/reconnect, a pending Stellar routing offer or Soroswap approval won't be repopulated into pendingTx, so the user loses the accept/reject UI. Extend the session rehydration path to load the new Stellar pending variants too.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@client/src/hooks/useChatSession.ts` around lines 1201 - 1268, The session
rehydration path only restores claimable LiFi pendings, so Stellar routing
fallback and Soroswap approval pendings are lost after reload. Update
syncPendingContinuationFromSession() to also recognize and repopulate the new
Stellar pending variants into pendingTx, using the same session item flow that
loadClaimableLifiContinuationPending(items) uses. Make sure the restored pending
state preserves the accept/reject UI for the new offer flow.
client/src/lib/stellar-execution-tracking.ts-92-103 (1)
92-103: 🎯 Functional Correctness | 🟠 Major | ⚡ Quick win

Narrow Stellar pending detection to Soroswap-specific approvals.

pending.chain_id === "stellar" makes every Stellar approval look like a Soroswap/cross-chain flow. executionStepsForPendingApproval() and isCrossChainPending() both consume this helper, so a normal Stellar transfer will render swap quote/build/sign steps and skip the standard approval path. Gate this on Soroswap-specific markers (action, provider_id, route_id/quote_id, or the routing-fallback outcome) instead of the chain alone.

Suggested fix
export function isStellarPending(pending: PendingTransaction): boolean {
return (

- pending.chain_id === STELLAR_CHAIN_ID ||
  pending.action === "stellar_swap" ||

* pending.approval_outcome === "stellar_routing_fallback_offered" ||
  pending.defi_preview?.provider_id === "stellar-soroswap" ||
  pending.params?.provider_id === "stellar-soroswap" ||
  (typeof pending.params?.route_id === "string" &&
  pending.params.route_id.startsWith("soroswap:")) ||
  🤖 Prompt for AI Agents
  Verify each finding against current code. Fix only still-valid issues, skip the
  rest with a brief reason, keep changes minimal, and validate.

In `@client/src/lib/stellar-execution-tracking.ts` around lines 92 - 103, The
pending detection in isStellarPending is too broad because it treats any Stellar
chain transaction as Soroswap-related, which then affects
executionStepsForPendingApproval and isCrossChainPending. Update the helper to
rely only on Soroswap-specific signals such as action === "stellar_swap",
provider_id === "stellar-soroswap", route_id/quote_id prefixes, or the
routing-fallback result, and remove the chain-id-only match. Keep the logic
scoped so normal Stellar approvals continue through the standard path.
client/src/lib/sanitize-tool-error.ts-17-17 (1)
17-17: 🔒 Security & Privacy | 🟠 Major | ⚡ Quick win

Use a non-global detector for Soroswap API-key redaction.

SOROSWAP_API_KEY_RE is reused with .test(), and the g flag makes lastIndex stateful across calls. A later sanitizer run can miss a match and leave the API key in the user-facing error. Keep the global regex for .replace(), but use a separate non-global check here or reset lastIndex before testing.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@client/src/lib/sanitize-tool-error.ts` at line 17, The Soroswap API-key
detector in sanitize-tool-error.ts is stateful because SOROSWAP_API_KEY_RE is
used with .test() while having the g flag, which can cause later runs to miss
matches. Update the sanitizer logic around SOROSWAP_API_KEY_RE so the .test()
check uses a non-global regex or resets lastIndex before testing, while keeping
the global pattern only for the .replace() redaction path.
🧹 Nitpick comments (2)
client/tests/unit/stellar-routing-fallback.test.ts (1)
9-24: 📐 Maintainability & Code Quality | 🔵 Trivial | ⚡ Quick win

Exercise the real route helper here.

This only checks locally-declared constants, so it won't catch regressions in client/src/lib/stellar-routing-fallback if the actual accept/reject URLs or wrappers change. Please assert against the exported helper/API wrapper instead of restating the path in the test.

🤖 Prompt for AI Agents
Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

In `@client/tests/unit/stellar-routing-fallback.test.ts` around lines 9 - 24, This
test only verifies local constants and can miss regressions in the real route
helper. Update the `stellar-routing-fallback` unit test to call the exported
helper/API wrapper from `client/src/lib/stellar-routing-fallback` instead of
assembling the accept/reject URLs inline, and assert the returned paths for both
accept and reject cases through that symbol.
client/src/components/app/RouteCountdownLabel.tsx (1)
32-49: 🚀 Performance & Scalability | 🔵 Trivial | ⚡ Quick win

Reuse the caller's countdown state instead of starting a second timer.

TransactionApprovalBar at Line 253 and DeFiApprovalPreview at Line 113 already gate on an active countdown, so this hook spins up another 250 ms interval for the same expiry and can drift by a tick from the parent state.

♻️ Suggested change
-export function QuoteExpiryCountdownLabel({

- expiresAt,
- prefix = "Quote valid for",
  -}: {
- expiresAt: string;
- prefix?: string;
  -}) {
- const countdown = useSwapQuoteCountdown(expiresAt);
- if (countdown.status !== "active") {
- return null;
- }
  +export function QuoteExpiryCountdownLabel({

* label,
* prefix = "Quote valid for",
  +}: {
* label: string;
* prefix?: string;
  +}) {
  return (
  <>

-      {prefix} {countdown.label}

*      {prefix} {label}
       </>
  );
  }
  🤖 Prompt for AI Agents
  Verify each finding against current code. Fix only still-valid issues, skip the
  rest with a brief reason, keep changes minimal, and validate.

In `@client/src/components/app/RouteCountdownLabel.tsx` around lines 32 - 49,
Reuse the parent countdown state in QuoteExpiryCountdownLabel instead of calling
useSwapQuoteCountdown(expiresAt) again. The label component should accept the
already-computed countdown/status from TransactionApprovalBar and
DeFiApprovalPreview, and only render when that caller-provided state is active,
so it does not start a second 250 ms interval or drift from the parent timer.
ℹ️ Review info ⚙️ Run configuration
In backend/src/services/defi/soroswap/soroswap-execute.service.ts:

> - const submitted = await executeSignedTransaction({

-      privyWalletId: agentWallet.privy_wallet_id,
-      stellarAddress: walletAddress,
-      transaction,
- });
-
- const statusResult = await fetchSwapStatus(submitted.hash);
- const trackingStatus = normalizeSoroswapTrackingStatus(statusResult.status);
- const effectsStatus = normalizeSoroswapEffectsStatus(trackingStatus);
-
- const submitMeta = { ...streamMeta, digest: submitted.hash };
- if (streamCtx?.sessionId) {
-      emitSoroswapExecutionSteps(streamCtx.sessionId, [
-        buildStellarSubmitStep("ok", submitMeta),
-        buildStellarConfirmStep(
-          trackingStatus === "success" ? "ok" : trackingStatus === "failed" ? "failed" : "running",
-          submitMeta,
-        ),
-      ]);
- }
-
- if (trackingStatus === "success") {
-      await invalidateStellarBalance(walletAddress);
- }
-
- await maybeEnqueueSwapTracking(privyUserId, submitted.hash, trackingStatus, options);
-
- return {
-      quote_id: quoteId,
-      route_id: parsed.route_id ?? quoteId,
-      tx_hash: submitted.hash,
-      stellar_address: walletAddress,
-      ...(typeof statusResult.ledger === "number" ? { ledger: statusResult.ledger } : {}),
-      effects_status: effectsStatus,
-      tracking_status: trackingStatus,
- };
- } catch (err) {
- throw mapSoroswapExecuteError(err);
  🗄️ Data Integrity & Integration | 🔴 Critical | ⚡ Quick win

Don't fail the execute call after the transaction is already broadcast.

Once executeSignedTransaction() succeeds, the swap may already be on-chain. A later fetchSwapStatus() error currently bubbles through mapSoroswapExecuteError(), so the API reports failure after a successful submission. That's a duplicate-trade risk on retry.

Proposed fix
const submitted = await executeSignedTransaction({
privyWalletId: agentWallet.privy_wallet_id,
stellarAddress: walletAddress,
transaction,
});

- const statusResult = await fetchSwapStatus(submitted.hash);
- const trackingStatus = normalizeSoroswapTrackingStatus(statusResult.status);
- const effectsStatus = normalizeSoroswapEffectsStatus(trackingStatus);

* let statusResult: Awaited<ReturnType<typeof fetchSwapStatus>> | null = null;
* let trackingStatus: ReturnType<typeof normalizeSoroswapTrackingStatus> = "pending";
* let effectsStatus: ReturnType<typeof normalizeSoroswapEffectsStatus> = "pending";
*
* try {
*      statusResult = await fetchSwapStatus(submitted.hash);
*      trackingStatus = normalizeSoroswapTrackingStatus(statusResult.status);
*      effectsStatus = normalizeSoroswapEffectsStatus(trackingStatus);
* } catch {
*      trackingStatus = "pending";
*      effectsStatus = "pending";
* }

       const submitMeta = { ...streamMeta, digest: submitted.hash };

  🤖 Prompt for AI Agents
  Verify each finding against current code. Fix only still-valid issues, skip the
  rest with a brief reason, keep changes minimal, and validate.

In `@backend/src/services/defi/soroswap/soroswap-execute.service.ts` around lines
245 - 282, In soroswap-execute.service.ts, the execute flow in the main swap
handler should not throw if `executeSignedTransaction()` has already succeeded
and `fetchSwapStatus()` fails afterward, because the transaction may already be
broadcast. Update the logic around `submitted`, `fetchSwapStatus`, and
`mapSoroswapExecuteError` so post-submit status lookup failures are treated as a
partial-success response (or a non-fatal tracking fallback) rather than failing
the whole call. Keep returning the submitted `tx_hash` and other available
submission details, and only map errors to failure before the transaction is
sent.
