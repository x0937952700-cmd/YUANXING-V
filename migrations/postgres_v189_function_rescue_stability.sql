-- V189 功能救援穩定補強：出貨客戶商品讀取、訂單/總單客戶關聯、今日異動顯示。
-- 只補安全欄位/索引；不動快取、背景保存、service worker 架構。
ALTER TABLE IF EXISTS inventory ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS master_orders ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS shipping_records ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS customer_profiles ADD COLUMN IF NOT EXISTS customer_uid TEXT;

CREATE INDEX IF NOT EXISTS idx_v189_orders_customer_uid ON orders(customer_uid);
CREATE INDEX IF NOT EXISTS idx_v189_master_orders_customer_uid ON master_orders(customer_uid);
CREATE INDEX IF NOT EXISTS idx_v189_inventory_customer_uid ON inventory(customer_uid);
CREATE INDEX IF NOT EXISTS idx_v189_ship_records_customer_uid ON shipping_records(customer_uid);
CREATE INDEX IF NOT EXISTS idx_v189_orders_customer_name ON orders(customer_name);
CREATE INDEX IF NOT EXISTS idx_v189_master_orders_customer_name ON master_orders(customer_name);
