import { isStablecoinSymbol } from "../defi/deepbook/asset-scalars.js";
import { isCoingeckoEnabled } from "../../config/coingecko.js";
import type { WalletAssetRow } from "../wallet/wallet-assets.types.js";
import { resolveCoingeckoMarketData } from "./coingecko.client.js";
import { resolveCoingeckoId } from "./coingecko-symbols.js";

function computeUsdValue(
  balanceDisplay: number,
  usdPrice: number | null,
  symbol: string,
  existingUsd: number | null,
): number | null {
  if (existingUsd !== null && usdPrice === null) {
    return existingUsd;
  }

  if (usdPrice !== null && Number.isFinite(usdPrice)) {
    return balanceDisplay * usdPrice;
  }

  if (isStablecoinSymbol(symbol)) {
    return balanceDisplay;
  }

  return existingUsd;
}

/** Attach logo_url, usd_price, and computed usd_value using CoinGecko (when configured). */
export async function enrichWalletAssetsWithMarketData(
  assets: WalletAssetRow[],
  includeUsd: boolean,
): Promise<WalletAssetRow[]> {
  if (!isCoingeckoEnabled()) {
    return assets;
  }

  const idBySymbol = new Map<string, string>();
  for (const asset of assets) {
    const id = resolveCoingeckoId(asset.symbol);
    if (id) {
      idBySymbol.set(asset.symbol.toUpperCase(), id);
    }
  }

  const market = await resolveCoingeckoMarketData([...new Set(idBySymbol.values())]);

  return assets.map((asset) => {
    const coinId = idBySymbol.get(asset.symbol.toUpperCase());
    if (!coinId) {
      return asset;
    }

    const row = market.get(coinId);
    const logoUrl = row?.logoUrl ?? asset.logo_url ?? null;
    const usdPrice = row?.usdPrice ?? asset.usd_price ?? null;

    const usdValue = includeUsd
      ? computeUsdValue(asset.balance_display, usdPrice, asset.symbol, asset.usd_value)
      : null;

    return {
      ...asset,
      logo_url: logoUrl,
      usd_price: includeUsd ? usdPrice : null,
      usd_value: includeUsd ? usdValue : null,
    };
  });
}
