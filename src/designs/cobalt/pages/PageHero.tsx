/**
 * The top of a public page: the page's only <h1>, a short lede, and
 * optional buttons.
 *
 * Use it once per page, as the first thing in the page's Body.tsx.
 * Keep the title short (it renders very large) and the lede to one or two
 * plain sentences that say what the page answers.
 *
 * Example:
 *   <PageHero
 *     title="How MatchMaker HR works"
 *     lede="Answer one needs list. We score every match against it."
 *     actions={<Link className="co-btn co-btn-p" href="/sign-up">Start free</Link>}
 *   />
 *
 * Styles: `.co-page-hero` in src/designs/cobalt/pages.css. The title reuses
 * `.co-pt` and the lede `.co-lede` from styles.css; `actions` sits in the
 * existing `.co-ctas` row, so pass `co-btn` links straight in.
 */
export function PageHero({
  title,
  lede,
  actions,
}: {
  title: string;
  lede: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="co-page-hero">
      <h1 className="co-pt">{title}</h1>
      <p className="co-lede">{lede}</p>
      {actions ? <div className="co-ctas">{actions}</div> : null}
    </header>
  );
}
