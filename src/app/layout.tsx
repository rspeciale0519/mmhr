import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { CookieConsent } from "@/components/cookie-consent";
import { brand } from "@/lib/brand";
import { getPublicReleaseRobotsMetadata } from "@/lib/public-release";
import { TRPCReactProvider } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import "./globals.css";

// Base typography from the shadcn preset. Pulse is selected, but its final
// typography and theme tokens are not yet codified across every surface.
const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: brand.name,
  description: `${brand.name} — buyer-side HRIS brokerage.`,
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
      className={cn("h-full antialiased", "font-sans", geist.variable)}
    >
      <body className="flex min-h-full flex-col">
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
