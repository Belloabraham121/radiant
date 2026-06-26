import { inngest } from "../client.js";
import { SQUID_TRACK_CROSS_CHAIN_EVENT } from "../events.js";
import { runSquidTrackPollLoop } from "./squid-track-poll.js";
import type { SquidTrackJobInput } from "../../services/defi/squid/squid-tracking.types.js";

export const squidTrackCrossChainFunction = inngest.createFunction(
  {
    id: "squid-track-cross-chain",
    name: "Radiant Squid cross-chain tracker",
    triggers: [{ event: SQUID_TRACK_CROSS_CHAIN_EVENT }],
    retries: 2,
  },
  async ({ event, step }) => {
    const input = event.data as SquidTrackJobInput;
    return runSquidTrackPollLoop(step, input);
  },
);
