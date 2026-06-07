import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { HeroSection } from "@/components/sections/hero";
import { AgentCrowdSection } from "@/components/sections/agent-crowd";
import { ProblemSection } from "@/components/sections/problem";
import { IntelligenceSection } from "@/components/sections/intelligence";
import { StatsBand } from "@/components/sections/stats-band";
import { ServicesSection } from "@/components/sections/services";
import { ShowcaseSection } from "@/components/sections/showcase";
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
        <AgentCrowdSection />
        <ProblemSection />
        <IntelligenceSection />
        <StatsBand />
        <ServicesSection />
        <ShowcaseSection />
        <HowItWorksSection />
        <WhyScalarSection />
        <AboutSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
