-- V150 network payload speed pack
-- Server-side gzip is handled in Flask after_request. This migration adds lightweight indexes used by performance diagnostics.
CREATE INDEX IF NOT EXISTS idx_operation_log_created_at_v150 ON operation_log(created_at) WHERE created_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_events_created_at_v150 ON sync_events(created_at) WHERE created_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_today_changes_created_at_v150 ON today_changes(created_at) WHERE created_at IS NOT NULL;
