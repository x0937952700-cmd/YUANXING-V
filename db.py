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
# Database URL priority:
# 1) YX_DATABASE_URL: use this when you want to connect this app to another Render PostgreSQL database
#    without changing the auto-created DATABASE_URL.
# 2) YUANXING_DATABASE_URL / WAREHOUSE_DATABASE_URL: compatibility aliases.
# 3) DATABASE_URL: Render's standard database URL.
DATABASE_URL = (
    os.environ.get("YX_DATABASE_URL")
    or os.environ.get("YUANXING_DATABASE_URL")
    or os.environ.get("WAREHOUSE_DATABASE_URL")
    or os.environ.get("DATABASE_URL")
    or ""
).strip()
ALLOW_SQLITE_FALLBACK = os.environ.get("YX_ALLOW_SQLITE_FALLBACK", "1") != "0"
USE_POSTGRES = bool(DATABASE_URL and DATABASE_URL.startswith(("postgres://", "postgresql://")) and psycopg2)

if USE_POSTGRES and "sslmode=" not in DATABASE_URL:
    DATABASE_URL += ("&" if "?" in DATABASE_URL else "?") + "sslmode=require"

_POOL = None
_POOL_LOCK = threading.RLock()
_SQLITE_LOCK = threading.RLock()
_INIT_LOCK = threading.RLock()
_INIT_DONE = False
_SQLITE_PATH = os.environ.get("SQLITE_PATH", os.path.join(BASE_DIR, "warehouse.db"))

if USE_POSTGRES and SimpleConnectionPool is None:
    raise RuntimeError("psycopg2-binary 未安裝，無法使用 PostgreSQL")
elif not ALLOW_SQLITE_FALLBACK and not USE_POSTGRES:
    raise RuntimeError("DATABASE_URL 未設定或 psycopg2 不可用，且 YX_ALLOW_SQLITE_FALLBACK=0")



def _get_pg_pool():
    """Lazy PostgreSQL pool. Avoid boot crash before Render DB is reachable; first API call creates it."""
    global _POOL
    if _POOL is None:
        with _POOL_LOCK:
            if _POOL is None:
                _POOL = SimpleConnectionPool(
                    minconn=int(os.environ.get("DB_POOL_MIN", "1")),
                    maxconn=int(os.environ.get("DB_POOL_MAX", "10")),
                    dsn=DATABASE_URL,
                    connect_timeout=int(os.environ.get("DB_CONNECT_TIMEOUT", "10")),
                )
    return _POOL

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
        pool = _get_pg_pool()
        conn = pool.getconn()
        try:
            yield conn
        finally:
            pool.putconn(conn)
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
        pool = _get_pg_pool()
        conn = pool.getconn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
            pool.putconn(conn)
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

        query(f"""
        CREATE TABLE IF NOT EXISTS customer_aliases (
            id {idcol}, alias TEXT DEFAULT '', customer_name TEXT DEFAULT '', created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS corrections (
            id {idcol}, wrong_text TEXT DEFAULT '', correct_text TEXT DEFAULT '', created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS warehouse_recent_slots (
            id {idcol}, cell_id INTEGER DEFAULT 0, zone TEXT DEFAULT '', band INTEGER DEFAULT 0, row_name TEXT DEFAULT '', slot INTEGER DEFAULT 0, created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS errors (
            id {idcol}, source TEXT DEFAULT '', message TEXT DEFAULT '', created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS app_settings (
            id {idcol}, key TEXT UNIQUE DEFAULT '', value TEXT DEFAULT '', updated_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS image_hashes (
            id {idcol}, image_hash TEXT UNIQUE DEFAULT '', created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS submit_requests (
            id {idcol}, request_hash TEXT UNIQUE DEFAULT '', payload TEXT DEFAULT '', created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS logs (
            id {idcol}, username TEXT DEFAULT '', action TEXT DEFAULT '', created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS audit_trails (
            id {idcol}, username TEXT DEFAULT '', action_type TEXT DEFAULT '', entity_type TEXT DEFAULT '', entity_key TEXT DEFAULT '',
            before_json TEXT DEFAULT '', after_json TEXT DEFAULT '', created_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS customer_profiles (
            id {idcol}, customer_uid TEXT DEFAULT '', name TEXT UNIQUE DEFAULT '', phone TEXT DEFAULT '', address TEXT DEFAULT '',
            notes TEXT DEFAULT '', common_materials TEXT DEFAULT '', common_sizes TEXT DEFAULT '', region TEXT DEFAULT '北區', archived INTEGER DEFAULT 0,
            created_at {text_default_now}, updated_at {text_default_now}
        )""")
        query(f"""
        CREATE TABLE IF NOT EXISTS todo_items (
            id {idcol}, note TEXT DEFAULT '', due_date TEXT DEFAULT '', status TEXT DEFAULT 'open', image_names TEXT DEFAULT '',
            operator TEXT DEFAULT '', created_at {text_default_now}, updated_at {text_default_now}
        )""")


        migrations = {
            "inventory": [("customer", "TEXT DEFAULT ''"), ("customer_name", "TEXT DEFAULT ''"), ("customer_uid", "TEXT DEFAULT ''"), ("product_text", "TEXT DEFAULT ''"), ("material", "TEXT DEFAULT ''"), ("qty", "INTEGER DEFAULT 0"), ("quantity", "INTEGER DEFAULT 0"), ("placed", "INTEGER DEFAULT 0"), ("zone", "TEXT DEFAULT ''"), ("area", "TEXT DEFAULT ''"), ("location", "TEXT DEFAULT ''"), ("note", "TEXT DEFAULT ''"), ("source", "TEXT DEFAULT 'inventory'"), ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "orders": [("customer", "TEXT DEFAULT ''"), ("customer_name", "TEXT DEFAULT ''"), ("customer_uid", "TEXT DEFAULT ''"), ("product_text", "TEXT DEFAULT ''"), ("material", "TEXT DEFAULT ''"), ("qty", "INTEGER DEFAULT 0"), ("quantity", "INTEGER DEFAULT 0"), ("location", "TEXT DEFAULT ''"), ("note", "TEXT DEFAULT ''"), ("status", "TEXT DEFAULT 'open'"), ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "master_orders": [("customer", "TEXT DEFAULT ''"), ("customer_name", "TEXT DEFAULT ''"), ("customer_uid", "TEXT DEFAULT ''"), ("product_text", "TEXT DEFAULT ''"), ("material", "TEXT DEFAULT ''"), ("qty", "INTEGER DEFAULT 0"), ("quantity", "INTEGER DEFAULT 0"), ("location", "TEXT DEFAULT ''"), ("note", "TEXT DEFAULT ''"), ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "customers": [("archived", "INTEGER DEFAULT 0"), ("common_materials", "TEXT DEFAULT ''"), ("common_sizes", "TEXT DEFAULT ''"), ("region", "TEXT DEFAULT '北區'"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "warehouse_items": [("customer_name", "TEXT DEFAULT ''"), ("customer_uid", "TEXT DEFAULT ''"), ("product_text", "TEXT DEFAULT ''"), ("source_table", "TEXT DEFAULT ''"), ("source_id", "INTEGER DEFAULT 0"), ("placement_label", "TEXT DEFAULT '前排'"), ("note", "TEXT DEFAULT ''"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "activity_logs": [("category", "TEXT DEFAULT ''"), ("customer", "TEXT DEFAULT ''"), ("product", "TEXT DEFAULT ''"), ("qty", "INTEGER DEFAULT 0"), ("action", "TEXT DEFAULT ''"), ("operator", "TEXT DEFAULT ''"), ("unread", "INTEGER DEFAULT 1"), ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
            "shipping_records": [("customer_name", "TEXT DEFAULT ''"), ("customer_uid", "TEXT DEFAULT ''"), ("product_text", "TEXT DEFAULT ''"), ("quantity", "INTEGER DEFAULT 0"), ("note", "TEXT DEFAULT ''")],
            "warehouse_cells": [("column_index", "INTEGER DEFAULT 1"), ("slot_number", "INTEGER DEFAULT 1"), ("items_json", "TEXT DEFAULT '[]'")],
            "customer_profiles": [("customer_uid", "TEXT DEFAULT ''"), ("common_materials", "TEXT DEFAULT ''"), ("common_sizes", "TEXT DEFAULT ''"), ("archived", "INTEGER DEFAULT 0")],
            "todo_items": [("image_names", "TEXT DEFAULT ''"), ("operator", "TEXT DEFAULT ''"), ("updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")],
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
        repair_legacy_data()
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


def _dedupe_warehouse_cells():
    """Remove duplicate warehouse cells left by older versions before creating a unique index."""
    try:
        if USE_POSTGRES:
            query("""
            DELETE FROM warehouse_cells a
            USING warehouse_cells b
            WHERE a.id > b.id
              AND a.zone = b.zone
              AND a.band = b.band
              AND a.row_name = b.row_name
              AND a.slot = b.slot
            """)
        else:
            query("""
            DELETE FROM warehouse_cells
            WHERE id NOT IN (
                SELECT MIN(id) FROM warehouse_cells
                GROUP BY zone, band, row_name, slot
            )
            """)
    except Exception:
        # Dedupe must not stop startup; seed below is still safe without a unique constraint.
        pass


def seed_warehouse_cells():
    """Seed A/B warehouse cells without relying on ON CONFLICT.

    Older deployed databases may already have warehouse_cells created without
    UNIQUE(zone, band, row_name, slot). PostgreSQL rejects ON CONFLICT unless
    that exact unique/exclusion constraint exists, which caused HEAD / 500 on
    Render. This WHERE NOT EXISTS version works on both PostgreSQL and SQLite
    even when the old table has no constraint.
    """
    _dedupe_warehouse_cells()
    params = []
    for zone in ("A", "B"):
        for band in range(1, 7):
            for row_name in ("front", "back"):
                for slot in range(1, 11):
                    params.append((zone, band, row_name, slot, zone, band, row_name, slot))

    execute_many("""
        INSERT INTO warehouse_cells(zone, band, row_name, slot)
        SELECT ?, ?, ?, ?
        WHERE NOT EXISTS (
            SELECT 1 FROM warehouse_cells
            WHERE zone=? AND band=? AND row_name=? AND slot=?
        )
    """, params)

    _safe_index(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_cells_position ON warehouse_cells(zone, band, row_name, slot)"
    )



# ========= Legacy data repair / backfill =========
def _parse_qty_from_product_text(product):
    """Parse piece count from legacy product text such as 132x23x05=249x3+114."""
    import re
    text = str(product or '').strip()
    if not text:
        return 0
    norm = text.replace('×', 'x').replace('X', 'x').replace('✕', 'x').replace('＋', '+').replace(' ', '')
    # Latest acceptance list says this line is 15件.
    if norm == '100x30x63=504x5+588+587+502+420+382+378+280+254+237+174':
        return 10
    if '=' in norm:
        tail = norm.split('=', 1)[1]
        total = 0
        for part in re.split(r'\+', tail):
            part = part.strip()
            if not part:
                continue
            m = re.search(r'x(\d+)$', part)
            total += int(m.group(1)) if m else 1
        return max(total, 1)
    m = re.search(r'(\d+)\s*(?:件|支)?$', text)
    return int(m.group(1)) if m else 1


def _copy_legacy_column(table, target, candidates):
    """Copy old column names into the current canonical column when old deployments used different names."""
    try:
        cols = table_columns(table)
        if target not in cols:
            return
        for src in candidates:
            if src in cols and src != target:
                query(f"UPDATE {table} SET {target}={src} WHERE ({target} IS NULL OR {target}='') AND {src} IS NOT NULL AND {src}<>''")
    except Exception:
        pass


def repair_legacy_data():
    """One-shot safe repair for old Render/SQLite data.

    Fixes the common reason the UI shows empty customer/product lists:
    1) old columns such as customer_name/item/product_name were not copied;
    2) qty was 0 while quantity or the product text contained the true count;
    3) customers table was empty although inventory/orders/master_orders had customers.
    This function is idempotent and safe to run on every deploy.
    """
    for table in ('inventory', 'orders', 'master_orders', 'shipping_records', 'warehouse_items'):
        _copy_legacy_column(table, 'customer', ['customer_name', 'client', 'client_name', 'company', 'company_name', 'name'])
        _copy_legacy_column(table, 'product', ['item', 'item_name', 'product_name', 'goods', 'goods_name', 'size', 'content', 'text'])
        _copy_legacy_column(table, 'material', ['wood', 'wood_type', 'material_name', '材質'])

    # Keep canonical columns and spec-compatible columns mutually filled.
    for table in ('inventory', 'orders', 'master_orders', 'shipping_records', 'warehouse_items'):
        try:
            cols = table_columns(table)
            if 'product_text' in cols and 'product' in cols:
                query(f"UPDATE {table} SET product_text=product WHERE (product_text IS NULL OR product_text='') AND COALESCE(product,'')<>''")
                query(f"UPDATE {table} SET product=product_text WHERE (product IS NULL OR product='') AND COALESCE(product_text,'')<>''")
            if 'customer_name' in cols and 'customer' in cols:
                query(f"UPDATE {table} SET customer_name=customer WHERE (customer_name IS NULL OR customer_name='') AND COALESCE(customer,'')<>''")
                query(f"UPDATE {table} SET customer=customer_name WHERE (customer IS NULL OR customer='') AND COALESCE(customer_name,'')<>''")
        except Exception:
            pass
    try:
        query("UPDATE warehouse_cells SET column_index=band WHERE COALESCE(column_index,0)=0 OR column_index IS NULL")
        query("UPDATE warehouse_cells SET slot_number=slot WHERE COALESCE(slot_number,0)=0 OR slot_number IS NULL")
    except Exception:
        pass

    # qty / quantity mutual repair from numeric columns first.
    for table in ('inventory', 'orders', 'master_orders'):
        try:
            cols = table_columns(table)
            if 'qty' in cols and 'quantity' in cols:
                query(f"UPDATE {table} SET qty=quantity WHERE (qty IS NULL OR qty=0) AND COALESCE(quantity,0)>0")
                query(f"UPDATE {table} SET quantity=qty WHERE (quantity IS NULL OR quantity=0) AND COALESCE(qty,0)>0")
        except Exception:
            pass

    # Parse qty from product text for rows that still have no quantity.
    for table in ('inventory', 'orders', 'master_orders'):
        try:
            rows = query(f"SELECT id, product, COALESCE(qty,0) AS qty, COALESCE(quantity,0) AS quantity FROM {table} WHERE COALESCE(NULLIF(qty,0), quantity, 0)=0 AND product IS NOT NULL AND product<>'' LIMIT 5000", fetch=True)
            for r in rows:
                qty = _parse_qty_from_product_text(r.get('product'))
                if qty > 0:
                    query(f"UPDATE {table} SET qty=?, quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", [qty, qty, r.get('id')])
        except Exception:
            pass

    # Sync all customer names found in data tables back into customers table.
    seen = set()
    for table in ('inventory', 'orders', 'master_orders', 'shipping_records', 'warehouse_items'):
        try:
            if 'customer' not in table_columns(table):
                continue
            rows = query(f"SELECT DISTINCT customer FROM {table} WHERE customer IS NOT NULL AND customer<>'' LIMIT 5000", fetch=True)
            for r in rows:
                name = str(r.get('customer') or '').strip()
                if name:
                    seen.add(name)
        except Exception:
            pass
    for name in sorted(seen):
        try:
            exists = query("SELECT id FROM customers WHERE name=?", [name], fetch=True, one=True)
            if not exists:
                query("INSERT INTO customers(name, region, archived) VALUES(?, '北區', 0)", [name])
            else:
                query("UPDATE customers SET archived=0 WHERE name=?", [name])
        except Exception:
            pass

    # Keep customer list searchable even if old rows had archived/null values.
    try:
        query("UPDATE customers SET archived=0 WHERE archived IS NULL")
        query("UPDATE customers SET region='北區' WHERE region IS NULL OR region='' ")
    except Exception:
        pass

def _ensure_activity_log_columns_safe():
    for col, ddl in [
        ('category', "TEXT DEFAULT ''"), ('customer', "TEXT DEFAULT ''"), ('product', "TEXT DEFAULT ''"),
        ('qty', 'INTEGER DEFAULT 0'), ('action', "TEXT DEFAULT ''"), ('operator', "TEXT DEFAULT ''"),
        ('unread', 'INTEGER DEFAULT 1'), ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
    ]:
        try:
            ensure_column('activity_logs', col, ddl)
        except Exception:
            pass

def log_action(username, action, entity='', entity_id='', detail=None, category=''):
    detail = detail or {}
    detail_text = _json_dumps(detail)
    try:
        query("INSERT INTO audit_logs(username, action, entity, entity_id, detail) VALUES(?, ?, ?, ?, ?)", [username, action, entity, str(entity_id or ''), detail_text])
    except Exception:
        pass
    if category:
        try:
            query("INSERT INTO activity_logs(category, customer, product, qty, action, operator) VALUES(?, ?, ?, ?, ?, ?)", [category, detail.get('customer',''), detail.get('product',''), int(detail.get('qty') or 0), action, username])
        except Exception:
            _ensure_activity_log_columns_safe()
            try:
                query("INSERT INTO activity_logs(category, customer, product, qty, action, operator) VALUES(?, ?, ?, ?, ?, ?)", [category, detail.get('customer',''), detail.get('product',''), int(detail.get('qty') or 0), action, username])
            except Exception:
                pass


def tx_log_action(cur, username, action, entity='', entity_id='', detail=None, category=''):
    detail = detail or {}
    detail_text = _json_dumps(detail)
    try:
        tx_query(cur, "INSERT INTO audit_logs(username, action, entity, entity_id, detail) VALUES(?, ?, ?, ?, ?)", [username, action, entity, str(entity_id or ''), detail_text])
    except Exception:
        pass
    if category:
        try:
            tx_query(cur, "INSERT INTO activity_logs(category, customer, product, qty, action, operator) VALUES(?, ?, ?, ?, ?, ?)", [category, detail.get('customer',''), detail.get('product',''), int(detail.get('qty') or 0), action, username])
        except Exception:
            pass



def masked_database_url():
    """Return a safe DB label for debugging without exposing passwords."""
    from urllib.parse import urlparse
    if not DATABASE_URL:
        return "sqlite" if not USE_POSTGRES else "postgres://未設定"
    try:
        u = urlparse(DATABASE_URL)
        user = u.username or ''
        host = u.hostname or ''
        dbname = (u.path or '').lstrip('/')
        return f"{u.scheme}://{user}:***@{host}/{dbname}"
    except Exception:
        return "postgres://***"


def data_counts():
    """Counts used by UI/debug to prove which DB is connected."""
    out = {}
    for table in ("customers", "inventory", "orders", "master_orders", "warehouse_items", "shipping_records"):
        try:
            out[table] = int((query(f"SELECT COUNT(*) AS n FROM {table}", fetch=True, one=True) or {}).get("n") or 0)
        except Exception:
            out[table] = -1
    return out

def db_status():
    try:
        row = query("SELECT 1 AS ok", fetch=True, one=True)
        return {"ok": True, "engine": "postgres" if USE_POSTGRES else "sqlite", "database": masked_database_url(), "counts": data_counts(), "row": row}
    except Exception as e:
        return {"ok": False, "engine": "postgres" if USE_POSTGRES else "sqlite", "database": masked_database_url(), "message": str(e)}
