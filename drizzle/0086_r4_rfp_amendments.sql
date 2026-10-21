-- R4 decision closure: one common RFP base can have additive vendor-specific amendments.
-- Amendments are immutable content records with independent, approval-bound versions.
CREATE TABLE public.rfp_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  rfp_id uuid NOT NULL,
  base_rfp_version_id uuid NOT NULL,
  vendor_profile_id uuid NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  items jsonb NOT NULL,
  created_by_identity_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  approval_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfp_amendments_organization_id_uq UNIQUE (organization_id, id),
  CONSTRAINT rfp_amendments_version_uq UNIQUE (organization_id, rfp_id, vendor_profile_id, version),
  CONSTRAINT rfp_amendments_base_version_scope_fk FOREIGN KEY (organization_id, base_rfp_version_id) REFERENCES public.rfp_versions (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT rfp_amendments_vendor_scope_fk FOREIGN KEY (organization_id, vendor_profile_id) REFERENCES public.vendor_profiles (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT rfp_amendments_version_ck CHECK (version > 0),
  CONSTRAINT rfp_amendments_status_ck CHECK (status IN ('draft', 'review', 'approved', 'archived')),
  CONSTRAINT rfp_amendments_title_ck CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT rfp_amendments_items_ck CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 50),
  CONSTRAINT rfp_amendments_approval_ck CHECK ((status <> 'approved' AND approved_by_identity_id IS NULL AND approved_at IS NULL AND approval_reference IS NULL) OR (status = 'approved' AND approved_by_identity_id IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL)),
  CONSTRAINT rfp_amendments_reference_ck CHECK (approval_reference IS NULL OR approval_reference ~ '^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$')
);--> statement-breakpoint
CREATE INDEX rfp_amendments_base_status_idx ON public.rfp_amendments (organization_id, base_rfp_version_id, status);--> statement-breakpoint
ALTER TABLE public.rfp_amendments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY r4_deny_anon_authenticated_rfp_amendments ON public.rfp_amendments AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON TABLE public.rfp_amendments FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_record_rfp_amendment(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; item public.rfp_amendments%ROWTYPE; base_row public.rfp_versions%ROWTYPE;
  v_action text; v_org uuid; v_actor uuid; v_id uuid; v_rfp uuid; v_vendor uuid; v_base_version integer; v_version integer; v_reference text;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR payload->>'action' NOT IN ('create','approve') OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'amendmentId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'vendorProfileId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'baseVersion','') !~ '^[1-9][0-9]{0,3}$'
    OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP amendment input'; END IF;
  v_action := payload->>'action'; v_org := (payload->>'organizationId')::uuid; v_actor := (payload->>'actorIdentityId')::uuid; v_id := (payload->>'amendmentId')::uuid; v_rfp := (payload->>'rfpId')::uuid; v_vendor := (payload->>'vendorProfileId')::uuid; v_base_version := (payload->>'baseVersion')::integer; v_version := (payload->>'version')::integer;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_org, 'Record RFP amendment', correlation_id, idempotency_key);
  IF v_actor <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rfp.amendment.' || v_action, idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO item FROM public.rfp_amendments WHERE id=(receipt->>'entity_id')::uuid AND organization_id=v_org; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('amendmentId',item.id,'rfpId',item.rfp_id,'organizationId',item.organization_id,'vendorProfileId',item.vendor_profile_id,'baseVersion',(SELECT version FROM public.rfp_versions WHERE id=item.base_rfp_version_id),'version',item.version,'status',item.status,'title',item.title,'items',item.items,'approvedByIdentityId',item.approved_by_identity_id,'approvedAt',item.approved_at,'approvalReference',item.approval_reference,'outcomeCode','replayed','correlationId',correlation_id); END IF;
  SELECT * INTO base_row FROM public.rfp_versions WHERE organization_id=v_org AND rfp_id=v_rfp AND version=v_base_version FOR SHARE;
  IF NOT FOUND OR base_row.status NOT IN ('approved','distributed','closed') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP amendment base denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendor_profiles WHERE organization_id=v_org AND id=v_vendor AND status='active') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP amendment vendor denied'; END IF;
  IF v_action = 'create' THEN
    IF jsonb_typeof(payload->'items') <> 'array' OR jsonb_array_length(payload->'items') NOT BETWEEN 1 AND 50 OR coalesce(payload->>'title','') = '' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP amendment content'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'items') AS i WHERE jsonb_typeof(i) <> 'object' OR coalesce(i->>'amendmentKey','') !~ '^[a-z][a-z0-9_]{0,99}$' OR coalesce(i->>'sectionKey','') !~ '^[a-z][a-z0-9_]{0,99}$' OR coalesce(i->>'title','') = '' OR length(btrim(i->>'title')) > 200 OR coalesce(i->>'text','') = '' OR length(btrim(i->>'text')) > 5000) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP amendment item'; END IF;
    IF (SELECT count(*) FROM (SELECT i->>'amendmentKey' FROM jsonb_array_elements(payload->'items') AS i GROUP BY i->>'amendmentKey' HAVING count(*) > 1) d) > 0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Duplicate RFP amendment key'; END IF;
    INSERT INTO public.rfp_amendments (id,organization_id,rfp_id,base_rfp_version_id,vendor_profile_id,version,status,title,items,created_by_identity_id) VALUES (v_id,v_org,v_rfp,base_row.id,v_vendor,v_version,'draft',btrim(payload->>'title'),payload->'items',v_actor) RETURNING * INTO item;
  ELSE
    v_reference := nullif(btrim(payload->>'approvalReference'),'');
    SELECT * INTO item FROM public.rfp_amendments WHERE organization_id=v_org AND id=v_id AND rfp_id=v_rfp AND vendor_profile_id=v_vendor AND base_rfp_version_id=base_row.id AND version=v_version FOR UPDATE;
    IF NOT FOUND OR item.status NOT IN ('draft','review') OR item.created_by_identity_id = v_actor OR v_reference IS NULL OR v_reference !~ '^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP amendment approval denied'; END IF;
    UPDATE public.rfp_amendments SET status='approved', approved_by_identity_id=v_actor, approved_at=clock_timestamp(), approval_reference=v_reference, updated_at=clock_timestamp() WHERE id=item.id RETURNING * INTO item;
  END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rfp.amendment.' || v_action, 'rfp.amendment.' || v_action, 'rfp_amendment', item.id, v_org, 'Record RFP amendment', correlation_id, idempotency_key, payload, CASE WHEN v_action='approve' THEN jsonb_build_object('state','draft','version',item.version) ELSE jsonb_build_object('version',item.version) END, jsonb_build_object('state',CASE WHEN item.status='approved' THEN 'approved' ELSE 'draft' END,'version',item.version), context.authorization_time);
  RETURN jsonb_build_object('amendmentId',item.id,'rfpId',item.rfp_id,'organizationId',item.organization_id,'vendorProfileId',item.vendor_profile_id,'baseVersion',v_base_version,'version',item.version,'status',item.status,'title',item.title,'items',item.items,'approvedByIdentityId',item.approved_by_identity_id,'approvedAt',item.approved_at,'approvalReference',item.approval_reference,'outcomeCode',CASE WHEN v_action='create' THEN 'created' ELSE 'approved' END,'correlationId',correlation_id);
END; $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_record_rfp_amendment(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_record_rfp_amendment(jsonb,uuid,uuid) TO authenticated;--> statement-breakpoint
COMMENT ON FUNCTION public.mmhr_record_rfp_amendment(jsonb,uuid,uuid) IS 'R4 audited additive vendor-specific RFP amendments anchored to an approved common base version.';
