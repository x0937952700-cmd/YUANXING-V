-- V119 batch3 / v121: speed, SSE, ship preview, health checks
CREATE TABLE IF NOT EXISTS ship_preview_snapshots (
  token TEXT PRIMARY KEY,
  customer_name TEXT,
  payload JSONB,
  operator TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_yx121_logs_created ON logs(created_at);
CREATE INDEX IF NOT EXISTS ix_yx121_ship_customer_time ON shipping_records(customer_name, shipped_at);
CREATE INDEX IF NOT EXISTS ix_yx121_wh_version ON warehouse_cells(version);
