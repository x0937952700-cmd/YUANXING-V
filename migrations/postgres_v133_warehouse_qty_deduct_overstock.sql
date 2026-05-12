-- V133 warehouse quantity / dropdown deduct / overstock display support
-- Safe migration: no destructive schema changes. Keeps schema_migrations record only.
CREATE TABLE IF NOT EXISTS schema_migrations(
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(version)
VALUES('v133_warehouse_qty_deduct_overstock')
ON CONFLICT (version) DO NOTHING;

-- Helpful lookup for warehouse placed quantity / overstock checks.
CREATE INDEX IF NOT EXISTS ix_v133_warehouse_cells_zone_column_slot
ON warehouse_cells(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_v133_warehouse_cell_items_customer_product
ON warehouse_cell_items(customer_name, product_text);
