"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { rfpReceiptCommandSchema, type RfpReceiptCommand, type RfpReceiptRow } from "@/lib/rfp-receipt";

export function RfpReceiptControls({ organizationId, item }: { organizationId: string; item: RfpReceiptRow }) {
  const trpc = useTRPC(), router = useRouter();
  const mutation = useMutation(trpc.rfps.confirmReceipt.mutationOptions({ retry: false }));
  const request = useRef<RfpReceiptCommand | null>(null), active = useRef(false);
  const [state, setState] = useState<"idle" | "pending" | "unknown" | "denied" | "stale" | "invalid" | "saved">("idle");
  const [message, setMessage] = useState("");
  async function send() {
    if (active.current || !item.canConfirm || !["idle", "unknown"].includes(state)) return;
    if (!request.current) request.current = rfpReceiptCommandSchema.parse({ organizationId, recipientId: item.recipientId,
      rfpVersionId: item.rfpVersionId, confirmationId: crypto.randomUUID(), correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
    active.current = true; setState("pending"); setMessage("");
    try {
      await mutation.mutateAsync(request.current); setState("saved"); setMessage("Receipt confirmed. This does not submit a vendor response.");
      try { router.refresh(); } catch { setMessage("Receipt confirmed. Reload the page to read the current status."); }
    } catch (error) {
      const data = error && typeof error === "object" && "data" in error ? error.data : null;
      const code = data && typeof data === "object" && "code" in data ? data.code : null;
      if (code === "CONFLICT") { setState("stale"); setMessage("Receipt status changed. Reload the page to read the saved status."); }
      else if (["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED"].includes(String(code))) { setState("denied"); setMessage("Receipt access is unavailable. Reload the page to check your access."); }
      else if (code === "BAD_REQUEST") { setState("invalid"); setMessage("The receipt request is invalid. Reload the page before another request."); }
      else { setState("unknown"); setMessage("The result is unknown. Retry the unchanged request, or reload the saved status."); }
    } finally { active.current = false; }
  }
  if (!item.canConfirm) return null;
  return <div className="space-y-3">
    <p className="text-sm leading-6">Confirm receipt of this questionnaire. Submit your answers through the response form.</p>
    {message && <p role={state === "saved" ? "status" : "alert"} className="text-sm leading-6">{message}</p>}
    <div className="flex flex-wrap gap-3">
      {["idle", "pending", "unknown"].includes(state) && <Button type="button" className="min-h-11" onClick={() => void send()} disabled={state === "pending"}>
        {state === "pending" ? "Confirming…" : state === "unknown" ? "Retry unchanged request" : "Confirm receipt"}</Button>}
      {!["idle", "pending"].includes(state) && <Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>Reload saved status</Button>}
    </div>
  </div>;
}
