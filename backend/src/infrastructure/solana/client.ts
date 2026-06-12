import { Connection } from "@solana/web3.js";
import { getSolanaCommitment, getSolanaRpcUrl } from "../../config/solana.js";

let connection: Connection | undefined;

export function getSolanaConnection(): Connection {
  if (!connection) {
    connection = new Connection(getSolanaRpcUrl(), {
      commitment: getSolanaCommitment(),
    });
  }
  return connection;
}

/** Test hook — reset connection singleton between tests. */
export function resetSolanaConnectionForTests(): void {
  connection = undefined;
}
