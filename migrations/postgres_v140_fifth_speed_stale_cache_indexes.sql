-- V140 fifth speed pack: safer cache/query indexes for fast page open and warehouse operations.

CREATE INDEX IF NOT EXISTS idx_inventory_customer_uid_updated ON inventory(customer_uid, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_customer_name_updated ON inventory(customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_product_signature ON inventory(product_signature);
CREATE INDEX IF NOT EXISTS idx_orders_customer_uid_updated ON orders(customer_uid, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_name_updated ON orders(customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_product_signature ON orders(product_signature);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_uid_updated ON master_orders(customer_uid, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_name_updated ON master_orders(customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_product_signature ON master_orders(product_signature);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_lookup_v140 ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_updated_v140 ON warehouse_cells(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_cell_id_v140 ON warehouse_cell_items(cell_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_customer_key_v140 ON warehouse_cell_items(warehouse_customer_key);
CREATE INDEX IF NOT EXISTS idx_shipping_records_customer_date_v140 ON shipping_records(customer_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_today_changes_created_v140 ON today_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_log_status_created_v140 ON operation_log(status, created_at DESC);
