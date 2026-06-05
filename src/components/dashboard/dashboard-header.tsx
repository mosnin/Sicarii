import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// Minimal, backgroundless top strip. Navigation lives in the dock; up here we
// keep only the wordmark and round utility controls, floating over the page.
export function DashboardHeader() {
  return (
    <div className="sticky top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-5">
      <header className="mx-auto max-w-7xl">
        <div className="flex h-12 items-center justify-between gap-2">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Scalar"
              width={28}
              height={28}
              className="rounded-full"
            />
            <span className="font-brand text-base font-bold text-foreground hidden sm:inline">
              Scalar
            </span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <UserButton />
          </div>
        </div>
      </header>
    </div>
  );
}
