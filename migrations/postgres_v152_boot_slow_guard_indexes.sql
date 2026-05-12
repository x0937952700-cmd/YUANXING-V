-- V152 boot/slow-page guard indexes. Safe to run multiple times.
CREATE INDEX IF NOT EXISTS idx_operation_log_status_created_at ON operation_log(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_log_action_created_at ON operation_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_events_created_at ON sync_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_today_changes_created_at ON today_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_records_created_at ON shipping_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_records_customer_created_at ON shipping_records(customer_uid, created_at DESC);
