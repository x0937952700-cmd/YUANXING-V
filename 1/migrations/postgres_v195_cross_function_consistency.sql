-- V195 cross-function consistency: safe indexes only; no renderer/cache core changes.
CREATE INDEX IF NOT EXISTS idx_orders_customer_name_v195 ON orders(customer_name);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_name_v195 ON master_orders(customer_name);
CREATE INDEX IF NOT EXISTS idx_inventory_customer_name_v195 ON inventory(customer_name);
CREATE INDEX IF NOT EXISTS idx_shipping_records_customer_name_v195 ON shipping_records(customer_name);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_name_v195 ON customer_profiles(name);
