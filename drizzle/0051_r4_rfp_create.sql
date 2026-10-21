-- R4 versioned RFP draft generation from an approved intake.

ALTER TABLE public.rfp_versions ADD COLUMN source_intake_id uuid;
ALTER TABLE public.rfp_versions ADD CONSTRAINT rfp_versions_source_intake_scope_fk FOREIGN KEY (organization_id, source_intake_id) REFERENCES public.intakes (organization_id, id) ON DELETE RESTRICT;
CREATE INDEX rfp_versions_organization_intake_idx ON public.rfp_versions (organization_id, source_intake_id);

CREATE OR REPLACE FUNCTION public.mmhr_create_rfp_version(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  receipt jsonb;
  v_rfp public.rfp_versions%ROWTYPE;
  v_rfp_id uuid;
  v_intake_id uuid;
  v_organization_id uuid;
  v_actor_id uuid;
  v_version integer;
  v_source_revision integer;
  v_sections jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'rfpId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'version','') !~ '^[1-9][0-9]{0,3}$'
    OR coalesce(payload->>'sourceRevision','') !~ '^[1-9][0-9]{0,5}$'
    OR length(btrim(coalesce(payload->>'title',''))) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(payload->'sections') <> 'array'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP version input'; END IF;
  v_rfp_id := (payload->>'rfpId')::uuid; v_intake_id := (payload->>'intakeId')::uuid; v_organization_id := (payload->>'organizationId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid; v_version := (payload->>'version')::integer; v_source_revision := (payload->>'sourceRevision')::integer; v_sections := payload->'sections';
  IF jsonb_array_length(v_sections) NOT BETWEEN 1 AND 100 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_sections) AS item WHERE jsonb_typeof(item) <> 'object' OR coalesce(item->>'sectionKey','') !~ '^[a-z][a-z0-9_]{0,99}$' OR length(btrim(coalesce(item->>'title',''))) NOT BETWEEN 1 AND 200 OR coalesce(item->>'questionCount','') !~ '^[1-9][0-9]{0,2}$' OR (item->>'questionCount')::integer > 500) OR (SELECT count(*) FROM (SELECT item->>'sectionKey' AS section_key FROM jsonb_array_elements(v_sections) AS item GROUP BY item->>'sectionKey' HAVING count(*) > 1) AS duplicates) > 0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP sections'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Create RFP version', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rfp.create', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO v_rfp FROM public.rfp_versions AS r WHERE r.id = (receipt->>'entity_id')::uuid AND r.organization_id = v_organization_id; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'sourceIntakeId', v_rfp.source_intake_id, 'version', v_rfp.version, 'status', v_rfp.status, 'title', v_rfp.title, 'sections', v_rfp.sections, 'createdAt', v_rfp.created_at, 'outcomeCode', 'replayed', 'correlationId', correlation_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.intakes AS i WHERE i.id = v_intake_id AND i.organization_id = v_organization_id AND i.status = 'submitted' AND i.revision = v_source_revision) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP intake denied'; END IF;
  INSERT INTO public.rfp_versions (id, organization_id, rfp_id, source_intake_id, version, title, sections, created_by_identity_id) VALUES (v_rfp_id, v_organization_id, v_rfp_id, v_intake_id, v_version, btrim(payload->>'title'), v_sections, v_actor_id) RETURNING * INTO v_rfp;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r4.rfp.create', 'rfp.create', 'rfp_version', v_rfp.id, v_organization_id, 'Create RFP version', correlation_id, idempotency_key, payload, jsonb_build_object('version', v_version), jsonb_build_object('version', v_version, 'state', 'draft'), context.authorization_time);
  RETURN jsonb_build_object('rfpId', v_rfp.rfp_id, 'organizationId', v_rfp.organization_id, 'sourceIntakeId', v_rfp.source_intake_id, 'version', v_rfp.version, 'status', v_rfp.status, 'title', v_rfp.title, 'sections', v_rfp.sections, 'createdAt', v_rfp.created_at, 'outcomeCode', 'created', 'correlationId', correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_create_rfp_version(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_create_rfp_version(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_create_rfp_version(jsonb, uuid, uuid) IS 'R4 audited organization-scoped versioned RFP draft creation from submitted intake.';
