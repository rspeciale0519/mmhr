"use client";
import { Button } from "@/components/ui/button";
export default function FinanceDocumentsError({reset}:{reset:()=>void}){return <main className="mx-auto max-w-4xl space-y-4 px-6 py-10">
  <h1 className="text-2xl font-semibold">Finance documents are unavailable</h1><p role="alert">The request failed. Reload the authorized document view.</p>
  <Button type="button" className="min-h-11" onClick={reset}>Reload finance documents</Button></main>;}
