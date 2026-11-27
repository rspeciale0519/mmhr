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
  Points,
  PointsMaterial,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from "three";

import { FINE_POINTER, matches } from "../../motion/media";
import {
  FLOW_END_SECONDS,
  TRAVEL_SECONDS,
  flowProviders,
  statusAt,
  statusStep,
  type RfpFlowStatus,
} from "./rfp-flow";

/**
 * What the visitor is pointing at outside the canvas: a stage in the
 * stepper (`status`: light up every provider that has reached it) or a row
 * in the status list (`provider`: light up that one provider).
 */
export type FlowHighlight = { status: RfpFlowStatus } | { provider: number } | null;

type Props = {
  /**
   * `performance.now()` when the current replay started, or null when the
   * timeline holds still at `elapsed` (before the first replay, after a
   * jump to a stage, while paused, and with reduced motion).
   */
  startedAt: number | null;
  /** The moment to show while `startedAt` is null. Infinity = finished. */
  elapsed: number;
  /** True when the visitor asked their device for less motion. */
  reduced: boolean;
  /** True when the visitor pressed Pause: every movement stops. */
  paused: boolean;
  /** The part of the scene to light up, or null. */
  highlight: FlowHighlight;
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
// How high a document arcs above its line while it travels.
const ARC = 0.45;
// Trail dots behind each travelling document (wide screens only).
const TRAIL = 4;
// Sparkles drifting around the circle (wide screens only).
const SPARKLES = 70;

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

/**
 * Draws a small sheet of paper once: a rounded page with a folded corner
 * and a few text lines. White, so a material color can tint it (white for
 * the RFP going out, mint for an answer coming back).
 */
function makeDocTexture() {
  const width = 48;
  const height = 60;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#fff";
    context.beginPath();
    // roundRect is newer; a plain rectangle is fine where it is missing.
    if (typeof context.roundRect === "function") context.roundRect(4, 3, width - 8, height - 6, 5);
    else context.rect(4, 3, width - 8, height - 6);
    context.fill();
    // Cut the text lines and the folded corner out of the page.
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "rgba(0,0,0,.5)";
    [16, 24, 32, 40].forEach((y, index) => context.fillRect(11, y, index === 3 ? 16 : 26, 3));
    context.fillStyle = "rgba(0,0,0,.6)";
    context.beginPath();
    context.moveTo(width - 16, 3);
    context.lineTo(width - 4, 15);
    context.lineTo(width - 16, 15);
    context.closePath();
    context.fill();
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

/** Smooth in and out, for documents that lift off and land. */
function easeInOut(progress: number) {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
}

/**
 * The 3D picture of one RFP going out to up to five providers and the
 * answers coming back. The buyer sits in the middle; each provider is a dot
 * on a circle around it. A white page (the RFP) arcs out along each line
 * when it is sent, the dot brightens as the provider opens and answers it,
 * and a mint page (the answer) arcs back when the answer is in.
 *
 * Between and after the replay the scene stays alive while it is on
 * screen: the circle turns slowly, the providers float, sparkles drift
 * round the orbit, and once every answer is back, soft waves ripple out
 * from the buyer and light runs along the lines. The field also leans a
 * little toward the mouse. Pause (or reduced motion) holds everything still.
 *
 * Jumping to a stage does not cut: the scene runs quickly forward (or back)
 * to the new moment, so the visitor sees the pages fly.
 *
 * The whole picture repeats the text status list beside it, so the canvas
 * is hidden from screen readers by the parent (aria-hidden).
 *
 * This file (and the three.js library) loads only when the illustration
 * comes near the screen, so it does not slow down the first page load.
 */
export function RfpStage({ startedAt, elapsed, reduced, paused, highlight, statuses, onUnsupported }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const coreRef = useRef<HTMLSpanElement>(null);
  // The newest props, readable from inside the animation loop.
  const latest = useRef({ startedAt, elapsed, reduced, paused, highlight, onUnsupported });
  // Set by the setup effect so the props effect can ask for a redraw.
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // A phone gets a lighter scene: no wide glow, rings, trails, sparkles or
    // waves, a lower pixel ratio, no smoothing of edges, and no drawing once
    // the replay ends.
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
    // `lean` tips toward the mouse; `field` (inside it) turns slowly.
    const lean = new Group();
    const field = new Group();
    lean.add(field);
    scene.add(lean);

    const glow = makeGlowTexture();
    const paper = makeDocTexture();
    const disposables: { dispose: () => void }[] = [glow, paper];

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

    /** Makes one travelling page (the RFP out, or an answer back). */
    function makeDoc(color: Color) {
      const material = new SpriteMaterial({ map: paper, color, opacity: 0, transparent: true, depthWrite: false });
      disposables.push(material);
      const doc = new Sprite(material);
      doc.scale.set(0.27, 0.34, 1);
      doc.renderOrder = 2;
      field.add(doc);
      return doc;
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

    // Waves that ripple out from the buyer once every answer is back.
    const waves = light ? [] : [makeRing(1, 96, 0), makeRing(1, 96, 0)];

    // Sparkles drifting round the orbit, in their own slowly turning group.
    let sparkles: Points | null = null;
    if (!light) {
      const positions = new Float32Array(SPARKLES * 3);
      for (let index = 0; index < SPARKLES; index += 1) {
        // A fixed pattern (no randomness), so every visit looks the same.
        const angle = (index / SPARKLES) * Math.PI * 2 + Math.sin(index * 12.9898) * 0.3;
        const radius = RADIUS + Math.sin(index * 78.233) * 0.55;
        positions.set([Math.cos(angle) * radius, Math.sin(index * 3.7) * 0.35, Math.sin(angle) * radius], index * 3);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      const material = new PointsMaterial({
        map: glow,
        color: 0xb8c4ff,
        size: 0.09,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(geometry, material);
      sparkles = new Points(geometry, material);
      lean.add(sparkles);
    }

    // One set of objects per provider. Each provider keeps a fixed place on
    // the circle; only colors, sizes, and the pages change over time.
    const nodes = flowProviders.map((provider, index) => {
      const angle = -Math.PI / 2 + (index / flowProviders.length) * Math.PI * 2;
      const place = new Vector3(Math.cos(angle) * RADIUS, (((index * 37) % 7) - 3) * 0.07, Math.sin(angle) * RADIUS);
      // A wide halo that lights up when the visitor points at this provider
      // (or at a stage it has reached).
      const halo = makeDot(WHITE, 1.1, 0);
      const dot = makeDot(DIM, 0.3, 0.5);
      dot.position.copy(place);
      // A ring that pulses while the provider is answering (not on phones).
      const ring = light ? null : makeRing(0.26, 40, 0);
      ring?.position.copy(place);
      return {
        provider,
        place,
        // Where the dot is right now: its place, plus a gentle float.
        spot: place.clone(),
        halo,
        dot,
        ring,
        out: makeDoc(WHITE),
        back: makeDoc(MINT),
        outTrail: light ? [] : Array.from({ length: TRAIL }, () => makeDot(WHITE, 0.14, 0)),
        backTrail: light ? [] : Array.from({ length: TRAIL }, () => makeDot(MINT, 0.14, 0)),
        // A spark that runs along the line once the replay is over.
        spark: light ? null : makeDot(MINT, 0.18, 0),
        // Current animated values, eased toward their targets each frame.
        // `level` is how far along the provider is (0 to 1); `mint` is 1
        // once it has answered; `lit` is the highlight (0 to 1).
        level: 0,
        mint: 0,
        lit: 0,
      };
    });

    // Lines from the buyer to each provider. One shared shape keeps this
    // cheap to draw. Each line is two points: the center, then the provider.
    const linePositions = new Float32Array(nodes.length * 6);
    const lineColors = new Float32Array(nodes.length * 6);
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

    /** Seconds into the replay the props ask for (finished = just past the end). */
    function target() {
      const { startedAt: start, elapsed: held } = latest.current;
      const seconds = start === null ? held : (performance.now() - start) / 1000;
      return Math.min(seconds, FLOW_END_SECONDS + 0.6);
    }

    // The moment on screen. It follows `target()` exactly while playing;
    // after a jump it runs there quickly instead of cutting (`scrubbing`).
    let shown = target();
    let scrubbing = false;
    // Seconds of idle movement (float, drift, waves). Stops while paused.
    let idle = 0;
    let spin = 0;
    // The mouse lean: where it is heading (-1..1) and where it is now.
    const leanTo = { x: 0, y: 0 };
    const leanNow = { x: 0, y: 0 };
    // How much of the "all answered" idle (waves, sparks) is showing.
    let done = 0;
    const scratch = new Vector3();
    const tint = new Color();

    /** Is this provider lit by the current highlight? */
    function isLit(index: number, step: number) {
      const chosen = latest.current.highlight;
      if (!chosen) return false;
      if ("provider" in chosen) return chosen.provider === index;
      return step >= statusStep(chosen.status);
    }

    /** Moves everything one step toward its target and draws a frame. */
    function draw(seconds: number) {
      const { reduced: still, paused: held, highlight: chosen } = latest.current;
      const alive = !still && !held;
      // How far to move this frame. 1 means "jump straight to the target".
      const ease = still || seconds === 0 ? 1 : 1 - Math.exp(-seconds * 9);

      // Follow the timeline, or run to a stage the visitor jumped to.
      const goal = target();
      if (still) {
        shown = goal;
        scrubbing = false;
      } else if (scrubbing || Math.abs(goal - shown) > 0.3) {
        scrubbing = true;
        shown += (goal - shown) * (1 - Math.exp(-seconds * 5));
        if (Math.abs(goal - shown) < 0.02) {
          shown = goal;
          scrubbing = false;
        }
      } else {
        shown = goal;
      }
      const time = shown;

      if (alive) {
        idle += seconds;
        spin += seconds * 0.06;
      }
      field.rotation.set(0, spin, 0);
      if (sparkles) sparkles.rotation.y = -idle * 0.035;

      // Lean toward the mouse, softly.
      const leanEase = still ? 1 : 1 - Math.exp(-seconds * 4);
      leanNow.x += (leanTo.x - leanNow.x) * leanEase;
      leanNow.y += (leanTo.y - leanNow.y) * leanEase;
      lean.rotation.set(leanNow.y * 0.16, 0, -leanNow.x * 0.1);
      lean.position.x = leanNow.x * 0.12;

      done += ((time >= FLOW_END_SECONDS && !still ? 1 : 0) - done) * (seconds === 0 ? 1 : 1 - Math.exp(-seconds * 2));

      // The buyer glows a little brighter just after each answer lands.
      let landing = 0;

      nodes.forEach((node, index) => {
        const { provider } = node;
        const status = statusAt(provider, time);
        const step = statusStep(status);
        node.level += (step / 4 - node.level) * ease;
        node.mint += ((status === "Answered" ? 1 : 0) - node.mint) * ease;
        const lit = isLit(index, step);
        node.lit += ((lit ? 1 : 0) - node.lit) * (seconds === 0 ? 1 : 1 - Math.exp(-seconds * 10));
        // Something else is highlighted: this provider steps back.
        const dim = chosen && !lit ? 0.35 : 1;

        // A gentle float, different for each provider.
        node.spot.copy(node.place);
        if (!still) node.spot.y += Math.sin(idle * 1.3 + index * 1.7) * 0.06;

        // Dim blue before the RFP is sent, brighter as the provider works
        // on it, mint once the answer is in.
        tint.copy(DIM).lerp(BRIGHT, Math.min(1, node.level * 1.5)).lerp(MINT, node.mint);
        // While answering, the dot and its ring breathe, to show work in
        // progress. With less motion they hold still.
        const pulse = status === "Answering" && !still ? Math.sin((held ? time : idle) * 6 + index) * 0.5 + 0.5 : 0;
        node.dot.position.copy(node.spot);
        node.dot.material.color.copy(tint);
        node.dot.material.opacity = (0.5 + node.level * 0.5) * dim;
        node.dot.scale.setScalar(0.3 + node.level * 0.18 + pulse * 0.08 + node.lit * 0.12);
        node.halo.position.copy(node.spot);
        node.halo.material.color.copy(tint);
        node.halo.material.opacity = node.lit * 0.4;
        node.halo.scale.setScalar(0.7 + node.lit * 0.3);
        if (node.ring) {
          node.ring.position.copy(node.spot);
          node.ring.material.color.copy(tint);
          node.ring.material.opacity = (status === "Answering" ? 0.3 + pulse * 0.5 : node.mint * 0.3 + node.lit * 0.5) * dim;
          node.ring.scale.setScalar(1 + pulse * 0.25 + node.lit * 0.4);
        }

        // The line brightens toward the provider once the RFP is sent.
        const strength = (0.14 + node.level * 0.5 + node.lit * 0.35) * dim;
        linePositions.set([0, 0, 0, node.spot.x, node.spot.y, node.spot.z], index * 6);
        lineColors.set(
          [tint.r * strength * 0.45, tint.g * strength * 0.45, tint.b * strength * 0.45, tint.r * strength, tint.g * strength, tint.b * strength],
          index * 6,
        );

        // The RFP arcs out from the buyer to the provider, with a short
        // trail of light behind it...
        travel(node.out, node.outTrail, (time - provider.sentAt) / TRAVEL_SECONDS, node.spot, false, still);
        // ...and the answer arcs back from the provider to the buyer.
        travel(node.back, node.backTrail, (time - provider.answeredAt) / TRAVEL_SECONDS, node.spot, true, still);

        const sinceLanding = time - (provider.answeredAt + TRAVEL_SECONDS);
        if (!still && sinceLanding >= 0 && sinceLanding < 0.5) landing = Math.max(landing, 1 - sinceLanding / 0.5);

        // Once every answer is back, light runs out along each line.
        if (node.spark) {
          const run = (idle * 0.45 + index * 0.21) % 1;
          node.spark.position.copy(node.spot).multiplyScalar(run);
          node.spark.material.opacity = done * Math.sin(run * Math.PI) * 0.8 * dim;
        }
      });
      lineGeometry.attributes.position.needsUpdate = true;
      lineGeometry.attributes.color.needsUpdate = true;

      // The buyer breathes, and flares when an answer lands.
      const breath = still ? 0 : Math.sin(idle * 2.2) * 0.06;
      core.scale.setScalar(0.9 + landing * 0.4 + breath + done * 0.08);

      // Waves ripple out from the buyer after the last answer.
      waves.forEach((wave, index) => {
        const phase = (idle * 0.32 + index * 0.5) % 1;
        wave.scale.setScalar(0.3 + phase * RADIUS * 1.05);
        wave.material.opacity = done * (1 - phase) * 0.32;
        wave.material.color.copy(MINT);
      });

      renderer.render(scene, camera);

      // Place each text tag over its dot by turning the dot's 3D position
      // into a spot on the screen.
      nodes.forEach((node, index) => {
        const tag = tagRefs.current[index];
        if (!tag) return;
        scratch.copy(node.spot).applyMatrix4(field.matrixWorld).project(camera);
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

    /**
     * Places one travelling page `progress` (0..1) of the way along its
     * line, lifted in an arc and tipping as it flies, with its trail behind.
     * `home` is true for answers, which travel from the provider back.
     */
    function travel(doc: Sprite, trail: Sprite[], progress: number, spot: Vector3, home: boolean, still: boolean) {
      const flying = !still && progress >= 0 && progress < 1;
      doc.material.opacity = flying ? Math.min(1, progress * 8, (1 - progress) * 8) : 0;
      if (flying) {
        place(doc.position, spot, progress, home);
        doc.material.rotation = Math.sin(progress * Math.PI) * (home ? 0.4 : -0.4);
        doc.scale.set(0.27 + Math.sin(progress * Math.PI) * 0.07, 0.34 + Math.sin(progress * Math.PI) * 0.09, 1);
      }
      trail.forEach((dot, index) => {
        const behind = progress - (index + 1) * 0.06;
        const on = flying && behind > 0;
        dot.material.opacity = on ? 0.5 * (1 - index / TRAIL) : 0;
        if (on) place(dot.position, spot, behind, home);
      });
    }

    /** Writes the point `progress` of the way along a line, on its arc. */
    function place(into: Vector3, spot: Vector3, progress: number, home: boolean) {
      const along = easeInOut(progress);
      into.copy(spot).multiplyScalar(home ? 1 - along : along);
      into.y += Math.sin(progress * Math.PI) * ARC;
    }

    /** True while there is still something to animate. */
    function moving() {
      const { reduced: still, paused: held } = latest.current;
      if (still) return false;
      const leaning = Math.abs(leanTo.x - leanNow.x) + Math.abs(leanTo.y - leanNow.y) > 0.002;
      if (held) return scrubbing || leaning;
      // A wide screen keeps its idle movement. A phone stops once the
      // replay has finished, to save battery.
      return !light || scrubbing || target() < FLOW_END_SECONDS + PHONE_SETTLE_SECONDS;
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
      if (onScreen && !document.hidden && moving()) {
        if (frame) return;
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(frame);
        frame = 0;
        // Nothing to animate (or not visible): draw one still frame.
        draw(0);
      }
    }
    redraw.current = sync;

    // The field leans toward the mouse (mouse and trackpad only).
    const fine = matches(FINE_POINTER);
    const onPointerMove = (event: PointerEvent) => {
      if (!fine || event.pointerType !== "mouse" || latest.current.reduced) return;
      const rect = host.getBoundingClientRect();
      leanTo.x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      leanTo.y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
      sync();
    };
    const onPointerLeave = () => {
      leanTo.x = 0;
      leanTo.y = 0;
      sync();
    };
    host.addEventListener("pointermove", onPointerMove, { passive: true });
    host.addEventListener("pointerleave", onPointerLeave);

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
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      delete host.dataset.live;
    };
  }, []);

  // When a replay starts, the visitor jumps, pauses, or points at a part,
  // hand the new values to the loop and restart it if it had stopped.
  useEffect(() => {
    latest.current = { startedAt, elapsed, reduced, paused, highlight, onUnsupported };
    redraw.current?.();
  }, [startedAt, elapsed, reduced, paused, highlight, onUnsupported]);

  /** Is the tag of provider `index` part of the highlight? */
  const tagLit = (index: number) => {
    if (!highlight) return undefined;
    if ("provider" in highlight) return highlight.provider === index ? "on" : "off";
    return statusStep(statuses[index]) >= statusStep(highlight.status) ? "on" : "off";
  };

  return (
    <div className="co-fp-gl" ref={hostRef}>
      <span className="co-fp-tag co-fp-tag-core" ref={coreRef}>Buyer&apos;s RFP</span>
      {flowProviders.map((provider, index) => (
        <span
          className={statuses[index] === "Answered" ? "co-fp-tag co-fp-tag-on" : "co-fp-tag"}
          data-lit={tagLit(index)}
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
