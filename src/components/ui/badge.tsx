import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Twenty tag: a flat 4px chip, 20px tall, medium weight, tinted by meaning.
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[4px] border border-transparent px-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-[3px] focus:ring-primary/20",
  {
    variants: {
      variant: {
        default: "bg-tag-blue-bg text-tag-blue",
        secondary: "bg-tag-gray-bg text-tag-gray",
        destructive: "bg-tag-red-bg text-tag-red",
        outline: "border-border text-fg-secondary",
        success: "bg-tag-green-bg text-tag-green",
        warning: "bg-tag-orange-bg text-tag-orange",
        primary: "bg-tag-blue-bg text-tag-blue",
        // Legacy alias, kept pointing at the accent tag so older call sites
        // still render. Prefer variant="primary" in new code.
        orange: "bg-tag-blue-bg text-tag-blue",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
