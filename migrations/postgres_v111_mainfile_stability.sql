-- V111 mainfile stability safe migration
-- Non-destructive marker only: do not clear, rebuild, normalize, or reorder warehouse_cells.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO schema_migrations(version) VALUES('V111_mainfile_stability')
ON CONFLICT (version) DO NOTHING;
