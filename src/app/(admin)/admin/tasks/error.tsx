"use client";
import { Button } from "@/components/ui/button";
export default function TaskError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-5xl space-y-4 px-6 py-10"><h1 className="text-2xl font-semibold">Task records are unavailable</h1>
    <p role="alert">Check your access and selected workspace. Retry the task read.</p><Button className="min-h-11" onClick={reset}>Retry task read</Button></main>;
}
