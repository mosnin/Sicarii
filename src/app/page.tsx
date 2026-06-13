import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { HeroSection } from "@/components/sections/hero";
import { AgentMarquee } from "@/components/sections/agent-marquee";
import { ProblemSection } from "@/components/sections/problem";
import { CapabilitiesSection } from "@/components/sections/capabilities";
import { IntelligenceSection } from "@/components/sections/intelligence";
import { HowItWorksSection } from "@/components/sections/how-it-works";
import { WhyScalarSection } from "@/components/sections/why-scalar";
import { AboutSection } from "@/components/sections/about";
import { CTASection } from "@/components/sections/cta";

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <Header />
      <main className="flex-1">
        <HeroSection />
        <AgentMarquee />
        <ProblemSection />
        <CapabilitiesSection />
        <IntelligenceSection />
        <HowItWorksSection />
        <WhyScalarSection />
        <AboutSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
