import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <div className="rounded-3xl border border-border bg-card/80 p-6 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-8 dark:shadow-black/40">
      <SignIn
        forceRedirectUrl="/dashboard"
        signUpUrl="/sign-up"
        appearance={clerkAppearance}
      />
    </div>
  );
}
