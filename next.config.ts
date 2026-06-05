import type { NextConfig } from "next";

// Clerk loads clerk-js from the Frontend API host. For a PRODUCTION instance
// that is the app's own clerk.<domain> subdomain (here clerk.tryscalar.xyz),
// NOT *.clerk.accounts.dev — so it must be whitelisted or the sign-in/sign-up
// widget renders blank. Cloudflare Turnstile (challenges.cloudflare.com) powers
// Clerk's bot protection. Both prod (*.tryscalar.xyz) and dev domains are kept.
const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.tryscalar.xyz https://*.clerk.accounts.dev https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://blogger.googleusercontent.com https://img.clerk.com https://utfs.io",
  "font-src 'self'",
  "connect-src 'self' https://*.tryscalar.xyz https://*.clerk.dev https://*.clerk.accounts.dev https://challenges.cloudflare.com https://checkout.creem.io",
  "frame-src 'self' https://*.tryscalar.xyz https://*.clerk.dev https://*.clerk.accounts.dev https://challenges.cloudflare.com",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "blogger.googleusercontent.com" },
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "utfs.io" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
