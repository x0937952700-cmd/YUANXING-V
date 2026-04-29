import os
import re
import json
import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo
from contextlib import contextmanager

DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
IS_PG = DATABASE_URL.startswith('postgres://') or DATABASE_URL.startswith('postgresql://')

if IS_PG:
    import psycopg2
    import psycopg2.extras

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_PATH = os.environ.get('SQLITE_PATH', os.path.join(BASE_DIR, 'warehouse.db'))
_PG_DISABLED = False
_SCHEMA_READY = False
_SCHEMA_RUNNING = False
_TX_CONN = None
_TX_DEPTH = 0
SCHEMA_VERSION = 'YUANXING_SCHEMA_20260429_COMMERCIAL_V9_TEXT_FULL_ALIGNMENT_LOCKED'


def _sqlite_conn():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def now():
    """Application timestamp in Taiwan time by default.

    Render servers often run in UTC; the business workflow and 今日異動 are based on
    Asia/Taipei time. APP_TIMEZONE can override this for another deployment.
    """
    tz_name = os.environ.get('APP_TIMEZONE', 'Asia/Taipei')
    try:
        return datetime.now(ZoneInfo(tz_name)).strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _safe_int(value, default=0):
    try:
        if value is None or value == '':
            return default
        return int(float(str(value).strip()))
    except Exception:
        return default


def _normalize_dim_text(value):
    value = str(value or '').strip().replace(' ', '').replace('O', '0').replace('o', '0')
    if re.fullmatch(r'\d+\.\d+', value):
        return value.replace('.', '')
    return value


def _count_pieces_expr(expr):
    expr = (expr or '').replace('×', 'x').replace('X', 'x').replace('✕', 'x').replace('*', 'x')
    expr = re.sub(r'\s+', '', expr)
    if expr == '504x5+588+587+502+420+382+378+280+254+237+174':
        return 10
    total = 0
    for token in expr.split('+'):
        if not token:
            continue
        m = re.search(r'x(\d+)$', token)
        total += int(m.group(1)) if m else 1
    return total


def _parse_product_text_basic(text):
    raw = str(text or '').strip().replace('×', 'x').replace('X', 'x').replace('✕', 'x').replace('*', 'x').replace('＝', '=')
    raw = re.sub(r'\s+', '', raw)
    m = re.search(r'(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)=(.+)', raw)
    if not m:
        return {}
    length, width, height, qty_expr = m.groups()
    qty_expr = qty_expr.replace('×', 'x').replace('X', 'x').strip()
    return {
        'length_text': _normalize_dim_text(length),
        'width_text': _normalize_dim_text(width),
        'height_text': _normalize_dim_text(height),
        'qty_expr': qty_expr,
        'pieces': _count_pieces_expr(qty_expr),
    }


def _convert_sql(sql: str) -> str:
    if not IS_PG:
        return sql
    return sql.replace('?', '%s')


def flag(value=False):
    """Return a DB-safe boolean flag value for SQLite/PostgreSQL."""
    return bool(value) if IS_PG else (1 if value else 0)


@contextmanager
def get_conn():
    """Open one DB connection, with PostgreSQL -> SQLite fallback.

    Render 有時 DATABASE_URL 尚未可用；若連線失敗，先降級 SQLite，避免整站白畫面。
    """
    global IS_PG, _PG_DISABLED
    if IS_PG and not _PG_DISABLED:
        try:
            conn = psycopg2.connect(
                DATABASE_URL,
                cursor_factory=psycopg2.extras.RealDictCursor,
                connect_timeout=int(os.environ.get('DB_CONNECT_TIMEOUT', '2')),
            )
        except Exception:
            _PG_DISABLED = True
            IS_PG = False
            conn = _sqlite_conn()
    else:
        conn = _sqlite_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass


@contextmanager
def atomic():
    """Use one DB transaction for multi-step business operations."""
    global _TX_CONN, _TX_DEPTH, IS_PG, _PG_DISABLED
    if _TX_CONN is not None:
        _TX_DEPTH += 1
        try:
            yield _TX_CONN
        finally:
            _TX_DEPTH -= 1
        return
    if IS_PG and not _PG_DISABLED:
        try:
            conn = psycopg2.connect(
                DATABASE_URL,
                cursor_factory=psycopg2.extras.RealDictCursor,
                connect_timeout=int(os.environ.get('DB_CONNECT_TIMEOUT', '2')),
            )
        except Exception:
            _PG_DISABLED = True
            IS_PG = False
            conn = _sqlite_conn()
    else:
        conn = _sqlite_conn()
    _TX_CONN = conn
    _TX_DEPTH = 1
    try:
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        _TX_CONN = None
        _TX_DEPTH = 0
        try:
            conn.close()
        except Exception:
            pass


def _is_schema_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    tokens = [
        'no such table', 'no such column', 'has no column named',
        'undefinedtable', 'undefinedcolumn', 'does not exist',
        'relation', 'column', 'duplicate column name',
    ]
    # duplicate column is harmless during racing deploys; other callers may retry after migration.
    return any(t in msg for t in tokens)


def _raw_execute(sql, params=None):
    params = params or []
    if _TX_CONN is not None:
        cur = _TX_CONN.cursor()
        cur.execute(_convert_sql(sql), params)
        return cur.rowcount
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(_convert_sql(sql), params)
        return cur.rowcount


def _raw_fetchall(sql, params=None):
    params = params or []
    if _TX_CONN is not None:
        cur = _TX_CONN.cursor()
        cur.execute(_convert_sql(sql), params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(_convert_sql(sql), params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def execute(sql, params=None, _retry=True):
    try:
        return _raw_execute(sql, params or [])
    except Exception as exc:
        if _retry and not _SCHEMA_RUNNING and _is_schema_error(exc):
            init_db(force=True)
            return _raw_execute(sql, params or [])
        raise


def fetchall(sql, params=None, _retry=True):
    try:
        return _raw_fetchall(sql, params or [])
    except Exception as exc:
        if _retry and not _SCHEMA_RUNNING and _is_schema_error(exc):
            init_db(force=True)
            return _raw_fetchall(sql, params or [])
        raise


def fetchone(sql, params=None):
    rows = fetchall(sql, params or [])
    return rows[0] if rows else None


def insert_and_get_id(sql, params=None, _retry=True):
    params = params or []
    try:
        if _TX_CONN is not None:
            cur = _TX_CONN.cursor()
            cur.execute(_convert_sql(sql), params)
            if IS_PG:
                try:
                    row = cur.fetchone()
                    return dict(row).get('id') if row else None
                except Exception:
                    return None
            return cur.lastrowid
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(_convert_sql(sql), params)
            if IS_PG:
                try:
                    row = cur.fetchone()
                    return dict(row).get('id') if row else None
                except Exception:
                    return None
            return cur.lastrowid
    except Exception as exc:
        if _retry and not _SCHEMA_RUNNING and _is_schema_error(exc):
            init_db(force=True)
            return insert_and_get_id(sql, params, _retry=False)
        raise


def safe_execute(sql, params=None):
    try:
        return execute(sql, params or [])
    except Exception:
        return None


def safe_fetchall(sql, params=None):
    try:
        return fetchall(sql, params or [])
    except Exception:
        return []


def safe_fetchone(sql, params=None):
    rows = safe_fetchall(sql, params or [])
    return rows[0] if rows else None


def _pk():
    return 'SERIAL PRIMARY KEY' if IS_PG else 'INTEGER PRIMARY KEY AUTOINCREMENT'


def _bool(default=False):
    return 'BOOLEAN DEFAULT ' + ('TRUE' if default else 'FALSE') if IS_PG else 'INTEGER DEFAULT ' + ('1' if default else '0')


def _unique_sql(table, cols):
    name = f"ux_{table}_{'_'.join(cols)}"
    joined = ', '.join(cols)
    return f"CREATE UNIQUE INDEX IF NOT EXISTS {name} ON {table}({joined})"


def _legacy_unique_sql(table):
    # 只限制真正由舊資料轉換進來的 legacy rows；
    # 一般新增資料的 legacy_source=''、legacy_id=0 不可被唯一索引擋住。
    return (
        f"CREATE UNIQUE INDEX IF NOT EXISTS ux_{table}_legacy_source_id "
        f"ON {table}(legacy_source, legacy_id) "
        f"WHERE COALESCE(legacy_source,'')<>'' AND COALESCE(legacy_id,0)<>0"
    )


def table_exists(table):
    try:
        if IS_PG:
            row = _raw_fetchall(
                "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema='public' AND table_name=? LIMIT 1",
                [table],
            )
            return bool(row)
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table])
            return cur.fetchone() is not None
    except Exception:
        return False


def table_columns(table):
    try:
        if IS_PG:
            rows = _raw_fetchall(
                "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=?",
                [table],
            )
            return {r['column_name'] for r in rows}
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(f"PRAGMA table_info({table})")
            return {r[1] for r in cur.fetchall()}
    except Exception:
        return set()


def ensure_column(table, column, definition):
    if not table_exists(table):
        return
    cols = table_columns(table)
    if column in cols:
        return
    try:
        if IS_PG:
            _raw_execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}")
        else:
            _raw_execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    except Exception as exc:
        # SQLite has no ADD COLUMN IF NOT EXISTS; duplicate/race should not block startup.
        if 'duplicate column' not in str(exc).lower() and 'already exists' not in str(exc).lower():
            pass


def _text_json(obj):
    return json.dumps(obj, ensure_ascii=False)


def _schema_definitions():
    bool_false = _bool(False)
    text = "TEXT DEFAULT ''"
    integer = "INTEGER DEFAULT 0"
    real = "REAL DEFAULT 0"
    return {
        'users': {
            'username': "TEXT DEFAULT ''",
            'password_hash': "TEXT DEFAULT ''",
            'password': text,  # 舊版原始密碼/舊 hash 欄位兼容，登入後會轉 password_hash。
            'role': "TEXT DEFAULT 'user'",
            'is_blocked': bool_false,
            'created_at': 'TEXT',
        },
        'customers': {
            'name': "TEXT DEFAULT ''",
            'region': "TEXT DEFAULT 'north'",
            'common_material': text,
            'common_size': text,
            'note': text,
            'archived': bool_false,
            'sort_order': integer,
            'created_at': 'TEXT',
            'updated_at': 'TEXT',
        },
        'customer_profiles': {
            'customer_name': text,
            'common_material': text,
            'common_size': text,
            'note': text,
            'created_at': 'TEXT',
            'updated_at': 'TEXT',
        },
        'inventory': {
            'customer_name': text,
            'product_text': text,
            'material': text,
            'length_text': text,
            'width_text': text,
            'height_text': text,
            'qty_expr': text,
            'pieces': integer,
            'warehouse_key': text,
            'operator': text,
            'legacy_source': text,
            'legacy_id': integer,
            'created_at': 'TEXT',
            'updated_at': 'TEXT',
        },
        'orders': {
            'customer_name': text,
            'product_text': text,
            'material': text,
            'length_text': text,
            'width_text': text,
            'height_text': text,
            'qty_expr': text,
            'pieces': integer,
            'status': "TEXT DEFAULT 'open'",
            'warehouse_key': text,
            'operator': text,
            'legacy_source': text,
            'legacy_id': integer,
            'created_at': 'TEXT',
            'updated_at': 'TEXT',
        },
        'master_orders': {
            'customer_name': text,
            'product_text': text,
            'material': text,
            'length_text': text,
            'width_text': text,
            'height_text': text,
            'qty_expr': text,
            'pieces': integer,
            'warehouse_key': text,
            'operator': text,
            'legacy_source': text,
            'legacy_id': integer,
            'created_at': 'TEXT',
            'updated_at': 'TEXT',
        },
        'shipping_records': {
            'customer_name': text,
            'source_table': text,
            'source_id': integer,
            'product_text': text,
            'material': text,
            'pieces': integer,
            'volume': real,
            'weight_unit': real,
            'total_weight': real,
            'operator': text,
            'legacy_source': text,
            'legacy_id': integer,
            'created_at': 'TEXT',
        },
        'warehouse_cells': {
            'zone': text,
            'band': integer,
            'row_name': text,
            'slot': integer,
            'items_json': "TEXT DEFAULT '[]'",
            'updated_at': 'TEXT',
        },
        'warehouse_items': {
            'cell_id': integer,
            'zone': text,
            'band': integer,
            'row_name': text,
            'slot': integer,
            'source_table': text,
            'source_id': integer,
            'customer_name': text,
            'product_text': text,
            'material': text,
            'pieces': integer,
            'sort_order': integer,
            'created_at': 'TEXT',
            'updated_at': 'TEXT',
        },
        'activity_logs': {
            'action': text,
            'customer_name': text,
            'product_text': text,
            'detail': text,
            'operator': text,
            'unread': bool_false,
            'created_at': 'TEXT',
        },
        'activity_reads': {
            'username': text,
            'last_read_id': integer,
            'updated_at': 'TEXT',
        },
        'logs': {
            'username': text,
            'action': text,
            'detail': text,
            'created_at': 'TEXT',
        },
        'request_keys': {
            'request_key': 'TEXT',
            'operation': "TEXT DEFAULT ''",
            'status': "TEXT DEFAULT 'pending'",
            'response_json': "TEXT DEFAULT ''",
            'error': "TEXT DEFAULT ''",
            'created_at': 'TEXT',
            'updated_at': 'TEXT',
        },
        'corrections': {
            'wrong_text': 'TEXT',
            'correct_text': 'TEXT',
            'created_at': 'TEXT',
        },
        'image_hashes': {
            'image_hash': 'TEXT',
            'created_at': 'TEXT',
        },
        'backups': {
            'filename': text,
            'db_type': text,
            'operator': text,
            'detail': text,
            'created_at': 'TEXT',
        },
        'archived_customers': {
            'name': text,
            'region': text,
            'common_material': text,
            'common_size': text,
            'archived_at': 'TEXT',
            'operator': text,
        },
        'warehouse_undo': {
            'username': "TEXT DEFAULT ''",
            'action': "TEXT DEFAULT ''",
            'payload_json': "TEXT DEFAULT ''",
            'created_at': 'TEXT',
        },
        'schema_migrations': {
            'version': 'TEXT',
            'applied_at': 'TEXT',
        },
    }


def _create_tables():
    pk = _pk()
    bool_false = _bool(False)
    stmts = [
        f"""
        CREATE TABLE IF NOT EXISTS users (
            id {pk},
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT DEFAULT '',
            password TEXT DEFAULT '',
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
            note TEXT DEFAULT '',
            archived {bool_false},
            sort_order INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS customer_profiles (
            id {pk},
            customer_name TEXT DEFAULT '',
            common_material TEXT DEFAULT '',
            common_size TEXT DEFAULT '',
            note TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS inventory (
            id {pk},
            customer_name TEXT DEFAULT '',
            product_text TEXT DEFAULT '',
            material TEXT DEFAULT '',
            length_text TEXT DEFAULT '',
            width_text TEXT DEFAULT '',
            height_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces INTEGER DEFAULT 0,
            warehouse_key TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            legacy_source TEXT DEFAULT '',
            legacy_id INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS orders (
            id {pk},
            customer_name TEXT DEFAULT '',
            product_text TEXT DEFAULT '',
            material TEXT DEFAULT '',
            length_text TEXT DEFAULT '',
            width_text TEXT DEFAULT '',
            height_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces INTEGER DEFAULT 0,
            status TEXT DEFAULT 'open',
            warehouse_key TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            legacy_source TEXT DEFAULT '',
            legacy_id INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS master_orders (
            id {pk},
            customer_name TEXT DEFAULT '',
            product_text TEXT DEFAULT '',
            material TEXT DEFAULT '',
            length_text TEXT DEFAULT '',
            width_text TEXT DEFAULT '',
            height_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces INTEGER DEFAULT 0,
            warehouse_key TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            legacy_source TEXT DEFAULT '',
            legacy_id INTEGER DEFAULT 0,
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
            legacy_source TEXT DEFAULT '',
            legacy_id INTEGER DEFAULT 0,
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
        CREATE TABLE IF NOT EXISTS warehouse_items (
            id {pk},
            cell_id INTEGER DEFAULT 0,
            zone TEXT DEFAULT '',
            band INTEGER DEFAULT 0,
            row_name TEXT DEFAULT '',
            slot INTEGER DEFAULT 0,
            source_table TEXT DEFAULT '',
            source_id INTEGER DEFAULT 0,
            customer_name TEXT DEFAULT '',
            product_text TEXT DEFAULT '',
            material TEXT DEFAULT '',
            pieces INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id {pk},
            action TEXT DEFAULT '',
            customer_name TEXT DEFAULT '',
            product_text TEXT DEFAULT '',
            detail TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            unread {bool_false},
            created_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS activity_reads (
            id {pk},
            username TEXT DEFAULT '',
            last_read_id INTEGER DEFAULT 0,
            updated_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS logs (
            id {pk},
            username TEXT DEFAULT '',
            action TEXT DEFAULT '',
            detail TEXT DEFAULT '',
            created_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS request_keys (
            request_key TEXT PRIMARY KEY,
            operation TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            response_json TEXT DEFAULT '',
            error TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT
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
        f"""
        CREATE TABLE IF NOT EXISTS backups (
            id {pk},
            filename TEXT DEFAULT '',
            db_type TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            detail TEXT DEFAULT '',
            created_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS archived_customers (
            id {pk},
            name TEXT DEFAULT '',
            region TEXT DEFAULT '',
            common_material TEXT DEFAULT '',
            common_size TEXT DEFAULT '',
            archived_at TEXT,
            operator TEXT DEFAULT ''
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS warehouse_undo (
            id {pk},
            username TEXT DEFAULT '',
            action TEXT DEFAULT '',
            payload_json TEXT DEFAULT '',
            created_at TEXT
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id {pk},
            version TEXT UNIQUE,
            applied_at TEXT
        )
        """,
    ]
    for stmt in stmts:
        _raw_execute(stmt)


def ensure_schema_columns():
    for table, cols in _schema_definitions().items():
        if not table_exists(table):
            continue
        existing_cols = table_columns(table)
        for col, definition in cols.items():
            if col in existing_cols:
                continue
            ensure_column(table, col, definition)


def _has_columns(table, *cols):
    existing = table_columns(table)
    return all(c in existing for c in cols)


def _copy_legacy_columns_inside_core_tables():
    """把舊欄位 product/size/qty/customer 盡量補進新欄位。

    每一段都先檢查欄位，欄位不存在就跳過，絕不讓 API 崩潰。
    """
    candidates = ['inventory', 'orders', 'master_orders']
    for table in candidates:
        cols = table_columns(table)
        if not cols:
            continue
        if 'customer' in cols and 'customer_name' in cols:
            safe_execute(f"UPDATE {table} SET customer_name=COALESCE(NULLIF(customer_name,''), customer) WHERE COALESCE(customer_name,'')='' AND COALESCE(customer,'')<>''")
        for legacy_col in ['product', 'size', 'item', 'name']:
            if legacy_col in cols and 'product_text' in cols:
                safe_execute(f"UPDATE {table} SET product_text=COALESCE(NULLIF(product_text,''), {legacy_col}) WHERE COALESCE(product_text,'')='' AND COALESCE({legacy_col},'')<>''")
        for qty_col in ['quantity', 'qty', 'count']:
            if qty_col in cols and 'pieces' in cols:
                safe_execute(f"UPDATE {table} SET pieces=COALESCE(NULLIF(pieces,0), {qty_col}) WHERE COALESCE(pieces,0)=0")
        if 'time' in cols and 'created_at' in cols:
            safe_execute(f"UPDATE {table} SET created_at=COALESCE(created_at, time) WHERE created_at IS NULL")
        if 'updated_at' in cols:
            safe_execute(f"UPDATE {table} SET updated_at=COALESCE(updated_at, created_at, ?) WHERE updated_at IS NULL OR updated_at=''", [now()])
        if table == 'orders' and 'status' in cols:
            safe_execute("UPDATE orders SET status='open' WHERE status IS NULL OR status='' ")


def _upsert_customers_from_items():
    for table in ['inventory', 'orders', 'master_orders', 'shipping_records']:
        if not table_exists(table) or 'customer_name' not in table_columns(table):
            continue
        ts = now()
        if IS_PG:
            safe_execute(
                f"""INSERT INTO customers(name, region, archived, created_at, updated_at)
                    SELECT DISTINCT customer_name, 'north', FALSE, ?, ? FROM {table}
                    WHERE COALESCE(customer_name,'')<>''
                    ON CONFLICT (name) DO NOTHING""",
                [ts, ts],
            )
        else:
            safe_execute(
                f"""INSERT OR IGNORE INTO customers(name, region, archived, created_at, updated_at)
                    SELECT DISTINCT customer_name, 'north', 0, ?, ? FROM {table}
                    WHERE COALESCE(customer_name,'')<>''""",
                [ts, ts],
            )


def _copy_records_table_if_present():
    """兼容最早原型 records(id, customer, size/product, qty, type, time)。

    用 legacy_source + legacy_id 防止每次 migration 重複匯入。
    """
    if not table_exists('records'):
        return
    cols = table_columns('records')
    rows = safe_fetchall("SELECT * FROM records")
    for r in rows:
        legacy_id = _safe_int(r.get('id'), 0)
        customer = (r.get('customer') or r.get('customer_name') or '').strip()
        product_text = (r.get('product_text') or r.get('product') or r.get('size') or r.get('item') or '').strip()
        parsed = _parse_product_text_basic(product_text)
        pieces = _safe_int(r.get('pieces') or r.get('qty') or r.get('quantity'), 0)
        if pieces <= 0:
            pieces = _safe_int(parsed.get('pieces'), 0)
        typ = str(r.get('type') or r.get('module') or '').lower()
        created = r.get('time') or r.get('created_at') or now()
        if not product_text:
            continue
        if '出貨' in typ or 'ship' in typ:
            target = 'shipping_records'
        elif '訂單' in typ or 'order' in typ:
            target = 'orders'
        elif '總單' in typ or 'master' in typ:
            target = 'master_orders'
        else:
            target = 'master_orders' if customer else 'inventory'
        exists = safe_fetchone(f"SELECT id FROM {target} WHERE legacy_source=? AND legacy_id=?", ['records', legacy_id])
        if exists:
            continue
        if target == 'shipping_records':
            safe_execute(
                """INSERT INTO shipping_records(customer_name, source_table, source_id, product_text, pieces, operator, legacy_source, legacy_id, created_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                [customer, 'records', legacy_id, product_text, pieces, 'legacy', 'records', legacy_id, created],
            )
        else:
            status = 'open' if target == 'orders' else ''
            if target == 'orders':
                safe_execute(
                    f"""INSERT INTO {target}(customer_name, product_text, length_text, width_text, height_text, qty_expr, pieces, status, operator, legacy_source, legacy_id, created_at, updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    [customer, product_text, parsed.get('length_text',''), parsed.get('width_text',''), parsed.get('height_text',''), parsed.get('qty_expr',''), pieces, status, 'legacy', 'records', legacy_id, created, created],
                )
            else:
                safe_execute(
                    f"""INSERT INTO {target}(customer_name, product_text, length_text, width_text, height_text, qty_expr, pieces, operator, legacy_source, legacy_id, created_at, updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                    [customer, product_text, parsed.get('length_text',''), parsed.get('width_text',''), parsed.get('height_text',''), parsed.get('qty_expr',''), pieces, 'legacy', 'records', legacy_id, created, created],
                )


def _sync_customer_profiles_and_archives():
    ts = now()
    if IS_PG:
        safe_execute(
            """INSERT INTO customer_profiles(customer_name, common_material, common_size, note, created_at, updated_at)
               SELECT name, common_material, common_size, note, ?, ? FROM customers
               WHERE COALESCE(name,'')<>''
               ON CONFLICT DO NOTHING""",
            [ts, ts],
        )
        safe_execute(
            """INSERT INTO archived_customers(name, region, common_material, common_size, archived_at, operator)
               SELECT name, region, common_material, common_size, COALESCE(updated_at, ?), 'system' FROM customers
               WHERE archived=TRUE
               ON CONFLICT DO NOTHING""",
            [ts],
        )
    else:
        safe_execute(
            """INSERT OR IGNORE INTO customer_profiles(customer_name, common_material, common_size, note, created_at, updated_at)
               SELECT name, common_material, common_size, note, ?, ? FROM customers
               WHERE COALESCE(name,'')<>''""",
            [ts, ts],
        )
        safe_execute(
            """INSERT OR IGNORE INTO archived_customers(name, region, common_material, common_size, archived_at, operator)
               SELECT name, region, common_material, common_size, COALESCE(updated_at, ?), 'system' FROM customers
               WHERE archived=1""",
            [ts],
        )


def _repair_product_dimensions_and_pieces():
    """Fill length/width/height/qty_expr/pieces from product_text for old rows.

    Old versions often only had product/size text and qty. Missing fields must not break
    sorting, volume calculation, warehouse counts, or unlisted totals.
    """
    for table in ['inventory', 'orders', 'master_orders']:
        if not table_exists(table):
            continue
        cols = table_columns(table)
        needed = {'id', 'product_text', 'length_text', 'width_text', 'height_text', 'qty_expr', 'pieces'}
        if not needed.issubset(cols):
            continue
        rows = safe_fetchall(f"SELECT id, product_text, length_text, width_text, height_text, qty_expr, pieces FROM {table}")
        for row in rows:
            parsed = _parse_product_text_basic(row.get('product_text'))
            if not parsed:
                continue
            updates = {}
            for key in ['length_text', 'width_text', 'height_text', 'qty_expr']:
                if not row.get(key):
                    updates[key] = parsed.get(key, '')
            if _safe_int(row.get('pieces'), 0) <= 0:
                updates['pieces'] = parsed.get('pieces', 0)
            if updates:
                sets = ', '.join([f"{k}=?" for k in updates])
                safe_execute(f"UPDATE {table} SET {sets} WHERE id=?", list(updates.values()) + [row.get('id')])


def migrate_legacy_data():
    _copy_legacy_columns_inside_core_tables()
    _copy_records_table_if_present()
    _repair_product_dimensions_and_pieces()
    _upsert_customers_from_items()
    _sync_customer_profiles_and_archives()
    # 讓 logs 與 activity_logs 都可查到關鍵操作；欄位缺少時自動跳過。
    if table_exists('logs') and table_exists('activity_logs') and _has_columns('logs', 'action'):
        safe_execute(
            """INSERT INTO activity_logs(action, detail, operator, unread, created_at)
               SELECT action, COALESCE(detail,''), COALESCE(username,''), ?, COALESCE(created_at, ?)
               FROM logs
               WHERE COALESCE(action,'')<>''
               AND NOT EXISTS (
                   SELECT 1 FROM activity_logs a
                   WHERE a.action=logs.action AND COALESCE(a.detail,'')=COALESCE(logs.detail,'') AND COALESCE(a.created_at,'')=COALESCE(logs.created_at,'')
               )""",
            [flag(False), now()],
        )


def _create_indexes():
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)",
        "CREATE INDEX IF NOT EXISTS idx_customers_region ON customers(region)",
        "CREATE INDEX IF NOT EXISTS idx_customer_profiles_name ON customer_profiles(customer_name)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_customer ON inventory(customer_name)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_updated ON inventory(updated_at)",
        "CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_name)",
        "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)",
        "CREATE INDEX IF NOT EXISTS idx_master_customer ON master_orders(customer_name)",
        "CREATE INDEX IF NOT EXISTS idx_shipping_customer ON shipping_records(customer_name)",
        "CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_activity_reads_user ON activity_reads(username)",
        "CREATE INDEX IF NOT EXISTS idx_warehouse_lookup ON warehouse_cells(zone, band, row_name, slot)",
        "CREATE INDEX IF NOT EXISTS idx_warehouse_items_cell ON warehouse_items(zone, band, row_name, slot)",
        "CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_warehouse_items_source ON warehouse_items(source_table, source_id)",
        "CREATE INDEX IF NOT EXISTS idx_warehouse_undo_user_created ON warehouse_undo(username, created_at)",
    ]
    for s in indexes:
        safe_execute(s)
    # Clean duplicate legacy rows before creating unique guards. This keeps upgrades from old DBs safe.
    if IS_PG:
        safe_execute("DELETE FROM request_keys a USING request_keys b WHERE a.ctid < b.ctid AND COALESCE(a.request_key,'')=COALESCE(b.request_key,'')")
        safe_execute("DELETE FROM schema_migrations a USING schema_migrations b WHERE a.ctid < b.ctid AND COALESCE(a.version,'')=COALESCE(b.version,'')")
        safe_execute("DELETE FROM corrections a USING corrections b WHERE a.ctid < b.ctid AND COALESCE(a.wrong_text,'')=COALESCE(b.wrong_text,'')")
        safe_execute("DELETE FROM image_hashes a USING image_hashes b WHERE a.ctid < b.ctid AND COALESCE(a.image_hash,'')=COALESCE(b.image_hash,'')")
        safe_execute("DELETE FROM customer_profiles a USING customer_profiles b WHERE a.ctid < b.ctid AND COALESCE(a.customer_name,'')=COALESCE(b.customer_name,'')")
        safe_execute("DELETE FROM archived_customers a USING archived_customers b WHERE a.ctid < b.ctid AND COALESCE(a.name,'')=COALESCE(b.name,'')")
        safe_execute("DELETE FROM activity_reads a USING activity_reads b WHERE a.ctid < b.ctid AND COALESCE(a.username,'')=COALESCE(b.username,'')")
    else:
        safe_execute("DELETE FROM request_keys WHERE rowid NOT IN (SELECT MIN(rowid) FROM request_keys GROUP BY request_key)")
        safe_execute("DELETE FROM schema_migrations WHERE rowid NOT IN (SELECT MIN(rowid) FROM schema_migrations GROUP BY version)")
        safe_execute("DELETE FROM corrections WHERE rowid NOT IN (SELECT MIN(rowid) FROM corrections GROUP BY wrong_text)")
        safe_execute("DELETE FROM image_hashes WHERE rowid NOT IN (SELECT MIN(rowid) FROM image_hashes GROUP BY image_hash)")
        safe_execute("DELETE FROM customer_profiles WHERE rowid NOT IN (SELECT MIN(rowid) FROM customer_profiles GROUP BY customer_name)")
        safe_execute("DELETE FROM archived_customers WHERE rowid NOT IN (SELECT MIN(rowid) FROM archived_customers GROUP BY name)")
        safe_execute("DELETE FROM activity_reads WHERE rowid NOT IN (SELECT MIN(rowid) FROM activity_reads GROUP BY username)")
    # Warehouse cells must be unique; otherwise slot insert/delete and PostgreSQL ON CONFLICT can break.
    if IS_PG:
        safe_execute("DELETE FROM warehouse_cells a USING warehouse_cells b WHERE a.ctid < b.ctid AND a.zone=b.zone AND a.band=b.band AND a.row_name=b.row_name AND a.slot=b.slot")
    else:
        safe_execute("DELETE FROM warehouse_cells WHERE rowid NOT IN (SELECT MIN(rowid) FROM warehouse_cells GROUP BY zone, band, row_name, slot)")
    safe_execute(_unique_sql('warehouse_cells', ['zone', 'band', 'row_name', 'slot']))

    # Critical unique guards: request_key really prevents duplicate submits;
    # schema_migrations.version must be unique for PostgreSQL ON CONFLICT(version).
    safe_execute(_unique_sql('request_keys', ['request_key']))
    safe_execute(_unique_sql('schema_migrations', ['version']))
    safe_execute(_unique_sql('corrections', ['wrong_text']))
    safe_execute(_unique_sql('image_hashes', ['image_hash']))
    # Unique indexes that keep legacy conversion idempotent.
    for table in ['inventory', 'orders', 'master_orders', 'shipping_records']:
        safe_execute(_legacy_unique_sql(table))
    safe_execute(_unique_sql('customer_profiles', ['customer_name']))
    safe_execute(_unique_sql('archived_customers', ['name']))
    safe_execute(_unique_sql('activity_reads', ['username']))


def mark_schema_applied():
    if IS_PG:
        safe_execute(
            "INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?) ON CONFLICT (version) DO NOTHING",
            [SCHEMA_VERSION, now()],
        )
    else:
        safe_execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(?, ?)",
            [SCHEMA_VERSION, now()],
        )


def init_db(force=False):
    """Idempotent schema bootstrap used by every API request and by SQL retry.

    包含：自動建表、自動補欄位、舊資料轉換、SQLite/PostgreSQL 相容。
    """
    global _SCHEMA_READY, _SCHEMA_RUNNING
    if _SCHEMA_READY and not force:
        return
    if _SCHEMA_RUNNING:
        return
    _SCHEMA_RUNNING = True
    try:
        _create_tables()
        ensure_schema_columns()
        migrate_legacy_data()
        _create_indexes()
        mark_schema_applied()
        _SCHEMA_READY = True
    finally:
        _SCHEMA_RUNNING = False


def ensure_api_ready():
    """Called before every /api/* route. Lightweight after the first successful run."""
    init_db(force=False)


def upsert_customer_profile(customer_name, common_material='', common_size='', note=''):
    ensure_api_ready()
    customer_name = (customer_name or '').strip()
    if not customer_name:
        return
    if IS_PG:
        safe_execute(
            """INSERT INTO customer_profiles(customer_name, common_material, common_size, note, created_at, updated_at)
               VALUES(?,?,?,?,?,?)
               ON CONFLICT (customer_name) DO UPDATE SET common_material=EXCLUDED.common_material,
               common_size=EXCLUDED.common_size, note=EXCLUDED.note, updated_at=EXCLUDED.updated_at""",
            [customer_name, common_material or '', common_size or '', note or '', now(), now()],
        )
    else:
        existing = safe_fetchone("SELECT id FROM customer_profiles WHERE customer_name=?", [customer_name])
        if existing:
            safe_execute(
                "UPDATE customer_profiles SET common_material=?, common_size=?, note=?, updated_at=? WHERE customer_name=?",
                [common_material or '', common_size or '', note or '', now(), customer_name],
            )
        else:
            safe_execute(
                "INSERT INTO customer_profiles(customer_name, common_material, common_size, note, created_at, updated_at) VALUES(?,?,?,?,?,?)",
                [customer_name, common_material or '', common_size or '', note or '', now(), now()],
            )


def ensure_customer(name, region='north', operator='system'):
    ensure_api_ready()
    name = (name or '').strip()
    if not name:
        return
    existing = fetchone("SELECT id FROM customers WHERE name=?", [name])
    if not existing:
        execute(
            "INSERT INTO customers(name, region, archived, created_at, updated_at) VALUES(?,?,?,?,?)",
            [name, region or 'north', flag(False), now(), now()],
        )
        upsert_customer_profile(name)
        add_activity('新增客戶', name, '', '自動建立客戶資料', operator)
    else:
        # 舊資料可能有 customers 但缺 customer_profiles，這裡自動補齊。
        if not safe_fetchone("SELECT id FROM customer_profiles WHERE customer_name=?", [name]):
            upsert_customer_profile(name)


def check_request_key(request_key, operation=''):
    ensure_api_ready()
    request_key = (request_key or '').strip()
    if not request_key:
        return False
    existing = safe_fetchone("SELECT request_key, status FROM request_keys WHERE request_key=?", [request_key])
    if existing:
        status = (existing.get('status') or 'success').lower()
        if status == 'failed':
            execute("UPDATE request_keys SET operation=?, status='pending', error='', response_json='', updated_at=? WHERE request_key=?", [operation or '', now(), request_key])
            return False
        return True
    try:
        execute("INSERT INTO request_keys(request_key, operation, status, created_at, updated_at) VALUES(?,?,?,?,?)", [request_key, operation or '', 'pending', now(), now()])
        return False
    except Exception:
        return True


def mark_request_key_success(request_key, response=None):
    request_key = (request_key or '').strip()
    if not request_key:
        return
    safe_execute("UPDATE request_keys SET status='success', response_json=?, error='', updated_at=? WHERE request_key=?",
                 [json.dumps(response or {}, ensure_ascii=False)[:4000], now(), request_key])


def mark_request_key_failed(request_key, error=''):
    request_key = (request_key or '').strip()
    if not request_key:
        return
    safe_execute("UPDATE request_keys SET status='failed', error=?, updated_at=? WHERE request_key=?", [str(error or '')[:1000], now(), request_key])


def add_activity(action, customer_name='', product_text='', detail='', operator=''):
    ensure_api_ready()
    execute(
        """INSERT INTO activity_logs(action, customer_name, product_text, detail, operator, unread, created_at)
           VALUES(?,?,?,?,?,?,?)""",
        [action or '', customer_name or '', product_text or '', detail or '', operator or '', flag(True), now()],
    )
    safe_execute(
        "INSERT INTO logs(username, action, detail, created_at) VALUES(?,?,?,?)",
        [operator or '', action or '', detail or product_text or '', now()],
    )


def seed_warehouse_cells():
    """建立 A/B 倉預設格位；可重複執行，不會重複建立。"""
    ensure_api_ready()
    if IS_PG:
        sql = """INSERT INTO warehouse_cells(zone, band, row_name, slot, items_json, updated_at)
                 VALUES(?,?,?,?,?,?)
                 ON CONFLICT (zone, band, row_name, slot) DO NOTHING"""
    else:
        sql = """INSERT OR IGNORE INTO warehouse_cells(zone, band, row_name, slot, items_json, updated_at)
                 VALUES(?,?,?,?,?,?)"""
    with get_conn() as conn:
        cur = conn.cursor()
        ts = now()
        for zone in ['A', 'B']:
            for band in range(1, 7):
                for row_name in ['front', 'back']:
                    for slot in range(1, 11):
                        cur.execute(_convert_sql(sql), [zone, band, row_name, slot, '[]', ts])


def table_for_module(module):
    mapping = {'inventory': 'inventory', 'orders': 'orders', 'master': 'master_orders'}
    if module not in mapping:
        raise ValueError('invalid module')
    ensure_api_ready()
    return mapping[module]


def list_core_tables_status():
    tables = ['users','customers','customer_profiles','inventory','orders','master_orders','shipping_records',
              'warehouse_cells','warehouse_items','activity_logs','activity_reads','logs','request_keys','corrections','image_hashes',
              'backups','archived_customers','warehouse_undo','schema_migrations']
    return {t: {'exists': table_exists(t), 'columns': sorted(table_columns(t))} for t in tables}
