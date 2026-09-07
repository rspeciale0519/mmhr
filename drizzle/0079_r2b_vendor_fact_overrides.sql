-- R2B audited source-linked vendor-fact overrides.
ALTER TABLE public.vendor_fact_overrides ADD COLUMN source_id uuid;
ALTER TABLE public.vendor_fact_overrides
  ADD CONSTRAINT vendor_fact_overrides_source_scope_fk
  FOREIGN KEY (organization_id, source_id)
  REFERENCES public.vendor_sources (organization_id, id)
  ON DELETE RESTRICT;
CREATE INDEX vendor_fact_overrides_source_idx ON public.vendor_fact_overrides(organization_id, source_id);

CREATE OR REPLACE FUNCTION public.mmhr_record_vendor_fact_override(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE context record; receipt jsonb; item public.vendor_fact_overrides%ROWTYPE; v_org uuid; v_actor uuid; v_id uuid; v_fact uuid; v_source uuid;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR coalesce(payload->>'overrideId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'factId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'sourceId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'approvedByIdentityId','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(payload->>'value','')='' OR coalesce(payload->>'reason','')='' OR (payload->>'approvedAt')::timestamptz IS NULL OR (payload->>'expiresAt')::timestamptz IS NULL OR (payload->>'expiresAt')::timestamptz < (payload->>'approvedAt')::timestamptz OR correlation_id IS NULL OR idempotency_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid vendor fact override'; END IF;
 v_org:=(payload->>'organizationId')::uuid; v_actor:=(payload->>'approvedByIdentityId')::uuid; v_id:=(payload->>'overrideId')::uuid; v_fact:=(payload->>'factId')::uuid; v_source:=(payload->>'sourceId')::uuid;
 SELECT * INTO context FROM mmhr_private.r1_start_security_command('audit.export',v_org,'Record vendor fact override',correlation_id,idempotency_key); IF v_actor<>context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Security command denied'; END IF; receipt:=mmhr_private.r1_checked_receipt(context.actor_identity_id,'crm.vendor.fact.override',idempotency_key,payload); IF receipt IS NOT NULL THEN RETURN jsonb_build_object('overrideId',receipt->>'entity_id','organizationId',v_org,'outcomeCode','replayed','correlationId',correlation_id); END IF;
 IF NOT EXISTS (SELECT 1 FROM public.vendor_facts f WHERE f.organization_id=v_org AND f.id=v_fact) OR NOT EXISTS (SELECT 1 FROM public.vendor_sources s JOIN public.vendor_facts f ON f.organization_id=s.organization_id AND f.vendor_profile_id=s.vendor_profile_id WHERE s.organization_id=v_org AND s.id=v_source AND f.id=v_fact AND s.active) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Vendor override scope denied'; END IF;
 IF length(btrim(payload->>'value')) NOT BETWEEN 1 AND 2000 OR length(btrim(payload->>'reason')) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid vendor fact override'; END IF;
 INSERT INTO public.vendor_fact_overrides(id,organization_id,fact_id,source_id,value,approved_by_identity_id,approved_at,expires_at,reason) VALUES(v_id,v_org,v_fact,v_source,btrim(payload->>'value'),v_actor,(payload->>'approvedAt')::timestamptz,(payload->>'expiresAt')::timestamptz,btrim(payload->>'reason')) RETURNING * INTO item;
 PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id,'crm.vendor.fact.override','crm.vendor.fact.override','vendor_fact_override',item.id,v_org,'Record vendor fact override',correlation_id,idempotency_key,payload,NULL,jsonb_build_object('state','completed','version',1),context.authorization_time);
 RETURN jsonb_build_object('overrideId',item.id,'organizationId',item.organization_id,'factId',item.fact_id,'sourceId',item.source_id,'expiresAt',item.expires_at,'outcomeCode','recorded','correlationId',correlation_id);
END; $$;
REVOKE ALL ON FUNCTION public.mmhr_record_vendor_fact_override(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_record_vendor_fact_override(jsonb,uuid,uuid) TO authenticated;
