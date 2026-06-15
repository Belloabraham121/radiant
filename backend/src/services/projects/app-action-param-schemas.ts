import { z } from "zod";
import type { AppActionName } from "./app-action.types.js";

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
} satisfies Record<AppActionName, z.ZodType<Record<string, unknown>>>;

export type AppActionParamsMap = {
  [K in AppActionName]: z.infer<(typeof appActionParamSchemas)[K]>;
};

/** Zod schema for params of a given canonical app action. */
export function getAppActionParamSchema(name: AppActionName): z.ZodType<Record<string, unknown>> {
  return appActionParamSchemas[name];
}

/** Human-readable param field docs for action schema export (Phase 6). */
export const appActionParamSchemaDocs: Record<AppActionName, { fields: Array<{ name: string; type: string; required?: boolean; description?: string }> }> = {
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
};
