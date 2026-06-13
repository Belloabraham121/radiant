"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Copy, Eye, EyeOff, Fingerprint, KeyRound } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AgentWalletSection } from "@/components/app/AgentWalletSection";
import { ConnectedAccountsSection } from "@/components/app/ConnectedAccountsSection";
import { SidebarToggle } from "@/components/app/Sidebar";
import { InYourWalletSection } from "@/components/profile/InYourWalletSection";
import { UserProfileCard } from "@/components/profile/UserProfileCard";
import { AgentPermissionsSection } from "@/components/app/AgentPermissionsSection";
import { useUserProfile } from "@/hooks/useUserProfile";
import { CREDENTIALS } from "@/lib/app-data";

gsap.registerPlugin(useGSAP);

function CredentialCard({ credential }: { credential: (typeof CREDENTIALS)[number] }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credential.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. insecure context) — ignore
    }
  };

  return (
    <div
      data-vault-card
      className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[5px_5px_0_var(--hero-ink)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-lg font-extrabold text-white"
            style={{ backgroundColor: credential.accent }}
          >
            {credential.app[0]}
          </span>
          <div>
            <h3 className="font-heading text-lg font-extrabold tracking-tight">
              {credential.app}
            </h3>
            <p className="font-mono text-xs font-semibold text-[var(--hero-ink)]/45">
              {credential.site}
            </p>
          </div>
        </div>
        {credential.hasPasskey && (
          <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/10 px-3 py-1 text-xs font-bold text-[var(--hero-violet)]">
            <Fingerprint className="size-3.5" strokeWidth={2.5} />
            passkey
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between rounded-xl border-2 border-dashed border-[var(--hero-ink)]/20 px-4 py-2.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
            username
          </span>
          <span className="font-mono text-sm font-semibold">{credential.username}</span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-dashed border-[var(--hero-ink)]/20 px-4 py-2.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
            password
          </span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">
              {revealed ? credential.password : "••••••••••••••"}
            </span>
            <button
              onClick={() => setRevealed(!revealed)}
              aria-label={revealed ? "Hide password" : "Show password"}
              className="rounded-lg border-2 border-[var(--hero-ink)] p-1.5 transition-transform hover:-translate-y-0.5"
            >
              {revealed ? (
                <EyeOff className="size-3.5" strokeWidth={2.5} />
              ) : (
                <Eye className="size-3.5" strokeWidth={2.5} />
              )}
            </button>
            <button
              onClick={copy}
              aria-label="Copy password"
              className={`rounded-lg border-2 border-[var(--hero-ink)] p-1.5 transition-all hover:-translate-y-0.5 ${
                copied ? "bg-[var(--hero-mint)] text-white" : ""
              }`}
            >
              <Copy className="size-3.5" strokeWidth={2.5} />
            </button>
          </span>
        </div>
      </div>

      <p className="mt-4 text-xs font-medium text-[var(--hero-ink)]/50">
        <span className="font-bold text-[var(--hero-ink)]/70">Created by your agent</span> ·{" "}
        {credential.createdAt} — {credential.note}
      </p>
    </div>
  );
}

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
        <InYourWalletSection />
        <div className="mt-4">
          <LogoutButton variant="full" />
        </div>
      </section>

      <ConnectedAccountsSection />

      <AgentWalletSection />

      {/* agent vault */}
      <section data-settings-block className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
            <KeyRound className="size-4" strokeWidth={2.5} />
            Agent vault
          </h2>
          <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)] px-3 py-1 text-xs font-bold shadow-[2px_2px_0_var(--hero-ink)]">
            {CREDENTIALS.length} logins
          </span>
        </div>
        <p className="mb-5 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
          Every time your agent creates an account somewhere on your behalf, the login lands
          here — passwords, passkeys, all of it. Encrypted, owned by your wallet.
        </p>
        <div className="flex flex-col gap-4">
          {CREDENTIALS.map((credential) => (
            <CredentialCard key={credential.id} credential={credential} />
          ))}
        </div>
      </section>

      <AgentPermissionsSection />
    </div>
  );
}
