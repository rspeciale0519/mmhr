// No "use client" here on purpose: this component holds no state, and its only
// consumers are client components. Marking it a client entry would make the
// onToggleTheme prop look like it crosses a server/client boundary.
import Link from "next/link";

import { PRIMARY_NAV } from "./links";

export type Theme = "dark" | "light";

/**
 * Site nav. Extracted from the Pulse homepage so every page carries the same
 * chrome. The theme is passed in rather than owned here, because SiteChrome
 * owns it so it survives navigation.
 */
export function Nav({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const next = theme === "dark" ? "light" : "dark";

  return (
    <header className="pu-nav">
      <div className="pu-wrap pu-nav-in">
        <Link className="pu-logo" href="/">
          <span className="pu-mark" aria-hidden="true" />
          MatchMaker HR
        </Link>
        <nav className="pu-links" aria-label="Primary navigation">
          {PRIMARY_NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="pu-theme"
          onClick={onToggleTheme}
          aria-label={`Switch to ${next} theme`}
          title={`Switch to ${next} theme`}
        >
          <span className="pu-theme-glyph" aria-hidden="true" />
          <span className="pu-theme-label">{next.toUpperCase()}</span>
        </button>
        <Link className="pu-btn pu-ghost" href="/sign-in">
          Sign in
        </Link>
        <Link className="pu-btn pu-solid" href="/sign-up">
          Get started
        </Link>
      </div>
    </header>
  );
}
