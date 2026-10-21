"use client";
import { Button } from "@/components/ui/button";

export default function EvidenceError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-4xl space-y-5 px-5 py-10 sm:px-8">
    <h1 className="text-2xl font-semibold">Vendor evidence could not be loaded</h1>
    <p role="alert">Load the saved evidence again. Check its saved state before repeating a capture or review.</p>
    <Button onClick={reset} className="min-h-11">Retry saved evidence</Button>
  </main>;
}
