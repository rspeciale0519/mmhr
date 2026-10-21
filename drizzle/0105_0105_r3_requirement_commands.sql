-- R3 requirement creation, guarded metadata updates, and immutable history.
-- Forward: expose only the audited authenticated commands after local rehearsal.
-- Recovery: revoke both public functions and use a forward repair. Preserve all
-- requirement and history rows; never remove historical snapshots.

ALTER TABLE public.intake_requirements
  ADD CONSTRAINT intake_requirements_organization_id_uq UNIQUE (organization_id, id);
--> statement-breakpoint

CREATE TABLE public.intake_requirement_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  requirement_id uuid NOT NULL,
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  changed_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  snapshot_source text NOT NULL DEFAULT 'recorded',
  correlation_id uuid NOT NULL,
  CONSTRAINT intake_requirement_history_scope_fk FOREIGN KEY (organization_id, requirement_id)
    REFERENCES public.intake_requirements (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT intake_requirement_history_revision_uq UNIQUE (organization_id, requirement_id, revision),
  CONSTRAINT intake_requirement_history_snapshot_ck CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT intake_requirement_history_revision_ck CHECK (revision > 0),
  CONSTRAINT intake_requirement_history_source_ck CHECK (snapshot_source IN ('recorded', 'legacy_backfill'))
);
CREATE INDEX intake_requirement_history_scope_time_idx
  ON public.intake_requirement_history (organization_id, requirement_id, captured_at);
ALTER TABLE public.intake_requirement_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.intake_requirement_history
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_intake_requirement_history
  ON public.intake_requirement_history AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r3_requirement_response_is_valid(value jsonb, depth integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE field record; item jsonb; kind text;
BEGIN
  IF value IS NULL OR depth > 5 OR pg_column_size(value) > 10000 THEN RETURN false; END IF;
  kind := jsonb_typeof(value);
  IF kind = 'null' THEN RETURN true; END IF;
  IF kind = 'string' THEN RETURN length(value #>> '{}') <= 2000; END IF;
  IF kind = 'boolean' THEN RETURN true; END IF;
  IF kind = 'number' THEN
    RETURN abs((value #>> '{}')::numeric) <= 1.7976931348623157e308;
  END IF;
  IF kind = 'array' THEN
    IF jsonb_array_length(value) > 50 THEN RETURN false; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
      IF NOT mmhr_private.r3_requirement_response_is_valid(item, depth + 1) THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  END IF;
  IF kind = 'object' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(value)) > 50 THEN RETURN false; END IF;
    FOR field IN SELECT * FROM jsonb_each(value) LOOP
      IF length(field.key) NOT BETWEEN 1 AND 100
        OR NOT mmhr_private.r3_requirement_response_is_valid(field.value, depth + 1)
      THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  END IF;
  RETURN false;
END
$$;
REVOKE ALL ON FUNCTION mmhr_private.r3_requirement_response_is_valid(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r3_requirement_payload_is_valid(payload jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE expected_revision integer;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN RETURN false; END IF;
  IF NOT (payload ?& ARRAY['requirementId','organizationId','intakeId','expectedRevision',
      'stableKey','label','importance','weight','ownerIdentityId','response',
      'requirementType','evidenceReferences','vendorResponseLinks','actorIdentityId'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS payload_keys(name)
      WHERE payload_keys.name NOT IN ('requirementId','organizationId','intakeId','expectedRevision',
        'stableKey','label','importance','weight','ownerIdentityId','response',
        'requirementType','evidenceReferences','vendorResponseLinks','actorIdentityId',
        'correlationId','idempotencyKey'))
  THEN RETURN false; END IF;
  IF coalesce(payload->>'requirementId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'expectedRevision','') !~ '^(0|[1-9][0-9]*)$'
    OR length(payload->>'expectedRevision') > 10
    OR coalesce(payload->>'stableKey','') !~ '^[a-z][a-z0-9_]{0,99}$'
    OR length(btrim(coalesce(payload->>'label',''))) NOT BETWEEN 1 AND 200
    OR coalesce(payload->>'importance','') NOT IN ('must','nice','not_applicable')
    OR coalesce(payload->>'weight','') !~ '^(?:[1-9][0-9]?|100)$'
    OR coalesce(payload->>'requirementType','') NOT IN ('structured','custom')
    OR jsonb_typeof(payload->'evidenceReferences') <> 'array'
    OR jsonb_typeof(payload->'vendorResponseLinks') <> 'array'
    OR jsonb_typeof(payload->'ownerIdentityId') NOT IN ('null','string')
    OR (jsonb_typeof(payload->'ownerIdentityId') = 'string' AND
      payload->>'ownerIdentityId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    OR (payload ? 'correlationId' AND coalesce(payload->>'correlationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    OR (payload ? 'idempotencyKey' AND coalesce(payload->>'idempotencyKey','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    OR jsonb_typeof(payload->'expectedRevision') <> 'number'
    OR jsonb_typeof(payload->'weight') <> 'number'
    OR jsonb_typeof(payload->'stableKey') <> 'string'
    OR jsonb_typeof(payload->'label') <> 'string'
    OR jsonb_typeof(payload->'importance') <> 'string'
    OR jsonb_typeof(payload->'requirementType') <> 'string'
  THEN RETURN false; END IF;
  IF (payload->>'expectedRevision')::numeric > 2147483646 THEN RETURN false; END IF;
  expected_revision := (payload->>'expectedRevision')::integer;
  IF expected_revision < 0 OR expected_revision > 2147483646 THEN RETURN false; END IF;
  IF NOT mmhr_private.r3_requirement_response_is_valid(payload->'response') THEN RETURN false; END IF;
  IF jsonb_array_length(payload->'evidenceReferences') > 20
    OR jsonb_array_length(payload->'vendorResponseLinks') > 20
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'evidenceReferences') AS evidence_entry(item)
      WHERE jsonb_typeof(evidence_entry.item) <> 'string' OR length(btrim(evidence_entry.item #>> '{}')) NOT BETWEEN 1 AND 500)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'vendorResponseLinks') AS link_entry(item)
      WHERE jsonb_typeof(link_entry.item) <> 'string' OR link_entry.item #>> '{}' !~ '^https://[^[:space:]]{1,255}$')
  THEN RETURN false; END IF;
  IF jsonb_typeof(payload->'ownerIdentityId') = 'string'
    AND payload->>'ownerIdentityId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RETURN false; END IF;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION mmhr_private.r3_requirement_payload_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r3_requirement_snapshot(requirement public.intake_requirements)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'requirementId', $1.id, 'organizationId', $1.organization_id, 'intakeId', $1.intake_id,
    'stableKey', $1.stable_key, 'label', $1.label, 'importance', $1.importance,
    'weight', $1.weight, 'ownerIdentityId', $1.owner_identity_id, 'response', $1.response,
    'status', $1.status, 'requirementType', $1.requirement_type,
    'evidenceReferences', $1.evidence_references, 'vendorResponseLinks', $1.vendor_response_links,
    'revision', $1.revision, 'createdByIdentityId', $1.created_by_identity_id,
    'updatedByIdentityId', $1.updated_by_identity_id, 'createdAt', $1.created_at,
    'updatedAt', $1.updated_at, 'correlationId', $1.correlation_id
  )
$$;
REVOKE ALL ON FUNCTION mmhr_private.r3_requirement_snapshot(public.intake_requirements)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r3_capture_requirement_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.revision = 2147483647 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Requirement revision must increase by one';
    END IF;
    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Requirement revision must increase by one';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.intake_requirement_history h
      WHERE h.organization_id = OLD.organization_id AND h.requirement_id = OLD.id
        AND h.revision = OLD.revision
    ) THEN
      INSERT INTO public.intake_requirement_history (
        organization_id, requirement_id, revision, snapshot,
        changed_by_identity_id, changed_at, captured_at, snapshot_source, correlation_id
      ) VALUES (
        OLD.organization_id, OLD.id, OLD.revision, mmhr_private.r3_requirement_snapshot(OLD),
        NULL, NULL, clock_timestamp(), 'legacy_backfill', OLD.correlation_id
      );
    END IF;
  END IF;
  INSERT INTO public.intake_requirement_history (
    organization_id, requirement_id, revision, snapshot,
    changed_by_identity_id, changed_at, captured_at, snapshot_source, correlation_id
  ) VALUES (
    NEW.organization_id, NEW.id, NEW.revision, mmhr_private.r3_requirement_snapshot(NEW),
    coalesce(NEW.updated_by_identity_id, NEW.created_by_identity_id),
    CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at ELSE NEW.updated_at END,
    clock_timestamp(), 'recorded', NEW.correlation_id
  );
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION mmhr_private.r3_capture_requirement_history()
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE TRIGGER intake_requirements_capture_history
  AFTER INSERT OR UPDATE ON public.intake_requirements
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r3_capture_requirement_history();
CREATE TRIGGER intake_requirement_history_immutable
  BEFORE UPDATE OR DELETE ON public.intake_requirement_history
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER intake_requirement_history_no_truncate
  BEFORE TRUNCATE ON public.intake_requirement_history
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint

ALTER FUNCTION public.mmhr_update_intake_requirement(jsonb,uuid,uuid) SET SCHEMA mmhr_private;
ALTER FUNCTION mmhr_private.mmhr_update_intake_requirement(jsonb,uuid,uuid)
  RENAME TO r3_update_intake_requirement_impl;
REVOKE ALL ON FUNCTION mmhr_private.r3_update_intake_requirement_impl(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_update_intake_requirement_impl(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; intake public.intakes%ROWTYPE;
  requirement public.intake_requirements%ROWTYPE; v_owner_id uuid;
  v_response jsonb; v_evidence jsonb; v_links jsonb;
BEGIN
  v_owner_id := CASE WHEN jsonb_typeof(payload->'ownerIdentityId') = 'null'
    THEN NULL ELSE (payload->>'ownerIdentityId')::uuid END;
  v_response := CASE WHEN jsonb_typeof(payload->'response') = 'null' THEN NULL ELSE payload->'response' END;
  v_evidence := payload->'evidenceReferences'; v_links := payload->'vendorResponseLinks';
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', (payload->>'organizationId')::uuid, 'Update intake requirement', correlation_id, idempotency_key);
  IF (payload->>'actorIdentityId')::uuid <> context.actor_identity_id
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.requirement.update', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO requirement FROM public.intake_requirements AS ir
    WHERE ir.id=(receipt->>'entity_id')::uuid AND ir.organization_id=(payload->>'organizationId')::uuid
      AND ir.intake_id=(payload->>'intakeId')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('requirementId',requirement.id,'organizationId',requirement.organization_id,
      'intakeId',requirement.intake_id,'revision',requirement.revision,'outcomeCode','replayed','correlationId',correlation_id);
  END IF;
  SELECT * INTO intake FROM public.intakes AS i
  WHERE i.id=(payload->>'intakeId')::uuid AND i.organization_id=(payload->>'organizationId')::uuid FOR UPDATE;
  IF NOT FOUND OR intake.status NOT IN ('draft','in_progress')
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Requirement lifecycle denied'; END IF;
  SELECT * INTO requirement FROM public.intake_requirements AS ir
  WHERE ir.id=(payload->>'requirementId')::uuid AND ir.organization_id=(payload->>'organizationId')::uuid
    AND ir.intake_id=(payload->>'intakeId')::uuid FOR UPDATE;
  IF NOT FOUND OR requirement.revision <> (payload->>'expectedRevision')::integer
    OR requirement.status='archived'
    OR (v_owner_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.org_members AS om
      WHERE om.org_id=(payload->>'organizationId')::uuid AND om.identity_id=v_owner_id
        AND om.status='active' AND NOT om.migration_review_required
        AND EXISTS (SELECT 1 FROM public.identities AS owner_identity
          WHERE owner_identity.id=om.identity_id AND owner_identity.status='active')
    ))
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Requirement revision or scope denied'; END IF;
  BEGIN
    UPDATE public.intake_requirements AS ir SET
      stable_key=lower(btrim(payload->>'stableKey')), label=btrim(payload->>'label'),
      importance=payload->>'importance', weight=(payload->>'weight')::integer,
      owner_identity_id=v_owner_id, response=v_response, requirement_type=payload->>'requirementType',
      evidence_references=v_evidence, vendor_response_links=v_links, revision=ir.revision+1,
      correlation_id = $2,
      updated_by_identity_id=context.actor_identity_id, updated_at=clock_timestamp()
    WHERE ir.id=requirement.id AND ir.organization_id=(payload->>'organizationId')::uuid
    RETURNING * INTO requirement;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Requirement update denied';
  END;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r3.requirement.update',
    'requirement.update','intake_requirement',requirement.id,requirement.organization_id,
    'Update intake requirement',correlation_id,idempotency_key,payload,
    jsonb_build_object('version',1),jsonb_build_object('version',1,'state',requirement.status),context.authorization_time);
  RETURN jsonb_build_object('requirementId',requirement.id,'organizationId',requirement.organization_id,
    'intakeId',requirement.intake_id,'revision',requirement.revision,'outcomeCode','updated','correlationId',correlation_id);
END
$$;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_update_intake_requirement(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; requirement public.intake_requirements%ROWTYPE;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid requirement metadata input';
  END IF;
  -- Authenticate the original scope before checking an immutable legacy receipt.
  -- Receipt replay never accepts a new write or returns legacy response content.
  IF correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'requirementId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
    OR (payload ? 'correlationId' AND lower(payload->>'correlationId') IS DISTINCT FROM lower(correlation_id::text))
    OR (payload ? 'idempotencyKey' AND lower(payload->>'idempotencyKey') IS DISTINCT FROM lower(idempotency_key::text))
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid requirement metadata input'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', (payload->>'organizationId')::uuid, 'Update intake requirement', correlation_id, idempotency_key);
  IF (payload->>'actorIdentityId')::uuid IS DISTINCT FROM context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied';
  END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.requirement.update', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO requirement FROM public.intake_requirements AS ir
      WHERE ir.id=(receipt->>'entity_id')::uuid AND ir.id=(payload->>'requirementId')::uuid
        AND ir.organization_id=(payload->>'organizationId')::uuid AND ir.intake_id=(payload->>'intakeId')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('requirementId',requirement.id,'organizationId',requirement.organization_id,
      'intakeId',requirement.intake_id,'revision',requirement.revision,'outcomeCode','replayed','correlationId',correlation_id);
  END IF;
  IF NOT mmhr_private.r3_requirement_payload_is_valid(payload) OR payload->>'expectedRevision' = '0' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid requirement metadata input';
  END IF;
  RETURN mmhr_private.r3_update_intake_requirement_impl(payload, correlation_id, idempotency_key);
END
$$;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_create_intake_requirement(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; receipt jsonb; intake public.intakes%ROWTYPE;
  requirement public.intake_requirements%ROWTYPE; v_owner_id uuid; v_response jsonb;
BEGIN
  IF correlation_id IS NULL OR idempotency_key IS NULL
    OR NOT mmhr_private.r3_requirement_payload_is_valid(payload)
    OR payload->>'expectedRevision' <> '0'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid requirement metadata input'; END IF;
  IF (payload ? 'correlationId' AND lower(payload->>'correlationId') IS DISTINCT FROM lower(correlation_id::text))
    OR (payload ? 'idempotencyKey' AND lower(payload->>'idempotencyKey') IS DISTINCT FROM lower(idempotency_key::text))
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid requirement metadata input'; END IF;
  v_owner_id := CASE WHEN jsonb_typeof(payload->'ownerIdentityId') = 'null'
    THEN NULL ELSE (payload->>'ownerIdentityId')::uuid END;
  v_response := CASE WHEN jsonb_typeof(payload->'response') = 'null' THEN NULL ELSE payload->'response' END;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'workspace.access', (payload->>'organizationId')::uuid, 'Create intake requirement', correlation_id, idempotency_key);
  IF (payload->>'actorIdentityId')::uuid <> context.actor_identity_id
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.requirement.create', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO requirement FROM public.intake_requirements AS ir
    WHERE ir.id=(receipt->>'entity_id')::uuid AND ir.organization_id=(payload->>'organizationId')::uuid
      AND ir.intake_id=(payload->>'intakeId')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('requirementId',requirement.id,'organizationId',requirement.organization_id,
      'intakeId',requirement.intake_id,'revision',requirement.revision,'outcomeCode','replayed','correlationId',correlation_id);
  END IF;
  SELECT * INTO intake FROM public.intakes AS i
  WHERE i.id=(payload->>'intakeId')::uuid AND i.organization_id=(payload->>'organizationId')::uuid FOR UPDATE;
  IF NOT FOUND OR intake.status NOT IN ('draft','in_progress')
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Requirement lifecycle denied'; END IF;
  IF v_owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members AS om
    WHERE om.org_id=(payload->>'organizationId')::uuid AND om.identity_id=v_owner_id
      AND om.status='active' AND NOT om.migration_review_required
      AND EXISTS (SELECT 1 FROM public.identities AS owner_identity
        WHERE owner_identity.id=om.identity_id AND owner_identity.status='active')
  ) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Requirement owner denied'; END IF;
  BEGIN
    INSERT INTO public.intake_requirements (
      id, organization_id, intake_id, stable_key, label, importance, weight, owner_identity_id,
      response, status, requirement_type, evidence_references, vendor_response_links,
      created_by_identity_id, updated_by_identity_id, revision, correlation_id, created_at, updated_at
    ) VALUES (
      (payload->>'requirementId')::uuid, (payload->>'organizationId')::uuid, (payload->>'intakeId')::uuid,
      lower(btrim(payload->>'stableKey')), btrim(payload->>'label'), payload->>'importance',
      (payload->>'weight')::integer, v_owner_id, v_response, 'active', payload->>'requirementType',
      payload->'evidenceReferences', payload->'vendorResponseLinks', context.actor_identity_id,
      context.actor_identity_id, 1, correlation_id, clock_timestamp(), clock_timestamp()
    ) RETURNING * INTO requirement;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Requirement create denied';
  END;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r3.requirement.create',
    'requirement.create','intake_requirement',requirement.id,requirement.organization_id,
    'Create intake requirement',correlation_id,idempotency_key,payload,
    jsonb_build_object('version',1),jsonb_build_object('version',1,'state',requirement.status),context.authorization_time);
  RETURN jsonb_build_object('requirementId',requirement.id,'organizationId',requirement.organization_id,
    'intakeId',requirement.intake_id,'revision',requirement.revision,'outcomeCode','created','correlationId',correlation_id);
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_update_intake_requirement(jsonb,uuid,uuid),
  public.mmhr_create_intake_requirement(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_update_intake_requirement(jsonb,uuid,uuid),
  public.mmhr_create_intake_requirement(jsonb,uuid,uuid) TO authenticated;
COMMENT ON TABLE public.intake_requirement_history IS 'Immutable R3 requirement snapshots. Legacy backfills are marked without invented historical timestamps.';
COMMENT ON FUNCTION public.mmhr_create_intake_requirement(jsonb,uuid,uuid) IS 'R3 audited organization-scoped requirement creation for draft and in-progress intakes.';
COMMENT ON FUNCTION public.mmhr_update_intake_requirement(jsonb,uuid,uuid) IS 'R3 audited organization-scoped requirement update for draft and in-progress intakes.';
