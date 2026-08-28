import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="text-sm">You do not have permission to use this page.</p>
      <Link className="underline" href="/">
        Return to the home page
      </Link>
    </main>
  );
}
