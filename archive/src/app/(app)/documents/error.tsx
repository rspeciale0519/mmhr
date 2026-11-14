"use client";
import Link from "next/link";
export default function DocumentError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-4xl space-y-5 px-6 py-10"><h1 className="text-2xl font-semibold">Document information is unavailable</h1>
    <p className="text-sm">Your access may have changed, or the service may be unavailable.</p>
    <button className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm" type="button" onClick={reset}>Try again</button>
    <p><Link className="inline-flex min-h-11 items-center text-sm underline" href="/home">Return home</Link></p></main>;
}
