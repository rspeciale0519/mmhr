-- R2B CRM foundation. These records are additive and organization-scoped.
-- Request paths must use request-scoped authorization before later policies are added.
CREATE TABLE public.customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'prospect',
  business_context text,
  current_software text,
  purchase_history jsonb,
  contract_start_at timestamptz,
  contract_end_at timestamptz,
  renewal_window_start_at timestamptz,
  renewal_window_end_at timestamptz,
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  updated_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customer_profiles_organization_uq
  ON public.customer_profiles (organization_id);
CREATE INDEX customer_profiles_status_idx
  ON public.customer_profiles (status);
ALTER TABLE public.customer_profiles
  ADD CONSTRAINT customer_profiles_status_ck
  CHECK (status IN ('prospect', 'active', 'paused', 'closed', 'archived'));
ALTER TABLE public.customer_profiles
  ADD CONSTRAINT customer_profiles_revision_ck CHECK (revision > 0);
ALTER TABLE public.customer_profiles
  ADD CONSTRAINT customer_profiles_contract_dates_ck
  CHECK (contract_end_at IS NULL OR contract_start_at IS NULL OR contract_end_at >= contract_start_at);
ALTER TABLE public.customer_profiles
  ADD CONSTRAINT customer_profiles_renewal_dates_ck
  CHECK (renewal_window_end_at IS NULL OR renewal_window_start_at IS NULL OR renewal_window_end_at >= renewal_window_start_at);
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.vendor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'prospect',
  description text,
  approved_commercial_metadata jsonb,
  approved_at timestamptz,
  approved_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  updated_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vendor_profiles_organization_uq
  ON public.vendor_profiles (organization_id);
CREATE UNIQUE INDEX vendor_profiles_organization_id_id_uq
  ON public.vendor_profiles (organization_id, id);
CREATE INDEX vendor_profiles_status_idx ON public.vendor_profiles (status);
ALTER TABLE public.vendor_profiles
  ADD CONSTRAINT vendor_profiles_status_ck
  CHECK (status IN ('prospect', 'active', 'paused', 'archived'));
ALTER TABLE public.vendor_profiles
  ADD CONSTRAINT vendor_profiles_approval_ck
  CHECK ((approved_at IS NULL AND approved_by_identity_id IS NULL) OR
    (approved_at IS NOT NULL AND approved_by_identity_id IS NOT NULL));
ALTER TABLE public.vendor_profiles
  ADD CONSTRAINT vendor_profiles_revision_ck CHECK (revision > 0);
ALTER TABLE public.vendor_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  vendor_profile_id uuid NOT NULL REFERENCES public.vendor_profiles(id) ON DELETE RESTRICT,
  stable_key text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  updated_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_vendor_scope_fk FOREIGN KEY (organization_id, vendor_profile_id)
    REFERENCES public.vendor_profiles (organization_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX products_vendor_stable_key_uq
  ON public.products (vendor_profile_id, stable_key);
CREATE INDEX products_organization_status_idx
  ON public.products (organization_id, status);
ALTER TABLE public.products
  ADD CONSTRAINT products_stable_key_ck CHECK (stable_key ~ '^[a-z][a-z0-9_]{0,99}$');
ALTER TABLE public.products
  ADD CONSTRAINT products_name_ck CHECK (length(btrim(name)) BETWEEN 1 AND 200);
ALTER TABLE public.products
  ADD CONSTRAINT products_status_ck
  CHECK (status IN ('draft', 'active', 'retired', 'archived'));
ALTER TABLE public.products
  ADD CONSTRAINT products_revision_ck CHECK (revision > 0);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  normalized_email text,
  phone text,
  title text,
  status text NOT NULL DEFAULT 'active',
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  updated_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX contacts_organization_id_id_uq
  ON public.contacts (organization_id, id);
CREATE UNIQUE INDEX contacts_organization_email_uq
  ON public.contacts (organization_id, normalized_email)
  WHERE normalized_email IS NOT NULL AND status <> 'archived';
CREATE INDEX contacts_organization_status_idx
  ON public.contacts (organization_id, status);
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_name_ck CHECK (length(btrim(full_name)) BETWEEN 1 AND 200);
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_email_ck
  CHECK (normalized_email IS NULL OR normalized_email = lower(btrim(normalized_email)));
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_status_ck
  CHECK (status IN ('active', 'inactive', 'archived'));
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_revision_ck CHECK (revision > 0);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
  relationship_type text NOT NULL,
  subject_organization_id uuid REFERENCES public.orgs(id) ON DELETE RESTRICT,
  subject_contact_id uuid REFERENCES public.contacts(id) ON DELETE RESTRICT,
  related_organization_id uuid REFERENCES public.orgs(id) ON DELETE RESTRICT,
  related_contact_id uuid REFERENCES public.contacts(id) ON DELETE RESTRICT,
  owner_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  influence text NOT NULL DEFAULT 'unknown',
  preference text,
  status text NOT NULL DEFAULT 'active',
  created_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  updated_by_identity_id uuid REFERENCES public.identities(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationships_subject_contact_scope_fk FOREIGN KEY (organization_id, subject_contact_id)
    REFERENCES public.contacts (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT relationships_related_contact_scope_fk FOREIGN KEY (organization_id, related_contact_id)
    REFERENCES public.contacts (organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX relationships_organization_status_idx
  ON public.relationships (organization_id, status);
CREATE INDEX relationships_owner_idx ON public.relationships (owner_identity_id, status);
ALTER TABLE public.relationships
  ADD CONSTRAINT relationships_type_ck
  CHECK (relationship_type IN ('customer_vendor', 'customer_contact', 'vendor_contact', 'partner', 'other'));
ALTER TABLE public.relationships
  ADD CONSTRAINT relationships_endpoint_ck
  CHECK (((subject_organization_id IS NOT NULL)::integer + (subject_contact_id IS NOT NULL)::integer = 1)
    AND ((related_organization_id IS NOT NULL)::integer + (related_contact_id IS NOT NULL)::integer = 1)
    AND (subject_organization_id IS NULL OR related_organization_id IS NULL OR subject_organization_id <> related_organization_id)
    AND (subject_contact_id IS NULL OR related_contact_id IS NULL OR subject_contact_id <> related_contact_id));
ALTER TABLE public.relationships
  ADD CONSTRAINT relationships_influence_ck
  CHECK (influence IN ('unknown', 'low', 'medium', 'high'));
ALTER TABLE public.relationships
  ADD CONSTRAINT relationships_status_ck
  CHECK (status IN ('active', 'paused', 'ended', 'archived'));
ALTER TABLE public.relationships
  ADD CONSTRAINT relationships_revision_ck CHECK (revision > 0);
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

-- New CRM tables have no raw role access until reviewed policies and commands exist.
REVOKE ALL ON TABLE public.customer_profiles, public.vendor_profiles, public.products,
  public.contacts, public.relationships FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
CREATE POLICY r1_deny_anon_authenticated_customer_profiles ON public.customer_profiles
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_vendor_profiles ON public.vendor_profiles
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_products ON public.products
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_contacts ON public.contacts
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY r1_deny_anon_authenticated_relationships ON public.relationships
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.customer_profiles IS 'R2B organization-scoped customer CRM profile. Writes require an audited command.';
COMMENT ON TABLE public.vendor_profiles IS 'R2B organization-scoped vendor CRM profile. Commercial metadata requires later approval workflow.';
COMMENT ON TABLE public.products IS 'R2B vendor-owned product catalog record with immutable ownership scope.';
COMMENT ON TABLE public.contacts IS 'R2B organization-scoped contact record. Contact fields are private by default.';
COMMENT ON TABLE public.relationships IS 'R2B organization-scoped relationship record. Endpoint changes require history and audit support.';
