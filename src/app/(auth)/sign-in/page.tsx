import Link from "next/link";

import { signIn } from "../actions";
import { AuthForm } from "../auth-form";
import { AgentIdButton } from "../agentid-button";
import { isAgentIdSignInEnabled } from "@/server/auth/agentid";
import { emailConfirmationNotices, isEmailConfirmationNotice } from "@/server/auth/email-confirmation";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { notice } = await searchParams;
  // Only fixed notice keys render; the query string never supplies message text.
  const message = isEmailConfirmationNotice(notice) ? emailConfirmationNotices[notice] : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
      <AuthForm action={signIn} mode="sign-in" submitLabel="Sign in" />
      <AgentIdButton enabled={isAgentIdSignInEnabled()} />
      <p className="text-sm">
        No account yet? <Link href="/sign-up">Sign up</Link>
      </p>
    </main>
  );
}
