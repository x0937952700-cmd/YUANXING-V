-- V183 warehouse stability: safe lookup indexes only.
-- Supports slot insert/delete/drag flows after draining same-column autosave chains.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_v183
  ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_active_v183
  ON warehouse_cells(zone, column_index)
  WHERE COALESCE(is_deleted, 0) = 0;
