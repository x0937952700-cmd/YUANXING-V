-- V130 warehouse long-press / right-click DB synchronization
-- Purpose: long-press insert/delete/batch-delete/return/mark and product-save must persist
-- even when older Render PostgreSQL databases still have legacy warehouse coordinates
-- (band, row_name, slot) and old unique indexes/constraints.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_type TEXT DEFAULT 'direct';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_number INTEGER DEFAULT 1;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS column_index INTEGER DEFAULT 1;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'A';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

-- Remove old uniqueness one time during migration if it exists. Runtime code no longer
-- drops constraints during user actions; it synchronizes both new and legacy coordinates.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ux_warehouse_cells_zone_band_row_name_slot') THEN
    ALTER TABLE warehouse_cells DROP CONSTRAINT ux_warehouse_cells_zone_band_row_name_slot;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

DROP INDEX IF EXISTS ux_warehouse_cells_zone_band_row_name_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_col_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_column_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_column_direct_slot;

-- If old coordinate columns are present, align them with the active coordinate system.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='area') THEN
    EXECUTE 'UPDATE warehouse_cells SET area = COALESCE(NULLIF(zone, ''''), ''A'') WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='band') THEN
    EXECUTE 'UPDATE warehouse_cells SET band = COALESCE(NULLIF(column_index,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='section') THEN
    EXECUTE 'UPDATE warehouse_cells SET section = COALESCE(NULLIF(column_index,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='section_index') THEN
    EXECUTE 'UPDATE warehouse_cells SET section_index = COALESCE(NULLIF(column_index,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='col') THEN
    EXECUTE 'UPDATE warehouse_cells SET col = COALESCE(NULLIF(column_index,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='column') THEN
    EXECUTE 'UPDATE warehouse_cells SET "column" = COALESCE(NULLIF(column_index,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='row_name') THEN
    EXECUTE 'UPDATE warehouse_cells SET row_name = COALESCE(NULLIF(slot_type, ''''), ''direct'') WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='row_type') THEN
    EXECUTE 'UPDATE warehouse_cells SET row_type = COALESCE(NULLIF(slot_type, ''''), ''direct'') WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='front_back') THEN
    EXECUTE 'UPDATE warehouse_cells SET front_back = COALESCE(NULLIF(slot_type, ''''), ''direct'') WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='side') THEN
    EXECUTE 'UPDATE warehouse_cells SET side = COALESCE(NULLIF(slot_type, ''''), ''direct'') WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='slot') THEN
    EXECUTE 'UPDATE warehouse_cells SET slot = COALESCE(NULLIF(slot_number,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='slot_no') THEN
    EXECUTE 'UPDATE warehouse_cells SET slot_no = COALESCE(NULLIF(slot_number,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='cell_number') THEN
    EXECUTE 'UPDATE warehouse_cells SET cell_number = COALESCE(NULLIF(slot_number,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='position') THEN
    EXECUTE 'UPDATE warehouse_cells SET position = COALESCE(NULLIF(slot_number,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='pos') THEN
    EXECUTE 'UPDATE warehouse_cells SET pos = COALESCE(NULLIF(slot_number,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='warehouse_cells' AND column_name='no') THEN
    EXECUTE 'UPDATE warehouse_cells SET no = COALESCE(NULLIF(slot_number,0), 1) WHERE COALESCE(is_deleted,0)=0';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_yx130_warehouse_cells_visible_lookup
  ON warehouse_cells(zone, column_index, slot_number, is_deleted);

INSERT INTO schema_migrations(version) VALUES('v130_warehouse_longpress_db_sync')
ON CONFLICT(version) DO NOTHING;
