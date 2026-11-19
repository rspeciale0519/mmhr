CREATE TABLE "mmhr_private"."rfp_vendor_form_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"provider_message_id" text,
	"actor_identity_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_vendor_form_events_kind_ck" CHECK ("mmhr_private"."rfp_vendor_form_events"."kind" in ('email_sent','email_failed','opened','follow_up_email','follow_up_note','submitted','reply_recorded','declined','no_response','reopened','due_changed')),
	CONSTRAINT "rfp_vendor_form_events_note_ck" CHECK ("mmhr_private"."rfp_vendor_form_events"."note" is null or length("mmhr_private"."rfp_vendor_form_events"."note") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_vendor_form_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mmhr_private"."rfp_vendor_form_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"document_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"content" "bytea" NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_vendor_form_files_key_ck" CHECK ("mmhr_private"."rfp_vendor_form_files"."document_key" ~ '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT "rfp_vendor_form_files_name_ck" CHECK (length(btrim("mmhr_private"."rfp_vendor_form_files"."file_name")) between 1 and 255 and "mmhr_private"."rfp_vendor_form_files"."file_name" !~ '[[:cntrl:]]' and position('/' in "mmhr_private"."rfp_vendor_form_files"."file_name") = 0 and position(chr(92) in "mmhr_private"."rfp_vendor_form_files"."file_name") = 0),
	CONSTRAINT "rfp_vendor_form_files_type_ck" CHECK ("mmhr_private"."rfp_vendor_form_files"."content_type" in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/png','image/jpeg')),
	CONSTRAINT "rfp_vendor_form_files_size_ck" CHECK ("mmhr_private"."rfp_vendor_form_files"."byte_size" between 1 and 4194304 and octet_length("mmhr_private"."rfp_vendor_form_files"."content") = "mmhr_private"."rfp_vendor_form_files"."byte_size"),
	CONSTRAINT "rfp_vendor_form_files_sha_ck" CHECK ("mmhr_private"."rfp_vendor_form_files"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_vendor_form_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mmhr_private"."rfp_vendor_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"vendor_organization_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"library_version" integer NOT NULL,
	"tab_keys" jsonb NOT NULL,
	"client_overview" jsonb NOT NULL,
	"rfp_title" text NOT NULL,
	"rfp_introduction" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"state" text DEFAULT 'prepared' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"respondent_name" text,
	"respondent_email" text,
	"due_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"created_by_identity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_vendor_forms_token_hash_ck" CHECK ("mmhr_private"."rfp_vendor_forms"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rfp_vendor_forms_state_ck" CHECK ("mmhr_private"."rfp_vendor_forms"."state" in ('prepared','sent','submitted','replied','declined','no_response')),
	CONSTRAINT "rfp_vendor_forms_tabs_ck" CHECK (jsonb_typeof("mmhr_private"."rfp_vendor_forms"."tab_keys") = 'array' and jsonb_array_length("mmhr_private"."rfp_vendor_forms"."tab_keys") between 1 and 50),
	CONSTRAINT "rfp_vendor_forms_overview_ck" CHECK (jsonb_typeof("mmhr_private"."rfp_vendor_forms"."client_overview") = 'object'),
	CONSTRAINT "rfp_vendor_forms_answers_ck" CHECK (jsonb_typeof("mmhr_private"."rfp_vendor_forms"."answers") = 'object'),
	CONSTRAINT "rfp_vendor_forms_library_ck" CHECK ("mmhr_private"."rfp_vendor_forms"."library_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_vendor_forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mmhr_private"."vendor_rfp_contacts" (
	"vendor_organization_id" uuid PRIMARY KEY NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"updated_by_identity_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_rfp_contacts_name_ck" CHECK (length(btrim("mmhr_private"."vendor_rfp_contacts"."contact_name")) between 1 and 200),
	CONSTRAINT "vendor_rfp_contacts_email_ck" CHECK ("mmhr_private"."vendor_rfp_contacts"."contact_email" = lower(btrim("mmhr_private"."vendor_rfp_contacts"."contact_email")) and length("mmhr_private"."vendor_rfp_contacts"."contact_email") between 3 and 320 and "mmhr_private"."vendor_rfp_contacts"."contact_email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);
--> statement-breakpoint
ALTER TABLE "mmhr_private"."vendor_rfp_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_vendor_form_events" ADD CONSTRAINT "rfp_vendor_form_events_form_id_rfp_vendor_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "mmhr_private"."rfp_vendor_forms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_vendor_form_events" ADD CONSTRAINT "rfp_vendor_form_events_actor_identity_id_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_vendor_form_files" ADD CONSTRAINT "rfp_vendor_form_files_form_id_rfp_vendor_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "mmhr_private"."rfp_vendor_forms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_vendor_forms" ADD CONSTRAINT "rfp_vendor_forms_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_vendor_forms" ADD CONSTRAINT "rfp_vendor_forms_vendor_organization_id_orgs_id_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_vendor_forms" ADD CONSTRAINT "rfp_vendor_forms_created_by_identity_id_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."rfp_vendor_forms" ADD CONSTRAINT "rfp_vendor_forms_recipient_scope_fk" FOREIGN KEY ("organization_id","recipient_id") REFERENCES "public"."rfp_recipients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."vendor_rfp_contacts" ADD CONSTRAINT "vendor_rfp_contacts_vendor_organization_id_orgs_id_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmhr_private"."vendor_rfp_contacts" ADD CONSTRAINT "vendor_rfp_contacts_updated_by_identity_id_identities_id_fk" FOREIGN KEY ("updated_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rfp_vendor_form_events_form_idx" ON "mmhr_private"."rfp_vendor_form_events" USING btree ("form_id","created_at");--> statement-breakpoint
CREATE INDEX "rfp_vendor_form_files_form_idx" ON "mmhr_private"."rfp_vendor_form_files" USING btree ("form_id","uploaded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_vendor_forms_recipient_uq" ON "mmhr_private"."rfp_vendor_forms" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_vendor_forms_token_hash_uq" ON "mmhr_private"."rfp_vendor_forms" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "rfp_vendor_forms_vendor_idx" ON "mmhr_private"."rfp_vendor_forms" USING btree ("vendor_organization_id","created_at");--> statement-breakpoint
CREATE INDEX "rfp_vendor_forms_organization_idx" ON "mmhr_private"."rfp_vendor_forms" USING btree ("organization_id","id");--> statement-breakpoint
-- RFP web form for vendors. The tables above are generated; everything below
-- is hand-written.
-- Product decision (owner, 2026-11-17 and 2026-11-18): most vendors never join
-- the app. MMHR emails each selected vendor's contact a private link to a web
-- form. The vendor answers without signing in. Staff track the send, the due
-- date, follow-ups, and the reply.
-- Forward:
-- 1. Four private tables (above). No policy exists, so no app role reads or
--    writes them directly.
-- 2. Staff functions need admin.access (two-step sign-in). Preparing a form
--    also needs rfp.distribute in the customer organization. Every staff
--    change writes an audit event through the existing command helpers.
-- 3. Vendor functions take the SHA-256 of the private link token. The token is
--    256 random-looking bits made by the server, so it cannot be guessed. A
--    token reads and changes one form only: one vendor on one RFP. It never
--    reaches another vendor's answers or another customer's RFP.
-- 4. A vendor can save and upload only while the form is "sent" and the due
--    date has not passed. Submitting locks the form until staff reopen it.
-- No existing table, function, policy, or permission changes.
-- Recovery: see the end of this file.

-- Maps a form state to the fixed audit vocabulary.
CREATE FUNCTION mmhr_private.r4_vendor_form_audit_state(p_state text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT CASE p_state WHEN 'prepared' THEN 'draft' WHEN 'sent' THEN 'sent'
    WHEN 'submitted' THEN 'completed' WHEN 'replied' THEN 'completed'
    WHEN 'declined' THEN 'rejected' ELSE 'expired' END
$$;--> statement-breakpoint

-- One form as staff see it in tracking lists: dates, state, counts, the event
-- log, and file names. Answers are not included.
CREATE FUNCTION mmhr_private.r4_vendor_form_summary(p_form_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
  SELECT jsonb_build_object(
    'formId', f.id, 'organizationId', f.organization_id, 'recipientId', f.recipient_id,
    'vendorOrganizationId', f.vendor_organization_id,
    'vendorName', (SELECT o.name FROM public.orgs o WHERE o.id = f.vendor_organization_id),
    'customerName', (SELECT o.name FROM public.orgs o WHERE o.id = f.organization_id),
    'rfpTitle', f.rfp_title, 'state', f.state,
    'contactName', f.contact_name, 'contactEmail', f.contact_email,
    'tabKeys', f.tab_keys, 'libraryVersion', f.library_version,
    'dueAt', f.due_at, 'sentAt', f.sent_at, 'openedAt', f.opened_at,
    'submittedAt', f.submitted_at, 'repliedAt', f.replied_at,
    'respondentName', f.respondent_name, 'respondentEmail', f.respondent_email,
    'answeredCount', (SELECT count(*) FROM jsonb_each(f.answers) a WHERE a.value->>'answer' IS NOT NULL),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('eventId', e.id, 'kind', e.kind, 'note', e.note,
        'occurredAt', e.occurred_at, 'byStaff', e.actor_identity_id IS NOT NULL) ORDER BY e.created_at, e.id)
      FROM (SELECT * FROM mmhr_private.rfp_vendor_form_events x WHERE x.form_id = f.id
        ORDER BY x.created_at DESC, x.id DESC LIMIT 100) e), '[]'::jsonb),
    'files', coalesce((SELECT jsonb_agg(jsonb_build_object('fileId', d.id, 'documentKey', d.document_key,
        'fileName', d.file_name, 'byteSize', d.byte_size, 'uploadedAt', d.uploaded_at) ORDER BY d.uploaded_at, d.id)
      FROM mmhr_private.rfp_vendor_form_files d WHERE d.form_id = f.id), '[]'::jsonb))
  FROM mmhr_private.rfp_vendor_forms f WHERE f.id = p_form_id
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mmhr_private.r4_vendor_form_audit_state(text), mmhr_private.r4_vendor_form_summary(uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint

-- Staff: save the person at a vendor who receives RFP emails.
CREATE FUNCTION public.mmhr_set_vendor_rfp_contact(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record; receipt jsonb; v_org uuid; v_name text; v_email text;
  v_reason text := 'Save the vendor contact for RFP emails';
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object'
    OR NOT (payload ?& ARRAY['vendorOrganizationId','contactName','contactEmail'])
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 3
    OR jsonb_typeof(payload->'contactName') <> 'string' OR jsonb_typeof(payload->'contactEmail') <> 'string'
    OR coalesce(payload->>'vendorOrganizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid vendor contact input'; END IF;
  v_org := (payload->>'vendorOrganizationId')::uuid;
  v_name := btrim(payload->>'contactName');
  v_email := lower(btrim(payload->>'contactEmail'));
  IF length(v_name) NOT BETWEEN 1 AND 200 OR v_name ~ '[[:cntrl:]]' OR length(v_email) NOT BETWEEN 3 AND 320
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid vendor contact input'; END IF;
  -- Checks two-step sign-in, the live session, and admin.access.
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'admin.access', NULL::uuid, v_reason, correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'staff.vendor.rfp_contact.set', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    RETURN jsonb_build_object('vendorOrganizationId', v_org, 'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgs o WHERE o.id = v_org AND o.type = 'vendor' AND o.status <> 'archived')
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  INSERT INTO mmhr_private.vendor_rfp_contacts(vendor_organization_id, contact_name, contact_email, updated_by_identity_id, updated_at)
    VALUES (v_org, v_name, v_email, context.actor_identity_id, context.authorization_time)
  ON CONFLICT (vendor_organization_id) DO UPDATE SET contact_name = EXCLUDED.contact_name,
    contact_email = EXCLUDED.contact_email, updated_by_identity_id = EXCLUDED.updated_by_identity_id,
    updated_at = EXCLUDED.updated_at;
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'staff.vendor.rfp_contact.set', 'staff.vendor.rfp_contact.set', 'organization', v_org,
    v_org, v_reason, correlation_id, idempotency_key, payload, NULL::jsonb,
    jsonb_build_object('record_id', v_org, 'type', 'vendor'), context.authorization_time);
  RETURN jsonb_build_object('vendorOrganizationId', v_org, 'outcomeCode', 'saved', 'correlationId', correlation_id);
END
$$;--> statement-breakpoint

-- Staff: every saved vendor contact, for the vendor directory page.
CREATE FUNCTION public.mmhr_get_vendor_rfp_contacts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT mmhr_private.r1_request_has_permission('admin.access', NULL)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Vendor contact read denied'; END IF;
  RETURN jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'vendorOrganizationId', c.vendor_organization_id, 'contactName', c.contact_name, 'contactEmail', c.contact_email)
      ORDER BY c.vendor_organization_id)
    FROM (SELECT * FROM mmhr_private.vendor_rfp_contacts ORDER BY vendor_organization_id LIMIT 500) c), '[]'::jsonb));
END
$$;--> statement-breakpoint

-- Staff: the vendors on one delivered RFP, each with its contact and its form.
CREATE FUNCTION public.mmhr_get_rfp_send_out(payload jsonb, correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE v_org uuid; v_rfp public.rfp_versions%ROWTYPE; v_recipients jsonb; v_last record;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL
    OR NOT (payload ?& ARRAY['organizationId','rfpId','version'])
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 3
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP send-out read'; END IF;
  v_org := (payload->>'organizationId')::uuid;
  IF NOT mmhr_private.r1_request_has_permission('admin.access', NULL)
    OR NOT mmhr_private.r1_request_has_permission('rfp.distribute', v_org)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP send-out read denied'; END IF;
  SELECT * INTO v_rfp FROM public.rfp_versions r WHERE r.organization_id = v_org
    AND r.rfp_id = (payload->>'rfpId')::uuid AND r.version = (payload->>'version')::integer;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP send-out read denied'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'recipientId', rr.id, 'vendorOrganizationId', vo.id, 'vendorName', vo.name, 'deadlineAt', rr.deadline_at,
      'contactName', c.contact_name, 'contactEmail', c.contact_email,
      'form', (SELECT mmhr_private.r4_vendor_form_summary(f.id) FROM mmhr_private.rfp_vendor_forms f WHERE f.recipient_id = rr.id))
      ORDER BY vo.name, rr.id), '[]'::jsonb) INTO v_recipients
  FROM public.rfp_recipients rr
  JOIN public.vendor_profiles vp ON vp.id = rr.vendor_profile_id
  JOIN public.orgs vo ON vo.id = vp.organization_id
  LEFT JOIN mmhr_private.vendor_rfp_contacts c ON c.vendor_organization_id = vo.id
  WHERE rr.organization_id = v_org AND rr.rfp_version_id = v_rfp.id AND rr.state <> 'withdrawn';
  -- The newest form of this customer pre-fills the next send.
  SELECT f.client_overview, f.tab_keys INTO v_last FROM mmhr_private.rfp_vendor_forms f
    WHERE f.organization_id = v_org ORDER BY f.updated_at DESC, f.id DESC LIMIT 1;
  RETURN jsonb_build_object('organizationId', v_org, 'rfpId', v_rfp.rfp_id, 'version', v_rfp.version,
    'title', v_rfp.title, 'status', v_rfp.status,
    'customerName', (SELECT o.name FROM public.orgs o WHERE o.id = v_org),
    'recipients', v_recipients, 'lastClientOverview', v_last.client_overview, 'lastTabKeys', v_last.tab_keys,
    'correlationId', correlation_id);
END
$$;--> statement-breakpoint

-- Staff: create or update the form for one vendor before its email is sent.
-- The caller makes the link token and passes only its hash.
CREATE FUNCTION public.mmhr_prepare_rfp_vendor_form(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE
  context record; receipt jsonb; v_org uuid; v_recipient uuid; v_due timestamptz;
  v_rr public.rfp_recipients%ROWTYPE; v_rfp public.rfp_versions%ROWTYPE; v_vendor uuid;
  v_contact mmhr_private.vendor_rfp_contacts%ROWTYPE; v_form mmhr_private.rfp_vendor_forms%ROWTYPE;
  v_reason text := 'Prepare the RFP web form for one vendor';
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object'
    OR NOT (payload ?& ARRAY['organizationId','recipientId','tokenHash','libraryVersion','tabKeys','clientOverview','dueAt'])
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 7
    OR coalesce(payload->>'tokenHash','') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(payload->'libraryVersion') <> 'number' OR payload->>'libraryVersion' !~ '^[1-9][0-9]{0,5}$'
    OR jsonb_typeof(payload->'tabKeys') <> 'array' OR jsonb_array_length(payload->'tabKeys') NOT BETWEEN 1 AND 50
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'tabKeys') k
      WHERE jsonb_typeof(k) <> 'string' OR k #>> '{}' !~ '^[a-z][a-z0-9_]{0,63}$')
    OR jsonb_typeof(payload->'clientOverview') <> 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(payload->'clientOverview')) > 30
    OR EXISTS (SELECT 1 FROM jsonb_each(payload->'clientOverview') o
      WHERE o.key !~ '^[a-z][A-Za-z0-9]{0,63}$' OR jsonb_typeof(o.value) <> 'string' OR length(o.value #>> '{}') > 4000)
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP form input'; END IF;
  v_org := (payload->>'organizationId')::uuid; v_recipient := (payload->>'recipientId')::uuid;
  v_due := (payload->>'dueAt')::timestamptz;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'rfp.distribute', v_org, v_reason, correlation_id, idempotency_key);
  IF NOT mmhr_private.r1_request_has_permission('admin.access', NULL)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP staff access denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rfp.vendor_form.prepare', idempotency_key, payload);
  SELECT * INTO v_rr FROM public.rfp_recipients rr WHERE rr.organization_id = v_org AND rr.id = v_recipient FOR UPDATE;
  IF NOT FOUND OR v_rr.state = 'withdrawn' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP form denied'; END IF;
  SELECT * INTO v_rfp FROM public.rfp_versions r WHERE r.organization_id = v_org AND r.id = v_rr.rfp_version_id;
  IF NOT FOUND OR v_rfp.status <> 'distributed' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP form denied'; END IF;
  SELECT vp.organization_id INTO v_vendor FROM public.vendor_profiles vp WHERE vp.id = v_rr.vendor_profile_id;
  SELECT * INTO v_form FROM mmhr_private.rfp_vendor_forms f WHERE f.recipient_id = v_recipient FOR UPDATE;
  IF receipt IS NULL THEN
    SELECT * INTO v_contact FROM mmhr_private.vendor_rfp_contacts c WHERE c.vendor_organization_id = v_vendor;
    IF v_contact.vendor_organization_id IS NULL THEN
      RETURN jsonb_build_object('outcomeCode', 'contact_missing', 'correlationId', correlation_id);
    END IF;
    IF v_form.id IS NOT NULL AND v_form.state NOT IN ('prepared','sent') THEN
      RETURN jsonb_build_object('outcomeCode', 'closed', 'correlationId', correlation_id);
    END IF;
    IF v_due IS NULL OR NOT isfinite(v_due) OR v_due <= clock_timestamp()
    THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RFP form due date must be in the future'; END IF;
    IF v_form.id IS NULL THEN
      INSERT INTO mmhr_private.rfp_vendor_forms(organization_id, recipient_id, vendor_organization_id, token_hash,
        library_version, tab_keys, client_overview, rfp_title, rfp_introduction, contact_name, contact_email,
        state, due_at, created_by_identity_id, created_at, updated_at)
      VALUES (v_org, v_recipient, v_vendor, payload->>'tokenHash', (payload->>'libraryVersion')::integer,
        payload->'tabKeys', payload->'clientOverview', v_rfp.title, coalesce(v_rfp.sections->0->>'content',''),
        v_contact.contact_name, v_contact.contact_email, 'prepared', v_due, context.actor_identity_id,
        context.authorization_time, context.authorization_time)
      RETURNING * INTO v_form;
    ELSE
      UPDATE mmhr_private.rfp_vendor_forms SET token_hash = payload->>'tokenHash',
        library_version = (payload->>'libraryVersion')::integer, tab_keys = payload->'tabKeys',
        client_overview = payload->'clientOverview', contact_name = v_contact.contact_name,
        contact_email = v_contact.contact_email, due_at = v_due, updated_at = context.authorization_time
      WHERE id = v_form.id RETURNING * INTO v_form;
    END IF;
    PERFORM mmhr_private.r1_finish_security_command(
      context.actor_identity_id, 'r4.rfp.vendor_form.prepare', 'rfp.distribute', 'rfp_vendor_form', v_form.id,
      v_org, v_reason, correlation_id, idempotency_key, payload, NULL::jsonb,
      jsonb_build_object('record_id', v_form.id, 'state', mmhr_private.r4_vendor_form_audit_state(v_form.state)),
      context.authorization_time);
  ELSIF v_form.id IS NULL OR (receipt->>'entity_id')::uuid <> v_form.id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP form replay denied';
  END IF;
  RETURN jsonb_build_object('outcomeCode', CASE WHEN receipt IS NULL THEN 'prepared' ELSE 'replayed' END,
    'formId', v_form.id, 'state', v_form.state, 'dueAt', v_form.due_at,
    'contactName', v_form.contact_name, 'contactEmail', v_form.contact_email, 'rfpTitle', v_form.rfp_title,
    'vendorName', (SELECT o.name FROM public.orgs o WHERE o.id = v_form.vendor_organization_id),
    'customerName', (SELECT o.name FROM public.orgs o WHERE o.id = v_form.organization_id),
    'correlationId', correlation_id);
END
$$;--> statement-breakpoint

-- Staff: add one line to a form's tracking log and apply its state change.
CREATE FUNCTION public.mmhr_record_rfp_vendor_form_event(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE
  context record; receipt jsonb; v_form mmhr_private.rfp_vendor_forms%ROWTYPE; v_kind text; v_note text;
  v_when timestamptz; v_due timestamptz; v_state text;
  v_reason text := 'Record RFP vendor tracking';
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR NOT (payload ?& ARRAY['formId','kind'])
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k
      WHERE k NOT IN ('formId','kind','note','occurredAt','dueAt','providerMessageId'))
    OR EXISTS (SELECT 1 FROM jsonb_each(payload) e WHERE jsonb_typeof(e.value) <> 'string')
    OR coalesce(payload->>'formId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR payload->>'kind' NOT IN ('email_sent','email_failed','follow_up_email','follow_up_note',
      'reply_recorded','declined','no_response','reopened','due_changed')
    OR length(coalesce(payload->>'providerMessageId','x')) NOT BETWEEN 1 AND 255
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP tracking input'; END IF;
  v_kind := payload->>'kind';
  v_note := nullif(btrim(coalesce(payload->>'note','')), '');
  v_when := (payload->>'occurredAt')::timestamptz; v_due := (payload->>'dueAt')::timestamptz;
  IF length(coalesce(v_note,'x')) > 2000 OR (v_kind = 'follow_up_note' AND v_note IS NULL)
    OR (v_when IS NOT NULL AND (NOT isfinite(v_when) OR v_when > clock_timestamp() + interval '1 day'))
    OR (v_due IS NOT NULL AND (NOT isfinite(v_due) OR v_due <= clock_timestamp()))
    OR (v_kind = 'due_changed' AND v_due IS NULL) OR (v_kind NOT IN ('due_changed','reopened') AND v_due IS NOT NULL)
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP tracking input'; END IF;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command(
    'admin.access', NULL::uuid, v_reason, correlation_id, idempotency_key);
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r4.rfp.vendor_form.track', idempotency_key, payload);
  SELECT * INTO v_form FROM mmhr_private.rfp_vendor_forms f WHERE f.id = (payload->>'formId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP tracking denied'; END IF;
  IF receipt IS NOT NULL THEN
    RETURN jsonb_build_object('formId', v_form.id, 'state', v_form.state, 'outcomeCode', 'replayed', 'correlationId', correlation_id);
  END IF;
  v_state := v_form.state;
  -- Each kind is allowed from some states only. A refused change returns
  -- "conflict" and writes nothing.
  IF v_kind = 'email_sent' AND v_state IN ('prepared','sent') THEN v_state := 'sent';
  ELSIF v_kind = 'email_failed' AND v_state IN ('prepared','sent') THEN NULL;
  ELSIF v_kind IN ('follow_up_email','follow_up_note') AND v_state <> 'prepared' THEN NULL;
  ELSIF v_kind IN ('reply_recorded','declined','no_response') AND v_state IN ('sent','replied','declined','no_response') THEN
    v_state := CASE v_kind WHEN 'reply_recorded' THEN 'replied' ELSE v_kind END;
  ELSIF v_kind = 'reopened' AND v_state IN ('submitted','replied','declined','no_response')
    AND coalesce(v_due, v_form.due_at) > clock_timestamp() THEN v_state := 'sent';
  ELSIF v_kind = 'due_changed' AND v_state IN ('prepared','sent') THEN NULL;
  ELSE
    RETURN jsonb_build_object('formId', v_form.id, 'state', v_form.state, 'outcomeCode', 'conflict', 'correlationId', correlation_id);
  END IF;
  UPDATE mmhr_private.rfp_vendor_forms SET state = v_state,
    sent_at = CASE WHEN v_kind = 'email_sent' THEN coalesce(sent_at, context.authorization_time) ELSE sent_at END,
    replied_at = CASE WHEN v_kind IN ('reply_recorded','declined') THEN coalesce(v_when, context.authorization_time)
      WHEN v_kind = 'reopened' THEN NULL ELSE replied_at END,
    submitted_at = CASE WHEN v_kind = 'reopened' THEN NULL ELSE submitted_at END,
    due_at = coalesce(v_due, due_at), updated_at = context.authorization_time
  WHERE id = v_form.id;
  INSERT INTO mmhr_private.rfp_vendor_form_events(form_id, kind, note, provider_message_id, actor_identity_id, occurred_at, created_at)
    VALUES (v_form.id, v_kind, v_note, payload->>'providerMessageId', context.actor_identity_id,
      coalesce(v_when, context.authorization_time), context.authorization_time);
  PERFORM mmhr_private.r1_finish_security_command(
    context.actor_identity_id, 'r4.rfp.vendor_form.track', 'r4.rfp.vendor_form.' || v_kind, 'rfp_vendor_form', v_form.id,
    v_form.organization_id, v_reason, correlation_id, idempotency_key, payload,
    jsonb_build_object('state', mmhr_private.r4_vendor_form_audit_state(v_form.state)),
    jsonb_build_object('record_id', v_form.id, 'state', mmhr_private.r4_vendor_form_audit_state(v_state)),
    context.authorization_time);
  RETURN jsonb_build_object('formId', v_form.id, 'state', v_state, 'outcomeCode', 'recorded', 'correlationId', correlation_id);
END
$$;--> statement-breakpoint

-- Staff: one form with its answers, for the answers page.
CREATE FUNCTION public.mmhr_get_rfp_vendor_form(payload jsonb, correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE v_form mmhr_private.rfp_vendor_forms%ROWTYPE;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR NOT payload ? 'formId'
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 1
    OR coalesce(payload->>'formId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP form read'; END IF;
  IF NOT mmhr_private.r1_request_has_permission('admin.access', NULL)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP form read denied'; END IF;
  SELECT * INTO v_form FROM mmhr_private.rfp_vendor_forms f WHERE f.id = (payload->>'formId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP form read denied'; END IF;
  RETURN mmhr_private.r4_vendor_form_summary(v_form.id) || jsonb_build_object(
    'answers', v_form.answers, 'clientOverview', v_form.client_overview,
    'rfpIntroduction', v_form.rfp_introduction, 'correlationId', correlation_id);
END
$$;--> statement-breakpoint

-- Staff: the newest 50 forms sent to one vendor, for the vendor workspace.
CREATE FUNCTION public.mmhr_get_vendor_rfp_tracking(payload jsonb, correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE v_vendor uuid;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR NOT payload ? 'vendorOrganizationId'
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 1
    OR coalesce(payload->>'vendorOrganizationId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP tracking read'; END IF;
  IF NOT mmhr_private.r1_request_has_permission('admin.access', NULL)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP tracking read denied'; END IF;
  v_vendor := (payload->>'vendorOrganizationId')::uuid;
  RETURN jsonb_build_object('vendorOrganizationId', v_vendor,
    'contact', (SELECT jsonb_build_object('contactName', c.contact_name, 'contactEmail', c.contact_email)
      FROM mmhr_private.vendor_rfp_contacts c WHERE c.vendor_organization_id = v_vendor),
    'items', coalesce((SELECT jsonb_agg(mmhr_private.r4_vendor_form_summary(f.id) ORDER BY f.created_at DESC, f.id)
      FROM (SELECT x.id, x.created_at FROM mmhr_private.rfp_vendor_forms x WHERE x.vendor_organization_id = v_vendor
        ORDER BY x.created_at DESC, x.id LIMIT 50) f), '[]'::jsonb),
    'correlationId', correlation_id);
END
$$;--> statement-breakpoint

-- Staff: one uploaded file, as base64 text, for download.
CREATE FUNCTION public.mmhr_get_rfp_vendor_form_file(payload jsonb, correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_file mmhr_private.rfp_vendor_form_files%ROWTYPE;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR NOT payload ? 'fileId'
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 1
    OR coalesce(payload->>'fileId','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP file read'; END IF;
  IF NOT mmhr_private.r1_request_has_permission('admin.access', NULL)
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP file read denied'; END IF;
  SELECT * INTO v_file FROM mmhr_private.rfp_vendor_form_files d WHERE d.id = (payload->>'fileId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP file read denied'; END IF;
  RETURN jsonb_build_object('fileId', v_file.id, 'fileName', v_file.file_name, 'contentType', v_file.content_type,
    'byteSize', v_file.byte_size, 'contentBase64', translate(encode(v_file.content, 'base64'), E'\n', ''),
    'correlationId', correlation_id);
END
$$;--> statement-breakpoint

-- Vendor: read the form behind a private link. The first read is logged as
-- "opened". Returns NULL for an unknown link or a form that was never sent.
CREATE FUNCTION public.mmhr_vendor_rfp_form_read(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE v_form mmhr_private.rfp_vendor_forms%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_form FROM mmhr_private.rfp_vendor_forms f
    WHERE f.token_hash = p_token_hash AND f.state <> 'prepared';
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_form.opened_at IS NULL THEN
    UPDATE mmhr_private.rfp_vendor_forms SET opened_at = clock_timestamp()
      WHERE id = v_form.id AND opened_at IS NULL;
    IF FOUND THEN
      INSERT INTO mmhr_private.rfp_vendor_form_events(form_id, kind) VALUES (v_form.id, 'opened');
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'state', v_form.state, 'editable', v_form.state = 'sent' AND v_form.due_at > clock_timestamp(),
    'dueAt', v_form.due_at, 'submittedAt', v_form.submitted_at,
    'vendorName', (SELECT o.name FROM public.orgs o WHERE o.id = v_form.vendor_organization_id),
    'rfpTitle', v_form.rfp_title, 'rfpIntroduction', v_form.rfp_introduction,
    'clientOverview', v_form.client_overview, 'tabKeys', v_form.tab_keys, 'libraryVersion', v_form.library_version,
    'answers', v_form.answers, 'respondentName', v_form.respondent_name, 'respondentEmail', v_form.respondent_email,
    'files', coalesce((SELECT jsonb_agg(jsonb_build_object('fileId', d.id, 'documentKey', d.document_key,
        'fileName', d.file_name, 'byteSize', d.byte_size, 'uploadedAt', d.uploaded_at) ORDER BY d.uploaded_at, d.id)
      FROM mmhr_private.rfp_vendor_form_files d WHERE d.form_id = v_form.id), '[]'::jsonb));
END
$$;--> statement-breakpoint

-- Vendor: save some answers. New answers replace old ones with the same key;
-- other saved answers stay. Returns saved=false when the form is locked.
CREATE FUNCTION public.mmhr_vendor_rfp_form_save(p_token_hash text, p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE v_form mmhr_private.rfp_vendor_forms%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_answers IS NULL
    OR jsonb_typeof(p_answers) <> 'object' OR octet_length(p_answers::text) > 1500000
    OR (SELECT count(*) FROM jsonb_object_keys(p_answers)) > 1000
    OR EXISTS (SELECT 1 FROM jsonb_each(p_answers) a WHERE a.key !~ '^[a-z][a-z0-9_]{0,63}$'
      OR jsonb_typeof(a.value) <> 'object'
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(a.value) k WHERE k NOT IN ('answer','comment'))
      OR NOT (a.value ? 'answer' AND a.value ? 'comment')
      OR NOT (a.value->'answer' = 'null'::jsonb OR a.value->>'answer' IN ('yes','no','na','within_12_months'))
      OR NOT (a.value->'comment' = 'null'::jsonb
        OR (jsonb_typeof(a.value->'comment') = 'string' AND length(a.value->>'comment') <= 2000)))
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP form answers'; END IF;
  SELECT * INTO v_form FROM mmhr_private.rfp_vendor_forms f WHERE f.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP form denied'; END IF;
  IF v_form.state <> 'sent' OR v_form.due_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('saved', false, 'state', v_form.state);
  END IF;
  UPDATE mmhr_private.rfp_vendor_forms SET answers = answers || p_answers, updated_at = clock_timestamp()
    WHERE id = v_form.id;
  RETURN jsonb_build_object('saved', true, 'state', v_form.state);
END
$$;--> statement-breakpoint

-- Vendor: submit the form. This locks it until staff reopen it.
CREATE FUNCTION public.mmhr_vendor_rfp_form_submit(p_token_hash text, p_name text, p_email text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE v_form mmhr_private.rfp_vendor_forms%ROWTYPE; v_name text := btrim(coalesce(p_name,'')); v_email text := lower(btrim(coalesce(p_email,'')));
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR length(v_name) NOT BETWEEN 1 AND 200
    OR v_name ~ '[[:cntrl:]]' OR length(v_email) NOT BETWEEN 3 AND 320
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP form submission'; END IF;
  SELECT * INTO v_form FROM mmhr_private.rfp_vendor_forms f WHERE f.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP form denied'; END IF;
  IF v_form.state <> 'sent' OR v_form.due_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('submitted', false, 'state', v_form.state);
  END IF;
  UPDATE mmhr_private.rfp_vendor_forms SET state = 'submitted', submitted_at = clock_timestamp(),
    respondent_name = v_name, respondent_email = v_email, updated_at = clock_timestamp() WHERE id = v_form.id;
  INSERT INTO mmhr_private.rfp_vendor_form_events(form_id, kind) VALUES (v_form.id, 'submitted');
  RETURN jsonb_build_object('submitted', true, 'state', 'submitted');
END
$$;--> statement-breakpoint

-- Vendor: upload one document, sent as base64 text. At most 12 files a form.
CREATE FUNCTION public.mmhr_vendor_rfp_form_file_add(
  p_token_hash text, p_document_key text, p_file_name text, p_content_type text, p_content_base64 text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE v_form mmhr_private.rfp_vendor_forms%ROWTYPE; v_bytes bytea; v_id uuid;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_document_key IS NULL OR p_file_name IS NULL
    OR p_content_type IS NULL OR p_content_base64 IS NULL OR length(p_content_base64) > 5600000
    OR p_content_base64 !~ '^[A-Za-z0-9+/]+={0,2}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP form file'; END IF;
  v_bytes := decode(p_content_base64, 'base64');
  SELECT * INTO v_form FROM mmhr_private.rfp_vendor_forms f WHERE f.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP form denied'; END IF;
  IF v_form.state <> 'sent' OR v_form.due_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('stored', false, 'state', v_form.state);
  END IF;
  IF (SELECT count(*) FROM mmhr_private.rfp_vendor_form_files d WHERE d.form_id = v_form.id) >= 12 THEN
    RETURN jsonb_build_object('stored', false, 'state', v_form.state, 'reason', 'too_many');
  END IF;
  BEGIN
    INSERT INTO mmhr_private.rfp_vendor_form_files(form_id, document_key, file_name, content_type, byte_size, sha256, content)
      VALUES (v_form.id, p_document_key, btrim(p_file_name), p_content_type, octet_length(v_bytes),
        encode(sha256(v_bytes), 'hex'), v_bytes) RETURNING id INTO v_id;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP form file';
  END;
  RETURN jsonb_build_object('stored', true, 'fileId', v_id, 'state', v_form.state);
END
$$;--> statement-breakpoint

-- Vendor: remove one uploaded document while the form is still open.
CREATE FUNCTION public.mmhr_vendor_rfp_form_file_remove(p_token_hash text, p_file_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC'
AS $$
DECLARE v_form mmhr_private.rfp_vendor_forms%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_file_id IS NULL
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid RFP form file'; END IF;
  SELECT * INTO v_form FROM mmhr_private.rfp_vendor_forms f WHERE f.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RFP form denied'; END IF;
  IF v_form.state <> 'sent' OR v_form.due_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('removed', false, 'state', v_form.state);
  END IF;
  DELETE FROM mmhr_private.rfp_vendor_form_files d WHERE d.id = p_file_id AND d.form_id = v_form.id;
  RETURN jsonb_build_object('removed', FOUND, 'state', v_form.state);
END
$$;--> statement-breakpoint

-- Staff functions: signed-in users only. Each one checks admin.access itself.
REVOKE ALL ON FUNCTION public.mmhr_set_vendor_rfp_contact(jsonb, uuid, uuid), public.mmhr_get_vendor_rfp_contacts(),
  public.mmhr_get_rfp_send_out(jsonb, uuid), public.mmhr_prepare_rfp_vendor_form(jsonb, uuid, uuid),
  public.mmhr_record_rfp_vendor_form_event(jsonb, uuid, uuid), public.mmhr_get_rfp_vendor_form(jsonb, uuid),
  public.mmhr_get_vendor_rfp_tracking(jsonb, uuid), public.mmhr_get_rfp_vendor_form_file(jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_set_vendor_rfp_contact(jsonb, uuid, uuid), public.mmhr_get_vendor_rfp_contacts(),
  public.mmhr_get_rfp_send_out(jsonb, uuid), public.mmhr_prepare_rfp_vendor_form(jsonb, uuid, uuid),
  public.mmhr_record_rfp_vendor_form_event(jsonb, uuid, uuid), public.mmhr_get_rfp_vendor_form(jsonb, uuid),
  public.mmhr_get_vendor_rfp_tracking(jsonb, uuid), public.mmhr_get_rfp_vendor_form_file(jsonb, uuid)
  TO authenticated;--> statement-breakpoint
-- Vendor functions: no sign-in. The private link token is the only key.
REVOKE ALL ON FUNCTION public.mmhr_vendor_rfp_form_read(text), public.mmhr_vendor_rfp_form_save(text, jsonb),
  public.mmhr_vendor_rfp_form_submit(text, text, text),
  public.mmhr_vendor_rfp_form_file_add(text, text, text, text, text),
  public.mmhr_vendor_rfp_form_file_remove(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mmhr_vendor_rfp_form_read(text), public.mmhr_vendor_rfp_form_save(text, jsonb),
  public.mmhr_vendor_rfp_form_submit(text, text, text),
  public.mmhr_vendor_rfp_form_file_add(text, text, text, text, text),
  public.mmhr_vendor_rfp_form_file_remove(text, uuid)
  TO anon, authenticated;--> statement-breakpoint
-- The private tables stay closed to every app role.
REVOKE ALL ON TABLE mmhr_private.vendor_rfp_contacts, mmhr_private.rfp_vendor_forms,
  mmhr_private.rfp_vendor_form_events, mmhr_private.rfp_vendor_form_files
  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;
-- Recovery (run by hand, only on a database with no forms worth keeping):
-- 1. REVOKE EXECUTE on the 13 public functions above from anon and
--    authenticated. This stops every send, save, and read at once.
-- 2. To remove fully: DROP the 13 public functions and the 2 private helper
--    functions, then DROP the tables rfp_vendor_form_files,
--    rfp_vendor_form_events, rfp_vendor_forms, vendor_rfp_contacts, in that
--    order. Audit events and receipts written by these commands stay.
