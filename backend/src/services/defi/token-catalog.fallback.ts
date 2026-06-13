import type { TokenCatalogEntry } from "./token-catalog.types.js";

/** Mainnet coin types when the DeepBook indexer is unreachable. */
export const FALLBACK_CATALOG: TokenCatalogEntry[] = [
  {
    symbol: "SUI",
    name: "Sui",
    coin_type: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
    decimals: 9,
    popular: true,
  },
  {
    symbol: "USDC",
    name: "USDC",
    coin_type:
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    decimals: 6,
    popular: true,
  },
  {
    symbol: "DEEP",
    name: "Deepbook Protocol",
    coin_type: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    decimals: 6,
    popular: true,
  },
  {
    symbol: "WAL",
    name: "Walrus",
    coin_type: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
    decimals: 9,
    popular: true,
  },
  {
    symbol: "USDT",
    name: "Tether USDT",
    coin_type: "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT",
    decimals: 6,
    popular: true,
  },
];
