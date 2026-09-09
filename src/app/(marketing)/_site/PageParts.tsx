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
    <section className="pu-phero">
      <div className="pu-wrap pu-phero-in">
        <div className="pu-eye">{eyebrow}</div>
        <h1 className="pu-h1-p">{title}</h1>
        <p className="pu-lede-p">{lede}</p>
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
    <div className="pu-head">
      {eyebrow ? <div className="pu-eye">{eyebrow}</div> : null}
      <h2 className="pu-h2">{title}</h2>
      {sub ? <p className="pu-sub">{sub}</p> : null}
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
    <section className="pu-wrap pu-cta-wrap">
      <div className="pu-cta">
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="pu-cta-row">
          <Link className="pu-btn pu-solid pu-lg" href={primary.href}>
            {primary.label}
          </Link>
          {secondary ? (
            <Link className="pu-btn pu-ghost pu-lg" href={secondary.href}>
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
    <p className="pu-fine" style={{ marginTop: 18 }}>
      {children}
    </p>
  );
}
