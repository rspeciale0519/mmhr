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
    <main className="co-w">
      <div className="co-gl co-auth-card">
        <p className="co-lbl">MatchMaker HR</p>
        <h1 className="co-pt" style={{ fontSize: 44, marginBottom: 24, marginTop: 8 }}>Sign in</h1>
        {message && <p role="status" className="co-notice co-gl text-sm" style={{ marginBottom: 16 }}>{message}</p>}
        <AuthForm action={signIn} mode="sign-in" submitLabel="Sign in" />
        <AgentIdButton enabled={isAgentIdSignInEnabled()} />
        <p className="co-ps" style={{ marginTop: 18 }}>
          No account yet? <Link href="/sign-up" className="underline">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
