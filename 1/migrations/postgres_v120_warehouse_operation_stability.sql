-- V119 batch2 / V120 warehouse operation stability
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS operation_log (
  operation_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  request_json TEXT,
  response_json TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_cell_items (
  id SERIAL PRIMARY KEY,
  cell_id INTEGER NOT NULL,
  zone TEXT,
  column_index INTEGER,
  slot_number INTEGER,
  source_table TEXT,
  source_id TEXT,
  customer_name TEXT,
  product_text TEXT,
  material TEXT,
  qty INTEGER DEFAULT 0,
  placement_label TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_yx120_wh_items_cell ON warehouse_cell_items(cell_id);
CREATE INDEX IF NOT EXISTS ix_yx120_wh_items_lookup ON warehouse_cell_items(zone, column_index, slot_number);
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

INSERT INTO schema_migrations(version) VALUES('119_batch2_warehouse_operation_stability') ON CONFLICT (version) DO NOTHING;
