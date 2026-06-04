import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="flex-1 pt-16">
        <section className="relative py-24 sm:py-28 overflow-hidden">
          <div className="absolute inset-0 bg-charcoal-dark" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30, 77, 43,0.08),transparent_50%)]" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
            <Badge variant="orange" className="mb-4">Legal</Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Privacy Policy</h1>
            <p className="mt-4 text-muted-foreground">Last updated: March 2026</p>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 prose prose-invert prose-sm">
            <div className="space-y-8 text-muted-foreground text-sm leading-relaxed">
              <div>
                <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
                <p>We collect information you provide directly, including your name, email address, business information, and project details submitted through our onboarding forms. We also collect usage data through cookies and analytics to improve our service.</p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-foreground">2. How We Use Your Information</h2>
                <p>Your information is used to provide our services, communicate about your projects, process payments, send relevant updates, and improve our platform. We do not sell your personal information to third parties.</p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-foreground">3. Authentication & Data Security</h2>
                <p>We use Clerk for authentication, which handles your login credentials securely. Payment processing is handled by Creem.io with industry-standard encryption. Your project files are stored securely and are only accessible to you and authorized team members.</p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-foreground">4. Data Storage</h2>
                <p>Your data is stored on secure servers provided by Neon (PostgreSQL) and Vercel. We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your data at any time.</p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-foreground">5. Third-Party Services</h2>
                <p>We use third-party services including Clerk (authentication), Creem.io (payments), Neon (database), Vercel (hosting), and Uploadthing (file uploads). Each service has its own privacy policy governing their use of your data.</p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-foreground">6. Your Rights</h2>
                <p>You have the right to access, correct, or delete your personal data. You may also request a copy of your data or opt out of non-essential communications. Contact us at hello@scalar.agency for any privacy-related requests.</p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
                <p>For questions about this privacy policy, contact us at hello@scalar.agency.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
