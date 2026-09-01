-- Repair role-activation authority rows when the original migration recorded
-- the audit event and activation timestamp in separate clock calls.
INSERT INTO public.role_authority_records(
  record_kind, authority_kind, role_definition_id, activated_at,
  correlation_id, created_at
)
SELECT 'role_activation', 'reviewed_owner', role.id, role.activated_at,
  event.correlation_id, role.activated_at
FROM public.role_definitions role
JOIN LATERAL (
  SELECT audit.correlation_id
  FROM public.audit_events audit
  WHERE audit.actor_type = 'migration'
    AND audit.action = 'role_version.activate'
    AND audit.entity_type = 'role_definition'
    AND audit.entity_id = role.id::text
    AND audit.after_summary ->> 'stable_key' = role.stable_key
    AND audit.after_summary ->> 'version' = role.version::text
    AND audit.after_summary ->> 'state' = 'active'
    AND audit.occurred_at BETWEEN role.activated_at - interval '1 millisecond'
      AND role.activated_at + interval '1 millisecond'
  ORDER BY abs(extract(epoch FROM (audit.occurred_at - role.activated_at))), audit.id
  LIMIT 1
) event ON true
WHERE role.state = 'active'
  AND role.approved_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.role_authority_records authority
    WHERE authority.record_kind = 'role_activation'
      AND authority.role_definition_id = role.id
      AND authority.activated_at = role.activated_at
  );
