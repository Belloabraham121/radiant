import { createAvatar, type BackgroundType } from "@dicebear/core";
import { lorelei } from "@dicebear/collection";
import {
  RADIANT_AVATAR_ACCENT_COLORS,
  RADIANT_AVATAR_BACKGROUNDS,
  RADIANT_AVATAR_SKIN_COLORS,
} from "./palette";

export type AvatarStyle = "lorelei";

export type GenerateAvatarOptions = {
  seed: string;
  size?: number;
  style?: AvatarStyle;
};

function radiantLoreleiOptions(seed: string, size: number) {
  return {
    seed,
    size,
    backgroundColor: [...RADIANT_AVATAR_BACKGROUNDS],
    backgroundType: ["gradientLinear", "solid"] satisfies BackgroundType[],
    backgroundRotation: [0, 45, 90, 135, 180, 225, 270, 315],
    hairColor: [...RADIANT_AVATAR_ACCENT_COLORS],
    hairAccessoriesColor: [RADIANT_AVATAR_ACCENT_COLORS[0], RADIANT_AVATAR_ACCENT_COLORS[3]],
    hairAccessoriesProbability: 22,
    skinColor: [...RADIANT_AVATAR_SKIN_COLORS],
    eyesColor: [
      RADIANT_AVATAR_ACCENT_COLORS[1],
      RADIANT_AVATAR_ACCENT_COLORS[2],
      RADIANT_AVATAR_ACCENT_COLORS[5],
    ],
    eyebrowsColor: [RADIANT_AVATAR_ACCENT_COLORS[5]],
    mouthColor: [
      RADIANT_AVATAR_ACCENT_COLORS[0],
      RADIANT_AVATAR_ACCENT_COLORS[4],
      RADIANT_AVATAR_ACCENT_COLORS[5],
    ],
    noseColor: [RADIANT_AVATAR_ACCENT_COLORS[5]],
    glassesColor: [
      RADIANT_AVATAR_ACCENT_COLORS[1],
      RADIANT_AVATAR_ACCENT_COLORS[2],
      RADIANT_AVATAR_ACCENT_COLORS[4],
    ],
    glassesProbability: 28,
    earringsColor: [
      RADIANT_AVATAR_ACCENT_COLORS[0],
      RADIANT_AVATAR_ACCENT_COLORS[3],
      RADIANT_AVATAR_ACCENT_COLORS[4],
    ],
    earringsProbability: 35,
    frecklesColor: [RADIANT_AVATAR_ACCENT_COLORS[0]],
    frecklesProbability: 18,
  };
}

/**
 * Deterministic Dicebear Lorelei avatar with Radiant playful colors.
 * Same seed → same character everywhere.
 */
export function generateAvatarDataUri({
  seed,
  size = 128,
}: GenerateAvatarOptions): string {
  return createAvatar(lorelei, radiantLoreleiOptions(seed, size)).toDataUri();
}

export function generateAvatarSvg({ seed, size = 128 }: GenerateAvatarOptions): string {
  return createAvatar(lorelei, radiantLoreleiOptions(seed, size)).toString();
}
