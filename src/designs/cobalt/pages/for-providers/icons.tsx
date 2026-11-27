/**
 * Line icons for the three "Rank is earned on fit" rules on /for-providers.
 * Drawn with the current text color; each has a part (`.co-fp-ico-move`)
 * that moves on hover (see for-providers.css).
 */
export function RuleIcon({ name }: { name: "fit" | "fee" | "mask" }) {
  if (name === "fit") {
    // A target: the buyer's needs, with a dot landing in the middle.
    return (
      <svg aria-hidden="true" fill="none" height="24" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" width="24">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle className="co-fp-ico-move" cx="12" cy="12" fill="currentColor" r="1.8" stroke="none" />
      </svg>
    );
  }
  if (name === "fee") {
    // A ranking ladder with a line struck through it: fees are not an input.
    return (
      <svg aria-hidden="true" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24" width="24">
        <path d="M5 19v-6M12 19V9M19 19V5" />
        <path className="co-fp-ico-move" d="M3.5 4.5 20.5 20" />
      </svg>
    );
  }
  // An eye with a lid: names stay masked.
  return (
    <svg aria-hidden="true" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24" width="24">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle className="co-fp-ico-move" cx="12" cy="12" r="2.8" />
    </svg>
  );
}
