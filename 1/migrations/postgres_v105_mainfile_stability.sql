-- YUANXING V105 PostgreSQL safe migration
-- Non-destructive only: never clears, rebuilds, or reorders warehouse_cells.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;
CREATE INDEX IF NOT EXISTS ix_yx_v105_wh_lookup ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_yx_v105_inventory_customer_updated ON inventory(customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_yx_v105_orders_customer_updated ON orders(customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_yx_v105_master_customer_updated ON master_orders(customer_name, updated_at DESC, id DESC);
INSERT INTO schema_migrations(version) VALUES('V105_mainfile_stability')
ON CONFLICT (version) DO NOTHING;
