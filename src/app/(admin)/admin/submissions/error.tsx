"use client";
import { Button } from "@/components/ui/button";

export default function SubmissionsError({ retry }: { retry: () => void }) {
  return <main className="mx-auto max-w-4xl space-y-5 px-6 py-10">
    <h1 className="text-2xl font-semibold">Submitted intakes could not be loaded</h1>
    <p role="alert">Load the list again. If you opened a case, check the list before you open it again.</p>
    <Button onClick={retry} className="min-h-11">Reload submitted intakes</Button>
  </main>;
}
