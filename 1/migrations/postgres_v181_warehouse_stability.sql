-- V181 warehouse stability: safe indexes only; preserves speed/cache architecture.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_v181
  ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_not_deleted_v181
  ON warehouse_cells(zone, column_index) WHERE COALESCE(is_deleted, 0) = 0;
