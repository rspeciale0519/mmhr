import Link from "next/link";

import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

/**
 * Foundation sign-up uses email and password to prove the auth round-trip.
 * FR-MKT-06 through FR-MKT-09 require the full registration gate: mandatory full
 * name, company, work email with free-domain rejection, direct phone, and an
 * explicit consent checkbox.
 */
export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <AuthForm action={signUp} mode="sign-up" submitLabel="Sign up" />
      <p className="text-sm">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
