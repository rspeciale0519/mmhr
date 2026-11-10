"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { workflowInputClass } from "@/components/workflow-command";
import { deliveryBooleanMapSchema } from "@/server/matching/delivery-evidence";

export function deliveryValueFromForm(data: FormData): string {
  const rows = data.getAll("deliveryRow").map(String);
  if (!rows.length || rows.length > 20 || new Set(rows).size !== rows.length) throw new Error("Invalid delivery rows");
  const values: Record<string, boolean> = Object.create(null);
  for (const id of rows) {
    const key = String(data.get(`delivery:${id}:capability`) ?? "").trim();
    const answer = String(data.get(`delivery:${id}:answer`) ?? "");
    if (Object.hasOwn(values, key) || !["true", "false"].includes(answer)) throw new Error("Check the reviewed delivery answers");
    values[key] = answer === "true";
  }
  return JSON.stringify(deliveryBooleanMapSchema.parse(values));
}

export function DeliveryFields({ kind }: { kind: "addon" | "limits" }) {
  const [rows, setRows] = useState([0]);
  const [nextId, setNextId] = useState(1);
  return <div className="space-y-4">
    <p className="text-sm leading-6">{kind === "addon"
      ? "Record whether each paid addition is included in this reviewed product configuration."
      : "Record whether all limits for each feature are included in its reviewed conditions."}</p>
    {rows.map((id) => <fieldset key={id} className="space-y-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">Reviewed feature</legend>
      <input type="hidden" name="deliveryRow" value={id}/>
      <label className="block text-sm font-medium">Capability key<input name={`delivery:${id}:capability`} required pattern="[a-z][a-z0-9_]*" maxLength={100} className={workflowInputClass}/></label>
      <label className="block text-sm font-medium">Reviewed answer<select name={`delivery:${id}:answer`} required defaultValue="" className={workflowInputClass}>
        <option value="">Select an answer</option><option value="true">Yes</option><option value="false">No</option>
      </select></label>
      <Button type="button" variant="outline" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((row) => row !== id))}>Remove feature</Button>
    </fieldset>)}
    <Button type="button" variant="outline" disabled={rows.length >= 20} onClick={() => { setRows((current) => [...current, nextId]); setNextId(nextId + 1); }}>Add feature</Button>
  </div>;
}
