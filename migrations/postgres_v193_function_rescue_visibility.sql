-- V193 function rescue safety: customer relation counts / shipping lookup / today display support.
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS customer_uid TEXT;
CREATE INDEX IF NOT EXISTS idx_v193_orders_customer_lookup ON orders(customer_name, customer_uid);
CREATE INDEX IF NOT EXISTS idx_v193_master_customer_lookup ON master_orders(customer_name, customer_uid);
CREATE INDEX IF NOT EXISTS idx_v193_inventory_customer_lookup ON inventory(customer_name, customer_uid);
CREATE INDEX IF NOT EXISTS idx_v193_shipping_customer_lookup ON shipping_records(customer_name, customer_uid);
CREATE INDEX IF NOT EXISTS idx_v193_logs_created_at ON logs(created_at);
