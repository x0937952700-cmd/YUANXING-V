-- V188 warehouse stability guard
-- Safe/idempotent migration: keeps warehouse lookup fast and supports slot operations without changing existing data.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_v188
ON warehouse_cells (zone, column_index, slot_number);
