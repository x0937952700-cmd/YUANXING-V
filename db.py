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
except Exception:
    psycopg2 = None

BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
USE_POSTGRES = bool(DATABASE_URL and DATABASE_URL.startswith(('postgres://', 'postgresql://')) and psycopg2)
# Render 有時 DATABASE_URL 設錯、資料庫暫停、或 schema 初始化失敗會讓整個服務開不起來。
# 預設允許先降級 SQLite，確保網頁一定能打開；正式要強制 PostgreSQL 時可設 ALLOW_SQLITE_FALLBACK=0。
ALLOW_SQLITE_FALLBACK = os.environ.get('ALLOW_SQLITE_FALLBACK', '1') != '0'
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


def get_conn():
    global USE_POSTGRES
    if USE_POSTGRES:
        try:
            return psycopg2.connect(_postgres_url(), cursor_factory=psycopg2.extras.RealDictCursor)
        except Exception:
            if not ALLOW_SQLITE_FALLBACK:
                raise
            # 讓 Render 即使 PostgreSQL 暫時不可用也能先啟動頁面。
            USE_POSTGRES = False
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


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
            cur.execute(_sql(stmt))
        _ensure_migrations_with_cursor(cur)
        # Seed empty warehouse cells: A/B, 6 columns, 10 slots each.
        # 不使用 PostgreSQL ON CONFLICT，避免舊資料表沒有 unique index 時啟動失敗。
        for zone in ('A', 'B'):
            for col in range(1, 7):
                for slot in range(1, 11):
                    cur.execute(_sql('SELECT id FROM warehouse_cells WHERE zone=? AND column_index=? AND slot_number=?'), (zone, col, slot))
                    exists = cur.fetchone()
                    if not exists:
                        cur.execute(_sql('''INSERT INTO warehouse_cells(zone,column_index,slot_number,items_json,note,updated_at)
                                            VALUES(?,?,?,?,?,?)'''), (zone, col, slot, '[]', '', now_iso()))
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
        cur.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')


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
        'zone': "TEXT DEFAULT 'A'", 'column_index': 'INTEGER DEFAULT 1', 'slot_number': 'INTEGER DEFAULT 1',
        'items_json': "TEXT DEFAULT '[]'", 'note': "TEXT DEFAULT ''", 'updated_at': "TEXT DEFAULT ''",
    }
    for col, definition in warehouse_cols.items():
        _add_column_if_missing(cur, 'warehouse_cells', col, definition)
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
    # 低風險索引：加速常用查詢。舊表有重複資料也不會失敗，因為不是 unique index。
    for stmt in (
        'CREATE INDEX IF NOT EXISTS idx_inventory_customer ON inventory(customer_uid, customer_name)',
        'CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_uid, customer_name)',
        'CREATE INDEX IF NOT EXISTS idx_master_customer ON master_orders(customer_uid, customer_name)',
        'CREATE INDEX IF NOT EXISTS idx_warehouse_lookup ON warehouse_cells(zone, column_index, slot_number)',
        'CREATE INDEX IF NOT EXISTS idx_today_unread ON today_changes(is_read, created_at)',
    ):
        try:
            cur.execute(_sql(stmt))
        except Exception:
            pass


def _repair_product_qty_with_cursor(cur):
    """啟動時自動依鎖死規則修正舊資料件數與倉庫格舊 JSON。"""
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
