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
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Complete your registration</h1>
      <p className="text-sm">Enter your company details before creating your customer workspace.</p>
      <AgentIdRegistrationForm email={user.email} idempotencyKey={randomUUID()} />
      <Link className="text-sm underline" href="/invitations/accept">Review an existing organization invitation</Link>
    </main>
  );
}
