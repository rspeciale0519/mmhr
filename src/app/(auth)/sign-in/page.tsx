import Link from "next/link";

import { signIn } from "../actions";
import { AuthForm } from "../auth-form";
import { AgentIdButton } from "../agentid-button";
import { isAgentIdSignInEnabled } from "@/server/auth/agentid";

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <AuthForm action={signIn} mode="sign-in" submitLabel="Sign in" />
      <AgentIdButton enabled={isAgentIdSignInEnabled()} />
      <p className="text-sm">
        No account yet? <Link href="/sign-up">Sign up</Link>
      </p>
    </main>
  );
}
