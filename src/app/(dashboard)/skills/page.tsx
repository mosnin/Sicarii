import { FloatIn } from "@/components/ui/float-in";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { SkillsBrowser } from "@/components/dashboard/skills-browser";
import { SKILLS } from "@/lib/skills";

// This page lives under the authenticated dashboard layout, which is
// force-dynamic and reads Clerk auth (getDbUser). Forcing this page static made
// Next try to prerender it outside the Clerk request context, so a direct load
// 500'd with "auth() was called but Clerk cannot detect clerkMiddleware()".
// Match the rest of the dashboard: render dynamically.
export const dynamic = "force-dynamic";

export default function SkillsPage() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <FloatIn delay={0}>
        <div className="relative overflow-hidden rounded-[8px] border border-border bg-card">
          <AsciiField className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12] dark:opacity-30" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(90,176,232,0.10),transparent_60%)]" />
          <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-8">
            <p className="text-xs font-medium text-primary/80">Scalar // Skills</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Skills</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Ready-made playbooks for operating Scalar. Copy one into your agent or
              download it as a `.md` file, drop it into your skills folder, and your
              agent knows exactly how to discover, enrich, and run the CRM.
            </p>
          </div>
        </div>
      </FloatIn>

      <FloatIn delay={0.04}>
        <SkillsBrowser skills={SKILLS} />
      </FloatIn>
    </div>
  );
}
