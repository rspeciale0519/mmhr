import type { Metadata } from "next";
import Link from "next/link";

import { DESIGNS, ROUNDS } from "@/designs/registry";
import "./gallery.css";

export const metadata: Metadata = {
  title: "Design directory — MatchMaker HR",
  description: "Every homepage layout option, for review.",
  robots: { index: false, follow: false },
};

export default function DesignDirectory() {
  return (
    <div className="g">
      <header className="g-top">
        <div className="g-wrap">
          <div className="g-kicker">MatchMaker HR</div>
          <h1 className="g-h1">Design directory</h1>
          <p className="g-lede">
            Every homepage layout we&rsquo;ve built, in one place. Open any of
            them full-screen, click around, then tell us which direction to
            take — or which pieces to combine. New rounds get added here as we
            iterate.
          </p>
          <p className="g-note">
            <strong>Everything on these pages is placeholder content.</strong>{" "}
            The numbers (NPS 74, 310 companies, $84.5k saved), the case studies,
            and the advisor names are stand-ins so the layouts can be judged —
            not claims. Real copy requires the canonical content review.
          </p>
        </div>
      </header>

      <main className="g-wrap">
        {ROUNDS.map((round) => {
          const items = DESIGNS.filter((d) => d.round === round.n);
          if (items.length === 0) return null;

          return (
            <section className="g-round" key={round.n}>
              <h2 className="g-round-h">{round.title}</h2>
              <p className="g-round-b">{round.blurb}</p>

              <div className="g-grid">
                {items.map((d) => (
                  <Link className="g-card" href={`/designs/${d.slug}`} key={d.slug}>
                    <div className="g-swatch">
                      {d.swatch.map((c) => (
                        <span key={c} style={{ background: c }} />
                      ))}
                    </div>

                    <div className="g-name">
                      <h3>{d.name}</h3>
                      <span className="g-scope">{d.scope}</span>
                    </div>
                    <p className="g-line">{d.line}</p>

                    <div className="g-hero">Hero: {d.hero}</div>
                    <p className="g-note-t">{d.note}</p>

                    <div className="g-meta">
                      <span className="g-type">{d.type}</span>
                      <span className="g-open">Open →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      <footer className="g-wrap g-foot">
        {DESIGNS.length} layouts · Updated as we iterate · Not indexed by search
        engines
      </footer>
    </div>
  );
}
