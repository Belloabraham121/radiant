import { Hero } from "@/components/hero/Hero";
import { WhatIsItSection } from "@/components/landing/WhatIsItSection";
import { CanvasShowcaseSection } from "@/components/landing/CanvasShowcaseSection";
import { DeFiRailSection } from "@/components/landing/DeFiRailSection";
import { PillarsSection } from "@/components/landing/PillarsSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { ExplorerSection } from "@/components/landing/ExplorerSection";
import { FooterSection } from "@/components/landing/FooterSection";

export default function Home() {
  return (
    <>
      <Hero />
      <WhatIsItSection />
      <CanvasShowcaseSection />
      <DeFiRailSection />
      <PillarsSection />
      <HowItWorksSection />
      <ExplorerSection />
      <FooterSection />
    </>
  );
}
