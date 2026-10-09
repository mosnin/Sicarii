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
    <div className="w-full min-w-0 overflow-hidden rounded-[8px] border border-border bg-card p-4 sm:p-6">
      <div
        className={cn(
          "transition-opacity duration-200",
          !agreed && "select-none opacity-40"
        )}
        inert={!agreed}
      >
        <SignUp
          forceRedirectUrl="/dashboard"
          signInUrl="/sign-in"
          appearance={clerkAppearance}
        />
      </div>

      <div className="mt-5">
        {!agreed && (
          <p className="mb-3 text-center text-xs text-muted-foreground">
            Agree to the terms below to create your account.
          </p>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-border bg-card p-3 text-left transition-colors hover:border-primary/30">
          <span
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
              agreed ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
            )}
          >
            {agreed && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-sm leading-relaxed text-muted-foreground">
            I agree to Scalar&apos;s{" "}
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      </div>
    </div>
  );
}
