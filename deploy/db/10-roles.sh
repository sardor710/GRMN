#!/bin/bash
# Task 23 G4: separate credentials (plan Section 11). Runs once, at database initialisation.
#   grmn_migrate owns the schema and runs migrations (DDL);
#   grmn_app is the runtime role: data access only, no DDL, no ownership.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v migrate_pw="$GRMN_MIGRATE_PASSWORD" -v app_pw="$GRMN_APP_PASSWORD" <<'SQL'
CREATE ROLE grmn_migrate LOGIN PASSWORD :'migrate_pw';
CREATE ROLE grmn_app LOGIN PASSWORD :'app_pw';
ALTER DATABASE grmn OWNER TO grmn_migrate;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO grmn_migrate;
GRANT USAGE ON SCHEMA public TO grmn_app;
-- Every table, sequence and function the migration role creates is usable by the app role.
ALTER DEFAULT PRIVILEGES FOR ROLE grmn_migrate IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO grmn_app;
ALTER DEFAULT PRIVILEGES FOR ROLE grmn_migrate IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO grmn_app;
ALTER DEFAULT PRIVILEGES FOR ROLE grmn_migrate IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO grmn_app;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SQL
