-- R3 structured requirement metadata and vendor-response links.

ALTER TABLE public.intake_requirements
  ADD COLUMN requirement_type text NOT NULL DEFAULT 'structured',
  ADD COLUMN evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN vendor_response_links jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.intake_requirements
  ADD CONSTRAINT intake_requirements_type_ck CHECK (requirement_type IN ('structured','custom')),
  ADD CONSTRAINT intake_requirements_evidence_ck CHECK (jsonb_typeof(evidence_references) = 'array' AND jsonb_array_length(evidence_references) <= 20),
  ADD CONSTRAINT intake_requirements_vendor_links_ck CHECK (jsonb_typeof(vendor_response_links) = 'array' AND jsonb_array_length(vendor_response_links) <= 20);

CREATE OR REPLACE FUNCTION public.mmhr_update_intake_requirement(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; v_requirement public.intake_requirements%ROWTYPE; v_requirement_id uuid; v_organization_id uuid; v_intake_id uuid; v_actor_id uuid; v_expected_revision integer; v_owner_id uuid; v_type text; v_evidence jsonb; v_links jsonb; v_response jsonb;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL OR coalesce(payload->>'requirementId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]*$' OR coalesce(payload->>'stableKey','') !~ '^[a-z][a-z0-9_]{0,99}$' OR length(btrim(coalesce(payload->>'label',''))) NOT BETWEEN 1 AND 200 OR coalesce(payload->>'importance','') NOT IN ('must','nice','not_applicable') OR coalesce(payload->>'weight','') !~ '^[1-9][0-9]?$' OR (payload->>'weight')::integer > 100 OR coalesce(payload->>'requirementType','') NOT IN ('structured','custom') OR jsonb_typeof(payload->'evidenceReferences') <> 'array' OR jsonb_typeof(payload->'vendorResponseLinks') <> 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid requirement metadata input'; END IF;
  v_requirement_id := (payload->>'requirementId')::uuid; v_organization_id := (payload->>'organizationId')::uuid; v_intake_id := (payload->>'intakeId')::uuid; v_actor_id := (payload->>'actorIdentityId')::uuid; v_expected_revision := (payload->>'expectedRevision')::integer; v_type := payload->>'requirementType'; v_evidence := payload->'evidenceReferences'; v_links := payload->'vendorResponseLinks'; v_response := CASE WHEN payload ? 'response' AND jsonb_typeof(payload->'response') <> 'null' THEN payload->'response' ELSE NULL END;
  IF jsonb_array_length(v_evidence) > 20 OR jsonb_array_length(v_links) > 20 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_evidence) AS item WHERE jsonb_typeof(item) <> 'string' OR length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 500) OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_links) AS item WHERE jsonb_typeof(item) <> 'string' OR item #>> '{}' !~ '^https://.{1,255}$') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid requirement metadata input'; END IF;
  IF payload ? 'ownerIdentityId' AND jsonb_typeof(payload->'ownerIdentityId') <> 'null' THEN v_owner_id := (payload->>'ownerIdentityId')::uuid; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Update intake requirement', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.requirement.update', idempotency_key, payload);
  IF receipt IS NOT NULL THEN SELECT * INTO v_requirement FROM public.intake_requirements AS ir WHERE ir.id=(receipt->>'entity_id')::uuid AND ir.organization_id=v_organization_id; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF; RETURN jsonb_build_object('requirementId',v_requirement.id,'organizationId',v_requirement.organization_id,'intakeId',v_requirement.intake_id,'revision',v_requirement.revision,'outcomeCode','replayed','correlationId',correlation_id); END IF;
  SELECT * INTO v_requirement FROM public.intake_requirements AS ir WHERE ir.id=v_requirement_id AND ir.organization_id=v_organization_id AND ir.intake_id=v_intake_id FOR UPDATE;
  IF NOT FOUND OR v_requirement.revision <> v_expected_revision OR v_requirement.status='archived' OR (v_owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.org_members AS om WHERE om.org_id=v_organization_id AND om.identity_id=v_owner_id AND om.status='active')) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Requirement revision or scope denied'; END IF;
  UPDATE public.intake_requirements AS ir SET stable_key=lower(btrim(payload->>'stableKey')), label=btrim(payload->>'label'), importance=payload->>'importance', weight=(payload->>'weight')::integer, owner_identity_id=v_owner_id, response=v_response, requirement_type=v_type, evidence_references=v_evidence, vendor_response_links=v_links, revision=ir.revision+1, updated_by_identity_id=context.actor_identity_id, updated_at=clock_timestamp() WHERE ir.id=v_requirement_id AND ir.organization_id=v_organization_id RETURNING * INTO v_requirement;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r3.requirement.update','requirement.update','intake_requirement',v_requirement.id,v_organization_id,'Update intake requirement',correlation_id,idempotency_key,payload,jsonb_build_object('version',1),jsonb_build_object('version',1,'state',v_requirement.status),context.authorization_time);
  RETURN jsonb_build_object('requirementId',v_requirement.id,'organizationId',v_requirement.organization_id,'intakeId',v_requirement.intake_id,'revision',v_requirement.revision,'outcomeCode','updated','correlationId',correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_update_intake_requirement(jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_update_intake_requirement(jsonb,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_update_intake_requirement(jsonb,uuid,uuid) IS 'R3 organization-scoped structured or custom requirement metadata update with evidence and vendor links.';
