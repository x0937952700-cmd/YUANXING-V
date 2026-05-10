-- V110 mainfile stability safe migration
-- Non-destructive: never clears, rebuilds, or reorders warehouse_cells.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(version) VALUES('V110_mainfile_stability')
ON CONFLICT (version) DO NOTHING;

ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;
CREATE INDEX IF NOT EXISTS ix_yx_v110_wh_lookup ON warehouse_cells(zone, column_index, slot_number);
