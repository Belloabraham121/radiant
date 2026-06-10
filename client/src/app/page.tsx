import { Hero } from "@/components/hero/Hero";
import { ShowcaseSection } from "@/components/landing/ShowcaseSection";
import { PillarsSection } from "@/components/landing/PillarsSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { ExplorerSection } from "@/components/landing/ExplorerSection";
import { FooterSection } from "@/components/landing/FooterSection";

export default function Home() {
  return (
    <>
      <Hero />
      <ShowcaseSection />
      <PillarsSection />
      <HowItWorksSection />
      <ExplorerSection />
      <FooterSection />
    </>
  );
}
