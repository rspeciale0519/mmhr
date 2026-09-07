export default function InvitationsLoading() {
  return <main className="mx-auto w-full max-w-3xl space-y-6 p-8" aria-busy="true">
    <h1 className="text-3xl font-semibold">Invitations</h1>
    <p role="status" className="text-sm text-muted-foreground">Loading invitations…</p>
  </main>;
}
