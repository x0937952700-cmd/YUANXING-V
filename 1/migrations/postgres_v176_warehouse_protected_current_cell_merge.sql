-- V176 warehouse stability marker only.
-- Front-end protects the current editing/saving cell from stale column readback overwrites.
-- No table rebuild, no polling, no renderer changes.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_v176_lookup
ON warehouse_cells (zone, column_index, slot_number);
