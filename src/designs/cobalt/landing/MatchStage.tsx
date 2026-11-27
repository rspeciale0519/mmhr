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

/** What the 3D stage needs to know about one provider. */
export type StageNode = {
  id: string;
  /** Fit score 0 to 100, or null when no needs are switched on. */
  score: number | null;
  /** True when the provider is on the ranking board (the top rows). */
  top: boolean;
  /** True when the visitor picked this provider as a contender. */
  picked: boolean;
  /** True while the visitor points at (or focuses) this provider's board row. */
  hot?: boolean;
};

type Props = {
  nodes: readonly StageNode[];
  /** True when the visitor asked their device for less motion. */
  reduced: boolean;
};

// Colors, taken from the Cobalt palette.
const STAGE = 0x0b1541; // deep navy background
const DIM = new Color(0x5b74ff); // a provider outside the top rows
const BRIGHT = new Color(0xd3dcff); // a provider on the board
const MINT = new Color(0x8ef0c9); // a picked contender, and "your needs"

// The camera looks down at the field from this angle (in radians) on a
// wide stage. On a tall, narrow stage (a phone) it looks from higher up, so
// the field fills the height and the tags have room.
const ELEVATION = 0.42;
// Scores that get a guide ring drawn on the field.
const RING_SCORES = [90, 75, 60];

/**
 * Turns a fit score into a distance from the center. A higher score sits
 * closer to "your needs" in the middle. This is the whole point of the 3D
 * view: distance means fit.
 */
function radiusFor(score: number | null) {
  if (score === null) return 3.1;
  return Math.min(3.6, Math.max(0.75, 0.75 + ((100 - score) / 55) * 2.9));
}

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
 * The 3D "fit field" for the home page demo. "Your needs" glow in the
 * middle and each masked provider is a dot. The closer a dot is to the
 * middle, the better it fits. Dots glide to new places when needs change.
 *
 * Alive before anyone touches it: the field turns slowly, the dots bob, the
 * center breathes and a ring pings out every few seconds (and at once when
 * a need is switched). With a mouse over the demo card, the camera and field
 * lean toward the pointer with a soft, weighty ease. Any pointer can drag
 * across the stage to spin it. Pointing at a board row makes its dot swell.
 * The loop pauses off screen and in hidden tabs; reduced motion draws one
 * still frame; without WebGL the CSS glow behind the canvas stays.
 *
 * This file is loaded only when the demo scrolls into view, so the 3D
 * library does not slow down the first page load.
 */
export function MatchStage({ nodes, reduced }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const coreRef = useRef<HTMLSpanElement>(null);
  // The newest props, readable from inside the animation loop.
  const latest = useRef({ nodes, reduced });
  // Set by the setup effect so the data effect can ask for a redraw.
  const redraw = useRef<(() => void) | null>(null);
  // Set by the setup effect: starts a ping ring from the center.
  const ping = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Creating the renderer throws when the device has no WebGL. In that
    // case we stop here and the plain CSS rings behind the canvas remain.
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(STAGE);
    host.prepend(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(32, 1, 0.1, 50);
    // Everything that spins together lives in this group.
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
      return dot;
    }

    // A wide soft light under the field, then "your needs" in the middle.
    field.add(makeDot(0x2340e8, 9, 0.5));
    const coreDot = makeDot(MINT, 0.9, 0.9);
    field.add(coreDot);
    field.add(makeDot(0xffffff, 0.3, 1));

    // Guide rings, so the eye can read distance as a score band.
    RING_SCORES.forEach((score, index) => {
      const radius = radiusFor(score);
      const points: number[] = [];
      for (let step = 0; step < 96; step += 1) {
        const angle = (step / 96) * Math.PI * 2;
        points.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
      const material = new LineBasicMaterial({ color: 0x8fa2ff, transparent: true, opacity: 0.34 - index * 0.08 });
      disposables.push(geometry, material);
      field.add(new LineLoop(geometry, material));
    });

    // A ring that grows out of "your needs" and fades, like a sonar ping.
    // It pings every few seconds while idle, and at once when the needs
    // change, so the field always looks alive and answers every toggle.
    const pulsePoints: number[] = [];
    for (let step = 0; step < 96; step += 1) {
      const angle = (step / 96) * Math.PI * 2;
      pulsePoints.push(Math.cos(angle), 0, Math.sin(angle));
    }
    const pulseGeometry = new BufferGeometry();
    pulseGeometry.setAttribute("position", new BufferAttribute(new Float32Array(pulsePoints), 3));
    const pulseMaterial = new LineBasicMaterial({ color: MINT, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    disposables.push(pulseGeometry, pulseMaterial);
    const pulse = new LineLoop(pulseGeometry, pulseMaterial);
    field.add(pulse);

    // One dot per provider. Each keeps a fixed direction from the center
    // and a small height offset, so only its distance changes when the
    // score changes. Stepping by 5 places around the circle keeps
    // neighbors in the list apart, so their tags do not overlap.
    const count = latest.current.nodes.length;
    const dots = latest.current.nodes.map((_, index) => {
      const dot = makeDot(DIM, 0.3, 0.6);
      field.add(dot);
      return {
        dot,
        angle: (((index * 5) % count) / count) * Math.PI * 2,
        height: (((index * 37) % 7) - 3) * 0.09,
        // Current animated values. Dots start far out and glide in.
        radius: latest.current.reduced ? radiusFor(latest.current.nodes[index].score) : 5.2,
        top: 0,
        picked: 0,
        hot: 0,
        // Each dot bobs up and down on its own beat.
        phase: index * 1.7,
      };
    });

    // Lines from the center to each provider. They only light up for the
    // providers on the board. One shared shape keeps this cheap to draw.
    const linkPositions = new Float32Array(count * 6);
    const linkColors = new Float32Array(count * 6);
    const linkGeometry = new BufferGeometry();
    linkGeometry.setAttribute("position", new BufferAttribute(linkPositions, 3));
    linkGeometry.setAttribute("color", new BufferAttribute(linkColors, 3));
    const linkMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false });
    disposables.push(linkGeometry, linkMaterial);
    field.add(new LineSegments(linkGeometry, linkMaterial));

    let width = 1;
    let height = 1;
    // Where the camera sits before the pointer leans it (set in resize).
    const base = { y: 0, z: 0, distance: 1 };
    /** Matches the drawing size to the box and backs the camera up to fit. */
    function resize() {
      width = Math.max(1, host!.clientWidth);
      height = Math.max(1, host!.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const halfView = Math.tan((camera.fov * Math.PI) / 360);
      const elevation = Math.min(0.85, ELEVATION + Math.max(0, 2 - camera.aspect) * 0.5);
      // Far enough to fit the field side to side, and top to bottom.
      const forWidth = 3.7 / (halfView * camera.aspect);
      const forHeight = (3.4 * Math.sin(elevation) + 0.45) / halfView;
      const distance = Math.max(forWidth, forHeight);
      base.y = Math.sin(elevation) * distance;
      base.z = Math.cos(elevation) * distance;
      base.distance = distance;
      camera.updateProjectionMatrix();
      aim();
    }

    /** Places the camera: its resting spot, leaned toward the pointer. */
    function aim() {
      camera.position.set(lean.x * base.distance * 0.16, base.y - lean.y * base.distance * 0.08, base.z);
      camera.lookAt(0, -0.15, 0);
    }

    // Pointer position over the demo, from -1 to 1 on each axis (mouse
    // only). `lean` follows it smoothly; the camera and field use `lean`.
    const pointer = { x: 0, y: 0 };
    const lean = { x: 0, y: 0 };
    // Turning: a slow steady spin, plus `fling`, the extra speed a drag
    // gives, which fades out on its own.
    let spin = 0.6;
    let fling = 0;
    let clock = 0;
    // Seconds since the last ping; starts so the first one comes soon.
    let sincePulse = 2.2;
    const scratch = new Vector3();
    const tint = new Color();

    /** Moves everything one step toward its target and draws a frame. */
    function draw(seconds: number) {
      const { nodes: current, reduced: still } = latest.current;
      // How far to move this frame. 1 means "jump straight to the target".
      const ease = still ? 1 : 1 - Math.exp(-seconds * 5);
      if (!still) {
        clock += seconds;
        spin += seconds * (0.12 + fling);
        fling *= Math.exp(-seconds * 1.6);
        // Lean toward the pointer with a softer ease, so it feels weighty.
        const follow = 1 - Math.exp(-seconds * 3);
        lean.x += (pointer.x - lean.x) * follow;
        lean.y += (pointer.y - lean.y) * follow;
        aim();
      }
      field.rotation.set(lean.y * 0.12, spin + lean.x * 0.35, 0);

      // "Your needs" breathes, and the ping ring travels outward.
      coreDot.scale.setScalar(still ? 0.9 : 0.9 + Math.sin(clock * 2.2) * 0.12);
      sincePulse += seconds;
      if (!still && sincePulse > 3.6) sincePulse = 0;
      const travel = Math.min(1, sincePulse / 1.8);
      pulse.scale.setScalar(0.4 + travel * 3.4);
      pulseMaterial.opacity = still ? 0 : (1 - travel) * 0.55;

      dots.forEach((item, index) => {
        const node = current[index];
        item.radius += (radiusFor(node.score) - item.radius) * ease;
        item.top += ((node.top ? 1 : 0) - item.top) * ease;
        item.picked += ((node.picked ? 1 : 0) - item.picked) * ease;
        item.hot += ((node.hot ? 1 : 0) - item.hot) * (still ? 1 : 1 - Math.exp(-seconds * 10));

        const x = Math.cos(item.angle) * item.radius;
        const z = Math.sin(item.angle) * item.radius;
        const y = item.height + (still ? 0 : Math.sin(clock * 1.3 + item.phase) * 0.07);
        item.dot.position.set(x, y, z);
        // A hot dot (its row is pointed at) swells and pulses.
        const throb = still ? 0 : Math.sin(clock * 7) * 0.05;
        item.dot.scale.setScalar(0.26 + item.top * 0.24 + item.picked * 0.1 + item.hot * (0.32 + throb));
        // Blend dim to bright as it joins the board, then to mint if picked
        // (and partly mint while its row is pointed at).
        tint.copy(DIM).lerp(BRIGHT, item.top).lerp(MINT, item.picked).lerp(MINT, item.hot * 0.6);
        item.dot.material.color.copy(tint);
        item.dot.material.opacity = node.score === null ? 0.35 : Math.min(1, 0.5 + item.top * 0.5 + item.hot * 0.5);

        // The link runs from the center (left at 0,0,0) to the dot.
        linkPositions.set([x, y, z], index * 6 + 3);
        const strength = Math.min(1, item.top * 0.55 + item.hot * 0.6);
        linkColors.set([0, 0, 0, tint.r * strength, tint.g * strength, tint.b * strength], index * 6);
      });
      linkGeometry.attributes.position.needsUpdate = true;
      linkGeometry.attributes.color.needsUpdate = true;

      renderer.render(scene, camera);

      // Place each text tag over its dot by turning the dot's 3D position
      // into a spot on the screen.
      dots.forEach((item, index) => {
        const tag = tagRefs.current[index];
        if (!tag) return;
        scratch.copy(item.dot.position).applyMatrix4(field.matrixWorld).project(camera);
        const left = (scratch.x * 0.5 + 0.5) * width;
        const top = (-scratch.y * 0.5 + 0.5) * height;
        tag.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, -155%)`;
        tag.style.opacity = Math.max(item.top, item.hot).toFixed(2);
      });
      // The "Your needs" tag sits just under the glow in the middle.
      const core = coreRef.current;
      if (core) {
        scratch.set(0, 0, 0).applyMatrix4(field.matrixWorld).project(camera);
        const left = (scratch.x * 0.5 + 0.5) * width;
        const top = (-scratch.y * 0.5 + 0.5) * height;
        core.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, 55%)`;
        core.style.opacity = "1";
      }
    }

    // The loop runs only while the stage is on screen and the tab is open.
    let frame = 0;
    let previous = 0;
    let onScreen = false;
    function tick(now: number) {
      // Cap the step so a long pause does not make things jump.
      draw(Math.min(0.05, (now - previous) / 1000));
      previous = now;
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (latest.current.reduced) {
        // Less motion: no loop. Draw one still frame instead.
        draw(0);
      } else if (onScreen && !document.hidden) {
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    redraw.current = sync;
    ping.current = () => {
      sincePulse = 0;
    };

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
    // Mouse: the whole demo card is the hover area, so the scene starts to
    // lean as soon as the pointer comes near it. Any pointer (mouse, finger,
    // pen) can also drag across the stage to spin the field; a quick flick
    // keeps it turning for a moment. CSS sets `touch-action: pan-y` on the
    // stage, so a vertical swipe still scrolls the page as usual.
    const area = host.closest<HTMLElement>(".co-demo") ?? host;
    let dragX: number | null = null;
    function onPointer(event: PointerEvent) {
      if (dragX !== null && event.pointerId === dragId) {
        const step = event.clientX - dragX;
        dragX = event.clientX;
        spin += step * 0.006;
        fling = Math.max(-2.4, Math.min(2.4, fling * 0.5 + step * 0.03));
      }
      if (event.pointerType !== "mouse") return;
      const box = host!.getBoundingClientRect();
      pointer.x = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width - 0.5) * 2));
      pointer.y = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height - 0.5) * 2));
    }
    let dragId = -1;
    function onDown(event: PointerEvent) {
      if (latest.current.reduced) return;
      dragX = event.clientX;
      dragId = event.pointerId;
      host!.dataset.drag = "true";
    }
    function onUp() {
      dragX = null;
      delete host!.dataset.drag;
    }
    function onLeave() {
      pointer.x = 0;
      pointer.y = 0;
    }
    area.addEventListener("pointermove", onPointer, { passive: true });
    area.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("visibilitychange", sync);

    resize();
    draw(0);
    // Tells the CSS that the canvas is live, so it can fade in.
    host.dataset.live = "true";

    // Clean up when the component leaves the page, to free GPU memory.
    return () => {
      cancelAnimationFrame(frame);
      redraw.current = null;
      ping.current = null;
      sizeWatcher.disconnect();
      viewWatcher.disconnect();
      area.removeEventListener("pointermove", onPointer);
      area.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", sync);
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      delete host.dataset.live;
    };
  }, []);

  // When the scores or the motion setting change, hand the new values to
  // the loop. With less motion there is no loop, so ask for one redraw.
  useEffect(() => {
    latest.current = { nodes, reduced };
    redraw.current?.();
  }, [nodes, reduced]);

  // When the scores change (a need was switched), ping at once.
  const scores = nodes.map((node) => node.score).join(",");
  const firstScores = useRef(scores);
  useEffect(() => {
    if (scores !== firstScores.current) ping.current?.();
  }, [scores]);

  return (
    <div className="co-stage-gl" ref={hostRef}>
      <span className="co-stage-tag co-stage-tag-core" ref={coreRef}>Your needs</span>
      {nodes.map((node, index) => (
        <span
          className={node.picked ? "co-stage-tag co-stage-tag-on" : "co-stage-tag"}
          key={node.id}
          ref={(element) => {
            tagRefs.current[index] = element;
          }}
        >
          {node.id}
          <b>{node.score}</b>
        </span>
      ))}
    </div>
  );
}
