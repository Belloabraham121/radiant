"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Captcha,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
  type PrivyEvents,
} from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { fetchAuthMe } from "@/lib/auth-api";
import {
  accountMergeErrorMessage,
  isAccountMergeOrTransferError,
} from "@/lib/auth-errors";
import { formatPrivyOAuthError, isPrivyOAuthReturn } from "@/lib/privy-oauth";

gsap.registerPlugin(useGSAP);

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.69-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.04.77 2.1 0 1.52-.01 2.74-.01 3.11 0 .3.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
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

type EmailStep = "idle" | "code_sent";

export function AuthCard() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [emailStep, setEmailStep] = useState<EmailStep>("idle");
  const [mergeRequired, setMergeRequired] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [oauthReturn, setOauthReturn] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<"google" | "github" | null>(null);
  const oauthProviderRef = useRef<"google" | "github" | null>(null);
  const handledAuthRef = useRef(false);
  const userInitiatedLoginRef = useRef(false);
  const { ready, authenticated } = usePrivy();

  const completeLogin = useCallback(async () => {
    if (syncing) {
      return;
    }
    setSyncing(true);
    setError(null);
    setMergeRequired(false);
    try {
      await fetchAuthMe();
      router.replace("/app");
    } catch (err) {
      const merge = isAccountMergeOrTransferError(err);
      setMergeRequired(merge);
      setError(accountMergeErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }, [router, syncing]);

  const loginCallbacks = useMemo<PrivyEvents["login"]>(
    () => ({
      onComplete: () => {
        handledAuthRef.current = true;
        void completeLogin();
      },
      onError: (privyError) => {
        const provider = oauthProviderRef.current ?? "google";
        const message = formatPrivyOAuthError(new Error(String(privyError)), provider);
        setMergeRequired(isAccountMergeOrTransferError(privyError));
        setError(message);
      },
    }),
    [completeLogin],
  );

  const {
    initOAuth,
    loading: oauthLoading,
    state: oauthState,
  } = useLoginWithOAuth(loginCallbacks);
  const { sendCode, loginWithCode, state: otpState } = useLoginWithEmail(loginCallbacks);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-auth-card]", {
        y: 40,
        opacity: 0,
        rotation: -2,
        duration: 0.8,
        ease: "back.out(1.5)",
      });
      gsap.from("[data-auth-deco]", {
        scale: 0,
        duration: 0.6,
        stagger: 0.08,
        delay: 0.3,
        ease: "back.out(2.5)",
      });
    },
    { scope: ref },
  );

  useEffect(() => {
    setOauthReturn(isPrivyOAuthReturn());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!authenticated) {
      handledAuthRef.current = false;
      userInitiatedLoginRef.current = false;
      return;
    }
    if (handledAuthRef.current) {
      return;
    }

    const oauthReturn = isPrivyOAuthReturn();

    if (userInitiatedLoginRef.current && !oauthReturn) {
      return;
    }

    if (oauthReturn) {
      handledAuthRef.current = true;
      void completeLogin();
      return;
    }

    handledAuthRef.current = true;
    void completeLogin();
  }, [ready, authenticated, completeLogin]);

  const resetEmailFlow = () => {
    setEmailStep("idle");
    setOtpCode("");
    setError(null);
  };

  const startOAuth = async (provider: "google" | "github") => {
    if (!ready) {
      setError("Auth is still loading. Please wait a moment and try again.");
      return;
    }

    setError(null);
    setMergeRequired(false);
    resetEmailFlow();
    handledAuthRef.current = false;
    userInitiatedLoginRef.current = true;
    setOauthProvider(provider);
    oauthProviderRef.current = provider;

    try {
      await initOAuth({ provider });
    } catch (err) {
      setError(formatPrivyOAuthError(err, provider));
    }
  };

  const oauthErrorMessage =
    oauthState.status === "error" && oauthProvider
      ? formatPrivyOAuthError(oauthState.error, oauthProvider)
      : null;
  const oauthMergeRequired =
    oauthState.status === "error" && oauthProvider
      ? isAccountMergeOrTransferError(oauthState.error)
      : false;
  const displayError = error ?? oauthErrorMessage;
  const showMergeRequired = mergeRequired || oauthMergeRequired;

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await sendCode({ email: email.trim() });
      setEmailStep("code_sent");
    } catch (err) {
      setMergeRequired(isAccountMergeOrTransferError(err));
      setError(accountMergeErrorMessage(err));
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    userInitiatedLoginRef.current = true;
    try {
      await loginWithCode({ code: otpCode.trim() });
    } catch (err) {
      setMergeRequired(isAccountMergeOrTransferError(err));
      setError(accountMergeErrorMessage(err));
    }
  };

  const emailVerifying =
    otpState.status === "sending-code" || otpState.status === "submitting-code";
  const oauthCompleting =
    mounted && (oauthReturn || (oauthState.status === "loading" && !displayError));
  const busy = oauthLoading || syncing || emailVerifying || oauthCompleting;
  const authLoading = !mounted || !ready;

  return (
    <div
      ref={ref}
      className="hero-selection relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--hero-bg)] px-6 py-12 text-[var(--hero-ink)]"
    >
      <span
        data-auth-deco
        aria-hidden
        className="hero-bob absolute left-[12%] top-[18%] size-6 rounded-full bg-[var(--hero-coral)]"
      />
      <span
        data-auth-deco
        aria-hidden
        className="hero-bob absolute right-[14%] top-[26%] size-5 rotate-12 rounded-md bg-[var(--hero-blue)] [animation-delay:0.4s]"
      />
      <span
        data-auth-deco
        aria-hidden
        className="hero-bob absolute bottom-[20%] left-[18%] size-4 -rotate-12 rounded-md bg-[var(--hero-mint)] [animation-delay:0.8s]"
      />
      <span
        data-auth-deco
        aria-hidden
        className="hero-bob absolute bottom-[24%] right-[16%] size-6 rounded-full bg-[var(--hero-violet)] [animation-delay:0.2s]"
      />

      <Link
        href="/"
        className="absolute left-6 top-6 flex items-center gap-1.5 text-sm font-bold text-[var(--hero-ink)]/50 transition-colors hover:text-[var(--hero-ink)] md:left-12"
      >
        <ArrowLeft className="size-4" strokeWidth={2.5} />
        Back home
      </Link>

      <div
        data-auth-card
        className="w-full max-w-md rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-8 shadow-[8px_8px_0_var(--hero-ink)] md:p-10"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="hero-wiggle mb-4 flex size-14 items-center justify-center rounded-2xl border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)] shadow-[3px_3px_0_var(--hero-ink)]">
            <Sparkles className="size-7" strokeWidth={2.4} />
          </span>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">
            {mode === "login" ? "Hey, you're back." : "Meet your agent."}
          </h1>
          <p className="mt-2 text-sm font-medium text-[var(--hero-ink)]/55">
            {mode === "login"
              ? "Your agent kept everything warm for you."
              : "Wallet, memory, and hands — set up in seconds."}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-full border-2 border-[var(--hero-ink)] p-1 text-sm font-bold">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                resetEmailFlow();
              }}
              className={`rounded-full py-2 transition-all ${
                mode === m ? "bg-[var(--hero-ink)] text-[var(--hero-bg)]" : "hover:opacity-70"
              }`}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        {oauthCompleting ? (
          <p className="mb-4 flex items-center justify-center gap-2 rounded-2xl border-2 border-[var(--hero-blue)] bg-[var(--hero-blue)]/10 px-4 py-3 text-sm font-semibold text-[var(--hero-ink)]">
            <Loader2 className="size-4 animate-spin" />
            Completing sign in…
          </p>
        ) : authLoading ? (
          <p className="mb-4 text-center text-sm font-medium text-[var(--hero-ink)]/55">
            Loading sign-in…
          </p>
        ) : syncing ? (
          <p className="mb-4 flex items-center justify-center gap-2 rounded-2xl border-2 border-[var(--hero-blue)] bg-[var(--hero-blue)]/10 px-4 py-3 text-sm font-semibold text-[var(--hero-ink)]">
            <Loader2 className="size-4 animate-spin" />
            Setting up your agent…
          </p>
        ) : null}

        {displayError ? (
          <div
            role="alert"
            className="mb-4 rounded-2xl border-2 border-[var(--hero-coral)] bg-[var(--hero-coral)]/10 px-4 py-3 text-sm font-semibold text-[var(--hero-ink)]"
          >
            <p>{displayError}</p>
            {showMergeRequired ? (
              <p className="mt-2 text-xs font-medium text-[var(--hero-ink)]/70">
                Tip: sign in with the login method you used first, open Settings → Connected
                accounts, and link the other provider. Enable{" "}
                <strong>Login method transfer</strong> in your Privy Dashboard if you have not
                already.
              </p>
            ) : null}
          </div>
        ) : null}

        <Captcha />

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={busy || authLoading}
            onClick={() => void startOAuth("google")}
            className="flex items-center justify-center gap-3 rounded-full border-2 border-[var(--hero-ink)] bg-white py-3 text-sm font-bold shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </button>
          <button
            type="button"
            disabled={busy || authLoading}
            onClick={() => void startOAuth("github")}
            className="flex items-center justify-center gap-3 rounded-full border-2 border-[var(--hero-ink)] bg-white py-3 text-sm font-bold shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <GithubIcon />}
            Continue with GitHub
          </button>
        </div>

        <div className="my-6 flex items-center gap-4 text-xs font-bold text-[var(--hero-ink)]/35">
          <span className="h-0.5 flex-1 bg-[var(--hero-ink)]/10" />
          or with email
          <span className="h-0.5 flex-1 bg-[var(--hero-ink)]/10" />
        </div>

        {emailStep === "idle" ? (
          <form onSubmit={handleSendCode} className="flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={busy}
              placeholder="you@anywhere.com"
              className="rounded-2xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-5 py-3 text-sm font-semibold placeholder:text-[var(--hero-ink)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--hero-blue)] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || email.trim().length === 0}
              className="group mt-1 flex items-center justify-center gap-2 rounded-full bg-[var(--hero-ink)] py-3.5 text-sm font-bold text-[var(--hero-bg)] shadow-[4px_4px_0_var(--hero-coral)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {otpState.status === "sending-code" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {mode === "login" ? "Continue with email" : "Create my agent"}
              {otpState.status !== "sending-code" ? (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              ) : null}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
            <p className="text-center text-sm font-medium text-[var(--hero-ink)]/55">
              Enter the code we sent to{" "}
              <span className="font-bold text-[var(--hero-ink)]">{email}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={busy}
              placeholder="123456"
              maxLength={6}
              className="rounded-2xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-5 py-3 text-center text-lg font-bold tracking-[0.3em] placeholder:tracking-normal placeholder:text-[var(--hero-ink)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--hero-blue)] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || otpCode.length < 6}
              className="group mt-1 flex items-center justify-center gap-2 rounded-full bg-[var(--hero-ink)] py-3.5 text-sm font-bold text-[var(--hero-bg)] shadow-[4px_4px_0_var(--hero-coral)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {otpState.status === "submitting-code" || syncing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Verify code
              {otpState.status !== "submitting-code" && !syncing ? (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              ) : null}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resetEmailFlow}
              className="text-sm font-bold text-[var(--hero-blue)] hover:underline disabled:opacity-60"
            >
              Use a different email
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs font-medium text-[var(--hero-ink)]/45">
          {mode === "login" ? "New here? " : "Already have an agent? "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="font-bold text-[var(--hero-blue)] hover:underline"
          >
            {mode === "login" ? "Create your agent" : "Log in instead"}
          </button>
        </p>
      </div>

      <p className="mt-6 max-w-sm text-center text-xs font-medium leading-relaxed text-[var(--hero-ink)]/40">
        Your agent gets its own wallet on signup. You hold the keys — Radiant never does.
      </p>
    </div>
  );
}
