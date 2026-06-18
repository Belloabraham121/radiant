"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AgentWalletSection } from "@/components/app/AgentWalletSection";
// import { AgentVaultSection } from "@/components/app/AgentVaultSection";
import { ConnectedAccountsSection } from "@/components/app/ConnectedAccountsSection";
import { SidebarToggle } from "@/components/app/Sidebar";
import { UserProfileCard } from "@/components/profile/UserProfileCard";
import { AgentPermissionsSection } from "@/components/app/AgentPermissionsSection";
import { NotificationPushSection } from "@/components/app/NotificationPushSection";
import { NotificationPreferencesSection } from "@/components/app/NotificationPreferencesSection";
import { useUserProfile } from "@/hooks/useUserProfile";

gsap.registerPlugin(useGSAP);

export default function SettingsPage() {
  const ref = useRef<HTMLDivElement>(null);
  const { seed, displayName, email, loginBadges, memberSince } = useUserProfile();

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-settings-block]", {
        y: 28,
        opacity: 0,
        duration: 0.6,
        stagger: 0.12,
        ease: "power3.out",
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
      <div data-settings-block className="flex items-start gap-3">
        <SidebarToggle />
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
            Settings
          </h1>
          <p className="mt-2 text-sm font-medium text-[var(--hero-ink)]/55">
            Your account, your agent&apos;s vault, and how much rope you give it.
          </p>
        </div>
      </div>

      {/* profile */}
      <section data-settings-block className="mt-10">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
          Profile
        </h2>
        <UserProfileCard
          seed={seed}
          displayName={displayName}
          email={email}
          loginBadges={loginBadges}
          memberSince={memberSince}
          avatarSize={56}
        />
        <div className="mt-4">
          <LogoutButton variant="full" />
        </div>
      </section>

      <ConnectedAccountsSection />

      <AgentWalletSection />

      {/* <AgentVaultSection /> — Coming soon: real encrypted vault backend */}

      <AgentPermissionsSection />

      <NotificationPreferencesSection />

      <NotificationPushSection />
    </div>
  );
}
