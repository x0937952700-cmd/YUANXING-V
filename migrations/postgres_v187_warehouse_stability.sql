-- V187 warehouse stability: safe indexes only, no destructive schema changes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_cells_zone_col_slot_v187
ON warehouse_cells (zone, column_index, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_active_v187
ON warehouse_cells (zone, column_index, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;
