import { Button } from "@/components/ui/button";
import { requireHomeAccess } from "@/server/auth/page-guards";
import { signOut } from "../../(auth)/actions";
import Link from "next/link";

/**
 * The home route is a permission-checked router for authorized users.
 */
export default async function WorkspaceHome() {
  const access = await requireHomeAccess();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Workspace</h1>
      <p className="text-sm">
        Your access is active. Select a workspace area to continue.
      </p>
      {access.authorization.scope.kind === "organization" ? (
        <nav aria-label="Workspace areas" className="flex gap-4 text-sm underline">
          <Link href="/customer">Customer portal</Link>
          <Link href="/vendor">Vendor portal</Link>
        </nav>
      ) : (
        <Link className="text-sm underline" href="/admin">Administration</Link>
      )}
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
