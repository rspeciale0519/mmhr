-- Lets a vendor reopen their own submitted RFP form (owner decision, 2026-11-24).
--
-- Before this, only staff could reopen a submitted form. Now the vendor can
-- do it from the same private link, as long as the due date has not passed.
--
-- What it does and does not do:
-- 1. It only changes a form that is "submitted". Forms that staff marked as
--    replied, declined, or no response stay closed until staff reopen them.
-- 2. It keeps every answer, comment, and uploaded file. Only the state and
--    the submitted date change. The name and email from the last submit stay,
--    so the form shows them again when the vendor submits a second time.
-- 3. It writes a "reopened" line in the tracking log with no staff member on
--    it, so staff can see the vendor did it.
-- 4. Like the other vendor functions, the hash of the link token is the only
--    key. A wrong token finds nothing.
-- No table, constraint, policy, or existing function changes.
-- Recovery: see the end of this file.

-- Vendor: reopen a submitted form so it can be edited and submitted again.
CREATE FUNCTION public.mmhr_vendor_rfp_form_reopen(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE v_form mmhr_private.rfp_vendor_forms%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP form reopen'; END IF;
  -- FOR UPDATE locks the row, so two clicks at once cannot both reopen it.
  SELECT * INTO v_form FROM mmhr_private.rfp_vendor_forms f WHERE f.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP form denied'; END IF;
  -- Only a submitted form that is still before its due date can be reopened.
  IF v_form.state <> 'submitted' OR v_form.due_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('reopened', false, 'state', v_form.state);
  END IF;
  -- Answers and files are not touched: only the state and the submitted date.
  UPDATE mmhr_private.rfp_vendor_forms SET state = 'sent', submitted_at = NULL,
    updated_at = clock_timestamp() WHERE id = v_form.id;
  INSERT INTO mmhr_private.rfp_vendor_form_events(form_id, kind) VALUES (v_form.id, 'reopened');
  RETURN jsonb_build_object('reopened', true, 'state', 'sent');
END
$$;--> statement-breakpoint

-- Vendor function: no sign-in. The private link token is the only key.
REVOKE ALL ON FUNCTION public.mmhr_vendor_rfp_form_reopen(text)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_vendor_rfp_form_reopen(text) TO anon, authenticated;
-- Recovery (run by hand):
-- 1. REVOKE EXECUTE ON FUNCTION public.mmhr_vendor_rfp_form_reopen(text) FROM anon, authenticated.
--    Vendors can then no longer reopen a form. Staff reopen still works.
-- 2. To remove fully: DROP FUNCTION public.mmhr_vendor_rfp_form_reopen(text).
--    Forms and tracking log lines already written stay as they are.
