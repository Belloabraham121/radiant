"use client";

import { useEffect, useState } from "react";
import { Bookmark, Mic, Plus, Sparkles, Volume2 } from "lucide-react";
import { useReducedMotion } from "./useReducedMotion";

const PROMPT =
  "I want to trade on Limitless, track Euro inflation news, and see social sentiment.";

type Phase = "idle" | "typing" | "responding" | "done";

const MATCHES = [
  {
    league: "UEFA Champions League",
    home: "Barcelona",
    homeLogo: "/logos/teams/barcelona.png",
    away: "Feyenoord",
    awayLogo: "/logos/teams/feyenoord.png",
    when: "Wed, Sep 9",
    time: "05:45 PM",
    homePct: "90.8%",
    drawPct: "DRAW 6%",
    awayPct: "4.1%",
    homeOdd: "1.10x",
    drawOdd: "16.67x",
    awayOdd: "24.39x",
  },
  {
    league: "English Premier League",
    home: "Liverpool",
    homeLogo: "/logos/teams/liverpool.png",
    away: "Fulham",
    awayLogo: "/logos/teams/fulham.png",
    when: "Wed, Sep 9",
    time: "03:30 PM",
    homePct: "71%",
    drawPct: "DRAW 18%",
    awayPct: "12%",
    homeOdd: "1.41x",
    drawOdd: "5.56x",
    awayOdd: "8.33x",
  },
] as const;

const NEWS = [
  {
    title: "Barça eye statement win as Feyenoord visit Camp Nou",
    source: "ESPN · 12m",
    image:
      "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=400&q=60",
  },
  {
    title: "Eurozone CPI cools — markets price softer ECB path",
    source: "Reuters · 28m",
    image:
      "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=400&q=60",
  },
] as const;

const TWEETS = [
  {
    handle: "@LimitlessHQ",
    body: "UCL board is live — Barcelona vs Feyenoord priced at 90.8% home. Trade the match market on Base.",
    meta: "2.1k · 14m",
  },
  {
    handle: "@macrodesk",
    body: "Euro inflation print lands soft. Risk assets bid — watch EURUSD + Limitless volume spike.",
    meta: "886 · 31m",
  },
] as const;

export function HeroCanvasMock() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduced ? "done" : "idle");
  const [typedLen, setTypedLen] = useState(reduced ? PROMPT.length : 0);

  useEffect(() => {
    if (reduced) return;
    const start = setTimeout(() => setPhase("typing"), 500);
    return () => clearTimeout(start);
  }, [reduced]);

  useEffect(() => {
    if (reduced || phase !== "typing") return;

    let i = 0;
    const typeTimer = setInterval(() => {
      i += 1;
      setTypedLen(i);
      if (i >= PROMPT.length) {
        clearInterval(typeTimer);
        setPhase("responding");
        setTimeout(() => setPhase("done"), 420);
      }
    }, 22);

    return () => clearInterval(typeTimer);
  }, [phase, reduced]);

  const typed = PROMPT.slice(0, typedLen);
  const showCaret = phase === "typing" && typedLen < PROMPT.length;
  const showCanvas = phase === "responding" || phase === "done";
  const ready = phase === "done";

  return (
    <div
      className="relative mx-auto w-full max-w-6xl pb-16 sm:pb-20"
      aria-hidden
    >
      <div className="rounded-[1.75rem] border border-white/10 bg-[#0c0e10]/92 px-4 py-8 shadow-[0_40px_120px_-48px_hsla(195,100%,50%,0.55)] backdrop-blur-md sm:px-8 sm:py-10 lg:px-10">
        <div className="mb-7 flex items-center justify-center gap-3">
          <Sparkles
            className="size-6 text-[hsl(195,100%,50%)]"
            strokeWidth={1.75}
            fill="currentColor"
          />
          <p className="font-(family-name:--font-instrument-serif) text-3xl tracking-tight text-white/95 sm:text-4xl">
            Hello, night owl
          </p>
        </div>

        {/* Canvas ABOVE the chat bar — height always reserved; content fades in */}
        <div className="mb-7">
          <p
            className={`mb-4 text-center text-sm transition-opacity duration-500 ${
              showCanvas ? "text-white/45 opacity-100" : "opacity-0"
            }`}
          >
            {ready
              ? "Generated a live canvas for your intent."
              : "Compiling OnchainKit components…"}
          </p>

          <div
            className={`grid gap-4 transition-opacity duration-700 ease-out lg:grid-cols-12 ${
              showCanvas
                ? ready
                  ? "opacity-100"
                  : "opacity-55"
                : "opacity-0"
            }`}
          >
            {/* Center-left: News + X */}
            <div className="flex flex-col gap-3 lg:col-span-5">
              <PanelLabel>News · Euro & matchday</PanelLabel>
              {NEWS.map((item) => (
                <article
                  key={item.title}
                  className="flex gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image}
                    alt=""
                    className="h-24 w-28 shrink-0 object-cover"
                  />
                  <div className="flex flex-col justify-center py-2 pr-3">
                    <p className="text-[13px] font-semibold leading-snug text-white">
                      {item.title}
                    </p>
                    <p className="mt-1 text-[11px] text-white/40">{item.source}</p>
                  </div>
                </article>
              ))}

              <PanelLabel className="mt-1">X · sentiment</PanelLabel>
              {TWEETS.map((tweet) => (
                <article
                  key={tweet.handle}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-full bg-[hsl(195,100%,50%)]/20 text-[10px] font-bold text-[hsl(193,85%,66%)]">
                      𝕏
                    </span>
                    <span className="text-[12px] font-semibold text-white/85">
                      {tweet.handle}
                    </span>
                    <span className="ml-auto text-[10px] text-white/35">
                      {tweet.meta}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-white/65">
                    {tweet.body}
                  </p>
                </article>
              ))}
            </div>

            {/* Right: Limitless match cards */}
            <div className="flex flex-col gap-3 lg:col-span-7">
              <div className="flex items-center justify-between">
                <PanelLabel>Limitless · prediction markets</PanelLabel>
                <span className="text-[11px] text-white/35">2 live →</span>
              </div>
              {MATCHES.map((m) => (
                <MatchCard key={`${m.home}-${m.away}`} match={m} />
              ))}
            </div>
          </div>
        </div>

        {/* Chat input — bottom of the mock */}
        <div className="rounded-2xl border border-white/10 bg-[#16181c] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="min-h-[5rem] px-4 pt-4 sm:px-5 sm:pt-5">
            {typedLen === 0 && phase === "idle" ? (
              <p className="text-[15px] text-white/35 sm:text-base">
                How can I help you today?
              </p>
            ) : (
              <p className="text-left font-sans text-[15px] leading-relaxed text-white/90 sm:text-base">
                {typed}
                {showCaret ? (
                  <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-white/70 align-middle" />
                ) : null}
              </p>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/6 px-3 py-3 sm:px-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg text-white/45">
                <Plus className="size-4" strokeWidth={1.75} />
              </span>
              <div className="flex rounded-lg bg-white/5 p-0.5 text-[12px] font-medium">
                <span className="rounded-md bg-white/10 px-2.5 py-1 text-white/90">
                  Chat
                </span>
                <span className="px-2.5 py-1 text-white/40">Canvas</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-white/40">
              <span className="hidden text-[12px] sm:inline">Radiant Agent</span>
              <Mic className="size-4" strokeWidth={1.75} />
              <Volume2 className="size-4" strokeWidth={1.75} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(193,85%,66%)] ${className}`}
    >
      {children}
    </p>
  );
}

function MatchCard({ match }: { match: (typeof MATCHES)[number] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 sm:p-4">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-medium text-white/45">{match.league}</p>
        <Bookmark className="size-3.5 text-white/25" strokeWidth={1.75} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2">
        <TeamSide name={match.home} logo={match.homeLogo} align="left" />
        <div className="text-center">
          <p className="text-[10px] text-white/40">{match.when}</p>
          <p className="mt-0.5 text-sm font-bold text-white">{match.time}</p>
        </div>
        <TeamSide name={match.away} logo={match.awayLogo} align="right" />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <OddsCell label={match.homePct} odd={match.homeOdd} />
        <OddsCell label={match.drawPct} odd={match.drawOdd} />
        <OddsCell label={match.awayPct} odd={match.awayOdd} />
      </div>
    </div>
  );
}

function TeamSide({
  name,
  logo,
  align,
}: {
  name: string;
  logo: string;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 ${
        align === "right" ? "items-end text-right" : "items-start text-left"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        alt=""
        width={36}
        height={36}
        className="size-9 object-contain"
      />
      <span className="max-w-[7rem] truncate text-[12px] font-semibold text-white">
        {name}
      </span>
    </div>
  );
}

function OddsCell({ label, odd }: { label: string; odd: string }) {
  return (
    <div className="text-center">
      <div className="rounded-lg border border-white/10 bg-black/30 px-1 py-2 text-[11px] font-semibold text-white">
        {label}
      </div>
      <p className="mt-1 text-[10px] text-white/40">{odd}</p>
    </div>
  );
}
