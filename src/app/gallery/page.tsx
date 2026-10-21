import { existsSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { designFonts } from "@/gallery/design-fonts";
import { galleryDesigns } from "@/gallery/registry";
import { GalleryNotes } from "@/gallery/review/gallery-notes";
import styles from "@/gallery/overview.module.css";

export const metadata: Metadata = {
  title: "Design gallery | MMHR",
  robots: { index: false, follow: false },
};

const rounds = [
  { round: 4, title: "Round 4: a technology-product feel", text: "Clean and airy, with 3D diagrams, live data views, and interactive product previews that each answer a real buying question." },
  { round: 3, title: "Round 3: depth and calm", text: "Clean, airy, and crisp: real depth and soft shadows, with one calm interactive idea each." },
  { round: 2, title: "Round 2: bolder directions", text: "Five bolder directions, each built around one interactive idea you can try on the page." },
  { round: 1, title: "Round 1: the first five", text: "The first five directions, kept for comparison." },
] as const;

const steps = [
  { title: "Explore each design", text: "Open a design and scroll the whole page. Try the scorecard, the forms, and the light and dark modes." },
  { title: "Comment and pick pieces", text: "Use the bar at the bottom of the screen. Comment on any section, or tap “Pick pieces” to save the parts you like." },
  { title: "Build your final design", text: "Combine your favorite pieces from any design into one recipe, and send it to the team." },
];

const previewFor = (slug: string) => {
  const file = `/gallery-previews/${slug}.jpg`;
  return existsSync(path.join(process.cwd(), "public", file)) ? file : null;
};

export default function GalleryOverview() {
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <span className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          Website redesign for MatchMaker HR
        </span>
        <Link className={styles.topLink} href="/gallery/final">Build final design</Link>
      </header>

      <section className={styles.intro}>
        <h1 className={styles.title}>Twenty directions for the new MatchMaker HR</h1>
        <p className={styles.lede}>
          Each design is a complete home page with the working parts of the platform built in: the vendor scorecard,
          case progress, the needs form, dialogs, menus, and light and dark modes.
        </p>
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber}>Step {index + 1}</span>
              <h2 className={styles.stepTitle}>{step.title}</h2>
              <p className={styles.stepText}>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {rounds.map(({ round, title, text }) => {
        const designs = galleryDesigns.filter((design) => design.round === round);
        if (designs.length === 0) return null;
        return (
          <section key={round} className={styles.round} aria-labelledby={`round-${round}`}>
            <div className={styles.roundHead}>
              <h2 id={`round-${round}`} className={styles.roundTitle}>{title}</h2>
              <p className={styles.roundText}>{text}</p>
            </div>
            <div className={styles.list}>
              {designs.map((design) => {
                const number = galleryDesigns.indexOf(design) + 1;
                const preview = previewFor(design.slug);
                return (
                  <article key={design.slug} className={styles.design}>
                    <Link className={styles.shot} href={`/gallery/${design.slug}`} aria-label={`Open design ${number}: ${design.name}`}>
                      <span className={styles.frame} style={{ background: design.palette[0]?.hex }}>
                        {preview ? (
                          <Image src={preview} alt={`Home page of the ${design.name} design`} fill sizes="(min-width: 64rem) 58vw, 100vw" />
                        ) : (
                          <span className={styles.stripes} aria-hidden="true">
                            {design.palette.map((color) => <span key={color.hex} style={{ background: color.hex }} />)}
                          </span>
                        )}
                      </span>
                    </Link>
                    <div className={styles.copy}>
                      <p className={styles.number}>Design {number}</p>
                      <h3 className={`${styles.name} ${designFonts[design.slug] ?? ""}`}>{design.name}</h3>
                      <p className={styles.idea}>{design.idea}</p>
                      <p className={styles.summary}>{design.summary}</p>
                      <dl className={styles.facts}>
                        <div>
                          <dt>Signature moment</dt>
                          <dd>{design.signature}</dd>
                        </div>
                        <div>
                          <dt>Type</dt>
                          <dd>{design.typefaces}</dd>
                        </div>
                        <div>
                          <dt>Palette</dt>
                          <dd className={styles.palette}>
                            {design.palette.map((color) => (
                              <span key={color.hex} className={styles.swatch} title={`${color.name} ${color.hex}`} style={{ background: color.hex }} />
                            ))}
                          </dd>
                        </div>
                      </dl>
                      <Link className={styles.open} href={`/gallery/${design.slug}`}>Open {design.name}</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className={styles.cta} aria-labelledby="gallery-mix-title">
        <div>
          <h2 id="gallery-mix-title" className={styles.ctaTitle}>Like pieces of different designs?</h2>
          <p className={styles.ctaText}>
            Take the hero from one, the colors from another, and the scorecard from a third. The final design builder
            turns your picks into one clear recipe for the team.
          </p>
        </div>
        <Link className={styles.ctaButton} href="/gallery/final">Build your final design</Link>
      </section>

      <section className={styles.notes} aria-labelledby="gallery-notes-title">
        <div>
          <h2 id="gallery-notes-title" className={styles.notesTitle}>Overall feedback</h2>
          <p className={styles.notesText}>
            Tell us how the set feels as a whole. For notes on one design, open it and use the bar at the bottom of the screen.
          </p>
        </div>
        <GalleryNotes designNames={galleryDesigns.map((design) => design.name)} />
      </section>
    </main>
  );
}
