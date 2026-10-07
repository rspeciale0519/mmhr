"use client";
import { Button } from "@/components/ui/button";
export default function ProposalError({reset}:{reset:()=>void}){
  return <main className="mx-auto max-w-5xl space-y-5 px-6 py-10"><h1 className="text-2xl font-semibold">Proposals could not be loaded</h1>
    <p role="alert">Load the saved records again. Check their current state before you repeat an action.</p><Button className="min-h-11" onClick={reset}>Retry saved proposals</Button></main>;
}
