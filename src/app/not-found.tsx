import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-charcoal-dark text-white">
      <h1 className="text-8xl font-bold tracking-tight">404</h1>
      <p className="mt-4 text-xl text-muted-foreground">Page not found</p>
      <Button asChild className="mt-8" size="lg">
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
