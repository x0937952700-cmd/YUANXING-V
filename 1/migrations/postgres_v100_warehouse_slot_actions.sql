-- V100 warehouse slot action stability migration
-- Non-destructive: no TRUNCATE, no DROP, no rewrite of slot_type='' to direct.
CREATE TABLE IF NOT EXISTS warehouse_cells (
    id SERIAL PRIMARY KEY,
    zone TEXT DEFAULT 'A',
    column_index INTEGER DEFAULT 1,
    slot_type TEXT DEFAULT 'direct',
    slot_number INTEGER DEFAULT 1,
    items_json TEXT DEFAULT '[]',
    note TEXT DEFAULT '',
    updated_at TEXT,
    is_deleted INTEGER DEFAULT 0,
    problem_flag TEXT DEFAULT ''
);
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;
CREATE INDEX IF NOT EXISTS ix_yx_v100_wh_lookup ON warehouse_cells(zone, column_index, slot_number);
UPDATE warehouse_cells
SET items_json = COALESCE(NULLIF(items_json,''),'[]'),
    note = COALESCE(note,''),
    is_deleted = COALESCE(is_deleted,0),
    problem_flag = COALESCE(problem_flag,'')
WHERE TRUE;
