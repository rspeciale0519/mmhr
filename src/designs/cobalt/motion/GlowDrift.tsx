"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { onScrollFrame, perFrame } from "./frame";
import { FINE_POINTER, matches, motionAllowed } from "./media";

/**
 * The page's background glow layer, alive: the glows drift slowly on their
 * own (CSS animation in motion-kit.css), sink a little slower than the page
 * as it scrolls, and lean away from the mouse.
 *
 * This component only writes three CSS variables on the layer; CSS turns
 * them into `translate` on each glow, with a soft transition that smooths
 * every change. Variables:
 * - `--co-sy`: page scroll in px (capped at 2400; the glows sit near the top)
 * - `--co-px`, `--co-py`: mouse position, -1 to 1 from the screen's center
 *
 * The drift pauses for glows that are off screen (`data-co-off`). Reduced
 * motion: nothing moves, the glows stay where styles.css puts them. Used by
 * CobaltGlows when `live` is set (the public site chrome).
 */
export function GlowDrift({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    if (!layer || !motionAllowed()) return;
    layer.setAttribute("data-co-live", "");

    let scroll = 0;
    const stopScroll = onScrollFrame({
      read: () => {
        scroll = Math.min(window.scrollY, 2400);
      },
      write: () => layer.style.setProperty("--co-sy", scroll.toFixed(0)),
    });

    const onPointer = perFrame((event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      layer.style.setProperty("--co-px", x.toFixed(3));
      layer.style.setProperty("--co-py", y.toFixed(3));
    });
    const fine = matches(FINE_POINTER);
    if (fine) window.addEventListener("pointermove", onPointer, { passive: true });

    // Pause each glow's drift while it is off screen.
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            for (const entry of entries) entry.target.toggleAttribute("data-co-off", !entry.isIntersecting);
          });
    for (const glow of layer.children) observer?.observe(glow);

    return () => {
      stopScroll();
      onPointer.cancel();
      window.removeEventListener("pointermove", onPointer);
      observer?.disconnect();
      layer.removeAttribute("data-co-live");
    };
  }, []);

  return (
    <div className="co-glows" aria-hidden="true" ref={ref}>
      {children}
    </div>
  );
}
