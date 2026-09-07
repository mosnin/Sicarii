"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";

function safeRedirect(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function ConvexAuthForm({ disabled = false }: { disabled?: boolean }) {
  const { signIn } = useAuthActions();
  const params = useSearchParams();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function begin(provider: "google" | "github") {
    setPending(provider);
    setError(null);
    try {
      await signIn(provider, { redirectTo: safeRedirect(params.get("redirectTo")) });
    } catch {
      setError("Sign in could not start. Please try again.");
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-brand text-2xl font-bold text-foreground">Continue to Scalar</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use a verified account. Scalar never receives your provider password.
        </p>
      </div>
      <button
        type="button"
        disabled={disabled || pending !== null}
        onClick={() => begin("google")}
        className="flex h-11 w-full items-center justify-center rounded-full border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending === "google" ? "Opening Google..." : "Continue with Google"}
      </button>
      <button
        type="button"
        disabled={disabled || pending !== null}
        onClick={() => begin("github")}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending === "github" ? "Opening GitHub..." : "Continue with GitHub"}
      </button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
