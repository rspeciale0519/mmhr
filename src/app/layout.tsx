import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import "./globals.css";

// Typography is intentionally unset. Fonts are part of the design direction
// awaiting owner approval (gate G3); the type system lands with the theme tokens.
export const metadata: Metadata = {
  title: brand.name,
  description: `${brand.name} — buyer-side HRIS brokerage.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
