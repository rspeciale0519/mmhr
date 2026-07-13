import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { brand } from "@/lib/brand";
import { TRPCReactProvider } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import "./globals.css";

// Placeholder typography from the shadcn base preset. The real typeface is part
// of the design direction awaiting owner approval (gate G3) and replaces this,
// along with the theme tokens, in the codification task.
const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

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
    <html
      lang="en"
      className={cn("h-full antialiased", "font-sans", geist.variable)}
    >
      <body className="flex min-h-full flex-col">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
