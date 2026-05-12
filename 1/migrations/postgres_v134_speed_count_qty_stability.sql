-- V134 speed + count + qty stability
-- 1) Customer card counts now use product_text effective quantity in Python.
-- 2) These indexes keep the corrected counting and page cache refresh fast.
CREATE INDEX IF NOT EXISTS ix_yx_v134_inventory_customer_fast ON inventory (customer_uid, customer_name);
CREATE INDEX IF NOT EXISTS ix_yx_v134_orders_customer_fast ON orders (customer_uid, customer_name);
CREATE INDEX IF NOT EXISTS ix_yx_v134_master_customer_fast ON master_orders (customer_uid, customer_name);
CREATE INDEX IF NOT EXISTS ix_yx_v134_ship_customer_fast ON shipping_records (customer_uid, customer_name);
CREATE INDEX IF NOT EXISTS ix_yx_v134_inventory_updated ON inventory (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_yx_v134_orders_id ON orders (id DESC);
CREATE INDEX IF NOT EXISTS ix_yx_v134_master_id ON master_orders (id DESC);
