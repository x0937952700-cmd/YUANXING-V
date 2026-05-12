-- V152 frontload fast paint marker.
-- Front-end change: base.html now loads only base + page-specific CSS and delays PWA registration until window load.
-- No schema changes required. Keep a migration marker so deployed DB version history stays aligned.
CREATE TABLE IF NOT EXISTS yuanxing_migration_notes (
  version TEXT PRIMARY KEY,
  note TEXT,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO yuanxing_migration_notes(version, note)
VALUES ('v152_frontload_fast_paint', 'Page-specific CSS, delayed PWA script, frontload diagnostic endpoint.')
ON CONFLICT (version) DO UPDATE SET note = EXCLUDED.note, applied_at = NOW();
