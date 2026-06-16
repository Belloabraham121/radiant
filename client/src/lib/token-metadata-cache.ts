import type { WalletAssetRow } from "./wallet-assets-api";

const STORAGE_KEY = "radiant:token-metadata:v1";

type TokenMetadataEntry = {
  logo_url: string;
  symbol?: string;
  name?: string;
};

type TokenMetadataStore = Record<string, TokenMetadataEntry>;

function readStore(): TokenMetadataStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as TokenMetadataStore;
  } catch {
    return {};
  }
}

function writeStore(store: TokenMetadataStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // quota / private mode
  }
}

export function readCachedTokenLogo(coinType: string): string | null {
  return readStore()[coinType]?.logo_url ?? null;
}

export function rememberTokenMetadata(
  coinType: string,
  entry: TokenMetadataEntry,
): void {
  if (!entry.logo_url) return;
  const store = readStore();
  store[coinType] = {
    ...store[coinType],
    ...entry,
  };
  writeStore(store);
}

export function rememberAssetsMetadata(assets: WalletAssetRow[]): void {
  for (const asset of assets) {
    if (asset.logo_url) {
      rememberTokenMetadata(asset.coin_type, {
        logo_url: asset.logo_url,
        symbol: asset.symbol,
        name: asset.name,
      });
    }
  }
}

/** Merge long-lived cached logos; never strips logos on refresh. */
export function mergeAssetsWithCachedLogos(assets: WalletAssetRow[]): WalletAssetRow[] {
  return assets.map((asset) => {
    const cachedLogo = readCachedTokenLogo(asset.coin_type);
    return {
      ...asset,
      logo_url: cachedLogo ?? asset.logo_url ?? null,
    };
  });
}

export function clearTokenMetadataCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
