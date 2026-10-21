"use client";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { portalResponseContentSchema, responseFields, type ResponseField } from "@/lib/rfp-response";

type Props = { organizationId: string; recipientId: string; expectedRevision: number; closed: boolean };
type Attempt = Omit<Props, "closed"> & { response: ReturnType<typeof portalResponseContentSchema.parse>; correlationId: string; idempotencyKey: string };
const empty = Object.fromEntries(Object.keys(responseFields).map((key) => [key, ""])) as Record<ResponseField, string>;

export function ResponseForm({ organizationId, recipientId, expectedRevision, closed }: Props) {
  const trpc = useTRPC();
  const router = useRouter();
  const mutation = useMutation(trpc.responses.submit.mutationOptions({ retry: false }));
  const [fields, setFields] = useState(empty);
  const [message, setMessage] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [checked, setChecked] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const sending = useRef(false);

  async function send(input: Attempt) {
    if (sending.current || confirmed) return;
    sending.current = true;
    setLocked(true);
    setMessage(null);
    try {
      await mutation.mutateAsync(input);
      setConfirmed(true);
      setMessage("Your response was received. MMHR must review it before customers can read it.");
      try { router.refresh(); } catch { setMessage("Your response was received. Reload this page to read the saved response."); }
    } catch {
      setMessage("We could not confirm this response. Retry the same request or reload this page to check its status.");
    } finally { sending.current = false; }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || closed || !checked || sending.current) return;
    const parsed = portalResponseContentSchema.safeParse(Object.fromEntries(Object.entries(fields).map(([key, text]) =>
      [key, text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)])));
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Check your response."); return; }
    if (typeof crypto.randomUUID !== "function") { setMessage("Use an updated browser to submit this response."); return; }
    attempt.current = { organizationId, recipientId, expectedRevision, response: parsed.data, correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    void send(attempt.current);
  }
  if (closed) return <p role="status">This RFP is closed. New responses are unavailable.</p>;
  return <form onSubmit={submit} className="space-y-5" aria-label="Vendor response">
    <h2 className="text-xl font-semibold">{expectedRevision === 0 ? "Submit your response" : "Submit a new response version"}</h2>
    <p className="max-w-2xl text-sm leading-7">Enter one statement on each line. Include conditions, limits, and unanswered questions. Each submission creates a saved version.</p>
    {(Object.keys(responseFields) as ResponseField[]).map((field) => <div key={field} className="space-y-2">
      <label htmlFor={field} className="block text-sm font-semibold">{responseFields[field]}</label>
      <textarea id={field} value={fields[field]} disabled={locked} rows={3} maxLength={15000}
        className="w-full rounded-md border bg-background p-3 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onChange={(event) => setFields({ ...fields, [field]: event.target.value })} />
    </div>)}
    <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
      <input type="checkbox" checked={checked} disabled={locked} className="mt-1 size-4" onChange={(event) => setChecked(event.target.checked)} />
      <span>I checked this response against the RFP and included its conditions and limits.</span>
    </label>
    {message && <p role={confirmed ? "status" : "alert"} className="text-sm leading-7">{message}</p>}
    {!locked && <Button className="min-h-11" disabled={!checked || mutation.isPending} type="submit">Submit response</Button>}
    {locked && !confirmed && <div className="flex flex-wrap gap-4">
      <Button className="min-h-11" type="button" disabled={mutation.isPending} onClick={() => { if (attempt.current) void send(attempt.current); }}>
        {mutation.isPending ? "Submitting…" : "Retry unchanged request"}
      </Button>
      <a className="inline-flex min-h-11 items-center underline" href={`/vendor/response?recipient=${recipientId}`}>Reload saved responses</a>
    </div>}
  </form>;
}
