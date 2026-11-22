import Link from "next/link";

import { signUp } from "../actions";
import { AuthForm } from "../auth-form";
import { AgentIdButton } from "../agentid-button";
import { isAgentIdSignInEnabled } from "@/server/auth/agentid";
import { z } from "zod";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = z.email().max(254).safeParse((await searchParams).email);
  return (
    <main className="co-w">
      <div className="co-gl co-auth-card">
        <p className="co-lbl">MatchMaker HR</p>
        <h1 className="co-pt" style={{ fontSize: 44, marginBottom: 24, marginTop: 8 }}>Create your account</h1>
        <AuthForm action={signUp} mode="sign-up" submitLabel="Sign up" initialEmail={email.success ? email.data : ""} />
        <AgentIdButton enabled={isAgentIdSignInEnabled()} />
        <p className="co-ps" style={{ marginTop: 18 }}>
          Already have an account? <Link href="/sign-in" className="underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
