"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { WorkflowCommand, WorkflowFieldError, workflowHelpClass, workflowInputClass } from "@/components/workflow-command";
import { useTRPC } from "@/lib/trpc/client";

const stableKeyPattern = /^[a-z][a-z0-9_]{0,99}$/;

/** Adds one draft product to the selected vendor. Activation stays in the product review below. */
export function AddProduct({ organizationId, vendorProfileId }: { organizationId: string; vendorProfileId: string }) {
  const trpc = useTRPC();
  const create = useMutation(trpc.vendorEvidence.createProduct.mutationOptions({ retry: false }));
  const [formNumber, setFormNumber] = useState(0);
  const [added, setAdded] = useState(false);
  return <section aria-labelledby="add-product-heading" className="space-y-4 rounded-xl border p-5 sm:p-7">
    <h2 id="add-product-heading" className="text-xl font-semibold">Add product</h2>
    <p className="text-sm leading-6 text-muted-foreground">
      The product starts as a draft. Activate it in Catalog products, then record and approve its evidence.
    </p>
    <WorkflowCommand key={formNumber} label="Add product" success="Product added as a draft. Activate it in Catalog products."
      invalidMessage="The server did not accept these fields. Use a product key of lowercase letters, numbers, and underscores, a name of 1 to 200 characters, and a description of up to 2,000 characters."
      prepare={(data) => {
        const stableKey = String(data.get("stableKey") ?? "").trim().toLowerCase();
        const name = String(data.get("name") ?? "").trim();
        const description = String(data.get("description") ?? "").trim();
        if (!stableKeyPattern.test(stableKey)) {
          throw new WorkflowFieldError("Use a product key that starts with a letter and has only lowercase letters, numbers, and underscores.");
        }
        if (name.length < 1 || name.length > 200) throw new WorkflowFieldError("Enter a product name of 1 to 200 characters.");
        return { organizationId, vendorProfileId, stableKey, name, description: description || null,
          idempotencyKey: crypto.randomUUID() };
      }}
      execute={async (input) => { const result = await create.mutateAsync(input); setAdded(true); return result; }}>
      <label className="block text-sm font-medium">Product name
        <input name="name" required maxLength={200} className={workflowInputClass}/>
      </label>
      <label className="block text-sm font-medium">Product key
        <input name="stableKey" required maxLength={100} pattern="[a-z][a-z0-9_]*" autoComplete="off" className={workflowInputClass}/>
        <span className={workflowHelpClass}>For example, payroll_core. It must be unique for this vendor.</span>
      </label>
      <label className="block text-sm font-medium">Description (optional)
        <textarea name="description" maxLength={2000} rows={3} className={workflowInputClass}/>
      </label>
    </WorkflowCommand>
    {added && <button type="button" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      onClick={() => { setAdded(false); setFormNumber((value) => value + 1); }}>Add another product</button>}
  </section>;
}
