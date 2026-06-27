import { z } from "zod";
import { inngest } from "../client.js";
import { SOROSWAP_TRACK_SWAP_EVENT } from "../events.js";
import { runSoroswapTrackPollLoop } from "./soroswap-track-poll.js";

const soroswapTrackJobInputSchema = z.object({
  transactionId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  privyUserId: z.string().min(1),
  txHash: z.string().min(1),
});

export const soroswapTrackSwapFunction = inngest.createFunction(
  {
    id: "soroswap-track-swap",
    name: "Radiant Soroswap swap tracker",
    triggers: [{ event: SOROSWAP_TRACK_SWAP_EVENT }],
    retries: 2,
  },
  async ({ event, step }) => {
    const parsed = soroswapTrackJobInputSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new Error(`Invalid Soroswap track payload: ${parsed.error.message}`);
    }
    return runSoroswapTrackPollLoop(step, parsed.data);
  },
);
