"use client";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/lib/trpc/client";
import { taskCommandSchema, type TaskCommand } from "@/lib/deal-follow-up";
import { Button } from "@/components/ui/button";

export const taskFieldClass = "w-full rounded-md border bg-background p-3 text-sm leading-6";
export function useTaskAction() {
  const trpc = useTRPC(), router = useRouter();
  const mutation = useMutation(trpc.tasks.record.mutationOptions({ retry: false }));
  const request = useRef<TaskCommand | null>(null);
  const [locked, setLocked] = useState(false), [saved, setSaved] = useState(false), [message, setMessage] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  async function send(input: TaskCommand) {
    try {
      const result = await mutation.mutateAsync(input);
      setSaved(true); setMessage(`Task saved. Revision ${result.revision}.`);
      try {
        if (input.action === "create") router.push(`/admin/tasks/${result.taskId}`);
        router.refresh();
      } catch { setMessage(`Task saved. Revision ${result.revision}. Reload the page to read the current task.`); }
    } catch (error) {
      const data = error && typeof error === "object" && "data" in error ? error.data : null;
      const code = data && typeof data === "object" && "code" in data ? data.code : null;
      setCanRetry(false);
      if (code === "CONFLICT") setMessage("The task changed. Reload the page before another change.");
      else if (code === "UNAUTHORIZED" || code === "FORBIDDEN" || code === "NOT_FOUND") {
        setMessage("Task access is unavailable. Reload the page before another change.");
      } else if (code === "BAD_REQUEST") {
        request.current = null; setLocked(false); setMessage("The task fields or action are invalid. Check the fields and try again.");
      } else {
        setCanRetry(true); setMessage("The response is unknown. Retry the same request, or reload to check the current task.");
      }
    }
  }
  function begin(build: () => unknown) {
    if (locked || request.current) return;
    try {
      const parsed = taskCommandSchema.parse({ ...(build() as Record<string, unknown>),
        correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
      request.current = parsed; setLocked(true); setCanRetry(false); setMessage(""); void send(parsed);
    } catch { setMessage("Check the task fields and record reason."); }
  }
  return { begin, locked, saved, message, canRetry, pending: mutation.isPending,
    retry: () => { if (request.current && canRetry && !mutation.isPending) void send(request.current); } };
}
export function TaskActionStatus({ action }: { action: ReturnType<typeof useTaskAction> }) {
  return <div className="space-y-3">
    {action.message && <p className="text-sm leading-7" role={action.saved ? "status" : "alert"}>{action.message}</p>}
    {action.locked && !action.saved && !action.pending && <div className="flex flex-wrap gap-3">
      {action.canRetry && <Button type="button" className="min-h-11" onClick={action.retry}>Retry unchanged request</Button>}
      <Button type="button" className="min-h-11" variant="outline" onClick={() => window.location.reload()}>Reload page</Button>
    </div>}
  </div>;
}
