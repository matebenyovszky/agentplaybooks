-- Match the official self-hosted Supabase password wiring so GoTrue and
-- PostgREST can authenticate as the reserved roles the postgres image creates.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_admin WITH PASSWORD :'pgpass';
