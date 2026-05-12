-- V115 warehouse restore / stable slot migration
-- Non-destructive: no DROP, no TRUNCATE, no DELETE from warehouse_cells.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouse_cells (
  id SERIAL PRIMARY KEY,
  zone TEXT DEFAULT 'A',
  column_index INTEGER DEFAULT 1,
  slot_type TEXT DEFAULT 'direct',
  slot_number INTEGER DEFAULT 1,
  items_json TEXT DEFAULT '[]',
  note TEXT DEFAULT '',
  updated_at TEXT,
  is_deleted INTEGER DEFAULT 0,
  problem_flag TEXT DEFAULT ''
);

ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'A';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS column_index INTEGER DEFAULT 1;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_type TEXT DEFAULT 'direct';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_number INTEGER DEFAULT 1;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_yx_v115_wh_key ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_yx_v115_wh_visible ON warehouse_cells(zone, column_index, is_deleted);

-- Restore product cells accidentally hidden by old slot experiments.
UPDATE warehouse_cells
SET is_deleted = 0
WHERE COALESCE(items_json, '') NOT IN ('', '[]', 'null')
  AND COALESCE(is_deleted, 0) <> 0;

INSERT INTO schema_migrations(version) VALUES('V115_warehouse_restore_stable')
ON CONFLICT (version) DO NOTHING;
