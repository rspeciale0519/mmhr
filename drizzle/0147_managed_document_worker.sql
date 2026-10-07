-- Dedicated document processing authority. The identity worker stays unchanged.
-- Hosted activation and login provisioning require separate operator approval.
CREATE ROLE mmhr_document_worker NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public,mmhr_private TO mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_document_worker_login_is_safe(login_name text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE role_id oid;
BEGIN
  SELECT oid INTO role_id FROM pg_catalog.pg_roles r WHERE r.rolname=login_name
    AND r.rolname ~ '^mmhr_document_worker_[0-9a-f]{32}$' AND r.rolcanlogin AND r.rolinherit
    AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
    AND r.rolvaliduntil>clock_timestamp() AND r.rolvaliduntil<=clock_timestamp()+interval '10 minutes';
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname='mmhr_document_worker'
    AND NOT r.rolcanlogin AND r.rolinherit AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
    AND NOT r.rolreplication AND NOT r.rolbypassrls)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname='mmhr_document_worker')
    OR (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member=role_id)<>1
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
      WHERE m.member=role_id AND r.rolname='mmhr_document_worker' AND NOT m.admin_option AND m.inherit_option AND m.set_option)
    OR pg_catalog.has_database_privilege(login_name,current_database(),'CREATE')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public','mmhr_private','auth','storage')
      AND pg_catalog.has_schema_privilege(login_name,n.oid,'CREATE'))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','mmhr_private','auth','storage') AND CASE WHEN c.relkind IN ('r','p','v','m','f')
        THEN (pg_catalog.has_table_privilege(login_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR pg_catalog.has_any_column_privilege(login_name,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')) ELSE false END)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','mmhr_private','auth','storage') AND CASE WHEN c.relkind='S'
        THEN pg_catalog.has_sequence_privilege(login_name,c.oid,'USAGE,SELECT,UPDATE') ELSE false END)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','mmhr_private') AND p.prosecdef AND pg_catalog.has_function_privilege(login_name,p.oid,'EXECUTE')
      AND p.oid NOT IN ('mmhr_private.r4_list_document_scan_candidates()'::regprocedure,
        'mmhr_private.r4_claim_document_scan(uuid)'::regprocedure,
        'mmhr_private.r4_document_scan_lease_is_current(uuid,uuid,integer)'::regprocedure,
        'mmhr_private.r4_finish_document_scan(uuid,uuid,integer,jsonb)'::regprocedure)) THEN RETURN false; END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_document_worker_login_is_safe(text) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_create_ephemeral_document_worker_login(login_name text,password_verifier text,expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF login_name IS NULL OR login_name !~ '^mmhr_document_worker_[0-9a-f]{32}$'
    OR password_verifier IS NULL OR password_verifier !~ '^SCRAM-SHA-256[$]4096:[A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$'
    OR expires_at IS NULL OR expires_at<clock_timestamp()+interval '1 minute' OR expires_at>clock_timestamp()+interval '10 minutes'
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=login_name) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document worker login'; END IF;
  EXECUTE format('CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L VALID UNTIL %L',login_name,password_verifier,expires_at);
  EXECUTE format('GRANT mmhr_document_worker TO %I WITH ADMIN FALSE, INHERIT TRUE, SET TRUE',login_name);
  IF NOT mmhr_private.r4_document_worker_login_is_safe(login_name) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document worker role is unsafe'; END IF;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_create_ephemeral_document_worker_login(text,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_list_document_scan_candidates()
RETURNS TABLE(version_id uuid) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT mmhr_private.r4_document_worker_login_is_safe(session_user) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document worker access denied'; END IF;
  RETURN QUERY SELECT u.version_id FROM public.workflow_document_uploads u
    JOIN public.workflow_jobs j ON j.id=u.processing_job_id AND j.organization_id=u.organization_id
    WHERE j.job_type='document_scan'
      AND j.payload_references=jsonb_build_array(jsonb_build_object('documentId',u.document_id,'versionId',u.version_id))
      AND ((u.state IN ('quarantined','failed') AND j.state IN ('queued','retry_pending') AND j.attempts_in_cycle<j.maximum_attempts
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=clock_timestamp())
      AND mmhr_private.r1_verified_identity(u.uploaded_by_identity_id,false)
      AND EXISTS(SELECT 1 FROM public.orgs WHERE id=u.organization_id AND status='active')
      AND EXISTS(SELECT 1 FROM public.orgs WHERE id=u.upload_organization_id AND status='active')
      AND EXISTS(SELECT 1 FROM public.workflow_documents d JOIN public.workflow_document_versions v ON v.document_id=d.id AND v.organization_id=d.organization_id
        WHERE d.id=u.document_id AND d.organization_id=u.organization_id AND d.state='active' AND v.id=u.version_id AND v.state='ready' AND v.scan_state<>'clean'))
      OR (u.state='scanning' AND u.lease_expires_at<=statement_timestamp() AND j.state='running')
      )
    ORDER BY u.created_at,u.version_id LIMIT 5;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_list_document_scan_candidates() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_list_document_scan_candidates() TO mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_claim_document_scan(requested_version uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE upload public.workflow_document_uploads%ROWTYPE; job public.workflow_jobs%ROWTYPE;
  version public.workflow_document_versions%ROWTYPE; token uuid; checked_at timestamptz;
BEGIN
  IF NOT mmhr_private.r4_document_worker_login_is_safe(session_user) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document worker access denied'; END IF;
  checked_at:=mmhr_private.r1_lock_security();
  IF NOT mmhr_private.r4_document_worker_login_is_safe(session_user) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document worker access denied'; END IF;
  SELECT * INTO upload FROM public.workflow_document_uploads WHERE version_id=requested_version FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO job FROM public.workflow_jobs WHERE id=upload.processing_job_id AND organization_id=upload.organization_id FOR UPDATE;
  IF NOT FOUND OR job.job_type<>'document_scan'
    OR job.payload_references IS DISTINCT FROM jsonb_build_array(jsonb_build_object('documentId',upload.document_id,'versionId',upload.version_id)) THEN RETURN NULL; END IF;
  IF upload.state='scanning' AND upload.lease_expires_at<=checked_at AND job.state='running' THEN
    UPDATE public.workflow_document_uploads SET state='failed',revision=revision+1,lease_token=NULL,lease_expires_at=NULL,
      failure_code='lease_expired',updated_at=checked_at WHERE version_id=requested_version RETURNING * INTO upload;
    UPDATE public.workflow_jobs SET state=CASE WHEN attempts_in_cycle>=maximum_attempts THEN 'needs_attention' ELSE 'retry_pending' END,
      next_attempt_at=CASE WHEN attempts_in_cycle>=maximum_attempts THEN NULL ELSE checked_at+interval '5 minutes' END,
      last_failure=jsonb_build_object('code','lease_expired'),updated_at=checked_at WHERE id=job.id;
    UPDATE public.workflow_job_attempts SET outcome='failed',finished_at=checked_at,failure=jsonb_build_object('code','lease_expired')
      WHERE job_id=job.id AND organization_id=job.organization_id AND outcome='running';
    INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,snapshot,correlation_id)
      VALUES(upload.organization_id,upload.version_id,upload.revision,'scan_failed',jsonb_build_object('state','failed','failureCode','lease_expired'),upload.correlation_id);
    RETURN NULL;
  END IF;
  IF upload.state NOT IN ('quarantined','failed') OR job.state NOT IN ('queued','retry_pending')
    OR job.attempts_in_cycle>=job.maximum_attempts OR (job.next_attempt_at IS NOT NULL AND job.next_attempt_at>checked_at)
    OR NOT mmhr_private.r1_verified_identity(upload.uploaded_by_identity_id,false)
    OR NOT EXISTS(SELECT 1 FROM public.orgs WHERE id=upload.organization_id AND status='active')
    OR NOT EXISTS(SELECT 1 FROM public.orgs WHERE id=upload.upload_organization_id AND status='active') THEN RETURN NULL; END IF;
  SELECT * INTO version FROM public.workflow_document_versions WHERE id=upload.version_id AND organization_id=upload.organization_id;
  IF NOT FOUND OR version.scan_state='clean' OR version.state<>'ready'
    OR NOT EXISTS(SELECT 1 FROM public.workflow_documents WHERE id=upload.document_id AND organization_id=upload.organization_id AND state='active') THEN RETURN NULL; END IF;
  IF upload.state='failed' THEN
    UPDATE public.workflow_document_uploads SET state='quarantined',revision=revision+1,failure_code=NULL,scan_evidence=NULL,updated_at=checked_at
      WHERE version_id=requested_version RETURNING * INTO upload;
    INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,snapshot,correlation_id)
      VALUES(upload.organization_id,upload.version_id,upload.revision,'retry',jsonb_build_object('state','quarantined'),upload.correlation_id);
  END IF;
  token:=gen_random_uuid();
  UPDATE public.workflow_jobs SET state='running',attempts_in_cycle=attempts_in_cycle+1,next_attempt_at=NULL,updated_at=checked_at
    WHERE id=job.id RETURNING * INTO job;
  INSERT INTO public.workflow_job_attempts(organization_id,job_id,attempt_number,correlation_id,trigger,requested_by,started_at,outcome)
    VALUES(job.organization_id,job.id,job.attempts_in_cycle,job.correlation_id,'automatic','document_worker',checked_at,'running');
  UPDATE public.workflow_document_uploads SET state='scanning',revision=revision+1,lease_token=token,
    lease_expires_at=checked_at+interval '2 minutes',updated_at=checked_at WHERE version_id=requested_version RETURNING * INTO upload;
  INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,snapshot,correlation_id)
    VALUES(upload.organization_id,upload.version_id,upload.revision,'scan_claimed',
      jsonb_build_object('state','scanning','leaseToken',token,'jobId',job.id),upload.correlation_id);
  RETURN jsonb_build_object('organizationId',upload.organization_id,'documentId',upload.document_id,'versionId',upload.version_id,
    'jobId',job.id,'leaseToken',token,'revision',upload.revision,'correlationId',upload.correlation_id,
    'leaseExpiresAt',upload.lease_expires_at,'fileName',upload.file_name,'contentType',version.content_type,'byteSize',version.byte_size,'sha256',lower(version.sha256));
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_claim_document_scan(uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_claim_document_scan(uuid) TO mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_document_scan_lease_is_current(requested_version uuid,token uuid,expected_revision integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT mmhr_private.r4_document_worker_login_is_safe(session_user) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document worker access denied'; END IF;
  RETURN EXISTS(SELECT 1 FROM public.workflow_document_uploads u JOIN public.workflow_jobs j ON j.id=u.processing_job_id AND j.organization_id=u.organization_id
    JOIN public.workflow_documents d ON d.id=u.document_id AND d.organization_id=u.organization_id
    WHERE u.version_id=requested_version AND u.lease_token=token AND u.revision=expected_revision
      AND u.state='scanning' AND u.lease_expires_at>clock_timestamp() AND j.state='running' AND d.state='active'
      AND mmhr_private.r1_verified_identity(u.uploaded_by_identity_id,false)
      AND EXISTS(SELECT 1 FROM public.orgs WHERE id=u.organization_id AND status='active')
      AND EXISTS(SELECT 1 FROM public.orgs WHERE id=u.upload_organization_id AND status='active'));
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_document_scan_lease_is_current(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_document_scan_lease_is_current(uuid,uuid,integer) TO mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_finish_document_scan(requested_version uuid,token uuid,expected_revision integer,completion jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE upload public.workflow_document_uploads%ROWTYPE; version public.workflow_document_versions%ROWTYPE;
  evidence jsonb; receipt jsonb; checked_at timestamptz; target_state text; safe_failure_code text;
BEGIN
  IF NOT mmhr_private.r4_document_worker_login_is_safe(session_user) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document worker access denied'; END IF;
  checked_at:=mmhr_private.r1_lock_security();
  IF NOT mmhr_private.r4_document_worker_login_is_safe(session_user) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document worker access denied'; END IF;
  IF requested_version IS NULL OR token IS NULL OR expected_revision IS NULL OR expected_revision<1 OR jsonb_typeof(completion) IS DISTINCT FROM 'object'
    OR NOT(completion ?& ARRAY['state','failureCode','scanEvidence']) OR (SELECT count(*) FROM jsonb_object_keys(completion))<>3
    OR coalesce(completion->>'state','') NOT IN ('ready','rejected','failed') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document scan completion'; END IF;
  SELECT e.snapshot->'receipt' INTO receipt FROM public.workflow_document_upload_events e
    WHERE e.version_id=requested_version AND e.revision=expected_revision+1 AND e.snapshot->>'leaseToken'=token::text
      AND e.snapshot->'completion'=completion;
  IF FOUND THEN RETURN receipt || jsonb_build_object('outcomeCode','replayed'); END IF;
  IF NOT mmhr_private.r4_document_scan_lease_is_current(requested_version,token,expected_revision) THEN RETURN NULL; END IF;
  SELECT * INTO upload FROM public.workflow_document_uploads WHERE version_id=requested_version FOR UPDATE;
  SELECT * INTO version FROM public.workflow_document_versions WHERE id=requested_version AND organization_id=upload.organization_id;
  target_state:=completion->>'state'; safe_failure_code:=completion->>'failureCode'; evidence:=NULLIF(completion->'scanEvidence','null'::jsonb);
  IF evidence IS NOT NULL AND (jsonb_typeof(evidence) IS DISTINCT FROM 'object'
    OR NOT(evidence ?& ARRAY['versionId','sha256','state','scanner','scannerVersion','signatureVersion','signatureUpdatedAt','scannedAt','failureCode'])
    OR (SELECT count(*) FROM jsonb_object_keys(evidence))<>9 OR evidence->>'scanner' IS DISTINCT FROM 'clamav'
    OR evidence->>'versionId' IS DISTINCT FROM requested_version::text OR evidence->>'sha256' IS DISTINCT FROM lower(version.sha256)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Bound document scan evidence required'; END IF;
  IF (target_state='rejected' AND coalesce(safe_failure_code,'') NOT IN ('unsafe_document','invalid_document','document_integrity'))
    OR (target_state='failed' AND safe_failure_code IN ('unsafe_document','invalid_document','document_integrity')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Document scan failure state denied'; END IF;
  IF target_state='ready' THEN
    IF safe_failure_code IS NOT NULL OR evidence IS NULL OR jsonb_typeof(evidence) IS DISTINCT FROM 'object'
      OR NOT(evidence ?& ARRAY['versionId','sha256','state','scanner','scannerVersion','signatureVersion','signatureUpdatedAt','scannedAt','failureCode'])
      OR (SELECT count(*) FROM jsonb_object_keys(evidence))<>9 OR evidence->>'state' IS DISTINCT FROM 'clean'
      OR evidence->>'scanner' IS DISTINCT FROM 'clamav' OR evidence->>'scannerVersion' IS DISTINCT FROM '1.4.6'
      OR evidence->>'versionId' IS DISTINCT FROM requested_version::text OR evidence->>'sha256' IS DISTINCT FROM lower(version.sha256)
      OR evidence->>'failureCode' IS NOT NULL OR jsonb_typeof(evidence->'signatureVersion') IS DISTINCT FROM 'number'
      OR coalesce(evidence->>'signatureVersion','') !~ '^[1-9][0-9]{0,8}$'
      OR coalesce(evidence->>'signatureUpdatedAt','') !~ '^\d{4}-\d{2}-\d{2}T'
      OR coalesce(evidence->>'scannedAt','') !~ '^\d{4}-\d{2}-\d{2}T' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Verified document scan evidence required'; END IF;
    IF NOT isfinite((evidence->>'signatureUpdatedAt')::timestamptz) OR NOT isfinite((evidence->>'scannedAt')::timestamptz)
      OR (evidence->>'signatureUpdatedAt')::timestamptz NOT BETWEEN checked_at-interval '24 hours' AND checked_at+interval '5 minutes'
      OR (evidence->>'scannedAt')::timestamptz NOT BETWEEN checked_at-interval '5 minutes' AND checked_at+interval '5 seconds' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Current document scan evidence required'; END IF;
  ELSIF safe_failure_code IS NULL OR safe_failure_code NOT IN ('storage_unavailable','document_integrity','invalid_document','scanner_invalid',
    'scanner_unavailable','hash_mismatch','scanner_timeout','scanner_protocol','scanner_version','signatures_stale','scan_context_changed','unsafe_document') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Safe document scan failure required';
  ELSIF evidence IS NOT NULL AND (jsonb_typeof(evidence) IS DISTINCT FROM 'object'
    OR evidence->>'versionId' IS DISTINCT FROM requested_version::text OR evidence->>'sha256' IS DISTINCT FROM lower(version.sha256)
    OR evidence->>'failureCode' IS DISTINCT FROM safe_failure_code OR coalesce(evidence->>'state','') NOT IN ('failed','quarantined')
    OR (target_state='rejected' AND evidence->>'state' IS DISTINCT FROM 'quarantined')
    OR (target_state='failed' AND evidence->>'state' IS DISTINCT FROM 'failed')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Document scan failure association denied'; END IF;
  UPDATE public.workflow_document_versions SET scan_state=CASE WHEN target_state='ready' THEN 'clean' WHEN target_state='rejected' THEN 'quarantined' ELSE 'failed' END
    WHERE id=requested_version AND organization_id=upload.organization_id;
  UPDATE public.workflow_document_uploads SET state=target_state,revision=revision+1,lease_token=NULL,lease_expires_at=NULL,
    scan_evidence=evidence,failure_code=safe_failure_code,updated_at=checked_at WHERE version_id=requested_version RETURNING * INTO upload;
  UPDATE public.workflow_jobs SET state=CASE WHEN target_state<>'failed' THEN 'succeeded' WHEN attempts_in_cycle>=maximum_attempts THEN 'needs_attention' ELSE 'retry_pending' END,
    next_attempt_at=CASE WHEN target_state='failed' AND attempts_in_cycle<maximum_attempts THEN checked_at+interval '5 minutes' ELSE NULL END,
    last_failure=CASE WHEN safe_failure_code IS NOT NULL THEN jsonb_build_object('code',safe_failure_code) ELSE NULL END,updated_at=checked_at
    WHERE id=upload.processing_job_id AND organization_id=upload.organization_id;
  UPDATE public.workflow_job_attempts SET outcome=CASE WHEN target_state='failed' THEN 'failed' ELSE 'succeeded' END,
    finished_at=checked_at,failure=CASE WHEN safe_failure_code IS NOT NULL THEN jsonb_build_object('code',safe_failure_code) ELSE NULL END
    WHERE job_id=upload.processing_job_id AND organization_id=upload.organization_id AND outcome='running';
  receipt:=jsonb_build_object('versionId',requested_version,'leaseToken',token,'revision',upload.revision,'state',upload.state,'outcomeCode','recorded');
  INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,snapshot,correlation_id)
    VALUES(upload.organization_id,requested_version,upload.revision,CASE WHEN target_state='ready' THEN 'scan_clean' WHEN target_state='rejected' THEN 'scan_rejected' ELSE 'scan_failed' END,
      jsonb_build_object('state',upload.state,'leaseToken',token,'completion',completion,'receipt',receipt),upload.correlation_id);
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_finish_document_scan(uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_finish_document_scan(uuid,uuid,integer,jsonb) TO mmhr_document_worker;
