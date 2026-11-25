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

import { RING_SCORES, needPlace, radiusFor, sceneAt, sceneNeeds } from "./story-scene";

type Props = {
  /**
   * Returns where the visitor is in the story, 0 to 6. The stage reads it
   * every frame instead of taking it as a prop, so scrolling never makes
   * React re-render the stage.
   */
  readProgress: () => number;
};

// Colors from the Cobalt palette, the same as the home page fit field.
const STAGE = 0x0b1541; // deep navy background
const DIM = new Color(0x5b74ff); // a provider that is not a contender
const BRIGHT = new Color(0xd3dcff); // a provider with a tag (top five)
const MINT = new Color(0x8ef0c9); // a picked contender, and "your needs"

// The camera looks down at the field from this angle (radians) on a wide
// stage, and from higher up on a tall one (see resize below).
const ELEVATION = 0.5;

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

/** Points around a flat circle of radius 1, for ring outlines. */
function circleGeometry() {
  const points: number[] = [];
  for (let step = 0; step < 96; step += 1) {
    const angle = (step / 96) * Math.PI * 2;
    points.push(Math.cos(angle), 0, Math.sin(angle));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  return geometry;
}

/**
 * The 3D stage of the /how-it-works scroll story. It reuses the look of the
 * home page fit field: a navy stage, "your needs" glowing in the middle,
 * provider dots whose distance from the middle is their fit.
 *
 * As the visitor scrolls the steps, the needs fly in, masked providers
 * appear and glide in by score, an advisor sweep reveals names, five turn
 * mint, one RFP travels out to each, and one provider is signed.
 * Everything it shows comes from sceneAt() in story-scene.ts.
 *
 * Loaded only on wide screens with motion allowed, and only when the story
 * is near the screen (StepStory.tsx). The loop runs only while the stage is
 * on screen and the tab is visible.
 */
export function StoryStage({ readProgress }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const providerTags = useRef<(HTMLSpanElement | null)[]>([]);
  const needTags = useRef<(HTMLSpanElement | null)[]>([]);
  const coreRef = useRef<HTMLSpanElement>(null);
  // The read function can change between renders; the loop reads the newest.
  const reader = useRef(readProgress);
  useEffect(() => {
    reader.current = readProgress;
  }, [readProgress]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Without WebGL we stop here and the flat still picture behind the
    // canvas stays. Asking a spare canvas first avoids three.js logging
    // errors on such devices; the spare context is released straight away.
    const probe = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    if (!probe) return;
    probe.getExtension("WEBGL_lose_context")?.loseContext();
    // Creating the renderer can still throw (for example, the GPU is busy).
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
    // Everything that turns together lives in this group.
    const field = new Group();
    scene.add(field);

    const glow = makeGlowTexture();
    const circle = circleGeometry();
    const disposables: { dispose: () => void }[] = [glow, circle];

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

    /** Makes one flat ring outline of radius 1; scale it to size. */
    function makeRing(color: number, opacity: number) {
      const material = new LineBasicMaterial({ color, transparent: true, opacity });
      disposables.push(material);
      return new LineLoop(circle, material);
    }

    // A wide soft light under the field, then "your needs" in the middle.
    field.add(makeDot(0x2340e8, 9, 0.5));
    const coreGlow = makeDot(MINT, 0.9, 0.9);
    field.add(coreGlow);
    field.add(makeDot(0xffffff, 0.3, 1));

    // Score guide rings, so the eye can read distance as a score band.
    const rings = RING_SCORES.map((score, index) => {
      const ring = makeRing(0x8fa2ff, 0);
      ring.scale.setScalar(radiusFor(score));
      field.add(ring);
      return { ring, strength: 0.34 - index * 0.08 };
    });

    // The advisor review sweep: one mint ring that grows from the middle.
    const sweep = makeRing(0x8ef0c9, 0);
    field.add(sweep);

    // The needs that fly into the middle in step 01.
    const needDots = sceneNeeds.map(() => {
      const dot = makeDot(MINT, 0.22, 0);
      field.add(dot);
      return dot;
    });

    // One dot per sample provider, plus a small "RFP" packet for each that
    // travels out along its line in step 05.
    const start = sceneAt(0);
    const count = start.providers.length;
    const dots = start.providers.map(() => {
      const dot = makeDot(DIM, 0.3, 0);
      const packet = makeDot(0xffffff, 0.2, 0);
      field.add(dot, packet);
      return { dot, packet };
    });

    // Lines from the middle to each provider. One shared shape keeps this
    // cheap: each line is two points, and its color sets its brightness.
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
      // A taller stage looks down from higher up, so the field fills more
      // of the height (the same idea as the home page fit field).
      const elevation = Math.min(0.8, ELEVATION + Math.max(0, 1.6 - camera.aspect) * 0.5);
      // Far enough to fit the field side to side, and top to bottom.
      const forWidth = 4.4 / (halfView * camera.aspect);
      const forHeight = (4.2 * Math.sin(elevation) + 0.6) / halfView;
      const distance = Math.max(forWidth, forHeight);
      camera.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance);
      camera.lookAt(0, -0.1, 0);
      camera.updateProjectionMatrix();
    }

    // The progress on screen. It chases the scroll position with a quick,
    // soft landing, so a fast scroll still reads as movement, not a jump.
    let shown = reader.current();
    let spin = 0;
    const scratch = new Vector3();
    const tint = new Color();

    /** Turns a point in the field into a pixel spot inside the stage. */
    function toScreen(x: number, y: number, z: number) {
      scratch.set(x, y, z).applyMatrix4(field.matrixWorld).project(camera);
      return { left: (scratch.x * 0.5 + 0.5) * width, top: (-scratch.y * 0.5 + 0.5) * height };
    }

    /** Moves one step toward the scroll position and draws a frame. */
    function draw(seconds: number) {
      shown += (reader.current() - shown) * (1 - Math.exp(-seconds * 7));
      // A slow turn keeps the field reading as 3D. It is ambient only.
      spin += seconds * 0.05;
      field.rotation.set(0, spin, 0);
      field.updateMatrixWorld();

      const now = sceneAt(shown);
      coreGlow.scale.setScalar(0.7 + now.needsPull * 0.5);

      rings.forEach(({ ring, strength }) => {
        ring.material.opacity = strength * now.rings;
      });
      sweep.scale.setScalar(Math.max(0.01, now.sweep.radius));
      sweep.material.opacity = now.sweep.opacity * 0.9;

      needDots.forEach((dot, index) => {
        const need = needPlace(index, now.needsPull);
        dot.position.set(Math.cos(need.angle) * need.radius, 0.15, Math.sin(need.angle) * need.radius);
        dot.material.opacity = now.needsOpacity;
        const tag = needTags.current[index];
        if (tag) {
          const spot = toScreen(dot.position.x, dot.position.y, dot.position.z);
          tag.style.transform = `translate(${spot.left.toFixed(1)}px, ${spot.top.toFixed(1)}px) translate(-50%, -150%)`;
          tag.style.opacity = now.needsOpacity.toFixed(2);
        }
      });

      now.providers.forEach((provider, index) => {
        const { dot, packet } = dots[index];
        const x = Math.cos(provider.angle) * provider.radius;
        const z = Math.sin(provider.angle) * provider.radius;
        dot.position.set(x, provider.height, z);
        dot.scale.setScalar(0.26 + (provider.tag ? 0.2 : 0) + provider.picked * 0.08 + provider.chosen * 0.22);
        // Dim to bright for the top five, then mint once picked.
        tint.copy(DIM).lerp(BRIGHT, provider.tag ? 1 : 0).lerp(MINT, provider.picked);
        dot.material.color.copy(tint);
        dot.material.opacity = provider.opacity;

        if (provider.packet === null) {
          packet.material.opacity = 0;
        } else {
          packet.position.set(x * provider.packet, provider.height * provider.packet, z * provider.packet);
          packet.material.opacity = 1;
        }

        // The line runs from the middle (left at 0,0,0) to the dot.
        linkPositions.set([x, provider.height, z], index * 6 + 3);
        const strength = provider.link * 0.7;
        const lineColor = provider.chosen > 0.5 ? MINT : BRIGHT;
        // Slightly dimmer at the middle end, so the line reads as outgoing.
        const near = strength * 0.6;
        linkColors.set(
          [lineColor.r * near, lineColor.g * near, lineColor.b * near, lineColor.r * strength, lineColor.g * strength, lineColor.b * strength],
          index * 6,
        );

        const tag = providerTags.current[index];
        if (tag) {
          if (!provider.tag) {
            tag.style.opacity = "0";
          } else {
            const spot = toScreen(x, provider.height, z);
            tag.style.transform = `translate(${spot.left.toFixed(1)}px, ${spot.top.toFixed(1)}px) translate(-50%, -150%)`;
            tag.style.opacity = provider.tag.opacity.toFixed(2);
            // Change the words only when they change, to keep frames cheap.
            const name = tag.firstChild;
            if (name && name.textContent !== provider.tag.name) name.textContent = provider.tag.name;
            const note = tag.lastChild;
            if (note && note.textContent !== provider.tag.note) note.textContent = provider.tag.note;
            tag.classList.toggle("co-stage-tag-on", provider.tag.on);
          }
        }
      });
      linkGeometry.attributes.position.needsUpdate = true;
      linkGeometry.attributes.color.needsUpdate = true;

      renderer.render(scene, camera);

      // "Your needs" sits just under the glow in the middle.
      const core = coreRef.current;
      if (core) {
        const spot = toScreen(0, 0, 0);
        core.style.transform = `translate(${spot.left.toFixed(1)}px, ${spot.top.toFixed(1)}px) translate(-50%, 70%)`;
        core.style.opacity = "1";
      }
    }

    // The loop runs only while the stage is on screen and the tab is open.
    let frame = 0;
    let previous = 0;
    let onScreen = false;
    function tick(time: number) {
      // Cap the step so a long pause does not make things jump.
      draw(Math.min(0.05, (time - previous) / 1000));
      previous = time;
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (onScreen && !document.hidden) {
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }

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
    // Start where the visitor already is, with no catch-up animation.
    shown = reader.current();
    draw(0);
    // Tells the CSS that the canvas is live, so it can fade in over the
    // flat still picture.
    host.dataset.live = "true";

    // Clean up when the component leaves the page, to free GPU memory.
    return () => {
      cancelAnimationFrame(frame);
      sizeWatcher.disconnect();
      viewWatcher.disconnect();
      document.removeEventListener("visibilitychange", sync);
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      delete host.dataset.live;
    };
  }, []);

  const providers = sceneAt(0).providers;
  return (
    <div className="co-stage-gl co-hiw-gl" ref={hostRef}>
      <span className="co-stage-tag co-stage-tag-core" ref={coreRef}>Your needs</span>
      {sceneNeeds.map((label, index) => (
        <span
          className="co-stage-tag co-hiw-need"
          key={label}
          ref={(element) => {
            needTags.current[index] = element;
          }}
        >
          {label}
        </span>
      ))}
      {providers.map((provider, index) => (
        <span
          className="co-stage-tag"
          key={provider.letter}
          ref={(element) => {
            providerTags.current[index] = element;
          }}
        >
          {/* Two text parts: the name (or "Masked") and the score or status. */}
          <span>Masked</span>
          <b>{provider.score}</b>
        </span>
      ))}
    </div>
  );
}
