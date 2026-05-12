-- V212: keep shipping source and warehouse deduction consistency fast and idempotent.
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS source_table TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS before_qty INTEGER DEFAULT 0;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS after_qty INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_shipping_source_customer_v212 ON shipping_records(customer_name, source_table, shipped_at);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_updated_v212 ON warehouse_cells(updated_at);
