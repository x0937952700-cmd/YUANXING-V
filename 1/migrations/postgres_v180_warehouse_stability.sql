-- V180 warehouse stability: safe lookup indexes for mark/return/autosave guard
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_v180
  ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_not_deleted_v180
  ON warehouse_cells(zone, column_index)
  WHERE COALESCE(is_deleted, 0) = 0;
