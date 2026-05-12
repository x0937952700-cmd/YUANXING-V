-- V158 warehouse stability latest
-- Purpose: metadata-only migration marker for frontend/backend warehouse stability hardening.
-- No destructive schema change. Existing speed/cache、防卡架構保持不變。
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(version) VALUES('postgres_v158_warehouse_stability_latest')
ON CONFLICT (version) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_v158_column_slot
ON warehouse_cells(zone, column_index, slot_type, slot_number);

CREATE INDEX IF NOT EXISTS idx_warehouse_cells_v158_updated
ON warehouse_cells(updated_at);
