import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse

try:
    import psycopg2
    import psycopg2.extras
    import psycopg2.pool
except Exception:
    psycopg2 = None

BASE_DIR = Path(__file__).resolve().parent
# Render 正式資料庫。
# 優先順序：Render 環境變數 DATABASE_URL -> WAREHOUSE_DATABASE_URL -> 這次你指定的 Render PostgreSQL。
# 這樣即使 render.yaml 的 DATABASE_URL sync:false 尚未手動填，也不會默默掉回 SQLite 看不到舊資料。
DEFAULT_RENDER_DATABASE_URL = (
    'postgresql://warehouse_ocr_d_user:5xOpnPjCU02QZdlMnICbRQOOKSRTyR3o'
    '@dpg-d7h1lumgvqtc73es1mjg-a.oregon-postgres.render.com/warehouse_ocr_d'
)
if os.environ.get('YX_USE_SQLITE', '0') == '1':
    DATABASE_URL = ''
else:
    # 這版依照你指定的 Render PostgreSQL 直接鎖定；避免 Render 上還殘留舊 DATABASE_URL 時，
    # 庫存/訂單/總單讀到另一個空資料庫。若未來要改資料庫，設 YX_FORCE_PROVIDED_DATABASE_URL=0。
    if os.environ.get('YX_FORCE_PROVIDED_DATABASE_URL', '1') != '0':
        DATABASE_URL = DEFAULT_RENDER_DATABASE_URL
    else:
        DATABASE_URL = (
            os.environ.get('DATABASE_URL')
            or os.environ.get('WAREHOUSE_DATABASE_URL')
            or DEFAULT_RENDER_DATABASE_URL
            or ''
        ).strip()
USE_POSTGRES = bool(DATABASE_URL and DATABASE_URL.startswith(('postgres://', 'postgresql://')) and psycopg2)
PG_POOL = None
PG_POOL_MIN = int(os.environ.get('YX_PG_POOL_MIN', '1'))
PG_POOL_MAX = int(os.environ.get('YX_PG_POOL_MAX', '4'))
PG_STATEMENT_TIMEOUT_MS = int(os.environ.get('YX_PG_STATEMENT_TIMEOUT_MS', '8000'))
# 這次要「確實接上 PostgreSQL」，預設不再靜默降級 SQLite。
# 只有本機測試或臨時救援時，才手動設定 ALLOW_SQLITE_FALLBACK=1 或 YX_USE_SQLITE=1。
ALLOW_SQLITE_FALLBACK = os.environ.get('ALLOW_SQLITE_FALLBACK', '0') == '1'
DB_PATH = os.environ.get('SQLITE_PATH', str(BASE_DIR / 'warehouse.db'))
ADMIN_NAME = '陳韋廷'


def now_iso() -> str:
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def new_uid(prefix: str = 'CUST') -> str:
    return f'{prefix}-{uuid.uuid4().hex[:10].upper()}'


def _postgres_url():
    if not DATABASE_URL:
        return DATABASE_URL
    parsed = urlparse(DATABASE_URL)
    query = dict(parse_qsl(parsed.query))
    if 'sslmode' not in query and os.environ.get('PGSSLMODE', 'require') == 'require':
        query['sslmode'] = 'require'
    # 避免 Render 上 DATABASE_URL 壞掉或資料庫睡眠時，gunicorn 啟動卡死。
    query.setdefault('connect_timeout', os.environ.get('PGCONNECT_TIMEOUT', '5'))
    return urlunparse(parsed._replace(query=urlencode(query)))



class _PooledPgConn:
    def __init__(self, pool, conn):
        self._pool = pool
        self._conn = conn
    def cursor(self, *args, **kwargs):
        cur = self._conn.cursor(*args, **kwargs)
        try:
            if PG_STATEMENT_TIMEOUT_MS > 0:
                cur.execute('SET statement_timeout = %s', (PG_STATEMENT_TIMEOUT_MS,))
        except Exception:
            pass
        return cur
    def commit(self):
        return self._conn.commit()
    def rollback(self):
        return self._conn.rollback()
    def close(self):
        try:
            self._pool.putconn(self._conn)
        except Exception:
            try:
                self._conn.close()
            except Exception:
                pass


def _get_pg_conn_from_pool():
    global PG_POOL
    if os.environ.get('YX_DISABLE_PG_POOL', '0') == '1':
        conn = psycopg2.connect(_postgres_url(), cursor_factory=psycopg2.extras.RealDictCursor)
        conn.autocommit = True
        return conn
    if PG_POOL is None:
        PG_POOL = psycopg2.pool.SimpleConnectionPool(
            PG_POOL_MIN, PG_POOL_MAX, _postgres_url(),
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
    conn = PG_POOL.getconn()
    conn.autocommit = True
    return _PooledPgConn(PG_POOL, conn)

def get_conn():
    global USE_POSTGRES
    if DATABASE_URL and DATABASE_URL.startswith(('postgres://', 'postgresql://')):
        if not psycopg2:
            if not ALLOW_SQLITE_FALLBACK:
                raise RuntimeError('psycopg2-binary 未安裝，無法連接 PostgreSQL')
        elif USE_POSTGRES:
            try:
                return _get_pg_conn_from_pool()
            except Exception as exc:
                if not ALLOW_SQLITE_FALLBACK:
                    raise RuntimeError(f'PostgreSQL 連線失敗，已阻止降級 SQLite：{exc}') from exc
                USE_POSTGRES = False
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


def masked_database_url() -> str:
    if not DATABASE_URL:
        return 'sqlite'
    try:
        parsed = urlparse(DATABASE_URL)
        host = parsed.hostname or ''
        dbname = (parsed.path or '').lstrip('/')
        user = parsed.username or ''
        scheme = parsed.scheme or 'postgresql'
        return f'{scheme}://{user}:***@{host}/{dbname}'
    except Exception:
        return 'postgresql://***'


def _sql(q: str) -> str:
    if not USE_POSTGRES:
        return q
    q = q.replace('?', '%s')
    q = q.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY')
    q = q.replace('INSERT OR IGNORE INTO warehouse_cells', 'INSERT INTO warehouse_cells')
    return q


def _params(params):
    if params is None:
        return ()
    if isinstance(params, list):
        return tuple(params)
    return params


@contextmanager
def db_cursor(commit=False):
    conn = get_conn()
    try:
        cur = conn.cursor()
        yield cur
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_to_dict(row):
    if row is None:
        return None
    if isinstance(row, dict):
        return dict(row)
    return {k: row[k] for k in row.keys()}


def rows_to_dicts(rows):
    return [row_to_dict(row) for row in rows]


def fetch_all(sql, params=()):
    with db_cursor() as cur:
        cur.execute(_sql(sql), _params(params))
        return rows_to_dicts(cur.fetchall())


def fetch_one(sql, params=()):
    with db_cursor() as cur:
        cur.execute(_sql(sql), _params(params))
        return row_to_dict(cur.fetchone())


def execute(sql, params=()):
    """Execute one write statement and return the inserted id when available.

    Render/Production safety:
    - Accept legacy SQLite `INSERT OR REPLACE` calls and translate them for PostgreSQL.
    - Do not let id detection errors break the real write.
    """
    raw_sql = sql.strip()
    upper = raw_sql.upper()
    if USE_POSTGRES and upper.startswith('INSERT OR REPLACE INTO CORRECTIONS'):
        sql = """INSERT INTO corrections(wrong_text, correct_text, created_at)
                 VALUES(?,?,?)
                 ON CONFLICT (wrong_text)
                 DO UPDATE SET correct_text=EXCLUDED.correct_text, created_at=EXCLUDED.created_at"""
        raw_sql = sql.strip()
        upper = raw_sql.upper()
    elif USE_POSTGRES and upper.startswith('INSERT OR REPLACE INTO CUSTOMER_ALIASES'):
        sql = """INSERT INTO customer_aliases(customer_uid, alias, created_at)
                 VALUES(?,?,?)
                 ON CONFLICT (alias)
                 DO UPDATE SET customer_uid=EXCLUDED.customer_uid, created_at=EXCLUDED.created_at"""
        raw_sql = sql.strip()
        upper = raw_sql.upper()
    with db_cursor(commit=True) as cur:
        if USE_POSTGRES and upper.startswith('INSERT INTO WAREHOUSE_CELLS') and 'BAND' not in upper:
            try:
                p = tuple(_params(params))
                if len(p) >= 7:
                    sql, params = _warehouse_insert_sql_params(cur, p[0], p[1], p[2], p[3], p[4], p[5], p[6])
                    raw_sql = sql.strip()
                    upper = raw_sql.upper()
            except Exception:
                pass
        cur.execute(_sql(sql), _params(params))
        if USE_POSTGRES:
            try:
                if upper.startswith('INSERT INTO '):
                    import re
                    m = re.match(r'INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)', raw_sql, re.I)
                    table = m.group(1) if m else ''
                    if table:
                        cur.execute(f"SELECT currval(pg_get_serial_sequence('{table}', 'id')) AS id")
                        row = cur.fetchone()
                        return int((row or {}).get('id') or 0)
            except Exception:
                return 0
        return cur.lastrowid


def execute_many(sql, seq):
    with db_cursor(commit=True) as cur:
        cur.executemany(_sql(sql), [_params(x) for x in seq])


def json_dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def json_loads(value, default=None):
    if default is None:
        default = []
    try:
        return json.loads(value) if value else default
    except Exception:
        return default



def _qident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def _safe_pg_execute(cur, sql: str, params=()):
    """PostgreSQL migration helper: one failed DDL must not poison the whole request."""
    try:
        cur.execute(sql, params)
        return True
    except Exception:
        try:
            cur.connection.rollback()
        except Exception:
            pass
        return False


def _unlock_postgres_constraints(cur):
    """移除會阻擋舊資料讀寫的舊版 UNIQUE / NOT NULL / CHECK / FK 限制。

    保留 PRIMARY KEY，因為 id 主鍵是程式更新、刪除、出貨扣除必需的定位欄位。
    其他唯一限制、NOT NULL、舊倉庫唯一索引都取消，讓舊資料先能被讀出來。
    """
    if not USE_POSTGRES:
        return
    tables = [
        'users','customer_profiles','inventory','orders','master_orders','shipping_records',
        'warehouse_cells','today_changes','audit_trails','errors','corrections','customer_aliases',
        'warehouse_recent_slots','submit_requests','todo_items','app_settings','image_hashes','backups','undo_events'
    ]
    for table in tables:
        _safe_pg_execute(cur, """
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = %s::regclass AND contype <> 'p'
        """, (table,))
        try:
            constraints = cur.fetchall() or []
        except Exception:
            constraints = []
        for row in constraints:
            cname = row.get('conname') if isinstance(row, dict) else row[0]
            if cname:
                _safe_pg_execute(cur, f'ALTER TABLE {_qident(table)} DROP CONSTRAINT IF EXISTS {_qident(cname)}')

        _safe_pg_execute(cur, """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname='public' AND tablename=%s
              AND indexdef ILIKE 'CREATE UNIQUE INDEX%%'
              AND indexname NOT LIKE '%%pkey'
        """, (table,))
        try:
            indexes = cur.fetchall() or []
        except Exception:
            indexes = []
        for row in indexes:
            iname = row.get('indexname') if isinstance(row, dict) else row[0]
            if iname:
                _safe_pg_execute(cur, f'DROP INDEX IF EXISTS {_qident(iname)}')

        _safe_pg_execute(cur, """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name=%s
              AND is_nullable='NO' AND column_name <> 'id'
        """, (table,))
        try:
            cols = cur.fetchall() or []
        except Exception:
            cols = []
        for row in cols:
            col = row.get('column_name') if isinstance(row, dict) else row[0]
            if col:
                _safe_pg_execute(cur, f'ALTER TABLE {_qident(table)} ALTER COLUMN {_qident(col)} DROP NOT NULL')

    for name in (
        'ux_warehouse_cells_zone_band_row_name_slot',
        'warehouse_cells_zone_column_index_slot_number_key',
        'warehouse_cells_zone_column_index_slot_key',
        'customer_profiles_name_key', 'customer_profiles_uid_key',
        'corrections_wrong_text_key', 'customer_aliases_alias_key',
        'submit_requests_request_key', 'image_hashes_image_hash_key',
    ):
        _safe_pg_execute(cur, f'DROP INDEX IF EXISTS {_qident(name)}')
def _init_db_inner():
    schema = [
        '''CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            is_blocked INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS customer_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,
            name TEXT UNIQUE NOT NULL,
            phone TEXT DEFAULT '',
            address TEXT DEFAULT '',
            special_notes TEXT DEFAULT '',
            common_materials TEXT DEFAULT '',
            common_sizes TEXT DEFAULT '',
            region TEXT DEFAULT '北區',
            trade_type TEXT DEFAULT '',
            is_archived INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_uid TEXT DEFAULT '',
            customer_name TEXT DEFAULT '',
            product_text TEXT NOT NULL,
            material TEXT DEFAULT '',
            qty INTEGER DEFAULT 1,
            zone TEXT DEFAULT '',
            location TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            note TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_uid TEXT DEFAULT '',
            customer_name TEXT DEFAULT '',
            product_text TEXT NOT NULL,
            material TEXT DEFAULT '',
            qty INTEGER DEFAULT 1,
            zone TEXT DEFAULT '',
            location TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            note TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS master_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_uid TEXT DEFAULT '',
            customer_name TEXT DEFAULT '',
            product_text TEXT NOT NULL,
            material TEXT DEFAULT '',
            qty INTEGER DEFAULT 1,
            zone TEXT DEFAULT '',
            location TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            note TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS shipping_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_uid TEXT DEFAULT '',
            customer_name TEXT DEFAULT '',
            product_text TEXT NOT NULL,
            material TEXT DEFAULT '',
            qty INTEGER DEFAULT 1,
            source TEXT DEFAULT '',
            source_id INTEGER DEFAULT 0,
            before_qty INTEGER DEFAULT 0,
            after_qty INTEGER DEFAULT 0,
            borrowed_from TEXT DEFAULT '',
            volume_formula TEXT DEFAULT '',
            volume_total REAL DEFAULT 0,
            weight_input REAL DEFAULT 0,
            total_weight REAL DEFAULT 0,
            operator TEXT DEFAULT '',
            shipped_at TEXT NOT NULL,
            note TEXT DEFAULT ''
        )''',
        '''CREATE TABLE IF NOT EXISTS warehouse_cells (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zone TEXT NOT NULL,
            column_index INTEGER NOT NULL,
            slot_type TEXT NOT NULL DEFAULT 'direct',
            slot_number INTEGER NOT NULL,
            items_json TEXT DEFAULT '[]',
            note TEXT DEFAULT '',
            updated_at TEXT NOT NULL,
            UNIQUE(zone, column_index, slot_number)
        )''',
        '''CREATE TABLE IF NOT EXISTS today_changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            action TEXT NOT NULL,
            customer_name TEXT DEFAULT '',
            product_text TEXT DEFAULT '',
            qty INTEGER DEFAULT 0,
            location TEXT DEFAULT '',
            source TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            detail_json TEXT DEFAULT '{}',
            is_read INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS audit_trails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT DEFAULT '',
            action_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_key TEXT DEFAULT '',
            before_json TEXT DEFAULT '{}',
            after_json TEXT DEFAULT '{}',
            created_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS errors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT DEFAULT '',
            message TEXT DEFAULT '',
            created_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS corrections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wrong_text TEXT UNIQUE NOT NULL,
            correct_text TEXT NOT NULL,
            created_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS customer_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_uid TEXT DEFAULT '',
            alias TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS warehouse_recent_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zone TEXT,
            column_index INTEGER,
            slot_number INTEGER,
            used_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS submit_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_key TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS todo_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            due_date TEXT DEFAULT '',
            image_path TEXT DEFAULT '',
            is_done INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        )''',
        '''CREATE TABLE IF NOT EXISTS image_hashes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_hash TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS backups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            created_at TEXT NOT NULL
        )''',
        '''CREATE TABLE IF NOT EXISTS undo_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT DEFAULT '',
            action_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_key TEXT DEFAULT '',
            undo_json TEXT DEFAULT '{}',
            is_used INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )''',
    ]
    with db_cursor(commit=True) as cur:
        for stmt in schema:
            if USE_POSTGRES:
                _safe_pg_execute(cur, _sql(stmt))
            else:
                cur.execute(_sql(stmt))
        _unlock_postgres_constraints(cur)
        _ensure_migrations_with_cursor(cur)
        # Seed empty warehouse cells: A/B, 6 columns, 10 slots each.
        # Compatible with old PostgreSQL schemas that still have band/row_name/slot.
        _repair_legacy_warehouse_columns(cur)
        for zone in ('A', 'B'):
            for col in range(1, 7):
                for slot in range(1, 11):
                    if not _warehouse_exists(cur, zone, col, slot):
                        sql_ins, params_ins = _warehouse_insert_sql_params(cur, zone, col, 'direct', slot, '[]', '', now_iso())
                        cur.execute(_sql(sql_ins), params_ins)
        _repair_product_qty_with_cursor(cur)



def _cursor_fetchone_dict(cur):
    row = cur.fetchone()
    if row is None:
        return None
    if isinstance(row, dict):
        return dict(row)
    try:
        return {k: row[k] for k in row.keys()}
    except Exception:
        return row


def _column_exists(cur, table: str, column: str) -> bool:
    if USE_POSTGRES:
        cur.execute("""SELECT 1 FROM information_schema.columns
                       WHERE table_name=%s AND column_name=%s LIMIT 1""", (table, column))
        return cur.fetchone() is not None
    cur.execute(f'PRAGMA table_info({table})')
    rows = cur.fetchall()
    for row in rows:
        try:
            name = row['name']
        except Exception:
            name = row[1]
        if name == column:
            return True
    return False


def _add_column_if_missing(cur, table: str, column: str, definition: str):
    if not _column_exists(cur, table, column):
        sql = f'ALTER TABLE {table} ADD COLUMN {column} {definition}'
        if USE_POSTGRES:
            _safe_pg_execute(cur, sql)
        else:
            cur.execute(sql)




def _warehouse_insert_sql_params(cur, zone, column_index, slot_type, slot_number, items_json, note, updated_at):
    cols = ['zone', 'column_index', 'slot_type', 'slot_number', 'items_json', 'note', 'updated_at']
    vals = [zone, column_index, slot_type or 'direct', slot_number, items_json or '[]', note or '', updated_at or now_iso()]
    if _column_exists(cur, 'warehouse_cells', 'band'):
        cols.append('band'); vals.append(column_index)
    if _column_exists(cur, 'warehouse_cells', 'row_name'):
        cols.append('row_name'); vals.append('direct')
    if _column_exists(cur, 'warehouse_cells', 'slot'):
        cols.append('slot'); vals.append(slot_number)
    placeholders = ','.join(['?'] * len(cols))
    return f"INSERT INTO warehouse_cells({','.join(cols)}) VALUES({placeholders})", tuple(vals)


def _warehouse_exists(cur, zone, column_index, slot_number):
    clauses = ['(zone=? AND column_index=? AND slot_number=?)']
    params = [zone, column_index, slot_number]
    if _column_exists(cur, 'warehouse_cells', 'band') and _column_exists(cur, 'warehouse_cells', 'row_name') and _column_exists(cur, 'warehouse_cells', 'slot'):
        clauses.append('(zone=? AND band=? AND row_name=? AND slot=?)')
        params.extend([zone, column_index, 'direct', slot_number])
    cur.execute(_sql('SELECT id FROM warehouse_cells WHERE ' + ' OR '.join(clauses) + ' LIMIT 1'), tuple(params))
    return cur.fetchone() is not None


def _repair_legacy_warehouse_columns(cur):
    # FIX v12: 舊版 PostgreSQL 有唯一限制 ux_warehouse_cells_zone_band_row_name_slot(zone, band, row_name, slot)。
    # 新版倉庫改用 zone + column_index + slot_number；先移除舊唯一限制，避免全部撞到 (A,0,'',0)。
    if USE_POSTGRES:
        try:
            cur.execute('ALTER TABLE warehouse_cells DROP CONSTRAINT IF EXISTS ux_warehouse_cells_zone_band_row_name_slot')
        except Exception:
            pass
        try:
            cur.execute('DROP INDEX IF EXISTS ux_warehouse_cells_zone_band_row_name_slot')
        except Exception:
            pass
    try:
        if _column_exists(cur, 'warehouse_cells', 'band'):
            cur.execute(_sql('UPDATE warehouse_cells SET band=column_index WHERE band IS NULL OR band=0'))
        if _column_exists(cur, 'warehouse_cells', 'row_name'):
            cur.execute(_sql("UPDATE warehouse_cells SET row_name=? WHERE row_name IS NULL OR row_name=''"), ('direct',))
        if _column_exists(cur, 'warehouse_cells', 'slot'):
            cur.execute(_sql('UPDATE warehouse_cells SET slot=slot_number WHERE slot IS NULL OR slot=0'))
    except Exception:
        pass


def _table_exists(cur, table: str) -> bool:
    if USE_POSTGRES:
        cur.execute("SELECT to_regclass(%s) AS name", (table,))
        row = cur.fetchone()
        if isinstance(row, dict):
            return bool(row.get('name'))
        return bool(row and row[0])
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cur.fetchone() is not None


def _row_get(row, key, default=None):
    if row is None:
        return default
    if isinstance(row, dict):
        return row.get(key, default)
    try:
        return row[key]
    except Exception:
        return default


def _to_int(value, default=0):
    try:
        if value is None or value == '':
            return default
        return int(float(value))
    except Exception:
        return default


def _select_existing(cur, table: str, candidates: list[str]) -> list[str]:
    return [c for c in candidates if _column_exists(cur, table, c)]


def _backfill_legacy_item_table(cur, table: str):
    """把舊版 product/customer/quantity 欄位搬到新版 product_text/customer_name/qty。"""
    if not _table_exists(cur, table):
        return
    from services.products import normalize_product_text, total_qty_from_text
    cols = _select_existing(cur, table, [
        'id', 'customer_uid', 'customer_name', 'customer', 'client', 'name',
        'product_text', 'product', 'item', 'item_name', 'material', 'qty', 'quantity',
        'zone', 'location', 'operator', 'note', 'created_at', 'updated_at'
    ])
    if 'id' not in cols:
        return
    cur.execute(_sql(f"SELECT {', '.join(cols)} FROM {table}"))
    rows = cur.fetchall()
    for row in rows:
        item_id = _row_get(row, 'id')
        current_text = (_row_get(row, 'product_text') or '').strip()
        legacy_text = (_row_get(row, 'product') or _row_get(row, 'item') or _row_get(row, 'item_name') or '')
        final_text = normalize_product_text(current_text or legacy_text or '')
        current_customer = (_row_get(row, 'customer_name') or '').strip()
        legacy_customer = (_row_get(row, 'customer') or _row_get(row, 'client') or _row_get(row, 'name') or '')
        final_customer = (current_customer or legacy_customer or '').strip()
        current_qty = _to_int(_row_get(row, 'qty'), 0)
        legacy_qty = _to_int(_row_get(row, 'quantity'), 0)
        final_qty = total_qty_from_text(final_text) or legacy_qty or current_qty or 1
        updates = []
        params = []
        if final_text and final_text != current_text:
            updates.append('product_text=?')
            params.append(final_text)
        if final_customer and final_customer != current_customer:
            updates.append('customer_name=?')
            params.append(final_customer)
        if final_qty and final_qty != current_qty:
            updates.append('qty=?')
            params.append(final_qty)
        if _column_exists(cur, table, 'updated_at'):
            updates.append('updated_at=?')
            params.append(now_iso())
        if updates:
            params.append(item_id)
            cur.execute(_sql(f"UPDATE {table} SET {', '.join(updates)} WHERE id=?"), tuple(params))


def _backfill_legacy_shipping(cur):
    if not _table_exists(cur, 'shipping_records'):
        return
    from services.products import normalize_product_text, total_qty_from_text
    cols = _select_existing(cur, 'shipping_records', [
        'id', 'customer_uid', 'customer_name', 'customer', 'client', 'name',
        'product_text', 'product', 'item', 'item_name', 'material', 'qty', 'quantity',
        'source', 'source_id', 'operator', 'shipped_at', 'created_at', 'note'
    ])
    if 'id' not in cols:
        return
    cur.execute(_sql(f"SELECT {', '.join(cols)} FROM shipping_records"))
    for row in cur.fetchall():
        rid = _row_get(row, 'id')
        current_text = (_row_get(row, 'product_text') or '').strip()
        legacy_text = _row_get(row, 'product') or _row_get(row, 'item') or _row_get(row, 'item_name') or ''
        final_text = normalize_product_text(current_text or legacy_text or '')
        current_customer = (_row_get(row, 'customer_name') or '').strip()
        legacy_customer = _row_get(row, 'customer') or _row_get(row, 'client') or _row_get(row, 'name') or ''
        final_customer = (current_customer or legacy_customer or '').strip()
        current_qty = _to_int(_row_get(row, 'qty'), 0)
        legacy_qty = _to_int(_row_get(row, 'quantity'), 0)
        final_qty = total_qty_from_text(final_text) or legacy_qty or current_qty or 1
        shipped_at = (_row_get(row, 'shipped_at') or _row_get(row, 'created_at') or now_iso())
        updates = []
        params = []
        if final_text and final_text != current_text:
            updates.append('product_text=?'); params.append(final_text)
        if final_customer and final_customer != current_customer:
            updates.append('customer_name=?'); params.append(final_customer)
        if final_qty and final_qty != current_qty:
            updates.append('qty=?'); params.append(final_qty)
        if not (_row_get(row, 'shipped_at') or '').strip():
            updates.append('shipped_at=?'); params.append(shipped_at)
        if updates:
            params.append(rid)
            cur.execute(_sql(f"UPDATE shipping_records SET {', '.join(updates)} WHERE id=?"), tuple(params))


def _copy_legacy_master_order_table(cur):
    """部分舊版用 master_order 單數表；新版用 master_orders。啟動時複製一次。"""
    if not _table_exists(cur, 'master_order') or not _table_exists(cur, 'master_orders'):
        return
    from services.products import normalize_product_text, total_qty_from_text
    cols = _select_existing(cur, 'master_order', [
        'id', 'customer_uid', 'customer_name', 'customer', 'client', 'name',
        'product_text', 'product', 'item', 'item_name', 'material', 'qty', 'quantity',
        'zone', 'location', 'operator', 'note', 'created_at', 'updated_at'
    ])
    if 'id' not in cols:
        return
    cur.execute(_sql(f"SELECT {', '.join(cols)} FROM master_order"))
    for row in cur.fetchall():
        product_text = normalize_product_text((_row_get(row, 'product_text') or _row_get(row, 'product') or _row_get(row, 'item') or _row_get(row, 'item_name') or '').strip())
        if not product_text:
            continue
        customer_name = (_row_get(row, 'customer_name') or _row_get(row, 'customer') or _row_get(row, 'client') or _row_get(row, 'name') or '').strip()
        material = (_row_get(row, 'material') or '').strip()
        cur.execute(_sql('SELECT id FROM master_orders WHERE product_text=? AND customer_name=? AND material=? LIMIT 1'), (product_text, customer_name, material))
        if cur.fetchone():
            continue
        qty = total_qty_from_text(product_text) or _to_int(_row_get(row, 'qty'), 0) or _to_int(_row_get(row, 'quantity'), 0) or 1
        t = _row_get(row, 'updated_at') or _row_get(row, 'created_at') or now_iso()
        cur.execute(_sql('''INSERT INTO master_orders(customer_uid,customer_name,product_text,material,qty,zone,location,operator,note,created_at,updated_at)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?)'''), (
            _row_get(row, 'customer_uid') or '', customer_name, product_text, material, qty,
            _row_get(row, 'zone') or '', _row_get(row, 'location') or '', _row_get(row, 'operator') or '', _row_get(row, 'note') or '',
            _row_get(row, 'created_at') or t, t
        ))




def _copy_legacy_customers_table(cur):
    """部分舊版用 customers / clients 表存客戶；新版統一 customer_profiles。"""
    if not _table_exists(cur, 'customer_profiles'):
        return
    legacy_table = 'customers' if _table_exists(cur, 'customers') else ('clients' if _table_exists(cur, 'clients') else '')
    if not legacy_table:
        return
    cols = _select_existing(cur, legacy_table, [
        'id','uid','customer_uid','name','customer_name','customer','client',
        'phone','tel','address','special_notes','note','common_materials','common_sizes',
        'region','area','trade_type','type','is_archived','created_at','updated_at'
    ])
    if not cols:
        return
    cur.execute(_sql(f"SELECT {', '.join(cols)} FROM {legacy_table}"))
    for row in cur.fetchall():
        name = (_row_get(row,'name') or _row_get(row,'customer_name') or _row_get(row,'customer') or _row_get(row,'client') or '').strip()
        if not name:
            continue
        uid = (_row_get(row,'uid') or _row_get(row,'customer_uid') or '').strip() or new_uid('CUST')
        region = (_row_get(row,'region') or _row_get(row,'area') or '北區').strip()
        if region not in ('北區','中區','南區'):
            region = '北區'
        cur.execute(_sql('SELECT uid FROM customer_profiles WHERE name=? OR uid=? LIMIT 1'), (name, uid))
        if cur.fetchone():
            continue
        t = _row_get(row,'updated_at') or _row_get(row,'created_at') or now_iso()
        cur.execute(_sql("""INSERT INTO customer_profiles(uid,name,phone,address,special_notes,common_materials,common_sizes,region,trade_type,is_archived,created_at,updated_at)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"""), (
            uid, name, _row_get(row,'phone') or _row_get(row,'tel') or '', _row_get(row,'address') or '',
            _row_get(row,'special_notes') or _row_get(row,'note') or '', _row_get(row,'common_materials') or '',
            _row_get(row,'common_sizes') or '', region, _row_get(row,'trade_type') or _row_get(row,'type') or '',
            _to_int(_row_get(row,'is_archived'),0), t, t
        ))

def _ensure_customer_profiles_from_items(cur):
    """從庫存/訂單/總單/出貨舊資料反建客戶資料與 customer_uid。"""
    if not _table_exists(cur, 'customer_profiles'):
        return
    names = []
    for table in ('inventory', 'orders', 'master_orders', 'shipping_records'):
        if not _table_exists(cur, table) or not _column_exists(cur, table, 'customer_name'):
            continue
        cur.execute(_sql(f"SELECT DISTINCT customer_name FROM {table} WHERE customer_name IS NOT NULL AND customer_name<>''"))
        for row in cur.fetchall():
            name = (_row_get(row, 'customer_name') or '').strip()
            if name and name not in names and name != '未指定客戶':
                names.append(name)
    for name in names:
        cur.execute(_sql('SELECT uid FROM customer_profiles WHERE name=? LIMIT 1'), (name,))
        found = cur.fetchone()
        if isinstance(found, dict):
            uid = found.get('uid')
        elif found:
            uid = found[0]
        else:
            uid = new_uid('CUST')
            t = now_iso()
            cur.execute(_sql('''INSERT INTO customer_profiles(uid,name,phone,address,special_notes,common_materials,common_sizes,region,trade_type,is_archived,created_at,updated_at)
                                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'''), (uid, name, '', '', '', '', '', '北區', '', 0, t, t))
        for table in ('inventory', 'orders', 'master_orders', 'shipping_records'):
            if _table_exists(cur, table) and _column_exists(cur, table, 'customer_uid') and _column_exists(cur, table, 'customer_name'):
                cur.execute(_sql(f"UPDATE {table} SET customer_uid=? WHERE customer_name=? AND (customer_uid IS NULL OR customer_uid='')"), (uid, name))


def _backfill_legacy_data_with_cursor(cur):
    _copy_legacy_customers_table(cur)
    _copy_legacy_master_order_table(cur)
    for table in ('inventory', 'orders', 'master_orders'):
        _backfill_legacy_item_table(cur, table)
    _backfill_legacy_shipping(cur)
    _ensure_customer_profiles_from_items(cur)

def _ensure_migrations_with_cursor(cur):
    """補齊舊資料庫缺欄，避免 Render 上舊 PostgreSQL/SQLite 因 UndefinedColumn 直接 500。"""
    user_cols = {
        'username': "TEXT DEFAULT ''",
        'password_hash': "TEXT DEFAULT ''",
        'is_admin': 'INTEGER DEFAULT 0',
        'is_blocked': 'INTEGER DEFAULT 0',
        'created_at': "TEXT DEFAULT ''",
    }
    for col, definition in user_cols.items():
        _add_column_if_missing(cur, 'users', col, definition)

    common_item_cols = {
        'customer_uid': "TEXT DEFAULT ''",
        'customer_name': "TEXT DEFAULT ''",
        'product_text': "TEXT DEFAULT ''",
        'material': "TEXT DEFAULT ''",
        'qty': 'INTEGER DEFAULT 1',
        'zone': "TEXT DEFAULT ''",
        'location': "TEXT DEFAULT ''",
        'operator': "TEXT DEFAULT ''",
        'note': "TEXT DEFAULT ''",
        'created_at': "TEXT DEFAULT ''",
        'updated_at': "TEXT DEFAULT ''",
    }
    for table in ('inventory', 'orders', 'master_orders'):
        for col, definition in common_item_cols.items():
            _add_column_if_missing(cur, table, col, definition)
    customer_cols = {
        'uid': "TEXT DEFAULT ''", 'name': "TEXT DEFAULT ''", 'phone': "TEXT DEFAULT ''",
        'address': "TEXT DEFAULT ''", 'special_notes': "TEXT DEFAULT ''",
        'common_materials': "TEXT DEFAULT ''", 'common_sizes': "TEXT DEFAULT ''",
        'region': "TEXT DEFAULT '北區'", 'trade_type': "TEXT DEFAULT ''",
        'is_archived': 'INTEGER DEFAULT 0', 'created_at': "TEXT DEFAULT ''", 'updated_at': "TEXT DEFAULT ''",
    }
    for col, definition in customer_cols.items():
        _add_column_if_missing(cur, 'customer_profiles', col, definition)
    ship_cols = {
        'customer_uid': "TEXT DEFAULT ''", 'customer_name': "TEXT DEFAULT ''", 'product_text': "TEXT DEFAULT ''",
        'material': "TEXT DEFAULT ''", 'qty': 'INTEGER DEFAULT 1', 'source': "TEXT DEFAULT ''",
        'source_id': 'INTEGER DEFAULT 0', 'before_qty': 'INTEGER DEFAULT 0', 'after_qty': 'INTEGER DEFAULT 0',
        'borrowed_from': "TEXT DEFAULT ''", 'volume_formula': "TEXT DEFAULT ''", 'volume_total': 'REAL DEFAULT 0',
        'weight_input': 'REAL DEFAULT 0', 'total_weight': 'REAL DEFAULT 0', 'operator': "TEXT DEFAULT ''",
        'shipped_at': "TEXT DEFAULT ''", 'note': "TEXT DEFAULT ''",
    }
    for col, definition in ship_cols.items():
        _add_column_if_missing(cur, 'shipping_records', col, definition)
    warehouse_cols = {
        'zone': "TEXT DEFAULT 'A'", 'column_index': 'INTEGER DEFAULT 1',
        'slot_type': "TEXT DEFAULT 'direct'", 'slot_number': 'INTEGER DEFAULT 1',
        'items_json': "TEXT DEFAULT '[]'", 'note': "TEXT DEFAULT ''", 'updated_at': "TEXT DEFAULT ''",
    }
    for col, definition in warehouse_cols.items():
        _add_column_if_missing(cur, 'warehouse_cells', col, definition)
    try:
        if USE_POSTGRES:
            cur.execute("ALTER TABLE warehouse_cells ALTER COLUMN slot_type SET DEFAULT 'direct'")
        cur.execute(_sql("UPDATE warehouse_cells SET slot_type=? WHERE slot_type IS NULL OR slot_type=''"), ('direct',))
        _repair_legacy_warehouse_columns(cur)
    except Exception:
        pass
    today_cols = {
        'category': "TEXT DEFAULT ''", 'action': "TEXT DEFAULT ''", 'customer_name': "TEXT DEFAULT ''",
        'product_text': "TEXT DEFAULT ''", 'qty': 'INTEGER DEFAULT 0', 'location': "TEXT DEFAULT ''",
        'source': "TEXT DEFAULT ''", 'operator': "TEXT DEFAULT ''", 'detail_json': "TEXT DEFAULT '{}'",
        'is_read': 'INTEGER DEFAULT 0', 'created_at': "TEXT DEFAULT ''",
    }
    for col, definition in today_cols.items():
        _add_column_if_missing(cur, 'today_changes', col, definition)

    aux_tables = {
        'audit_trails': {
            'username': "TEXT DEFAULT ''", 'action_type': "TEXT DEFAULT ''", 'entity_type': "TEXT DEFAULT ''",
            'entity_key': "TEXT DEFAULT ''", 'before_json': "TEXT DEFAULT '{}'", 'after_json': "TEXT DEFAULT '{}'",
            'created_at': "TEXT DEFAULT ''",
        },
        'errors': {'source': "TEXT DEFAULT ''", 'message': "TEXT DEFAULT ''", 'created_at': "TEXT DEFAULT ''"},
        'corrections': {'wrong_text': "TEXT DEFAULT ''", 'correct_text': "TEXT DEFAULT ''", 'created_at': "TEXT DEFAULT ''"},
        'customer_aliases': {'customer_uid': "TEXT DEFAULT ''", 'alias': "TEXT DEFAULT ''", 'created_at': "TEXT DEFAULT ''"},
        'warehouse_recent_slots': {'zone': "TEXT DEFAULT 'A'", 'column_index': 'INTEGER DEFAULT 1', 'slot_number': 'INTEGER DEFAULT 1', 'used_at': "TEXT DEFAULT ''"},
        'submit_requests': {'request_key': "TEXT DEFAULT ''", 'created_at': "TEXT DEFAULT ''"},
        'todo_items': {'title': "TEXT DEFAULT ''", 'due_date': "TEXT DEFAULT ''", 'image_path': "TEXT DEFAULT ''", 'is_done': 'INTEGER DEFAULT 0', 'sort_order': 'INTEGER DEFAULT 0', 'created_at': "TEXT DEFAULT ''", 'updated_at': "TEXT DEFAULT ''"},
        'app_settings': {'value': "TEXT DEFAULT ''"},
        'image_hashes': {'image_hash': "TEXT DEFAULT ''", 'created_at': "TEXT DEFAULT ''"},
        'backups': {'filename': "TEXT DEFAULT ''", 'created_at': "TEXT DEFAULT ''"},
        'undo_events': {'username': "TEXT DEFAULT ''", 'action_type': "TEXT DEFAULT ''", 'entity_type': "TEXT DEFAULT ''", 'entity_key': "TEXT DEFAULT ''", 'undo_json': "TEXT DEFAULT '{}'", 'is_used': 'INTEGER DEFAULT 0', 'created_at': "TEXT DEFAULT ''"},
    }
    for table, cols in aux_tables.items():
        for col, definition in cols.items():
            try:
                _add_column_if_missing(cur, table, col, definition)
            except Exception:
                pass
    # v8：預設不在啟動/首個 API 做大量舊資料回填，避免 Render 502 與功能頁開啟緩慢。
    # 舊欄位會在 list_items 讀取時用記憶體 coalesce 顯示；需要永久回填時再設 YX_RUN_HEAVY_MIGRATION=1。
    if os.environ.get('YX_RUN_HEAVY_MIGRATION', '0') == '1':
        try:
            _backfill_legacy_data_with_cursor(cur)
        except Exception:
            pass

    # 低風險索引：加速常用查詢。舊表有重複資料也不會失敗，因為不是 unique index。
    for stmt in (
        'CREATE INDEX IF NOT EXISTS idx_inventory_customer ON inventory(customer_uid, customer_name)',
        'CREATE INDEX IF NOT EXISTS idx_inventory_updated ON inventory(updated_at)',
        'CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_text)',
        'CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_uid, customer_name)',
        'CREATE INDEX IF NOT EXISTS idx_orders_updated ON orders(updated_at)',
        'CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_text)',
        'CREATE INDEX IF NOT EXISTS idx_master_customer ON master_orders(customer_uid, customer_name)',
        'CREATE INDEX IF NOT EXISTS idx_master_updated ON master_orders(updated_at)',
        'CREATE INDEX IF NOT EXISTS idx_master_product ON master_orders(product_text)',
        'CREATE INDEX IF NOT EXISTS idx_warehouse_lookup ON warehouse_cells(zone, column_index, slot_number)',
        'CREATE INDEX IF NOT EXISTS idx_today_unread ON today_changes(is_read, created_at)',
    ):
        try:
            cur.execute(_sql(stmt))
        except Exception:
            pass


def _repair_product_qty_with_cursor(cur):
    """啟動時自動依鎖死規則修正舊資料件數與倉庫格舊 JSON。"""
    if os.environ.get('YX_RUN_HEAVY_MIGRATION', '0') != '1':
        return
    try:
        from services.products import normalize_product_text, total_qty_from_text, LOCKED_QTY_RULES
        for table in ('inventory', 'orders', 'master_orders'):
            cur.execute(_sql(f'SELECT id, product_text, qty FROM {table}'))
            rows = cur.fetchall()
            for row in rows:
                item_id = row['id']
                product_text = row['product_text'] or ''
                normalized = normalize_product_text(product_text)
                expected = total_qty_from_text(normalized) or 1
                current = int(row['qty'] or 0)
                if normalized != product_text or expected != current:
                    cur.execute(_sql(f'UPDATE {table} SET product_text=?, qty=?, updated_at=? WHERE id=?'),
                                (normalized, expected, now_iso(), item_id))
        # 倉庫格 items_json 也可能保留舊 10/15 件數；直接按商品文字重算。
        cur.execute(_sql('SELECT id, items_json FROM warehouse_cells'))
        cells = cur.fetchall()
        for cell in cells:
            changed = False
            items = json_loads(cell['items_json'], [])
            for item in items:
                normalized = normalize_product_text(item.get('product_text') or '')
                expected = total_qty_from_text(normalized) or int(item.get('qty') or 0) or 1
                current_qty = int(item.get('qty') or 0)
                if normalized and normalized != item.get('product_text'):
                    item['product_text'] = normalized
                    changed = True
                # 商品總件數鎖死，但倉庫格可能只放部分件數；保留 1~expected 的有效部分數量。
                # 只修正舊版常見錯誤 10 件、空值、或超過總件數的異常資料。
                if normalized in LOCKED_QTY_RULES and not item.get('placement_uid') and current_qty in (10,):
                    item['qty'] = expected
                    changed = True
                elif expected and (current_qty <= 0 or current_qty > expected):
                    item['qty'] = expected
                    changed = True
            if changed:
                cur.execute(_sql('UPDATE warehouse_cells SET items_json=?, updated_at=? WHERE id=?'),
                            (json_dumps(items), now_iso(), cell['id']))
    except Exception:
        # 件數自動修復不能影響主系統啟動。
        pass


def init_db():
    """安全初始化資料庫；PostgreSQL 壞掉時可自動降級 SQLite，避免 Render 啟動直接 Exit 1。"""
    global USE_POSTGRES
    try:
        _init_db_inner()
    except Exception:
        if USE_POSTGRES and ALLOW_SQLITE_FALLBACK:
            USE_POSTGRES = False
            _init_db_inner()
        else:
            raise
