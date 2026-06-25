import { Horizon, rpc } from "@stellar/stellar-sdk";
import { getHorizonUrl, getSorobanRpcUrl } from "../../config/stellar.js";

let horizonServer: Horizon.Server | undefined;
let sorobanServer: rpc.Server | undefined;

/** Horizon REST client for account loads and classic tx submission. */
export function getHorizonServer(): Horizon.Server {
  if (!horizonServer) {
    horizonServer = new Horizon.Server(getHorizonUrl());
  }
  return horizonServer;
}

/** Soroban RPC client for simulation and submission. */
export function getSorobanServer(): rpc.Server {
  if (!sorobanServer) {
    sorobanServer = new rpc.Server(getSorobanRpcUrl());
  }
  return sorobanServer;
}

/** Test hook — reset Stellar client singletons. */
export function resetStellarClientsForTests(): void {
  horizonServer = undefined;
  sorobanServer = undefined;
}
