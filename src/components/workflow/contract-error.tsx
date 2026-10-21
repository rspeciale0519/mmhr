"use client";
import { Button } from "@/components/ui/button";
export default function ContractError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-5xl space-y-5 px-6 py-10"><h1 className="text-2xl font-semibold">Contract records are unavailable</h1>
    <p className="text-sm leading-7">We could not load the saved contract records. Reload them before you enter another action.</p>
    <Button className="min-h-11" onClick={reset}>Retry saved contract records</Button></main>;
}
