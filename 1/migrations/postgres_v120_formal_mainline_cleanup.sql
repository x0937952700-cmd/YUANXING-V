-- Yuanxing formal mainline cleanup metadata.
-- Safe, additive migration: no data deletion, no renderer/function overlay.
CREATE TABLE IF NOT EXISTS app_mainline_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO app_mainline_metadata(key, value, updated_at) VALUES
  ('mainline_version','119-formal-services',CURRENT_TIMESTAMP),
  ('service_names','product_service,customer_service,warehouse_service,shipping_service,audit_service,sync_service',CURRENT_TIMESTAMP),
  ('renderer_policy','single-renderer-per-page; no interval-or-mutation-observer-button-patching',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP;
