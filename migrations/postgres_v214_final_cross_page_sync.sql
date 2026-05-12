-- V214 final cross-page sync safety indexes only; no data destructive changes.
CREATE INDEX IF NOT EXISTS idx_orders_customer_name_qty_v214 ON orders(customer_name, qty);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_name_qty_v214 ON master_orders(customer_name, qty);
CREATE INDEX IF NOT EXISTS idx_shipping_records_customer_created_v214 ON shipping_records(customer_name, created_at);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_v214 ON warehouse_cells(zone, column_index, slot_number);
