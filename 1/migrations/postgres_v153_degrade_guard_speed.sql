-- V153 adaptive degrade guard / speed diagnostics
-- Front-end focused package; database change is intentionally limited to safe indexes.
CREATE INDEX IF NOT EXISTS idx_inventory_updated_at_v153 ON inventory(updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at_v153 ON orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_master_orders_updated_at_v153 ON master_orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_shipping_records_created_at_v153 ON shipping_records(created_at);
CREATE INDEX IF NOT EXISTS idx_today_changes_created_at_v153 ON today_changes(created_at);
