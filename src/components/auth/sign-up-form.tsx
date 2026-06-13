"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { cn } from "@/lib/utils";

/**
 * Sign-up with a real consent gate. The Clerk form stays disabled (dimmed,
 * non-interactive) until the user checks the box agreeing to the Terms and
 * Privacy Policy, so agreement is enforced in the UI rather than implied by a
 * line of fine print. The box and the form share one card frame.
 */
export function SignUpForm() {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-3xl border border-border bg-card/80 p-4 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-8 dark:shadow-black/40">
      <div
        className={cn(
          "transition-all duration-300",
          !agreed && "select-none opacity-40 blur-[1.5px]"
        )}
        inert={!agreed}
      >
        <SignUp
          forceRedirectUrl="/dashboard"
          signInUrl="/sign-in"
          appearance={clerkAppearance}
        />
      </div>

      <div className="mt-6">
        {!agreed && (
          <p className="mb-4 text-center text-xs text-muted-foreground">
            Agree to the terms below to create your account.
          </p>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background/50 p-4 text-left transition-colors hover:border-orange/40">
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
              agreed ? "border-orange bg-orange text-white" : "border-border bg-background"
            )}
          >
            {agreed && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-sm leading-relaxed text-muted-foreground">
            I agree to Scalar&apos;s{" "}
            <Link href="/terms" className="text-orange hover:text-orange-dark">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-orange hover:text-orange-dark">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      </div>
    </div>
  );
}
