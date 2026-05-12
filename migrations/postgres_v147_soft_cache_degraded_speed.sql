-- V147 soft-cache degraded speed pack
-- Purpose: keep heavy pages usable when DB is slow by supporting the existing fast-path queries.
-- Safe to run repeatedly.

CREATE INDEX IF NOT EXISTS idx_inventory_customer_updated_v147
  ON inventory (customer_uid, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_updated_v147
  ON orders (customer_uid, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_orders_customer_updated_v147
  ON master_orders (customer_uid, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_cells_lookup_v147
  ON warehouse_cells (zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_cell_v147
  ON warehouse_cell_items (cell_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_status_updated_v147
  ON operation_log (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_today_changes_created_v147
  ON today_changes (created_at DESC);
