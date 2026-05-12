-- V185 warehouse stability: keep DB indexes aligned with stable warehouse operations.
-- Safe to run repeatedly on PostgreSQL.
CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_cells_zone_col_slot_v185
ON warehouse_cells(zone, column_index, slot_type, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_active_v185
ON warehouse_cells(zone, column_index, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;
