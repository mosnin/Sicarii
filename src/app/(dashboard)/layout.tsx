import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { DashboardNav } from "@/components/dashboard/nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-charcoal-dark dark:bg-charcoal-dark">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Image
                src="/logo.svg"
                alt="Sicarii"
                width={32}
                height={32}
                className="rounded-md"
              />
              <span className="font-bold hidden sm:inline">Sicarii</span>
            </Link>
            <DashboardNav />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
