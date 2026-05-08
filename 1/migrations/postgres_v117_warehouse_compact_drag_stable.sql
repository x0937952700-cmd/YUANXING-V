-- V117 warehouse compact grid + drag move stable migration
-- Non-destructive: adds metadata used to remember each A/B column visible slot count.
-- It does not clear warehouse_cells.

CREATE TABLE IF NOT EXISTS warehouse_column_meta (
  zone TEXT NOT NULL,
  column_index INTEGER NOT NULL,
  visible_count INTEGER NOT NULL DEFAULT 20,
  updated_at TEXT,
  PRIMARY KEY(zone, column_index)
);

ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;

CREATE INDEX IF NOT EXISTS ix_yx_v117_wh_col ON warehouse_cells(zone, column_index);
CREATE INDEX IF NOT EXISTS ix_yx_v117_wh_lookup ON warehouse_cells(zone, column_index, slot_number);

INSERT INTO warehouse_column_meta(zone, column_index, visible_count, updated_at)
SELECT z.zone, c.column_index, 20, CURRENT_TIMESTAMP
FROM (VALUES ('A'),('B')) AS z(zone)
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6)) AS c(column_index)
ON CONFLICT(zone, column_index) DO NOTHING;

CREATE TABLE IF NOT EXISTS schema_migrations(
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(version) VALUES('V117_warehouse_compact_drag_stable')
ON CONFLICT(version) DO NOTHING;
