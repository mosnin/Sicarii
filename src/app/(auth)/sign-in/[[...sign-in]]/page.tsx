import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-[8px] border border-border bg-card p-4 sm:p-6">
      <SignIn
        forceRedirectUrl="/dashboard"
        signUpUrl="/sign-up"
        appearance={clerkAppearance}
      />
    </div>
  );
}
