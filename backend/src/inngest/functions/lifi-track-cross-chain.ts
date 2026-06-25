import { inngest } from "../client.js";
import { LIFI_TRACK_CROSS_CHAIN_EVENT } from "../events.js";
import { runLifiTrackPollLoop } from "./lifi-track-poll.js";
import type { LifiTrackJobInput } from "../../services/defi/lifi/lifi-tracking.types.js";

export const lifiTrackCrossChainFunction = inngest.createFunction(
  {
    id: "lifi-track-cross-chain",
    name: "Radiant Li-Fi cross-chain tracker",
    triggers: [{ event: LIFI_TRACK_CROSS_CHAIN_EVENT }],
    retries: 2,
  },
  async ({ event, step }) => {
    const input = event.data as LifiTrackJobInput;
    return runLifiTrackPollLoop(step, input);
  },
);
