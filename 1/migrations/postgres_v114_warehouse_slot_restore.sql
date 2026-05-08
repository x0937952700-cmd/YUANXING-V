-- V114 warehouse slot restore migration
-- Non-destructive: no DROP/TRUNCATE/DELETE warehouse_cells, no renumbering occupied cells.

ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE IF EXISTS warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;

-- Any row with product data must remain visible.
UPDATE warehouse_cells
SET is_deleted = 0
WHERE COALESCE(items_json, '[]') NOT IN ('[]', '', 'null')
  AND COALESCE(is_deleted, 0) <> 0;

-- Make sure every A/B column has visible direct slots 1-20.
WITH grid AS (
  SELECT z.zone, c.column_index, s.slot_number
  FROM (VALUES ('A'), ('B')) AS z(zone)
  CROSS JOIN generate_series(1,6) AS c(column_index)
  CROSS JOIN generate_series(1,20) AS s(slot_number)
)
INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at, is_deleted, problem_flag)
SELECT grid.zone, grid.column_index, 'direct', grid.slot_number, '[]', '', NOW()::TEXT, 0, ''
FROM grid
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_cells w
  WHERE UPPER(COALESCE(w.zone,'')) = grid.zone
    AND COALESCE(w.column_index,0) = grid.column_index
    AND COALESCE(NULLIF(TRIM(w.slot_type),''),'direct') = 'direct'
    AND COALESCE(w.slot_number,0) = grid.slot_number
);

-- Restore hidden default slots 1-20 without touching extra hidden slots above 20.
UPDATE warehouse_cells
SET is_deleted = 0
WHERE UPPER(COALESCE(zone,'')) IN ('A','B')
  AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = 'direct'
  AND COALESCE(slot_number,0) BETWEEN 1 AND 20
  AND COALESCE(is_deleted,0) <> 0;
