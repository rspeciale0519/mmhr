import Link from "next/link";

/**
 * The closing call to action at the bottom of a public page: a large
 * heading on the left, one sentence and one button on the right.
 *
 * The button defaults to the buyer sign-up ("Start your needs list" ->
 * /sign-up), the main action of the site. Pass `action` to point somewhere
 * else, for example providers to /contact.
 *
 * Example:
 *   <CtaBand
 *     title="Start with your needs list."
 *     body="Free for buyers. You sign directly with the provider you choose."
 *   />
 *
 * Styles: reuses `.co-final` from styles.css (the home page's closing band)
 * with the `.co-page-final` size step from pages.css.
 */
export function CtaBand({
  title,
  body,
  action = { href: "/sign-up", label: "Start your needs list" },
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="co-final co-page-final">
      <h2>{title}</h2>
      <div>
        <p>{body}</p>
        <Link className="co-btn co-btn-p" href={action.href}>{action.label}</Link>
      </div>
    </section>
  );
}
