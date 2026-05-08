-- V119 batch4 商用收尾：備份驗證、smoke test、operation log 整理、安全索引

CREATE TABLE IF NOT EXISTS shipping_preview_snapshots (
    preview_token TEXT PRIMARY KEY,
    request_json TEXT,
    response_json TEXT,
    customer_name TEXT,
    operation_id TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT,
    module TEXT,
    message TEXT,
    payload_json TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS backup_audit (
    id BIGSERIAL PRIMARY KEY,
    filename TEXT,
    action TEXT,
    success INTEGER DEFAULT 0,
    detail_json TEXT,
    username TEXT,
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_operation_log_status_updated ON operation_log(status, updated_at);
CREATE INDEX IF NOT EXISTS ix_warehouse_cell_items_cell ON warehouse_cell_items(cell_id);
CREATE INDEX IF NOT EXISTS ix_warehouse_cells_lookup_final ON warehouse_cells(zone, column_index, slot_number, is_deleted);
CREATE INDEX IF NOT EXISTS ix_shipping_records_customer_time_final ON shipping_records(customer_name, created_at);
CREATE INDEX IF NOT EXISTS ix_sync_events_module_created ON sync_events(module, created_at);
CREATE INDEX IF NOT EXISTS ix_audit_trails_entity_time_final ON audit_trails(entity_type, created_at);
