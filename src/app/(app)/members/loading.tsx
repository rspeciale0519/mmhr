export default function MembersLoading() {
  return <main className="mx-auto w-full max-w-3xl space-y-6 p-8" aria-busy="true">
    <h1 className="text-3xl font-semibold">Members</h1><p role="status" className="text-sm text-muted-foreground">Loading members…</p>
  </main>;
}
