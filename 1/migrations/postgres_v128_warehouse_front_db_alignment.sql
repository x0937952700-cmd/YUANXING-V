-- V128 warehouse front-end / database alignment
-- Revised by V129: do not drop arbitrary warehouse unique indexes at runtime/migration time.
-- The canonical writer moves rows through row-id-specific temporary columns, so old unique
-- constraints no longer need to be dropped to save right-click/long-press actions.

ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS ix_yx128_wh_cells_position
  ON warehouse_cells(zone,column_index,slot_number);

CREATE TABLE IF NOT EXISTS warehouse_column_meta (
  zone TEXT NOT NULL,
  column_index INTEGER NOT NULL,
  visible_count INTEGER NOT NULL DEFAULT 20,
  updated_at TEXT,
  PRIMARY KEY(zone, column_index)
);

CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
INSERT INTO schema_migrations(version) VALUES('128_warehouse_front_db_alignment_safe') ON CONFLICT (version) DO NOTHING;
