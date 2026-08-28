import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm">The requested page is not available.</p>
      <Link className="underline" href="/">
        Return to the home page
      </Link>
    </main>
  );
}
