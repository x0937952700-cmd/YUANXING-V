-- V129 warehouse canonical persistence
-- Purpose: make every warehouse right-click/long-press action and cell item save persist in DB.
-- Key fix: no more arbitrary DROP CONSTRAINT/DROP INDEX during user operations. PostgreSQL marks
-- the whole transaction aborted after a failed DDL, which caused front-end changes to roll back.

ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;

CREATE TABLE IF NOT EXISTS warehouse_column_meta (
  zone TEXT NOT NULL,
  column_index INTEGER NOT NULL,
  visible_count INTEGER NOT NULL DEFAULT 20,
  updated_at TEXT,
  PRIMARY KEY(zone, column_index)
);

CREATE TABLE IF NOT EXISTS warehouse_cell_items (
  id SERIAL PRIMARY KEY,
  cell_id INTEGER NOT NULL,
  zone TEXT,
  column_index INTEGER,
  slot_number INTEGER,
  source_table TEXT,
  source_id TEXT,
  customer_name TEXT,
  product_text TEXT,
  material TEXT,
  qty INTEGER DEFAULT 0,
  placement_label TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_yx129_wh_cells_position ON warehouse_cells(zone,column_index,slot_number);
CREATE INDEX IF NOT EXISTS ix_yx129_wh_cells_visible ON warehouse_cells(zone,column_index,slot_number) WHERE COALESCE(is_deleted,0)=0;
CREATE INDEX IF NOT EXISTS ix_yx129_wh_items_cell ON warehouse_cell_items(cell_id);
CREATE INDEX IF NOT EXISTS ix_yx129_wh_items_lookup ON warehouse_cell_items(zone,column_index,slot_number);

CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
INSERT INTO schema_migrations(version) VALUES('129_warehouse_canonical_persistence') ON CONFLICT (version) DO NOTHING;
