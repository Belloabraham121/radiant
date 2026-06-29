"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import { fetchAuthMe, type AuthMeData } from "@/lib/auth-api";
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from "@/lib/features";
import {
  formatMemberSince,
  resolveAvatarSeed,
  resolveDisplayName,
  resolveEmail,
  resolveLoginBadges,
  type LoginBadge,
} from "@/lib/user-profile";

export function useUserProfile() {
  const { user, ready, authenticated } = usePrivy();
  const [me, setMe] = useState<AuthMeData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!ready || !authenticated) {
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setProfileLoading(true);
      try {
        const data = await fetchAuthMe();
        if (!cancelled) {
          setMe(data);
        }
      } catch {
        if (!cancelled) {
          setMe(null);
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [authenticated, ready, user?.id]);

  return useMemo(() => {
    const profileMe = ready && authenticated ? me : null;
    const loginBadges: LoginBadge[] =
      profileMe?.linked_accounts?.length ? profileMe.linked_accounts : resolveLoginBadges(user);

    return {
      ready,
      authenticated,
      user,
      profileLoading: ready && authenticated && profileLoading,
      featuresLoaded: ready && (!authenticated || !profileLoading),
      features: (profileMe?.features ?? DEFAULT_FEATURE_FLAGS) as FeatureFlags,
      seed: resolveAvatarSeed(profileMe?.avatar_seed, user),
      avatarStyle: profileMe?.avatar_style ?? "lorelei",
      displayName: resolveDisplayName(user, profileMe?.display_name),
      email: profileMe?.email ?? resolveEmail(user),
      loginBadges,
      memberSince: formatMemberSince(profileMe?.member_since),
    };
  }, [authenticated, me, profileLoading, ready, user]);
}
