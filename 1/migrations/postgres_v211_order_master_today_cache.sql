-- V211 cross function cache consistency indexes; safe idempotent migration.
CREATE INDEX IF NOT EXISTS idx_orders_customer_updated_v211 ON orders(customer_name, updated_at);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_updated_v211 ON master_orders(customer_name, updated_at);
CREATE INDEX IF NOT EXISTS idx_shipping_customer_created_v211 ON shipping_records(customer_name, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_created_action_v211 ON logs(created_at, action);
