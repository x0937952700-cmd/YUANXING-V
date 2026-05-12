-- V131 warehouse right-click stability / cache / speed
-- Keeps schema compatible and makes long-press writes faster by ensuring supporting columns and indexes exist.
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS operation_id TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_live_column_v131
  ON warehouse_cells(zone, column_index, slot_number)
  WHERE COALESCE(is_deleted,0)=0;
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_cell_v131
  ON warehouse_cell_items(cell_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_updated_v131
  ON operation_log(status, updated_at);
