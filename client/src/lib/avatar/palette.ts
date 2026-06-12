/**
 * Radiant brand colors for Dicebear avatars (hex without `#`).
 * Mirrors `--hero-*` tokens in `globals.css`.
 */
export const RADIANT = {
  bg: "faf6ec",
  ink: "1b1610",
  coral: "ff5d46",
  blue: "3865ff",
  mint: "00c478",
  amber: "ffb01f",
  violet: "8e5bff",
} as const;

/** Playful gradient / solid backdrops. */
export const RADIANT_AVATAR_BACKGROUNDS = [
  RADIANT.bg,
  RADIANT.amber,
  RADIANT.violet,
  RADIANT.mint,
  RADIANT.blue,
  RADIANT.coral,
] as const;

/** Hair, accessories, and feature accents — bold Radiant palette. */
export const RADIANT_AVATAR_ACCENT_COLORS = [
  RADIANT.coral,
  RADIANT.blue,
  RADIANT.violet,
  RADIANT.mint,
  RADIANT.amber,
  RADIANT.ink,
] as const;

/** Inclusive warm skin tones (still works with colorful hair). */
export const RADIANT_AVATAR_SKIN_COLORS = [
  "fde8d8",
  "f5c9a8",
  "e8b896",
  "c6865a",
  "8d5524",
] as const;
