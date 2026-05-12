-- V125 mobile zoom layout marker.
-- No data schema is required for the phone table/warehouse zoom behavior;
-- this migration records the release for deployment traceability.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(version) VALUES ('postgres_v125_mobile_zoom_layout')
ON CONFLICT (version) DO NOTHING;
