"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

type RunningBuddyProps = {
  size?: number;
  color?: string;
  antenna?: string;
  className?: string;
  /** flip so it runs to the left */
  facing?: "right" | "left";
};

/**
 * The mascot at full sprint: little legs pumping, body bobbing, speed lines
 * trailing behind. Pure CSS run cycle (see `buddy-*` keyframes in
 * globals.css) so it just runs forever; honors reduced motion via CSS.
 */
export function RunningBuddy({
  size = 84,
  color = "var(--hero-amber)",
  antenna = "var(--hero-coral)",
  className = "",
  facing = "right",
}: RunningBuddyProps) {
  const legW = Math.max(6, size * 0.09);
  const legH = Math.max(14, size * 0.22);
  return (
    <div
      className={`relative inline-flex flex-col items-center ${className}`}
      style={{ transform: facing === "left" ? "scaleX(-1)" : undefined }}
      aria-hidden
    >
      {/* speed lines */}
      <div
        className="absolute top-1/3 flex flex-col gap-1.5"
        style={{ left: -size * 0.34 }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="buddy-speed-line block h-[3px] rounded-full bg-[var(--hero-ink)]/35"
            style={{ width: size * 0.26, animationDelay: `${i * 0.14}s` }}
          />
        ))}
      </div>
      <div className="buddy-run-bob">
        <RadiantBuddy size={size} color={color} antenna={antenna} eyeRange={3.5} />
      </div>
      {/* legs */}
      <div className="-mt-2 flex gap-2" style={{ height: legH }}>
        <span
          className="buddy-leg block rounded-full bg-[var(--hero-ink)]"
          style={{ width: legW, height: legH }}
        />
        <span
          className="buddy-leg buddy-leg-b block rounded-full bg-[var(--hero-ink)]"
          style={{ width: legW, height: legH }}
        />
      </div>
    </div>
  );
}

type RadiantBuddyProps = {
  /** rendered width in px (height matches — square viewBox) */
  size?: number;
  /** face fill color */
  color?: string;
  /** antenna tip color */
  antenna?: string;
  className?: string;
  /** how far pupils can travel from center, in viewBox units */
  eyeRange?: number;
};

/**
 * Radiant's mascot: a little agent head whose eyes (and head) follow the
 * cursor. On touch devices the eyes wander on their own so it still feels
 * alive. Blinks at random. Squashes when poked. Honors reduced motion.
 */
export function RadiantBuddy({
  size = 120,
  color = "var(--hero-amber)",
  antenna = "var(--hero-coral)",
  className = "",
  eyeRange = 4.5,
}: RadiantBuddyProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const leftPupilRef = useRef<SVGGElement>(null);
  const rightPupilRef = useRef<SVGGElement>(null);
  const leftEyeRef = useRef<SVGGElement>(null);
  const rightEyeRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const head = headRef.current;
    const pupils = [leftPupilRef.current, rightPupilRef.current];
    const eyes = [leftEyeRef.current, rightEyeRef.current];
    if (!svg || !head || pupils.some((p) => !p) || eyes.some((e) => !e)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      // ---- blinking (random cadence) ----
      let blinkCall: gsap.core.Tween | null = null;
      const blink = () => {
        gsap.to(eyes, {
          scaleY: 0.08,
          duration: 0.07,
          transformOrigin: "center center",
          yoyo: true,
          repeat: 1,
          ease: "power2.inOut",
        });
        blinkCall = gsap.delayedCall(gsap.utils.random(2.2, 5.2), blink);
      };
      blinkCall = gsap.delayedCall(gsap.utils.random(1, 3), blink);

      // ---- eye + head tracking ----
      const pupilXs = pupils.map((p) => gsap.quickTo(p, "x", { duration: 0.3, ease: "power3" }));
      const pupilYs = pupils.map((p) => gsap.quickTo(p, "y", { duration: 0.3, ease: "power3" }));
      const headRot = gsap.quickTo(head, "rotation", { duration: 0.6, ease: "power3" });
      const headX = gsap.quickTo(head, "x", { duration: 0.6, ease: "power3" });
      const headY = gsap.quickTo(head, "y", { duration: 0.6, ease: "power3" });
      gsap.set(head, { svgOrigin: "60 66" });

      const finePointer = window.matchMedia("(pointer: fine)").matches;
      let onMove: ((e: PointerEvent) => void) | null = null;
      let wander: ReturnType<typeof setInterval> | null = null;

      const lookAt = (nx: number, ny: number) => {
        // nx/ny in [-1, 1]
        pupilXs.forEach((fn) => fn(nx * eyeRange));
        pupilYs.forEach((fn) => fn(ny * eyeRange));
        headRot(nx * 7);
        headX(nx * 3.5);
        headY(ny * 2.5);
      };

      if (finePointer) {
        onMove = (e: PointerEvent) => {
          const r = svg.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          // fall off with distance so far-away movement barely registers
          const nx = gsap.utils.clamp(-1, 1, (e.clientX - cx) / (window.innerWidth / 2.2));
          const ny = gsap.utils.clamp(-1, 1, (e.clientY - cy) / (window.innerHeight / 2.2));
          lookAt(nx, ny);
        };
        window.addEventListener("pointermove", onMove, { passive: true });
      } else {
        // no mouse: let the eyes wander on their own
        wander = setInterval(() => {
          lookAt(gsap.utils.random(-0.8, 0.8), gsap.utils.random(-0.6, 0.6));
        }, 1600);
      }

      // ---- poke: squash & bounce ----
      const onPoke = () => {
        gsap.fromTo(
          head,
          { scaleY: 0.82, scaleX: 1.12 },
          { scaleY: 1, scaleX: 1, duration: 0.55, ease: "elastic.out(1.1, 0.4)" },
        );
      };
      svg.addEventListener("pointerdown", onPoke);

      return () => {
        blinkCall?.kill();
        if (onMove) window.removeEventListener("pointermove", onMove);
        if (wander) clearInterval(wander);
        svg.removeEventListener("pointerdown", onPoke);
      };
    }, svg);

    return () => ctx.revert();
  }, [eyeRange]);

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden
      className={`select-none ${className}`}
      style={{ cursor: "pointer", touchAction: "manipulation" }}
    >
      <g ref={headRef}>
        {/* antenna */}
        <line x1="60" y1="30" x2="60" y2="14" stroke="var(--hero-ink)" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M60 2l2.6 6.4L69 11l-6.4 2.6L60 20l-2.6-6.4L51 11l6.4-2.6z"
          fill={antenna}
          stroke="var(--hero-ink)"
          strokeWidth="2"
          strokeLinejoin="round"
          className="hero-wiggle"
        />
        {/* head */}
        <rect
          x="16"
          y="30"
          width="88"
          height="74"
          rx="26"
          fill={color}
          stroke="var(--hero-ink)"
          strokeWidth="3"
        />
        {/* little side ears */}
        <rect x="8" y="58" width="10" height="18" rx="5" fill="var(--hero-ink)" />
        <rect x="102" y="58" width="10" height="18" rx="5" fill="var(--hero-ink)" />

        {/* eyes */}
        <g ref={leftEyeRef}>
          <circle cx="44" cy="62" r="13" fill="#fffdf7" stroke="var(--hero-ink)" strokeWidth="3" />
          <g ref={leftPupilRef}>
            <circle cx="44" cy="62" r="5.5" fill="var(--hero-ink)" />
            <circle cx="46" cy="59.6" r="1.8" fill="#fffdf7" />
          </g>
        </g>
        <g ref={rightEyeRef}>
          <circle cx="76" cy="62" r="13" fill="#fffdf7" stroke="var(--hero-ink)" strokeWidth="3" />
          <g ref={rightPupilRef}>
            <circle cx="76" cy="62" r="5.5" fill="var(--hero-ink)" />
            <circle cx="78" cy="59.6" r="1.8" fill="#fffdf7" />
          </g>
        </g>

        {/* cheeks */}
        <ellipse cx="30" cy="80" rx="5.5" ry="3.6" fill="var(--hero-coral)" opacity="0.55" />
        <ellipse cx="90" cy="80" rx="5.5" ry="3.6" fill="var(--hero-coral)" opacity="0.55" />

        {/* mouth */}
        <path
          d="M51 84 Q60 93 69 84"
          stroke="var(--hero-ink)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
