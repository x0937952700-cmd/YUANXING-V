-- V192 功能救援安全 migration
-- 目的：修復出貨/訂單/總單在舊 PostgreSQL 資料庫上的客戶關聯與查詢穩定性。
-- 只補欄位與索引，不刪資料、不重建表、不影響快取核心。

ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS master_orders ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS inventory ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS shipping_records ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS customer_profiles ADD COLUMN IF NOT EXISTS customer_uid TEXT;

CREATE INDEX IF NOT EXISTS idx_v192_orders_customer_uid_qty ON orders(customer_uid, qty);
CREATE INDEX IF NOT EXISTS idx_v192_orders_customer_name_qty ON orders(customer_name, qty);
CREATE INDEX IF NOT EXISTS idx_v192_master_orders_customer_uid_qty ON master_orders(customer_uid, qty);
CREATE INDEX IF NOT EXISTS idx_v192_master_orders_customer_name_qty ON master_orders(customer_name, qty);
CREATE INDEX IF NOT EXISTS idx_v192_inventory_customer_uid_qty ON inventory(customer_uid, qty);
CREATE INDEX IF NOT EXISTS idx_v192_shipping_customer_uid ON shipping_records(customer_uid);
CREATE INDEX IF NOT EXISTS idx_v192_customer_profiles_name ON customer_profiles(name);
