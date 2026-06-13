"use client";

import { useState } from "react";
import {
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  Folder,
} from "lucide-react";
import { CREDENTIALS, type Credential } from "@/lib/app-data";

function vaultSummary(): string {
  if (CREDENTIALS.length === 0) return "No logins yet";
  const apps = CREDENTIALS.slice(0, 3).map((c) => c.app);
  const rest = CREDENTIALS.length - apps.length;
  if (rest > 0) return `${apps.join(", ")} +${rest} more`;
  return apps.join(", ");
}

function CredentialCard({ credential }: { credential: Credential }) {
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
        {credential.hasPasskey ? (
          <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/10 px-3 py-1 text-xs font-bold text-[var(--hero-violet)]">
            <Fingerprint className="size-3.5" strokeWidth={2.5} />
            passkey
          </span>
        ) : null}
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
              type="button"
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
              type="button"
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

export function AgentVaultSection() {
  const [open, setOpen] = useState(false);

  return (
    <section data-settings-block className="mt-10">
      <div className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white shadow-[5px_5px_0_var(--hero-ink)]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/15">
              <Folder className="size-5 text-[var(--hero-amber)]" strokeWidth={2.5} />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-base font-extrabold tracking-tight">
                  Agent vault
                </span>
                <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)] px-2.5 py-0.5 text-[10px] font-bold shadow-[2px_2px_0_var(--hero-ink)]">
                  {CREDENTIALS.length} logins
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs font-medium text-[var(--hero-ink)]/50">
                {vaultSummary()}
              </span>
            </span>
          </span>
          <ChevronDown
            className={`size-5 shrink-0 text-[var(--hero-ink)]/40 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            strokeWidth={2.5}
          />
        </button>

        {open ? (
          <div className="border-t-2 border-[var(--hero-ink)]/10 px-5 pb-5 pt-4">
            <p className="mb-5 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
              Every time your agent creates an account somewhere on your behalf, the login lands
              here — passwords, passkeys, all of it. Encrypted, owned by your wallet.
            </p>
            <div className="flex flex-col gap-4">
              {CREDENTIALS.map((credential) => (
                <CredentialCard key={credential.id} credential={credential} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
