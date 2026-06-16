import { z } from "zod";
import type { OnchainActionName } from "./app-action.types.js";

const sideSchema = z.enum(["buy", "sell"]);

const poolKeyOptional = z.string().min(1).optional();

const positiveNumber = z.number().positive();

const positiveNumberOrDisplay = z
  .object({
    amount: positiveNumber.optional(),
    amount_display: positiveNumber.optional(),
  })
  .passthrough()
  .refine((value) => value.amount != null || value.amount_display != null, {
    message: "amount or amount_display is required",
  });

const flashLoanStepSchema = z
  .object({
    pool_key: z.string().min(1),
    side: sideSchema,
    amount: positiveNumber,
    min_out_display: z.number().optional(),
  })
  .strict();

export const appActionParamSchemas = {
  swap: z
    .object({
      pool_key: poolKeyOptional,
      amount: positiveNumber.optional(),
      amount_display: positiveNumber.optional(),
      side: sideSchema,
      pay_with_deep: z.boolean().optional(),
      slippage_bps: z.number().min(0).max(5000).optional(),
      estimated_out_display: z.number().optional(),
      min_out_display: z.number().optional(),
    })
    .passthrough()
    .refine((value) => value.amount != null || value.amount_display != null, {
      message: "amount or amount_display is required",
    }),

  flash_loan: z
    .object({
      pool_key: poolKeyOptional,
      borrow_amount: positiveNumber,
      asset: z.enum(["base", "quote"]).optional(),
      coin_key: z.string().min(1).optional(),
      strategy: z.enum(["round_trip", "swap_chain_repay", "swap_repay"]).optional(),
      steps: z.array(flashLoanStepSchema).optional(),
      slippage_bps: z.number().min(0).max(5000).optional(),
      repay_source: z.enum(["swap_output"]).optional(),
      estimated_surplus: z.number().optional(),
    })
    .passthrough(),

  stake: z
    .object({
      pool_key: poolKeyOptional,
      amount_display: positiveNumber,
    })
    .passthrough(),

  unstake: z
    .object({
      pool_key: poolKeyOptional,
    })
    .passthrough(),

  deposit: z
    .object({
      coin_key: z.string().min(1),
      amount_display: positiveNumber,
    })
    .strict(),

  withdraw: z
    .object({
      coin_key: z.string().min(1),
      amount_display: positiveNumber.optional(),
      withdraw_all: z.literal(true).optional(),
    })
    .passthrough()
    .refine(
      (value) => value.withdraw_all === true || value.amount_display != null,
      { message: "amount_display or withdraw_all: true is required" },
    ),

  provision_manager: z.object({}).passthrough(),

  place_limit_order: z
    .object({
      pool_key: poolKeyOptional,
      price: positiveNumber,
      quantity: positiveNumber,
      side: sideSchema,
      pay_with_deep: z.boolean().optional(),
      client_order_id: z.number().int().optional(),
    })
    .passthrough(),

  place_market_order: z
    .object({
      pool_key: poolKeyOptional,
      quantity: positiveNumber,
      side: sideSchema,
      pay_with_deep: z.boolean().optional(),
      client_order_id: z.number().int().optional(),
    })
    .passthrough(),

  cancel_order: z
    .object({
      pool_key: poolKeyOptional,
      order_id: z.string().min(1),
    })
    .passthrough(),

  cancel_orders: z
    .object({
      pool_key: poolKeyOptional,
      order_ids: z.array(z.string().min(1)).min(1),
    })
    .passthrough(),

  cancel_all_orders: z
    .object({
      pool_key: poolKeyOptional,
    })
    .passthrough(),

  modify_order: z
    .object({
      pool_key: poolKeyOptional,
      order_id: z.string().min(1),
      quantity: positiveNumber,
    })
    .passthrough(),

  withdraw_settled: z
    .object({
      pool_key: poolKeyOptional,
    })
    .passthrough(),

  submit_proposal: z
    .object({
      pool_key: poolKeyOptional,
      taker_fee: z.number(),
      maker_fee: z.number(),
      stake_required: z.number(),
    })
    .passthrough(),

  vote: z
    .object({
      pool_key: poolKeyOptional,
      proposal_id: z.string().min(1),
    })
    .passthrough(),

  transfer: z
    .object({
      recipient: z.string().min(1),
      amount_atomic: z.union([z.string().min(1), z.number().int().nonnegative()]).optional(),
      amount_display: positiveNumber.optional(),
    })
    .passthrough()
    .refine(
      (value) => value.amount_atomic != null || value.amount_display != null,
      { message: "amount_atomic or amount_display is required" },
    ),

  // DeepBook Margin actions
  margin_deposit: z
    .object({
      margin_manager_key: z.string().min(1),
      coin_type: z.enum(["base", "quote", "deep"]),
      amount: positiveNumber,
    })
    .passthrough(),

  margin_withdraw: z
    .object({
      margin_manager_key: z.string().min(1),
      coin_type: z.enum(["base", "quote", "deep"]),
      amount: positiveNumber,
    })
    .passthrough(),

  margin_borrow: z
    .object({
      margin_manager_key: z.string().min(1),
      asset: z.enum(["base", "quote"]),
      amount: positiveNumber,
    })
    .passthrough(),

  margin_repay: z
    .object({
      margin_manager_key: z.string().min(1),
      asset: z.enum(["base", "quote"]),
      amount: positiveNumber.optional(),
    })
    .passthrough(),

  margin_place_limit_order: z
    .object({
      pool_key: z.string().min(1),
      margin_manager_key: z.string().min(1),
      price: positiveNumber,
      quantity: positiveNumber,
      is_bid: z.boolean(),
      pay_with_deep: z.boolean().optional(),
      client_order_id: z.string().optional(),
      expiration: z.number().optional(),
    })
    .passthrough(),

  margin_place_market_order: z
    .object({
      pool_key: z.string().min(1),
      margin_manager_key: z.string().min(1),
      quantity: positiveNumber,
      is_bid: z.boolean(),
      pay_with_deep: z.boolean().optional(),
      client_order_id: z.string().optional(),
    })
    .passthrough(),

  margin_cancel_order: z
    .object({
      margin_manager_key: z.string().min(1),
      order_id: z.string().min(1),
    })
    .passthrough(),

  margin_modify_order: z
    .object({
      margin_manager_key: z.string().min(1),
      order_id: z.string().min(1),
      new_quantity: positiveNumber,
    })
    .passthrough(),

  margin_place_reduce_only_limit_order: z
    .object({
      pool_key: z.string().min(1),
      margin_manager_key: z.string().min(1),
      price: positiveNumber,
      quantity: positiveNumber,
      is_bid: z.boolean(),
      pay_with_deep: z.boolean().optional(),
      client_order_id: z.string().optional(),
    })
    .passthrough(),

  margin_place_reduce_only_market_order: z
    .object({
      pool_key: z.string().min(1),
      margin_manager_key: z.string().min(1),
      quantity: positiveNumber,
      is_bid: z.boolean(),
      pay_with_deep: z.boolean().optional(),
      client_order_id: z.string().optional(),
    })
    .passthrough(),

  margin_cancel_orders: z
    .object({
      margin_manager_key: z.string().min(1),
      order_ids: z.array(z.string().min(1)).min(1),
    })
    .passthrough(),

  margin_cancel_all_orders: z
    .object({
      margin_manager_key: z.string().min(1),
      pool_key: z.string().min(1).optional(),
    })
    .passthrough(),

  margin_withdraw_settled: z
    .object({
      margin_manager_key: z.string().min(1),
      pool_key: z.string().min(1).optional(),
    })
    .passthrough(),

  margin_withdraw_settled_permissionless: z
    .object({
      margin_manager_key: z.string().min(1),
      pool_key: z.string().min(1).optional(),
    })
    .passthrough(),

  margin_update_price: z
    .object({
      margin_manager_key: z.string().min(1),
      pool_key: z.string().min(1),
    })
    .passthrough(),

  margin_stake: z
    .object({
      margin_manager_key: z.string().min(1),
      pool_key: z.string().min(1).optional(),
      amount: positiveNumber.optional(),
      amount_display: positiveNumber.optional(),
      stake_amount: positiveNumber.optional(),
    })
    .passthrough(),

  margin_unstake: z
    .object({
      margin_manager_key: z.string().min(1),
      pool_key: z.string().min(1).optional(),
    })
    .passthrough(),

  margin_submit_proposal: z
    .object({
      margin_manager_key: z.string().min(1),
      pool_key: z.string().min(1).optional(),
      taker_fee: z.number().nonnegative(),
      maker_fee: z.number().nonnegative(),
      stake_required: z.number().nonnegative(),
    })
    .passthrough(),

  margin_vote: z
    .object({
      margin_manager_key: z.string().min(1),
      pool_key: z.string().min(1).optional(),
      proposal_id: z.string().min(1),
    })
    .passthrough(),

  margin_claim_rebate: z
    .object({
      margin_manager_key: z.string().min(1),
      pool_key: z.string().min(1).optional(),
    })
    .passthrough(),

  margin_liquidate: z
    .object({
      margin_manager_address: z.string().min(1),
      pool_key: z.string().min(1).optional(),
      repay_amount: positiveNumber,
      debt_is_base: z.boolean().optional(),
      asset: z.enum(["base", "quote"]).optional(),
    })
    .passthrough(),

  margin_set_referral: z
    .object({
      margin_manager_key: z.string().min(1),
      referral_id: z.string().min(1),
    })
    .passthrough(),

  margin_unset_referral: z
    .object({
      margin_manager_key: z.string().min(1),
      pool_key: z.string().min(1).optional(),
    })
    .passthrough(),

  margin_supply_pool: z
    .object({
      coin_type: z.string().min(1),
      amount: positiveNumber,
    })
    .passthrough(),

  margin_withdraw_pool: z
    .object({
      coin_type: z.string().min(1),
      amount: positiveNumber.optional(),
    })
    .passthrough(),

  margin_mint_supply_referral: z
    .object({
      coin_type: z.string().min(1),
    })
    .passthrough(),

  margin_withdraw_referral_fees: z
    .object({
      coin_type: z.string().min(1),
      referral_id: z.string().min(1).optional(),
    })
    .passthrough(),

  margin_tpsl_add: z
    .object({
      pool_key: z.string().min(1).optional(),
      margin_manager_key: z.string().min(1).optional(),
      tpsl_type: z.enum(["take_profit", "stop_loss"]).optional(),
      trigger_price: positiveNumber,
      order_kind: z.enum(["limit", "market"]).optional(),
      quantity: positiveNumber,
      price: positiveNumber.optional(),
      is_bid: z.boolean().optional(),
      side: z.enum(["buy", "sell"]).optional(),
      conditional_order_id: z.string().optional(),
      pay_with_deep: z.boolean().optional(),
    })
    .passthrough(),

  margin_tpsl_cancel: z
    .object({
      margin_manager_key: z.string().min(1).optional(),
      conditional_order_id: z.string().min(1),
    })
    .passthrough(),

  margin_tpsl_cancel_all: z
    .object({
      margin_manager_key: z.string().min(1).optional(),
      pool_key: z.string().min(1).optional(),
    })
    .passthrough(),

  // DeepBook Predict actions
  predict_deposit: z
    .object({
      quote_asset: z.string().min(1).optional(),
      amount: positiveNumber,
    })
    .passthrough(),

  predict_withdraw: z
    .object({
      quote_asset: z.string().min(1).optional(),
      amount: positiveNumber,
    })
    .passthrough(),

  predict_mint: z
    .object({
      oracle_id: z.string().min(1),
      expiry: z.number().int().positive(),
      strike: positiveNumber,
      is_up: z.boolean(),
      quantity: positiveNumber,
      quote_asset: z.string().min(1).optional(),
    })
    .passthrough(),

  predict_redeem: z
    .object({
      oracle_id: z.string().min(1),
      expiry: z.number().int().positive(),
      strike: positiveNumber,
      is_up: z.boolean(),
      quantity: positiveNumber,
    })
    .passthrough(),

  predict_mint_range: z
    .object({
      oracle_id: z.string().min(1),
      expiry: z.number().int().positive(),
      lower_strike: positiveNumber,
      higher_strike: positiveNumber,
      quantity: positiveNumber,
      quote_asset: z.string().min(1).optional(),
    })
    .passthrough(),

  predict_redeem_range: z
    .object({
      oracle_id: z.string().min(1),
      expiry: z.number().int().positive(),
      lower_strike: positiveNumber,
      higher_strike: positiveNumber,
      quantity: positiveNumber,
    })
    .passthrough(),

  predict_supply: z
    .object({
      quote_asset: z.string().min(1).optional(),
      amount: positiveNumber,
    })
    .passthrough(),

  predict_lp_withdraw: z
    .object({
      quote_asset: z.string().min(1).optional(),
      plp_amount: positiveNumber,
    })
    .passthrough(),
} satisfies Record<OnchainActionName, z.ZodType<Record<string, unknown>>>;

export type AppActionParamsMap = {
  [K in OnchainActionName]: z.infer<(typeof appActionParamSchemas)[K]>;
};

/** Zod schema for params of a given on-chain app action. */
export function getAppActionParamSchema(name: OnchainActionName): z.ZodType<Record<string, unknown>> {
  return appActionParamSchemas[name];
}

/** Human-readable param field docs for action schema export (Phase 6). */
export const appActionParamSchemaDocs: Record<OnchainActionName, { fields: Array<{ name: string; type: string; required?: boolean; description?: string }> }> = {
  swap: {
    fields: [
      { name: "amount", type: "number", required: true, description: "Input amount (or use amount_display)" },
      { name: "side", type: "string", required: true, description: "buy | sell" },
      { name: "pool_key", type: "string", description: "DeepBook pool key" },
      { name: "estimated_out_display", type: "number", description: "Optional — platform fills from live quote at approval if omitted" },
    ],
  },
  flash_loan: {
    fields: [
      { name: "borrow_amount", type: "number", required: true },
      { name: "asset", type: "string", description: "base | quote" },
      { name: "strategy", type: "string", description: "round_trip | swap_chain_repay" },
      { name: "steps", type: "array", description: "Optional swap steps" },
    ],
  },
  stake: {
    fields: [
      { name: "amount_display", type: "number", required: true },
      { name: "pool_key", type: "string" },
    ],
  },
  unstake: {
    fields: [{ name: "pool_key", type: "string" }],
  },
  deposit: {
    fields: [
      { name: "coin_key", type: "string", required: true },
      { name: "amount_display", type: "number", required: true },
    ],
  },
  withdraw: {
    fields: [
      { name: "coin_key", type: "string", required: true },
      { name: "amount_display", type: "number" },
      { name: "withdraw_all", type: "boolean" },
    ],
  },
  provision_manager: { fields: [] },
  place_limit_order: {
    fields: [
      { name: "price", type: "number", required: true },
      { name: "quantity", type: "number", required: true },
      { name: "side", type: "string", required: true },
    ],
  },
  place_market_order: {
    fields: [
      { name: "quantity", type: "number", required: true },
      { name: "side", type: "string", required: true },
    ],
  },
  cancel_order: {
    fields: [{ name: "order_id", type: "string", required: true }],
  },
  cancel_orders: {
    fields: [{ name: "order_ids", type: "array", required: true }],
  },
  cancel_all_orders: {
    fields: [{ name: "pool_key", type: "string" }],
  },
  modify_order: {
    fields: [
      { name: "order_id", type: "string", required: true },
      { name: "quantity", type: "number", required: true },
    ],
  },
  withdraw_settled: {
    fields: [{ name: "pool_key", type: "string" }],
  },
  submit_proposal: {
    fields: [
      { name: "taker_fee", type: "number", required: true },
      { name: "maker_fee", type: "number", required: true },
      { name: "stake_required", type: "number", required: true },
    ],
  },
  vote: {
    fields: [{ name: "proposal_id", type: "string", required: true }],
  },
  transfer: {
    fields: [
      { name: "recipient", type: "string", required: true },
      { name: "amount_display", type: "number" },
      { name: "amount_atomic", type: "string" },
    ],
  },
  // DeepBook Margin
  margin_deposit: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true, description: "Margin manager identifier" },
      { name: "coin_type", type: "string", required: true, description: "base | quote | deep" },
      { name: "amount", type: "number", required: true },
    ],
  },
  margin_withdraw: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "coin_type", type: "string", required: true, description: "base | quote | deep" },
      { name: "amount", type: "number", required: true },
    ],
  },
  margin_borrow: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "asset", type: "string", required: true, description: "base | quote" },
      { name: "amount", type: "number", required: true },
    ],
  },
  margin_repay: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "asset", type: "string", required: true, description: "base | quote" },
      { name: "amount", type: "number", description: "Omit to repay all" },
    ],
  },
  margin_place_limit_order: {
    fields: [
      { name: "pool_key", type: "string", required: true },
      { name: "margin_manager_key", type: "string", required: true },
      { name: "price", type: "number", required: true },
      { name: "quantity", type: "number", required: true },
      { name: "is_bid", type: "boolean", required: true, description: "true = buy, false = sell" },
      { name: "pay_with_deep", type: "boolean" },
    ],
  },
  margin_place_market_order: {
    fields: [
      { name: "pool_key", type: "string", required: true },
      { name: "margin_manager_key", type: "string", required: true },
      { name: "quantity", type: "number", required: true },
      { name: "is_bid", type: "boolean", required: true },
      { name: "pay_with_deep", type: "boolean" },
    ],
  },
  margin_cancel_order: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "order_id", type: "string", required: true, description: "Protocol order ID" },
    ],
  },
  margin_modify_order: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "order_id", type: "string", required: true },
      { name: "new_quantity", type: "number", required: true },
    ],
  },
  margin_place_reduce_only_limit_order: {
    fields: [
      { name: "pool_key", type: "string", required: true },
      { name: "margin_manager_key", type: "string", required: true },
      { name: "price", type: "number", required: true },
      { name: "quantity", type: "number", required: true },
      { name: "is_bid", type: "boolean", required: true, description: "true = buy, false = sell" },
      { name: "pay_with_deep", type: "boolean" },
    ],
  },
  margin_place_reduce_only_market_order: {
    fields: [
      { name: "pool_key", type: "string", required: true },
      { name: "margin_manager_key", type: "string", required: true },
      { name: "quantity", type: "number", required: true },
      { name: "is_bid", type: "boolean", required: true },
      { name: "pay_with_deep", type: "boolean" },
    ],
  },
  margin_cancel_orders: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "order_ids", type: "array", required: true, description: "Protocol order IDs" },
    ],
  },
  margin_cancel_all_orders: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "pool_key", type: "string" },
    ],
  },
  margin_withdraw_settled: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "pool_key", type: "string" },
    ],
  },
  margin_withdraw_settled_permissionless: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "pool_key", type: "string" },
    ],
  },
  margin_update_price: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "pool_key", type: "string", required: true },
    ],
  },
  margin_stake: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "pool_key", type: "string" },
      { name: "amount", type: "number", required: true, description: "DEEP amount to stake" },
    ],
  },
  margin_unstake: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "pool_key", type: "string" },
    ],
  },
  margin_submit_proposal: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "pool_key", type: "string" },
      { name: "taker_fee", type: "number", required: true },
      { name: "maker_fee", type: "number", required: true },
      { name: "stake_required", type: "number", required: true },
    ],
  },
  margin_vote: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "pool_key", type: "string" },
      { name: "proposal_id", type: "string", required: true },
    ],
  },
  margin_claim_rebate: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "pool_key", type: "string" },
    ],
  },
  margin_liquidate: {
    fields: [
      { name: "margin_manager_address", type: "string", required: true },
      { name: "pool_key", type: "string" },
      { name: "repay_amount", type: "number", required: true },
      { name: "debt_is_base", type: "boolean", description: "Optional; inferred from chain if omitted" },
      { name: "asset", type: "string", description: "base|quote debt side if debt_is_base omitted" },
    ],
  },
  margin_set_referral: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "referral_id", type: "string", required: true, description: "DeepBookPoolReferral object ID" },
    ],
  },
  margin_unset_referral: {
    fields: [
      { name: "margin_manager_key", type: "string", required: true },
      { name: "pool_key", type: "string" },
    ],
  },
  margin_supply_pool: {
    fields: [
      { name: "coin_type", type: "string", required: true, description: "Coin type to supply (e.g. DBUSDC)" },
      { name: "amount", type: "number", required: true },
    ],
  },
  margin_withdraw_pool: {
    fields: [
      { name: "coin_type", type: "string", required: true },
      { name: "amount", type: "number", description: "Omit to withdraw all" },
    ],
  },
  margin_mint_supply_referral: {
    fields: [
      { name: "coin_type", type: "string", required: true, description: "Margin pool asset (e.g. DBUSDC)" },
    ],
  },
  margin_withdraw_referral_fees: {
    fields: [
      { name: "coin_type", type: "string", required: true },
      { name: "referral_id", type: "string", description: "Optional if previously minted via Radiant" },
    ],
  },
  margin_tpsl_add: {
    fields: [
      { name: "pool_key", type: "string" },
      { name: "margin_manager_key", type: "string", description: 'Use "default"' },
      { name: "tpsl_type", type: "string", required: true, description: "take_profit or stop_loss" },
      { name: "trigger_price", type: "number", required: true },
      { name: "order_kind", type: "string", description: "limit or market (default market)" },
      { name: "quantity", type: "number", required: true },
      { name: "price", type: "number", description: "Required for limit pending orders" },
      { name: "is_bid", type: "boolean", description: "true = buy, false = sell" },
      { name: "conditional_order_id", type: "string", description: "Optional unique order id" },
    ],
  },
  margin_tpsl_cancel: {
    fields: [
      { name: "margin_manager_key", type: "string" },
      { name: "conditional_order_id", type: "string", required: true },
    ],
  },
  margin_tpsl_cancel_all: {
    fields: [
      { name: "margin_manager_key", type: "string" },
      { name: "pool_key", type: "string" },
    ],
  },
  // DeepBook Predict
  predict_deposit: {
    fields: [
      { name: "amount", type: "number", required: true },
      { name: "quote_asset", type: "string", description: "Quote asset type (defaults to DUSDC)" },
    ],
  },
  predict_withdraw: {
    fields: [
      { name: "amount", type: "number", required: true },
      { name: "quote_asset", type: "string" },
    ],
  },
  predict_mint: {
    fields: [
      { name: "oracle_id", type: "string", required: true, description: "Oracle object ID" },
      { name: "expiry", type: "number", required: true, description: "Expiry timestamp" },
      { name: "strike", type: "number", required: true, description: "Strike price" },
      { name: "is_up", type: "boolean", required: true, description: "true = pays if above strike" },
      { name: "quantity", type: "number", required: true },
    ],
  },
  predict_redeem: {
    fields: [
      { name: "oracle_id", type: "string", required: true },
      { name: "expiry", type: "number", required: true },
      { name: "strike", type: "number", required: true },
      { name: "is_up", type: "boolean", required: true },
      { name: "quantity", type: "number", required: true },
    ],
  },
  predict_mint_range: {
    fields: [
      { name: "oracle_id", type: "string", required: true },
      { name: "expiry", type: "number", required: true },
      { name: "lower_strike", type: "number", required: true },
      { name: "higher_strike", type: "number", required: true },
      { name: "quantity", type: "number", required: true },
    ],
  },
  predict_redeem_range: {
    fields: [
      { name: "oracle_id", type: "string", required: true },
      { name: "expiry", type: "number", required: true },
      { name: "lower_strike", type: "number", required: true },
      { name: "higher_strike", type: "number", required: true },
      { name: "quantity", type: "number", required: true },
    ],
  },
  predict_supply: {
    fields: [
      { name: "amount", type: "number", required: true, description: "Quote asset amount to supply to vault" },
      { name: "quote_asset", type: "string" },
    ],
  },
  predict_lp_withdraw: {
    fields: [
      { name: "plp_amount", type: "number", required: true, description: "PLP shares to burn" },
      { name: "quote_asset", type: "string", description: "Quote asset to receive" },
    ],
  },
};
