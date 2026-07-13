import Link from "next/link";

/**
 * Gate G3: four visual directions for owner review. Whichever is approved gets
 * codified into theme tokens + components; the other three are deleted.
 */
const DIRECTIONS = [
  {
    n: 1,
    name: "Scorecard",
    artifact: "The weighted vendor scorecard",
    note: "Cool and analytical. The hero is a live match table — the artifact the product produces — instead of a headline over a form.",
  },
  {
    n: 2,
    name: "Advocate",
    artifact: "The advisor's letter",
    note: "Warm and human. Plum and teal, plain-spoken. Sells the person in your corner, not the software.",
  },
  {
    n: 3,
    name: "Blueprint",
    artifact: "The implementation project plan",
    note: "Technical and procedural. Drafting grid, dimension lines, monospace annotations. Treats the purchase as an engineering project.",
  },
  {
    n: 4,
    name: "Ledger",
    artifact: "The CFO's pricing ledger",
    note: "Sober and numbers-first. Green-bar accounting paper, tabular figures. Leads with the money.",
  },
];

export default function DesignExplorations() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "64px 24px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Design directions
      </h1>
      <p style={{ color: "#555", marginBottom: 40, lineHeight: 1.6 }}>
        Four directions for review. Each takes its cues from a different artifact
        in the buyer&rsquo;s own world. Pick one and it becomes the design system;
        the rest get deleted.
      </p>

      <ul style={{ display: "grid", gap: 16, listStyle: "none", padding: 0 }}>
        {DIRECTIONS.map((d) => (
          <li key={d.n}>
            <Link
              href={`/design-explorations/${d.n}`}
              style={{
                display: "block",
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 20,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {d.n}. {d.name}
              </div>
              <div style={{ fontSize: 13, color: "#777", margin: "4px 0 8px" }}>
                {d.artifact}
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{d.note}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
