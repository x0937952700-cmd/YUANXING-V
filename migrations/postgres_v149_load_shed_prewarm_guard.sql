-- V149 load-shed / guarded prewarm support indexes. Safe to run multiple times.
CREATE INDEX IF NOT EXISTS idx_yx_v149_today_changes_created_at ON today_changes(created_at);
CREATE INDEX IF NOT EXISTS idx_yx_v149_operation_status_updated ON operation_log(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_yx_v149_shipping_records_created_at ON shipping_records(created_at);
CREATE INDEX IF NOT EXISTS idx_yx_v149_warehouse_cells_updated_at ON warehouse_cells(updated_at);
