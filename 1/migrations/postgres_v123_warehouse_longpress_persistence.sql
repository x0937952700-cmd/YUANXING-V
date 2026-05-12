-- V123: 倉庫圖長按功能保存修復
-- 移除舊版會阻擋格號補齊/插入的唯一索引。格位安全性改由 app/db.py 的
-- 臨時負數格號重排流程保護，避免 duplicate key 造成背景保存失敗。
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW());
DROP INDEX IF EXISTS ux_warehouse_cells_zone_band_row_name_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_col_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_column_slot;
DROP INDEX IF EXISTS ux_warehouse_cells_zone_column_direct_slot;
CREATE INDEX IF NOT EXISTS ix_warehouse_cells_longpress_lookup ON warehouse_cells(zone, column_index, slot_type, slot_number);
INSERT INTO schema_migrations(version) VALUES('123_warehouse_longpress_persistence') ON CONFLICT (version) DO NOTHING;
