import Link from "next/link";

export function CobaltFooter() {
  return (
    <footer className="co-foot">
      <span>MMHR, a free HRIS software brokerage.</span>
      <nav aria-label="Legal">
        <Link href="/#ranking-policy">Ranking policy</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/contact">For providers</Link>
      </nav>
    </footer>
  );
}
