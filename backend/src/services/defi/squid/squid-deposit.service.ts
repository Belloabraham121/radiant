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

/** POST /v2/deposit-address for CHAINFLIP_DEPOSIT_ADDRESS routes (Squid SDK wrapper). */
export async function getSquidChainflipDepositAddress(
  privyUserId: string,
  input: {
    transactionRequest: SquidRouteSnapshot["transactionRequest"];
    quoteId: string;
    route: SquidRouteSnapshot;
  },
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
