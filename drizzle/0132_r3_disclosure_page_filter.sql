-- Filter unsupported legacy candidates before applying the page limit.
-- Recovery: revoke disclosure read RPC access and correct forward; preserve records.
SELECT mmhr_private.r1_lock_security();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r3_disclosure_page(payload jsonb, correlation_id uuid, staff boolean)
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
      ORDER BY c.id
    ), items AS (
      SELECT id, jsonb_build_object('candidateId',id,'candidateRevision',(s->>'candidateRevision')::integer,
        'source',s->>'source','state',s->>'state','maskedLabel',s->>'maskedLabel',
        'providerName',s->>'providerName','productName',s->>'productName',
        'publicationId',s->>'publicationId','publicationSequence',(s->>'publicationSequence')::integer,
        'reviewDigest',encode(sha256(convert_to(s::text,'UTF8')),'hex'),
        'canDisclose',(s->>'canDisclose')::boolean,'lastDisclosureAt',last_at) item
      FROM rows WHERE s IS NOT NULL ORDER BY id LIMIT v_limit+1
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
