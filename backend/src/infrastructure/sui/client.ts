import type { CoreClient } from "@mysten/sui/client";
import { GrpcWebFetchTransport, SuiGrpcClient } from "@mysten/sui/grpc";
import {
  JsonRpcHTTPTransport,
  SuiJsonRpcClient,
  type JsonRpcTransport,
  type JsonRpcTransportRequestOptions,
} from "@mysten/sui/jsonRpc";
import { bearerAuthFetch, resolveSuiRpcConnection } from "./rpc-config.js";

let client: SuiGrpcClient | undefined;

/** Drop null/undefined RPC params — some providers reject `[owner, null]`. */
class SanitizedJsonRpcTransport implements JsonRpcTransport {
  constructor(private readonly inner: JsonRpcTransport) {}

  request<T>(input: JsonRpcTransportRequestOptions): Promise<T> {
    return this.inner.request({
      ...input,
      params: input.params.filter((param) => param != null),
    });
  }
}

/** Forward Core API methods missing on JSON-RPC client (e.g. executeTransaction). */
function asGrpcCompatibleClient(jsonRpcClient: SuiJsonRpcClient): SuiGrpcClient {
  return new Proxy(jsonRpcClient, {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "function") {
          return value.bind(target);
        }
        return value;
      }

      const core = target.core as CoreClient & Record<string, unknown>;
      if (typeof prop === "string" && typeof core[prop] === "function") {
        return (core[prop] as (...args: unknown[]) => unknown).bind(core);
      }

      return Reflect.get(target, prop, receiver);
    },
  }) as SuiGrpcClient;
}

export function getSuiClient(): SuiGrpcClient {
  if (!client) {
    const connection = resolveSuiRpcConnection();

    if (connection.mode === "json-rpc") {
      const transport = new SanitizedJsonRpcTransport(
        new JsonRpcHTTPTransport({ url: connection.url }),
      );
      client = asGrpcCompatibleClient(
        new SuiJsonRpcClient({
          network: connection.network,
          transport,
        }),
      );
    } else {
      const transport = new GrpcWebFetchTransport({
        baseUrl: connection.baseUrl,
        ...(connection.apiKey ? { fetch: bearerAuthFetch(connection.apiKey) } : {}),
      });
      client = new SuiGrpcClient({
        network: connection.network,
        transport,
      });
    }
  }
  return client;
}

/** Test hook — clear the Sui gRPC client singleton. */
export function resetSuiClientForTests(): void {
  client = undefined;
}
