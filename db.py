
import os
import json
import sqlite3
from datetime import datetime
from contextlib import contextmanager
from werkzeug.security import generate_password_hash, check_password_hash
from collections import Counter

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///warehouse.db")
USE_POSTGRES = DATABASE_URL.startswith("postgres")

if USE_POSTGRES:
    import psycopg2

def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def sql(query: str) -> str:
    return query.replace("?", "%s") if USE_POSTGRES else query

def _sqlite_path():
    return DATABASE_URL.replace("sqlite:///", "")

def get_db():
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False
        return conn
    conn = sqlite3.connect(_sqlite_path())
    conn.row_factory = sqlite3.Row
    return conn

def row_to_dict(row):
    if row is None:
        return None
    if USE_POSTGRES:
        return row
    return dict(row)

def rows_to_dict(cur):
    if USE_POSTGRES:
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]
    return [dict(r) for r in cur.fetchall()]

def row_id(row):
    if row is None:
        return None
    return row[0] if USE_POSTGRES else row["id"]

def fetchone_dict(cur):
    row = cur.fetchone()
    if row is None:
        return None
    if USE_POSTGRES:
        cols = [d[0] for d in cur.description]
        return dict(zip(cols, row))
    return dict(row)



def normalize_material(value=''):
    return (value or '').strip().upper()

def product_material_key(product_text='', material=''):
    return f"{(product_text or '').strip()}@@{normalize_material(material)}"


def _merge_json_item_lists(a_json, b_json):
    merged = {}
    for raw in [a_json, b_json]:
        try:
            items = json.loads(raw or '[]') if isinstance(raw, str) else (raw or [])
        except Exception:
            items = []
        for it in items:
            key = ((it.get('product_text') or '').strip(), (it.get('customer_name') or '').strip(), normalize_material(it.get('material') or ''))
            if key not in merged:
                merged[key] = dict(it)
                merged[key]['qty'] = int(it.get('qty') or 0)
                merged[key]['material'] = normalize_material(it.get('material') or '')
            else:
                merged[key]['qty'] = int(merged[key].get('qty') or 0) + int(it.get('qty') or 0)
    return json.dumps(list(merged.values()), ensure_ascii=False)

def log_error(source, message):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(sql("""
            INSERT INTO errors(source, message, created_at)
            VALUES (?, ?, ?)
        """), (source, str(message), now()))
        conn.commit()
        conn.close()
    except Exception:
        pass

def init_db():
    conn = get_db()
    cur = conn.cursor()
    pk = "SERIAL PRIMARY KEY" if USE_POSTGRES else "INTEGER PRIMARY KEY AUTOINCREMENT"
    text = "TEXT"
    tables = [
        f"""CREATE TABLE IF NOT EXISTS users (
            id {pk},
            username {text} UNIQUE NOT NULL,
            password {text} NOT NULL,
            role {text} DEFAULT 'user',
            is_blocked INTEGER DEFAULT 0,
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS customer_profiles (
            id {pk},
            name {text} UNIQUE NOT NULL,
            phone {text},
            address {text},
            notes {text},
            region {text},
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS inventory (
            id {pk},
            product_text {text} NOT NULL,
            product_code {text},
            material {text},
            qty INTEGER DEFAULT 0,
            location {text},
            customer_name {text},
            operator {text},
            source_text {text},
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS orders (
            id {pk},
            customer_name {text} NOT NULL,
            product_text {text} NOT NULL,
            product_code {text},
            material {text},
            qty INTEGER DEFAULT 0,
            status {text} DEFAULT 'pending',
            operator {text},
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS master_orders (
            id {pk},
            customer_name {text} NOT NULL,
            product_text {text} NOT NULL,
            product_code {text},
            material {text},
            qty INTEGER DEFAULT 0,
            operator {text},
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS shipping_records (
            id {pk},
            customer_name {text} NOT NULL,
            product_text {text} NOT NULL,
            product_code {text},
            material {text},
            qty INTEGER DEFAULT 0,
            operator {text},
            shipped_at {text},
            note {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS corrections (
            id {pk},
            wrong_text {text} UNIQUE NOT NULL,
            correct_text {text} NOT NULL,
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS image_hashes (
            id {pk},
            image_hash {text} UNIQUE NOT NULL,
            created_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS logs (
            id {pk},
            username {text},
            action {text},
            created_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS errors (
            id {pk},
            source {text},
            message {text},
            created_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS ocr_usage (
            id {pk},
            engine {text} NOT NULL,
            period {text} NOT NULL,
            count INTEGER DEFAULT 0,
            updated_at {text}
        )""",

f"""CREATE TABLE IF NOT EXISTS submit_requests (
    id {pk},
    request_key {text} UNIQUE NOT NULL,
    endpoint {text},
    created_at {text}
)""",
f"""CREATE TABLE IF NOT EXISTS customer_aliases (
    id {pk},
    alias {text} UNIQUE NOT NULL,
    target_name {text} NOT NULL,
    updated_at {text}
)""",
f"""CREATE TABLE IF NOT EXISTS warehouse_recent_slots (
    id {pk},
    username {text},
    customer_name {text},
    zone {text},
    column_index INTEGER,
    slot_number INTEGER,
    used_at {text}
)""",
f"""CREATE TABLE IF NOT EXISTS audit_trails (
    id {pk},
    username {text},
    action_type {text},
    entity_type {text},
    entity_key {text},
    before_json {text},
    after_json {text},
    created_at {text}
)""",
        f"""CREATE TABLE IF NOT EXISTS app_settings (
            id {pk},
            key {text} UNIQUE NOT NULL,
            value {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS todo_items (
            id {pk},
            note {text},
            due_date {text},
            image_filename {text},
            created_by {text},
            created_at {text},
            updated_at {text}
        )""",
    ]
    for t in tables:
        cur.execute(t)

    index_sqls = [
        "CREATE INDEX IF NOT EXISTS idx_inventory_product_material ON inventory(product_text, material)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_customer ON inventory(customer_name)",
        "CREATE INDEX IF NOT EXISTS idx_orders_customer_product_material ON orders(customer_name, product_text, material)",
        "CREATE INDEX IF NOT EXISTS idx_master_customer_product_material ON master_orders(customer_name, product_text, material)",
        "CREATE INDEX IF NOT EXISTS idx_shipping_customer_shipped_at ON shipping_records(customer_name, shipped_at)",
        "CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_todo_due_created ON todo_items(due_date, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_submit_requests_created_at ON submit_requests(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_audit_trails_created_at ON audit_trails(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_audit_trails_entity_type ON audit_trails(entity_type)",
        "CREATE INDEX IF NOT EXISTS idx_customer_profiles_region ON customer_profiles(region)",
    ]
    for stmt in index_sqls:
        cur.execute(stmt)

    if USE_POSTGRES:
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked INTEGER DEFAULT 0")
        cur.execute("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS material TEXT")
        cur.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS material TEXT")
        cur.execute("ALTER TABLE master_orders ADD COLUMN IF NOT EXISTS material TEXT")
        cur.execute("ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS material TEXT")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_ocr_usage_period ON ocr_usage(engine, period)")
    else:
        cur.execute("PRAGMA table_info(users)")
        user_cols = {r[1] for r in cur.fetchall()}
        if 'role' not in user_cols:
            cur.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
        if 'is_blocked' not in user_cols:
            cur.execute("ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0")
        for table_name in ('inventory', 'orders', 'master_orders', 'shipping_records'):
            cur.execute(f"PRAGMA table_info({table_name})")
            cols = {r[1] for r in cur.fetchall()}
            if 'material' not in cols:
                cur.execute(f"ALTER TABLE {table_name} ADD COLUMN material TEXT")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_ocr_usage_period ON ocr_usage(engine, period)")

    cur.execute(sql("UPDATE users SET role = ? WHERE username = ?"), ('admin', '陳韋廷'))

    # default settings
    if USE_POSTGRES:
        cur.execute("""
            INSERT INTO app_settings(key, value, updated_at)
            VALUES (%s, %s, %s)
            ON CONFLICT (key) DO NOTHING
        """, ('native_ocr_mode', '1', now()))
    else:
        cur.execute("""
            INSERT OR IGNORE INTO app_settings(key, value, updated_at)
            VALUES (?, ?, ?)
        """, ('native_ocr_mode', '1', now()))

    if USE_POSTGRES:
        cur.execute("SELECT to_regclass('public.warehouse_cells')")
        table_exists = cur.fetchone()[0] is not None

        if table_exists:
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'warehouse_cells'
                ORDER BY ordinal_position
            """)
            existing_cols = {r[0] for r in cur.fetchall()}
        else:
            existing_cols = set()

        legacy_schema = table_exists and ('area' in existing_cols or 'zone' not in existing_cols or 'column_index' not in existing_cols or 'slot_type' not in existing_cols or 'slot_number' not in existing_cols)

        if legacy_schema:
            cur.execute("SELECT to_regclass('public.warehouse_cells_legacy')")
            legacy_exists = cur.fetchone()[0] is not None
            if not legacy_exists:
                cur.execute('ALTER TABLE warehouse_cells RENAME TO warehouse_cells_legacy')
            cur.execute(f"""CREATE TABLE IF NOT EXISTS warehouse_cells (
                id {pk},
                zone {text} NOT NULL,
                column_index INTEGER NOT NULL,
                slot_type {text} NOT NULL,
                slot_number INTEGER NOT NULL,
                items_json {text},
                note {text},
                updated_at {text},
                UNIQUE(zone, column_index, slot_type, slot_number)
            )""")

            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'warehouse_cells_legacy'
                ORDER BY ordinal_position
            """)
            legacy_cols = {r[0] for r in cur.fetchall()}

            def pick(*names, default_sql=None):
                for name in names:
                    if name in legacy_cols:
                        return f'"{name}"'
                return default_sql

            zone_expr = pick('zone', 'area', default_sql="'A'")
            col_expr = pick('column_index', 'col', 'column', default_sql='1')
            slot_type_expr = pick('slot_type', 'front_back', 'side', default_sql="'direct'")
            slot_num_expr = pick('slot_number', 'row', 'position', default_sql='1')
            items_expr = pick('items_json', default_sql="'[]'")
            note_expr = pick('note', 'memo', 'remark', default_sql="''")
            updated_expr = pick('updated_at', 'created_at', default_sql=f"'{now()}'")

            cur.execute(f"""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                SELECT
                    COALESCE(NULLIF({zone_expr}::text, ''), 'A'),
                    COALESCE({col_expr}::integer, 1),
                    COALESCE(NULLIF({slot_type_expr}::text, ''), 'direct'),
                    COALESCE({slot_num_expr}::integer, 1),
                    COALESCE({items_expr}::text, '[]'),
                    COALESCE({note_expr}::text, ''),
                    COALESCE({updated_expr}::text, '{now()}')
                FROM warehouse_cells_legacy
                ON CONFLICT (zone, column_index, slot_type, slot_number) DO NOTHING
            """)
        else:
            cur.execute(f"""CREATE TABLE IF NOT EXISTS warehouse_cells (
                id {pk},
                zone {text} NOT NULL,
                column_index INTEGER NOT NULL,
                slot_type {text} NOT NULL,
                slot_number INTEGER NOT NULL,
                items_json {text},
                note {text},
                updated_at {text},
                UNIQUE(zone, column_index, slot_type, slot_number)
            )""")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS zone TEXT")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS column_index INTEGER")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_type TEXT")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_number INTEGER")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT")
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_cells_slot
                ON warehouse_cells(zone, column_index, slot_type, slot_number)
            """)

        for zone in ('A', 'B'):
            for col in range(1, 7):
                for num in range(1, 21):
                    cur.execute("""
                        INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                        SELECT %s, %s, %s, %s, %s, %s, %s
                        WHERE NOT EXISTS (
                            SELECT 1 FROM warehouse_cells
                            WHERE zone = %s AND column_index = %s AND slot_type = %s AND slot_number = %s
                        )
                    """, (zone, col, 'direct', num, '[]', '', now(), zone, col, 'direct', num))
    else:
        cur.execute(f"""CREATE TABLE IF NOT EXISTS warehouse_cells (
            id {pk},
            zone {text} NOT NULL,
            column_index INTEGER NOT NULL,
            slot_type {text} NOT NULL,
            slot_number INTEGER NOT NULL,
            items_json {text},
            note {text},
            updated_at {text},
            UNIQUE(zone, column_index, slot_type, slot_number)
        )""")
        for zone in ('A', 'B'):
            for col in range(1, 7):
                for num in range(1, 21):
                    cur.execute("""
                        INSERT OR IGNORE INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (zone, col, 'direct', num, '[]', '', now()))

    # normalize warehouse to direct 1-20 model
    try:
        cur.execute(sql("SELECT zone, column_index, slot_type, slot_number, items_json, note, updated_at FROM warehouse_cells ORDER BY zone, column_index, slot_number"))
        raw_cells = rows_to_dict(cur)
        direct_map = {}
        for cell in raw_cells:
            zone = (cell.get('zone') or 'A').strip().upper()
            col = int(cell.get('column_index') or 1)
            slot_type = (cell.get('slot_type') or 'direct').strip().lower()
            slot_no = int(cell.get('slot_number') or 1)
            if slot_type == 'back':
                slot_no += 10
            elif slot_type == 'front':
                slot_no = slot_no
            key = (zone, col, slot_no)
            prev = direct_map.get(key)
            if prev:
                prev['items_json'] = _merge_json_item_lists(prev.get('items_json'), cell.get('items_json'))
                prev['note'] = prev.get('note') or cell.get('note') or ''
                prev['updated_at'] = max(str(prev.get('updated_at') or ''), str(cell.get('updated_at') or ''))
            else:
                direct_map[key] = {'zone': zone, 'column_index': col, 'slot_type': 'direct', 'slot_number': slot_no, 'items_json': cell.get('items_json') or '[]', 'note': cell.get('note') or '', 'updated_at': cell.get('updated_at') or now()}
        cur.execute(sql("DELETE FROM warehouse_cells"))
        for zone in ('A','B'):
            for col in range(1, 7):
                max_slot = max([20] + [k[2] for k in direct_map.keys() if k[0] == zone and k[1] == col])
                for num in range(1, max_slot + 1):
                    row = direct_map.get((zone, col, num), {'items_json': '[]', 'note': '', 'updated_at': now()})
                    cur.execute(sql("""
                        INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """), (zone, col, 'direct', num, row.get('items_json') or '[]', row.get('note') or '', row.get('updated_at') or now()))
    except Exception as e:
        log_error('warehouse_normalize_direct_model', str(e))

    conn.commit()
    conn.close()

def get_user(username):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM users WHERE username = ?"), (username,))
    row = fetchone_dict(cur)
    conn.close()
    return row

def create_user(username, password):
    conn = get_db()
    cur = conn.cursor()
    role = 'admin' if username == '陳韋廷' else 'user'
    hashed = generate_password_hash(password)
    cur.execute(sql("""
        INSERT INTO users(username, password, role, is_blocked, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """), (username, hashed, role, 0, now(), now()))
    conn.commit()
    conn.close()

def update_password(username, new_password):
    conn = get_db()
    cur = conn.cursor()
    hashed = generate_password_hash(new_password)
    cur.execute(sql("""
        UPDATE users SET password = ?, updated_at = ?
        WHERE username = ?
    """), (hashed, now(), username))
    conn.commit()
    conn.close()

def verify_password(stored_password, provided_password):
    if not stored_password:
        return False
    try:
        if stored_password.startswith('pbkdf2:') or stored_password.startswith('scrypt:'):
            return check_password_hash(stored_password, provided_password)
    except Exception:
        pass
    return stored_password == provided_password

def list_users():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT username, role, COALESCE(is_blocked,0) AS is_blocked, created_at, updated_at FROM users ORDER BY created_at DESC, username ASC"))
    rows = rows_to_dict(cur)
    conn.close()
    return rows

def set_user_blocked(username, blocked):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("UPDATE users SET is_blocked = ?, updated_at = ? WHERE username = ?"), (1 if blocked else 0, now(), username))
    conn.commit()
    conn.close()


def set_user_role(username, role):
    role = (role or 'user').strip().lower()
    if role not in ('admin', 'user', 'viewer'):
        role = 'user'
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("UPDATE users SET role = ?, updated_at = ? WHERE username = ?"), (role, now(), username))
    conn.commit()
    conn.close()

def get_ocr_usage(engine, period):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT count FROM ocr_usage WHERE engine = ? AND period = ?"), (engine, period))
    row = cur.fetchone()
    conn.close()
    if not row:
        return 0
    return int(row[0] if USE_POSTGRES else row['count'])

def increment_ocr_usage(engine, period):
    conn = get_db()
    cur = conn.cursor()
    if USE_POSTGRES:
        cur.execute("""
            INSERT INTO ocr_usage(engine, period, count, updated_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (engine, period) DO UPDATE SET count = ocr_usage.count + 1, updated_at = EXCLUDED.updated_at
        """, (engine, period, 1, now()))
    else:
        cur.execute("""
            INSERT INTO ocr_usage(engine, period, count, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(engine, period) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
        """, (engine, period, 1, now()))
    conn.commit()
    conn.close()

def log_action(username, action):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("""
        INSERT INTO logs(username, action, created_at)
        VALUES (?, ?, ?)
    """), (username, action, now()))
    conn.commit()
    conn.close()

def image_hash_exists(image_hash):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT id FROM image_hashes WHERE image_hash = ?"), (image_hash,))
    row = cur.fetchone()
    conn.close()
    return row is not None

def save_image_hash(image_hash):
    conn = get_db()
    cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute("""
                INSERT INTO image_hashes(image_hash, created_at)
                VALUES (%s, %s)
                ON CONFLICT (image_hash) DO NOTHING
            """, (image_hash, now()))
        else:
            cur.execute("""
                INSERT OR IGNORE INTO image_hashes(image_hash, created_at)
                VALUES (?, ?)
            """, (image_hash, now()))
        conn.commit()
    except Exception as e:
        conn.rollback()
        log_error("save_image_hash", e)
    conn.close()

def save_correction(wrong, correct):
    conn = get_db()
    cur = conn.cursor()
    if USE_POSTGRES:
        cur.execute("""
            INSERT INTO corrections(wrong_text, correct_text, updated_at)
            VALUES (%s, %s, %s)
            ON CONFLICT (wrong_text) DO UPDATE SET correct_text = EXCLUDED.correct_text, updated_at = EXCLUDED.updated_at
        """, (wrong, correct, now()))
    else:
        cur.execute("""
            INSERT INTO corrections(wrong_text, correct_text, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(wrong_text) DO UPDATE SET correct_text=excluded.correct_text, updated_at=excluded.updated_at
        """, (wrong, correct, now()))
    conn.commit()
    conn.close()

def get_corrections():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT wrong_text, correct_text FROM corrections"))
    rows = rows_to_dict(cur)
    conn.close()
    return {r["wrong_text"]: r["correct_text"] for r in rows}

def get_setting(key, default=None):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT value FROM app_settings WHERE key = ?"), (key,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return default
    return row[0] if USE_POSTGRES else row['value']


def set_setting(key, value):
    conn = get_db()
    cur = conn.cursor()
    if USE_POSTGRES:
        cur.execute("""
            INSERT INTO app_settings(key, value, updated_at)
            VALUES (%s, %s, %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
        """, (key, str(value), now()))
    else:
        cur.execute("""
            INSERT INTO app_settings(key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
        """, (key, str(value), now()))
    conn.commit()
    conn.close()


def upsert_customer(name, phone="", address="", notes="", region="北區"):
    conn = get_db()
    cur = conn.cursor()
    if USE_POSTGRES:
        cur.execute("""
            INSERT INTO customer_profiles(name, phone, address, notes, region, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT(name) DO UPDATE SET phone=EXCLUDED.phone, address=EXCLUDED.address, notes=EXCLUDED.notes, region=EXCLUDED.region, updated_at=EXCLUDED.updated_at
        """, (name, phone, address, notes, region, now(), now()))
    else:
        cur.execute("""
            INSERT INTO customer_profiles(name, phone, address, notes, region, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET phone=excluded.phone, address=excluded.address, notes=excluded.notes, region=excluded.region, updated_at=excluded.updated_at
        """, (name, phone, address, notes, region, now(), now()))
    conn.commit()
    conn.close()

def get_customers():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM customer_profiles ORDER BY region, name"))
    rows = rows_to_dict(cur)
    conn.close()
    return rows

def get_customer(name):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM customer_profiles WHERE name = ?"), (name,))
    row = fetchone_dict(cur)
    conn.close()
    return row

def save_inventory_item(product_text, product_code, qty, location="", customer_name="", operator="", source_text="", material=""):
    conn = get_db()
    cur = conn.cursor()
    material = normalize_material(material)
    cur.execute(sql("""
        SELECT id, qty FROM inventory
        WHERE product_text = ? AND COALESCE(location, '') = COALESCE(?, '') AND COALESCE(material, '') = COALESCE(?, '')
    """), (product_text, location, material))
    row = cur.fetchone()
    if row:
        rid = row[0] if USE_POSTGRES else row["id"]
        cur.execute(sql("""
            UPDATE inventory
            SET qty = qty + ?, product_code = ?, material = ?, customer_name = ?, operator = ?, source_text = ?, updated_at = ?
            WHERE id = ?
        """), (qty, product_code, material, customer_name, operator, source_text, now(), rid))
    else:
        cur.execute(sql("""
            INSERT INTO inventory(product_text, product_code, material, qty, location, customer_name, operator, source_text, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """), (product_text, product_code, material, qty, location, customer_name, operator, source_text, now(), now()))
    conn.commit()
    conn.close()

def list_inventory():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM inventory ORDER BY updated_at DESC, id DESC"))
    rows = rows_to_dict(cur)
    conn.close()
    return rows

def save_order(customer_name, items, operator):
    conn = get_db()
    cur = conn.cursor()
    for item in items:
        cur.execute(sql("""
            INSERT INTO orders(customer_name, product_text, product_code, material, qty, status, operator, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        """), (customer_name, item["product_text"], item.get("product_code", ""), normalize_material(item.get("material", "")), int(item["qty"]), operator, now(), now()))
    conn.commit()
    conn.close()

def save_master_order(customer_name, items, operator):
    conn = get_db()
    cur = conn.cursor()
    for item in items:
        material = normalize_material(item.get("material", ""))
        cur.execute(sql("""
            SELECT id FROM master_orders WHERE customer_name = ? AND product_text = ? AND COALESCE(material, '') = COALESCE(?, '')
        """), (customer_name, item["product_text"], material))
        row = cur.fetchone()
        if row:
            rid = row[0] if USE_POSTGRES else row["id"]
            cur.execute(sql("""
                UPDATE master_orders SET qty = qty + ?, product_code = ?, material = ?, operator = ?, updated_at = ?
                WHERE id = ?
            """), (int(item["qty"]), item.get("product_code", ""), material, operator, now(), rid))
        else:
            cur.execute(sql("""
                INSERT INTO master_orders(customer_name, product_text, product_code, material, qty, operator, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """), (customer_name, item["product_text"], item.get("product_code", ""), material, int(item["qty"]), operator, now(), now()))
    conn.commit()
    conn.close()

def get_orders():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM orders ORDER BY id DESC"))
    rows = rows_to_dict(cur)
    conn.close()
    return rows

def get_master_orders():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM master_orders ORDER BY id DESC"))
    rows = rows_to_dict(cur)
    conn.close()
    return rows

def _deduct_from_table(cur, table, customer_name, product_text, qty_needed, material=''):
    material = normalize_material(material)
    cur.execute(sql(f"""
        SELECT id, qty
        FROM {table}
        WHERE customer_name = ? AND product_text = ? AND COALESCE(material, '') = COALESCE(?, '') AND qty > 0
        ORDER BY id ASC
    """), (customer_name, product_text, material))
    rows = cur.fetchall()
    total = 0
    for row in rows:
        total += row[1] if USE_POSTGRES else row["qty"]
    if total < qty_needed:
        return False, []
    remain = qty_needed
    used = []
    for row in rows:
        rid = row[0] if USE_POSTGRES else row["id"]
        stock = row[1] if USE_POSTGRES else row["qty"]
        use_qty = min(stock, remain)
        cur.execute(sql(f"""
            UPDATE {table}
            SET qty = qty - ?, updated_at = ?
            WHERE id = ?
        """), (use_qty, now(), rid))
        used.append({"id": rid, "qty": use_qty})
        remain -= use_qty
        if remain <= 0:
            break
    return True, used

def _deduct_from_inventory(cur, product_text, qty_needed, material=''):
    material = normalize_material(material)
    cur.execute(sql("""
        SELECT id, qty
        FROM inventory
        WHERE product_text = ? AND COALESCE(material, '') = COALESCE(?, '') AND qty > 0
        ORDER BY qty DESC, id ASC
    """), (product_text, material))
    rows = cur.fetchall()
    total = sum((r[1] if USE_POSTGRES else r["qty"]) for r in rows)
    if total < qty_needed:
        return False, []
    remain = qty_needed
    used = []
    for row in rows:
        rid = row[0] if USE_POSTGRES else row["id"]
        stock = row[1] if USE_POSTGRES else row["qty"]
        use_qty = min(stock, remain)
        cur.execute(sql("""
            UPDATE inventory SET qty = qty - ?, updated_at = ? WHERE id = ?
        """), (use_qty, now(), rid))
        used.append({"id": rid, "qty": use_qty})
        remain -= use_qty
        if remain <= 0:
            break
    return True, used

def _sum_available(cur, table, customer_name, product_text, material=''):
    material = normalize_material(material)
    cur.execute(sql(f"SELECT COALESCE(SUM(qty),0) AS total FROM {table} WHERE customer_name = ? AND product_text = ? AND COALESCE(material, '') = COALESCE(?, '') AND qty > 0"), (customer_name, product_text, material))
    row = fetchone_dict(cur) or {}
    return int(row.get('total') or 0)

def _sum_inventory(cur, product_text, material=''):
    material = normalize_material(material)
    cur.execute(sql("SELECT COALESCE(SUM(qty),0) AS total FROM inventory WHERE product_text = ? AND COALESCE(material, '') = COALESCE(?, '') AND qty > 0"), (product_text, material))
    row = fetchone_dict(cur) or {}
    return int(row.get('total') or 0)

def _deduct_from_table_partial(cur, table, customer_name, product_text, qty_target, material=''):
    qty_target = int(qty_target or 0)
    material = normalize_material(material)
    if qty_target <= 0:
        return []
    cur.execute(sql(f"""
        SELECT id, qty
        FROM {table}
        WHERE customer_name = ? AND product_text = ? AND COALESCE(material, '') = COALESCE(?, '') AND qty > 0
        ORDER BY id ASC
    """), (customer_name, product_text, material))
    rows = cur.fetchall()
    remain = qty_target
    used = []
    for row in rows:
        rid = row[0] if USE_POSTGRES else row["id"]
        stock = row[1] if USE_POSTGRES else row["qty"]
        use_qty = min(int(stock), remain)
        if use_qty <= 0:
            continue
        cur.execute(sql(f"UPDATE {table} SET qty = qty - ?, updated_at = ? WHERE id = ?"), (use_qty, now(), rid))
        used.append({"id": rid, "qty": use_qty})
        remain -= use_qty
        if remain <= 0:
            break
    return used

def _warehouse_locations_for_product(product_text, qty_needed=None, material=''):
    material = normalize_material(material)
    cells = warehouse_get_cells()
    out = []
    for cell in cells:
        try:
            items = json.loads(cell.get('items_json') or '[]')
        except Exception:
            items = []
        visual_num = int(cell.get('slot_number') or 0)
        for it in items:
            if (it.get('product_text') or '') == product_text and normalize_material(it.get('material') or '') == material and int(it.get('qty') or 0) > 0:
                out.append({'zone': cell.get('zone'), 'column_index': int(cell.get('column_index') or 0), 'slot_type': 'direct', 'slot_number': visual_num, 'visual_slot': visual_num, 'qty': int(it.get('qty') or 0), 'product_text': it.get('product_text') or '', 'material': normalize_material(it.get('material') or '')})
                break
    out.sort(key=lambda r: (r.get('zone') or '', int(r.get('column_index') or 0), int(r.get('slot_number') or 0)))
    if qty_needed is None:
        return out
    remain = int(qty_needed or 0)
    plan = []
    for row in out:
        if remain <= 0:
            break
        take = min(int(row.get('qty') or 0), remain)
        plan.append({**row, 'ship_qty': take, 'remain_after': max(0, remain - take)})
        remain -= take
    return plan

def preview_ship_order(customer_name, items):
    conn = get_db()
    cur = conn.cursor()
    preview_items = []
    needs_inventory_fallback = False
    message = '出貨預覽完成'
    for item in items:
        product_text = item['product_text']
        material = normalize_material(item.get('material') or '')
        qty_needed = int(item.get('qty') or 0)
        master_available = _sum_available(cur, 'master_orders', customer_name, product_text, material)
        order_available = _sum_available(cur, 'orders', customer_name, product_text, material)
        inventory_available = _sum_inventory(cur, product_text, material)
        strict_ok = master_available >= qty_needed and order_available >= qty_needed and inventory_available >= qty_needed
        inventory_only_ok = inventory_available >= qty_needed
        needs_fallback = (master_available < qty_needed or order_available < qty_needed) and inventory_only_ok
        needs_inventory_fallback = needs_inventory_fallback or needs_fallback
        recommendation = '可正常出貨' if strict_ok else ('可改扣庫存' if needs_fallback else '庫存不足，請確認')
        shortage_reasons = []
        if master_available < qty_needed:
            shortage_reasons.append(f"總單不足 {master_available}/{qty_needed}")
        if order_available < qty_needed:
            shortage_reasons.append(f"訂單不足 {order_available}/{qty_needed}")
        if inventory_available < qty_needed:
            shortage_reasons.append(f"庫存不足 {inventory_available}/{qty_needed}")
        preview_items.append({
            'product_text': product_text,
            'material': material,
            'qty': qty_needed,
            'master_available': master_available,
            'order_available': order_available,
            'inventory_available': inventory_available,
            'recommendation': recommendation,
            'shortage_reasons': shortage_reasons,
            'locations': _warehouse_locations_for_product(product_text, qty_needed, material),
        })
    conn.close()
    return {"success": True, "items": preview_items, "needs_inventory_fallback": needs_inventory_fallback, "message": message}

def ship_order(customer_name, items, operator, allow_inventory_fallback=False):
    conn = get_db()
    cur = conn.cursor()
    breakdown = []
    try:
        for item in items:
            product_text = item["product_text"]
            material = normalize_material(item.get('material') or '')
            qty_needed = int(item["qty"])
            master_available = _sum_available(cur, "master_orders", customer_name, product_text, material)
            order_available = _sum_available(cur, "orders", customer_name, product_text, material)
            inventory_available = _sum_inventory(cur, product_text, material)
            strict_ok = master_available >= qty_needed and order_available >= qty_needed and inventory_available >= qty_needed
            if strict_ok:
                used_master = _deduct_from_table_partial(cur, "master_orders", customer_name, product_text, qty_needed, material)
                used_order = _deduct_from_table_partial(cur, "orders", customer_name, product_text, qty_needed, material)
                ok3, used_inv = _deduct_from_inventory(cur, product_text, qty_needed, material)
                if not ok3:
                    conn.rollback()
                    return {"success": False, "error": f"{product_text} 庫存不足"}
                note = "已出貨"
                used_inventory_fallback = False
            else:
                if not allow_inventory_fallback:
                    reasons = []
                    if master_available < qty_needed:
                        reasons.append(f"總單不足({master_available}/{qty_needed})")
                    if order_available < qty_needed:
                        reasons.append(f"訂單不足({order_available}/{qty_needed})")
                    if inventory_available < qty_needed:
                        reasons.append(f"庫存不足({inventory_available}/{qty_needed})")
                    return {"success": False, "requires_inventory_fallback": True, "error": f"{product_text}「{'、'.join(reasons)}」，是否改扣庫存？"}
                if inventory_available < qty_needed:
                    conn.rollback()
                    return {"success": False, "error": f"{product_text} 庫存不足，無法改扣庫存"}
                used_master = _deduct_from_table_partial(cur, "master_orders", customer_name, product_text, min(master_available, qty_needed), material)
                used_order = _deduct_from_table_partial(cur, "orders", customer_name, product_text, min(order_available, qty_needed), material)
                ok3, used_inv = _deduct_from_inventory(cur, product_text, qty_needed, material)
                if not ok3:
                    conn.rollback()
                    return {"success": False, "error": f"{product_text} 庫存不足"}
                note = "庫存補扣出貨"
                used_inventory_fallback = True
            cur.execute(sql("""
                INSERT INTO shipping_records(customer_name, product_text, product_code, material, qty, operator, shipped_at, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """), (customer_name, product_text, item.get("product_code", ""), material, qty_needed, operator, now(), note))
            breakdown.append({
                "product_text": product_text,
                "material": material,
                "qty": qty_needed,
                "master_deduct": sum(x["qty"] for x in used_master),
                "order_deduct": sum(x["qty"] for x in used_order),
                "inventory_deduct": sum(x["qty"] for x in used_inv),
                "master_details": used_master,
                "order_details": used_order,
                "inventory_details": used_inv,
                "used_inventory_fallback": used_inventory_fallback,
                "note": note,
                "locations": _warehouse_locations_for_product(product_text, qty_needed, material),
                "remaining_after": {
                    "master": max(0, master_available - sum(x["qty"] for x in used_master)),
                    "order": max(0, order_available - sum(x["qty"] for x in used_order)),
                    "inventory": max(0, inventory_available - sum(x["qty"] for x in used_inv)),
                }
            })
        conn.commit()
        return {"success": True, "breakdown": breakdown}
    except Exception as e:
        conn.rollback()
        log_error('ship_order', e)
        return {"success": False, "error": "出貨失敗"}
    finally:
        conn.close()

def get_shipping_records(start_date=None, end_date=None, q=""):
    conn = get_db()
    cur = conn.cursor()
    query = "SELECT * FROM shipping_records WHERE 1=1"
    params = []
    if start_date:
        query += " AND date(shipped_at) >= date(?)"
        params.append(start_date)
    if end_date:
        query += " AND date(shipped_at) <= date(?)"
        params.append(end_date)
    if q:
        query += " AND (customer_name LIKE ? OR product_text LIKE ? OR operator LIKE ?)"
        like = f"%{q}%"
        params.extend([like, like, like])
    query += " ORDER BY id DESC"
    cur.execute(sql(query), tuple(params))
    rows = rows_to_dict(cur)
    conn.close()
    return rows

def warehouse_get_cells():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM warehouse_cells WHERE COALESCE(slot_type, 'direct') = ? ORDER BY zone, column_index, slot_number"), ('direct',))
    rows = rows_to_dict(cur)
    conn.close()
    return rows

def warehouse_get_cell(zone, column_index, slot_type, slot_number):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("""
        SELECT * FROM warehouse_cells
        WHERE zone = ? AND column_index = ? AND COALESCE(slot_type, 'direct') = ? AND slot_number = ?
    """), (zone, column_index, slot_type, slot_number))
    row = fetchone_dict(cur)
    conn.close()
    return row

def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=""):
    conn = get_db()
    cur = conn.cursor()
    slot_type = 'direct'
    items_json = json.dumps(items, ensure_ascii=False)
    if USE_POSTGRES:
        cur.execute("""
            UPDATE warehouse_cells
            SET items_json = %s, note = %s, updated_at = %s
            WHERE zone = %s AND column_index = %s AND COALESCE(slot_type, 'direct') = %s AND slot_number = %s
        """, (items_json, note, now(), zone, column_index, slot_type, slot_number))
        if cur.rowcount == 0:
            cur.execute("""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (zone, column_index, slot_type, slot_number, items_json, note, now()))
    else:
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET items_json = ?, note = ?, updated_at = ?
            WHERE zone = ? AND column_index = ? AND COALESCE(slot_type, 'direct') = ? AND slot_number = ?
        """), (items_json, note, now(), zone, column_index, slot_type, slot_number))
        if cur.rowcount == 0:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """), (zone, column_index, slot_type, slot_number, items_json, note, now()))
    conn.commit()
    conn.close()

def warehouse_add_column(zone):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT COALESCE(MAX(column_index), 0) AS max_col FROM warehouse_cells WHERE zone = ?"), (zone,))
    row = fetchone_dict(cur) or {}
    next_col = int(row.get('max_col') or 0) + 1
    for num in range(1, 21):
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """), (zone, next_col, 'direct', num, '[]', '__USER_ADDED__', now()))
    conn.commit(); conn.close(); return next_col

def warehouse_add_slot(zone, column_index, slot_type='direct'):
    conn = get_db(); cur = conn.cursor()
    cur.execute(sql("SELECT COALESCE(MAX(slot_number), 0) AS max_slot FROM warehouse_cells WHERE zone = ? AND column_index = ? AND COALESCE(slot_type,'direct') = ?"), (zone, column_index, 'direct'))
    row = fetchone_dict(cur) or {}
    next_slot = int(row.get('max_slot') or 0) + 1
    cur.execute(sql("""
        INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """), (zone, column_index, 'direct', next_slot, '[]', '__USER_ADDED_SLOT__', now()))
    conn.commit(); conn.close(); return next_slot

def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    conn = get_db(); cur = conn.cursor()
    cur.execute(sql("SELECT items_json FROM warehouse_cells WHERE zone = ? AND column_index = ? AND COALESCE(slot_type,'direct') = ? AND slot_number = ?"), (zone, column_index, 'direct', slot_number))
    row = fetchone_dict(cur)
    if not row:
        conn.close(); return {'success': False, 'error': '找不到格子'}
    try:
        items = json.loads(row.get('items_json') or '[]')
    except Exception:
        items = []
    if items:
        conn.close(); return {'success': False, 'error': '格子內還有商品，無法刪除'}
    cur.execute(sql("DELETE FROM warehouse_cells WHERE zone = ? AND column_index = ? AND COALESCE(slot_type,'direct') = ? AND slot_number = ?"), (zone, column_index, 'direct', slot_number))
    conn.commit(); conn.close(); return {'success': True}

def warehouse_move_item(from_key, to_key, product_text, qty, material=''):
    conn = get_db()
    cur = conn.cursor()
    try:
        material = normalize_material(material)
        def _norm(key):
            if len(key) == 4:
                zone, column_index, _slot_type, slot_number = key
            else:
                zone, column_index, slot_number = key
            return zone, int(column_index), 'direct', int(slot_number)
        def _load(key):
            zone, column_index, slot_type, slot_number = _norm(key)
            cur.execute(sql("""
                SELECT * FROM warehouse_cells
                WHERE zone = ? AND column_index = ? AND COALESCE(slot_type,'direct') = ? AND slot_number = ?
            """), (zone, column_index, slot_type, slot_number))
            return fetchone_dict(cur)
        src = _load(from_key)
        dst = _load(to_key)
        if not src or not dst:
            return {'success': False, 'error': '找不到來源或目標格位'}
        src_items = json.loads(src.get('items_json') or '[]')
        dst_items = json.loads(dst.get('items_json') or '[]')
        moved = []
        remain = qty
        new_src = []
        for it in src_items:
            if it.get('product_text') == product_text and normalize_material(it.get('material') or '') == material and remain > 0:
                take = min(int(it.get('qty', 0)), remain)
                remain -= take
                moved.append({**it, 'qty': take, 'material': normalize_material(it.get('material') or '')})
                leftover = int(it.get('qty', 0)) - take
                if leftover > 0:
                    new_src.append({**it, 'qty': leftover, 'material': normalize_material(it.get('material') or '')})
            else:
                new_src.append(it)
        if remain > 0:
            return {'success': False, 'error': '來源格位數量不足'}
        merged = {}
        for it in dst_items + moved:
            k = ((it.get('product_text') or '').strip(), (it.get('customer_name') or '').strip(), normalize_material(it.get('material') or ''))
            if k not in merged:
                merged[k] = dict(it)
                merged[k]['qty'] = int(it.get('qty') or 0)
                merged[k]['material'] = normalize_material(it.get('material') or '')
            else:
                merged[k]['qty'] = int(merged[k].get('qty') or 0) + int(it.get('qty') or 0)
        from_zone, from_col, _, from_slot = _norm(from_key)
        to_zone, to_col, _, to_slot = _norm(to_key)
        cur.execute(sql("UPDATE warehouse_cells SET items_json = ?, updated_at = ? WHERE zone = ? AND column_index = ? AND COALESCE(slot_type,'direct') = ? AND slot_number = ?"), (json.dumps(new_src, ensure_ascii=False), now(), from_zone, from_col, 'direct', from_slot))
        cur.execute(sql("UPDATE warehouse_cells SET items_json = ?, updated_at = ? WHERE zone = ? AND column_index = ? AND COALESCE(slot_type,'direct') = ? AND slot_number = ?"), (json.dumps(list(merged.values()), ensure_ascii=False), now(), to_zone, to_col, 'direct', to_slot))
        conn.commit()
        return {'success': True}
    except Exception as e:
        conn.rollback()
        log_error('warehouse_move_item', e)
        return {'success': False, 'error': '拖曳失敗'}
    finally:
        conn.close()

def inventory_placements():
    cells = warehouse_get_cells()
    placement = {}
    for cell in cells:
        try:
            items = json.loads(cell.get("items_json") or "[]")
        except Exception:
            items = []
        for it in items:
            key = product_material_key(it.get("product_text") or it.get("product") or "", it.get('material') or '')
            placement[key] = placement.get(key, 0) + int(it.get("qty", 0))
    return placement

def inventory_summary():
    rows = list_inventory()
    placement = inventory_placements()
    result = []
    for r in rows:
        material = normalize_material(r.get('material') or '')
        placed = placement.get(product_material_key(r["product_text"], material), 0)
        qty = int(r.get("qty", 0))
        result.append({
            **r,
            'material': material,
            "placed_qty": placed,
            "unplaced_qty": max(0, qty - placed),
            "needs_red": max(0, qty - placed) > 0
        })
    return result

def warehouse_summary():
    cells = warehouse_get_cells()
    zones = {'A': {}, 'B': {}}
    for cell in cells:
        zone = cell['zone']
        col = int(cell['column_index'])
        num = int(cell['slot_number'])
        zones.setdefault(zone, {}).setdefault(col, {})[num] = cell
    return zones

def ensure_todo_table(cur):
    pk = 'SERIAL PRIMARY KEY' if USE_POSTGRES else 'INTEGER PRIMARY KEY AUTOINCREMENT'
    text_type = 'TEXT'
    cur.execute(f"""CREATE TABLE IF NOT EXISTS todo_items (
        id {pk},
        note {text_type},
        due_date {text_type},
        image_filename {text_type},
        created_by {text_type},
        created_at {text_type},
        updated_at {text_type}
    )""")
    if USE_POSTGRES:
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS note TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS due_date TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS image_filename TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS created_by TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS created_at TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS updated_at TEXT')
    else:
        cur.execute('PRAGMA table_info(todo_items)')
        cols = {r[1] for r in cur.fetchall()}
        for col in ('note','due_date','image_filename','created_by','created_at','updated_at'):
            if col not in cols:
                cur.execute(f'ALTER TABLE todo_items ADD COLUMN {col} TEXT')

def create_todo_item(note='', due_date='', image_filename='', created_by=''):
    conn = get_db()
    cur = conn.cursor()
    created = None
    try:
        ensure_todo_table(cur)
        created_at = now()
        cur.execute(sql('INSERT INTO todo_items(note, due_date, image_filename, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'), ((note or '').strip(), (due_date or '').strip(), (image_filename or '').strip(), (created_by or '').strip(), created_at, created_at))
        if USE_POSTGRES:
            cur.execute("SELECT currval(pg_get_serial_sequence('todo_items', 'id')) AS id")
            row = fetchone_dict(cur) or {}
            created_id = row.get('id')
        else:
            created_id = cur.lastrowid
        conn.commit()
        created = {
            'id': int(created_id or 0),
            'note': (note or '').strip(),
            'due_date': (due_date or '').strip(),
            'image_filename': (image_filename or '').strip(),
            'created_by': (created_by or '').strip(),
            'created_at': created_at,
            'updated_at': created_at,
        }
        return created
    except Exception as e:
        conn.rollback()
        log_error('create_todo_item', e)
        raise
    finally:
        conn.close()


def list_todo_items():
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_todo_table(cur)
        today = now()[:10]
        cur.execute(sql("SELECT * FROM todo_items ORDER BY CASE WHEN COALESCE(due_date, '') = '' THEN 3 WHEN due_date = ? THEN 0 WHEN due_date > ? THEN 1 ELSE 2 END, due_date ASC, created_at DESC, id DESC"), (today, today))
        rows = rows_to_dict(cur)
        conn.commit()
        return rows
    finally:
        conn.close()


def get_todo_item(todo_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_todo_table(cur)
        cur.execute(sql('SELECT * FROM todo_items WHERE id = ?'), (int(todo_id),))
        row = fetchone_dict(cur)
        conn.commit()
        return row
    finally:
        conn.close()


def delete_todo_item(todo_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_todo_table(cur)
        cur.execute(sql('DELETE FROM todo_items WHERE id = ?'), (int(todo_id),))
        conn.commit()
    finally:
        conn.close()


def list_backups():
    import os
    files = []
    backup_dir = "backups"
    if not os.path.isdir(backup_dir):
        return {"success": True, "files": []}
    for filename in os.listdir(backup_dir):
        path = os.path.join(backup_dir, filename)
        if os.path.isfile(path):
            files.append({
                "filename": filename,
                "size": os.path.getsize(path),
                "created_at": datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%d %H:%M:%S")
            })
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return {"success": True, "files": files}


def register_submit_request(request_key, endpoint=''):
    request_key = (request_key or '').strip()
    if not request_key:
        return True
    conn = get_db()
    cur = conn.cursor()
    created = False
    try:
        if USE_POSTGRES:
            cur.execute("INSERT INTO submit_requests(request_key, endpoint, created_at) VALUES (%s, %s, %s) ON CONFLICT (request_key) DO NOTHING", (request_key, endpoint, now()))
        else:
            cur.execute("INSERT OR IGNORE INTO submit_requests(request_key, endpoint, created_at) VALUES (?, ?, ?)", (request_key, endpoint, now()))
        created = (cur.rowcount or 0) > 0
        conn.commit()
    except Exception as e:
        conn.rollback()
        log_error('register_submit_request', e)
    finally:
        conn.close()
    return created

def list_corrections_rows():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql('SELECT wrong_text, correct_text, updated_at FROM corrections ORDER BY updated_at DESC, wrong_text ASC'))
    rows = rows_to_dict(cur)
    conn.close()
    return rows

def delete_correction(wrong_text):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql('DELETE FROM corrections WHERE wrong_text = ?'), ((wrong_text or '').strip(),))
    conn.commit()
    conn.close()

def save_customer_alias(alias, target_name):
    alias = (alias or '').strip()
    target_name = (target_name or '').strip()
    if not alias or not target_name:
        return
    conn = get_db()
    cur = conn.cursor()
    if USE_POSTGRES:
        cur.execute("INSERT INTO customer_aliases(alias, target_name, updated_at) VALUES (%s, %s, %s) ON CONFLICT (alias) DO UPDATE SET target_name = EXCLUDED.target_name, updated_at = EXCLUDED.updated_at", (alias, target_name, now()))
    else:
        cur.execute("INSERT INTO customer_aliases(alias, target_name, updated_at) VALUES (?, ?, ?) ON CONFLICT(alias) DO UPDATE SET target_name=excluded.target_name, updated_at=excluded.updated_at", (alias, target_name, now()))
    conn.commit()
    conn.close()

def list_customer_aliases():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql('SELECT alias, target_name, updated_at FROM customer_aliases ORDER BY updated_at DESC, alias ASC'))
    rows = rows_to_dict(cur)
    conn.close()
    return rows

def get_customer_aliases_map():
    return {row.get('alias'): row.get('target_name') for row in list_customer_aliases() if row.get('alias') and row.get('target_name')}

def delete_customer_alias(alias):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql('DELETE FROM customer_aliases WHERE alias = ?'), ((alias or '').strip(),))
    conn.commit()
    conn.close()

def record_recent_slot(username='', customer_name='', zone='A', column_index=1, slot_number=1):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(sql('DELETE FROM warehouse_recent_slots WHERE username = ? AND customer_name = ? AND zone = ? AND column_index = ? AND slot_number = ?'), ((username or '').strip(), (customer_name or '').strip(), (zone or 'A').strip(), int(column_index or 1), int(slot_number or 1)))
        cur.execute(sql('INSERT INTO warehouse_recent_slots(username, customer_name, zone, column_index, slot_number, used_at) VALUES (?, ?, ?, ?, ?, ?)'), ((username or '').strip(), (customer_name or '').strip(), (zone or 'A').strip(), int(column_index or 1), int(slot_number or 1), now()))
        conn.commit()
    except Exception as e:
        conn.rollback()
        log_error('record_recent_slot', e)
    finally:
        conn.close()

def get_recent_slots(username='', customer_name='', limit=8):
    conn = get_db()
    cur = conn.cursor()
    params = []
    query = 'SELECT username, customer_name, zone, column_index, slot_number, used_at FROM warehouse_recent_slots WHERE 1=1'
    if username:
        query += ' AND username = ?'
        params.append((username or '').strip())
    if customer_name:
        query += ' AND customer_name = ?'
        params.append((customer_name or '').strip())
    query += ' ORDER BY used_at DESC'
    cur.execute(sql(query), tuple(params))
    rows = rows_to_dict(cur)
    conn.close()
    deduped = []
    seen = set()
    for row in rows:
        key = (row.get('zone'), int(row.get('column_index') or 0), int(row.get('slot_number') or 0))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
        if len(deduped) >= int(limit or 8):
            break
    return deduped

def add_audit_trail(username='', action_type='', entity_type='', entity_key='', before_json=None, after_json=None):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(sql('INSERT INTO audit_trails(username, action_type, entity_type, entity_key, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'), ((username or '').strip(), (action_type or '').strip(), (entity_type or '').strip(), (entity_key or '').strip(), json.dumps(before_json, ensure_ascii=False) if isinstance(before_json, (dict, list)) else (before_json or ''), json.dumps(after_json, ensure_ascii=False) if isinstance(after_json, (dict, list)) else (after_json or ''), now()))
        conn.commit()
    except Exception as e:
        conn.rollback()
        log_error('add_audit_trail', e)
    finally:
        conn.close()

def list_audit_trails(limit=200):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql('SELECT * FROM audit_trails ORDER BY id DESC'))
    rows = rows_to_dict(cur)
    conn.close()
    out = []
    for row in rows[:int(limit or 200)]:
        for key in ('before_json', 'after_json'):
            try:
                row[key] = json.loads(row.get(key) or '{}') if row.get(key) else {}
            except Exception:
                pass
        out.append(row)
    return out

def dashboard_summary():
    conn = get_db()
    cur = conn.cursor()
    try:
        today = now()[:10]
        out = {
            'shipping_today_qty': 0,
            'shipping_today_count': 0,
            'inventory_total_qty': 0,
            'warehouse_used_slots': 0,
            'warehouse_total_slots': 0,
            'warehouse_usage_rate': 0,
            'unplaced_count': 0,
            'material_distribution': [],
            'top_customers_today': [],
        }
        cur.execute(sql("SELECT COALESCE(SUM(qty),0) AS total FROM shipping_records WHERE substr(shipped_at,1,10)=?"), (today,))
        row = fetchone_dict(cur) or {}
        out['shipping_today_qty'] = int(row.get('total') or 0)
        cur.execute(sql("SELECT COUNT(*) AS total FROM shipping_records WHERE substr(shipped_at,1,10)=?"), (today,))
        row = fetchone_dict(cur) or {}
        out['shipping_today_count'] = int(row.get('total') or 0)
        cur.execute(sql("SELECT COALESCE(SUM(qty),0) AS total FROM inventory"))
        row = fetchone_dict(cur) or {}
        out['inventory_total_qty'] = int(row.get('total') or 0)
        cells = warehouse_get_cells()
        out['warehouse_total_slots'] = len(cells)
        used = 0
        material_counter = Counter()
        for cell in cells:
            try:
                items = json.loads(cell.get('items_json') or '[]')
            except Exception:
                items = []
            if items:
                used += 1
            for it in items:
                mat = normalize_material(it.get('material') or '')
                if mat:
                    material_counter[mat] += int(it.get('qty') or 0)
        out['warehouse_used_slots'] = used
        out['warehouse_usage_rate'] = round((used / len(cells) * 100), 1) if cells else 0
        inv = inventory_summary()
        out['unplaced_count'] = sum(int(r.get('unplaced_qty') or 0) for r in inv)
        out['material_distribution'] = [
            {'material': k, 'qty': v} for k, v in material_counter.most_common(6)
        ]
        cur.execute(sql("SELECT customer_name, COALESCE(SUM(qty),0) AS qty_total FROM shipping_records WHERE substr(shipped_at,1,10)=? GROUP BY customer_name ORDER BY qty_total DESC, customer_name ASC"), (today,))
        rows = rows_to_dict(cur)
        out['top_customers_today'] = rows[:5]
        return out
    finally:
        conn.close()


def get_customer_preferences(customer_name='', limit=8):
    customer_name = (customer_name or '').strip()
    conn = get_db()
    cur = conn.cursor()
    params = []
    filters = []
    if customer_name:
        filters.append('customer_name = ?')
        params.append(customer_name)
    where = (' WHERE ' + ' AND '.join(filters)) if filters else ''
    union_sql = f"SELECT customer_name, product_text, material, qty, 'inventory' AS source FROM inventory {where} UNION ALL SELECT customer_name, product_text, material, qty, 'orders' AS source FROM orders {where} UNION ALL SELECT customer_name, product_text, material, qty, 'master_orders' AS source FROM master_orders {where} UNION ALL SELECT customer_name, product_text, material, qty, 'shipping' AS source FROM shipping_records {where}"
    cur.execute(sql(union_sql), tuple(params * 4 if customer_name else []))
    rows = rows_to_dict(cur)
    conn.close()
    mat_counter = Counter()
    size_counter = Counter()
    for row in rows:
        product = (row.get('product_text') or '').strip()
        material = normalize_material(row.get('material') or '')
        qty = int(row.get('qty') or 0)
        if product:
            size_counter[product] += qty if qty > 0 else 1
        if material:
            mat_counter[material] += qty if qty > 0 else 1
    return {
        'materials': [{'material': k, 'qty_total': v} for k, v in mat_counter.most_common(int(limit or 8))],
        'sizes': [{'product_text': k, 'qty_total': v} for k, v in size_counter.most_common(int(limit or 8))],
    }


def get_latest_audit_trail(username=''):
    conn = get_db(); cur = conn.cursor()
    try:
        if username:
            cur.execute(sql('SELECT * FROM audit_trails WHERE username = ? ORDER BY id DESC LIMIT 1'), ((username or '').strip(),))
        else:
            cur.execute(sql('SELECT * FROM audit_trails ORDER BY id DESC LIMIT 1'))
        row = fetchone_dict(cur)
        if not row:
            return None
        for key in ('before_json', 'after_json'):
            try:
                row[key] = json.loads(row.get(key) or '{}') if row.get(key) else {}
            except Exception:
                row[key] = {}
        return row
    finally:
        conn.close()


def _decrease_or_delete(cur, table, where_sql, where_params, qty):
    qty = int(qty or 0)
    cur.execute(sql(f"SELECT id, qty FROM {table} WHERE {where_sql} ORDER BY id DESC"), tuple(where_params))
    rows = cur.fetchall()
    remain = qty
    for row in rows:
        rid = row[0] if USE_POSTGRES else row['id']
        stock = int(row[1] if USE_POSTGRES else row['qty'])
        take = min(stock, remain)
        new_qty = stock - take
        if new_qty <= 0:
            cur.execute(sql(f"DELETE FROM {table} WHERE id = ?"), (rid,))
        else:
            cur.execute(sql(f"UPDATE {table} SET qty = ?, updated_at = ? WHERE id = ?"), (new_qty, now(), rid))
        remain -= take
        if remain <= 0:
            break
    return remain <= 0


def undo_latest_audit(username=''):
    entry = get_latest_audit_trail(username=username)
    if not entry:
        return {'success': False, 'error': '目前沒有可還原的異動'}
    action_type = (entry.get('action_type') or '').strip()
    entity_type = (entry.get('entity_type') or '').strip()
    before = entry.get('before_json') or {}
    after = entry.get('after_json') or {}
    conn = get_db(); cur = conn.cursor()
    try:
        message = ''
        if action_type == 'move' and entity_type == 'warehouse_cells':
            from_key = before.get('from_key') or []
            to_key = after.get('to_key') or []
            product_text = after.get('product_text') or entry.get('entity_key') or ''
            qty = int(after.get('qty') or 0)
            material = normalize_material(after.get('material') or '')
            conn.commit(); conn.close()
            result = warehouse_move_item(tuple(to_key), tuple(from_key), product_text, qty, material=material)
            if not result.get('success'):
                return result
            add_audit_trail(username or entry.get('username') or '', 'undo', entity_type, entry.get('entity_key') or '', before_json=after, after_json=before)
            return {'success': True, 'message': '已還原上一筆倉庫搬移', 'entry': entry}
        if action_type == 'create' and entity_type == 'inventory':
            for it in after.get('items') or []:
                _decrease_or_delete(cur, 'inventory', "product_text = ? AND COALESCE(location,'') = COALESCE(?, '') AND COALESCE(material,'') = COALESCE(?, '')", [it.get('product_text') or '', after.get('location') or '', normalize_material(it.get('material') or '')], int(it.get('qty') or 0))
            message = '已還原上一筆庫存新增'
        elif action_type == 'create' and entity_type == 'orders':
            for it in after.get('items') or []:
                _decrease_or_delete(cur, 'orders', "customer_name = ? AND product_text = ? AND COALESCE(material,'') = COALESCE(?, '')", [after.get('customer_name') or '', it.get('product_text') or '', normalize_material(it.get('material') or '')], int(it.get('qty') or 0))
            message = '已還原上一筆訂單新增'
        elif action_type == 'create' and entity_type == 'master_orders':
            for it in after.get('items') or []:
                _decrease_or_delete(cur, 'master_orders', "customer_name = ? AND product_text = ? AND COALESCE(material,'') = COALESCE(?, '')", [after.get('customer_name') or '', it.get('product_text') or '', normalize_material(it.get('material') or '')], int(it.get('qty') or 0))
            message = '已還原上一筆總單新增'
        elif action_type == 'ship' and entity_type == 'shipping_records':
            for b in after.get('breakdown') or []:
                product_text = b.get('product_text') or ''
                material = normalize_material(b.get('material') or '')
                for x in b.get('master_details') or []:
                    cur.execute(sql('UPDATE master_orders SET qty = qty + ?, updated_at = ? WHERE id = ?'), (int(x.get('qty') or 0), now(), int(x.get('id'))))
                for x in b.get('order_details') or []:
                    cur.execute(sql('UPDATE orders SET qty = qty + ?, updated_at = ? WHERE id = ?'), (int(x.get('qty') or 0), now(), int(x.get('id'))))
                for x in b.get('inventory_details') or []:
                    cur.execute(sql('UPDATE inventory SET qty = qty + ?, updated_at = ? WHERE id = ?'), (int(x.get('qty') or 0), now(), int(x.get('id'))))
                _decrease_or_delete(cur, 'shipping_records', "customer_name = ? AND product_text = ? AND COALESCE(material,'') = COALESCE(?, '')", [after.get('customer_name') or '', product_text, material], int(b.get('qty') or 0))
            message = '已還原上一筆出貨'
        elif action_type == 'delete' and entity_type == 'todo_items':
            row = before or {}
            cur.execute(sql('INSERT INTO todo_items(note, due_date, image_filename, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'), ((row.get('note') or '').strip(), (row.get('due_date') or '').strip(), (row.get('image_filename') or '').strip(), (row.get('created_by') or '').strip(), row.get('created_at') or now(), now()))
            message = '已還原上一筆代辦刪除'
        elif action_type == 'create' and entity_type == 'todo_items':
            img = (after.get('image_filename') or entry.get('entity_key') or '').strip()
            if img:
                cur.execute(sql('DELETE FROM todo_items WHERE image_filename = ?'), (img,))
                message = '已還原上一筆代辦新增'
            else:
                raise ValueError('找不到可還原的代辦資料')
        else:
            return {'success': False, 'error': f'目前尚未支援還原：{action_type}/{entity_type}'}
        conn.commit()
        add_audit_trail(username or entry.get('username') or '', 'undo', entity_type, entry.get('entity_key') or '', before_json=after, after_json=before)
        return {'success': True, 'message': message, 'entry': entry}
    except Exception as e:
        conn.rollback()
        log_error('undo_latest_audit', e)
        return {'success': False, 'error': f'還原失敗：{str(e)}'}
    finally:
        try:
            conn.close()
        except Exception:
            pass

def get_customer_spec_stats(customer_name='', limit=20):
    customer_name = (customer_name or '').strip()
    conn = get_db()
    cur = conn.cursor()
    params = []
    filters = []
    if customer_name:
        filters.append('customer_name = ?')
        params.append(customer_name)
    where = (' WHERE ' + ' AND '.join(filters)) if filters else ''
    union_sql = f"SELECT customer_name, product_text, qty, 'inventory' AS source FROM inventory {where} UNION ALL SELECT customer_name, product_text, qty, 'orders' AS source FROM orders {where} UNION ALL SELECT customer_name, product_text, qty, 'master_orders' AS source FROM master_orders {where} UNION ALL SELECT customer_name, product_text, qty, 'shipping' AS source FROM shipping_records {where}"
    cur.execute(sql(union_sql), tuple(params * 4 if customer_name else []))
    rows = rows_to_dict(cur)
    conn.close()
    stats = {}
    for row in rows:
        name = (row.get('customer_name') or '').strip()
        product = (row.get('product_text') or '').strip()
        if not product:
            continue
        key = (name, product)
        bucket = stats.setdefault(key, {'customer_name': name, 'product_text': product, 'qty_total': 0, 'sources': set()})
        bucket['qty_total'] += int(row.get('qty') or 0)
        bucket['sources'].add(row.get('source') or '')
    out = list(stats.values())
    out.sort(key=lambda r: (-int(r.get('qty_total') or 0), r.get('customer_name') or '', r.get('product_text') or ''))
    for row in out:
        row['sources'] = sorted([s for s in row.get('sources') or [] if s])
    return out[:int(limit or 20)]
