import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Twenty button: 4px radius, 13px medium label, hairline border, quick
  // background-only transitions, a soft blue focus halo.
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] border border-transparent text-sm font-medium transition-[background-color,border-color,color] duration-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20 focus-visible:border-primary disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        // Accent (blue) - the one primary action on a surface.
        default:
          "bg-primary text-primary-foreground border-[color-mix(in_oklab,var(--primary)_82%,black)] hover:bg-[color-mix(in_oklab,var(--primary)_90%,black)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Twenty "secondary": the everyday bordered button.
        outline:
          "border-border bg-background text-fg-secondary hover:bg-hover hover:text-foreground",
        // Gray fill.
        secondary:
          "bg-surface-2 text-foreground hover:bg-surface-3",
        // Twenty "tertiary": text-only until hover.
        ghost: "text-fg-secondary hover:bg-hover hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        glow: "glow-button text-white",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2 text-sm",
        md: "h-8 px-3 text-sm",
        lg: "h-9 px-4 text-sm",
        xl: "h-10 px-5 text-base",
        icon: "h-8 w-8",
        "icon-xs": "h-6 w-6",
        "icon-sm": "h-7 w-7",
        "icon-md": "h-8 w-8",
      },
      // Press feedback used by composed registry components (sidebar,
      // editable). Off by default so existing buttons are unchanged.
      clickEffect: {
        true: "active:bg-pressed",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      clickEffect: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
