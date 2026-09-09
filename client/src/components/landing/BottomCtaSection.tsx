"use client";

import { WaitlistForm } from "./WaitlistForm";

export function BottomCtaSection() {
  return (
    <section
      id="waitlist"
      className="scroll-mt-20 border-t border-white/10 bg-black px-5 py-20 sm:px-8 sm:py-28"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-(family-name:--font-instrument-serif) text-3xl leading-tight tracking-tight text-white sm:text-5xl">
          The UI of the future isn&apos;t a website. It&apos;s a conversation.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/55">
          We are bringing the entire Base ecosystem into one fluid, intent-driven
          layer. Stop interacting with Web3. Start orchestrating it.
        </p>
        <div className="mx-auto mt-10 max-w-lg">
          <WaitlistForm
            source="footer"
            submitLabel="Join Waitlist"
            compact
          />
          <p className="mt-4 text-sm text-white/40">
            Enter your email to secure early access.
          </p>
        </div>
      </div>
    </section>
  );
}
