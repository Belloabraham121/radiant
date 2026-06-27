/** Inngest / local poll job after Soroswap swap broadcast. */
export type SoroswapTrackJobInput = {
  transactionId: string;
  sessionId: string | null;
  privyUserId: string;
  txHash: string;
};
