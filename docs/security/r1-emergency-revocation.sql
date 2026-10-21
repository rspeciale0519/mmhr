-- R1.4 emergency revocation. Run as the migration owner on the affected
-- environment after recording the change ticket and current evidence.
-- These statements revoke Data API access without disabling RLS.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- If exact function revocation is not sufficient, stop the affected Data API
-- service through the platform control plane, then disable the route.
