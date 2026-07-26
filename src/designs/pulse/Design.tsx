"use client";

import { Geologica, Martian_Mono } from "next/font/google";
import { useState } from "react";

import { Footer } from "@/app/(marketing)/_site/Footer";
import { Nav } from "@/app/(marketing)/_site/Nav";
import { PulseBody } from "./Body";
import "./styles.css";
import "@/app/(marketing)/_site/site.css";

const body = Geologica({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

/**
 * Pulse, complete and self-contained — nav, body, footer, and its own theme
 * state. This is what the design gallery renders at /designs/pulse.
 *
 * The live site does NOT use this component: it composes the same Nav, Footer
 * and PulseBody inside the shared site chrome, so the theme survives
 * navigation. Both paths render identical markup.
 */
export default function Pulse() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <div className={`pu ${body.className} ${mono.variable}`} data-theme={theme}>
      <Nav
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
      <main>
        <PulseBody />
      </main>
      <Footer />
    </div>
  );
}
