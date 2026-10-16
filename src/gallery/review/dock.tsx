"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { getReviewerName, pickKey, rememberPick, reviewApi, setReviewerName, usePicks } from "./client";
import { Composer, NameDialog } from "./composer";
import { DesignSwitcher, type ReviewDesign } from "./design-switcher";
import { Inspector, type InspectTarget } from "./inspector";
import type { FeedbackItem, ReviewTarget } from "./model";
import { pageWideParts, partById, tagParts } from "./parts";
import { Pins } from "./pins";
import styles from "./review.module.css";

type Mode = "idle" | "comment" | "pick";
type Context = { design: ReviewTarget; isDesign: boolean; where: string };

function contextFor(pathname: string, designs: ReviewDesign[]): Context | null {
  if (pathname === "/gallery") return { design: "gallery", isDesign: false, where: "the design gallery" };
  if (pathname === "/gallery/final") return { design: "final", isDesign: false, where: "the final design builder" };
  const slug = pathname.match(/^\/gallery\/([a-z0-9-]+)$/)?.[1];
  const design = designs.find((item) => item.slug === slug);
  return design ? { design: design.slug as ReviewTarget, isDesign: true, where: design.name } : null;
}

/**
 * The review bar at the bottom of every gallery page: switch designs, comment
 * on any section, pick the pieces you like, write a note, and open the
 * final-design builder.
 */
export function ReviewDock({ designs }: { designs: ReviewDesign[] }) {
  const pathname = usePathname();
  const ctx = useMemo(() => contextFor(pathname, designs), [pathname, designs]);
  const picks = usePicks();
  const [mode, setMode] = useState<Mode>("idle");
  const [collapsed, setCollapsed] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [composer, setComposer] = useState<{ target: InspectTarget | null } | null>(null);
  const [askName, setAskName] = useState<null | (() => void)>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [focus, setFocus] = useState<DOMRect | null>(null);

  const consentHeight = useConsentBannerHeight();

  const say = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  }, []);

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    reviewApi<{ items: FeedbackItem[] }>(`/api/gallery/feedback?design=${ctx.design}`).then((result) => {
      if (!cancelled) setItems(result.ok ? result.data.items : []);
    });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  // Tag the design's sections, then show the piece named in ?part= (from the builder's "View" links).
  useEffect(() => {
    if (!ctx?.isDesign) return;
    tagParts(document);
    const part = new URLSearchParams(window.location.search).get("part");
    const element = part ? document.querySelector<HTMLElement>(`[data-part="${CSS.escape(part)}"]`) : null;
    if (!element) return;
    // Keep the section clear of a sticky header.
    const header = document.querySelector<HTMLElement>('[data-part="navigation"]');
    const offset = header && getComputedStyle(header).position !== "static" ? header.offsetHeight + 16 : 16;
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - offset });
    const timer = window.setTimeout(() => setFocus(element.getBoundingClientRect()), 250);
    const clear = window.setTimeout(() => setFocus(null), 2400);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clear);
    };
  }, [ctx]);

  useEffect(() => {
    if (mode !== "idle" && ctx?.isDesign) tagParts(document);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !composer) setMode("idle");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, ctx, composer]);

  // Runs an action only once we know who is reviewing.
  const withName = useCallback((action: () => void) => {
    if (getReviewerName()) action();
    else setAskName(() => action);
  }, []);

  const togglePick = useCallback(async (part: string) => {
    if (!ctx?.isDesign) return;
    const existing = picks[pickKey(ctx.design, part)];
    const label = partById[part]?.label ?? part;
    if (existing) {
      rememberPick(ctx.design, part, null);
      const removed = await reviewApi(`/api/gallery/feedback?id=${existing}`, { method: "DELETE" });
      say(removed.ok ? `Removed “${label}” from your picks.` : removed.error);
      return;
    }
    const result = await reviewApi<{ id: string }>("/api/gallery/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "pick", design: ctx.design, part, reviewer: getReviewerName() }),
    });
    if (!result.ok) return say(result.error);
    rememberPick(ctx.design, part, result.data.id);
    say(`Added “${label}” from ${ctx.where} to your picks.`);
  }, [ctx, picks, say]);

  const closeComposer = useCallback(() => setComposer(null), []);

  const onInspect = useCallback((target: InspectTarget) => {
    if (mode === "pick" && target.part) withName(() => void togglePick(target.part!));
    if (mode === "comment") withName(() => setComposer({ target }));
  }, [mode, togglePick, withName]);

  if (!ctx) return null;

  const pickCount = Object.keys(picks).length;
  const isPicked = (part: string) => Boolean(picks[pickKey(ctx.design, part)]);

  return (
    <div data-review-ui className={styles.ui}>
      <div className={styles.spacer} aria-hidden="true" />
      <Inspector active={mode !== "idle" && !composer} mode={mode === "pick" ? "pick" : "comment"} picked={isPicked} onPick={onInspect} />
      <Pins items={items} visible={showPins && mode !== "pick"} />
      {focus && (
        <div aria-hidden="true" className={`${styles.outline} ${styles.flash}`} style={{ "--tone": "oklch(60% 0.22 8)", transform: `translate(${focus.left}px, ${Math.max(focus.top, 0)}px)`, inlineSize: focus.width, blockSize: Math.min(focus.height, window.innerHeight) } as CSSProperties} />
      )}

      {mode !== "idle" && (
        <div className={styles.banner}>
          <div className={styles.bannerInner} role="status">
            <span className={styles.dot} style={{ "--dot": mode === "pick" ? "var(--r-pick)" : "var(--r-comment)" } as CSSProperties} />
            <span>{mode === "comment" ? "Click any part of the page to leave a comment there." : "Click any section you like to add it to your picks."}</span>
            <button type="button" className={styles.button} onClick={() => setMode("idle")}>Done</button>
          </div>
        </div>
      )}

      <div className={styles.stack} style={consentHeight ? { insetBlockEnd: `calc(${consentHeight}px + 0.75rem)` } : undefined}>
        {toast && <p role="status" className={styles.toast}>{toast}</p>}
        {collapsed ? (
          <button type="button" className={`${styles.dock} ${styles.button}`} onClick={() => setCollapsed(false)}>Show review tools</button>
        ) : (
          <>
            {mode === "pick" && ctx.isDesign && (
              <div className={styles.chips}>
                <span className={styles.chipsLabel}>Also pick this design’s</span>
                {pageWideParts.map((part) => (
                  <button key={part} type="button" className={styles.chip} aria-pressed={isPicked(part)} onClick={() => withName(() => void togglePick(part))}>
                    {isPicked(part) ? "♥ " : ""}
                    {partById[part]!.label}
                  </button>
                ))}
              </div>
            )}
            <nav className={styles.dock} aria-label="Review tools">
              <DesignSwitcher designs={designs} current={ctx.isDesign ? ctx.design : null} onOpen={() => setMode("idle")} />
              {ctx.design !== "gallery" && (
                <Link href="/gallery" className={`${styles.button} ${ctx.isDesign ? styles.wideOnly : ""}`}>All designs</Link>
              )}
              {/* On phones the tools start a second row, so none of them hide off screen. */}
              <span className={styles.rowBreak} aria-hidden="true" />
              {ctx.isDesign && (
                <>
                  <ModeButton active={mode === "comment"} dot="var(--r-comment)" onClick={() => setMode(mode === "comment" ? "idle" : "comment")}>
                    Comment
                  </ModeButton>
                  <ModeButton active={mode === "pick"} dot="var(--r-pick)" onClick={() => setMode(mode === "pick" ? "idle" : "pick")}>
                    <Label long="Pick pieces" short="Pick" />
                  </ModeButton>
                </>
              )}
              <button type="button" className={`${styles.button} ${styles.tool}`} onClick={() => withName(() => setComposer({ target: null }))}>
                <Label long="Write a note" short="Note" />
              </button>
              {items.some((item) => item.kind === "comment" && item.x !== null) && mode !== "pick" && (
                <ModeButton active={showPins} onClick={() => setShowPins((value) => !value)}>
                  Pins ({items.filter((item) => item.kind === "comment" && item.x !== null).length})
                </ModeButton>
              )}
              {ctx.design !== "final" && (
                <Link href="/gallery/final" className={`${styles.button} ${styles.primary} ${styles.tool}`}>
                  <Label long="Build final design" short="Final design" />
                  {pickCount ? ` (${pickCount})` : ""}
                </Link>
              )}
              <button
                type="button"
                className={`${styles.arrow} ${styles.close}`}
                aria-label="Hide review tools"
                onClick={() => {
                  setMode("idle");
                  setCollapsed(true);
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
              </button>
            </nav>
          </>
        )}
      </div>

      {composer && (
        <Composer
          design={ctx.design}
          where={ctx.where}
          isDesign={ctx.isDesign}
          target={composer.target}
          onClose={closeComposer}
          onSaved={(item) => {
            setItems((list) => [item, ...list]);
            setComposer(null);
            say(item.kind === "note" ? "Note sent. Thank you." : "Comment saved.");
          }}
        />
      )}

      {askName && (
        <NameDialog
          onCancel={() => setAskName(null)}
          onSave={(value) => {
            setReviewerName(value);
            const next = askName;
            setAskName(null);
            next();
          }}
        />
      )}
    </div>
  );
}

/** A button label with a shorter form for phones. Only the visible form is in the accessible name. */
function Label({ long, short }: { long: string; short: string }) {
  return (
    <>
      <span className={styles.long}>{long}</span>
      <span className={styles.short}>{short}</span>
    </>
  );
}

function ModeButton({ active, dot, onClick, children }: { active: boolean; dot?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`${styles.button} ${styles.tool}`} aria-pressed={active} onClick={onClick}>
      {dot && <span className={styles.dot} style={{ "--dot": dot } as CSSProperties} />}
      {children}
    </button>
  );
}

/** The site's cookie banner is fixed to the bottom too; the review bar sits just above it. */
function useConsentBannerHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const banner = document.querySelector<HTMLElement>('[role="region"][aria-label="Cookie consent"]');
        setHeight(banner ? banner.offsetHeight : 0);
      });
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return height;
}
