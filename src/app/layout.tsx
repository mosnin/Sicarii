import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/providers/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sicarii | The CRM Your Agents Run",
  description:
    "A CRM operated by AI agents — they discover leads, enrich your database, run the conversations, and own the data. You direct; the agents operate.",
  metadataBase: new URL("https://sicarii.app"),
  openGraph: {
    title: "Sicarii | The CRM Your Agents Run",
    description:
      "A CRM operated by AI agents — discover, enrich, and own every relationship, all on data that stays inside.",
    url: "https://sicarii.app",
    siteName: "Sicarii",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#1E4D2B",
          colorBackground: "#141414",
          colorText: "#F5F5F5",
          colorInputBackground: "#1C1C1C",
          colorInputText: "#F5F5F5",
        },
      }}
    >
      <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
        <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
