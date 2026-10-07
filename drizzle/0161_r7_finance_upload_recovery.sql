ALTER TABLE "workflow_document_upload_events" DROP CONSTRAINT "workflow_document_upload_events_action_ck";--> statement-breakpoint
ALTER TABLE "workflow_document_upload_events" ADD CONSTRAINT "workflow_document_upload_events_action_ck" CHECK ("workflow_document_upload_events"."action" in ('reserve', 'uploaded', 'scan_claimed', 'scan_clean', 'scan_rejected', 'scan_failed', 'review_started', 'approve', 'reject', 'retry', 'supersede', 'abandon'));
--> statement-breakpoint
-- An abandoned reservation retains its immutable original and private object, if any.
-- This path cannot cancel a scanner job or manufacture scanned/uploaded evidence.
CREATE FUNCTION mmhr_private.r7_finance_document_unstarted(requested_version uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.workflow_document_uploads u
    JOIN public.workflow_document_versions v ON v.id=u.version_id AND v.organization_id=u.organization_id AND v.document_id=u.document_id
    WHERE u.version_id=requested_version AND u.source_kind='finance' AND u.processing_job_id IS NULL
      AND u.lease_token IS NULL AND u.lease_expires_at IS NULL AND u.scan_evidence IS NULL
      AND u.approved_by_identity_id IS NULL AND u.approved_at IS NULL AND u.failure_code IS NULL
      AND v.state='ready' AND v.scan_state='pending'
      AND NOT EXISTS(SELECT 1 FROM public.workflow_jobs j
        WHERE j.payload_references @> jsonb_build_array(jsonb_build_object('versionId',requested_version)))
      AND NOT EXISTS(SELECT 1 FROM public.finance_document_approvals a WHERE a.version_id=requested_version)
      AND NOT EXISTS(SELECT 1 FROM mmhr_private.finance_document_access_grants g WHERE g.version_id=requested_version))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_unstarted(uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r7_finance_document_abandon_evidence(requested_version uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.workflow_document_uploads u
    JOIN public.workflow_document_upload_events e ON e.version_id=u.version_id AND e.organization_id=u.organization_id
      AND e.revision=2 AND e.action='abandon' AND e.snapshot=jsonb_build_object('state','rejected','reason',u.review_reason)
    JOIN public.security_command_receipts r ON r.entity_id=e.version_id AND r.actor_identity_id=e.actor_identity_id
      AND r.command='r7.finance.document.abandon' AND r.action='document.abandon'
    JOIN public.audit_events a ON a.id=r.audit_event_id AND a.actor_type='user'
      AND a.actor_identity_id=e.actor_identity_id AND a.organization_id=e.organization_id
      AND a.command=r.command AND a.action=r.action AND a.entity_type='workflow_document_version'
      AND a.entity_id=e.version_id::text AND a.correlation_id=e.correlation_id
      AND a.idempotency_key=r.idempotency_key::text AND a.reason=btrim(u.review_reason)
      AND a.before_summary=jsonb_build_object('status','completed') AND a.after_summary=jsonb_build_object('status','completed')
      AND a.occurred_at=e.created_at AND r.created_at=e.created_at
    WHERE u.version_id=requested_version AND u.source_kind='finance' AND u.state='rejected' AND u.revision=2
      AND mmhr_private.r1_security_reason_is_safe(u.review_reason)
      AND mmhr_private.r7_finance_document_unstarted(u.version_id)
      AND (SELECT count(*) FROM public.workflow_document_upload_events h WHERE h.version_id=u.version_id)=2
      AND r.request_digest=encode(sha256(convert_to(jsonb_build_object('organizationId',u.organization_id,
        'documentId',u.document_id,'versionId',u.version_id,'expectedRevision',1,'reason',u.review_reason)::text,'UTF8')),'hex'))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r7_finance_document_abandon_evidence(uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_finance_document_recovery(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['organizationId','documentId','versionId']; requested_org uuid; requested_doc uuid;
  requested_version uuid; actor uuid; upload public.workflow_document_uploads%ROWTYPE;
  original public.workflow_document_versions%ROWTYPE; source jsonb; current_version integer;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& keys) OR correlation_id IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE NOT(field=ANY(keys)))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid finance upload recovery'; END IF;
  requested_org:=(payload->>'organizationId')::uuid; requested_doc:=(payload->>'documentId')::uuid;
  requested_version:=(payload->>'versionId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r7_finance_document_actor(requested_org);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload recovery denied'; END IF;
  SELECT u.* INTO upload FROM public.workflow_document_uploads u JOIN public.workflow_documents d
    ON d.id=u.document_id AND d.organization_id=u.organization_id
    JOIN public.workflow_document_versions v ON v.id=u.version_id AND v.organization_id=u.organization_id
      AND v.document_id=u.document_id AND v.version=d.current_version
    WHERE u.version_id=requested_version AND u.document_id=requested_doc AND u.organization_id=requested_org
      AND u.source_kind='finance' AND u.state='received' AND u.revision=1 AND d.state='active';
  IF NOT FOUND OR NOT mmhr_private.r7_finance_document_unstarted(requested_version) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload recovery denied'; END IF;
  SELECT f.source_snapshot INTO source FROM public.finance_document_sources f WHERE f.version_id=requested_version;
  IF NOT mmhr_private.r7_finance_document_source_integrity(requested_org,source) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload recovery denied'; END IF;
  SELECT * INTO original FROM public.workflow_document_versions v WHERE v.id=requested_version;
  SELECT d.current_version INTO current_version FROM public.workflow_documents d WHERE d.id=requested_doc;
  RETURN jsonb_build_object('organizationId',requested_org,'correlationId',correlation_id,
    'document',mmhr_private.r4_workspace_document_metadata(upload,original,current_version),
    'reservationCorrelationId',upload.correlation_id,'sha256',lower(original.sha256),
    'reservationExpiresAt',upload.created_at+interval '10 minutes',
    'canResume',upload.uploaded_by_identity_id=actor AND upload.created_at>clock_timestamp()-interval '10 minutes'
      AND mmhr_private.r7_finance_document_source_valid(requested_org,source),'canAbandon',true);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_get_finance_document_recovery(jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_get_finance_document_recovery(jsonb,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_abandon_finance_document_upload(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['organizationId','documentId','versionId','expectedRevision','reason']; requested_org uuid;
  requested_doc uuid; requested_version uuid; actor uuid; checked_at timestamptz; receipt jsonb;
  upload public.workflow_document_uploads%ROWTYPE; source jsonb;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& keys)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE NOT(field=ANY(keys)))
    OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR payload->'expectedRevision' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string'
    OR NOT mmhr_private.r1_security_reason_is_safe(payload->>'reason') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid finance upload abandonment'; END IF;
  requested_org:=(payload->>'organizationId')::uuid; requested_doc:=(payload->>'documentId')::uuid;
  requested_version:=(payload->>'versionId')::uuid; checked_at:=mmhr_private.r1_lock_security();
  actor:=mmhr_private.r7_finance_document_actor(requested_org);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload abandonment denied'; END IF;
  SELECT * INTO upload FROM public.workflow_document_uploads u WHERE u.version_id=requested_version
    AND u.document_id=requested_doc AND u.organization_id=requested_org AND u.source_kind='finance' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload abandonment denied'; END IF;
  SELECT f.source_snapshot INTO source FROM public.finance_document_sources f WHERE f.version_id=requested_version;
  IF NOT mmhr_private.r7_finance_document_source_integrity(requested_org,source) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload abandonment denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r7.finance.document.abandon',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    IF (receipt->>'entity_id')::uuid IS DISTINCT FROM requested_version
      OR NOT mmhr_private.r7_finance_document_abandon_evidence(requested_version)
      OR NOT EXISTS(SELECT 1 FROM public.workflow_document_upload_events e WHERE e.version_id=requested_version
        AND e.revision=2 AND e.action='abandon' AND e.actor_identity_id=actor
        AND e.correlation_id=mmhr_abandon_finance_document_upload.correlation_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload abandonment replay denied'; END IF;
  ELSE
    IF upload.state<>'received' OR upload.revision<>1 OR upload.review_reason IS NOT NULL
      OR NOT mmhr_private.r7_finance_document_unstarted(requested_version)
      OR NOT EXISTS(SELECT 1 FROM public.workflow_documents d JOIN public.workflow_document_versions v
        ON v.document_id=d.id AND v.organization_id=d.organization_id AND v.version=d.current_version
        WHERE d.id=requested_doc AND d.organization_id=requested_org AND d.state='active' AND v.id=requested_version)
      OR (SELECT count(*) FROM public.workflow_document_upload_events e WHERE e.version_id=requested_version)<>1 THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload abandonment denied'; END IF;
    UPDATE public.workflow_document_uploads SET state='rejected',revision=2,review_reason=payload->>'reason',updated_at=checked_at
      WHERE version_id=requested_version;
    INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,actor_identity_id,snapshot,correlation_id,created_at)
      VALUES(requested_org,requested_version,2,'abandon',actor,
        jsonb_build_object('state','rejected','reason',payload->>'reason'),correlation_id,checked_at);
    PERFORM mmhr_private.r1_finish_security_command(actor,'r7.finance.document.abandon','document.abandon',
      'workflow_document_version',requested_version,requested_org,payload->>'reason',correlation_id,idempotency_key,payload,
      jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),checked_at);
  END IF;
  RETURN jsonb_build_object('organizationId',requested_org,'documentId',requested_doc,'versionId',requested_version,
    'correlationId',correlation_id,'action','abandon_upload','state','rejected','revision',2,
    'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mmhr_abandon_finance_document_upload(jsonb,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_abandon_finance_document_upload(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
-- Preserve each installed function's identity, ownership, ACL, and settings.
-- Fail the migration if its narrowly reviewed expansion point has changed.
DO $patch$
DECLARE definition text; needle text; replacement text;
BEGIN
  definition:=pg_get_functiondef('mmhr_private.r4_document_upload_guard()'::regprocedure);
  needle:=$old$WHEN 'received' THEN NEW.state IN ('quarantined','failed')$old$;
  replacement:=$new$WHEN 'received' THEN NEW.state IN ('quarantined','failed')
        OR (OLD.source_kind='finance' AND OLD.revision=1 AND OLD.review_reason IS NULL
          AND NEW.state='rejected' AND NEW.revision=2 AND NEW.processing_job_id IS NULL
          AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL AND NEW.scan_evidence IS NULL
          AND NEW.approved_by_identity_id IS NULL AND NEW.approved_at IS NULL AND NEW.failure_code IS NULL
          AND mmhr_private.r1_security_reason_is_safe(NEW.review_reason)
          AND mmhr_private.r7_finance_document_actor(NEW.organization_id) IS NOT NULL
          AND mmhr_private.r7_finance_document_unstarted(NEW.version_id))$new$;
  IF (length(definition)-length(replace(definition,needle,'')))<>length(needle) THEN
    RAISE EXCEPTION 'Finance abandonment transition expansion point changed'; END IF;
  EXECUTE replace(definition,needle,replacement);

  definition:=pg_get_functiondef('mmhr_private.r7_finance_document_commit_guard()'::regprocedure);
  needle:=$old$  IF v_upload.state<>'received' THEN$old$;
  replacement:=$new$  IF EXISTS(SELECT 1 FROM public.workflow_document_upload_events e
    WHERE e.version_id=v_version AND e.action='abandon') THEN
    IF NOT mmhr_private.r7_finance_document_abandon_evidence(v_version) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload abandonment evidence missing'; END IF;
    RETURN NEW;
  END IF;
  IF v_upload.state<>'received' THEN$new$;
  IF (length(definition)-length(replace(definition,needle,'')))<>length(needle) THEN
    RAISE EXCEPTION 'Finance abandonment committed evidence expansion point changed'; END IF;
  EXECUTE replace(definition,needle,replacement);

  definition:=pg_get_functiondef('mmhr_private.r7_finance_document_event_guard()'::regprocedure);
  needle:=$old$  IF NOT FOUND THEN RETURN NEW; END IF;$old$;
  replacement:=$new$  IF NOT FOUND THEN
    IF NEW.action='abandon' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload abandonment source denied'; END IF;
    RETURN NEW;
  END IF;$new$;
  IF (length(definition)-length(replace(definition,needle,'')))<>length(needle) THEN
    RAISE EXCEPTION 'Finance abandonment source expansion point changed'; END IF;
  definition:=replace(definition,needle,replacement);
  needle:=$old$WHEN 'reserve' THEN 'received' WHEN 'uploaded' THEN 'quarantined'$old$;
  replacement:=$new$WHEN 'reserve' THEN 'received' WHEN 'uploaded' THEN 'quarantined' WHEN 'abandon' THEN 'rejected'$new$;
  IF (length(definition)-length(replace(definition,needle,'')))<>length(needle) THEN
    RAISE EXCEPTION 'Finance abandonment state expansion point changed'; END IF;
  definition:=replace(definition,needle,replacement);
  needle:=$old$NEW.action NOT IN ('reserve','uploaded','review_started','approve','reject')$old$;
  replacement:=$new$NEW.action NOT IN ('reserve','uploaded','review_started','approve','reject','abandon')$new$;
  IF (length(definition)-length(replace(definition,needle,'')))<>length(needle) THEN
    RAISE EXCEPTION 'Finance abandonment actor expansion point changed'; END IF;
  definition:=replace(definition,needle,replacement);
  needle:=$old$    IF (NEW.action IN ('reserve','uploaded')$old$;
  replacement:=$new$    IF NEW.action='abandon' AND (NEW.revision<>2 OR v_upload.review_reason IS NULL
      OR NOT mmhr_private.r1_security_reason_is_safe(v_upload.review_reason)
      OR NEW.snapshot IS DISTINCT FROM jsonb_build_object('state','rejected','reason',v_upload.review_reason)
      OR NOT mmhr_private.r7_finance_document_unstarted(NEW.version_id)) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Finance upload abandonment history denied'; END IF;
    IF (NEW.action IN ('reserve','uploaded')$new$;
  IF (length(definition)-length(replace(definition,needle,'')))<>length(needle) THEN
    RAISE EXCEPTION 'Finance abandonment history expansion point changed'; END IF;
  EXECUTE replace(definition,needle,replacement);
END $patch$;
