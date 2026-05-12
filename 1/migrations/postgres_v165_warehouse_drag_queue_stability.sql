-- V165 warehouse drag queue stability
-- Frontend/API stability release. No schema change required.
-- Kept as a migration marker so deployment logs can confirm the package version.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO schema_migrations(version) VALUES ('postgres_v165_warehouse_drag_queue_stability')
ON CONFLICT (version) DO NOTHING;
