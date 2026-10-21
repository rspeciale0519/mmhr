import { forbidden } from "next/navigation";
import Link from "next/link";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { requirePageIdentity } from "@/server/auth/page-guards";

// Validate the fields used here and discard other caller-bound RPC fields.
const identityRowSchema = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "active", "recovery_pending", "suspended", "archived"]),
  email_verified_at: z.string().nullable(),
});

/** Shows the safe next step for an authenticated user without workspace access. */
export default async function PendingAccessPage() {
  await requirePageIdentity();
  const supabase = await createClient();
  const response = await supabase.rpc("mmhr_get_my_account_setup");
  const rows = z.array(identityRowSchema).length(1).safeParse(response.error ? null : response.data);
  const row = rows.success ? rows.data[0] : null;

  // `mmhr_get_my_account_setup` is caller-bound in SQL. Its application identity
  // ID must not be compared with the separate Auth subject ID from the JWT.
  if (!row || !["pending", "active"].includes(row.status)) {
    forbidden();
  }

  const needsEmailVerification = row.email_verified_at === null;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">
        {needsEmailVerification ? "Confirm your email" : row.status === "pending" ? "Access pending" : "Account access"}
      </h1>
      <p className="text-sm" role="status" aria-live="polite">
        {needsEmailVerification
          ? "Check your email for a confirmation link. Then sign in again."
          : "Your email is verified. Open your workspaces to check available access, or review your invitations."}
      </p>
      {!needsEmailVerification ? (
        <div className="flex flex-wrap gap-5">
          <Link className="inline-flex min-h-11 items-center text-sm underline" href="/workspaces">Open workspaces</Link>
          <Link className="inline-flex min-h-11 items-center text-sm underline" href="/invitations/accept">Review pending invitations</Link>
          <Link className="inline-flex min-h-11 items-center text-sm underline" href="/sign-in">Sign in to retry account setup</Link>
        </div>
      ) : null}
    </main>
  );
}
