import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Variant form of the input so composed fields (clipboard, number input,
// combobox) can reuse the exact same skin. `default` matches the original
// single-class input pixel for pixel.
const inputVariants = cva(
  "flex w-full rounded-[4px] border border-input bg-background text-sm text-foreground transition-[border-color,box-shadow] duration-100 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-fg-light hover:border-border-strong focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "h-7 px-2 py-1 text-sm",
        default: "h-8 px-2.5 py-1",
        md: "h-8 px-2.5 py-1",
        lg: "h-9 px-3 py-1.5 text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input, inputVariants };
