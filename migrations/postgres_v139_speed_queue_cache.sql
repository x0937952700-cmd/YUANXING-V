-- V139 第四包：速度與穩定索引補強
-- 目的：讓庫存/訂單/總單/出貨/今日異動/倉庫快取查詢更快；全部使用 IF NOT EXISTS，不影響舊資料。

CREATE INDEX IF NOT EXISTS idx_inventory_customer_updated ON inventory(customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_product_updated ON inventory(product_text, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_updated ON orders(customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_product_updated ON orders(product_text, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_updated ON master_orders(customer_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_product_updated ON master_orders(product_text, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_records_customer_created ON shipping_records(customer_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created_action ON logs(created_at DESC, action);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_column_slot_live ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_cell ON warehouse_cell_items(cell_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_source ON warehouse_cell_items(source_table, source_id);
