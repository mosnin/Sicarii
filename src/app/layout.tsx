import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scalar | The CRM Your Agents Run",
  description:
    "A CRM operated by AI agents — they discover leads, enrich your database, run the conversations, and own the data. You direct; the agents operate.",
  metadataBase: new URL("https://scalar.app"),
  openGraph: {
    title: "Scalar | The CRM Your Agents Run",
    description:
      "A CRM operated by AI agents — discover, enrich, and own every relationship, all on data that stays inside.",
    url: "https://scalar.app",
    siteName: "Scalar",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
