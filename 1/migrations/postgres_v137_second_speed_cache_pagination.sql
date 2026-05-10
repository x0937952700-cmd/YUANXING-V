-- V137 second speed/cache pack: extra indexes for faster list, shipping, and today changes.
CREATE INDEX IF NOT EXISTS idx_inventory_updated_id ON inventory(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_updated_id ON orders(customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_updated_id ON master_orders(customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_records_shipped_id ON shipping_records(shipped_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created_id ON logs(created_at DESC, id DESC);
