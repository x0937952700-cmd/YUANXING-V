-- V138: heavy page speed indexes and cache alignment
-- Safe to run repeatedly on PostgreSQL.

CREATE INDEX IF NOT EXISTS idx_yx_v138_inventory_customer_updated ON inventory (customer_name, updated_at);
CREATE INDEX IF NOT EXISTS idx_yx_v138_orders_customer_updated ON orders (customer_name, updated_at);
CREATE INDEX IF NOT EXISTS idx_yx_v138_master_customer_updated ON master_orders (customer_name, updated_at);
CREATE INDEX IF NOT EXISTS idx_yx_v138_shipping_customer_time ON shipping_records (customer_name, shipped_at);
CREATE INDEX IF NOT EXISTS idx_yx_v138_logs_created ON logs (created_at);
CREATE INDEX IF NOT EXISTS idx_yx_v138_warehouse_cells_visible ON warehouse_cells (zone, column_index, slot_number) WHERE COALESCE(is_deleted,0)=0;
CREATE INDEX IF NOT EXISTS idx_yx_v138_warehouse_items_cell ON warehouse_cell_items (cell_id);
CREATE INDEX IF NOT EXISTS idx_yx_v138_warehouse_items_lookup ON warehouse_cell_items (warehouse_customer_key, product_signature);
