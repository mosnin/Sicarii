import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { HeroSection } from "@/components/sections/hero";
import { AgentMarquee } from "@/components/sections/agent-marquee";
import { ProductDemo } from "@/components/sections/product-demo";
import { ProblemSection } from "@/components/sections/problem";
import { CapabilitiesSection } from "@/components/sections/capabilities";
import { IntelligenceSection } from "@/components/sections/intelligence";
import { AgentCircuitSection } from "@/components/sections/agent-circuit";
import { HowItWorksSection } from "@/components/sections/how-it-works";
import { CompoundingSection } from "@/components/sections/compounding";
import { WhyScalarSection } from "@/components/sections/why-scalar";
import { AboutSection } from "@/components/sections/about";
import { ManifestoRail } from "@/components/sections/manifesto-rail";
import { CTASection } from "@/components/sections/cta";

export default function Home() {
  return (
    <>
      <ScrollProgress />
      {/* Footer reveal: the page content (z-10, opaque) slides up over the
          sticky footer pinned beneath it, so the footer is uncovered rather
          than scrolled into view. Pure CSS sticky, no JS. */}
      <div className="relative">
        <div className="relative z-10 bg-background">
          <Header />
          <main className="flex-1">
            <HeroSection />
            <AgentMarquee />
            <ProductDemo />
            <ProblemSection />
            <CapabilitiesSection />
            <IntelligenceSection />
            <AgentCircuitSection />
            <HowItWorksSection />
            <CompoundingSection />
            <WhyScalarSection />
            <AboutSection />
            <ManifestoRail />
            <CTASection />
          </main>
        </div>
        <div className="sticky bottom-0 z-0">
          <Footer />
        </div>
      </div>
    </>
  );
}
