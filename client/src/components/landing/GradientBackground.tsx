"use client";

import { GrainGradient } from "@paper-design/shaders-react";

/** Full-bleed animated grain for the top hero stage (clipped by parent). */
export function GradientBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <GrainGradient
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          minHeight: "100%",
        }}
        colorBack="hsl(0, 0%, 0%)"
        softness={0.9}
        intensity={0.7}
        noise={0.22}
        shape="blob"
        offsetX={0}
        offsetY={-0.15}
        scale={1.8}
        rotation={0}
        speed={0.9}
        colors={[
          "hsl(193, 85%, 66%)",
          "hsl(196, 100%, 83%)",
          "hsl(195, 100%, 50%)",
          "hsl(210, 90%, 45%)",
        ]}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsla(195,100%,50%,0.28),transparent_55%),radial-gradient(ellipse_at_85%_35%,hsla(193,85%,66%,0.2),transparent_45%),radial-gradient(ellipse_at_10%_70%,hsla(210,80%,40%,0.16),transparent_50%)]" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-b from-transparent to-black" />
    </div>
  );
}
