import Link from "next/link";

const DIRECTIONS = [
  {
    n: 1,
    name: "Harbor",
    line: "OutSail's blue lineage, elevated",
    note: "Deep navy + one electric blue. Plus Jakarta Sans. The hero pairs the lead form with a live match card. The safest, most conversion-proven of the three — familiar to anyone who has shopped this category, but sharper than the incumbent.",
    hero: "Live match card",
  },
  {
    n: 2,
    name: "Beacon",
    line: "The advisor, front and centre",
    note: "Deep pine + bright teal on warm off-white. Sora + Manrope, rounded and generous. The hero is a real advisor conversation with a marked-up quote — the one thing a vendor's site can never show you.",
    hero: "Advisor thread",
  },
  {
    n: 3,
    name: "Terminal",
    line: "Data authority",
    note: "Near-white, cobalt, tabular figures, mono labels. Archivo + IBM Plex Mono. Dense and precise: the page looks like the data set it's selling, with 'last verified' dates on every row.",
    hero: "Working comparison table",
  },
];

export default function DesignExplorations() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "64px 24px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 700, margin: "0 0 10px" }}>
        Design directions
      </h1>
      <p style={{ color: "#555", marginBottom: 40, lineHeight: 1.65 }}>
        Three full homepages, all built on OutSail&rsquo;s proven section order
        (hero + capture → vendor wall → six tools → broker advantage → trust →
        stats → case studies → newsletter → footer). They differ in voice,
        palette, type, and what the hero puts in front of you. Figures are
        placeholders, not claims.
      </p>

      <ul style={{ display: "grid", gap: 16, listStyle: "none", padding: 0 }}>
        {DIRECTIONS.map((d) => (
          <li key={d.n}>
            <Link
              href={`/design-explorations/${d.n}`}
              style={{
                display: "block",
                border: "1px solid #e3e8f0",
                borderRadius: 12,
                padding: 24,
                textDecoration: "none",
                color: "inherit",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 22, fontWeight: 700 }}>
                  {d.n}. {d.name}
                </span>
                <span style={{ fontSize: 14, color: "#667085" }}>{d.line}</span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "#2563eb",
                  marginBottom: 10,
                }}
              >
                Hero: {d.hero}
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#475467" }}>
                {d.note}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
