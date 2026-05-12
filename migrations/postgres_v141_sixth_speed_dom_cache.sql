-- V142 sixth speed pack: additional non-blocking page/cache indexes.
-- Safe to run repeatedly on PostgreSQL.

CREATE INDEX IF NOT EXISTS idx_inventory_updated_id_v142
  ON inventory (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_updated_id_v142
  ON orders (customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_updated_id_v142
  ON master_orders (customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_records_customer_created_v142
  ON shipping_records (customer_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_today_changes_created_id_v142
  ON today_changes (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_zone_col_slot_v142
  ON warehouse_cells (zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_cell_v142
  ON warehouse_cell_items (cell_id);
