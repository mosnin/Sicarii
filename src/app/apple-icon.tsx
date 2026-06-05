import { ImageResponse } from "next/og";

// iOS add-to-home-screen icon — rasterized to PNG at build (no native deps).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#5AB0E8",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <rect x="30.4" y="18" width="3.2" height="32" rx="1.6" fill="#FFFFFF" />
          <path d="M32 12 L41 25 H23 L32 12 Z" fill="#FFFFFF" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
