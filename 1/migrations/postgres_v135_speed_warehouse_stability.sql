-- V135 speed + warehouse stability
-- This migration is intentionally additive only: indexes for faster page open,
-- warehouse reads, source quantity scans, and background operation lookups.
CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS ix_v135_inventory_customer_updated ON inventory(customer_name, updated_at);
CREATE INDEX IF NOT EXISTS ix_v135_inventory_location ON inventory(location);
CREATE INDEX IF NOT EXISTS ix_v135_orders_customer_updated ON orders(customer_name, updated_at);
CREATE INDEX IF NOT EXISTS ix_v135_master_orders_customer_updated ON master_orders(customer_name, updated_at);
CREATE INDEX IF NOT EXISTS ix_v135_customer_profiles_region_name ON customer_profiles(region, name);
CREATE INDEX IF NOT EXISTS ix_v135_warehouse_cells_visible ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_v135_warehouse_cells_deleted ON warehouse_cells(is_deleted);
CREATE INDEX IF NOT EXISTS ix_v135_warehouse_cell_items_lookup ON warehouse_cell_items(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_v135_warehouse_cell_items_source ON warehouse_cell_items(source_table, source_id);
CREATE INDEX IF NOT EXISTS ix_v135_operation_log_status_updated ON operation_log(status, updated_at);

INSERT INTO schema_migrations(version) VALUES('135_speed_warehouse_stability')
ON CONFLICT (version) DO NOTHING;
