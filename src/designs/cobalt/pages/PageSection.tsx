/**
 * One titled section of a public page: an <h2>, an optional short intro
 * beside it, and the section's content below.
 *
 * `id` is required. It becomes the section's anchor (so other pages can link
 * to `/how-it-works#masking`, for example) and names the heading that labels
 * the section for screen readers. Use short, lowercase, hyphenated ids that
 * stay stable, because links and search results may point at them.
 *
 * Example:
 *   <PageSection id="masking" title="Names stay masked" intro="Until you review requirements.">
 *     <p>...</p>
 *   </PageSection>
 *
 * Styles: `.co-page-sec` in src/designs/cobalt/pages.css. The heading row
 * reuses the 12-column `.co-sech` grid from styles.css at a smaller size.
 * Put plain text in `.co-page-copy` for a readable line length.
 */
export function PageSection({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section className="co-page-sec" id={id} aria-labelledby={headingId}>
      <div className="co-sech">
        <h2 id={headingId}>{title}</h2>
        {intro ? <p>{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}
