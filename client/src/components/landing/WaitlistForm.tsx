"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import {
  joinWaitlist,
  WaitlistError,
  type WaitlistSource,
} from "@/lib/waitlist-api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type WaitlistFormProps = {
  source: WaitlistSource;
  submitLabel: string;
  className?: string;
  compact?: boolean;
};

export function WaitlistForm({
  source,
  submitLabel,
  className = "",
  compact = false,
}: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successCopy, setSuccessCopy] = useState({
    title: "You've joined the waitlist",
    body: "We'll email you when your batch opens.",
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    setErrorMessage(null);

    try {
      const result = await joinWaitlist(email, source);
      setEmail("");
      setStatus("idle");
      setSuccessCopy(
        result.created
          ? {
              title: "You've joined the waitlist",
              body: "You're in. We'll reach out with early access and next steps.",
            }
          : {
              title: "You're already on the waitlist",
              body: "That email is already registered. We'll be in touch soon.",
            },
      );
      setSuccessOpen(true);
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof WaitlistError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    }
  }

  return (
    <div className={className}>
      <form
        onSubmit={onSubmit}
        className={
          compact
            ? "flex flex-col gap-3 sm:flex-row sm:items-stretch"
            : "flex flex-col gap-3"
        }
      >
        <label className="sr-only" htmlFor={`waitlist-email-${source}`}>
          Email address
        </label>
        <input
          id={`waitlist-email-${source}`}
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={320}
          placeholder="Enter email address"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") {
              setStatus("idle");
              setErrorMessage(null);
            }
          }}
          disabled={status === "loading"}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-4 py-3.5 text-[15px] text-white placeholder:text-white/40 outline-none backdrop-blur-sm transition-[border-color,box-shadow] focus:border-[hsl(193,85%,66%)] focus:shadow-[0_0_0_3px_hsla(193,85%,66%,0.2)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="shrink-0 rounded-xl bg-[hsl(195,100%,50%)] px-5 py-3.5 text-[15px] font-semibold text-black transition-[transform,opacity,background-color] hover:bg-[hsl(193,85%,66%)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Joining…" : submitLabel}
        </button>
      </form>

      {errorMessage ? (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {errorMessage}
        </p>
      ) : null}

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent
          className="border border-white/12 bg-[#0c0e10] p-6 text-white ring-white/10 sm:max-w-md"
          showCloseButton
        >
          <DialogHeader className="items-center text-center sm:items-center">
            <span className="mb-2 flex size-12 items-center justify-center rounded-full bg-[hsl(195,100%,50%)]/15 text-[hsl(193,85%,66%)]">
              <Check className="size-6" strokeWidth={2.5} />
            </span>
            <DialogTitle className="font-(family-name:--font-instrument-serif) text-2xl font-normal tracking-tight text-white">
              {successCopy.title}
            </DialogTitle>
            <DialogDescription className="text-center text-[15px] text-white/55">
              {successCopy.body}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 sm:justify-center">
            <Button
              type="button"
              className="w-full rounded-xl bg-[hsl(195,100%,50%)] text-black hover:bg-[hsl(193,85%,66%)] sm:w-auto"
              onClick={() => setSuccessOpen(false)}
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
