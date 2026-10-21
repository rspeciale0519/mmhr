-- R3 organization-scoped workspace comment command boundary.

CREATE OR REPLACE FUNCTION public.mmhr_add_workspace_comment(payload jsonb, correlation_id uuid, idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  context record;
  receipt jsonb;
  v_comment_id uuid;
  v_workspace_id uuid;
  v_organization_id uuid;
  v_actor_id uuid;
  v_visibility text;
  v_body text;
  v_comment public.workspace_comments%ROWTYPE;
BEGIN
  IF jsonb_typeof(payload) <> 'object' OR correlation_id IS NULL OR idempotency_key IS NULL
    OR coalesce(payload->>'commentId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'workspaceId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'organizationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'actorIdentityId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'correlationId','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'idempotencyKey','') !~ '^[0-9a-fA-F-]{36}$'
    OR coalesce(payload->>'visibility','') NOT IN ('customer', 'internal')
    OR length(btrim(coalesce(payload->>'body',''))) NOT BETWEEN 1 AND 5000
  THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid workspace comment input'; END IF;
  v_comment_id := (payload->>'commentId')::uuid;
  v_workspace_id := (payload->>'workspaceId')::uuid;
  v_organization_id := (payload->>'organizationId')::uuid;
  v_actor_id := (payload->>'actorIdentityId')::uuid;
  v_visibility := payload->>'visibility';
  v_body := btrim(payload->>'body');
  SELECT * INTO context FROM mmhr_private.r1_start_security_command('workspace.access', v_organization_id, 'Add workspace comment', correlation_id, idempotency_key);
  IF v_actor_id <> context.actor_identity_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
  receipt := mmhr_private.r1_checked_receipt(context.actor_identity_id, 'r3.workspace.comment', idempotency_key, payload);
  IF receipt IS NOT NULL THEN
    SELECT * INTO v_comment FROM public.workspace_comments AS c WHERE c.id = (receipt->>'entity_id')::uuid AND c.organization_id = v_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied'; END IF;
    RETURN jsonb_build_object('commentId', v_comment.id, 'workspaceId', v_comment.workspace_id, 'organizationId', v_comment.organization_id, 'authorIdentityId', v_comment.author_identity_id, 'visibility', v_comment.visibility, 'body', v_comment.body, 'createdAt', v_comment.created_at, 'correlationId', v_comment.correlation_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces AS w WHERE w.id = v_workspace_id AND w.organization_id = v_organization_id) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Workspace comment denied'; END IF;
  INSERT INTO public.workspace_comments (id, organization_id, workspace_id, author_identity_id, visibility, body, correlation_id)
  VALUES (v_comment_id, v_organization_id, v_workspace_id, v_actor_id, v_visibility, v_body, correlation_id)
  RETURNING * INTO v_comment;
  PERFORM mmhr_private.r1_finish_security_command(context.actor_identity_id, 'r3.workspace.comment', 'workspace.comment', 'workspace_comment', v_comment.id, v_organization_id, 'Add workspace comment', correlation_id, idempotency_key, payload, jsonb_build_object('version', 1), jsonb_build_object('version', 1, 'state', 'completed'), context.authorization_time);
  RETURN jsonb_build_object('commentId', v_comment.id, 'workspaceId', v_comment.workspace_id, 'organizationId', v_comment.organization_id, 'authorIdentityId', v_comment.author_identity_id, 'visibility', v_comment.visibility, 'body', v_comment.body, 'createdAt', v_comment.created_at, 'correlationId', v_comment.correlation_id);
END
$$;
REVOKE ALL ON FUNCTION public.mmhr_add_workspace_comment(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role, mmhr_worker;
GRANT EXECUTE ON FUNCTION public.mmhr_add_workspace_comment(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.mmhr_add_workspace_comment(jsonb, uuid, uuid) IS 'R3 organization-scoped audited workspace comment command.';
