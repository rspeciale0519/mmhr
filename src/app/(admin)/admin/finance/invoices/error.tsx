"use client";

import { Button } from "@/components/ui/button";

export default function ManagedInvoiceError({ retry }: { retry: () => void }) {
  return <main className="mx-auto max-w-5xl space-y-4 px-6 py-10">
    <p role="alert">The invoice record could not load.</p>
    <Button type="button" className="min-h-11" onClick={retry}>Reload invoice record</Button>
  </main>;
}
