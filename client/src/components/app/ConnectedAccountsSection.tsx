"use client";

import { useCallback, useEffect, useState } from "react";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { Check, Link2, Loader2, Mail } from "lucide-react";
import { fetchAuthMe, type AuthMeData } from "@/lib/auth-api";
import { accountMergeErrorMessage } from "@/lib/auth-errors";
import { formatPrivyOAuthError } from "@/lib/privy-oauth";

type ProviderId = "google" | "github" | "email";

const PROVIDERS: Array<{
  id: ProviderId;
  label: string;
  description: string;
}> = [
  {
    id: "google",
    label: "Google",
    description: "Sign in with Gmail on any device.",
  },
  {
    id: "github",
    label: "GitHub",
    description: "Use your GitHub profile email.",
  },
  {
    id: "email",
    label: "Email OTP",
    description: "Passwordless code to your inbox.",
  },
];

function ProviderIcon({ id }: { id: ProviderId }) {
  if (id === "email") {
    return <Mail className="size-4" strokeWidth={2.5} />;
  }
  if (id === "google") {
    return (
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path
          fill="#4285F4"
          d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z"
        />
        <path
          fill="#EA4335"
          d="M12 4.76c1.76 0 3.34.6 4.59 1.79l3.43-3.43A11.97 11.97 0 0 0 1.29 6.62l3.98 3.1C6.22 6.87 8.87 4.76 12 4.76z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.69-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.04.77 2.1 0 1.52-.01 2.74-.01 3.11 0 .3.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function ConnectedAccountsSection() {
  const { ready, authenticated } = usePrivy();
  const [me, setMe] = useState<AuthMeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    if (!authenticated) {
      setMe(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchAuthMe();
      setMe(data);
      setError(null);
    } catch (err) {
      setError(accountMergeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  const { linkGoogle, linkGithub, linkEmail } = useLinkAccount({
    onSuccess: () => {
      setLinking(null);
      void refreshMe();
    },
    onError: (privyError) => {
      setLinking(null);
      const mergeMessage = accountMergeErrorMessage(privyError);
      setError(
        mergeMessage !== "Something went wrong. Please try again."
          ? mergeMessage
          : formatPrivyOAuthError(privyError, "google"),
      );
    },
  });

  useEffect(() => {
    if (!ready) {
      return;
    }

    let cancelled = false;

    async function loadMe() {
      if (!authenticated) {
        if (!cancelled) {
          setMe(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const data = await fetchAuthMe();
        if (!cancelled) {
          setMe(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(accountMergeErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMe();

    return () => {
      cancelled = true;
    };
  }, [authenticated, ready]);

  const linked = new Set(me?.linked_accounts ?? []);

  const linkProvider = (provider: ProviderId) => {
    setError(null);
    setLinking(provider);
    switch (provider) {
      case "google":
        linkGoogle();
        break;
      case "github":
        linkGithub();
        break;
      case "email":
        linkEmail();
        break;
    }
  };

  return (
    <section data-settings-block className="mt-10">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
        <Link2 className="size-4" strokeWidth={2.5} />
        Connected accounts
      </h2>
      <p className="mb-5 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
        Link Google, GitHub, and email to one profile so you always land on the
        same agent wallet — no matter which sign-in you use.
      </p>

      {error ? (
        <div className="mb-4 rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--hero-coral)]">
            {error}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {PROVIDERS.map((provider) => {
          const connected = linked.has(provider.id);
          const busy = linking === provider.id;

          return (
            <div
              key={provider.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-5 py-4 shadow-[3px_3px_0_var(--hero-ink)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)]">
                  <ProviderIcon id={provider.id} />
                </span>
                <span>
                  <span className="block text-sm font-bold">
                    {provider.label}
                  </span>
                  <span className="block text-xs font-medium text-[var(--hero-ink)]/50">
                    {provider.description}
                  </span>
                </span>
              </div>

              {loading ? (
                <span className="inline-flex items-center gap-2 text-xs font-bold text-[var(--hero-ink)]/45">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading…
                </span>
              ) : connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1 text-xs font-bold text-[var(--hero-mint)]">
                  <Check className="size-3.5" />
                  Connected
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!ready || !authenticated || busy}
                  onClick={() => linkProvider(provider.id)}
                  className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-xs font-bold text-[var(--hero-bg)] shadow-[2px_2px_0_var(--hero-coral)] disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Link
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
