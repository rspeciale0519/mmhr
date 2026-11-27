import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { CookieConsent } from "@/components/cookie-consent";
import { brand } from "@/lib/brand";
import { getPublicReleaseRobotsMetadata } from "@/lib/public-release";
import { getSiteMetadataBase, getSiteSocialMetadata } from "@/lib/site-metadata";
import { TRPCReactProvider } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import "./globals.css";
import "@/designs/cobalt/styles.css";
import "@/designs/cobalt/motion.css";
import "@/designs/cobalt/pages.css";
import "@/designs/cobalt/motion/motion-kit.css";

const appGeist = localFont({
  src: [
    { path: "../assets/fonts/geist/geist-normal-100-900-latin.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--font-sans",
});
const geist = appGeist;
const appMona = localFont({
  src: [
    {
      path: "../assets/fonts/mona-sans/mona-sans-normal-200-900-wdth-latin.woff2",
      weight: "200 900",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-mona",
  adjustFontFallback: "Arial",
});
const mona = appMona;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: getSiteMetadataBase(),
  title: brand.name,
  description: `${brand.name} — buyer-side HRIS brokerage.`,
  alternates: { canonical: "/" },
  ...getSiteSocialMetadata(
    brand.name,
    `${brand.name} — buyer-side HRIS brokerage.`,
  ),
  // The release gate controls indexing while claims remain unapproved.
  robots: getPublicReleaseRobotsMetadata(),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("co h-full antialiased", "font-sans", geist.variable, mona.variable)}
    >
      <body className="flex min-h-full flex-col">
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
