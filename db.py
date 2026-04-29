import os
import json
import sqlite3
from datetime import datetime
from contextlib import contextmanager

DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
IS_PG = DATABASE_URL.startswith('postgres://') or DATABASE_URL.startswith('postgresql://')

if IS_PG:
    import psycopg2
    import psycopg2.extras

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_PATH = os.environ.get('SQLITE_PATH', os.path.join(BASE_DIR, 'warehouse.db'))


def now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _convert_sql(sql: str) -> str:
    if not IS_PG:
        return sql
    return sql.replace('?', '%s')


@contextmanager
def get_conn():
    if IS_PG:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        conn = sqlite3.connect(SQLITE_PATH)
        conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute(sql, params=None):
    params = params or []
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(_convert_sql(sql), params)
        return cur.rowcount


def fetchall(sql, params=None):
    params = params or []
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(_convert_sql(sql), params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def fetchone(sql, params=None):
    rows = fetchall(sql, params)
    return rows[0] if rows else None


def insert_and_get_id(sql, params=None):
    params = params or []
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(_convert_sql(sql), params)
        if IS_PG:
            # Prefer RETURNING id when caller uses it; fallback to currval not used here.
            try:
                row = cur.fetchone()
                return dict(row).get('id') if row else None
            except Exception:
                return None
        return cur.lastrowid


def _pk():
    return 'SERIAL PRIMARY KEY' if IS_PG else 'INTEGER PRIMARY KEY AUTOINCREMENT'


def _bool(default=False):
    if IS_PG:
        return 'BOOLEAN DEFAULT ' + ('TRUE' if default else 'FALSE')
    return 'INTEGER DEFAULT ' + ('1' if default else '0')


def _text_json(obj):
    return json.dumps(obj, ensure_ascii=False)


def init_db():
    pk = _pk()
    bool_false = _bool(False)

    stmts = [
        f"""
        CREATE TABLE IF NOT EXISTS users (
            id {pk},
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            is_blocked {bool_false},
            created_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS customers (
            id {pk},
            name TEXT UNIQUE NOT NULL,
            region TEXT DEFAULT 'north',
            common_material TEXT DEFAULT '',
            common_size TEXT DEFAULT '',
            archived {bool_false},
            sort_order INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS inventory (
            id {pk},
            customer_name TEXT DEFAULT '',
            product_text TEXT NOT NULL,
            material TEXT DEFAULT '',
            length_text TEXT DEFAULT '',
            width_text TEXT DEFAULT '',
            height_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces INTEGER DEFAULT 0,
            warehouse_key TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS orders (
            id {pk},
            customer_name TEXT NOT NULL,
            product_text TEXT NOT NULL,
            material TEXT DEFAULT '',
            length_text TEXT DEFAULT '',
            width_text TEXT DEFAULT '',
            height_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces INTEGER DEFAULT 0,
            status TEXT DEFAULT 'open',
            warehouse_key TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS master_orders (
            id {pk},
            customer_name TEXT NOT NULL,
            product_text TEXT NOT NULL,
            material TEXT DEFAULT '',
            length_text TEXT DEFAULT '',
            width_text TEXT DEFAULT '',
            height_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces INTEGER DEFAULT 0,
            warehouse_key TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS shipping_records (
            id {pk},
            customer_name TEXT DEFAULT '',
            source_table TEXT DEFAULT '',
            source_id INTEGER DEFAULT 0,
            product_text TEXT DEFAULT '',
            material TEXT DEFAULT '',
            pieces INTEGER DEFAULT 0,
            volume REAL DEFAULT 0,
            weight_unit REAL DEFAULT 0,
            total_weight REAL DEFAULT 0,
            operator TEXT DEFAULT '',
            created_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS warehouse_cells (
            id {pk},
            zone TEXT NOT NULL,
            band INTEGER NOT NULL,
            row_name TEXT NOT NULL,
            slot INTEGER NOT NULL,
            items_json TEXT DEFAULT '[]',
            updated_at TEXT,
            UNIQUE(zone, band, row_name, slot)
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id {pk},
            action TEXT NOT NULL,
            customer_name TEXT DEFAULT '',
            product_text TEXT DEFAULT '',
            detail TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            unread {bool_false},
            created_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS request_keys (
            request_key TEXT PRIMARY KEY,
            created_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS corrections (
            id {pk},
            wrong_text TEXT UNIQUE,
            correct_text TEXT,
            created_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS image_hashes (
            image_hash TEXT PRIMARY KEY,
            created_at TEXT
        )
        """,
    ]
    for s in stmts:
        execute(s)

    # Safe indexes: speed only, no behavior change.
    idxs = [
        "CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)",
        "CREATE INDEX IF NOT EXISTS idx_customers_region ON customers(region)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_customer ON inventory(customer_name)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_updated ON inventory(updated_at)",
        "CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_name)",
        "CREATE INDEX IF NOT EXISTS idx_master_customer ON master_orders(customer_name)",
        "CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_warehouse_lookup ON warehouse_cells(zone, band, row_name, slot)",
    ]
    for s in idxs:
        execute(s)

    seed_warehouse_cells()


def ensure_customer(name, region='north', operator='system'):
    name = (name or '').strip()
    if not name:
        return
    existing = fetchone("SELECT id FROM customers WHERE name=?", [name])
    if not existing:
        execute(
            "INSERT INTO customers(name, region, created_at, updated_at) VALUES(?,?,?,?)",
            [name, region, now(), now()],
        )
        add_activity('新增客戶', name, '', '自動建立客戶資料', operator)


def check_request_key(request_key):
    if not request_key:
        return False
    try:
        execute("INSERT INTO request_keys(request_key, created_at) VALUES(?,?)", [request_key, now()])
        return False
    except Exception:
        return True


def add_activity(action, customer_name='', product_text='', detail='', operator=''):
    execute(
        """INSERT INTO activity_logs(action, customer_name, product_text, detail, operator, unread, created_at)
           VALUES(?,?,?,?,?,?,?)""",
        [action, customer_name or '', product_text or '', detail or '', operator or '', 1, now()],
    )


def seed_warehouse_cells():
    for zone in ['A', 'B']:
        for band in range(1, 7):
            for row_name in ['front', 'back']:
                for slot in range(1, 11):
                    exists = fetchone(
                        "SELECT id FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?",
                        [zone, band, row_name, slot],
                    )
                    if not exists:
                        execute(
                            "INSERT INTO warehouse_cells(zone, band, row_name, slot, items_json, updated_at) VALUES(?,?,?,?,?,?)",
                            [zone, band, row_name, slot, '[]', now()],
                        )


def table_for_module(module):
    mapping = {'inventory': 'inventory', 'orders': 'orders', 'master': 'master_orders'}
    if module not in mapping:
        raise ValueError('invalid module')
    return mapping[module]
