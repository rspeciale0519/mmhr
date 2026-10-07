"use client";

import { useMutation } from "@tanstack/react-query";
import { WorkflowCommand } from "@/components/workflow-command";
import { useTRPC } from "@/lib/trpc/client";

export function ProductReview({ organizationId, products }: {
  organizationId: string;
  products: readonly { recordId: string; label: string; status: string; revision?: number }[];
}) {
  const trpc = useTRPC();
  const activate = useMutation(trpc.vendorEvidence.activateProduct.mutationOptions({ retry: false }));
  return <section aria-label="Catalog products" className="space-y-4">
    <h2 className="text-xl font-semibold">Catalog products</h2>
    <p className="text-sm leading-6 text-muted-foreground">An active product can enter a comparison. Its facts still need evidence approval, and each comparison needs publication review.</p>
    {products.map(product => <article key={`${product.recordId}:${product.revision}`} className="space-y-3 rounded-xl border p-5">
      <h3 className="font-semibold">{product.label}</h3>
      <p className="text-sm capitalize">{product.status}</p>
      {product.status === "draft" && product.revision !== undefined && <WorkflowCommand
        label={`Activate ${product.label}`} success="Product activated. Its evidence still requires review."
        prepare={() => ({ organizationId, productId: product.recordId, expectedRevision: product.revision!, idempotencyKey: crypto.randomUUID() })}
        execute={input => activate.mutateAsync(input)}>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" required className="mt-1"/>
          I checked that this is the intended product and is not a duplicate.</label>
      </WorkflowCommand>}
      {product.status === "draft" && product.revision === undefined && <p role="status" className="text-sm">Reload to obtain the current product revision before activation.</p>}
    </article>)}
  </section>;
}
