-- V172 warehouse stability: frontend note-only save/draft confirmation fix.
-- No destructive schema changes. Kept as a migration marker for deployment audits.
CREATE TABLE IF NOT EXISTS warehouse_stability_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT
);
INSERT INTO warehouse_stability_migrations(version, note)
VALUES ('v172', 'warehouse note-only edit save + draft confirm stability')
ON CONFLICT (version) DO NOTHING;
