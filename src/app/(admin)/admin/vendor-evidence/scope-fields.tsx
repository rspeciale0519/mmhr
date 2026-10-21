"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { workflowInputClass } from "@/components/workflow-command";
import { factScopeMapSchema } from "@/server/matching/fact-scope";

export function scopeValueFromForm(data: FormData): string {
  const scopes: Record<string, { version: 1; conditions: unknown[] }> = Object.create(null);
  const rows = data.getAll("scopeRow").map(String);
  if (!rows.length || rows.length > 20 || new Set(rows).size !== rows.length) throw new Error("Invalid scope rows");
  for (const id of rows) {
    const get = (name: string) => String(data.get(`scope:${id}:${name}`) ?? "").trim();
    const key = get("capability"), kind = get("kind");
    const previous = scopes[key];
    if (previous && (kind === "unrestricted" || previous.conditions.length === 0)) throw new Error("Conflicting scope rows");
    scopes[key] ??= { version: 1, conditions: [] };
    if (kind === "unrestricted") continue;
    const type = get("type");
    if (!["text", "number", "boolean"].includes(type)) throw new Error("Invalid answer type");
    const allowedValues = get("values").split(/\r?\n/).map((value) => {
      const text = value.trim();
      if (!text) throw new Error("Enter an allowed answer");
      if (type === "boolean") {
        if (text !== "true" && text !== "false") throw new Error("Use true or false");
        return text === "true";
      }
      return type === "number" ? Number(text) : text;
    });
    scopes[key].conditions.push({ kind, requirementKey: get("question"),
      responsePath: get("path") ? get("path").split(/\r?\n/).map((part) => part.trim()) : [], allowedValues });
  }
  const value = JSON.stringify(factScopeMapSchema.parse(scopes));
  if (value.length > 2000) throw new Error("Scope record exceeds the supported size");
  return value;
}

function ScopeRow({ id, remove, removable }: { id: number; remove: () => void; removable: boolean }) {
  const [kind, setKind] = useState("module");
  const name = (field: string) => `scope:${id}:${field}`;
  return <fieldset className="min-w-0 space-y-4 rounded-lg border p-4">
    <legend className="px-1 text-sm font-semibold">Condition {id + 1}</legend>
    <input type="hidden" name="scopeRow" value={id}/>
    <label className="block text-sm font-medium">Capability key<input name={name("capability")} required pattern="[a-z][a-z0-9_]*" maxLength={100} className={workflowInputClass}/></label>
    <label className="block text-sm font-medium">Condition type<select name={name("kind")} value={kind} onChange={(event) => setKind(event.target.value)} className={workflowInputClass}>
      <option value="module">Purchased module</option><option value="plan">Plan</option><option value="country">Country</option>
      <option value="state">State</option><option value="worker">Worker type</option><option value="delivery">Delivery method</option>
      <option value="restriction">Other restriction</option><option value="unrestricted">No restrictions confirmed by source</option>
    </select></label>
    {kind === "unrestricted" ? <p className="text-sm leading-6 text-muted-foreground">Use this only when reviewed evidence confirms unrestricted use for this capability.</p> : <>
      <label className="block text-sm font-medium">Saved question key<input name={name("question")} required pattern="[a-z][a-z0-9_]*" maxLength={100} className={workflowInputClass}/></label>
      <label className="block text-sm font-medium">Answer field path<textarea name={name("path")} rows={2} maxLength={504} className={workflowInputClass}/></label>
      <p className="text-xs leading-5 text-muted-foreground">Leave the path empty for a single answer. For a grouped answer, enter each nested field on a separate line.</p>
      <label className="block text-sm font-medium">Answer type<select name={name("type")} className={workflowInputClass}>
        <option value="text">Text</option><option value="boolean">True or false</option><option value="number">Number</option>
      </select></label>
      <label className="block text-sm font-medium">Allowed answers<textarea name={name("values")} required rows={2} maxLength={2000} className={workflowInputClass}/></label>
      <p className="text-xs leading-5 text-muted-foreground">Enter one allowed answer per line. Text must match the saved answer exactly.</p>
    </>}
    <Button type="button" variant="outline" disabled={!removable} onClick={remove}>Remove condition</Button>
  </fieldset>;
}

export function ScopeFields() {
  const [rows, setRows] = useState([0]);
  const [nextId, setNextId] = useState(1);
  return <div className="space-y-4">
    <p className="text-sm leading-6">Record all conditions for this product. Repeat a capability key to add another required condition.</p>
    {rows.map((id) => <ScopeRow key={id} id={id} removable={rows.length > 1} remove={() => setRows((current) => current.filter((row) => row !== id))}/>)}
    <Button type="button" variant="outline" disabled={rows.length >= 20} onClick={() => { setRows((current) => [...current, nextId]); setNextId(nextId + 1); }}>Add condition</Button>
  </div>;
}
