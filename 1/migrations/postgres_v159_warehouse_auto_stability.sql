-- V159 warehouse auto-stability
-- Keeps warehouse move/add/delete flows aligned with canonical visible-slot indexes.
CREATE INDEX IF NOT EXISTS ix_v159_warehouse_cells_zone_col_slot
ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_v159_warehouse_cells_updated
ON warehouse_cells(updated_at);
