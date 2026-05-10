-- YUANXING V98 PostgreSQL safe migration
-- Non-destructive: never truncates, drops, rebuilds, or reorders warehouse_cells.
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;
CREATE INDEX IF NOT EXISTS ix_yx_v98_wh_lookup ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_yx_v98_wh_visible ON warehouse_cells(zone, column_index, slot_number) WHERE COALESCE(is_deleted,0)=0;
