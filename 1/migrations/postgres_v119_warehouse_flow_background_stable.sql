-- V119 warehouse flow background stable
-- Purpose: keep warehouse add/edit/return/move/add-slot/remove-slot operations safe for background queue.
-- This migration is non-destructive: it does not clear warehouse_cells and does not reorder product cells.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(version) VALUES('V119_warehouse_flow_background_stable')
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS warehouse_column_meta (
  zone TEXT NOT NULL,
  column_index INTEGER NOT NULL,
  visible_count INTEGER NOT NULL DEFAULT 20,
  updated_at TEXT,
  PRIMARY KEY(zone, column_index)
);

CREATE INDEX IF NOT EXISTS ix_yx_v119_warehouse_cells_zone_col_slot
ON warehouse_cells(zone, column_index, slot_number);
