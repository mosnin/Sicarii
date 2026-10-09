// Shared Clerk appearance so the hosted sign-in / sign-up components match
// Scalar's Twenty-aligned neutral system instead of Clerk's stock theme. Colors are
// wired to our CSS variables so the forms follow light/dark automatically; the
// surrounding card frame is supplied by the auth pages, so Clerk's own card is
// stripped to transparent. Typed via the SignIn component's own prop so we stay
// in lockstep with the installed Clerk version without a direct @clerk/types dep.
import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";

type ClerkAppearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

export const clerkAppearance: ClerkAppearance = {
  variables: {
    colorPrimary: "#3E63DD",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorBackground: "var(--card)",
    colorInputBackground: "var(--background)",
    colorInputText: "var(--foreground)",
    colorDanger: "#E5484D",
    colorSuccess: "#30A46C",
    borderRadius: "0.25rem",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
  },
  elements: {
    // min-w-0 lets the widget shrink below its intrinsic width on narrow
    // phones instead of overflowing its card and being clipped off-screen.
    rootBox: "w-full min-w-0",
    cardBox: "w-full min-w-0 shadow-none border-0",
    card: "w-full min-w-0 bg-transparent p-0 shadow-none",
    header: "mb-2",
    headerTitle: "text-xl font-semibold text-foreground",
    headerSubtitle: "text-fg-tertiary",
    socialButtonsBlockButton:
      "rounded-[4px] border border-border bg-background text-foreground transition-colors hover:bg-hover",
    socialButtonsBlockButtonText: "font-medium",
    dividerLine: "bg-border",
    dividerText: "text-muted-foreground",
    formFieldLabel: "text-foreground",
    formFieldInput: "rounded-[4px] bg-background border-border focus:border-primary",
    formButtonPrimary:
      "rounded-[4px] bg-primary text-primary-foreground font-medium normal-case shadow-none hover:bg-primary/90 hover:shadow-none",
    footer: "bg-transparent",
    footerActionText: "text-muted-foreground",
    footerActionLink: "text-primary hover:text-primary/80 font-medium",
    identityPreviewEditButton: "text-primary hover:text-primary/80",
    formResendCodeLink: "text-primary hover:text-primary/80",
    logoBox: "hidden",
  },
};
