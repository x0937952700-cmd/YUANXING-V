-- V144 speed final compaction and diagnostic indexes
CREATE INDEX IF NOT EXISTS idx_operation_log_status_updated_at ON operation_log(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_today_changes_created_at_id ON today_changes(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_records_created_customer ON shipping_records(created_at DESC, customer_uid, customer_name);
CREATE INDEX IF NOT EXISTS idx_inventory_customer_updated ON inventory(customer_uid, customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_updated ON orders(customer_uid, customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_updated ON master_orders(customer_uid, customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_position_fast ON warehouse_cells(zone, column_index, slot_type, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_cell_source ON warehouse_cell_items(cell_id, source_type, source_id);
