-- Synthetic regression probe for OrioleDB #639 / #652.
-- No existing table is touched. Both data and DDL are rolled back.
BEGIN;
CREATE TABLE public._apbks_heap_oauth_probe (
  id uuid PRIMARY KEY,
  user_id uuid,
  authorization_code text UNIQUE
) USING heap;
ALTER TABLE public._apbks_heap_oauth_probe ENABLE ROW LEVEL SECURITY;
INSERT INTO public._apbks_heap_oauth_probe (id) VALUES (gen_random_uuid());
WITH updated AS (
  UPDATE public._apbks_heap_oauth_probe
  SET user_id = gen_random_uuid()
  WHERE authorization_code IS NULL
  RETURNING user_id
)
SELECT count(*) AS updated_rows, bool_and(user_id IS NOT NULL) AS user_assignment_ok,
       current_setting('default_table_access_method') AS default_access_method
FROM updated;
ROLLBACK;
