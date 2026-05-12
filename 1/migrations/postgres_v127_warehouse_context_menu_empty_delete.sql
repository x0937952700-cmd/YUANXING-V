-- V127 warehouse context menu persistence repair
-- 1) remove old unique constraints/indexes that block compact slot rewrites
-- 2) keep non-unique lookup indexes only
-- Safe to run multiple times.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'warehouse_cells'::regclass
      AND contype = 'u'
      AND conname IN (
        'ux_warehouse_cells_zone_band_row_name_slot',
        'ux_warehouse_cells_zone_col_slot',
        'ux_warehouse_cells_zone_column_slot',
        'ux_warehouse_cells_zone_column_direct_slot'
      )
  LOOP
    EXECUTE format('ALTER TABLE warehouse_cells DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

DROP INDEX IF EXISTS ux_warehouse_cells_zone_band_row_name_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_col_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_column_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_column_direct_slot;

ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS operation_id TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_yx_v127_wh_lookup ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_yx_v127_wh_visible ON warehouse_cells(zone, column_index, is_deleted);

INSERT INTO schema_migrations(version, applied_at)
VALUES('127_warehouse_context_menu_empty_delete', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;
