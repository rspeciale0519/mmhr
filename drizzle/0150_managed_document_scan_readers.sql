CREATE TABLE "mmhr_private"."document_scan_lease_owners" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"login_name" text NOT NULL,
	"lease_token" uuid NOT NULL,
	"revision" integer NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_scan_lease_owners_login_ck" CHECK ("mmhr_private"."document_scan_lease_owners"."login_name" ~ '^mmhr_document_worker_[0-9a-f]{32}$'),
	CONSTRAINT "document_scan_lease_owners_revision_ck" CHECK ("mmhr_private"."document_scan_lease_owners"."revision" > 0),
	CONSTRAINT "document_scan_lease_owners_lifetime_ck" CHECK ("mmhr_private"."document_scan_lease_owners"."lease_expires_at" > "mmhr_private"."document_scan_lease_owners"."bound_at" and "mmhr_private"."document_scan_lease_owners"."lease_expires_at" <= "mmhr_private"."document_scan_lease_owners"."bound_at" + interval '5 minutes')
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."document_scan_lease_owners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mmhr_private"."document_scan_readers" (
	"subject_id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"login_name" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "document_scan_readers_login_ck" CHECK ("mmhr_private"."document_scan_readers"."login_name" ~ '^mmhr_document_worker_[0-9a-f]{32}$'),
	CONSTRAINT "document_scan_readers_lifetime_ck" CHECK ("mmhr_private"."document_scan_readers"."valid_until" > "mmhr_private"."document_scan_readers"."activated_at" and "mmhr_private"."document_scan_readers"."valid_until" <= "mmhr_private"."document_scan_readers"."activated_at" + interval '10 minutes'),
	CONSTRAINT "document_scan_readers_revocation_ck" CHECK ("mmhr_private"."document_scan_readers"."revoked_at" is null or "mmhr_private"."document_scan_readers"."revoked_at" >= "mmhr_private"."document_scan_readers"."activated_at")
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."document_scan_readers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mmhr_private"."document_scan_lease_owners" ADD CONSTRAINT "document_scan_lease_owners_version_id_workflow_document_uploads_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_document_uploads"("version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_scan_readers_login_uq" ON "mmhr_private"."document_scan_readers" USING btree ("login_name");
--> statement-breakpoint
ALTER TABLE mmhr_private.document_scan_readers ADD CONSTRAINT document_scan_readers_subject_fk
  FOREIGN KEY(subject_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
REVOKE ALL ON mmhr_private.document_scan_readers,mmhr_private.document_scan_lease_owners
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
-- An operator verifies genuine Auth claims before supplying the subject/session.
-- This account must have no application identity. It receives no service key.
CREATE FUNCTION mmhr_private.r4_register_document_scan_reader(requested_subject uuid,requested_session uuid,
  requested_login text,expires_at timestamptz,correlation_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE checked_at timestamptz;
BEGIN
  checked_at:=mmhr_private.r1_lock_security();
  IF requested_subject IS NULL OR requested_session IS NULL OR correlation_id IS NULL
    OR NOT mmhr_private.r4_document_worker_login_is_safe(requested_login)
    OR expires_at IS NULL OR expires_at<=clock_timestamp() OR expires_at>clock_timestamp()+interval '10 minutes'
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=requested_login AND rolvaliduntil>=expires_at)
    OR EXISTS(SELECT 1 FROM public.identities WHERE auth_user_id=requested_subject)
    OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id
      WHERE u.id=requested_subject AND u.email_confirmed_at IS NOT NULL AND NOT u.is_anonymous
        AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
        AND s.id=requested_session AND (s.not_after IS NULL OR s.not_after>=expires_at)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Verified machine reader required'; END IF;
  INSERT INTO mmhr_private.document_scan_readers(subject_id,session_id,login_name,activated_at,valid_until)
    VALUES(requested_subject,requested_session,requested_login,checked_at,expires_at);
  INSERT INTO public.audit_events(actor_type,actor_reference,command,action,entity_type,entity_id,reason,correlation_id,after_summary)
    VALUES('system','document_reader_operator','r4.document.reader.register','register','document_scan_reader',requested_subject::text,
      'Activate bounded document scanner read access',correlation_id,jsonb_build_object('state','active'));
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_register_document_scan_reader(uuid,uuid,text,timestamptz,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_revoke_document_scan_reader(requested_subject uuid,correlation_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM mmhr_private.r1_lock_security();
  IF requested_subject IS NULL OR correlation_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM mmhr_private.document_scan_readers WHERE subject_id=requested_subject) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document reader revocation denied'; END IF;
  UPDATE mmhr_private.document_scan_readers SET revoked_at=clock_timestamp()
    WHERE subject_id=requested_subject AND revoked_at IS NULL;
  IF FOUND THEN
    INSERT INTO public.audit_events(actor_type,actor_reference,command,action,entity_type,entity_id,reason,correlation_id,after_summary)
      VALUES('system','document_reader_operator','r4.document.reader.revoke','revoke','document_scan_reader',requested_subject::text,
        'Revoke document scanner read access',correlation_id,jsonb_build_object('state','revoked'));
  END IF;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_revoke_document_scan_reader(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_quarantine_scan_read_allowed(object_name text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb:=auth.jwt(); parts text[]; operation_allowed boolean;
BEGIN
  IF object_name IS NULL OR object_name !~ '^([0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/){2}[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR claims->>'role' IS DISTINCT FROM 'authenticated' OR claims->>'aal' IS DISTINCT FROM 'aal1'
    OR claims->>'sub' IS DISTINCT FROM auth.uid()::text
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
    OR (claims->>'exp')::numeric<=extract(epoch FROM clock_timestamp())
    OR (claims->>'iat')::numeric>floor(extract(epoch FROM clock_timestamp()))
    OR (claims->>'iat')::numeric>=(claims->>'exp')::numeric
    OR to_regprocedure('storage.allow_only_operation(text)') IS NULL THEN RETURN false; END IF;
  -- SELECT also serves signing/listing/copying. Only the genuine download route
  -- sets this operation; missing or different operations fail closed.
  EXECUTE 'SELECT storage.allow_only_operation(''object.get_authenticated'')' INTO operation_allowed;
  IF operation_allowed IS DISTINCT FROM true THEN RETURN false; END IF;
  parts:=string_to_array(object_name,'/');
  RETURN EXISTS(SELECT 1 FROM mmhr_private.document_scan_readers reader
    JOIN auth.users provider ON provider.id=reader.subject_id
    JOIN auth.sessions session ON session.id=reader.session_id AND session.user_id=reader.subject_id
    JOIN mmhr_private.document_scan_lease_owners binding ON binding.login_name=reader.login_name
    JOIN public.workflow_document_uploads upload ON upload.version_id=binding.version_id
    JOIN public.workflow_document_versions version ON version.id=upload.version_id AND version.organization_id=upload.organization_id
    JOIN public.workflow_documents document ON document.id=upload.document_id AND document.organization_id=upload.organization_id
    JOIN public.workflow_jobs job ON job.id=upload.processing_job_id AND job.organization_id=upload.organization_id
    WHERE reader.subject_id=auth.uid() AND reader.session_id::text=claims->>'session_id'
      AND reader.revoked_at IS NULL AND reader.valid_until>clock_timestamp()
      AND mmhr_private.r4_document_worker_login_is_safe(reader.login_name)
      AND provider.email_confirmed_at IS NOT NULL AND NOT provider.is_anonymous AND provider.deleted_at IS NULL
      AND (provider.banned_until IS NULL OR provider.banned_until<=clock_timestamp())
      AND (session.not_after IS NULL OR session.not_after>clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM public.identities WHERE auth_user_id=reader.subject_id)
      AND upload.organization_id=parts[1]::uuid AND upload.document_id=parts[2]::uuid AND upload.version_id=parts[3]::uuid
      AND upload.state='scanning' AND upload.lease_token=binding.lease_token AND upload.revision=binding.revision
      AND upload.lease_expires_at=binding.lease_expires_at AND upload.lease_expires_at>clock_timestamp()
      AND version.storage_reference='quarantine://'||object_name AND version.scan_state<>'clean' AND version.state='ready'
      AND document.state='active' AND document.current_version=version.version
      AND job.state='running' AND job.job_type='document_scan'
      AND job.payload_references=jsonb_build_array(jsonb_build_object('documentId',upload.document_id,'versionId',upload.version_id))
      AND mmhr_private.r1_verified_identity(upload.uploaded_by_identity_id,false)
      AND EXISTS(SELECT 1 FROM public.orgs WHERE id=upload.organization_id AND status='active')
      AND EXISTS(SELECT 1 FROM public.orgs WHERE id=upload.upload_organization_id AND status='active'));
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_quarantine_scan_read_allowed(text)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_quarantine_scan_read_allowed(text) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_install_document_scan_read_policies()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regprocedure('storage.allow_only_operation(text)') IS NULL
    OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='mmhr-document-quarantine' AND public=false AND file_size_limit=25000000)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass
      AND polname='mmhr_document_read_bound' AND polcmd='r' AND NOT polpermissive)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass
      AND polname IN ('mmhr_document_scan_read_allow','mmhr_document_anon_read_bound')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document scan Storage policies require review'; END IF;
  EXECUTE $policy$ALTER POLICY mmhr_document_read_bound ON storage.objects TO authenticated
    USING(bucket_id<>'mmhr-document-quarantine' OR mmhr_private.r4_quarantine_scan_read_allowed(name))$policy$;
  EXECUTE $policy$CREATE POLICY mmhr_document_anon_read_bound ON storage.objects AS RESTRICTIVE FOR SELECT TO anon
    USING(bucket_id<>'mmhr-document-quarantine')$policy$;
  EXECUTE $policy$CREATE POLICY mmhr_document_scan_read_allow ON storage.objects FOR SELECT TO authenticated
    USING(bucket_id='mmhr-document-quarantine' AND mmhr_private.r4_quarantine_scan_read_allowed(name))$policy$;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_install_document_scan_read_policies()
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmhr_private.r4_claim_document_scan(requested_version uuid)
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
  INSERT INTO mmhr_private.document_scan_lease_owners(version_id,login_name,lease_token,revision,lease_expires_at,bound_at)
    VALUES(upload.version_id,session_user,upload.lease_token,upload.revision,upload.lease_expires_at,checked_at)
    ON CONFLICT(version_id) DO UPDATE SET login_name=EXCLUDED.login_name,lease_token=EXCLUDED.lease_token,
      revision=EXCLUDED.revision,lease_expires_at=EXCLUDED.lease_expires_at,bound_at=EXCLUDED.bound_at;
  RETURN jsonb_build_object('organizationId',upload.organization_id,'documentId',upload.document_id,'versionId',upload.version_id,
    'jobId',job.id,'leaseToken',token,'revision',upload.revision,'correlationId',upload.correlation_id,
    'leaseExpiresAt',upload.lease_expires_at,'fileName',upload.file_name,'contentType',version.content_type,'byteSize',version.byte_size,'sha256',lower(version.sha256));
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_claim_document_scan(uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_claim_document_scan(uuid) TO mmhr_document_worker;

