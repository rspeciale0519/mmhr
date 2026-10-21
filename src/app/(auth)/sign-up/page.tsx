import Link from "next/link";

import { signUp } from "../actions";
import { AuthForm } from "../auth-form";
import { AgentIdButton } from "../agentid-button";
import { isAgentIdSignInEnabled } from "@/server/auth/agentid";
import { z } from "zod";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = z.email().max(254).safeParse((await searchParams).email);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <AuthForm action={signUp} mode="sign-up" submitLabel="Sign up" initialEmail={email.success ? email.data : ""} />
      <AgentIdButton enabled={isAgentIdSignInEnabled()} />
      <p className="text-sm">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
