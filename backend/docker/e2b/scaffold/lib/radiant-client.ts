/** Radiant platform client — project-scoped DeepBook & wallet APIs on Radiant. */

export type SwapQuoteParams = {
  amount: number;
  side: "buy" | "sell";
  pool_key?: string;
  input_coin?: string;
  output_coin?: string;
};

export type SwapQuoteResult = {
  pool_key: string;
  input_amount_display: number;
  output_amount_display: number;
  input_coin: string;
  output_coin: string;
};

export type PoolInfoResult = {
  pool_key: string;
  base_coin: string;
  quote_coin: string;
  ticker?: { last_price?: number };
};

declare global {
  interface Window {
    __RADIANT_PROJECT_ID__?: string;
    __RADIANT_PREVIEW_FETCH__?: (path: string, init?: RequestInit) => Promise<Response>;
  }
}

function projectId(): string {
  if (typeof window !== "undefined" && window.__RADIANT_PROJECT_ID__) {
    return window.__RADIANT_PROJECT_ID__;
  }
  return process.env.NEXT_PUBLIC_RADIANT_PROJECT_ID ?? "";
}

async function platformFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (typeof window !== "undefined" && window.__RADIANT_PREVIEW_FETCH__) {
    return window.__RADIANT_PREVIEW_FETCH__(path, { ...init, headers });
  }
  return fetch(path, { ...init, headers, credentials: "include" });
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json()) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
  };
  if (!res.ok || !body.success || body.data === undefined) {
    throw new Error(body.error?.message ?? "Radiant API request failed");
  }
  return body.data;
}

export async function swapQuote(params: SwapQuoteParams): Promise<SwapQuoteResult> {
  const id = projectId();
  if (!id) throw new Error("Missing Radiant project id");
  const res = await platformFetch("/api/v1/projects/" + id + "/swap/quote", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return parseEnvelope<SwapQuoteResult>(res);
}

export async function poolInfo(pool_key = "SUI_USDC"): Promise<PoolInfoResult> {
  const id = projectId();
  if (!id) throw new Error("Missing Radiant project id");
  const res = await platformFetch(
    "/api/v1/projects/" +
      id +
      "/deepbook/pool-info?pool_key=" +
      encodeURIComponent(pool_key),
  );
  return parseEnvelope<PoolInfoResult>(res);
}
