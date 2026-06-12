"use client";

import { useMemo } from "react";
import { generateAvatarDataUri } from "@/lib/avatar/generate";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  seed: string;
  alt: string;
  size?: number;
  className?: string;
  rounded?: "full" | "2xl";
};

export function UserAvatar({
  seed,
  alt,
  size = 40,
  className,
  rounded = "2xl",
}: UserAvatarProps) {
  const src = useMemo(() => generateAvatarDataUri({ seed, size }), [seed, size]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- inline Dicebear data URI
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={cn(
        "shrink-0 border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] object-cover shadow-[2px_2px_0_var(--hero-ink)]",
        rounded === "full" ? "rounded-full" : "rounded-2xl",
        className,
      )}
    />
  );
}
