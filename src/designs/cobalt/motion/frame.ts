/**
 * One shared animation-frame loop for everything that follows scrolling.
 *
 * Why: if ten effects each listened to `scroll` and measured the page, the
 * browser would measure, write, measure, write... ten times per frame
 * ("layout thrash"). Here every effect registers a task with two halves:
 * `read` (measure: getBoundingClientRect, scrollY) and `write` (set a CSS
 * variable or attribute). On each frame all reads run first, then all writes,
 * so the page is measured at most once per frame.
 *
 * The loop only runs after a scroll or resize event (passive listeners, so
 * scrolling is never delayed), and the listeners exist only while at least
 * one task is registered. Browsers pause animation frames in hidden tabs.
 */

export type FrameTask = {
  /** Measure the page. Do not change styles here. */
  read?: () => void;
  /** Change styles. Do not measure here. */
  write?: () => void;
};

const tasks = new Set<FrameTask>();
/** The id of the frame already asked for, or 0 when none is pending. */
let queued = 0;

function run() {
  queued = 0;
  for (const task of tasks) task.read?.();
  for (const task of tasks) task.write?.();
}

/** Asks for one run of every task on the next frame (several calls, one run). */
export function requestScrollFrame() {
  if (queued || tasks.size === 0) return;
  queued = requestAnimationFrame(run);
}

/**
 * Runs `task` once now-ish (next frame) and then after every scroll or
 * resize. Returns the function that stops it; call it from an effect cleanup.
 *
 * Example (inside useEffect):
 *   return onScrollFrame({
 *     read: () => { y = window.scrollY; },
 *     write: () => el.style.setProperty("--y", String(y)),
 *   });
 */
export function onScrollFrame(task: FrameTask): () => void {
  tasks.add(task);
  if (tasks.size === 1) {
    window.addEventListener("scroll", requestScrollFrame, { passive: true });
    window.addEventListener("resize", requestScrollFrame, { passive: true });
  }
  requestScrollFrame();
  return () => {
    tasks.delete(task);
    if (tasks.size > 0) return;
    cancelAnimationFrame(queued);
    queued = 0;
    window.removeEventListener("scroll", requestScrollFrame);
    window.removeEventListener("resize", requestScrollFrame);
  };
}

/**
 * Wraps a pointer handler so it runs at most once per frame, with the latest
 * event. Pointer events can fire 120+ times a second; the screen only needs
 * one update per frame. Call `.cancel()` in cleanup.
 */
export function perFrame<E>(handler: (event: E) => void) {
  let id = 0;
  let latest: E;
  const wrapped = (event: E) => {
    latest = event;
    if (id) return;
    id = requestAnimationFrame(() => {
      id = 0;
      handler(latest);
    });
  };
  wrapped.cancel = () => {
    cancelAnimationFrame(id);
    id = 0;
  };
  return wrapped;
}
