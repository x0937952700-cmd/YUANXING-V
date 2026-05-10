-- V179 warehouse stability: safe index/constraint helpers only.
-- No destructive changes. Keeps warehouse slot coordinate lookup stable for add/delete/hide/renumber flows.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_v179
ON warehouse_cells (zone, column_index, slot_number);

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_deleted_v179
ON warehouse_cells (zone, column_index, COALESCE(is_deleted, 0));
