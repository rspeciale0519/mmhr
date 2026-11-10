import { factScopeMapSchema, type FactScope } from "@/server/matching/fact-scope";
import { deliveryBooleanMapSchema } from "@/server/matching/delivery-evidence";

const labels = { plan: "Plan", module: "Purchased module", country: "Country", state: "State",
  worker: "Worker type", delivery: "Delivery method", restriction: "Other restriction" } as const;

export function EvidenceValue({ fieldKey, value }: { fieldKey: string; value: string }) {
  if (fieldKey === "comparison_addon_inclusions" || fieldKey === "comparison_limitation_reviews") {
    let reviewed: Record<string, boolean> | undefined;
    try {
      const result = deliveryBooleanMapSchema.safeParse(JSON.parse(value));
      if (result.success) reviewed = result.data;
    } catch { /* Keep malformed stored evidence available for correction. */ }
    if (!reviewed) return <div className="space-y-3">
      <p role="alert" className="text-sm">These stored delivery details are invalid. Correct them before use in a comparison.</p>
      <details><summary className="cursor-pointer text-sm underline">View stored value</summary>
        <p className="whitespace-pre-wrap break-all text-sm">{value}</p></details>
    </div>;
    const entries = Object.entries(reviewed);
    return <div className="space-y-3" aria-label="Reviewed delivery details">
      {!entries.length && <p className="text-sm">No reviewed features are recorded.</p>}
      {entries.map(([key, confirmed]) => <section key={key} className="min-w-0 rounded-lg bg-muted/40 p-4">
        <h4 className="break-words text-sm font-semibold">{key}</h4>
        <p className="mt-2 text-sm">{fieldKey === "comparison_addon_inclusions"
          ? confirmed ? "Included in the reviewed package" : "Not confirmed in the reviewed package"
          : confirmed ? "Limits recorded in reviewed conditions" : "Limits not confirmed"}</p>
      </section>)}
    </div>;
  }
  if (fieldKey !== "comparison_fact_scopes") return <p className="whitespace-pre-wrap break-words text-sm leading-6">{value}</p>;
  let scopes: Record<string, FactScope> | undefined;
  try {
    const result = factScopeMapSchema.safeParse(JSON.parse(value));
    if (result.success) scopes = result.data;
  } catch { /* Keep malformed stored evidence visible for staff correction. */ }
  if (!scopes) return <div className="space-y-3">
    <p role="alert" className="text-sm">These stored conditions are invalid. Correct them before use in a comparison.</p>
    <details><summary className="cursor-pointer text-sm underline">View stored value</summary>
      <p className="whitespace-pre-wrap break-all text-sm">{value}</p></details>
  </div>;
  const entries = Object.entries(scopes);
  return <div className="space-y-4" aria-label="Saved package and regional conditions">
    <p className="text-sm leading-6">Each capability requires all its listed conditions. Allowed text answers must match exactly.</p>
    {!entries.length && <p className="text-sm">No capability scope is recorded. Missing scope remains unknown.</p>}
    {entries.map(([key, scope]) => <section key={key} className="min-w-0 rounded-lg bg-muted/40 p-4">
      <h4 className="break-words text-sm font-semibold">{key}</h4>
      {!scope.conditions.length ? <p className="mt-2 text-sm">Source confirms no restrictions for this capability.</p>
        : <ul className="mt-3 space-y-4">{scope.conditions.map((condition, index) => <li key={index} className="space-y-1 text-sm leading-6">
          <p className="font-medium">{labels[condition.kind]}</p>
          <p className="break-words">Saved question: {condition.requirementKey}</p>
          <p className="break-words">Answer field: {condition.responsePath.length ? condition.responsePath.join(" / ") : "Whole answer"}</p>
          <p>Allowed answers:</p>
          <ul className="list-inside list-disc">{condition.allowedValues.map((allowed, valueIndex) =>
            <li key={valueIndex} className="break-words">{typeof allowed === "string" ? `“${allowed}”` : String(allowed)} ({typeof allowed === "boolean" ? "true or false" : typeof allowed === "number" ? "number" : "text"})</li>)}</ul>
        </li>)}</ul>}
    </section>)}
  </div>;
}
