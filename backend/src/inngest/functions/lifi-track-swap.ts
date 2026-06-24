import { inngest } from "../client.js";
import { LIFI_TRACK_SWAP_EVENT } from "../events.js";
import { runLifiTrackPollLoop } from "./lifi-track-poll.js";
import type { LifiTrackJobInput } from "../../services/defi/lifi/lifi-tracking.types.js";

export const lifiTrackSwapFunction = inngest.createFunction(
  {
    id: "lifi-track-swap",
    name: "Radiant Li-Fi swap tracker",
    triggers: [{ event: LIFI_TRACK_SWAP_EVENT }],
    retries: 2,
  },
  async ({ event, step }) => {
    const input = event.data as LifiTrackJobInput;
    return runLifiTrackPollLoop(step, input);
  },
);
