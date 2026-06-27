import { inngest } from "../client.js";
import { SOROSWAP_TRACK_SWAP_EVENT } from "../events.js";
import { runSoroswapTrackPollLoop } from "./soroswap-track-poll.js";
import type { SoroswapTrackJobInput } from "../../services/defi/soroswap/soroswap-tracking.types.js";

export const soroswapTrackSwapFunction = inngest.createFunction(
  {
    id: "soroswap-track-swap",
    name: "Radiant Soroswap swap tracker",
    triggers: [{ event: SOROSWAP_TRACK_SWAP_EVENT }],
    retries: 2,
  },
  async ({ event, step }) => {
    const input = event.data as SoroswapTrackJobInput;
    return runSoroswapTrackPollLoop(step, input);
  },
);
