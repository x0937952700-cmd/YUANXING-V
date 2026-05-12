-- V146 performance diagnostic stability
-- Safe indexes for fast page load diagnostics and common list filtering. No destructive changes.

CREATE INDEX IF NOT EXISTS idx_inventory_customer_updated_v146
ON inventory (customer_name, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_customer_updated_v146
ON orders (customer_name, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_master_orders_customer_updated_v146
ON master_orders (customer_name, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shipping_records_customer_created_v146
ON shipping_records (customer_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_today_changes_created_v146
ON today_changes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_log_status_created_v146
ON operation_log (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_position_v146
ON warehouse_cells (zone, column_index, slot_type, slot_number);

CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_cell_v146
ON warehouse_cell_items (cell_id, updated_at DESC);

-- Optional generated/normal columns may not exist in older installs, so index creation is guarded.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='product_signature') THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_product_signature_v146 ON inventory (product_signature);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='product_signature') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_product_signature_v146 ON orders (product_signature);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='master_orders' AND column_name='product_signature') THEN
    CREATE INDEX IF NOT EXISTS idx_master_orders_product_signature_v146 ON master_orders (product_signature);
  END IF;
END $$;
