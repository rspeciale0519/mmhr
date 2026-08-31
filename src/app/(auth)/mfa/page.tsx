import { MfaForm } from "./mfa-form";
import { requireMfaPageIdentity } from "@/server/auth/page-guards";

/** MFA setup remains identity-only so a pending user can complete enrollment. */
export default async function MfaPage() {
  await requireMfaPageIdentity();
  return <main className="mx-auto w-full max-w-md p-8"><MfaForm /></main>;
}
