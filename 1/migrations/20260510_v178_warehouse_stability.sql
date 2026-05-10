-- V178 warehouse stability: safe helper indexes only; no schema-breaking change.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_active
ON warehouse_cells(zone, column_index, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_updated_at
ON warehouse_cells(updated_at);
