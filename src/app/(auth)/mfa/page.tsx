import { MfaForm } from "./mfa-form";
import { requireMfaPageIdentity } from "@/server/auth/page-guards";

/** MFA setup remains identity-only so a pending user can complete enrollment. */
export default async function MfaPage() {
  await requireMfaPageIdentity();
  return <main className="co-w"><div className="co-gl co-auth-card"><MfaForm /></div></main>;
}
