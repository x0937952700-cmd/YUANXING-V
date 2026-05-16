-- YUANXING V404 all-in-one PostgreSQL migration
-- Additive only: creates missing tables, columns and indexes for Render/PostgreSQL.
-- Safe to run repeatedly.
BEGIN;

-- table: schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- table: users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  is_blocked INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

-- table: customer_profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  common_materials TEXT,
  common_sizes TEXT,
  region TEXT,
  customer_uid TEXT,
  is_archived INTEGER DEFAULT 0,
  archived_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- table: inventory
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  product_text TEXT NOT NULL,
  product_code TEXT,
  material TEXT,
  month_tag TEXT,
  qty INTEGER DEFAULT 0,
  location TEXT,
  area TEXT,
  source TEXT,
  note TEXT,
  customer_name TEXT,
  customer_uid TEXT,
  operator TEXT,
  source_text TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- table: orders
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_uid TEXT,
  product_text TEXT NOT NULL,
  product_code TEXT,
  material TEXT,
  month_tag TEXT,
  qty INTEGER DEFAULT 0,
  location TEXT,
  area TEXT,
  source TEXT,
  note TEXT,
  status TEXT DEFAULT 'pending',
  operator TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- table: master_orders
CREATE TABLE IF NOT EXISTS master_orders (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_uid TEXT,
  product_text TEXT NOT NULL,
  product_code TEXT,
  material TEXT,
  month_tag TEXT,
  qty INTEGER DEFAULT 0,
  location TEXT,
  area TEXT,
  source TEXT,
  note TEXT,
  operator TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- table: shipping_records
CREATE TABLE IF NOT EXISTS shipping_records (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_uid TEXT,
  product_text TEXT NOT NULL,
  product_code TEXT,
  material TEXT,
  month_tag TEXT,
  qty INTEGER DEFAULT 0,
  source_table TEXT,
  before_qty INTEGER DEFAULT 0,
  after_qty INTEGER DEFAULT 0,
  operator TEXT,
  created_at TEXT,
  shipped_at TEXT,
  note TEXT,
  source_label TEXT,
  source_detail_json TEXT,
  source_plan_json TEXT,
  volume REAL DEFAULT 0,
  weight REAL DEFAULT 0,
  volume_formula TEXT
);

-- table: corrections
CREATE TABLE IF NOT EXISTS corrections (
  id SERIAL PRIMARY KEY,
  wrong_text TEXT UNIQUE NOT NULL,
  correct_text TEXT NOT NULL,
  updated_at TEXT
);

-- table: image_hashes
CREATE TABLE IF NOT EXISTS image_hashes (
  id SERIAL PRIMARY KEY,
  image_hash TEXT UNIQUE NOT NULL,
  created_at TEXT
);

-- table: logs
CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  username TEXT,
  action TEXT,
  created_at TEXT
);

-- table: today_changes
CREATE TABLE IF NOT EXISTS today_changes (
  id SERIAL PRIMARY KEY,
  action TEXT,
  table_name TEXT,
  customer_name TEXT,
  product_text TEXT,
  detail_json TEXT,
  operator TEXT,
  created_at TEXT,
  unread INTEGER DEFAULT 1
);

-- table: errors
CREATE TABLE IF NOT EXISTS errors (
  id SERIAL PRIMARY KEY,
  source TEXT,
  message TEXT,
  created_at TEXT
);

-- table: ocr_usage
CREATE TABLE IF NOT EXISTS ocr_usage (
  id SERIAL PRIMARY KEY,
  engine TEXT NOT NULL,
  period TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  updated_at TEXT
);

-- table: submit_requests
CREATE TABLE IF NOT EXISTS submit_requests (
  id SERIAL PRIMARY KEY,
  request_key TEXT UNIQUE NOT NULL,
  endpoint TEXT,
  created_at TEXT
);

-- table: customer_aliases
CREATE TABLE IF NOT EXISTS customer_aliases (
  id SERIAL PRIMARY KEY,
  alias TEXT UNIQUE NOT NULL,
  target_name TEXT NOT NULL,
  updated_at TEXT
);

-- table: warehouse_recent_slots
CREATE TABLE IF NOT EXISTS warehouse_recent_slots (
  id SERIAL PRIMARY KEY,
  username TEXT,
  customer_name TEXT,
  zone TEXT,
  column_index INTEGER,
  slot_number INTEGER,
  used_at TEXT
);

-- table: audit_trails
CREATE TABLE IF NOT EXISTS audit_trails (
  id SERIAL PRIMARY KEY,
  username TEXT,
  action_type TEXT,
  entity_type TEXT,
  entity_key TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT
);

-- table: todo_items
CREATE TABLE IF NOT EXISTS todo_items (
  id SERIAL PRIMARY KEY,
  note TEXT,
  due_date TEXT,
  image_filename TEXT,
  created_by TEXT,
  created_at TEXT,
  updated_at TEXT,
  completed_at TEXT,
  is_done INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- table: app_settings
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

-- table: warehouse_cells
CREATE TABLE IF NOT EXISTS warehouse_cells (
  id SERIAL PRIMARY KEY,
  zone TEXT NOT NULL,
  column_index INTEGER NOT NULL,
  slot_type TEXT NOT NULL DEFAULT 'direct',
  slot_number INTEGER NOT NULL,
  items_json TEXT DEFAULT '[]',
  note TEXT DEFAULT '',
  updated_at TEXT,
  is_deleted INTEGER DEFAULT 0,
  problem_flag TEXT DEFAULT '',
  operation_id TEXT,
  version INTEGER DEFAULT 1
);

-- table: warehouse_column_meta
CREATE TABLE IF NOT EXISTS warehouse_column_meta (
  zone TEXT NOT NULL,
  column_index INTEGER NOT NULL,
  visible_count INTEGER NOT NULL DEFAULT 20,
  updated_at TEXT,
  PRIMARY KEY(zone, column_index)
);

-- table: warehouse_cell_items
CREATE TABLE IF NOT EXISTS warehouse_cell_items (
  id SERIAL PRIMARY KEY,
  cell_id INTEGER,
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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- table: operation_log
CREATE TABLE IF NOT EXISTS operation_log (
  operation_id TEXT PRIMARY KEY,
  action TEXT,
  status TEXT DEFAULT 'running',
  source TEXT,
  request_json TEXT,
  response_json TEXT,
  payload_json TEXT,
  result_json TEXT,
  payload TEXT,
  result TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- table: shipping_preview_snapshots
CREATE TABLE IF NOT EXISTS shipping_preview_snapshots (
  preview_token TEXT PRIMARY KEY,
  request_json TEXT,
  response_json TEXT,
  customer_name TEXT,
  operation_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT,
  updated_at TEXT
);

-- table: ship_preview_snapshots
CREATE TABLE IF NOT EXISTS ship_preview_snapshots (
  token TEXT PRIMARY KEY,
  customer_name TEXT,
  payload TEXT,
  operator TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- table: sync_events
CREATE TABLE IF NOT EXISTS sync_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT,
  module TEXT,
  message TEXT,
  payload_json TEXT,
  created_at TEXT
);

-- table: backup_audit
CREATE TABLE IF NOT EXISTS backup_audit (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT,
  action TEXT,
  success INTEGER DEFAULT 0,
  detail_json TEXT,
  username TEXT,
  created_at TEXT
);

-- table: app_mainline_metadata
CREATE TABLE IF NOT EXISTS app_mainline_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

-- table: performance_markers
CREATE TABLE IF NOT EXISTS performance_markers (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

-- table: yuanxing_migration_notes
CREATE TABLE IF NOT EXISTS yuanxing_migration_notes (
  version TEXT PRIMARY KEY,
  note TEXT,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- table: warehouse_stability_migrations
CREATE TABLE IF NOT EXISTS warehouse_stability_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
  note TEXT
);

-- table: yx_operations
CREATE TABLE IF NOT EXISTS yx_operations (
  operation_id TEXT PRIMARY KEY,
  operation_type TEXT,
  payload_json TEXT,
  response_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- column alignment for existing databases
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS version TEXT;
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS applied_at TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS common_materials TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS common_sizes TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS is_archived INTEGER DEFAULT 0;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS archived_at TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS product_text TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS month_tag TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS operator TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS source_text TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_text TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS month_tag TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS operator TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS product_text TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS month_tag TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 0;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS operator TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS customer_uid TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS product_text TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS month_tag TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 0;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS source_table TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS before_qty INTEGER DEFAULT 0;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS after_qty INTEGER DEFAULT 0;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS operator TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS shipped_at TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS source_label TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS source_detail_json TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS source_plan_json TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS volume REAL DEFAULT 0;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS weight REAL DEFAULT 0;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS volume_formula TEXT;
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS wrong_text TEXT;
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS correct_text TEXT;
ALTER TABLE corrections ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE image_hashes ADD COLUMN IF NOT EXISTS image_hash TEXT;
ALTER TABLE image_hashes ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE today_changes ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE today_changes ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE today_changes ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE today_changes ADD COLUMN IF NOT EXISTS product_text TEXT;
ALTER TABLE today_changes ADD COLUMN IF NOT EXISTS detail_json TEXT;
ALTER TABLE today_changes ADD COLUMN IF NOT EXISTS operator TEXT;
ALTER TABLE today_changes ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE today_changes ADD COLUMN IF NOT EXISTS unread INTEGER DEFAULT 1;
ALTER TABLE errors ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE errors ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE errors ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE ocr_usage ADD COLUMN IF NOT EXISTS engine TEXT;
ALTER TABLE ocr_usage ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE ocr_usage ADD COLUMN IF NOT EXISTS count INTEGER DEFAULT 0;
ALTER TABLE ocr_usage ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE submit_requests ADD COLUMN IF NOT EXISTS request_key TEXT;
ALTER TABLE submit_requests ADD COLUMN IF NOT EXISTS endpoint TEXT;
ALTER TABLE submit_requests ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE customer_aliases ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE customer_aliases ADD COLUMN IF NOT EXISTS target_name TEXT;
ALTER TABLE customer_aliases ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE warehouse_recent_slots ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE warehouse_recent_slots ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE warehouse_recent_slots ADD COLUMN IF NOT EXISTS zone TEXT;
ALTER TABLE warehouse_recent_slots ADD COLUMN IF NOT EXISTS column_index INTEGER;
ALTER TABLE warehouse_recent_slots ADD COLUMN IF NOT EXISTS slot_number INTEGER;
ALTER TABLE warehouse_recent_slots ADD COLUMN IF NOT EXISTS used_at TEXT;
ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS entity_key TEXT;
ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS before_json TEXT;
ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS after_json TEXT;
ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS image_filename TEXT;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS completed_at TEXT;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS is_done INTEGER DEFAULT 0;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS zone TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS column_index INTEGER;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_type TEXT DEFAULT 'direct';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_number INTEGER;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS band INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS row_name TEXT DEFAULT '';
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_no INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS product_text TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 0;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS placement_label TEXT;
ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS created_at TEXT;

ALTER TABLE warehouse_column_meta ADD COLUMN IF NOT EXISTS zone TEXT;
ALTER TABLE warehouse_column_meta ADD COLUMN IF NOT EXISTS column_index INTEGER;
ALTER TABLE warehouse_column_meta ADD COLUMN IF NOT EXISTS visible_count INTEGER DEFAULT 20;
ALTER TABLE warehouse_column_meta ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS cell_id INTEGER;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS zone TEXT;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS column_index INTEGER;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS slot_number INTEGER;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS source_table TEXT;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS product_text TEXT;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 0;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS placement_label TEXT;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE warehouse_cell_items ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'running';
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS request_json TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS response_json TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS payload_json TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS result_json TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS payload TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS result TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE operation_log ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE shipping_preview_snapshots ADD COLUMN IF NOT EXISTS preview_token TEXT;
ALTER TABLE shipping_preview_snapshots ADD COLUMN IF NOT EXISTS request_json TEXT;
ALTER TABLE shipping_preview_snapshots ADD COLUMN IF NOT EXISTS response_json TEXT;
ALTER TABLE shipping_preview_snapshots ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE shipping_preview_snapshots ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE shipping_preview_snapshots ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE shipping_preview_snapshots ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE shipping_preview_snapshots ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE ship_preview_snapshots ADD COLUMN IF NOT EXISTS token TEXT;
ALTER TABLE ship_preview_snapshots ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE ship_preview_snapshots ADD COLUMN IF NOT EXISTS payload TEXT;
ALTER TABLE ship_preview_snapshots ADD COLUMN IF NOT EXISTS operator TEXT;
ALTER TABLE ship_preview_snapshots ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS payload_json TEXT;
ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE backup_audit ADD COLUMN IF NOT EXISTS filename TEXT;
ALTER TABLE backup_audit ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE backup_audit ADD COLUMN IF NOT EXISTS success INTEGER DEFAULT 0;
ALTER TABLE backup_audit ADD COLUMN IF NOT EXISTS detail_json TEXT;
ALTER TABLE backup_audit ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE backup_audit ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE app_mainline_metadata ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE app_mainline_metadata ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE app_mainline_metadata ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE performance_markers ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE performance_markers ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE performance_markers ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE yuanxing_migration_notes ADD COLUMN IF NOT EXISTS version TEXT;
ALTER TABLE yuanxing_migration_notes ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE yuanxing_migration_notes ADD COLUMN IF NOT EXISTS applied_at TEXT;
ALTER TABLE warehouse_stability_migrations ADD COLUMN IF NOT EXISTS version TEXT;
ALTER TABLE warehouse_stability_migrations ADD COLUMN IF NOT EXISTS applied_at TEXT;
ALTER TABLE warehouse_stability_migrations ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE yx_operations ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE yx_operations ADD COLUMN IF NOT EXISTS operation_type TEXT;
ALTER TABLE yx_operations ADD COLUMN IF NOT EXISTS payload_json TEXT;
ALTER TABLE yx_operations ADD COLUMN IF NOT EXISTS response_json TEXT;
ALTER TABLE yx_operations ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE yx_operations ADD COLUMN IF NOT EXISTS updated_at TEXT;

-- indexes
CREATE INDEX IF NOT EXISTS ix_customer_profiles_name ON customer_profiles(name);
CREATE INDEX IF NOT EXISTS ix_customer_profiles_region_name ON customer_profiles(region, name);
CREATE INDEX IF NOT EXISTS ix_customer_profiles_uid ON customer_profiles(customer_uid);
CREATE INDEX IF NOT EXISTS ix_customer_profiles_archived_region ON customer_profiles(is_archived, region, name);
CREATE INDEX IF NOT EXISTS ix_inventory_customer_updated ON inventory(customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_inventory_customer_uid ON inventory(customer_uid);
CREATE INDEX IF NOT EXISTS ix_inventory_product_material ON inventory(product_text, material);
CREATE INDEX IF NOT EXISTS ix_inventory_location_updated ON inventory(location, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_inventory_area_customer ON inventory(area, customer_name);
CREATE INDEX IF NOT EXISTS ix_inventory_qty ON inventory(qty);
CREATE INDEX IF NOT EXISTS ix_orders_customer_updated ON orders(customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_orders_customer_uid ON orders(customer_uid);
CREATE INDEX IF NOT EXISTS ix_orders_product_material ON orders(product_text, material);
CREATE INDEX IF NOT EXISTS ix_orders_location_updated ON orders(location, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_orders_status_customer ON orders(status, customer_name);
CREATE INDEX IF NOT EXISTS ix_orders_qty ON orders(qty);
CREATE INDEX IF NOT EXISTS ix_master_orders_customer_updated ON master_orders(customer_name, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_master_orders_customer_uid ON master_orders(customer_uid);
CREATE INDEX IF NOT EXISTS ix_master_orders_product_material ON master_orders(product_text, material);
CREATE INDEX IF NOT EXISTS ix_master_orders_location_updated ON master_orders(location, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_master_orders_qty ON master_orders(qty);
CREATE INDEX IF NOT EXISTS ix_shipping_records_customer_time ON shipping_records(customer_name, shipped_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_shipping_records_customer_uid ON shipping_records(customer_uid);
CREATE INDEX IF NOT EXISTS ix_shipping_records_source_table ON shipping_records(source_table, customer_name);
CREATE INDEX IF NOT EXISTS ix_shipping_records_created_at ON shipping_records(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_logs_created_at ON logs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_logs_action_created ON logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_today_changes_created_at ON today_changes(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_today_changes_unread_created ON today_changes(unread, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_today_changes_customer_created ON today_changes(customer_name, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_errors_created_at ON errors(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_ocr_usage_period ON ocr_usage(engine, period);
CREATE INDEX IF NOT EXISTS ix_submit_requests_key ON submit_requests(request_key);
CREATE INDEX IF NOT EXISTS ix_customer_aliases_alias ON customer_aliases(alias);
CREATE INDEX IF NOT EXISTS ix_warehouse_recent_slots_customer ON warehouse_recent_slots(customer_name, used_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_trails_entity_created ON audit_trails(entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_trails_username_created ON audit_trails(username, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_todo_items_done_sort ON todo_items(is_done, sort_order, id);
CREATE INDEX IF NOT EXISTS ix_app_settings_key ON app_settings(key);
CREATE INDEX IF NOT EXISTS ix_warehouse_cells_slot_lookup ON warehouse_cells(zone, column_index, slot_type, slot_number);
CREATE INDEX IF NOT EXISTS ix_warehouse_cells_visible_lookup ON warehouse_cells(zone, column_index, slot_number) WHERE COALESCE(is_deleted, 0) = 0;
CREATE INDEX IF NOT EXISTS ix_warehouse_cells_updated_at ON warehouse_cells(updated_at);
CREATE INDEX IF NOT EXISTS ix_warehouse_cells_operation_id ON warehouse_cells(operation_id);
CREATE INDEX IF NOT EXISTS ix_warehouse_cells_version ON warehouse_cells(version);
CREATE INDEX IF NOT EXISTS ix_warehouse_column_meta_zone_col ON warehouse_column_meta(zone, column_index);
CREATE INDEX IF NOT EXISTS ix_warehouse_cell_items_cell ON warehouse_cell_items(cell_id);
CREATE INDEX IF NOT EXISTS ix_warehouse_cell_items_lookup ON warehouse_cell_items(zone, column_index, slot_number);
CREATE INDEX IF NOT EXISTS ix_warehouse_cell_items_customer_product ON warehouse_cell_items(customer_name, product_text);
CREATE INDEX IF NOT EXISTS ix_warehouse_cell_items_source ON warehouse_cell_items(source_table, source_id);
CREATE INDEX IF NOT EXISTS ix_operation_log_operation_id ON operation_log(operation_id);
CREATE INDEX IF NOT EXISTS ix_operation_log_status_updated ON operation_log(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_operation_log_action_updated ON operation_log(action, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_operation_log_source_updated ON operation_log(source, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_shipping_preview_snapshots_status ON shipping_preview_snapshots(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_shipping_preview_snapshots_customer ON shipping_preview_snapshots(customer_name, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ship_preview_snapshots_customer ON ship_preview_snapshots(customer_name, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_sync_events_module_created ON sync_events(module, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_backup_audit_created ON backup_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_yx_operations_type_created ON yx_operations(operation_type, created_at DESC);


-- safe uniqueness helpers used by existing ON CONFLICT application writes
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username_all_in_one ON users(username);
  EXCEPTION WHEN unique_violation THEN
    CREATE INDEX IF NOT EXISTS ix_users_username_all_in_one ON users(username);
  END;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_profiles_name_all_in_one ON customer_profiles(name);
  EXCEPTION WHEN unique_violation THEN
    CREATE INDEX IF NOT EXISTS ix_customer_profiles_name_all_in_one ON customer_profiles(name);
  END;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_corrections_wrong_text_all_in_one ON corrections(wrong_text);
  EXCEPTION WHEN unique_violation THEN
    CREATE INDEX IF NOT EXISTS ix_corrections_wrong_text_all_in_one ON corrections(wrong_text);
  END;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_image_hashes_hash_all_in_one ON image_hashes(image_hash);
  EXCEPTION WHEN unique_violation THEN
    CREATE INDEX IF NOT EXISTS ix_image_hashes_hash_all_in_one ON image_hashes(image_hash);
  END;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_ocr_usage_engine_period_all_in_one ON ocr_usage(engine, period);
  EXCEPTION WHEN unique_violation THEN
    CREATE INDEX IF NOT EXISTS ix_ocr_usage_engine_period_all_in_one ON ocr_usage(engine, period);
  END;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_submit_requests_key_all_in_one ON submit_requests(request_key);
  EXCEPTION WHEN unique_violation THEN
    CREATE INDEX IF NOT EXISTS ix_submit_requests_key_all_in_one ON submit_requests(request_key);
  END;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_aliases_alias_all_in_one ON customer_aliases(alias);
  EXCEPTION WHEN unique_violation THEN
    CREATE INDEX IF NOT EXISTS ix_customer_aliases_alias_all_in_one ON customer_aliases(alias);
  END;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_app_settings_key_all_in_one ON app_settings(key);
  EXCEPTION WHEN unique_violation THEN
    CREATE INDEX IF NOT EXISTS ix_app_settings_key_all_in_one ON app_settings(key);
  END;
END $$;

INSERT INTO schema_migrations(version, applied_at)
SELECT '000_yuanxing_all_in_one_v404', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '000_yuanxing_all_in_one_v404');
COMMIT;
