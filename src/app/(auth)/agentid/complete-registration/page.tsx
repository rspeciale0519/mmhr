import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedAgentIdUser, isAgentIdSignInEnabled } from "@/server/auth/agentid";
import { AgentIdRegistrationForm } from "./registration-form";

export default async function AgentIdRegistrationPage() {
  if (!isAgentIdSignInEnabled()) notFound();
  let user;
  try { user = await getVerifiedAgentIdUser(await createClient()); }
  catch { redirect("/sign-in"); }
  return (
    <main className="co-w">
      <div className="co-gl co-auth-card">
      <h1 className="co-pt" style={{ fontSize: 44 }}>Complete your registration</h1>
      <p className="text-sm">Enter your company details before creating your customer workspace.</p>
      <AgentIdRegistrationForm email={user.email} idempotencyKey={randomUUID()} />
      <Link className="text-sm underline" href="/invitations/accept">Review an existing organization invitation</Link>
      </div>
    </main>
  );
}
