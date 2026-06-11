"use client";

import { Loader2, LogOut } from "lucide-react";
import { useAuthLogout } from "./useAuthLogout";

type LogoutButtonProps = {
  variant?: "icon" | "full";
  className?: string;
};

export function LogoutButton({ variant = "icon", className }: LogoutButtonProps) {
  const { logout, loggingOut } = useAuthLogout();

  if (variant === "full") {
    return (
      <button
        type="button"
        disabled={loggingOut}
        onClick={() => void logout()}
        className={
          className ??
          "flex w-full items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-white py-3 text-sm font-bold shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {loggingOut ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <LogOut className="size-4" strokeWidth={2.5} />
        )}
        {loggingOut ? "Signing out…" : "Log out"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={loggingOut}
      onClick={() => void logout()}
      aria-label={loggingOut ? "Signing out" : "Log out"}
      className={
        className ??
        "flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {loggingOut ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" strokeWidth={2.5} />
      )}
    </button>
  );
}
