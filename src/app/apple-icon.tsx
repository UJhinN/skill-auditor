import { ImageResponse } from "next/og";

// Home-screen icon for iPhone ("Add to Home Screen"), which cannot use the SVG favicon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#111111" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <g fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 19 L7 32 L17 45" />
            <path d="M47 19 L57 32 L47 45" />
            <path d="M21 32 Q32 18 43 32 Q32 46 21 32 Z" />
          </g>
          <circle cx="32" cy="32" r="4.5" fill="#f59e0b" />
        </svg>
      </div>
    ),
    size,
  );
}
