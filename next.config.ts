import type { NextConfig } from "next";

const cspHeader = [
  "default-src 'self'",
  // unsafe-eval is required by Next.js 16 (hot module replacement in dev; some
  // bundler output in prod). unsafe-inline is required by styled-jsx.
  // A nonce-based policy would remove both but needs middleware-level nonce
  // injection - tracked as a future hardening task.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "worker-src 'self' blob:",
  // Google Fonts (Bitcount Grid Single brand font loaded via globals.css @import).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Allow any https image so scraped company logos / contact photos can render.
  "img-src 'self' data: blob: https:",
  // Manifesto page video is hosted on Cloudinary.
  "media-src 'self' https://res.cloudinary.com",
  // Google Fonts gstatic serves the actual font files.
  "font-src 'self' https://fonts.gstatic.com",
  // UploadThing for file uploads; Stripe JS for payment elements.
  "connect-src 'self' https://*.convex.cloud https://*.convex.site wss://*.convex.cloud https://uploadthing.com https://utfs.io https://api.stripe.com",
  // demo.arcade.software hosts the homepage hero product demo embed.
  "frame-src 'self' https://demo.arcade.software https://js.stripe.com",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "blogger.googleusercontent.com" },
      { protocol: "https", hostname: "utfs.io" },
    ],
  },
  // Standard discovery paths -> our metadata handlers (RFC 8414 / RFC 9728).
  // They describe the authorization server under /oauth/* (see docs/OAUTH.md).
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server", destination: "/oauth/metadata/authorization-server" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/oauth/metadata/authorization-server" },
      { source: "/.well-known/oauth-protected-resource", destination: "/oauth/metadata/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/oauth/metadata/protected-resource" },
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
