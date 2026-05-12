-- V142 seventh speed pack: extra lightweight indexes for fast page-open windows.
CREATE INDEX IF NOT EXISTS idx_inventory_updated_id ON inventory(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_updated_id ON orders(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_updated_id ON master_orders(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_records_created_id ON shipping_records(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_today_changes_created_id ON today_changes(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_id ON warehouse_cells(zone, column_index, slot_number, id);
CREATE INDEX IF NOT EXISTS idx_operation_log_status_created ON operation_log(status, created_at DESC);
