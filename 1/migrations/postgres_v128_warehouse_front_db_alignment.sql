-- V128 warehouse front-end / database alignment
DO $$
DECLARE r RECORD;
BEGIN
  IF to_regclass('public.warehouse_cells') IS NOT NULL THEN
    FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='warehouse_cells'::regclass AND contype='u' LOOP
      IF lower(r.conname) LIKE '%warehouse%' OR lower(r.conname) LIKE '%zone%' OR lower(r.conname) LIKE '%slot%' OR lower(r.conname) LIKE '%column%' THEN
        EXECUTE format('ALTER TABLE warehouse_cells DROP CONSTRAINT IF EXISTS %I', r.conname);
      END IF;
    END LOOP;
    FOR r IN SELECT indexname FROM pg_indexes WHERE tablename='warehouse_cells' AND indexdef ILIKE '%UNIQUE%' LOOP
      IF lower(r.indexname) LIKE '%warehouse%' OR lower(r.indexname) LIKE '%zone%' OR lower(r.indexname) LIKE '%slot%' OR lower(r.indexname) LIKE '%column%' THEN
        EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
      END IF;
    END LOOP;
    ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
    ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
    ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS operation_id TEXT;
    ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
    CREATE INDEX IF NOT EXISTS ix_yx128_wh_cells_position ON warehouse_cells(zone,column_index,slot_number);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS warehouse_column_meta (
  zone TEXT NOT NULL,
  column_index INTEGER NOT NULL,
  visible_count INTEGER NOT NULL DEFAULT 20,
  updated_at TEXT,
  PRIMARY KEY(zone, column_index)
);

CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
INSERT INTO schema_migrations(version) VALUES('128_warehouse_front_db_alignment') ON CONFLICT (version) DO NOTHING;
