-- V154 DB/request guard. No destructive schema changes.
-- Keep speed-related indexes idempotent and safe.
CREATE INDEX IF NOT EXISTS idx_inventory_updated_at_v154 ON inventory(updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at_v154 ON orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_master_orders_updated_at_v154 ON master_orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_shipping_records_updated_at_v154 ON shipping_records(updated_at);
CREATE INDEX IF NOT EXISTS idx_today_changes_created_at_v154 ON today_changes(created_at);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_updated_at_v154 ON warehouse_cells(updated_at);
