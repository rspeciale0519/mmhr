import Link from "next/link";

import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

/**
 * Phase 0 sign-up: email + password only, to prove the auth round-trip.
 * Phase 1 replaces this with the registration gate (FR-L1..L4): mandatory full
 * name, company, work email with free-domain rejection, direct phone, and an
 * explicit consent checkbox.
 */
export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <AuthForm action={signUp} submitLabel="Sign up" />
      <p className="text-sm">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
