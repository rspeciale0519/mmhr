import type { Metadata } from "next";
import Link from "next/link";

import { designFonts } from "@/gallery/design-fonts";
import { galleryDesigns, type GalleryDesign } from "@/gallery/registry";
import styles from "@/gallery/overview.module.css";

export const metadata: Metadata = {
  title: "Design gallery | MMHR",
  robots: { index: false, follow: false },
};

const rounds = [
  { round: 4, title: "Round 4", text: "Clean and airy, with a technology-product feel: 3D diagrams, live data views, and interactive product previews." },
  { round: 3, title: "Round 3", text: "Clean, airy, and crisp: real depth and soft shadows, with one calm interactive idea each." },
  { round: 2, title: "Round 2", text: "Five bolder directions, each built around one interactive idea you can try on the page." },
  { round: 1, title: "Round 1", text: "The first five directions, kept for comparison." },
] as const;

function DesignCard({ design, number }: { design: GalleryDesign; number: number }) {
  return (
    <li className={styles.card}>
      <Link className={styles.link} href={`/gallery/${design.slug}`}>
        <span className={styles.swatches} aria-hidden="true">
          {design.palette.map((color) => (
            <span key={color.hex} className={styles.swatch} style={{ background: color.hex }} />
          ))}
        </span>
        <span className={styles.meta}>
          <span className={styles.number}>Design {number}</span>
          <span className={`${styles.name} ${designFonts[design.slug] ?? ""}`}>{design.name}</span>
          <span className={styles.idea}>{design.idea}</span>
        </span>
        <span className={styles.summary}>{design.summary}</span>
        <span className={styles.detail}><strong>Signature.</strong> {design.signature}</span>
        <span className={styles.detail}><strong>Type.</strong> {design.typefaces}</span>
        <span className={styles.open}>Open {design.name}</span>
      </Link>
    </li>
  );
}

export default function GalleryOverview() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.kicker}>MatchMaker HR</p>
        <h1 className={styles.title}>Design directions for the new MMHR</h1>
        <p className={styles.lede}>
          Each design is a complete home page with the working parts of the platform built in: the vendor scorecard,
          case progress, forms, dialogs, menus, and light and dark modes. Open one, then move between designs with the
          bar at the bottom of the screen or the [ and ] keys.
        </p>
      </header>

      {rounds.map(({ round, title, text }) => {
        const designs = galleryDesigns.filter((design) => design.round === round);
        if (designs.length === 0) return null;
        return (
          <section key={round} className={styles.round} aria-labelledby={`round-${round}`}>
            <div className={styles.roundHead}>
              <h2 id={`round-${round}`} className={styles.roundTitle}>{title}</h2>
              <p className={styles.roundText}>{text}</p>
            </div>
            <ol className={styles.grid}>
              {designs.map((design) => (
                <DesignCard key={design.slug} design={design} number={galleryDesigns.indexOf(design) + 1} />
              ))}
            </ol>
          </section>
        );
      })}
    </main>
  );
}
