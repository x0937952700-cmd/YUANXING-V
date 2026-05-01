import os
import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from psycopg2.pool import SimpleConnectionPool
except Exception:
    psycopg2 = None
    RealDictCursor = None
    SimpleConnectionPool = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = (os.environ.get("DATABASE_URL") or os.environ.get("WAREHOUSE_DATABASE_URL") or "").strip()
ALLOW_SQLITE_FALLBACK = os.environ.get("YX_ALLOW_SQLITE_FALLBACK", "1") != "0"
USE_POSTGRES = bool(DATABASE_URL and DATABASE_URL.startswith(("postgres://", "postgresql://")) and psycopg2)

if USE_POSTGRES and "sslmode=" not in DATABASE_URL:
    DATABASE_URL += ("&" if "?" in DATABASE_URL else "?") + "sslmode=require"

_POOL = None
_SQLITE_LOCK = threading.RLock()
_INIT_LOCK = threading.RLock()
_INIT_DONE = False
_SQLITE_PATH = os.environ.get("SQLITE_PATH", os.path.join(BASE_DIR, "warehouse.db"))

if USE_POSTGRES:
    _POOL = SimpleConnectionPool(
        minconn=int(os.environ.get("DB_POOL_MIN", "1")),
        maxconn=int(os.environ.get("DB_POOL_MAX", "10")),
        dsn=DATABASE_URL,
    )
elif not ALLOW_SQLITE_FALLBACK:
    raise RuntimeError("DATABASE_URL 未設定或 psycopg2 不可用，且 YX_ALLOW_SQLITE_FALLBACK=0")


def now_iso():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ph(sql: str) -> str:
    return sql.replace("?", "%s") if USE_POSTGRES else sql


def _serial_type() -> str:
    return "SERIAL PRIMARY KEY" if USE_POSTGRES else "INTEGER PRIMARY KEY AUTOINCREMENT"


def _json_dumps(value):
    return json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value


def _connect_sqlite():
    os.makedirs(os.path.dirname(_SQLITE_PATH), exist_ok=True)
    conn = sqlite3.connect(_SQLITE_PATH, check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_conn():
    if USE_POSTGRES:
        conn = _POOL.getconn()
        try:
            yield conn
        finally:
            _POOL.putconn(conn)
    else:
        with _SQLITE_LOCK:
            conn = _connect_sqlite()
            try:
                yield conn
            finally:
                conn.close()


def rows_to_dict(rows):
    if not rows:
        return []
    return [dict(r) for r in rows]


def query(sql, params=None, fetch=False, one=False):
    params = params or []
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        try:
            cur.execute(_ph(sql), params)
            if fetch:
                data = cur.fetchone() if one else cur.fetchall()
                conn.commit()
                if one:
                    return dict(data) if data else None
                return rows_to_dict(data)
            conn.commit()
            return None
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


def execute_many(sql, seq):
    if not seq:
        return
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor) if USE_POSTGRES else conn.cursor()
        try:
            cur.executemany(_ph(sql), seq)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


@contextmanager
def transaction():
    """Single transaction. PostgreSQL uses row locks; SQLite is protected by a process lock."""
    if USE_POSTGRES:
        conn = _POOL.getconn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
            _POOL.putconn(conn)
    else:
        with _SQLITE_LOCK:
            conn = _connect_sqlite()
            cur = conn.cursor()
            try:
                cur.execute("BEGIN IMMEDIATE")
                yield cur
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                cur.close()
                conn.close()


def tx_query(cur, sql, params=None, fetch=False, one=False):
    cur.execute(_ph(sql), params or [])
    if not fetch:
        return None
    data = cur.fetchone() if one else cur.fetchall()
    if one:
        return dict(data) if data else None
    return rows_to_dict(data)


def table_columns(table):
    if USE_POSTGRES:
        rows = query("SELECT column_name AS name FROM information_schema.columns WHERE table_name=?", [table], fetch=True)
        return {r["name"] for r in rows}
    rows = query(f"PRAGMA table_info({table})", fetch=True)
    return {r["name"] for r in rows}


def ensure_column(table, column, ddl):
    if column not in table_columns(table):
        query(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def _safe_index(sql_pg, sql_sqlite=None):
    try:
        query(sql_pg if USE_POSTGRES else (sql_sqlite or sql_pg))
    except Exception:
        # Index creation must never block boot. The app can still run without it.
        pass


def init_db(force=False):
    global _INIT_DONE
    with _INIT_LOCK:
        if _INIT_DONE and not force:
            return
        idcol = _serial_type()
        text_default_now = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"

        query(f"""
        CREATE TABLE IF NOT EXISTS users (
            id {idcol}, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0, is_blacklisted INTEGER DEFAULT 0,
            created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS customers (
            id {idcol}, name TEXT UNIQUE NOT NULL, phone TEXT DEFAULT '', address TEXT DEFAULT '',
            notes TEXT DEFAULT '', common_materials TEXT DEFAULT '', common_sizes TEXT DEFAULT '',
            region TEXT DEFAULT '北區', archived INTEGER DEFAULT 0,
            created_at {text_default_now}, updated_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS inventory (
            id {idcol}, customer TEXT DEFAULT '', product TEXT DEFAULT '', material TEXT DEFAULT '',
            quantity INTEGER DEFAULT 0, qty INTEGER DEFAULT 0, location TEXT DEFAULT '', source TEXT DEFAULT 'inventory',
            operator TEXT DEFAULT '', placed INTEGER DEFAULT 0, created_at {text_default_now}, updated_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS orders (
            id {idcol}, customer TEXT DEFAULT '', product TEXT DEFAULT '', material TEXT DEFAULT '',
            qty INTEGER DEFAULT 0, quantity INTEGER DEFAULT 0, status TEXT DEFAULT 'open', operator TEXT DEFAULT '',
            created_at {text_default_now}, updated_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS master_orders (
            id {idcol}, customer TEXT DEFAULT '', product TEXT DEFAULT '', material TEXT DEFAULT '',
            qty INTEGER DEFAULT 0, quantity INTEGER DEFAULT 0, operator TEXT DEFAULT '',
            created_at {text_default_now}, updated_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS shipping_records (
            id {idcol}, customer TEXT DEFAULT '', product TEXT DEFAULT '', material TEXT DEFAULT '',
            qty INTEGER DEFAULT 0, source TEXT DEFAULT '', location TEXT DEFAULT '', operator TEXT DEFAULT '', shipped_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS warehouse_cells (
            id {idcol}, zone TEXT DEFAULT 'A', band INTEGER DEFAULT 1, row_name TEXT DEFAULT 'front', slot INTEGER DEFAULT 1,
            note TEXT DEFAULT '', created_at {text_default_now}, updated_at {text_default_now},
            UNIQUE(zone, band, row_name, slot)
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS warehouse_items (
            id {idcol}, cell_id INTEGER, customer TEXT DEFAULT '', product TEXT DEFAULT '', material TEXT DEFAULT '',
            qty INTEGER DEFAULT 0, source_table TEXT DEFAULT '', source_id INTEGER DEFAULT 0,
            created_at {text_default_now}, updated_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id {idcol}, username TEXT DEFAULT '', action TEXT DEFAULT '', entity TEXT DEFAULT '', entity_id TEXT DEFAULT '',
            detail TEXT DEFAULT '', created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id {idcol}, category TEXT DEFAULT '', customer TEXT DEFAULT '', product TEXT DEFAULT '', qty INTEGER DEFAULT 0,
            action TEXT DEFAULT '', operator TEXT DEFAULT '', unread INTEGER DEFAULT 1, created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS todos (
            id {idcol}, note TEXT DEFAULT '', due_date TEXT DEFAULT '', status TEXT DEFAULT 'open', image_names TEXT DEFAULT '',
            operator TEXT DEFAULT '', created_at {text_default_now}, updated_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS backups (
            id {idcol}, filename TEXT DEFAULT '', created_at {text_default_now}
        )""")

        migrations = {
            "inventory": [("customer", "TEXT DEFAULT ''"), ("material", "TEXT DEFAULT ''"), ("qty", "INTEGER DEFAULT 0"), ("quantity", "INTEGER DEFAULT 0"), ("placed", "INTEGER DEFAULT 0"), ("source", "TEXT DEFAULT 'inventory'"), ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "orders": [("customer", "TEXT DEFAULT ''"), ("material", "TEXT DEFAULT ''"), ("qty", "INTEGER DEFAULT 0"), ("quantity", "INTEGER DEFAULT 0"), ("status", "TEXT DEFAULT 'open'"), ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "master_orders": [("customer", "TEXT DEFAULT ''"), ("material", "TEXT DEFAULT ''"), ("qty", "INTEGER DEFAULT 0"), ("quantity", "INTEGER DEFAULT 0"), ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "customers": [("archived", "INTEGER DEFAULT 0"), ("common_materials", "TEXT DEFAULT ''"), ("common_sizes", "TEXT DEFAULT ''"), ("region", "TEXT DEFAULT '北區'"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "warehouse_items": [("source_table", "TEXT DEFAULT ''"), ("source_id", "INTEGER DEFAULT 0"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "activity_logs": [("unread", "INTEGER DEFAULT 1")],
        }
        for table, specs in migrations.items():
            for c, ddl in specs:
                try:
                    ensure_column(table, c, ddl)
                except Exception:
                    pass

        seed_warehouse_cells()
        seed_admin_user()
        create_indexes()
        _INIT_DONE = True


def create_indexes():
    for sql in [
        "CREATE INDEX IF NOT EXISTS idx_inventory_customer ON inventory(customer)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_qty ON inventory(qty)",
        "CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer)",
        "CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product)",
        "CREATE INDEX IF NOT EXISTS idx_master_customer ON master_orders(customer)",
        "CREATE INDEX IF NOT EXISTS idx_master_product ON master_orders(product)",
        "CREATE INDEX IF NOT EXISTS idx_customers_region ON customers(region, archived)",
        "CREATE INDEX IF NOT EXISTS idx_warehouse_items_cell ON warehouse_items(cell_id)",
        "CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_shipping_created ON shipping_records(shipped_at)",
    ]:
        _safe_index(sql)


def seed_admin_user():
    name = os.environ.get("YX_USERNAME", "陳韋廷")
    exists = query("SELECT id FROM users WHERE username=?", [name], fetch=True, one=True)
    if not exists:
        query("INSERT INTO users(username, password, is_admin) VALUES(?, ?, 1)", [name, os.environ.get("YX_PASSWORD", "1234")])


def seed_warehouse_cells():
    params = []
    for zone in ("A", "B"):
        for band in range(1, 7):
            for row_name in ("front", "back"):
                for slot in range(1, 11):
                    params.append((zone, band, row_name, slot))
    if USE_POSTGRES:
        execute_many("INSERT INTO warehouse_cells(zone, band, row_name, slot) VALUES(?, ?, ?, ?) ON CONFLICT(zone, band, row_name, slot) DO NOTHING", params)
    else:
        execute_many("INSERT OR IGNORE INTO warehouse_cells(zone, band, row_name, slot) VALUES(?, ?, ?, ?)", params)


def log_action(username, action, entity='', entity_id='', detail=None, category=''):
    detail = detail or {}
    detail_text = _json_dumps(detail)
    query("INSERT INTO audit_logs(username, action, entity, entity_id, detail) VALUES(?, ?, ?, ?, ?)", [username, action, entity, str(entity_id or ''), detail_text])
    if category:
        query("INSERT INTO activity_logs(category, customer, product, qty, action, operator) VALUES(?, ?, ?, ?, ?, ?)", [category, detail.get('customer',''), detail.get('product',''), int(detail.get('qty') or 0), action, username])


def tx_log_action(cur, username, action, entity='', entity_id='', detail=None, category=''):
    detail = detail or {}
    detail_text = _json_dumps(detail)
    tx_query(cur, "INSERT INTO audit_logs(username, action, entity, entity_id, detail) VALUES(?, ?, ?, ?, ?)", [username, action, entity, str(entity_id or ''), detail_text])
    if category:
        tx_query(cur, "INSERT INTO activity_logs(category, customer, product, qty, action, operator) VALUES(?, ?, ?, ?, ?, ?)", [category, detail.get('customer',''), detail.get('product',''), int(detail.get('qty') or 0), action, username])


def db_status():
    try:
        row = query("SELECT 1 AS ok", fetch=True, one=True)
        return {"ok": True, "engine": "postgres" if USE_POSTGRES else "sqlite", "row": row}
    except Exception as e:
        return {"ok": False, "engine": "postgres" if USE_POSTGRES else "sqlite", "message": str(e)}
