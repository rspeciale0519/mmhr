// Client-only: rendered from ReviewDock, which is the "use client" boundary.
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import styles from "./review.module.css";

export type ReviewDesign = {
  slug: string;
  number: number;
  round: number;
  name: string;
  idea: string;
  palette: string[];
};

const roundNames: Record<number, string> = { 4: "Round 4", 3: "Round 3", 2: "Round 2", 1: "Round 1" };

/*
 * Switching uses full page loads. Each design runs its own canvas and scroll
 * effects, and a fresh document is the simplest sure way to release them.
 */
const go = (href: string) => window.location.assign(href);

// Arrow keys also drive tabs, toggle groups, sliders, and menus inside the designs.
const ownsArrows = "input, textarea, select, [contenteditable], [role=slider], [role=tablist], [role=tab], [role=radiogroup], [role=radio], [role=group], [role=toolbar], [role=menu], [role=menuitem], [role=listbox], [role=option], [role=grid]";

function ignoresKeys(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(ownsArrows));
}

export function DesignSwitcher({ designs, current, onOpen }: { designs: ReviewDesign[]; current: string | null; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const index = designs.findIndex((design) => design.slug === current);
  const here = index >= 0 ? designs[index]! : null;
  const previous = here ? designs[(index - 1 + designs.length) % designs.length]! : null;
  const next = here ? designs[(index + 1) % designs.length]! : null;

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Left and right arrows, or [ and ], step through the designs.
  useEffect(() => {
    if (!previous || !next || open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (ignoresKeys(event.target) || document.querySelector("[aria-modal=true], [data-review-dialog]")) return;
      if (event.key === "ArrowLeft" || event.key === "[") go(`/gallery/${previous.slug}`);
      if (event.key === "ArrowRight" || event.key === "]") go(`/gallery/${next.slug}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previous, next, open]);

  return (
    <>
      {previous && (
        <a className={styles.arrow} href={`/gallery/${previous.slug}`} aria-label={`Previous design: ${previous.name}`} aria-keyshortcuts="ArrowLeft" title={`${previous.name} (←)`}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        </a>
      )}
      <button
        ref={triggerRef}
        type="button"
        className={styles.current}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={here ? `Switch design. Now viewing ${here.name}` : "Switch design"}
        onClick={() => {
          onOpen();
          setOpen(true);
        }}
      >
        {here ? (
          <>
            <span className={styles.number}>{String(here.number).padStart(2, "0")}</span>
            {here.name}
          </>
        ) : "Switch design"}
        <span className={styles.caret} aria-hidden="true">▲</span>
      </button>
      {next && (
        <a className={styles.arrow} href={`/gallery/${next.slug}`} aria-label={`Next design: ${next.name}`} aria-keyshortcuts="ArrowRight" title={`${next.name} (→)`}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </a>
      )}
      {open && createPortal(<Sheet designs={designs} current={current} onClose={close} />, document.body)}
    </>
  );
}

function Sheet({ designs, current, onClose }: { designs: ReviewDesign[]; current: string | null; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const rounds = [4, 3, 2, 1]
    .map((round) => ({ round, items: designs.filter((design) => design.round === round) }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    const sheet = sheetRef.current;
    const here = sheet?.querySelector<HTMLElement>("[aria-current=page]");
    (here ?? sheet?.querySelector<HTMLElement>("a, button"))?.focus({ preventScroll: true });
    here?.scrollIntoView({ block: "center" });

    // Stop the page behind from scrolling while the sheet is open.
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !sheet) return;
      // Keep keyboard focus inside the sheet.
      const focusable = sheet.querySelectorAll<HTMLElement>("a[href], button");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div data-review-ui data-review-dialog className={`${styles.ui} ${styles.sheetScrim}`} onClick={onClose}>
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="review-switch-title" className={styles.sheet} onClick={(event) => event.stopPropagation()}>
        <header className={styles.sheetHead}>
          <div className={styles.sheetTitleWrap}>
            <h2 id="review-switch-title" className={styles.sheetTitle}>Switch design</h2>
            <p className={styles.sheetText}>Each design is a complete home page with the working parts built in.</p>
          </div>
          <Link className={styles.outlineLink} href="/gallery" onClick={onClose}>All designs</Link>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className={styles.sheetBody}>
          {rounds.map(({ round, items }) => (
            <section key={round} className={styles.roundBlock} aria-labelledby={`review-round-${round}`}>
              <h3 id={`review-round-${round}`} className={styles.roundTitle}>{roundNames[round]}</h3>
              <ul className={styles.tiles}>
                {items.map((design) => {
                  const here = design.slug === current;
                  return (
                    <li key={design.slug}>
                      <a className={styles.tile} href={`/gallery/${design.slug}`} aria-current={here ? "page" : undefined}>
                        <span className={styles.thumb}>
                          <Image src={`/gallery-previews/${design.slug}.jpg`} alt="" fill sizes="(min-width: 1024px) 190px, (min-width: 640px) 30vw, 46vw" />
                          {here && <span className={styles.viewing}>Viewing</span>}
                        </span>
                        <span className={styles.bar} aria-hidden="true">
                          {design.palette.map((hex, position) => <span key={position} style={{ background: hex }} />)}
                        </span>
                        <span className={styles.tileName}>
                          <span className={styles.number}>{String(design.number).padStart(2, "0")}</span>
                          <span>{design.name}</span>
                        </span>
                        <span className={styles.tileIdea}>{design.idea}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className={styles.tip}>Tip: on any design, press ← or → to go to the previous or next design.</p>
        </div>
      </div>
    </div>
  );
}
