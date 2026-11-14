import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-sans",
  subsets: ["latin", "thai"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description = "ดูว่า AI agent skill บน GitHub ทำอะไร ใช้อะไรบ้าง และมีข้อความซ่อนหรือคำสั่งเสี่ยงไหม ก่อนติดตั้ง";

export const metadata: Metadata = {
  // lets the generated share image use a full URL
  metadataBase: new URL("https://skill-auditor-phi.vercel.app"),
  title: "Skill Auditor",
  description,
  openGraph: { title: "Skill Auditor", description, siteName: "Skill Auditor", locale: "th_TH", type: "website" },
  twitter: { card: "summary_large_image", title: "Skill Auditor", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${notoSansThai.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Vercel Web Analytics: cookie-less page-view counts, active only on the deployed site */}
        <Analytics />
      </body>
    </html>
  );
}
