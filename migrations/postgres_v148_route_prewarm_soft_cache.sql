-- V148 route prewarm / soft cache stability indexes. Safe to run repeatedly.
CREATE INDEX IF NOT EXISTS idx_inventory_updated_id_v148 ON inventory (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_updated_id_v148 ON orders (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_updated_id_v148 ON master_orders (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_updated_v148 ON warehouse_cells (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_records_created_v148 ON shipping_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created_v148 ON logs (created_at DESC);
