import { z } from "zod";
import { AppError } from "../../../errors/app-error.js";
import { squidSdk } from "./squid.client.js";
import { consumeSquidOutboundQuota } from "./squid-rate-limit.js";
import type { SquidRouteSnapshot } from "./squid.types.js";

export const squidChainflipDepositAddressResponseSchema = z.object({
  depositAddress: z.string().min(1),
  amount: z.string().min(1),
  chainflipStatusTrackingId: z.string().min(1),
});

export type SquidChainflipDepositAddressResponse = z.infer<
  typeof squidChainflipDepositAddressResponseSchema
>;

export type GetSquidChainflipDepositAddressInput = {
  transactionRequest: SquidRouteSnapshot["transactionRequest"];
  quoteId: string;
  route: SquidRouteSnapshot;
};

type GetSquidChainflipDepositAddressFn = (
  privyUserId: string,
  input: GetSquidChainflipDepositAddressInput,
) => Promise<SquidChainflipDepositAddressResponse>;

let getSquidChainflipDepositAddressForTests: GetSquidChainflipDepositAddressFn | null = null;

export function setGetSquidChainflipDepositAddressForTests(
  fn: GetSquidChainflipDepositAddressFn | null,
): void {
  getSquidChainflipDepositAddressForTests = fn;
}

export async function getSquidChainflipDepositAddress(
  privyUserId: string,
  input: GetSquidChainflipDepositAddressInput,
): Promise<SquidChainflipDepositAddressResponse> {
  if (getSquidChainflipDepositAddressForTests) {
    return getSquidChainflipDepositAddressForTests(privyUserId, input);
  }
  return getSquidChainflipDepositAddressLive(privyUserId, input);
}

async function getSquidChainflipDepositAddressLive(
  privyUserId: string,
  input: GetSquidChainflipDepositAddressInput,
): Promise<SquidChainflipDepositAddressResponse> {
  void input.quoteId;
  await consumeSquidOutboundQuota(privyUserId);

  const raw = await squidSdk.requestDepositAddress({ route: input.route });
  const parsed = squidChainflipDepositAddressResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      502,
      "SQUID_UNAVAILABLE",
      "Squid deposit-address response was missing required fields.",
    );
  }
  return parsed.data;
}
