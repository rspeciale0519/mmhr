import Link from "next/link";

import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

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
