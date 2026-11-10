-- Custom SQL migration file, put your code below! --
-- Repair the earlier audit value without changing the masked assessment state.
DO $migration$
DECLARE
  definition text;
  old_value constant text := $old$jsonb_build_object('version',1,'state','masked'),context.authorization_time$old$;
  new_value constant text := $new$jsonb_build_object('version',1,'state','completed'),context.authorization_time$new$;
  old_count integer;
  new_count integer;
BEGIN
  SELECT pg_get_functiondef('public.mmhr_create_initial_evaluation(jsonb,uuid,uuid)'::regprocedure)
    INTO STRICT definition;
  old_count := (length(definition) - length(replace(definition, old_value, ''))) / length(old_value);
  new_count := (length(definition) - length(replace(definition, new_value, ''))) / length(new_value);

  IF old_count = 1 AND new_count = 0 THEN
    EXECUTE replace(definition, old_value, new_value);
  ELSIF old_count <> 0 OR new_count <> 1 THEN
    RAISE EXCEPTION 'Initial evaluation audit baseline requires review';
  END IF;
END
$migration$;
