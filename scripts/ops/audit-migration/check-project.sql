-- Second line of defense after check-project.sh (which sees the URI).
-- Production target: heap project zcphxfospbvqplonkvco.
-- Retired project bydcjwxfiiolmnddzbpy is forbidden.
-- Local rehearsal (role ubuntu/postgres, no project ref in session identity) is allowed.

DO $$
DECLARE
  ident text := concat_ws(
    ' ',
    session_user,
    current_user,
    current_database(),
    current_setting('application_name', true)
  );
BEGIN
  IF ident ILIKE '%bydcjwxfiiolmnddzbpy%' THEN
    RAISE EXCEPTION
      'NO-GO: session identity includes retired project bydcjwxfiiolmnddzbpy. Target is heap project zcphxfospbvqplonkvco. Abort.';
  END IF;
  IF ident ILIKE '%zcphxfospbvqplonkvco%' THEN
    RAISE NOTICE 'Session identity includes heap project zcphxfospbvqplonkvco — OK';
  ELSE
    RAISE NOTICE
      'Target production project is zcphxfospbvqplonkvco. Session identity has no Supabase project ref (typical for local rehearsal or role postgres). The URI check in check-project.sh is authoritative for production.';
  END IF;
END
$$;
