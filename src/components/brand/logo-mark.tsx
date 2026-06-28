import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Scalar logo: the λ mark. Blue on light backgrounds, white on dark -
 * two raster variants swapped by the active theme (class-based dark mode).
 * Size comes from `className` (set height + width, e.g. "h-7 w-7"); the images
 * are square so width and height should match.
 */
export function LogoMark({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <>
      <Image
        src="/logo-icon-light.png"
        alt="Scalar"
        width={96}
        height={96}
        priority={priority}
        className={cn("inline-block select-none object-contain dark:hidden", className)}
        draggable={false}
      />
      <Image
        src="/logo-icon-dark.png"
        alt="Scalar"
        width={96}
        height={96}
        aria-hidden
        priority={priority}
        className={cn("hidden select-none object-contain dark:inline-block", className)}
        draggable={false}
      />
    </>
  );
}
