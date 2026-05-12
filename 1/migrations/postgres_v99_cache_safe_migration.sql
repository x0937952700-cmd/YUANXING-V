-- V99 cache-safe PostgreSQL migration
-- Non destructive. Does not clear, rebuild, reorder, or normalize warehouse_cells.
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS ix_warehouse_cells_zone_col_slot_v99 ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_inventory_updated_at_v99 ON inventory(updated_at);
CREATE INDEX IF NOT EXISTS ix_orders_customer_updated_v99 ON orders(customer_name, updated_at);
CREATE INDEX IF NOT EXISTS ix_master_orders_customer_updated_v99 ON master_orders(customer_name, updated_at);
