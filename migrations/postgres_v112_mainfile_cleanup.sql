-- V114 mainfile cleanup / stability marker
-- Non-destructive migration. Do not clear, rebuild, renumber, or rewrite warehouse_cells.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(version) VALUES ('v114_mainfile_cleanup') ON CONFLICT (version) DO NOTHING;

ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;

-- Keep existing warehouse rows untouched. Only add supporting indexes when possible.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_visible_lookup
ON warehouse_cells(zone, column_index, slot_number, is_deleted);
