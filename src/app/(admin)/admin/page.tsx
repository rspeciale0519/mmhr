import { forbidden } from "next/navigation";

import { requirePageIdentity } from "@/server/auth/page-guards";

/** R1.4 replaces this deny-all response with explicit permission checks. */
export default async function AdminHome() {
  await requirePageIdentity();
  forbidden();
}
