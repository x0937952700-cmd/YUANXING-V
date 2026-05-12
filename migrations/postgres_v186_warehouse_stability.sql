-- V186 warehouse stability: safe indexes only, no destructive schema changes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_cells_zone_col_slot_v186
ON warehouse_cells (zone, column_index, slot_type, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_active_v186
ON warehouse_cells (zone, column_index, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;
