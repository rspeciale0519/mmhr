"use client";

import localFont from "next/font/local";
import { useState } from "react";

import { Footer } from "@/app/(marketing)/_site/Footer";
import { Nav } from "@/app/(marketing)/_site/Nav";
import { PulseBody } from "./Body";
import "./styles.css";
import "@/app/(marketing)/_site/site.css";

const retainedPulseBody = localFont({
  src: [
    { path: "../../assets/fonts/geologica/geologica-normal-400-700-latin.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
});
const body = retainedPulseBody;
const retainedPulseMono = localFont({
  src: [
    { path: "../../assets/fonts/martian-mono/martian-mono-normal-400-700-latin.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
});
const mono = retainedPulseMono;

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
