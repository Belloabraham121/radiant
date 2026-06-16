"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

type TryRadiantLinkProps = Omit<ComponentProps<typeof Link>, "href">;

/** Landing / marketing CTA — sends signed-in users to `/app`, others to `/auth`. */
export function TryRadiantLink({ onClick, ...props }: TryRadiantLinkProps) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const href = ready && authenticated ? "/app" : "/auth";

  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }
        if (ready && authenticated) {
          event.preventDefault();
          router.push("/app");
        }
      }}
    />
  );
}
