-- YUANXING V103 PostgreSQL safe migration
-- Non-destructive: never clears or rebuilds warehouse_cells.
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW());

ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;

CREATE INDEX IF NOT EXISTS ix_warehouse_cells_v103_lookup
  ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_warehouse_cells_v103_visible
  ON warehouse_cells(zone, column_index, slot_number, is_deleted);

INSERT INTO schema_migrations(version) VALUES('V103_fast_stable_safe')
ON CONFLICT (version) DO NOTHING;
