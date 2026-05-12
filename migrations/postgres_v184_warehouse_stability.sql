-- V184 warehouse stability marker.
-- No schema-breaking changes. Keeps existing warehouse unique index aligned for slot readback.
CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_cells_zone_col_slot_v184
ON warehouse_cells (zone, column_index, slot_number)
WHERE COALESCE(is_deleted, 0) = 0;
