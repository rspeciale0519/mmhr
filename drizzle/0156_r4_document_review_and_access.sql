CREATE TABLE "mmhr_private"."document_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"purpose" text NOT NULL,
	"actor_identity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"correlation_id" uuid NOT NULL,
	CONSTRAINT "document_access_grants_revision_ck" CHECK ("mmhr_private"."document_access_grants"."revision" between 1 and 2147483646),
	CONSTRAINT "document_access_grants_purpose_ck" CHECK ("mmhr_private"."document_access_grants"."purpose" in ('review', 'approved')),
	CONSTRAINT "document_access_grants_token_ck" CHECK ("mmhr_private"."document_access_grants"."access_token" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "document_access_grants_lifetime_ck" CHECK ("mmhr_private"."document_access_grants"."expires_at" = "mmhr_private"."document_access_grants"."created_at" + interval '60 seconds')
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."document_access_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workflow_document_upload_events" DROP CONSTRAINT "workflow_document_upload_events_action_ck";--> statement-breakpoint
ALTER TABLE "mmhr_private"."document_access_grants" ADD CONSTRAINT "document_access_grants_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."document_access_grants" ADD CONSTRAINT "document_access_grants_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."document_access_grants" ADD CONSTRAINT "document_access_grants_version_scope_fk" FOREIGN KEY ("organization_id","version_id") REFERENCES "public"."workflow_document_uploads"("organization_id","version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_access_grants_session_version_idx" ON "mmhr_private"."document_access_grants" USING btree ("session_id","version_id","expires_at");--> statement-breakpoint
ALTER TABLE "workflow_document_upload_events" ADD CONSTRAINT "workflow_document_upload_events_action_ck" CHECK ("workflow_document_upload_events"."action" in ('reserve', 'uploaded', 'scan_claimed', 'scan_clean', 'scan_rejected', 'scan_failed', 'review_started', 'approve', 'reject', 'retry', 'supersede'));--> statement-breakpoint
REVOKE ALL ON mmhr_private.document_access_grants FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
CREATE TRIGGER document_access_grants_immutable BEFORE UPDATE OR DELETE ON mmhr_private.document_access_grants
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_document_upload_history_is_immutable();
CREATE TRIGGER document_access_grants_no_truncate BEFORE TRUNCATE ON mmhr_private.document_access_grants
  FOR EACH STATEMENT EXECUTE FUNCTION mmhr_private.r4_document_upload_history_is_immutable();
--> statement-breakpoint
-- Manual review does not assert parsing, extraction, or a legally valid agreement.
CREATE FUNCTION mmhr_private.r4_document_reviewer(requested_org uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=mmhr_private.r4_workspace_document_reader(requested_org); claims jsonb:=auth.jwt();
BEGIN
  IF actor IS NULL OR claims->>'aal' IS DISTINCT FROM 'aal2'
    OR NOT mmhr_private.r1_evaluate_permission(actor,'admin.access',NULL,'aal2',clock_timestamp(),false)
    OR NOT mmhr_private.r1_evaluate_permission(actor,'rfp.approve',requested_org,'aal2',clock_timestamp(),false) THEN RETURN NULL; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_document_reviewer(uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_document_content_actor(requested_org uuid,requested_doc uuid,requested_version uuid,requested_revision integer,purpose text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; upload public.workflow_document_uploads%ROWTYPE; version_row public.workflow_document_versions%ROWTYPE;
BEGIN
  actor:=mmhr_private.r4_workspace_document_reader(requested_org);
  IF actor IS NULL OR purpose IS NULL OR purpose NOT IN ('review','approved') THEN RETURN NULL; END IF;
  SELECT u.* INTO upload FROM public.workflow_document_uploads u JOIN public.workflow_documents d
    ON d.id=u.document_id AND d.organization_id=u.organization_id JOIN public.workflow_document_versions v
    ON v.id=u.version_id AND v.document_id=d.id AND v.organization_id=d.organization_id
    WHERE u.organization_id=requested_org AND u.document_id=requested_doc AND u.version_id=requested_version
      AND u.revision=requested_revision AND u.source_kind='workspace' AND u.upload_organization_id=requested_org
      AND d.state='active' AND d.document_type='attachment' AND d.current_version=v.version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO version_row FROM public.workflow_document_versions WHERE id=upload.version_id;
  IF version_row.scan_state<>'clean' OR version_row.state NOT IN ('ready','approved')
    OR upload.scan_evidence->>'state' IS DISTINCT FROM 'clean'
    OR upload.scan_evidence->>'versionId' IS DISTINCT FROM requested_version::text
    OR upload.scan_evidence->>'sha256' IS DISTINCT FROM lower(version_row.sha256)
    OR version_row.storage_reference IS DISTINCT FROM 'quarantine://'||requested_org::text||'/'||requested_doc::text||'/'||requested_version::text THEN RETURN NULL; END IF;
  IF purpose='review' THEN
    IF upload.state NOT IN ('ready','needs_review') OR actor=upload.uploaded_by_identity_id
      OR mmhr_private.r4_document_reviewer(requested_org) IS DISTINCT FROM actor THEN RETURN NULL; END IF;
  ELSE
    IF upload.state<>'approved' OR version_row.state<>'approved' OR upload.approved_by_identity_id IS NULL
      OR upload.approved_by_identity_id=upload.uploaded_by_identity_id OR upload.approved_at IS NULL OR upload.review_reason IS NULL THEN RETURN NULL; END IF;
  END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_document_content_actor(uuid,uuid,uuid,integer,text)
  FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_get_workspace_document_review(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_id uuid; doc_id uuid; ver_id uuid; upload public.workflow_document_uploads%ROWTYPE;
  version_row public.workflow_document_versions%ROWTYPE; actor uuid; current_version integer;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& ARRAY['organizationId','documentId','versionId'])
    OR correlation_id IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','documentId','versionId'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document review'; END IF;
  org_id:=(payload->>'organizationId')::uuid; doc_id:=(payload->>'documentId')::uuid; ver_id:=(payload->>'versionId')::uuid;
  PERFORM mmhr_private.r1_lock_security(); actor:=mmhr_private.r4_document_reviewer(org_id);
  SELECT u.* INTO upload FROM public.workflow_document_uploads u
    JOIN public.workflow_documents d ON d.id=u.document_id AND d.organization_id=u.organization_id
    JOIN public.workflow_document_versions v ON v.id=u.version_id AND v.document_id=d.id AND v.organization_id=d.organization_id
    WHERE u.organization_id=org_id AND u.document_id=doc_id AND u.version_id=ver_id
      AND u.source_kind='workspace' AND u.upload_organization_id=org_id AND d.state='active' AND d.document_type='attachment';
  IF actor IS NULL OR NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document review denied'; END IF;
  SELECT d.current_version INTO current_version FROM public.workflow_documents d WHERE d.id=doc_id AND d.organization_id=org_id;
  SELECT * INTO version_row FROM public.workflow_document_versions WHERE id=ver_id;
  RETURN jsonb_build_object('organizationId',org_id,'correlationId',correlation_id,
    'document',mmhr_private.r4_workspace_document_metadata(upload,version_row,current_version),
    'canReview',mmhr_private.r4_document_content_actor(org_id,doc_id,ver_id,upload.revision,'review') IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_get_workspace_document_review(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_workspace_document_review(jsonb,uuid) TO authenticated;
--> statement-breakpoint
-- Immutable, private, short-lived access grants. The token is never audit data.
-- These links still require the original live Auth session and current authority.
CREATE FUNCTION public.mmhr_issue_workspace_document_access(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_id uuid; doc_id uuid; ver_id uuid; actor uuid; checked_at timestamptz; receipt jsonb;
  access_row mmhr_private.document_access_grants%ROWTYPE; access_revision integer; requested_purpose text;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& ARRAY['organizationId','documentId','versionId','expectedRevision','purpose'])
    OR correlation_id IS NULL OR idempotency_key IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','documentId','versionId','expectedRevision','purpose'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(payload->'expectedRevision') IS DISTINCT FROM 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]{0,9}$'
    OR (payload->>'expectedRevision')::numeric>2147483646
    OR coalesce(payload->>'purpose','') NOT IN ('review','approved') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document access'; END IF;
  org_id:=(payload->>'organizationId')::uuid; doc_id:=(payload->>'documentId')::uuid; ver_id:=(payload->>'versionId')::uuid;
  access_revision:=(payload->>'expectedRevision')::integer; requested_purpose:=payload->>'purpose';
  checked_at:=mmhr_private.r1_lock_security(); actor:=mmhr_private.r4_document_content_actor(org_id,doc_id,ver_id,access_revision,requested_purpose);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,'r4.document.access.issue',idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    SELECT a.* INTO access_row FROM mmhr_private.document_access_grants a WHERE a.id=(receipt->>'entity_id')::uuid
      AND a.organization_id=org_id AND a.document_id=doc_id AND a.version_id=ver_id AND a.actor_identity_id=actor
      AND a.session_id=(auth.jwt()->>'session_id')::uuid AND a.revision=access_revision
      AND a.purpose=requested_purpose AND a.expires_at>clock_timestamp();
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access retry expired'; END IF;
  ELSE
    IF (SELECT count(*) FROM mmhr_private.document_access_grants a WHERE a.actor_identity_id=actor AND a.session_id=(auth.jwt()->>'session_id')::uuid
      AND a.expires_at>clock_timestamp())>=16 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access limit reached'; END IF;
    INSERT INTO mmhr_private.document_access_grants(organization_id,document_id,version_id,revision,purpose,actor_identity_id,session_id,
      access_token,created_at,expires_at,correlation_id)
      VALUES(org_id,doc_id,ver_id,access_revision,requested_purpose,actor,(auth.jwt()->>'session_id')::uuid,
        encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex'),checked_at,checked_at+interval '60 seconds',correlation_id)
      RETURNING * INTO access_row;
    PERFORM mmhr_private.r1_finish_security_command(actor,'r4.document.access.issue','document.access.requested','document_access_grant',access_row.id,org_id,
      'Request bounded private document access',correlation_id,idempotency_key,payload,NULL,
      jsonb_build_object('status','active','record_id',ver_id),checked_at);
  END IF;
  RETURN jsonb_build_object('organizationId',org_id,'documentId',doc_id,'versionId',ver_id,'revision',access_revision,'purpose',requested_purpose,
    'accessId',access_row.id,'accessToken',access_row.access_token,'issuedAt',access_row.created_at,'expiresAt',access_row.expires_at,
    'correlationId',correlation_id,'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_issue_workspace_document_access(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_issue_workspace_document_access(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_resolve_workspace_document_access(payload jsonb,correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org_id uuid; access_row mmhr_private.document_access_grants%ROWTYPE; actor uuid;
  version_row public.workflow_document_versions%ROWTYPE; upload public.workflow_document_uploads%ROWTYPE;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& ARRAY['organizationId','accessId','accessToken'])
    OR correlation_id IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','accessId','accessToken'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'accessId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'accessToken','') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document access'; END IF;
  org_id:=(payload->>'organizationId')::uuid; PERFORM mmhr_private.r1_lock_security();
  actor:=mmhr_private.r4_workspace_document_reader(org_id);
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access denied'; END IF;
  SELECT * INTO access_row FROM mmhr_private.document_access_grants WHERE id=(payload->>'accessId')::uuid
    AND organization_id=org_id AND access_token=payload->>'accessToken' AND session_id=(auth.jwt()->>'session_id')::uuid
    AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access denied'; END IF;
  actor:=mmhr_private.r4_document_content_actor(org_id,access_row.document_id,access_row.version_id,access_row.revision,access_row.purpose);
  IF actor IS DISTINCT FROM access_row.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document access denied'; END IF;
  SELECT * INTO version_row FROM public.workflow_document_versions WHERE id=access_row.version_id;
  SELECT * INTO upload FROM public.workflow_document_uploads WHERE version_id=access_row.version_id;
  RETURN jsonb_build_object('organizationId',org_id,'accessId',access_row.id,'documentId',access_row.document_id,'versionId',access_row.version_id,
    'revision',access_row.revision,'purpose',access_row.purpose,'correlationId',correlation_id,'expiresAt',access_row.expires_at,
    'fileName',upload.file_name,'contentType',version_row.content_type,'byteSize',version_row.byte_size,'sha256',lower(version_row.sha256));
END $$;
REVOKE ALL ON FUNCTION public.mmhr_resolve_workspace_document_access(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_resolve_workspace_document_access(jsonb,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.mmhr_record_workspace_document_review(payload jsonb,correlation_id uuid,idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE required_keys text[]:=ARRAY['organizationId','documentId','versionId','expectedRevision','action','reason','reviewReference'];
  org_id uuid; doc_id uuid; ver_id uuid; requested_revision integer; requested_action text; actor uuid; checked_at timestamptz;
  receipt jsonb; command_key text; target_state text; upload public.workflow_document_uploads%ROWTYPE;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR NOT(payload ?& required_keys) OR correlation_id IS NULL OR idempotency_key IS NULL
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) field WHERE field NOT IN ('organizationId','documentId','versionId','expectedRevision','action','reason','reviewReference','reviewedAccessId','contentsReviewed'))
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'documentId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(payload->>'versionId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(payload->'expectedRevision') IS DISTINCT FROM 'number'
    OR coalesce(payload->>'expectedRevision','') !~ '^[1-9][0-9]{0,9}$' OR (payload->>'expectedRevision')::numeric>2147483646
    OR coalesce(payload->>'action','') NOT IN ('begin_review','approve','reject')
    OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR octet_length(btrim(payload->>'reason')) NOT BETWEEN 1 AND 2000
    OR payload->>'reason' ~ '[[:cntrl:]]' OR payload->>'reason' IS DISTINCT FROM btrim(payload->>'reason')
    OR NOT mmhr_private.r1_security_reason_is_safe(payload->>'reason')
    OR jsonb_typeof(payload->'reviewReference') IS DISTINCT FROM 'string'
    OR octet_length(payload->>'reviewReference') NOT BETWEEN 1 AND 500
    OR coalesce(payload->>'reviewReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document review'; END IF;
  requested_action:=payload->>'action';
  IF (requested_action='begin_review' AND (payload ? 'reviewedAccessId' OR payload ? 'contentsReviewed'))
    OR (requested_action<>'begin_review' AND (payload->'contentsReviewed' IS DISTINCT FROM 'true'::jsonb
      OR coalesce(payload->>'reviewedAccessId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Explicit document review required'; END IF;
  org_id:=(payload->>'organizationId')::uuid; doc_id:=(payload->>'documentId')::uuid; ver_id:=(payload->>'versionId')::uuid;
  requested_revision:=(payload->>'expectedRevision')::integer; command_key:='r4.document.review.'||requested_action;
  target_state:=CASE requested_action WHEN 'begin_review' THEN 'needs_review' WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
  checked_at:=mmhr_private.r1_lock_security(); actor:=mmhr_private.r4_document_reviewer(org_id);
  SELECT * INTO upload FROM public.workflow_document_uploads WHERE version_id=ver_id AND organization_id=org_id AND document_id=doc_id FOR UPDATE;
  IF actor IS NULL OR NOT FOUND OR actor=upload.uploaded_by_identity_id OR upload.source_kind<>'workspace' OR upload.upload_organization_id<>org_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document review denied'; END IF;
  receipt:=mmhr_private.r1_checked_receipt(actor,command_key,idempotency_key,payload);
  IF receipt IS NOT NULL THEN
    IF (receipt->>'entity_id')::uuid IS DISTINCT FROM ver_id OR NOT EXISTS(SELECT 1 FROM public.workflow_document_upload_events e
      WHERE e.version_id=ver_id AND e.organization_id=org_id AND e.revision=requested_revision+1 AND e.actor_identity_id=actor
        AND e.action=CASE requested_action WHEN 'begin_review' THEN 'review_started' ELSE requested_action END
        AND e.correlation_id=mmhr_record_workspace_document_review.correlation_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document review replay denied'; END IF;
  ELSE
    IF mmhr_private.r4_document_content_actor(org_id,doc_id,ver_id,requested_revision,'review') IS DISTINCT FROM actor
      OR (requested_action='begin_review' AND upload.state<>'ready') OR (requested_action<>'begin_review' AND upload.state<>'needs_review') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document review state denied'; END IF;
    IF requested_action<>'begin_review' AND NOT EXISTS(SELECT 1 FROM mmhr_private.document_access_grants a
      WHERE a.id=(payload->>'reviewedAccessId')::uuid AND a.organization_id=org_id AND a.document_id=doc_id AND a.version_id=ver_id
        AND a.revision=requested_revision AND a.purpose='review' AND a.actor_identity_id=actor
        AND a.session_id=(auth.jwt()->>'session_id')::uuid AND a.created_at>checked_at-interval '30 minutes') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current document access request required'; END IF;
    UPDATE public.workflow_document_uploads SET state=target_state,revision=requested_revision+1,review_reason=payload->>'reason',
      approved_by_identity_id=CASE WHEN requested_action='approve' THEN actor ELSE NULL END,
      approved_at=CASE WHEN requested_action='approve' THEN checked_at ELSE NULL END,updated_at=checked_at WHERE version_id=ver_id;
    IF requested_action='approve' THEN UPDATE public.workflow_document_versions SET state='approved' WHERE id=ver_id; END IF;
    INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,actor_identity_id,snapshot,correlation_id)
      VALUES(org_id,ver_id,requested_revision+1,CASE requested_action WHEN 'begin_review' THEN 'review_started' ELSE requested_action END,actor,
        jsonb_build_object('state',target_state,'reason',payload->>'reason','reviewReference',payload->>'reviewReference',
          'reviewedAccessId',payload->>'reviewedAccessId','contentsReviewed',payload->'contentsReviewed'),correlation_id);
    PERFORM mmhr_private.r1_finish_security_command(actor,command_key,'document.'||requested_action,'workflow_document_version',ver_id,org_id,
      payload->>'reason',correlation_id,idempotency_key,payload,NULL,
      jsonb_build_object('state','completed','record_id',ver_id),checked_at);
  END IF;
  RETURN jsonb_build_object('organizationId',org_id,'documentId',doc_id,'versionId',ver_id,'action',requested_action,
    'state',target_state,'revision',requested_revision+1,'correlationId',correlation_id,'outcomeCode',CASE WHEN receipt IS NULL THEN 'recorded' ELSE 'replayed' END);
END $$;
REVOKE ALL ON FUNCTION public.mmhr_record_workspace_document_review(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_workspace_document_review(jsonb,uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_quarantine_content_read_allowed(object_name text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_allowed boolean; parts text[]; actor uuid; access_row mmhr_private.document_access_grants%ROWTYPE;
BEGIN
  IF object_name IS NULL OR object_name !~ '^([0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/){2}[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR to_regprocedure('storage.allow_only_operation(text)') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT storage.allow_only_operation(''object.get_authenticated'')' INTO operation_allowed;
  IF operation_allowed IS DISTINCT FROM true THEN RETURN false; END IF;
  parts:=string_to_array(object_name,'/'); actor:=mmhr_private.r4_workspace_document_reader(parts[1]::uuid);
  IF actor IS NULL THEN RETURN false; END IF;
  FOR access_row IN SELECT * FROM mmhr_private.document_access_grants a WHERE a.organization_id=parts[1]::uuid
    AND a.document_id=parts[2]::uuid AND a.version_id=parts[3]::uuid AND a.actor_identity_id=actor
    AND a.session_id=(auth.jwt()->>'session_id')::uuid AND a.expires_at>clock_timestamp() LOOP
    IF mmhr_private.r4_document_content_actor(access_row.organization_id,access_row.document_id,access_row.version_id,access_row.revision,access_row.purpose)=actor THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_quarantine_content_read_allowed(text) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;
GRANT EXECUTE ON FUNCTION mmhr_private.r4_quarantine_content_read_allowed(text) TO authenticated;
--> statement-breakpoint
-- Owner-only local/approved environment installation. Existing scanner access
-- remains separate. Signing, listing, copying, updates, and deletion stay denied.
CREATE FUNCTION mmhr_private.r4_install_document_content_read_policies()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regprocedure('storage.allow_only_operation(text)') IS NULL
    OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='mmhr-document-quarantine' AND public=false AND file_size_limit=25000000
      AND cardinality(allowed_mime_types)=4 AND allowed_mime_types @> ARRAY['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[])
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass AND polname='mmhr_document_scan_read_allow'
      AND polcmd='r' AND polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='authenticated')])
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass AND polname='mmhr_document_anon_read_bound'
      AND polcmd='r' AND NOT polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='anon')])
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass AND polname='mmhr_document_read_bound'
      AND polcmd='r' AND NOT polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='authenticated')])
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass AND polname='mmhr_document_content_read_allow') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document content Storage policies require review'; END IF;
  EXECUTE $policy$ALTER POLICY mmhr_document_read_bound ON storage.objects TO authenticated
    USING(bucket_id<>'mmhr-document-quarantine' OR mmhr_private.r4_quarantine_scan_read_allowed(name) OR mmhr_private.r4_quarantine_content_read_allowed(name))$policy$;
  EXECUTE $policy$CREATE POLICY mmhr_document_content_read_allow ON storage.objects FOR SELECT TO authenticated
    USING(bucket_id='mmhr-document-quarantine' AND mmhr_private.r4_quarantine_content_read_allowed(name))$policy$;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_install_document_content_read_policies() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker;

