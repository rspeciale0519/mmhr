import { Button } from "@/components/ui/button";
import { requirePageIdentity } from "@/server/auth/page-guards";
import { signOut } from "../../(auth)/actions";

/**
 * Temporary pending-access response. R1.4 replaces this response only after
 * stored identity, organization, and permission checks pass.
 */
export default async function WorkspaceHome() {
  await requirePageIdentity();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Access pending</h1>
      <p className="text-sm">
        Your identity is verified. An administrator must grant access before
        you can use the workspace.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
