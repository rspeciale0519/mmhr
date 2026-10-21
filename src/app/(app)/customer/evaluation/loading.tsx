export default function EvaluationLoading() {
  return <main className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8" aria-busy="true">
    <h1 className="text-balance text-2xl font-semibold">Your software comparison</h1>
    <p role="status" className="mt-4 text-sm text-muted-foreground">Loading your comparison and saved choices…</p>
  </main>;
}
