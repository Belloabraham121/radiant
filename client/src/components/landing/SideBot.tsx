/**
 * SideBot — Radiant's mascot as a puppeteerable rig with TWO views:
 * a side profile (for running/walking) and a front-facing profile
 * (for idling, looking at you, and being picked up).
 *
 * Pure presentational: every articulated part carries a data attribute
 * (or a `sidebot-*` class for the CSS run cycle) so GSAP can drive it.
 * By default the FRONT view is visible (nice static fallback); choreography
 * swaps views via autoAlpha on [data-bot-view-*].
 *
 * Rig map:
 *   [data-bot-wrap]        outer wrapper   → x/y position (also the Draggable target)
 *   [data-bot-figure]      the svg         → jumps, flips, squash & stretch
 *   [data-bot-view-side]   side-profile rig
 *   [data-bot-view-front]  front-facing rig
 *   [data-bot-inner]       side rig body   → scaleX -1 to face left
 *   [data-bot-eye]         side eye        → scaleY blink
 *   [data-bot-pupil]       side pupil      → x/y glance
 *   [data-bot-leg-f/b]     side legs       → rotation to sit
 *   [data-bot-eye-f]       front eyes      → scaleY blink
 *   [data-bot-pupil-f]     front pupils ×2 → x/y follow the mouse
 *   [data-bot-fleg]        front legs ×2   → dangle while carried
 *   [data-bot-farm]        front arms ×2   → dangle while carried
 *   [data-bot-shadow]      ground shadow   → shrinks while airborne
 */
export function SideBot({
  size = 110,
  color = "var(--hero-amber)",
  antenna = "var(--hero-coral)",
  className = "",
}: {
  size?: number;
  color?: string;
  antenna?: string;
  className?: string;
}) {
  return (
    <div
      data-bot-wrap
      className={`relative ${className}`}
      style={{ width: size, height: size * (130 / 120), touchAction: "none" }}
      aria-hidden
    >
      {/* speed lines (visible only while running) */}
      <div className="sidebot-lines absolute right-full top-1/3 mr-1 flex flex-col gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="buddy-speed-line block h-[3px] rounded-full bg-[var(--hero-ink)]/35"
            style={{ width: size * 0.3, animationDelay: `${i * 0.14}s` }}
          />
        ))}
      </div>

      <svg
        data-bot-figure
        className="sidebot-figure relative z-10"
        width={size}
        height={size * (130 / 120)}
        viewBox="0 0 120 130"
        fill="none"
      >
        {/* ============ SIDE PROFILE (hidden by default) ============ */}
        <g data-bot-view-side className="invisible opacity-0">
          <g data-bot-inner>
            {/* legs (behind body) */}
            <rect
              data-bot-leg-b
              className="sidebot-leg-b"
              x="48"
              y="92"
              width="10"
              height="34"
              rx="5"
              fill="var(--hero-ink)"
            />
            <rect
              data-bot-leg-f
              className="sidebot-leg-f"
              x="66"
              y="92"
              width="10"
              height="34"
              rx="5"
              fill="var(--hero-ink)"
            />

            {/* torso */}
            <rect
              x="34"
              y="60"
              width="52"
              height="40"
              rx="15"
              fill={color}
              stroke="var(--hero-ink)"
              strokeWidth="3"
            />
            <circle cx="68" cy="80" r="6" fill="#fffdf7" stroke="var(--hero-ink)" strokeWidth="2.5" />

            {/* arm (in front of torso) */}
            <rect
              data-bot-arm
              className="sidebot-arm"
              x="42"
              y="66"
              width="10"
              height="28"
              rx="5"
              fill="var(--hero-ink)"
            />

            {/* back ear */}
            <rect x="21" y="30" width="9" height="16" rx="4.5" fill="var(--hero-ink)" />

            {/* antenna */}
            <line
              x1="58"
              y1="13"
              x2="58"
              y2="7"
              stroke="var(--hero-ink)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle
              cx="58"
              cy="5"
              r="4.5"
              fill={antenna}
              stroke="var(--hero-ink)"
              strokeWidth="2"
              className="hero-wiggle"
            />

            {/* head */}
            <rect
              x="28"
              y="12"
              width="66"
              height="50"
              rx="18"
              fill={color}
              stroke="var(--hero-ink)"
              strokeWidth="3"
            />

            {/* eye */}
            <g data-bot-eye>
              <circle cx="76" cy="37" r="11.5" fill="#fffdf7" stroke="var(--hero-ink)" strokeWidth="3" />
              <g data-bot-pupil>
                <circle cx="79" cy="37" r="4.6" fill="var(--hero-ink)" />
                <circle cx="80.5" cy="34.8" r="1.6" fill="#fffdf7" />
              </g>
            </g>

            {/* cheek + mouth */}
            <ellipse cx="63" cy="50" rx="5" ry="3.4" fill="var(--hero-coral)" opacity="0.55" />
            <path
              d="M76 54 Q82 57.5 88 53"
              stroke="var(--hero-ink)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </g>

        {/* ============ FRONT PROFILE (default) ============ */}
        <g data-bot-view-front>
          {/* legs */}
          <rect data-bot-fleg x="44" y="92" width="10" height="34" rx="5" fill="var(--hero-ink)" />
          <rect data-bot-fleg x="66" y="92" width="10" height="34" rx="5" fill="var(--hero-ink)" />

          {/* arms */}
          <rect data-bot-farm x="20" y="64" width="10" height="28" rx="5" fill="var(--hero-ink)" />
          <rect data-bot-farm x="90" y="64" width="10" height="28" rx="5" fill="var(--hero-ink)" />

          {/* torso */}
          <rect
            x="30"
            y="60"
            width="60"
            height="40"
            rx="15"
            fill={color}
            stroke="var(--hero-ink)"
            strokeWidth="3"
          />
          <circle cx="60" cy="80" r="6" fill="#fffdf7" stroke="var(--hero-ink)" strokeWidth="2.5" />

          {/* ears */}
          <rect x="14" y="30" width="9" height="16" rx="4.5" fill="var(--hero-ink)" />
          <rect x="97" y="30" width="9" height="16" rx="4.5" fill="var(--hero-ink)" />

          {/* antenna */}
          <line
            x1="60"
            y1="13"
            x2="60"
            y2="7"
            stroke="var(--hero-ink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle
            cx="60"
            cy="5"
            r="4.5"
            fill={antenna}
            stroke="var(--hero-ink)"
            strokeWidth="2"
            className="hero-wiggle"
          />

          {/* head */}
          <rect
            x="22"
            y="12"
            width="76"
            height="50"
            rx="18"
            fill={color}
            stroke="var(--hero-ink)"
            strokeWidth="3"
          />

          {/* eyes */}
          <g data-bot-eye-f>
            <circle cx="45" cy="37" r="10.5" fill="#fffdf7" stroke="var(--hero-ink)" strokeWidth="3" />
            <g data-bot-pupil-f>
              <circle cx="45" cy="37" r="4.2" fill="var(--hero-ink)" />
              <circle cx="46.5" cy="34.8" r="1.5" fill="#fffdf7" />
            </g>
            <circle cx="75" cy="37" r="10.5" fill="#fffdf7" stroke="var(--hero-ink)" strokeWidth="3" />
            <g data-bot-pupil-f>
              <circle cx="75" cy="37" r="4.2" fill="var(--hero-ink)" />
              <circle cx="76.5" cy="34.8" r="1.5" fill="#fffdf7" />
            </g>
          </g>

          {/* cheeks + mouth */}
          <ellipse cx="34" cy="52" rx="5" ry="3.4" fill="var(--hero-coral)" opacity="0.55" />
          <ellipse cx="86" cy="52" rx="5" ry="3.4" fill="var(--hero-coral)" opacity="0.55" />
          <path
            d="M52 53 Q60 60 68 53"
            stroke="var(--hero-ink)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </svg>

      {/* ground shadow */}
      <div
        data-bot-shadow
        className="absolute -bottom-1.5 left-1/2 h-3 w-4/5 -translate-x-1/2 rounded-[50%] bg-[var(--hero-ink)]/20 blur-[2px]"
      />
    </div>
  );
}
