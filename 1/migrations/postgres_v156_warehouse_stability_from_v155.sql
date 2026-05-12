-- V156 warehouse stability from V155
-- No destructive schema change.  Keeps speed/cache/freeze guards intact.
-- Adds/keeps indexes that make warehouse readback and action status fast.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_v156_live_column
ON warehouse_cells(zone, column_index, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_v156_cell
ON warehouse_cell_items(cell_id);

CREATE INDEX IF NOT EXISTS idx_operation_log_v156_operation
ON operation_log(operation_id);
