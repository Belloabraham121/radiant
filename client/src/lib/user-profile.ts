import type { User } from "@privy-io/react-auth";

export type LoginBadge = "google" | "github" | "email";

const FALLBACK_DISPLAY_NAME = "Radiant user";

/** Client fallback when `/auth/me` is not loaded yet. */
export function getAvatarSeedFallback(user: User | null | undefined): string {
  return user?.id ?? "radiant-guest";
}

/** Prefer backend `avatar_seed`; fall back to Privy id while loading. */
export function resolveAvatarSeed(
  backendSeed: string | null | undefined,
  user: User | null | undefined,
): string {
  const seed = backendSeed?.trim();
  if (seed) {
    return seed;
  }
  return getAvatarSeedFallback(user);
}

export function resolveDisplayName(
  user: User | null | undefined,
  backendDisplayName?: string | null,
): string {
  if (backendDisplayName?.trim()) {
    return backendDisplayName.trim();
  }
  if (!user) {
    return FALLBACK_DISPLAY_NAME;
  }
  if (user.google?.name?.trim()) {
    return user.google.name.trim();
  }
  if (user.github?.name?.trim()) {
    return user.github.name.trim();
  }
  if (user.github?.username?.trim()) {
    return `@${user.github.username.trim()}`;
  }
  const email = resolveEmail(user);
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) {
      return local;
    }
  }
  return FALLBACK_DISPLAY_NAME;
}

export function resolveEmail(user: User | null | undefined): string | null {
  if (!user) {
    return null;
  }
  return (
    user.email?.address ??
    user.google?.email ??
    user.github?.email ??
    null
  );
}

export function resolveLoginBadges(user: User | null | undefined): LoginBadge[] {
  if (!user) {
    return [];
  }
  const badges = new Set<LoginBadge>();
  if (user.google) {
    badges.add("google");
  }
  if (user.github) {
    badges.add("github");
  }
  if (user.email) {
    badges.add("email");
  }
  return [...badges];
}

export function formatMemberSince(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
