-- V126 warehouse context menu persistence fix
-- Purpose:
-- 1) right-click/long-press insert adds below clicked slot and persists;
-- 2) batch insert/delete uses the clicked slot as anchor;
-- 3) old unique indexes/constraints no longer block safe compact rewrites.

ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

DROP INDEX IF EXISTS ux_warehouse_cells_zone_band_row_name_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_col_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_column_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_column_direct_slot;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ux_warehouse_cells_zone_band_row_name_slot') THEN
    ALTER TABLE warehouse_cells DROP CONSTRAINT ux_warehouse_cells_zone_band_row_name_slot;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ux_warehouse_cells_zone_col_slot') THEN
    ALTER TABLE warehouse_cells DROP CONSTRAINT ux_warehouse_cells_zone_col_slot;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ux_warehouse_cells_zone_column_slot') THEN
    ALTER TABLE warehouse_cells DROP CONSTRAINT ux_warehouse_cells_zone_column_slot;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ux_warehouse_cells_zone_column_direct_slot') THEN
    ALTER TABLE warehouse_cells DROP CONSTRAINT ux_warehouse_cells_zone_column_direct_slot;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_v126_warehouse_cells_visible_lookup
  ON warehouse_cells(zone, column_index, slot_type, slot_number)
  WHERE COALESCE(is_deleted,0)=0;

CREATE TABLE IF NOT EXISTS schema_migrations(
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(version)
VALUES('126_warehouse_context_insert_persistence')
ON CONFLICT (version) DO NOTHING;
