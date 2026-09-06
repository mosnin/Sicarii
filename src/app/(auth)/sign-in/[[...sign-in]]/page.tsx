import { Suspense } from "react";
import { ConvexAuthForm } from "@/components/auth/convex-auth-form";

export default function SignInPage() {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-3xl border border-border bg-card/80 p-4 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-8 dark:shadow-black/40">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading secure sign in...</p>}>
        <ConvexAuthForm />
      </Suspense>
    </div>
  );
}
