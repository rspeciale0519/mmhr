-- Complete the previously empty disclosure RPC boundary without changing applied migrations.
-- Forward: private append-only disclosure records and caller-authorized reads/writes.
-- Recovery: revoke the public RPCs and correct forward; retain disclosure and audit history.
ALTER TABLE public.evaluation_disclosures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluation_disclosures FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r3_deny_raw_disclosures ON public.evaluation_disclosures
  AS RESTRICTIVE FOR ALL TO anon, authenticated, service_role, mmhr_worker USING (false) WITH CHECK (false);
CREATE TRIGGER evaluation_disclosures_append_only BEFORE UPDATE OR DELETE ON public.evaluation_disclosures
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
CREATE TRIGGER evaluation_disclosures_append_only_truncate BEFORE TRUNCATE ON public.evaluation_disclosures
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r1_reject_immutable_mutation();
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r3_disclosure_snapshot(org_id uuid, intake_id uuid, candidate_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('candidateId', c.id, 'candidateRevision', c.revision,
    'source', c.source, 'state', c.state, 'maskedLabel', o.masked_label,
    'providerName', v.name, 'productName', p.name, 'productId', p.id,
    'vendorOrganizationId', p.organization_id, 'publicationId', pub.id,
    'publicationSequence', pub.sequence, 'optionId', o.id, 'inputDigest', pub.input_digest,
    'intakeRevision', i.revision, 'productRevision', p.revision,
    'canDisclose', c.state IN ('proposed','active','selected') AND i.status = 'submitted'
      AND pub.intake_revision = i.revision AND p.status = 'active' AND v.status = 'active'
      AND vp.status = 'active' AND mmhr_private.r3_publication_state(pub.id) = 'published'
      AND (o.valid_until IS NULL OR o.valid_until > statement_timestamp()))
  FROM public.evaluation_candidates c
  JOIN public.intakes i ON i.organization_id = c.organization_id AND i.id = c.intake_id
  JOIN public.evaluation_initial_selection_items si
    ON si.organization_id = c.organization_id AND si.intake_id = c.intake_id AND si.candidate_id = c.id
  JOIN public.evaluation_publication_options o ON o.organization_id = si.organization_id
    AND o.publication_id = si.publication_id AND o.id = si.option_id
    AND o.vendor_organization_id = c.vendor_organization_id AND o.product_id = c.product_id
  JOIN public.evaluation_publications pub ON pub.organization_id = si.organization_id
    AND pub.intake_id = si.intake_id AND pub.id = si.publication_id
  JOIN public.products p ON p.organization_id = c.vendor_organization_id AND p.id = c.product_id
  JOIN public.orgs v ON v.id = p.organization_id AND v.type = 'vendor'
  JOIN public.vendor_profiles vp ON vp.organization_id = p.organization_id AND vp.id = p.vendor_profile_id
  WHERE c.organization_id = $1 AND c.intake_id = $2 AND c.id = $3
$$;
REVOKE ALL ON FUNCTION mmhr_private.r3_disclosure_snapshot(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint

CREATE FUNCTION mmhr_private.r3_disclosure_page(payload jsonb, correlation_id uuid, staff boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  v_org uuid; v_intake uuid; v_after uuid; v_limit integer; v_items jsonb; v_cursor uuid;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid disclosure page';
  END IF;
  IF NOT (payload ?& ARRAY['organizationId','intakeId']) OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('organizationId','intakeId','afterId','pageSize'))
    OR coalesce(payload->>'organizationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR coalesce(payload->>'intakeId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (payload ? 'afterId' AND coalesce(payload->>'afterId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR (payload ? 'pageSize' AND (jsonb_typeof(payload->'pageSize') IS DISTINCT FROM 'number'
      OR coalesce(payload->>'pageSize','') !~ '^[1-9][0-9]?$')) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid disclosure page';
  END IF;
  v_org := (payload->>'organizationId')::uuid; v_intake := (payload->>'intakeId')::uuid;
  v_after := (payload->>'afterId')::uuid; v_limit := coalesce((payload->>'pageSize')::integer,25);
  IF v_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid disclosure page'; END IF;
  PERFORM mmhr_private.r1_lock_security();
  IF (staff AND (NOT mmhr_private.r1_request_has_permission('evaluation.disclose',v_org)
      OR NOT mmhr_private.r1_request_has_permission('admin.access',NULL)))
    OR (NOT staff AND NOT mmhr_private.r1_request_has_permission('portal.customer.access',v_org))
    OR NOT EXISTS (SELECT 1 FROM public.intakes i WHERE i.organization_id=v_org AND i.id=v_intake) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Disclosure read denied';
  END IF;
  IF staff THEN
    WITH rows AS (
      SELECT c.id, mmhr_private.r3_disclosure_snapshot(v_org,v_intake,c.id) s,
        (SELECT max(d.disclosed_at) FROM public.evaluation_disclosures d
         WHERE d.organization_id=v_org AND d.intake_id=v_intake AND d.candidate_id=c.id) last_at
      FROM public.evaluation_candidates c WHERE c.organization_id=v_org AND c.intake_id=v_intake
        AND (v_after IS NULL OR c.id>v_after)
      ORDER BY c.id LIMIT v_limit+1
    ), items AS (
      SELECT id, jsonb_build_object('candidateId',id,'candidateRevision',(s->>'candidateRevision')::integer,
        'source',s->>'source','state',s->>'state','maskedLabel',s->>'maskedLabel',
        'providerName',s->>'providerName','productName',s->>'productName',
        'publicationId',s->>'publicationId','publicationSequence',(s->>'publicationSequence')::integer,
        'reviewDigest',encode(sha256(convert_to(s::text,'UTF8')),'hex'),
        'canDisclose',(s->>'canDisclose')::boolean,'lastDisclosureAt',last_at) item
      FROM rows WHERE s IS NOT NULL ORDER BY id
    ) SELECT coalesce(jsonb_agg(item ORDER BY id),'[]'::jsonb) INTO v_items FROM items;
  ELSE
    WITH latest AS (
      SELECT DISTINCT ON (d.candidate_id) d.* FROM public.evaluation_disclosures d
      WHERE d.organization_id=v_org AND d.intake_id=v_intake AND (v_after IS NULL OR d.candidate_id>v_after)
      ORDER BY d.candidate_id,d.disclosed_at DESC,d.id DESC
    ), page AS (SELECT * FROM latest ORDER BY candidate_id LIMIT v_limit+1)
    SELECT coalesce(jsonb_agg(jsonb_build_object('disclosureId',id,'candidateId',candidate_id,
      'maskedLabel',masked_label,'providerName',provider_name,'productName',product_name,
      'conflictDisclosure',conflict_disclosure,'disclosedAt',disclosed_at,'discussionAt',discussion_at)
      ORDER BY candidate_id),'[]'::jsonb) INTO v_items FROM page;
  END IF;
  IF jsonb_array_length(v_items)>v_limit THEN
    v_items := v_items - v_limit;
    v_cursor := (v_items->(v_limit-1)->>'candidateId')::uuid;
  END IF;
  RETURN jsonb_build_object('organizationId',v_org,'intakeId',v_intake,'items',v_items,
    'nextCursor',v_cursor,'correlationId',correlation_id);
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r3_disclosure_page(jsonb,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_evaluation_disclosure_review(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT mmhr_private.r3_disclosure_page(payload,correlation_id,true)
$$;
CREATE FUNCTION public.mmhr_get_evaluation_disclosures(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT mmhr_private.r3_disclosure_page(payload,correlation_id,false)
$$;
REVOKE ALL ON FUNCTION public.mmhr_get_evaluation_disclosure_review(jsonb,uuid),
  public.mmhr_get_evaluation_disclosures(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_evaluation_disclosure_review(jsonb,uuid),
  public.mmhr_get_evaluation_disclosures(jsonb,uuid) TO authenticated;
--> statement-breakpoint

CREATE FUNCTION public.mmhr_record_evaluation_disclosure(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  ctx record; v_org uuid; v_intake uuid; v_candidate uuid; v_discussion timestamptz;
  v_snapshot jsonb; v_digest text; v_receipt jsonb; v_id uuid; v_outcome text := 'recorded';
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid disclosure input';
  END IF;
  IF correlation_id IS NULL OR idempotency_key IS NULL
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 8
    OR NOT (payload ?& ARRAY['organizationId','intakeId','candidateId','expectedReviewDigest',
      'discussionAt','discussionReference','conflictDisclosure','reason'])
    OR coalesce(payload->>'expectedReviewDigest','') !~ '^[a-f0-9]{64}$'
    OR length(btrim(coalesce(payload->>'discussionReference',''))) NOT BETWEEN 1 AND 300
    OR length(btrim(coalesce(payload->>'conflictDisclosure',''))) NOT BETWEEN 1 AND 2000
    OR length(btrim(coalesce(payload->>'reason',''))) NOT BETWEEN 1 AND 500
    OR EXISTS (SELECT 1 FROM jsonb_each(payload) p WHERE jsonb_typeof(p.value) IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid disclosure input';
  END IF;
  v_org := (payload->>'organizationId')::uuid; v_intake := (payload->>'intakeId')::uuid;
  v_candidate := (payload->>'candidateId')::uuid; v_discussion := (payload->>'discussionAt')::timestamptz;
  IF v_discussion IS NULL OR NOT isfinite(v_discussion) OR v_discussion>clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid disclosure discussion time';
  END IF;
  SELECT * INTO ctx FROM mmhr_private.r1_start_security_command('evaluation.disclose',v_org,
    'Record reviewed provider disclosure',correlation_id,idempotency_key);
  IF NOT mmhr_private.r1_request_has_permission('admin.access',NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Disclosure authority denied';
  END IF;
  v_receipt := mmhr_private.r1_checked_receipt(ctx.actor_identity_id,'r3.evaluation.disclose',idempotency_key,payload);
  IF v_receipt IS NOT NULL THEN
    SELECT d.id INTO v_id FROM public.evaluation_disclosures d
    WHERE d.id=(v_receipt->>'entity_id')::uuid AND d.organization_id=v_org
      AND d.intake_id=v_intake AND d.candidate_id=v_candidate;
    IF v_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Disclosure replay denied'; END IF;
    v_outcome := 'replayed';
  ELSE
    PERFORM 1 FROM public.intakes i WHERE i.organization_id=v_org AND i.id=v_intake FOR UPDATE;
    PERFORM 1 FROM public.evaluation_candidates c WHERE c.organization_id=v_org AND c.intake_id=v_intake AND c.id=v_candidate FOR UPDATE;
    v_snapshot := mmhr_private.r3_disclosure_snapshot(v_org,v_intake,v_candidate);
    v_digest := encode(sha256(convert_to(v_snapshot::text,'UTF8')),'hex');
    IF v_snapshot IS NULL OR (v_snapshot->>'canDisclose')::boolean IS DISTINCT FROM true
      OR v_digest IS DISTINCT FROM payload->>'expectedReviewDigest' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Disclosure review changed';
    END IF;
    INSERT INTO public.evaluation_disclosures(organization_id,intake_id,candidate_id,candidate_revision,
      publication_id,option_id,vendor_organization_id,product_id,review_digest,masked_label,
      provider_name,product_name,conflict_disclosure,discussion_at,discussion_reference,reason,
      disclosed_by_identity_id,correlation_id)
    VALUES(v_org,v_intake,v_candidate,(v_snapshot->>'candidateRevision')::integer,
      (v_snapshot->>'publicationId')::uuid,(v_snapshot->>'optionId')::uuid,
      (v_snapshot->>'vendorOrganizationId')::uuid,(v_snapshot->>'productId')::uuid,v_digest,
      v_snapshot->>'maskedLabel',v_snapshot->>'providerName',v_snapshot->>'productName',
      btrim(payload->>'conflictDisclosure'),v_discussion,btrim(payload->>'discussionReference'),
      btrim(payload->>'reason'),ctx.actor_identity_id,correlation_id) RETURNING id INTO v_id;
    PERFORM mmhr_private.r1_finish_security_command(ctx.actor_identity_id,'r3.evaluation.disclose',
      'evaluation.disclose','evaluation_disclosure',v_id,v_org,'Record reviewed provider disclosure',
      correlation_id,idempotency_key,payload,NULL,jsonb_build_object('state','completed'),ctx.authorization_time);
  END IF;
  RETURN jsonb_build_object('organizationId',v_org,'intakeId',v_intake,'candidateId',v_candidate,
    'disclosureId',v_id,'correlationId',correlation_id,'outcomeCode',v_outcome);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_evaluation_disclosure(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_evaluation_disclosure(jsonb,uuid,uuid) TO authenticated;
