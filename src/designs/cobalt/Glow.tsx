import { GlowDrift } from "./motion/GlowDrift";

type Props = {
  tone?: "blue" | "mint";
  placement?: "hero" | "app";
};

const placements = {
  hero: {
    blue: { width: 1100, height: 700, right: -300, top: 380 },
    mint: { width: 700, height: 500, left: -260, top: 600 },
  },
  app: {
    blue: { width: 900, height: 600, right: -300, top: -200 },
    mint: { width: 600, height: 500, left: -260, top: 500 },
  },
} as const;

/** The color of each tone as "r,g,b" and its strongest alpha. */
const tones = { blue: ["91,116,255", 0.45], mint: ["142,240,201", 0.4] } as const;

/**
 * One soft color glow.
 *
 * `soft` (used by the live glows) draws the softness into the gradient
 * itself instead of using styles.css's `filter: blur(70px)`. A moving layer
 * with a blur filter makes the browser re-blur ~1000px every frame; a plain
 * gradient layer is drawn once and only moved. The extra stops ease the
 * falloff so the two look alike, and `closest-side` makes the color reach
 * zero inside the box, so no edge of the box ever shows.
 */
export function CobaltGlow({ tone = "blue", placement = "hero", soft = false }: Props & { soft?: boolean }) {
  const box = placements[placement][tone];
  const [rgb, alpha] = tones[tone];
  const color = (share: number) => `rgba(${rgb},${(alpha * share).toFixed(3)})`;
  const fill = soft
    ? `radial-gradient(ellipse closest-side,${color(0.85)},${color(0.62)} 30%,${color(0.3)} 60%,${color(0.1)} 82%,${color(0)})`
    : `radial-gradient(circle,${color(1)},${color(0)} 65%)`;
  return (
    <div
      className="co-glow"
      data-tone={tone}
      style={{
        width: box.width,
        height: box.height,
        right: "right" in box ? box.right : undefined,
        left: "left" in box ? box.left : undefined,
        top: box.top,
        background: fill,
        filter: soft ? "none" : undefined,
      }}
    />
  );
}

/**
 * Decorative blobs live in a paint-clipped layer so their 1100px boxes and
 * blur cannot expand the document width. iOS WebKit shrink-to-fits overflow,
 * which is what made the landing page sit in the left ~56% of an iPhone.
 *
 * `live` (the public site chrome) makes the glows drift slowly, sink a little
 * slower than the page on scroll, and lean away from the mouse, so the canvas
 * feels alive on every page. See motion/GlowDrift.tsx. Without `live` (the
 * signed-in app) they stay still.
 */
export function CobaltGlows({ placement = "hero", live = false }: { placement?: "hero" | "app"; live?: boolean }) {
  const glows = (
    <>
      <CobaltGlow tone="blue" placement={placement} soft={live} />
      <CobaltGlow tone="mint" placement={placement} soft={live} />
    </>
  );
  if (live) return <GlowDrift>{glows}</GlowDrift>;
  return (
    <div className="co-glows" aria-hidden="true">
      {glows}
    </div>
  );
}
