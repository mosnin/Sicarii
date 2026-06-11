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
  // Allow any https image so scraped company logos / contact photos can render.
  "img-src 'self' data: blob: https:",
  // Manifesto page video is hosted on Cloudinary.
  "media-src 'self' https://res.cloudinary.com",
  "font-src 'self'",
  "connect-src 'self' https://*.tryscalar.xyz https://*.clerk.dev https://*.clerk.accounts.dev https://challenges.cloudflare.com https://checkout.creem.io",
  // demo.arcade.software hosts the homepage hero product demo embed.
  "frame-src 'self' https://*.tryscalar.xyz https://*.clerk.dev https://*.clerk.accounts.dev https://challenges.cloudflare.com https://demo.arcade.software",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "blogger.googleusercontent.com" },
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "utfs.io" },
    ],
  },
  // Standard discovery paths -> our metadata handlers (RFC 8414 / RFC 9728).
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/metadata/authorization-server" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/metadata/authorization-server" },
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/metadata/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/metadata/protected-resource" },
    ];
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
          // Modern guidance is to disable the legacy XSS auditor (it could
          // introduce vulnerabilities); rely on CSP instead.
          { key: "X-XSS-Protection", value: "0" },
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
