// Shared Clerk appearance so the hosted sign-in / sign-up components match
// Scalar's baby-blue + white system instead of Clerk's stock theme. Colors are
// wired to our CSS variables so the forms follow light/dark automatically; the
// surrounding card frame is supplied by the auth pages, so Clerk's own card is
// stripped to transparent. Typed via the SignIn component's own prop so we stay
// in lockstep with the installed Clerk version without a direct @clerk/types dep.
import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";

type ClerkAppearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

export const clerkAppearance: ClerkAppearance = {
  variables: {
    colorPrimary: "#5AB0E8",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorBackground: "var(--card)",
    colorInputBackground: "var(--background)",
    colorInputText: "var(--foreground)",
    colorDanger: "#DC2626",
    colorSuccess: "#16A34A",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none border-0",
    card: "w-full bg-transparent p-0 shadow-none",
    header: "mb-2",
    headerTitle: "font-brand text-2xl text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButton:
      "border border-border bg-background/60 text-foreground transition-colors hover:bg-accent",
    socialButtonsBlockButtonText: "font-medium",
    dividerLine: "bg-border",
    dividerText: "text-muted-foreground",
    formFieldLabel: "text-foreground",
    formFieldInput: "bg-background border-border focus:border-orange",
    formButtonPrimary:
      "glow-button text-white font-semibold normal-case shadow-none hover:shadow-none",
    footer: "bg-transparent",
    footerActionText: "text-muted-foreground",
    footerActionLink: "text-orange hover:text-orange-dark font-medium",
    identityPreviewEditButton: "text-orange hover:text-orange-dark",
    formResendCodeLink: "text-orange hover:text-orange-dark",
    logoBox: "hidden",
  },
};
