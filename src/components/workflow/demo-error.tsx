"use client";
import { Button } from "@/components/ui/button";
export default function DemoError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-4xl space-y-5 px-6 py-10"><h1 className="text-2xl font-semibold">Demo plans could not be loaded</h1>
    <p role="alert">Try loading the saved plans again. Check the saved state before you repeat an action.</p>
    <Button onClick={reset} className="min-h-11">Retry saved demo plans</Button></main>;
}
