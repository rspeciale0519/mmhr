import { homeFacts } from "./home-content";

/**
 * One rolling digit. It is a column of digits stacked on top of each other
 * (for 5: 0, 1, 2, 3, 4, 5) inside a window one digit tall. home.css slides
 * the column up so the last digit, the real value, sits in the window.
 *
 * When the strip scrolls into view (ScrollReveal sets `data-co-reveal="in"`
 * on the list), the column starts at its first digit and slides to the last
 * one, so the number visibly counts and settles. With reduced motion, no
 * JavaScript, or before scrolling, the column already shows the value.
 *
 * `index` staggers the four numbers so they land one after another.
 */
function Odometer({ from, value, index }: { from: number; value: number; index: number }) {
  // Count up (0..5) or down (9..0) from `from` to `value`, one step at a time.
  const step = value >= from ? 1 : -1;
  const digits = Array.from({ length: Math.abs(value - from) + 1 }, (_, i) => from + i * step);

  return (
    <span className="co-odo" aria-hidden="true">
      <span
        className="co-odo-col"
        style={{ ["--co-odo-steps" as string]: digits.length - 1, ["--i" as string]: index }}
      >
        {digits.map((digit, position) => (
          <span key={position}>{digit}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * The strip of four numbers under the hero: one needs list, up to five
 * contenders, one approved RFP, no fees for buyers. They are rules of the
 * service, so a skimmer gets the whole offer in one line.
 *
 * The digits are decoration (aria-hidden); each item also carries the number
 * as visually hidden text, so screen readers read "1 needs list to answer...".
 */
export function HomeFacts() {
  return (
    <section className="co-home-facts" aria-label="MatchMaker HR at a glance">
      <ul data-co-reveal="">
        {homeFacts.map((fact, index) => (
          <li key={fact.label}>
            <Odometer from={fact.from} value={fact.value} index={index} />
            <p>
              <span className="co-home-vh">{fact.value} </span>
              {fact.label}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
