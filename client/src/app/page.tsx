import { AgentEconomySection } from "@/components/landing/AgentEconomySection";
import { BottomCtaSection } from "@/components/landing/BottomCtaSection";
import { EcosystemStrip } from "@/components/landing/EcosystemStrip";
import { GradientBackground } from "@/components/landing/GradientBackground";
import { HeroCanvasMock } from "@/components/landing/HeroCanvasMock";
import { HeroWaitlist } from "@/components/landing/HeroWaitlist";
import { HowItWorksWaitlist } from "@/components/landing/HowItWorksWaitlist";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { ProblemSolutionSection } from "@/components/landing/ProblemSolutionSection";

export default function Home() {
  return (
    <div
      id="top"
      className="landing-waitlist min-h-full bg-black text-white antialiased"
    >
      {/*
        Glow stage ends mid-chat: padding reserves the upper half of the mock,
        then the mock pulls up with negative margin so half sits in glow / half on black.
      */}
      <div className="relative isolate">
        <div className="relative overflow-hidden pb-[min(42vw,22rem)] sm:pb-[min(36vw,26rem)]">
          <GradientBackground />
          <LandingNav />
          <HeroWaitlist />
        </div>
        <div className="relative z-10 -mt-[min(42vw,22rem)] px-5 sm:-mt-[min(36vw,26rem)] sm:px-8">
          <HeroCanvasMock />
        </div>
      </div>

      <main>
        <EcosystemStrip />
        <ProblemSolutionSection />
        <HowItWorksWaitlist />
        <AgentEconomySection />
        <BottomCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
