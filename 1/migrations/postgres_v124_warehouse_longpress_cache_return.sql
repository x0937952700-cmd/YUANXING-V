-- V124 倉庫圖長按功能保存 + 本機快取顯示升級
-- 不重建 warehouse_cells，不清資料，只補必要欄位與索引。
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS operation_id TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS warehouse_cell_items (
  id SERIAL PRIMARY KEY,
  cell_id INTEGER,
  zone TEXT,
  column_index INTEGER,
  slot_number INTEGER,
  source_table TEXT,
  source_id TEXT,
  customer_name TEXT,
  material TEXT,
  product_text TEXT,
  qty INTEGER DEFAULT 0,
  placement_label TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operation_log (
  id SERIAL PRIMARY KEY,
  operation_id TEXT,
  action TEXT,
  payload_json TEXT,
  result_json TEXT,
  status TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_v124_visible
  ON warehouse_cells(zone, column_index, slot_number)
  WHERE COALESCE(is_deleted,0)=0 AND slot_type='direct';
CREATE INDEX IF NOT EXISTS idx_warehouse_cell_items_v124_lookup
  ON warehouse_cell_items(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS idx_operation_log_v124_operation
  ON operation_log(operation_id);
