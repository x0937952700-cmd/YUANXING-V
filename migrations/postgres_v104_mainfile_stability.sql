-- YUANXING V104 PostgreSQL safe migration
-- Non-destructive: preserves warehouse_cells, only repairs missing columns/indexes.
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;
CREATE INDEX IF NOT EXISTS ix_yx_v104_wh_lookup ON warehouse_cells(zone, column_index, slot_number);
INSERT INTO schema_migrations(version) VALUES('V104_mainfile_stability')
ON CONFLICT (version) DO NOTHING;
