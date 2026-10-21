"use client";

import { Button } from "@/components/ui/button";

export default function CommercialFinanceError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-5xl space-y-4 px-6 py-10">
    <p role="alert">The commission records could not load.</p>
    <Button type="button" className="min-h-11 transition-colors" onClick={reset}>Reload commission records</Button>
  </main>;
}
