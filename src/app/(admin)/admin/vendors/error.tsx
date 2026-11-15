"use client";
import { Button } from "@/components/ui/button";

export default function VendorsError({ retry }: { retry: () => void }) {
  return <main className="mx-auto max-w-4xl space-y-5 px-4 py-10 sm:px-6">
    <h1 className="text-2xl font-semibold">Vendors could not be loaded</h1>
    <p role="alert">Load the list again. If you just added a vendor or an invitation, check the list before you repeat it.</p>
    <Button onClick={retry} className="min-h-11">Reload vendors</Button>
  </main>;
}
