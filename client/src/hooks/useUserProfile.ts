"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import { fetchAuthMe, type AuthMeData } from "@/lib/auth-api";
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
      setMe(null);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    void fetchAuthMe()
      .then((data) => {
        if (!cancelled) {
          setMe(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMe(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProfileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, ready, user?.id]);

  return useMemo(() => {
    const loginBadges: LoginBadge[] =
      me?.linked_accounts?.length ? me.linked_accounts : resolveLoginBadges(user);

    return {
      ready,
      authenticated,
      user,
      profileLoading: authenticated && profileLoading,
      seed: resolveAvatarSeed(me?.avatar_seed, user),
      avatarStyle: me?.avatar_style ?? "lorelei",
      displayName: resolveDisplayName(user, me?.display_name),
      email: me?.email ?? resolveEmail(user),
      loginBadges,
      memberSince: formatMemberSince(me?.member_since),
    };
  }, [authenticated, me, profileLoading, ready, user]);
}
