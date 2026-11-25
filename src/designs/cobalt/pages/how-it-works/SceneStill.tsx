import { RING_SCORES, needPlace, radiusFor, sceneAt, sceneNeeds } from "./story-scene";

// The drawing box. Shapes scale with the box; the text tags are HTML laid
// over it, so they keep a readable size on any screen.
const W = 640;
const H = 400;
const CX = W / 2;
const CY = H / 2 + 14;
// Pixels per scene unit, and how flat the field looks (the 3D stage looks
// down at the same field from an angle; this squash fakes that angle).
const UNIT = 62;
const SQUASH = 0.5;

/**
 * Rounds a drawing number to two decimals. The server and the browser can
 * disagree in the last digits of Math.sin and friends; rounding keeps the
 * server-rendered picture and the browser's copy identical (no hydration
 * mismatch), and shortens the markup.
 */
function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Turns a point on the field into a spot in the drawing box. */
function place(radius: number, angle: number, height = 0) {
  return {
    x: round(CX + Math.cos(angle) * radius * UNIT),
    y: round(CY + Math.sin(angle) * radius * UNIT * SQUASH - height * UNIT * 0.5),
  };
}

/** Percent position for an HTML tag laid over the drawing. */
function at(point: { x: number; y: number }) {
  return { left: `${((point.x / W) * 100).toFixed(2)}%`, top: `${((point.y / H) * 100).toFixed(2)}%` };
}

// Cobalt palette values used inside the drawing. The stage is always navy,
// whatever the page around it does.
const DIM = "#5b74ff";
const BRIGHT = "#d3dcff";
const MINT = "#8ef0c9";

/**
 * A flat, still picture of one moment of the how-it-works story.
 *
 * Used where the 3D stage is not: under each step on phones and for
 * visitors who ask for less motion, and in the sticky stage before the 3D
 * loads or on a device without WebGL. It draws the same scene data as the
 * 3D stage (story-scene.ts), seen from the same angle, without movement.
 *
 * It is decoration for sighted visitors: the step text beside it says the
 * same thing, so it is hidden from screen readers.
 *
 * `id` must be unique on the page (it prefixes the drawing's gradient ids).
 * The box keeps the drawing's 16:10 shape (see .co-hiw-still in
 * how-it-works.css) so the HTML tags land on their dots.
 */
export function SceneStill({ progress, id }: { progress: number; id: string }) {
  // Gradient ids must be unique on the page, and the page shows several
  // stills, so each one names its own.
  const pool = `${id}-pool`;
  const glow = `${id}-glow`;
  const scene = sceneAt(progress);
  const core = place(0, 0);
  // Draw the far side of the field first so nearer dots sit on top.
  const providers = [...scene.providers].sort((a, b) => Math.sin(a.angle) * a.radius - Math.sin(b.angle) * b.radius);

  return (
    <div aria-hidden="true" className="co-hiw-still">
      <svg viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <radialGradient id={pool}>
            <stop offset="0" stopColor="#2340e8" stopOpacity="0.6" />
            <stop offset="1" stopColor="#2340e8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={glow}>
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.3" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* The soft blue light under the field. */}
        <ellipse cx={CX} cy={CY} fill={`url(#${pool})`} rx={UNIT * 4.4} ry={UNIT * 4.4 * SQUASH * 1.6} />

        {/* Score rings: closer to the middle is a closer fit. */}
        {RING_SCORES.map((score, index) => (
          <ellipse
            cx={CX}
            cy={CY}
            fill="none"
            key={score}
            opacity={round(scene.rings * (0.34 - index * 0.08))}
            rx={round(radiusFor(score) * UNIT)}
            ry={round(radiusFor(score) * UNIT * SQUASH)}
            stroke="#8fa2ff"
          />
        ))}

        {/* The advisor review sweep. */}
        {scene.sweep.opacity > 0 ? (
          <ellipse
            cx={CX}
            cy={CY}
            fill="none"
            opacity={round(scene.sweep.opacity)}
            rx={round(scene.sweep.radius * UNIT)}
            ry={round(scene.sweep.radius * UNIT * SQUASH)}
            stroke={MINT}
            strokeWidth="2"
          />
        ) : null}

        {/* Lines from your needs to each contender once the RFP is out. */}
        {providers.map((provider) => {
          if (provider.link <= 0) return null;
          const end = place(provider.radius, provider.angle, provider.height);
          return (
            <line
              key={`link-${provider.letter}`}
              opacity={round(provider.link * 0.8)}
              stroke={provider.chosen > 0.5 ? MINT : BRIGHT}
              strokeWidth={provider.chosen > 0.5 ? 2.5 : 1.5}
              x1={core.x}
              x2={end.x}
              y1={core.y}
              y2={end.y}
            />
          );
        })}

        {/* Provider dots. */}
        {providers.map((provider) => {
          const point = place(provider.radius, provider.angle, provider.height);
          const color = provider.picked > 0.5 ? MINT : provider.tag ? BRIGHT : DIM;
          const size = round(9 + (provider.tag ? 5 : 0) + provider.chosen * 6);
          return (
            <g key={provider.letter} opacity={round(provider.opacity)}>
              <circle cx={point.x} cy={point.y} fill={`url(#${glow})`} opacity="0.5" r={round(size * 1.8)} />
              <circle cx={point.x} cy={point.y} fill={color} r={round(size / 2.4)} />
            </g>
          );
        })}

        {/* The needs on their way in (step 01). */}
        {scene.needsOpacity > 0.05
          ? sceneNeeds.map((label, index) => {
              const need = needPlace(index, scene.needsPull);
              const point = place(need.radius, need.angle);
              return <circle cx={point.x} cy={point.y} fill={MINT} key={label} opacity={round(scene.needsOpacity)} r="4" />;
            })
          : null}

        {/* "Your needs" in the middle. It glows brighter as the needs go in. */}
        <circle cx={core.x} cy={core.y} fill={`url(#${glow})`} opacity="0.7" r={round(26 + scene.needsPull * 14)} />
        <circle cx={core.x} cy={core.y} fill={MINT} r={round(8 + scene.needsPull * 3)} />
        <circle cx={core.x} cy={core.y} fill="#fff" r="3.5" />
      </svg>

      {/* Text tags, laid over the drawing. */}
      {/* "Your needs" is named only while the needs go in (step 01). In a
          small still, a label in the middle would cover the contenders'
          tags; the stage key says what the middle is. */}
      {scene.needsOpacity > 0.05 ? (
        <span className="co-stage-tag co-stage-tag-core co-hiw-tag" style={{ ...at(core), opacity: 1 }}>
          Your needs
        </span>
      ) : null}
      {scene.needsOpacity > 0.05
        ? sceneNeeds.map((label, index) => {
            const need = needPlace(index, scene.needsPull);
            const point = place(need.radius, need.angle);
            return (
              <span className="co-stage-tag co-hiw-tag co-hiw-need" key={label} style={{ ...at(point), opacity: round(scene.needsOpacity) }}>
                {label}
              </span>
            );
          })
        : null}
      {providers.map((provider) => {
        if (!provider.tag || provider.tag.opacity < 0.05) return null;
        const point = place(provider.radius, provider.angle, provider.height);
        return (
          <span
            className={provider.tag.on ? "co-stage-tag co-stage-tag-on co-hiw-tag co-hiw-ptag" : "co-stage-tag co-hiw-tag co-hiw-ptag"}
            key={provider.letter}
            style={{ ...at(point), opacity: round(provider.tag.opacity) }}
          >
            {provider.tag.name}
            <b>{provider.tag.note}</b>
          </span>
        );
      })}
    </div>
  );
}
