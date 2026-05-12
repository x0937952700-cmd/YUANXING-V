-- V173 warehouse stability safe migration
-- Keeps existing speed/cache architecture intact. Adds only safe indexes used by warehouse slot lookup/save paths.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_active
  ON warehouse_cells(zone, column_index, slot_number)
  WHERE COALESCE(is_deleted, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_active
  ON warehouse_cells(zone, column_index)
  WHERE COALESCE(is_deleted, 0) = 0;
