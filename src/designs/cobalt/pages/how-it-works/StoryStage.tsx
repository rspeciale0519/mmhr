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
import { RING_SCORES, activeStepAt, needPlace, radiusFor, sceneAt, sceneNeeds } from "./story-scene";

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
// stage, and from higher up on a tall one (see resize below). Through the
// story it sinks a little lower (ELEVATION_DRIFT at step 01, none at 06),
// so scrolling feels like a slow camera move, not just dots changing.
const ELEVATION = 0.5;
const ELEVATION_DRIFT = 0.09;

// How quickly the picture catches up with the scroll position (per second).
// Lower is softer: a fast scroll or a step-rail jump plays as a glide.
const FOLLOW = 4.2;

/** A small, fixed "random" number from 0 to 1, so the dust is the same every visit. */
function hash(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Dust: faint specks floating over and under the field, for depth. */
function dustGeometry(count: number) {
  const points = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 0.6 + hash(index) * 4.6;
    const angle = hash(index + 99) * Math.PI * 2;
    points.set([Math.cos(angle) * radius, -0.7 + hash(index + 7) * 2.1, Math.sin(angle) * radius], index * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(points, 3));
  return geometry;
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
 * Everything the story shows comes from sceneAt() in story-scene.ts.
 *
 * On top of the story, the stage is alive while it is on screen:
 * - the picture glides to the scroll position (never jumps), and the camera
 *   sinks slowly lower as the story goes on;
 * - dots bob and twinkle, dust drifts, "your needs" sends out soft pulses,
 *   picked contenders wear a breathing ring, the signed provider ripples,
 *   and each RFP packet pulls a short trail;
 * - a bright ring runs out from the middle each time the step changes;
 * - with a mouse, the camera leans toward the pointer (and springs back).
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

    // Dust: tiny specks that turn a little slower than the field.
    const dustShape = dustGeometry(140);
    const dustMaterial = new PointsMaterial({
      map: glow,
      color: 0x8fa2ff,
      size: 0.07,
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(dustShape, dustMaterial);
    const dust = new Points(dustShape, dustMaterial);
    scene.add(dust);

    // Two soft pulses that keep leaving "your needs", half a beat apart.
    const pulses = [makeRing(0x8ef0c9, 0), makeRing(0x8ef0c9, 0)];
    field.add(...pulses);
    // The ring that runs out from the middle when the step changes.
    const stepRing = makeRing(0xd3dcff, 0);
    field.add(stepRing);
    // A breathing ring around each provider (shown once picked), and a
    // ripple for the one the buyer signs with.
    const halos = start.providers.map(() => {
      const halo = makeRing(0x8ef0c9, 0);
      field.add(halo);
      return halo;
    });
    const ripple = makeRing(0x8ef0c9, 0);
    field.add(ripple);
    // Each RFP packet pulls two fading specks behind it.
    const trails = start.providers.map(() => {
      const pair = [makeDot(0xd3dcff, 0.14, 0), makeDot(0xd3dcff, 0.1, 0)];
      field.add(...pair);
      return pair;
    });

    let width = 1;
    let height = 1;
    let baseElevation = ELEVATION;
    let distance = 10;
    /** Matches the drawing size to the box and backs the camera up to fit. */
    function resize() {
      width = Math.max(1, host!.clientWidth);
      height = Math.max(1, host!.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const halfView = Math.tan((camera.fov * Math.PI) / 360);
      // A taller stage looks down from higher up, so the field fills more
      // of the height (the same idea as the home page fit field).
      baseElevation = Math.min(0.8, ELEVATION + Math.max(0, 1.6 - camera.aspect) * 0.5);
      // Far enough to fit the field side to side, and top to bottom, at
      // the highest the camera goes (the start of the story).
      const forWidth = 4.4 / (halfView * camera.aspect);
      const forHeight = (4.2 * Math.sin(baseElevation + ELEVATION_DRIFT) + 0.6) / halfView;
      distance = Math.max(forWidth, forHeight);
      camera.updateProjectionMatrix();
    }

    /**
     * Puts the camera on its orbit: `elevation` up from the field, turned
     * `turn` radians around it. It always looks at the middle.
     */
    function placeCamera(elevation: number, turn: number) {
      const flat = Math.cos(elevation) * distance;
      camera.position.set(Math.sin(turn) * flat, Math.sin(elevation) * distance, Math.cos(turn) * flat);
      camera.lookAt(0, -0.1, 0);
      camera.updateMatrixWorld();
    }

    // Where the pointer is over the stage, -1 to 1 from its middle (mouse
    // only). The camera eases toward it, so it never twitches.
    const pointer = { x: 0, y: 0 };
    const lean = { x: 0, y: 0 };
    const stage = host.parentElement ?? host;
    let stageBox = stage.getBoundingClientRect();
    const onPointerEnter = () => {
      stageBox = stage.getBoundingClientRect();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer.x = ((event.clientX - stageBox.left) / Math.max(1, stageBox.width)) * 2 - 1;
      pointer.y = ((event.clientY - stageBox.top) / Math.max(1, stageBox.height)) * 2 - 1;
    };
    const onPointerLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };
    const fine = matches(FINE_POINTER);
    if (fine) {
      stage.addEventListener("pointerenter", onPointerEnter);
      stage.addEventListener("pointermove", onPointerMove, { passive: true });
      stage.addEventListener("pointerleave", onPointerLeave);
    }

    // The progress on screen. It chases the scroll position with a quick,
    // soft landing, so a fast scroll still reads as movement, not a jump.
    let shown = reader.current();
    let spin = 0;
    // Seconds the stage has been drawing; drives the idle motion.
    let clock = 0;
    // The step on screen, and when the step-change ring last started.
    let step = activeStepAt(shown);
    let stepRingAt = -10;
    const scratch = new Vector3();
    const tint = new Color();

    /** Lays a flat ring around a point on the field, at a size and brightness. */
    function setRing(ring: LineLoop, x: number, y: number, z: number, size: number, opacity: number) {
      ring.position.set(x, y, z);
      ring.scale.setScalar(Math.max(0.01, size));
      (ring.material as LineBasicMaterial).opacity = Math.max(0, opacity);
    }

    /** Turns a point in the field into a pixel spot inside the stage. */
    function toScreen(x: number, y: number, z: number) {
      scratch.set(x, y, z).applyMatrix4(field.matrixWorld).project(camera);
      return { left: (scratch.x * 0.5 + 0.5) * width, top: (-scratch.y * 0.5 + 0.5) * height };
    }

    /** Moves one step toward the scroll position and draws a frame. */
    function draw(seconds: number) {
      shown += (reader.current() - shown) * (1 - Math.exp(-seconds * FOLLOW));
      clock += seconds;
      // A slow turn keeps the field reading as 3D. It is ambient only.
      spin += seconds * 0.05;
      field.rotation.set(0, spin, 0);
      field.updateMatrixWorld();
      dust.rotation.y = -spin * 0.6;
      dust.position.y = Math.sin(clock * 0.4) * 0.08;

      // The camera leans toward the pointer and sinks as the story goes on.
      const ease = 1 - Math.exp(-seconds * 4);
      lean.x += (pointer.x - lean.x) * ease;
      lean.y += (pointer.y - lean.y) * ease;
      const drift = ELEVATION_DRIFT * (1 - Math.min(1, shown / 6));
      placeCamera(baseElevation + drift + lean.y * 0.07, lean.x * 0.16);

      // A new step: send a bright ring out from the middle.
      const nowStep = activeStepAt(shown);
      if (nowStep !== step) {
        step = nowStep;
        stepRingAt = clock;
      }
      const ringAge = (clock - stepRingAt) / 1.3;
      setRing(stepRing, 0, 0, 0, 0.3 + ringAge * 4, ringAge < 1 ? (1 - ringAge) * 0.55 : 0);

      const now = sceneAt(shown);
      // "Your needs" breathes, and keeps sending out soft pulses.
      coreGlow.scale.setScalar((0.7 + now.needsPull * 0.5) * (1 + Math.sin(clock * 1.8) * 0.07));
      pulses.forEach((pulse, index) => {
        const beat = (clock / 2.8 + index / 2) % 1;
        setRing(pulse, 0, 0, 0, 0.25 + beat * 1.3, (1 - beat) * 0.42);
      });

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

      (ripple.material as LineBasicMaterial).opacity = 0;
      now.providers.forEach((provider, index) => {
        const { dot, packet } = dots[index];
        const x = Math.cos(provider.angle) * provider.radius;
        const z = Math.sin(provider.angle) * provider.radius;
        // Each dot bobs gently on its own beat.
        const y = provider.height + Math.sin(clock * 1.1 + index * 1.7) * 0.06;
        dot.position.set(x, y, z);
        const twinkle = 1 + Math.sin(clock * 2.3 + index * 2.1) * 0.07;
        dot.scale.setScalar((0.26 + (provider.tag ? 0.2 : 0) + provider.picked * 0.08 + provider.chosen * 0.22) * twinkle);

        // Picked contenders wear a breathing mint ring; it steps back for
        // the ones not signed in step 06.
        const breath = 0.34 + Math.sin(clock * 2 + index) * 0.04;
        setRing(halos[index], x, y, z, breath, provider.picked * 0.55 * provider.opacity);
        // The signed provider ripples.
        if (provider.chosen > 0) {
          const beat = (clock / 1.9) % 1;
          setRing(ripple, x, y, z, 0.3 + beat * 0.9, provider.chosen * (1 - beat) * 0.8);
        }
        // Dim to bright for the top five, then mint once picked.
        tint.copy(DIM).lerp(BRIGHT, provider.tag ? 1 : 0).lerp(MINT, provider.picked);
        dot.material.color.copy(tint);
        dot.material.opacity = provider.opacity;

        const trail = trails[index];
        if (provider.packet === null) {
          packet.material.opacity = 0;
          trail.forEach((speck) => {
            speck.material.opacity = 0;
          });
        } else {
          packet.position.set(x * provider.packet, y * provider.packet, z * provider.packet);
          packet.material.opacity = 1;
          trail.forEach((speck, back) => {
            const along = Math.max(0, provider.packet! - (back + 1) * 0.07);
            speck.position.set(x * along, y * along, z * along);
            speck.material.opacity = along > 0 ? 0.6 - back * 0.25 : 0;
          });
        }

        // The line runs from the middle (left at 0,0,0) to the dot.
        linkPositions.set([x, y, z], index * 6 + 3);
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
            const spot = toScreen(x, y, z);
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
    placeCamera(baseElevation + ELEVATION_DRIFT * (1 - Math.min(1, reader.current() / 6)), 0);
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
      stage.removeEventListener("pointerenter", onPointerEnter);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerleave", onPointerLeave);
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
