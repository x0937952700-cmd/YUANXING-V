-- V143 final speed guard indexes; safe and idempotent.
DO $$ BEGIN
  IF to_regclass('public.inventory') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inventory_customer_uid_updated_v143 ON inventory(customer_uid, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_inventory_customer_name_updated_v143 ON inventory(customer_name, updated_at DESC);
  END IF;
  IF to_regclass('public.orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_orders_customer_uid_updated_v143 ON orders(customer_uid, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_name_updated_v143 ON orders(customer_name, updated_at DESC);
  END IF;
  IF to_regclass('public.master_orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_master_orders_customer_uid_updated_v143 ON master_orders(customer_uid, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_master_orders_customer_name_updated_v143 ON master_orders(customer_name, updated_at DESC);
  END IF;
  IF to_regclass('public.shipping_records') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_shipping_records_customer_uid_created_v143 ON shipping_records(customer_uid, created_at DESC);
  END IF;
  IF to_regclass('public.today_changes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_today_changes_created_v143 ON today_changes(created_at DESC);
  END IF;
  IF to_regclass('public.warehouse_cells') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_warehouse_cells_fast_v143 ON warehouse_cells(zone, column_index, slot_type, slot_number);
  END IF;
  IF to_regclass('public.warehouse_cell_items') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_warehouse_items_cell_v143 ON warehouse_cell_items(cell_id);
  END IF;
  IF to_regclass('public.operation_log') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_operation_log_status_created_v143 ON operation_log(status, created_at DESC);
  END IF;
END $$;
