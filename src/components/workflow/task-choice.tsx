"use client";
import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { taskFieldClass } from "./task-action";

export type TaskChoicePage = { items: { id: string; label: string }[]; nextCursor: string | null };
export function TaskChoice({ organizationId, kind, initial, name, label, defaultValue = "", optional = false,
  unavailableValue, currentLabel }: { organizationId: string; kind: "deals" | "people"; initial: TaskChoicePage;
  name: string; label: string; defaultValue?: string; optional?: boolean; unavailableValue?: string; currentLabel?: string }) {
  const id = useId(), trpc = useTRPC(), queryClient = useQueryClient();
  const [items, setItems] = useState(initial.items), [cursor, setCursor] = useState(initial.nextCursor), [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // Choice reads contain only bounded enum and cursor inputs. Private task text stays in POST writes.
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    <select id={id} name={name} className={taskFieldClass} defaultValue={defaultValue} required={!optional}>
      <option value="">{optional ? "Unassigned" : "Choose a record"}</option>
      {defaultValue && !items.some(item => item.id === defaultValue) && <option value={defaultValue}>{currentLabel ?? "Your current account"}{unavailableValue ? " · Access is unavailable" : ""}</option>}
      {items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {cursor && <Button type="button" className="min-h-11" variant="outline" disabled={loading} onClick={async () => {
      setLoading(true);
      setMessage("Loading more choices.");
      try {
        const page = await queryClient.fetchQuery(trpc.tasks.choices.queryOptions({ organizationId, kind, afterId: cursor, correlationId: crypto.randomUUID() }));
        setItems(current => [...current, ...page.items.filter(item => !current.some(existing => existing.id === item.id))]);
        setCursor(page.nextCursor); setMessage("");
      } catch { setMessage("Choices are unavailable. Reload the page before a change."); }
      finally { setLoading(false); }
    }}>More choices</Button>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
