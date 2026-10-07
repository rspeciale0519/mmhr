type ReceiptSchemaProbe = (signal: AbortSignal) => PromiseLike<{ error: { code: string } | null }>;
type ReceiptSchemaClock = { now(): number; schedule(callback: () => void, milliseconds: number): () => void };

const realClock: ReceiptSchemaClock = {
  now: () => Date.now(),
  schedule: (callback, milliseconds) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
};

function delay(milliseconds: number, signal: AbortSignal, clock: ReceiptSchemaClock) {
  return new Promise<void>((resolve, reject) => {
    let cancel = () => {};
    function finish(error?: unknown) {
      cancel(); signal.removeEventListener("abort", abort);
      if (error !== undefined) reject(error); else resolve();
    }
    function abort() { finish(signal.reason); }
    signal.addEventListener("abort", abort, { once: true });
    cancel = clock.schedule(() => finish(), milliseconds);
    if (signal.aborted) abort();
  });
}

// A previously cached security RPC cannot prove that the additive receipt RPC is ready.
export async function waitForRfpReceiptStatusSchema(probe: ReceiptSchemaProbe, clock = realClock) {
  const deadline = clock.now() + 30_000;
  const controller = new AbortController(), timeout = new Error("RFP receipt status schema did not become ready");
  timeout.name = "AbortError";
  let cancelDeadline = () => {};
  const expired = new Promise<never>((_, reject) => {
    cancelDeadline = clock.schedule(() => { controller.abort(timeout); reject(timeout); }, 30_000);
  });
  try {
    while (clock.now() < deadline) {
      // The exact signal also reaches the PostgREST builder; racing alone cannot cancel its fetch.
      const response = await Promise.race([Promise.resolve(probe(controller.signal)), expired]);
      if (controller.signal.aborted || clock.now() >= deadline) throw timeout;
      if (response.error?.code === "42501") return;
      if (response.error?.code !== "PGRST202") throw new Error("RFP receipt status schema readiness failed", { cause: response.error });
      await Promise.race([delay(Math.min(250, deadline - clock.now()), controller.signal, clock), expired]);
    }
    throw timeout;
  } finally {
    cancelDeadline();
    if (!controller.signal.aborted) controller.abort();
  }
}
