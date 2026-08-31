import { requirePagePermission } from "@/server/auth/page-guards";

export default async function AdminHome() {
  await requirePagePermission("admin.access", { kind: "platform" });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Administration</h1>
      <p className="text-sm">You have access to internal administration.</p>
    </main>
  );
}
