import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../../(auth)/actions";

/**
 * Placeholder workspace home. FR-EVL-05 is not implemented; this page only
 * makes the authentication round-trip observable end to end.
 */
export default async function WorkspaceHome() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/sign-in");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Workspace</h1>
      <p data-testid="signed-in-email" className="text-sm">
        Signed in as {String(data.claims.email)}
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
