-- V170 warehouse stability mainfix
-- Keep existing speed/cache architecture. Only reinforce warehouse operation idempotency/readback indexes.
CREATE TABLE IF NOT EXISTS operation_log (
  operation_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  request_json TEXT,
  response_json TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_operation_log_action_updated ON operation_log(action, updated_at);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_deleted ON warehouse_cells(zone, column_index, is_deleted);
