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
    field.add(makeDot(MINT, 0.9, 0.9));
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
      camera.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance);
      camera.lookAt(0, -0.15, 0);
      camera.updateProjectionMatrix();
    }

    // Pointer position inside the stage, from -0.5 to 0.5. Mouse only.
    const pointer = { x: 0, y: 0 };
    let spin = 0.6;
    let lean = 0;
    let sway = 0;
    const scratch = new Vector3();
    const tint = new Color();

    /** Moves everything one step toward its target and draws a frame. */
    function draw(seconds: number) {
      const { nodes: current, reduced: still } = latest.current;
      // How far to move this frame. 1 means "jump straight to the target".
      const ease = still ? 1 : 1 - Math.exp(-seconds * 5);
      if (!still) {
        spin += seconds * 0.07;
        lean += (pointer.y * 0.18 - lean) * ease;
        sway += (pointer.x * 0.5 - sway) * ease;
      }
      field.rotation.set(lean, spin + sway, 0);

      dots.forEach((item, index) => {
        const node = current[index];
        item.radius += (radiusFor(node.score) - item.radius) * ease;
        item.top += ((node.top ? 1 : 0) - item.top) * ease;
        item.picked += ((node.picked ? 1 : 0) - item.picked) * ease;

        const x = Math.cos(item.angle) * item.radius;
        const z = Math.sin(item.angle) * item.radius;
        item.dot.position.set(x, item.height, z);
        item.dot.scale.setScalar(0.26 + item.top * 0.24 + item.picked * 0.1);
        // Blend dim to bright as it joins the board, then to mint if picked.
        tint.copy(DIM).lerp(BRIGHT, item.top).lerp(MINT, item.picked);
        item.dot.material.color.copy(tint);
        item.dot.material.opacity = node.score === null ? 0.35 : 0.5 + item.top * 0.5;

        // The link runs from the center (left at 0,0,0) to the dot.
        linkPositions.set([x, item.height, z], index * 6 + 3);
        const strength = item.top * 0.55;
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
        tag.style.opacity = item.top.toFixed(2);
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
    function onPointer(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      const box = host!.getBoundingClientRect();
      pointer.x = (event.clientX - box.left) / box.width - 0.5;
      pointer.y = (event.clientY - box.top) / box.height - 0.5;
    }
    function onLeave() {
      pointer.x = 0;
      pointer.y = 0;
    }
    host.addEventListener("pointermove", onPointer);
    host.addEventListener("pointerleave", onLeave);
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
      host.removeEventListener("pointermove", onPointer);
      host.removeEventListener("pointerleave", onLeave);
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
