-- V107 mainfile stability migration
-- Non-destructive: never clears/rebuilds warehouse_cells; only adds safe columns/indexes.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;

CREATE INDEX IF NOT EXISTS ix_yx_v107_wh_lookup
  ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_yx_v107_inventory_customer_updated
  ON inventory(customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_yx_v107_orders_customer_updated
  ON orders(customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_yx_v107_master_orders_customer_updated
  ON master_orders(customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_yx_v107_shipping_shipped_at
  ON shipping_records(shipped_at DESC, id DESC);

INSERT INTO schema_migrations(version)
VALUES('V107_mainfile_stability')
ON CONFLICT (version) DO NOTHING;
