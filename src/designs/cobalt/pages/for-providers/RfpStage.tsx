"use client";

import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from "three";

import {
  FLOW_END_SECONDS,
  TRAVEL_SECONDS,
  flowProviders,
  statusAt,
  statusStep,
  type RfpFlowStatus,
} from "./rfp-flow";

type Props = {
  /**
   * `performance.now()` when the current replay started, or null when the
   * picture should hold still at `elapsed` (before the first replay, and
   * with reduced motion).
   */
  startedAt: number | null;
  /** The moment to show while `startedAt` is null. Infinity = finished. */
  elapsed: number;
  /** True when the visitor asked their device for less motion. */
  reduced: boolean;
  /** Each provider's status as text, for the small tags over the dots. */
  statuses: readonly RfpFlowStatus[];
  /** Called once if this device cannot draw 3D (no WebGL). */
  onUnsupported: () => void;
};

// Colors, taken from the Cobalt palette (the same ones the home page's
// 3D stage uses).
const STAGE = 0x0b1541; // deep navy background
const DIM = new Color(0x5b74ff); // a provider that has not been sent the RFP
const BRIGHT = new Color(0xd3dcff); // a provider working on the RFP
const MINT = new Color(0x8ef0c9); // an answer, and the buyer in the middle
const WHITE = new Color(0xffffff); // the RFP on its way out

// How far each provider sits from the buyer in the middle.
const RADIUS = 2.5;
// The camera looks down at the field from this angle (in radians) on a
// wide stage, and from higher up on a tall, narrow one.
const ELEVATION = 0.5;
// After this many seconds past the last answer, a phone stops drawing.
const PHONE_SETTLE_SECONDS = 1;

/** Draws a soft round glow once, to reuse as the picture for every dot. */
function makeGlowTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const fade = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    fade.addColorStop(0, "rgba(255,255,255,1)");
    fade.addColorStop(0.25, "rgba(255,255,255,.75)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = fade;
    context.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/** A circle of `segments` points in the flat (x, z) plane. */
function circlePoints(radius: number, segments: number) {
  const points: number[] = [];
  for (let step = 0; step < segments; step += 1) {
    const angle = (step / segments) * Math.PI * 2;
    points.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }
  return new Float32Array(points);
}

/** Starts fast and lands softly, like the CSS curve --co-ease. */
function easeOut(progress: number) {
  return 1 - (1 - progress) ** 3;
}

/**
 * The 3D picture of one RFP going out to up to five providers and the
 * answers coming back. The buyer sits in the middle; each provider is a dot
 * on a circle around it. A white packet travels out along each line when
 * the RFP is sent, the dot brightens as the provider opens and answers it,
 * and a mint packet travels back when the answer is in.
 *
 * The whole picture repeats the text status list beside it, so the canvas
 * is hidden from screen readers by the parent (aria-hidden).
 *
 * This file (and the three.js library) loads only when the illustration
 * comes near the screen, so it does not slow down the first page load.
 */
export function RfpStage({ startedAt, elapsed, reduced, statuses, onUnsupported }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const coreRef = useRef<HTMLSpanElement>(null);
  // The newest props, readable from inside the animation loop.
  const latest = useRef({ startedAt, elapsed, reduced, onUnsupported });
  // Set by the setup effect so the props effect can ask for a redraw.
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // A phone gets a lighter scene: no wide glow, no rings, a lower pixel
    // ratio, no smoothing of edges, and no drawing once the replay ends.
    const light = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 600px)").matches;

    // Without WebGL there is nothing to draw: tell the parent, which then
    // shows the text status list on its own. Asking a spare canvas first
    // avoids three.js printing errors; creating the renderer can still
    // throw (for example when the graphics driver refuses), so that is
    // caught too.
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2") && !probe.getContext("webgl")) {
      latest.current.onUnsupported();
      return;
    }
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: !light, powerPreference: "low-power" });
    } catch {
      latest.current.onUnsupported();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, light ? 1.5 : 2));
    renderer.setClearColor(STAGE);
    host.prepend(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(32, 1, 0.1, 60);
    // Everything that turns together lives in this group.
    const field = new Group();
    scene.add(field);

    const glow = makeGlowTexture();
    const disposables: { dispose: () => void }[] = [glow];

    /** Makes one glowing dot. Sprites always face the camera. */
    function makeDot(color: Color | number, scale: number, opacity: number) {
      const material = new SpriteMaterial({
        map: glow,
        color,
        opacity,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(material);
      const dot = new Sprite(material);
      dot.scale.setScalar(scale);
      field.add(dot);
      return dot;
    }

    /** Makes a thin circle line, for the orbit and the rings round dots. */
    function makeRing(radius: number, segments: number, opacity: number) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(circlePoints(radius, segments), 3));
      const material = new LineBasicMaterial({ color: 0x8fa2ff, transparent: true, opacity, depthWrite: false });
      disposables.push(geometry, material);
      const ring = new LineLoop(geometry, material);
      field.add(ring);
      return ring;
    }

    // The buyer in the middle: a wide soft light (not on phones), then a
    // mint glow with a white center.
    if (!light) {
      makeDot(0x2340e8, 8, 0.45);
      makeRing(RADIUS, 120, 0.16);
    }
    const core = makeDot(MINT, 0.9, 0.9);
    makeDot(0xffffff, 0.3, 1);

    // One set of objects per provider. Each provider keeps a fixed place on
    // the circle; only colors, sizes, and the packets change over time.
    const nodes = flowProviders.map((provider, index) => {
      const angle = -Math.PI / 2 + (index / flowProviders.length) * Math.PI * 2;
      const place = new Vector3(Math.cos(angle) * RADIUS, (((index * 37) % 7) - 3) * 0.07, Math.sin(angle) * RADIUS);
      const dot = makeDot(DIM, 0.3, 0.5);
      dot.position.copy(place);
      // A ring that pulses while the provider is answering (not on phones).
      const ring = light ? null : makeRing(0.26, 40, 0);
      ring?.position.copy(place);
      return {
        provider,
        place,
        dot,
        ring,
        out: makeDot(WHITE, 0.24, 0),
        back: makeDot(MINT, 0.28, 0),
        // Current animated values, eased toward their targets each frame.
        // `level` is how far along the provider is (0 to 1); `mint` is 1
        // once it has answered.
        level: 0,
        mint: 0,
      };
    });

    // Lines from the buyer to each provider. One shared shape keeps this
    // cheap to draw. Each line is two points: the center, then the provider.
    const linePositions = new Float32Array(nodes.length * 6);
    const lineColors = new Float32Array(nodes.length * 6);
    nodes.forEach((node, index) => linePositions.set([0, 0, 0, node.place.x, node.place.y, node.place.z], index * 6));
    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute("position", new BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute("color", new BufferAttribute(lineColors, 3));
    const lineMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false });
    disposables.push(lineGeometry, lineMaterial);
    field.add(new LineSegments(lineGeometry, lineMaterial));

    let width = 1;
    let height = 1;
    /** Matches the drawing size to the box and backs the camera up to fit. */
    function resize() {
      width = Math.max(1, host!.clientWidth);
      height = Math.max(1, host!.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const halfView = Math.tan((camera.fov * Math.PI) / 360);
      const elevation = Math.min(0.9, ELEVATION + Math.max(0, 1.6 - camera.aspect) * 0.35);
      // Far enough to fit the circle (plus its tags) side to side, and top
      // to bottom.
      const forWidth = (RADIUS + 0.75) / (halfView * camera.aspect);
      const forHeight = (RADIUS * Math.sin(elevation) + 0.85) / halfView;
      const distance = Math.max(forWidth, forHeight);
      camera.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }

    /** Seconds into the replay, or the held moment when not playing. */
    function now() {
      const { startedAt: start, elapsed: held } = latest.current;
      return start === null ? held : (performance.now() - start) / 1000;
    }

    let spin = 0;
    const scratch = new Vector3();
    const tint = new Color();

    /** Moves everything one step toward its target and draws a frame. */
    function draw(seconds: number) {
      const still = latest.current.reduced;
      const time = now();
      // How far to move this frame. 1 means "jump straight to the target".
      const ease = still || seconds === 0 ? 1 : 1 - Math.exp(-seconds * 9);
      if (!still) spin += seconds * 0.06;
      field.rotation.set(0, spin, 0);

      // The buyer glows a little brighter just after each answer lands.
      let landing = 0;

      nodes.forEach((node, index) => {
        const { provider } = node;
        const status = statusAt(provider, time);
        const step = statusStep(status);
        node.level += (step / 4 - node.level) * ease;
        node.mint += ((status === "Answered" ? 1 : 0) - node.mint) * ease;

        // Dim blue before the RFP is sent, brighter as the provider works
        // on it, mint once the answer is in.
        tint.copy(DIM).lerp(BRIGHT, Math.min(1, node.level * 1.5)).lerp(MINT, node.mint);
        // While answering, the dot and its ring breathe, to show work in
        // progress. With less motion they hold still.
        const pulse = status === "Answering" && !still ? Math.sin(time * 6 + index) * 0.5 + 0.5 : 0;
        node.dot.material.color.copy(tint);
        node.dot.material.opacity = 0.5 + node.level * 0.5;
        node.dot.scale.setScalar(0.3 + node.level * 0.18 + pulse * 0.08);
        if (node.ring) {
          node.ring.material.color.copy(tint);
          node.ring.material.opacity = status === "Answering" ? 0.3 + pulse * 0.5 : node.mint * 0.3;
          node.ring.scale.setScalar(1 + pulse * 0.25);
        }

        // The line brightens toward the provider once the RFP is sent.
        const strength = 0.14 + node.level * 0.5;
        lineColors.set(
          [tint.r * strength * 0.45, tint.g * strength * 0.45, tint.b * strength * 0.45, tint.r * strength, tint.g * strength, tint.b * strength],
          index * 6,
        );

        // The RFP travels out from the buyer to the provider...
        const out = (time - provider.sentAt) / TRAVEL_SECONDS;
        if (!still && out >= 0 && out < 1) {
          node.out.position.copy(node.place).multiplyScalar(easeOut(out));
          node.out.material.opacity = 1;
        } else {
          node.out.material.opacity = 0;
        }
        // ...and the answer travels back from the provider to the buyer.
        const back = (time - provider.answeredAt) / TRAVEL_SECONDS;
        if (!still && back >= 0 && back < 1) {
          node.back.position.copy(node.place).multiplyScalar(1 - easeOut(back));
          node.back.material.opacity = 1;
        } else {
          node.back.material.opacity = 0;
        }
        const sinceLanding = time - (provider.answeredAt + TRAVEL_SECONDS);
        if (!still && sinceLanding >= 0 && sinceLanding < 0.5) landing = Math.max(landing, 1 - sinceLanding / 0.5);
      });
      lineGeometry.attributes.color.needsUpdate = true;
      core.scale.setScalar(0.9 + landing * 0.4);

      renderer.render(scene, camera);

      // Place each text tag over its dot by turning the dot's 3D position
      // into a spot on the screen.
      nodes.forEach((node, index) => {
        const tag = tagRefs.current[index];
        if (!tag) return;
        scratch.copy(node.place).applyMatrix4(field.matrixWorld).project(camera);
        const left = (scratch.x * 0.5 + 0.5) * width;
        const top = (-scratch.y * 0.5 + 0.5) * height;
        tag.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, -150%)`;
        tag.style.opacity = "1";
      });
      // The buyer's tag sits just under the glow in the middle.
      const coreTag = coreRef.current;
      if (coreTag) {
        scratch.set(0, 0, 0).applyMatrix4(field.matrixWorld).project(camera);
        const left = (scratch.x * 0.5 + 0.5) * width;
        const top = (-scratch.y * 0.5 + 0.5) * height;
        coreTag.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, 110%)`;
        coreTag.style.opacity = "1";
      }
    }

    /** True while there is still something to animate. */
    function moving() {
      if (latest.current.reduced) return false;
      // A wide screen keeps turning slowly. A phone stops once the replay
      // has finished, to save battery.
      return !light || now() < FLOW_END_SECONDS + PHONE_SETTLE_SECONDS;
    }

    // The loop runs only while the stage is on screen, the tab is open, and
    // something is moving.
    let frame = 0;
    let previous = 0;
    let onScreen = false;
    function tick(clock: number) {
      // Cap the step so a long pause does not make things jump.
      draw(Math.min(0.05, (clock - previous) / 1000));
      previous = clock;
      frame = moving() ? requestAnimationFrame(tick) : 0;
    }
    function sync() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (onScreen && !document.hidden && moving()) {
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      } else {
        // Nothing to animate (or not visible): draw one still frame.
        draw(0);
      }
    }
    redraw.current = sync;

    const sizeWatcher = new ResizeObserver(() => {
      resize();
      if (!frame) draw(0);
    });
    sizeWatcher.observe(host);
    const viewWatcher = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    viewWatcher.observe(host);
    document.addEventListener("visibilitychange", sync);

    resize();
    draw(0);
    // Tells the CSS that the canvas is live, so it can fade in.
    host.dataset.live = "true";

    // Clean up when the component leaves the page, to free GPU memory.
    return () => {
      cancelAnimationFrame(frame);
      redraw.current = null;
      sizeWatcher.disconnect();
      viewWatcher.disconnect();
      document.removeEventListener("visibilitychange", sync);
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      delete host.dataset.live;
    };
  }, []);

  // When a replay starts or the motion setting changes, hand the new values
  // to the loop and restart it if it had stopped.
  useEffect(() => {
    latest.current = { startedAt, elapsed, reduced, onUnsupported };
    redraw.current?.();
  }, [startedAt, elapsed, reduced, onUnsupported]);

  return (
    <div className="co-fp-gl" ref={hostRef}>
      <span className="co-fp-tag co-fp-tag-core" ref={coreRef}>Buyer&apos;s RFP</span>
      {flowProviders.map((provider, index) => (
        <span
          className={statuses[index] === "Answered" ? "co-fp-tag co-fp-tag-on" : "co-fp-tag"}
          key={provider.id}
          ref={(element) => {
            tagRefs.current[index] = element;
          }}
        >
          {provider.id}
          <b>{statuses[index]}</b>
        </span>
      ))}
    </div>
  );
}
