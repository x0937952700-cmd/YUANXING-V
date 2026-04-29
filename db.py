import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from urllib.parse import urlparse

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
SQLITE_PATH = os.environ.get("SQLITE_PATH", "warehouse.db")
IS_POSTGRES = DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _connect_sqlite():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _connect_postgres():
    import psycopg2
    import psycopg2.extras
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    return conn


def connect():
    return _connect_postgres() if IS_POSTGRES else _connect_sqlite()


def ph():
    return "%s" if IS_POSTGRES else "?"


def adapt(sql: str) -> str:
    return sql.replace("?", "%s") if IS_POSTGRES else sql


@contextmanager
def get_conn():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def rows(cur):
    data = cur.fetchall()
    if data is None:
        return []
    return [dict(r) for r in data]


def row(cur):
    r = cur.fetchone()
    return dict(r) if r else None


def execute(conn, sql, params=()):
    cur = conn.cursor()
    cur.execute(adapt(sql), params)
    return cur


def table_id_type():
    return "SERIAL PRIMARY KEY" if IS_POSTGRES else "INTEGER PRIMARY KEY AUTOINCREMENT"


def init_db():
    with get_conn() as conn:
        idt = table_id_type()
        execute(conn, f"""
        CREATE TABLE IF NOT EXISTS users (
            id {idt},
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            is_blocked INTEGER DEFAULT 0,
            created_at TEXT
        )
        """)
        execute(conn, f"""
        CREATE TABLE IF NOT EXISTS customers (
            id {idt},
            name TEXT UNIQUE NOT NULL,
            region TEXT DEFAULT 'north',
            common_materials TEXT DEFAULT '',
            common_sizes TEXT DEFAULT '',
            archived INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """)
        for table in ("inventory", "orders", "master_orders"):
            execute(conn, f"""
            CREATE TABLE IF NOT EXISTS {table} (
                id {idt},
                customer TEXT DEFAULT '',
                product_text TEXT DEFAULT '',
                material TEXT DEFAULT '',
                length TEXT DEFAULT '',
                width TEXT DEFAULT '',
                height TEXT DEFAULT '',
                formula TEXT DEFAULT '',
                pieces INTEGER DEFAULT 0,
                bundles INTEGER DEFAULT 0,
                qty INTEGER DEFAULT 0,
                location TEXT DEFAULT '',
                warehouse_cell_id INTEGER DEFAULT NULL,
                status TEXT DEFAULT 'active',
                source TEXT DEFAULT '',
                operator TEXT DEFAULT '',
                created_at TEXT,
                updated_at TEXT
            )
            """)
        execute(conn, f"""
        CREATE TABLE IF NOT EXISTS warehouse_cells (
            id {idt},
            zone TEXT NOT NULL,
            section INTEGER NOT NULL,
            row_name TEXT NOT NULL,
            slot_index INTEGER NOT NULL,
            label TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT,
            UNIQUE(zone, section, row_name, slot_index)
        )
        """)
        execute(conn, f"""
        CREATE TABLE IF NOT EXISTS warehouse_items (
            id {idt},
            cell_id INTEGER NOT NULL,
            source_table TEXT DEFAULT '',
            item_id INTEGER DEFAULT NULL,
            customer TEXT DEFAULT '',
            product_text TEXT DEFAULT '',
            material TEXT DEFAULT '',
            pieces INTEGER DEFAULT 0,
            position INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """)
        execute(conn, f"""
        CREATE TABLE IF NOT EXISTS shipping_records (
            id {idt},
            customer TEXT DEFAULT '',
            items_json TEXT DEFAULT '[]',
            volume REAL DEFAULT 0,
            length_total REAL DEFAULT 0,
            weight_per_cbm REAL DEFAULT 0,
            total_weight REAL DEFAULT 0,
            deduction_summary TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            shipped_at TEXT
        )
        """)
        execute(conn, f"""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id {idt},
            category TEXT DEFAULT '',
            action TEXT DEFAULT '',
            customer TEXT DEFAULT '',
            product_text TEXT DEFAULT '',
            detail TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            unread INTEGER DEFAULT 1,
            created_at TEXT
        )
        """)
        execute(conn, f"""
        CREATE TABLE IF NOT EXISTS request_keys (
            id {idt},
            request_key TEXT UNIQUE NOT NULL,
            response_json TEXT DEFAULT '',
            created_at TEXT
        )
        """)
        execute(conn, f"""
        CREATE TABLE IF NOT EXISTS corrections (
            id {idt},
            wrong_text TEXT UNIQUE,
            correct_text TEXT,
            created_at TEXT
        )
        """)
        execute(conn, f"""
        CREATE TABLE IF NOT EXISTS image_hashes (
            id {idt},
            image_hash TEXT UNIQUE,
            created_at TEXT
        )
        """)
        execute(conn, f"""
        CREATE TABLE IF NOT EXISTS backups (
            id {idt},
            filename TEXT,
            note TEXT DEFAULT '',
            created_at TEXT
        )
        """)
        seed_warehouse_cells(conn)


def seed_warehouse_cells(conn):
    cur = execute(conn, "SELECT COUNT(*) AS c FROM warehouse_cells")
    count = row(cur)["c"]
    if count:
        return
    t = now()
    for zone in ("A", "B"):
        for section in range(1, 7):
            for row_name in ("front", "back"):
                for slot in range(1, 11):
                    execute(conn,
                        "INSERT INTO warehouse_cells(zone, section, row_name, slot_index, created_at, updated_at) VALUES(?,?,?,?,?,?)",
                        (zone, section, row_name, slot, t, t))


def log_activity(conn, category, action, customer="", product_text="", detail="", operator=""):
    execute(conn, """
        INSERT INTO activity_logs(category, action, customer, product_text, detail, operator, unread, created_at)
        VALUES(?,?,?,?,?,?,1,?)
    """, (category, action, customer or "", product_text or "", detail or "", operator or "", now()))


def ensure_customer(conn, name, region="north"):
    name = (name or "").strip()
    if not name:
        return None
    cur = execute(conn, "SELECT * FROM customers WHERE name=?", (name,))
    existing = row(cur)
    if existing:
        return existing
    t = now()
    execute(conn, "INSERT INTO customers(name, region, created_at, updated_at) VALUES(?,?,?,?)", (name, region, t, t))
    cur = execute(conn, "SELECT * FROM customers WHERE name=?", (name,))
    return row(cur)


def check_request_key(conn, request_key):
    if not request_key:
        return None
    cur = execute(conn, "SELECT response_json FROM request_keys WHERE request_key=?", (request_key,))
    r = row(cur)
    if r and r.get("response_json"):
        try:
            return json.loads(r["response_json"])
        except Exception:
            return {"ok": True, "duplicate": True}
    return None


def save_request_key(conn, request_key, response):
    if not request_key:
        return
    execute(conn, "INSERT INTO request_keys(request_key, response_json, created_at) VALUES(?,?,?)", (request_key, json.dumps(response, ensure_ascii=False), now()))
