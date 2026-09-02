-- R3 organization-scoped workspace snapshot read boundary.

CREATE OR REPLACE FUNCTION public.mmhr_get_workspace_snapshot(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  v_workspace public.workspaces%ROWTYPE;
  v_snapshot public.workspace_snapshots%ROWTYPE;
  v_organization_id uuid;
  v_workspace_id uuid;
  v_actor_id uuid;
BEGIN
  IF jsonb_typeof(payload) <> 'object'
    OR coalesce(payload->>'workspaceId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'correlationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'idempotencyKey','') !~ '^[0-9a-fA-F-]{36}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid workspace snapshot input'; END IF;
  v_workspace_id := (payload->>'workspaceId')::uuid;
  v_organization_id := (payload->>'organizationId')::uuid;
  v_actor_id := (payload->>'actorIdentityId')::uuid;
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Read workspace snapshot', (payload->>'correlationId')::uuid, (payload->>'idempotencyKey')::uuid);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  SELECT * INTO v_workspace FROM public.workspaces AS w WHERE w.id = v_workspace_id AND w.organization_id = v_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Workspace snapshot denied'; END IF;
  SELECT * INTO v_snapshot FROM public.workspace_snapshots AS s WHERE s.workspace_id = v_workspace_id AND s.organization_id = v_organization_id ORDER BY s.revision DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Workspace snapshot unavailable'; END IF;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.workspace.view', 'workspace.view', 'workspace', v_workspace_id, v_organization_id, 'Read workspace snapshot', (payload->>'correlationId')::uuid, (payload->>'idempotencyKey')::uuid, payload, jsonb_build_object('version', v_snapshot.revision), jsonb_build_object('version', v_snapshot.revision, 'state', 'completed'), context.authorization_time);
  RETURN jsonb_build_object('workspaceId', v_workspace.id, 'organizationId', v_workspace.organization_id, 'intakeId', v_workspace.intake_id, 'stage', v_workspace.stage, 'candidateIds', v_snapshot.candidate_ids, 'openTaskIds', v_snapshot.open_task_ids, 'approvalIds', v_snapshot.approval_ids, 'upcomingEventReferences', v_snapshot.upcoming_event_references, 'recentActivityIds', v_snapshot.recent_activity_ids, 'capturedAt', v_snapshot.captured_at, 'revision', v_snapshot.revision, 'correlationId', (payload->>'correlationId')::uuid);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_get_workspace_snapshot(jsonb) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_get_workspace_snapshot(jsonb) TO authenticated;
COMMENT ON FUNCTION public.mmhr_get_workspace_snapshot(jsonb) IS 'R3 organization-scoped workspace snapshot read.';
