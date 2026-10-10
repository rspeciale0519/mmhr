"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { useEffect } from "react";

import styles from "./switcher.module.css";

type Item = { slug: string; name: string; idea: string };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Floating control for moving between gallery designs. Keys [ and ] also work. */
export function GallerySwitcher({ current, designs }: { current: string; designs: Item[] }) {
  const router = useRouter();
  const index = designs.findIndex((design) => design.slug === current);
  const previous = designs[(index - 1 + designs.length) % designs.length]!;
  const next = designs[(index + 1) % designs.length]!;
  const active = designs[index]!;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === "[") router.push(`/gallery/${previous.slug}`);
      if (event.key === "]") router.push(`/gallery/${next.slug}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, previous.slug, next.slug]);

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <nav className={styles.bar} aria-label="Design gallery">
        <Link className={styles.step} href={`/gallery/${previous.slug}`} aria-label={`Previous design: ${previous.name}`} aria-keyshortcuts="[">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        </Link>
        <Popover.Root>
          <Popover.Trigger className={styles.current}>
            <span className={styles.position}>{index + 1}/{designs.length}</span>
            <span className={styles.name}>{active.name}</span>
            <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className={styles.menu} side="top" sideOffset={10} collisionPadding={12} aria-label="All designs">
              <ul className={styles.list}>
                {designs.map((design, position) => (
                  <li key={design.slug}>
                    <Popover.Close asChild>
                      <Link className={styles.item} href={`/gallery/${design.slug}`} aria-current={design.slug === current ? "page" : undefined}>
                        <span className={styles.itemIndex}>{position + 1}</span>
                        <span>
                          <span className={styles.itemName}>{design.name}</span>
                          <span className={styles.itemIdea}>{design.idea}</span>
                        </span>
                      </Link>
                    </Popover.Close>
                  </li>
                ))}
              </ul>
              <Popover.Close asChild>
                <Link className={styles.all} href="/gallery">Compare all designs</Link>
              </Popover.Close>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Link className={styles.step} href={`/gallery/${next.slug}`} aria-label={`Next design: ${next.name}`} aria-keyshortcuts="]">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </Link>
      </nav>
    </>
  );
}
