-- V190 功能救援補強：修正出貨客戶商品快取 key 後的安全索引。
-- 只補欄位/索引，不更動 yx_cache/yx_core/service worker/背景 queue 架構。
ALTER TABLE IF EXISTS inventory ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS master_orders ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS shipping_records ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE IF EXISTS customer_profiles ADD COLUMN IF NOT EXISTS customer_uid TEXT;

CREATE INDEX IF NOT EXISTS idx_v190_orders_customer_lookup ON orders(customer_name, customer_uid);
CREATE INDEX IF NOT EXISTS idx_v190_master_orders_customer_lookup ON master_orders(customer_name, customer_uid);
CREATE INDEX IF NOT EXISTS idx_v190_inventory_customer_lookup ON inventory(customer_name, customer_uid);
CREATE INDEX IF NOT EXISTS idx_v190_shipping_records_customer_lookup ON shipping_records(customer_name, customer_uid);
CREATE INDEX IF NOT EXISTS idx_v190_customer_profiles_name_region ON customer_profiles(name, region);
