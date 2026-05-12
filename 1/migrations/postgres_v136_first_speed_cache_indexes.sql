-- V136 first speed/cache pack: indexes used by inventory/orders/master/shipping/today/warehouse fast paths.
-- Safe to run repeatedly.
CREATE INDEX IF NOT EXISTS idx_inventory_customer_updated ON inventory(customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_location_updated ON inventory(location, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_product_sig ON inventory(product_signature) WHERE product_signature IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_updated ON orders(customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_location_updated ON orders(location, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_product_sig ON orders(product_signature) WHERE product_signature IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_updated ON master_orders(customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_location_updated ON master_orders(location, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_product_sig ON master_orders(product_signature) WHERE product_signature IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_records_customer_created ON shipping_records(customer_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created_date ON logs((substr(created_at,1,10)));
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_coord ON warehouse_cells(zone, column_index, slot_type, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_updated ON warehouse_cells(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_cell ON warehouse_cell_items(cell_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_lookup ON warehouse_cell_items(warehouse_customer_key, product_signature, material);
CREATE INDEX IF NOT EXISTS idx_operation_log_status_created ON operation_log(status, created_at DESC);
