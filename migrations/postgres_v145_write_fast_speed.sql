-- V145 write-fast speed stability
-- This migration is intentionally light: it adds safe indexes for fast post-write refreshes.
CREATE INDEX IF NOT EXISTS idx_inventory_updated_at_id_v145 ON inventory(updated_at, id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_updated_id_v145 ON orders(customer_name, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_updated_id_v145 ON master_orders(customer_name, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_shipping_records_created_id_v145 ON shipping_records(created_at, id);
CREATE INDEX IF NOT EXISTS idx_today_changes_created_id_v145 ON today_changes(created_at, id);
