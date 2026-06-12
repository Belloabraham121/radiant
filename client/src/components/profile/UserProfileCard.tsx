"use client";

import { UserAvatar } from "@/components/profile/UserAvatar";
import type { LoginBadge } from "@/lib/user-profile";

const BADGE_LABELS: Record<LoginBadge, string> = {
  google: "Google",
  github: "GitHub",
  email: "Email",
};

const BADGE_COLORS: Record<LoginBadge, string> = {
  google: "bg-[var(--hero-blue)]/15 text-[var(--hero-blue)]",
  github: "bg-[var(--hero-ink)]/10 text-[var(--hero-ink)]",
  email: "bg-[var(--hero-violet)]/15 text-[var(--hero-violet)]",
};

type UserProfileCardProps = {
  seed: string;
  displayName: string;
  email?: string | null;
  loginBadges?: LoginBadge[];
  memberSince?: string | null;
  avatarSize?: number;
  compact?: boolean;
};

export function UserProfileCard({
  seed,
  displayName,
  email,
  loginBadges = [],
  memberSince,
  avatarSize = 56,
  compact = false,
}: UserProfileCardProps) {
  return (
    <div
      className={`flex items-center gap-4 rounded-3xl border-2 border-[var(--hero-ink)] bg-white shadow-[5px_5px_0_var(--hero-ink)] ${
        compact ? "p-4" : "p-6"
      }`}
    >
      <UserAvatar seed={seed} alt={displayName} size={avatarSize} />
      <div className="min-w-0 flex-1">
        <p
          className={`font-heading font-extrabold tracking-tight ${
            compact ? "text-base" : "text-xl"
          }`}
        >
          {displayName}
        </p>
        {email ? (
          <p className="truncate text-sm font-medium text-[var(--hero-ink)]/55">{email}</p>
        ) : null}
        {(loginBadges.length > 0 || memberSince) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {loginBadges.map((badge) => (
              <span
                key={badge}
                className={`rounded-full border border-[var(--hero-ink)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${BADGE_COLORS[badge]}`}
              >
                {BADGE_LABELS[badge]}
              </span>
            ))}
            {memberSince ? (
              <span className="text-[11px] font-medium text-[var(--hero-ink)]/45">
                · Member since {memberSince}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
