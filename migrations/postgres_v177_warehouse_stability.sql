-- V177 warehouse stability safe migration
-- Keeps warehouse cell lookup fast and idempotent without changing existing data.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_v177
ON warehouse_cells (zone, column_index, slot_number);

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_not_deleted_v177
ON warehouse_cells (zone, column_index, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;
