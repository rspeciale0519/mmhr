-- R3 immutable all-options publication workflow.
-- Publications freeze approved inputs and configuration for each batch.

ALTER TABLE public.evaluation_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_publication_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_publication_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluation_publications, public.evaluation_publication_options,
  public.evaluation_publication_decisions FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r3_deny_raw_evaluation_publications ON public.evaluation_publications
  AS RESTRICTIVE FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);
CREATE POLICY r3_deny_raw_evaluation_publication_options ON public.evaluation_publication_options
  AS RESTRICTIVE FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);
CREATE POLICY r3_deny_raw_evaluation_publication_decisions ON public.evaluation_publication_decisions
  AS RESTRICTIVE FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_publication_state(publication_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.evaluation_publication_decisions d WHERE d.publication_id = $1 AND d.decision = 'revoked') THEN 'revoked'
    WHEN EXISTS (SELECT 1 FROM public.evaluation_publication_decisions d WHERE d.publication_id = $1 AND d.decision = 'published') THEN 'published'
    ELSE 'prepared'
  END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_publication_snapshot(
  organization_id uuid, intake_id uuid, configuration jsonb, as_of timestamptz
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE collected jsonb; normalized_configuration jsonb;
BEGIN
  collected := mmhr_private.r3_collect_publication_inputs($1, $2, $3, $4);
  IF collected IS NULL OR jsonb_typeof(collected) <> 'object'
    OR jsonb_typeof(collected->'intake') <> 'object'
    OR jsonb_typeof(collected->'requirements') <> 'array'
    OR jsonb_typeof(collected->'products') <> 'array'
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid publication inputs'; END IF;
  normalized_configuration := mmhr_private.r3_validate_publication_configuration($3, collected->'requirements');
  RETURN jsonb_build_object('configuration',normalized_configuration,'intake',collected->'intake',
    'requirements',collected->'requirements','products',collected->'products');
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_prepare_evaluation_publication(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; intake public.intakes%ROWTYPE; receipt jsonb;
  publication_id uuid := gen_random_uuid(); configuration jsonb; snapshot jsonb;
  product jsonb; evaluation jsonb; evaluated jsonb := '[]'::jsonb;
  v_organization_id uuid; v_intake_id uuid; expected_revision integer;
  option_count integer; sequence_number integer; input_digest text; state text; ordinal integer := 0;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR NOT (payload ?& ARRAY['organizationId','intakeId','expectedRevision','configuration'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key) WHERE k.key NOT IN ('organizationId','intakeId','expectedRevision','configuration'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR jsonb_typeof(payload->'expectedRevision') <> 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]{0,9}$'
    OR jsonb_typeof(payload->'configuration') <> 'object'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication preparation input'; END IF;
  v_organization_id := (payload->>'organizationId')::uuid; v_intake_id := (payload->>'intakeId')::uuid;
  IF (payload->>'expectedRevision')::numeric NOT BETWEEN 1 AND 2147483647 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication preparation input'; END IF;
  expected_revision := (payload->>'expectedRevision')::integer; configuration := payload->'configuration';
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('evaluation.publish',v_organization_id,'Prepare masked evaluation publication',correlation_id,idempotency_key);
  IF mmhr_private.r1_security_actor('admin.access',NULL::uuid,context.authorization_time) IS DISTINCT FROM context.actor_identity_id
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication authority denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id,'r3.evaluation.publication.prepare',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT p.id,p.sequence,p.input_digest,p.option_count INTO publication_id,sequence_number,input_digest,option_count FROM public.evaluation_publications p
      WHERE p.id=(receipt->>'entity_id')::uuid AND p.organization_id=v_organization_id AND p.intake_id=v_intake_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication authority denied'; END IF;
    state := mmhr_private.r3_publication_state(publication_id);
    RETURN jsonb_build_object('publicationId',publication_id,'organizationId',v_organization_id,'intakeId',v_intake_id,'sequence',sequence_number,
      'configurationVersion',sequence_number,'state',state,'inputDigest',input_digest,'optionCount',option_count,'correlationId',correlation_id,'outcomeCode','replayed');
  END IF;
  SELECT * INTO intake FROM public.intakes i WHERE i.id=v_intake_id AND i.organization_id=v_organization_id FOR UPDATE;
  IF NOT FOUND OR intake.revision<>expected_revision OR intake.status NOT IN ('submitted','under_review','completed')
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication intake revision denied'; END IF;
  snapshot := mmhr_private.r3_publication_snapshot(v_organization_id,v_intake_id,configuration,clock_timestamp());
  IF (snapshot->'intake'->>'id')::uuid IS DISTINCT FROM v_intake_id
    OR (snapshot->'intake'->>'revision')::integer IS DISTINCT FROM intake.revision
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication inputs'; END IF;
  input_digest := encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'); option_count := jsonb_array_length(snapshot->'products');
  SELECT coalesce(max(p.sequence),0)+1 INTO sequence_number FROM public.evaluation_publications p WHERE p.organization_id=v_organization_id AND p.intake_id=v_intake_id;
  INSERT INTO public.evaluation_publications(id,organization_id,intake_id,sequence,intake_revision,configuration,input_snapshot,input_digest,option_count,created_by_identity_id,correlation_id)
    VALUES(publication_id,v_organization_id,v_intake_id,sequence_number,intake.revision,snapshot->'configuration',snapshot,input_digest,option_count,context.actor_identity_id,correlation_id);
  FOR product IN SELECT value FROM jsonb_array_elements(snapshot->'products') LOOP
    evaluation := mmhr_private.r3_evaluate_publication_option(configuration,snapshot->'requirements',product->'inputs');
    IF jsonb_typeof(evaluation)<>'object' OR evaluation ?| ARRAY['optionId','ordinal','maskedLabel','productId','vendorOrganizationId']
      OR coalesce(evaluation->>'eligibility','') NOT IN ('eligible','ineligible','unknown')
      OR coalesce(evaluation->>'deterministicScore','') !~ '^[0-9]+$'
      OR coalesce(evaluation->>'confidenceBasisPoints','') !~ '^[0-9]+$'
      OR jsonb_typeof(evaluation->'fitReasons')<>'array' OR jsonb_typeof(evaluation->'limitations')<>'array'
    THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication option'; END IF;
    evaluated := evaluated || jsonb_build_array(jsonb_build_object('product',product,'evaluation',evaluation));
  END LOOP;
  FOR product IN SELECT value FROM jsonb_array_elements(evaluated)
    ORDER BY (value->'evaluation'->>'deterministicScore')::integer DESC,(value->'product'->>'productId')::uuid LOOP
    ordinal := ordinal+1;
    INSERT INTO public.evaluation_publication_options(organization_id,publication_id,vendor_organization_id,product_id,ordinal,masked_label,eligibility,deterministic_score,confidence_basis_points,fit_reasons,limitations,evidence_fresh_at,valid_until)
      VALUES(v_organization_id,publication_id,(product->'product'->>'vendorOrganizationId')::uuid,(product->'product'->>'productId')::uuid,ordinal,'Option '||ordinal::text,
        product->'evaluation'->>'eligibility',(product->'evaluation'->>'deterministicScore')::integer,(product->'evaluation'->>'confidenceBasisPoints')::integer,
        product->'evaluation'->'fitReasons',product->'evaluation'->'limitations',(product->'evaluation'->>'evidenceFreshAt')::timestamptz,(product->'evaluation'->>'validUntil')::timestamptz);
  END LOOP;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r3.evaluation.publication.prepare','evaluation.publication.prepare','evaluation_publication',publication_id,v_organization_id,'Prepare masked evaluation publication',correlation_id,idempotency_key,payload,jsonb_build_object('version',1),jsonb_build_object('version',1),context.authorization_time);
  RETURN jsonb_build_object('publicationId',publication_id,'organizationId',v_organization_id,'intakeId',v_intake_id,'sequence',sequence_number,'configurationVersion',sequence_number,'state','prepared','inputDigest',input_digest,'optionCount',option_count,'correlationId',correlation_id,'outcomeCode','prepared');
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_publish_evaluation_publication(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; publication public.evaluation_publications%ROWTYPE; prior public.evaluation_publications%ROWTYPE; current_intake public.intakes%ROWTYPE; receipt jsonb; current_snapshot jsonb; current_digest text; state text; v_organization_id uuid; v_publication_id uuid; expected_digest text; approval_reference text; reason text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR correlation_id IS NULL OR idempotency_key IS NULL OR NOT (payload ?& ARRAY['organizationId','publicationId','expectedDigest','approvalReference','reason'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key) WHERE k.key NOT IN ('organizationId','publicationId','expectedDigest','approvalReference','reason'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR coalesce(payload->>'publicationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR coalesce(payload->>'expectedDigest','') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(payload->'approvalReference') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string'
    OR length(btrim(coalesce(payload->>'approvalReference',''))) NOT BETWEEN 1 AND 500 OR NOT mmhr_private.r1_security_reason_is_safe(payload->>'reason')
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication approval input'; END IF;
  v_organization_id:=(payload->>'organizationId')::uuid; v_publication_id:=(payload->>'publicationId')::uuid; expected_digest:=payload->>'expectedDigest'; approval_reference:=btrim(payload->>'approvalReference'); reason:=btrim(payload->>'reason');
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('evaluation.publish',v_organization_id,'Publish masked evaluation publication',correlation_id,idempotency_key);
  IF mmhr_private.r1_security_actor('admin.access',NULL::uuid,context.authorization_time) IS DISTINCT FROM context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication authority denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r3.evaluation.publication.publish',idempotency_key,payload);
  SELECT * INTO publication FROM public.evaluation_publications p WHERE p.id=v_publication_id AND p.organization_id=v_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication authority denied'; END IF;
  state:=mmhr_private.r3_publication_state(publication.id);
  IF receipt IS NOT NULL THEN RETURN jsonb_build_object('publicationId',publication.id,'organizationId',publication.organization_id,'intakeId',publication.intake_id,'sequence',publication.sequence,'configurationVersion',publication.sequence,'state',state,'inputDigest',publication.input_digest,'optionCount',publication.option_count,'correlationId',correlation_id,'outcomeCode','replayed'); END IF;
  IF state<>'prepared' OR expected_digest<>publication.input_digest THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication is stale or already decided'; END IF;
  SELECT * INTO current_intake FROM public.intakes i WHERE i.organization_id=publication.organization_id AND i.id=publication.intake_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication authority denied'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.evaluation_publications newer
    WHERE newer.organization_id=publication.organization_id AND newer.intake_id=publication.intake_id
      AND newer.sequence>publication.sequence
      AND EXISTS (SELECT 1 FROM public.evaluation_publication_decisions d WHERE d.publication_id=newer.id AND d.decision='published')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='A newer publication already exists';
  END IF;
  current_snapshot:=mmhr_private.r3_publication_snapshot(publication.organization_id,publication.intake_id,publication.configuration,clock_timestamp()); current_digest:=encode(sha256(convert_to(current_snapshot::text,'UTF8')),'hex');
  IF current_digest<>publication.input_digest THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication inputs changed'; END IF;
  FOR prior IN
    SELECT p.* FROM public.evaluation_publications p
    WHERE p.organization_id=publication.organization_id AND p.intake_id=publication.intake_id AND p.id<>publication.id AND p.sequence<publication.sequence
      AND EXISTS (SELECT 1 FROM public.evaluation_publication_decisions d WHERE d.publication_id=p.id AND d.decision='published')
      AND NOT EXISTS (SELECT 1 FROM public.evaluation_publication_decisions d WHERE d.publication_id=p.id AND d.decision='revoked')
    ORDER BY p.sequence FOR UPDATE
  LOOP
    INSERT INTO public.evaluation_publication_decisions(organization_id,publication_id,decision,reason,approval_reference,actor_identity_id,correlation_id)
      VALUES(prior.organization_id,prior.id,'revoked','Superseded by the newer approved publication',NULL,context.actor_identity_id,correlation_id);
    INSERT INTO public.audit_events(actor_type,actor_identity_id,organization_id,command,action,entity_type,entity_id,reason,correlation_id,before_summary,after_summary,occurred_at)
      VALUES('user',context.actor_identity_id,prior.organization_id,'evaluation.publication.publish','evaluation.publication.revoke','evaluation_publication',prior.id::text,
        'Supersede the prior published evaluation publication',correlation_id,
         jsonb_build_object('version',1),jsonb_build_object('version',1),context.authorization_time);
  END LOOP;
  INSERT INTO public.evaluation_publication_decisions(organization_id,publication_id,decision,reason,approval_reference,actor_identity_id,correlation_id) VALUES(publication.organization_id,publication.id,'published',reason,approval_reference,context.actor_identity_id,correlation_id);
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r3.evaluation.publication.publish','evaluation.publication.publish','evaluation_publication',publication.id,publication.organization_id,reason,correlation_id,idempotency_key,payload,jsonb_build_object('version',1),jsonb_build_object('version',1),context.authorization_time);
  RETURN jsonb_build_object('publicationId',publication.id,'organizationId',publication.organization_id,'intakeId',publication.intake_id,'sequence',publication.sequence,'configurationVersion',publication.sequence,'state','published','inputDigest',publication.input_digest,'optionCount',publication.option_count,'correlationId',correlation_id,'outcomeCode','published');
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_revoke_evaluation_publication(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE context record; publication public.evaluation_publications%ROWTYPE; current_intake public.intakes%ROWTYPE; receipt jsonb; state text; v_organization_id uuid; v_publication_id uuid; reason text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR correlation_id IS NULL OR idempotency_key IS NULL OR NOT (payload ?& ARRAY['organizationId','publicationId','reason'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key) WHERE k.key NOT IN ('organizationId','publicationId','reason'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR coalesce(payload->>'publicationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR NOT mmhr_private.r1_security_reason_is_safe(payload->>'reason')
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication revoke input'; END IF;
  IF jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication revoke input';
  END IF;
  v_organization_id:=(payload->>'organizationId')::uuid; v_publication_id:=(payload->>'publicationId')::uuid; reason:=btrim(payload->>'reason');
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('evaluation.publish',v_organization_id,'Revoke masked evaluation publication',correlation_id,idempotency_key);
  IF mmhr_private.r1_security_actor('admin.access',NULL::uuid,context.authorization_time) IS DISTINCT FROM context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication authority denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'r3.evaluation.publication.revoke',idempotency_key,payload);
  SELECT * INTO publication FROM public.evaluation_publications p WHERE p.id=v_publication_id AND p.organization_id=v_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication authority denied'; END IF;
  state:=mmhr_private.r3_publication_state(publication.id);
  IF receipt IS NOT NULL THEN RETURN jsonb_build_object('publicationId',publication.id,'organizationId',publication.organization_id,'intakeId',publication.intake_id,'sequence',publication.sequence,'configurationVersion',publication.sequence,'state',state,'inputDigest',publication.input_digest,'optionCount',publication.option_count,'correlationId',correlation_id,'outcomeCode','replayed'); END IF;
  IF state NOT IN ('prepared','published') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Only an active publication can be revoked'; END IF;
  SELECT * INTO current_intake FROM public.intakes i WHERE i.organization_id=publication.organization_id AND i.id=publication.intake_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication authority denied'; END IF;
  INSERT INTO public.evaluation_publication_decisions(organization_id,publication_id,decision,reason,approval_reference,actor_identity_id,correlation_id) VALUES(publication.organization_id,publication.id,'revoked',reason,NULL,context.actor_identity_id,correlation_id);
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'r3.evaluation.publication.revoke','evaluation.publication.revoke','evaluation_publication',publication.id,publication.organization_id,reason,correlation_id,idempotency_key,payload,jsonb_build_object('version',1),jsonb_build_object('version',1),context.authorization_time);
  RETURN jsonb_build_object('publicationId',publication.id,'organizationId',publication.organization_id,'intakeId',publication.intake_id,'sequence',publication.sequence,'configurationVersion',publication.sequence,'state','revoked','inputDigest',publication.input_digest,'optionCount',publication.option_count,'correlationId',correlation_id,'outcomeCode','revoked');
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mmhr_private.r3_read_evaluation_publication(payload jsonb, correlation_id uuid, internal_requested boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE checked_at timestamptz; publication public.evaluation_publications%ROWTYPE; state text; v_org uuid; v_intake uuid; v_id uuid; after_ordinal integer:=0; page_limit integer:=25; internal_read boolean; current_sequence integer; options jsonb; next_ordinal integer;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload)<>'object' OR correlation_id IS NULL OR NOT (payload ?& ARRAY['organizationId','intakeId','publicationId'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS k(key) WHERE k.key NOT IN ('organizationId','intakeId','publicationId','afterOrdinal','limit'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR coalesce(payload->>'intakeId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' OR coalesce(payload->>'publicationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication read input'; END IF;
  IF payload ? 'afterOrdinal' THEN IF jsonb_typeof(payload->'afterOrdinal')<>'number' OR coalesce(payload->>'afterOrdinal','') !~ '^[0-9]{1,10}$' OR (payload->>'afterOrdinal')::numeric > 2147483647 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication read input'; END IF; after_ordinal:=(payload->>'afterOrdinal')::integer; END IF;
  IF payload ? 'limit' THEN IF jsonb_typeof(payload->'limit')<>'number' OR coalesce(payload->>'limit','') !~ '^[1-9][0-9]{0,9}$' OR (payload->>'limit')::numeric > 50 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication read input'; END IF; page_limit:=(payload->>'limit')::integer; END IF;
  IF after_ordinal<0 OR page_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid publication read input'; END IF;
  v_org:=(payload->>'organizationId')::uuid; v_intake:=(payload->>'intakeId')::uuid; v_id:=(payload->>'publicationId')::uuid; checked_at:=mmhr_private.r1_lock_security();
  internal_read:=internal_requested AND mmhr_private.r1_request_has_permission('evaluation.publish',v_org) AND mmhr_private.r1_request_has_permission('admin.access',NULL::uuid);
  IF internal_requested AND NOT internal_read THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication review denied';
  END IF;
  IF NOT internal_read AND NOT mmhr_private.r1_request_has_permission('portal.customer.access',v_org) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication read denied'; END IF;
  SELECT * INTO publication FROM public.evaluation_publications p WHERE p.id=v_id AND p.organization_id=v_org AND p.intake_id=v_intake FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication read denied'; END IF;
  state:=mmhr_private.r3_publication_state(publication.id);
  IF internal_read THEN
    IF state NOT IN ('prepared','published') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication read denied'; END IF;
  ELSE
    SELECT max(p.sequence) INTO current_sequence
      FROM public.evaluation_publications p
      WHERE p.organization_id=v_org AND p.intake_id=v_intake
        AND mmhr_private.r3_publication_state(p.id)='published'
        AND NOT EXISTS (SELECT 1 FROM public.evaluation_publication_decisions d WHERE d.publication_id=p.id AND d.decision='revoked');
    IF state<>'published' OR publication.sequence IS DISTINCT FROM current_sequence THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication read denied'; END IF;
    IF encode(sha256(convert_to(mmhr_private.r3_publication_snapshot(publication.organization_id,publication.intake_id,publication.configuration,clock_timestamp())::text,'UTF8')),'hex') <> publication.input_digest THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Publication is stale';
    END IF;
  END IF;
  WITH page AS (SELECT o.id,o.ordinal,o.masked_label,o.eligibility,o.deterministic_score,o.confidence_basis_points,o.fit_reasons,o.limitations,o.evidence_fresh_at,o.valid_until,row_number() OVER (ORDER BY o.ordinal) AS rn FROM public.evaluation_publication_options o WHERE o.organization_id=v_org AND o.publication_id=v_id AND o.ordinal>after_ordinal)
  SELECT coalesce(jsonb_agg(jsonb_build_object('optionId',id,'ordinal',ordinal,'maskedLabel',masked_label,'eligibility',eligibility,'deterministicScore',deterministic_score,'confidenceBasisPoints',confidence_basis_points,'fitReasons',fit_reasons,'limitations',limitations,'evidenceFreshAt',evidence_fresh_at,'validUntil',valid_until) ORDER BY ordinal) FILTER (WHERE rn<=page_limit),'[]'::jsonb),min(ordinal) FILTER (WHERE rn=page_limit+1) INTO options,next_ordinal FROM page;
  IF next_ordinal IS NOT NULL THEN next_ordinal:=next_ordinal-1; END IF;
  RETURN jsonb_build_object('publicationId',publication.id,'organizationId',publication.organization_id,'intakeId',publication.intake_id,'sequence',publication.sequence,'configurationVersion',publication.sequence,'state',state,'inputDigest',publication.input_digest,'optionCount',publication.option_count,'options',options,'nextOrdinal',next_ordinal,'correlationId',correlation_id);
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_get_evaluation_publication(payload jsonb, correlation_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$ SELECT mmhr_private.r3_read_evaluation_publication($1,$2,false) $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mmhr_review_evaluation_publication(payload jsonb, correlation_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$ SELECT mmhr_private.r3_read_evaluation_publication($1,$2,true) $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.mmhr_prepare_evaluation_publication(jsonb,uuid,uuid), public.mmhr_publish_evaluation_publication(jsonb,uuid,uuid), public.mmhr_revoke_evaluation_publication(jsonb,uuid,uuid), public.mmhr_get_evaluation_publication(jsonb,uuid), public.mmhr_review_evaluation_publication(jsonb,uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r3_publication_state(uuid), mmhr_private.r3_publication_snapshot(uuid,uuid,jsonb,timestamptz) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
REVOKE ALL ON FUNCTION mmhr_private.r3_read_evaluation_publication(jsonb,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_prepare_evaluation_publication(jsonb,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mmhr_publish_evaluation_publication(jsonb,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mmhr_revoke_evaluation_publication(jsonb,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mmhr_get_evaluation_publication(jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mmhr_review_evaluation_publication(jsonb,uuid) TO authenticated;
