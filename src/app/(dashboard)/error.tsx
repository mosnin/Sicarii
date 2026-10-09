"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <section className="w-full max-w-md rounded-[8px] border border-border bg-background">
        <header className="flex h-10 items-center border-b border-border px-3">
          <h1 className="text-sm font-medium text-foreground">
            Something went wrong
          </h1>
        </header>
        <div className="space-y-4 p-3">
          <p className="text-sm text-fg-tertiary">
            An unexpected error occurred. Please try again or return to the
            dashboard.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
            <Button onClick={reset} variant="default" size="sm">
              Try again
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
