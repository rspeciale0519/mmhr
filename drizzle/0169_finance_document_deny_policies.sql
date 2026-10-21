-- Finance document tables deny direct access. Only the reviewed finance
-- functions read or write them. These explicit policies record that intent
-- and satisfy the R1 rule that every application table has a policy.
-- Recovery: DROP POLICY "r7_deny_anon_authenticated_finance_document_sources"
-- ON public.finance_document_sources; and the same for
-- "r7_deny_anon_authenticated_finance_document_approvals". Access is
-- unchanged either way, because row-level security already denies it.
CREATE POLICY "r7_deny_anon_authenticated_finance_document_sources" ON "public"."finance_document_sources"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "r7_deny_anon_authenticated_finance_document_approvals" ON "public"."finance_document_approvals"
  AS RESTRICTIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);
