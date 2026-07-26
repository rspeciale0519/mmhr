"use client";

import { Geologica, Martian_Mono } from "next/font/google";
import { useSyncExternalStore } from "react";

import { Footer } from "./Footer";
import { Nav, type Theme } from "./Nav";

const body = Geologica({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

const STORAGE_KEY = "mmhr-theme";
const THEME_EVENT = "mmhr-theme-change";

/* localStorage is an external store, so the theme is read through
   useSyncExternalStore rather than mirrored into state via an effect. That
   avoids the cascading render setState-in-effect would cause, and gives React
   an explicit server snapshot so hydration stays consistent. */
function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readTheme(): Theme {
  return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

// The server cannot know the preference, so it always renders dark — the
// default the design was built around.
function serverTheme(): Theme {
  return "dark";
}

/**
 * The shell every public page renders inside: the `.pu` token root, the fixed
 * phosphor-bloom canvas, nav and footer.
 *
 * Lives in the (site) layout rather than in each page so the theme survives
 * navigation — App Router keeps layout state across route changes.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  const toggle = () => {
    window.localStorage.setItem(STORAGE_KEY, theme === "dark" ? "light" : "dark");
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <div
      className={`pu ${body.className} ${mono.variable}`}
      data-theme={theme}
    >
      <Nav theme={theme} onToggleTheme={toggle} />
      <main id="content">{children}</main>
      <Footer />
    </div>
  );
}
