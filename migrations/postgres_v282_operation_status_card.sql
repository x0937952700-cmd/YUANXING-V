-- v282 operation status card support: keep operation_log lookup fast without changing UI/cache architecture.
CREATE INDEX IF NOT EXISTS idx_operation_log_updated_at ON operation_log(updated_at);
CREATE INDEX IF NOT EXISTS idx_operation_log_action_status ON operation_log(action, status);
