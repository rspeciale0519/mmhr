export function RuleIcon({ name }: { name: "minus" | "bars" | "lock" }) {
  if (name === "minus") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8" />
      </svg>
    );
  }
  if (name === "bars") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true">
        <path d="M4 18h4V10H4zM10 18h4V6h-4zM16 18h4v-5h-4z" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Line icons for the four "Who it's for" cards, in the same order. */
const whoPaths = [
  // Buying your first HRIS: a spark (something new).
  "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  // Outgrowing payroll-only tools: stacked layers growing upward.
  "M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 17.5l9 5 9-5",
  // Replacing a system that no longer fits: two arrows swapping.
  "M4 8h13l-3-3M20 16H7l3 3",
  // Choosing without a selection team: a compass.
  "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2 5-5 2 2-5 5-2Z",
] as const;

export function WhoIcon({ index }: { index: number }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={whoPaths[index % whoPaths.length]} />
    </svg>
  );
}

/** A small right arrow for "read more" buttons; motion.css nudges it on hover. */
export function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
