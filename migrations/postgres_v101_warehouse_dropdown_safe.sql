-- V101 warehouse add-to-cell/dropdown safety migration
-- Non-destructive: never clears warehouse_cells, never renumbers occupied cells.
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_wh_cells_zone_col_slot_visible
  ON warehouse_cells(zone, column_index, slot_number)
  WHERE COALESCE(is_deleted,0)=0;
