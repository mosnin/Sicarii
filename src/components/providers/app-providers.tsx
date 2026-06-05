"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type { ReactNode } from "react";

// Token-driven element classes adapt to light/dark automatically (they resolve
// against the .dark class on <html>). The color *variables* below can't, so we
// swap them per resolved theme - otherwise the Clerk widget keeps dark text on
// the light theme (the login page bug).
const elements = {
  card: "bg-card border border-border shadow-2xl rounded-2xl",
  headerTitle: "font-brand text-foreground",
  headerSubtitle: "text-muted-foreground",
  socialButtonsBlockButton:
    "border border-border bg-transparent hover:bg-muted text-foreground rounded-full",
  socialButtonsBlockButtonText: "text-foreground",
  dividerLine: "bg-border",
  dividerText: "text-muted-foreground",
  formFieldLabel: "text-muted-foreground",
  formFieldInput: "border border-border text-foreground rounded-xl focus:border-primary",
  formButtonPrimary:
    "bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-sm normal-case font-medium",
  footerActionText: "text-muted-foreground",
  footerActionLink: "text-primary hover:text-primary/80 font-medium",
  formFieldAction: "text-primary hover:text-primary/80",
  identityPreviewEditButton: "text-primary",
  userButtonPopoverCard: "bg-card border border-border rounded-2xl",
  userButtonPopoverActionButton: "hover:bg-muted text-foreground",
  userButtonPopoverActionButtonText: "text-foreground",
  badge: "bg-primary/10 text-primary",
  avatarBox: "rounded-lg",
};

const baseVars = {
  colorPrimary: "#5AB0E8",
  colorDanger: "#DC2626",
  colorSuccess: "#16A34A",
  colorWarning: "#EAB308",
  borderRadius: "0.75rem",
  fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
  fontSize: "0.95rem",
};

const lightVars = {
  colorBackground: "#ffffff",
  colorText: "#1C1C1C",
  colorTextSecondary: "#737373",
  colorInputBackground: "#ffffff",
  colorInputText: "#1C1C1C",
  colorNeutral: "#1C1C1C",
};

const darkVars = {
  colorBackground: "#141414",
  colorText: "#F5F5F5",
  colorTextSecondary: "#A3A3A3",
  colorInputBackground: "#1C1C1C",
  colorInputText: "#F5F5F5",
  colorNeutral: "#F5F5F5",
};

function ClerkThemed({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <ClerkProvider
      appearance={{
        variables: { ...baseVars, ...(isDark ? darkVars : lightVars) },
        elements,
      }}
    >
      {children}
    </ClerkProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ClerkThemed>{children}</ClerkThemed>
    </NextThemesProvider>
  );
}
