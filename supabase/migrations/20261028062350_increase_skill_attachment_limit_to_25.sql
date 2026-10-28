-- Keep the database ceiling aligned with ATTACHMENT_LIMITS.MAX_FILES_PER_SKILL.
-- CREATE OR REPLACE preserves the existing trigger and function EXECUTE grants.
CREATE OR REPLACE FUNCTION public.check_attachment_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF (SELECT COUNT(*) FROM public.skill_attachments WHERE skill_id = NEW.skill_id) >= 25 THEN
    RAISE EXCEPTION 'Maximum 25 attachments per skill allowed';
  END IF;
  RETURN NEW;
END;
$function$;
