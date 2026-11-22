import Link from "next/link";

/** Standard page opening: eyebrow, headline, lede. */
export function PageHero({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede: string;
}) {
  return (
    <section className="co-pagehead">
      <div>
        <span className="co-lbl">{eyebrow}</span>
        <h1 className="co-pt" style={{ marginTop: 10 }}>{title}</h1>
        <p className="co-ps">{lede}</p>
      </div>
    </section>
  );
}

/** Section heading used inside pages. */
export function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      {eyebrow ? <div className="co-lbl">{eyebrow}</div> : null}
      <h2 className="co-pt" style={{ fontSize: 44 }}>{title}</h2>
      {sub ? <p className="co-ps">{sub}</p> : null}
    </div>
  );
}

/** Closing call to action. Every page ends on the same ask. */
export function CTA({
  title = "See what you should actually be paying",
  body = "Free to you. Providers pay us under commission or referral arrangements.",
  primary = { label: "Get started", href: "/sign-up" },
  secondary,
}: {
  title?: string;
  body?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="co-final">
      <h2 style={{ fontSize: 64 }}>{title}</h2>
      <div>
        <p>{body}</p>
        <div className="co-ctas">
          <Link className="co-btn co-btn-p" href={primary.href}>
            {primary.label}
          </Link>
          {secondary ? (
            <Link className="co-btn co-btn-g" href={secondary.href}>
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Placeholder-content notice. Used wherever figures are illustrative. */
export function PlaceholderNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="co-lbl" style={{ marginTop: 18 }}>
      {children}
    </p>
  );
}
