import { SplitText } from "../motion/SplitText";

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
 * existing `.co-ctas` row, so pass `co-btn` links straight in (wrap the main
 * one in `<Magnetic>` from ../motion for the pull toward the mouse).
 *
 * Motion, on every page as soon as it paints (pure CSS, no waiting for
 * JavaScript): the title's words rise one after another from behind their
 * own edge (SplitText, trigger "load"), then the lede and the actions rise
 * in after it (`co-enter`). Reduced motion: all of it is simply there.
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
      <SplitText as="h1" className="co-pt" text={title} trigger="load" />
      {/* Queued after the headline: about when its last words land. */}
      <p className="co-lede co-enter" style={{ ["--co-delay" as string]: "260ms" }}>
        {lede}
      </p>
      {actions ? (
        <div className="co-ctas co-enter" style={{ ["--co-delay" as string]: "380ms" }}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}
