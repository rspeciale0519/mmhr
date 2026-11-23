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

export function CobaltGlow({ tone = "blue", placement = "hero" }: Props) {
  const box = placements[placement][tone];
  const fill = tone === "mint"
    ? "radial-gradient(circle,rgba(142,240,201,.4),rgba(142,240,201,0) 65%)"
    : "radial-gradient(circle,rgba(91,116,255,.45),rgba(91,116,255,0) 65%)";
  return (
    <div
      className="co-glow"
      style={{
        width: box.width,
        height: box.height,
        right: "right" in box ? box.right : undefined,
        left: "left" in box ? box.left : undefined,
        top: box.top,
        background: fill,
      }}
    />
  );
}

export function CobaltGlows({ placement = "hero" }: { placement?: "hero" | "app" }) {
  return (
    <>
      <CobaltGlow tone="blue" placement={placement} />
      <CobaltGlow tone="mint" placement={placement} />
    </>
  );
}
