-- V171 warehouse stability mainfix
-- Idempotent safety migration for warehouse readback and background-save operation lookup.
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_v171
  ON warehouse_cells(zone, column_index, slot_type, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_visible_v171
  ON warehouse_cells(zone, column_index, slot_number)
  WHERE COALESCE(is_deleted, 0) = 0;
CREATE TABLE IF NOT EXISTS yx_operations (
  operation_id TEXT PRIMARY KEY,
  operation_type TEXT,
  payload_json TEXT,
  response_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_yx_operations_type_created_v171
  ON yx_operations(operation_type, created_at);
