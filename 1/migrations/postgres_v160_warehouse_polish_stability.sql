-- V160 warehouse polish stability
-- Conservative migration: keeps existing speed/cache architecture and adds indexes
-- used by warehouse readback, dropdown sync, and action diagnostics.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_v160_visible_column
ON warehouse_cells(zone, column_index, slot_type, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_v160_cell
ON warehouse_cell_items(cell_id);

CREATE INDEX IF NOT EXISTS idx_operation_log_v160_warehouse_recent
ON operation_log(action, created_at DESC)
WHERE action LIKE 'warehouse_%';
