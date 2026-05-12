-- V155 asset/cache alignment: prevents stale mobile JS/CSS from loading after deploy.
-- This migration is intentionally light: no business data changes.
CREATE TABLE IF NOT EXISTS performance_markers (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO performance_markers(key, value, updated_at)
VALUES ('asset_cache_alignment_version', 'v155', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=CURRENT_TIMESTAMP;
