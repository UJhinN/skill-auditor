import { ImageResponse } from "next/og";

// The picture shown when a link to the site is shared (LINE, Messenger, Slack…).
// English only: the built-in font has no Thai glyphs, and loading one would mean a font fetch.
export const alt = "Skill Auditor: see what an AI agent skill does before you install it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "radial-gradient(900px 400px at 50% -80px, rgba(245,158,11,0.28), #0b0b0b 70%)",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <svg width="120" height="120" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill="#1a1a1a" />
            <g fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 19 L7 32 L17 45" />
              <path d="M47 19 L57 32 L47 45" />
              <path d="M21 32 Q32 18 43 32 Q32 46 21 32 Z" />
            </g>
            <circle cx="32" cy="32" r="4.5" fill="#f59e0b" />
          </svg>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: "-2px" }}>Skill Auditor</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 44, lineHeight: 1.25, maxWidth: 980 }}>
          See what an AI agent skill does before you install it.
        </div>
        <div style={{ marginTop: 28, fontSize: 28, color: "#a3a3a3", display: "flex", gap: 24 }}>
          <span>Hidden text</span>
          <span style={{ color: "#f59e0b" }}>·</span>
          <span>Risky commands</span>
          <span style={{ color: "#f59e0b" }}>·</span>
          <span>What it uses</span>
          <span style={{ color: "#f59e0b" }}>·</span>
          <span>Read-only</span>
        </div>
      </div>
    ),
    size,
  );
}
