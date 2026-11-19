import type { Metadata, Viewport } from "next";
import "./globals.css";

export const SITE = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://digly.io");
export const DESCRIPTION = "A daily knowledge dig in three levels. Name as many as you can; the rarer the answer, the more it's worth.";

export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Digly: a pixel miner with a pickaxe on a mountain ledge at night" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Digly · Dig deep.",
  description: DESCRIPTION,
  applicationName: "Digly",
  openGraph: {
    type: "website",
    siteName: "Digly",
    title: "Digly · Dig deep.",
    description: DESCRIPTION,
    url: "/",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Digly · Dig deep.",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  // full screen when added to an iPhone home screen
  appleWebApp: { capable: true, title: "Digly", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#10162b",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* the pixel fonts are on the first screen; fetch them with the HTML instead of after the CSS */}
        <link rel="preload" href="/fonts/silkscreen-400.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/silkscreen-700.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/vt323.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
