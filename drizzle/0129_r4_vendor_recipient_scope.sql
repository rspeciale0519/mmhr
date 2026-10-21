ALTER TABLE "rfp_recipients" DROP CONSTRAINT "rfp_recipients_vendor_scope_fk";
--> statement-breakpoint
ALTER TABLE "rfp_recipients" ADD COLUMN "vendor_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "rfp_recipients" ADD CONSTRAINT "rfp_recipients_vendor_organization_fk" FOREIGN KEY ("vendor_organization_id","vendor_profile_id") REFERENCES "public"."vendor_profiles"("organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- Preserve old same-organization records. New questionnaire delivery must bind
-- the selected vendor tenant and current disclosure, including calls to legacy RPCs.
CREATE FUNCTION mmhr_private.r4_guard_portal_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.rfp_versions%ROWTYPE; review jsonb;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.rfp_version_id,NEW.vendor_profile_id,NEW.vendor_organization_id,
    NEW.sent_at,NEW.deadline_at,NEW.delivery_reference) IS DISTINCT FROM
    (OLD.organization_id,OLD.rfp_version_id,OLD.vendor_profile_id,OLD.vendor_organization_id,
    OLD.sent_at,OLD.deadline_at,OLD.delivery_reference) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP delivery binding is immutable'; END IF;
  SELECT * INTO r FROM public.rfp_versions WHERE organization_id=NEW.organization_id AND id=NEW.rfp_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP recipient scope denied'; END IF;
  IF r.sections->0->>'sectionKey'='questionnaire' OR EXISTS(
    SELECT 1 FROM public.evaluation_publications p WHERE p.organization_id=r.organization_id AND p.intake_id=r.source_intake_id) THEN
    IF TG_OP='INSERT' THEN
      review := mmhr_private.r4_portal_delivery_review(r.organization_id,r.source_intake_id);
      IF (review->>'ready')::boolean IS DISTINCT FROM true OR NEW.vendor_organization_id IS NULL
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review->'items') x
          WHERE (x->>'vendorOrganizationId')::uuid=NEW.vendor_organization_id
            AND (x->>'vendorProfileId')::uuid=NEW.vendor_profile_id)
        OR r.status<>'approved' OR NOT mmhr_private.r4_has_mmhr_rfp_approval(r.id,r.organization_id,r.approved_by_identity_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RFP recipient requires approved disclosure'; END IF;
    END IF;
  ELSIF NEW.vendor_organization_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.vendor_profiles vp
    WHERE vp.organization_id=NEW.organization_id AND vp.id=NEW.vendor_profile_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Legacy RFP recipient scope denied';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_guard_portal_recipient() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
CREATE TRIGGER r4_portal_recipient_guard BEFORE INSERT OR UPDATE ON public.rfp_recipients
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_guard_portal_recipient();
--> statement-breakpoint
CREATE FUNCTION mmhr_private.r4_guard_questionnaire_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.sections->0->>'sectionKey'='questionnaire' AND
    (NEW.title,NEW.sections,NEW.organization_id,NEW.source_intake_id,NEW.rfp_id,NEW.version,NEW.created_by_identity_id)
      IS DISTINCT FROM (OLD.title,OLD.sections,OLD.organization_id,OLD.source_intake_id,OLD.rfp_id,OLD.version,OLD.created_by_identity_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Create a new RFP version to change questionnaire content';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mmhr_private.r4_guard_questionnaire_content() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
CREATE TRIGGER r4_questionnaire_content_guard BEFORE UPDATE ON public.rfp_versions
  FOR EACH ROW EXECUTE FUNCTION mmhr_private.r4_guard_questionnaire_content();
