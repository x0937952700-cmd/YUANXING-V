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
    return urlunparse(parsed._replace(query=urlencode(query)))


def get_conn():
    if USE_POSTGRES:
        return psycopg2.connect(_postgres_url(), cursor_factory=psycopg2.extras.RealDictCursor)
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
    if USE_POSTGRES and sql.strip().upper().startswith('INSERT OR REPLACE INTO CORRECTIONS'):
        sql = """INSERT INTO corrections(wrong_text, correct_text, created_at)
                 VALUES(?,?,?)
                 ON CONFLICT (wrong_text)
                 DO UPDATE SET correct_text=EXCLUDED.correct_text, created_at=EXCLUDED.created_at"""
    with db_cursor(commit=True) as cur:
        cur.execute(_sql(sql), _params(params))
        if USE_POSTGRES:
            try:
                if sql.strip().upper().startswith('INSERT INTO '):
                    table = sql.strip().split()[2].split('(')[0]
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


def init_db():
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
        # Seed empty warehouse cells: A/B, 6 columns, 10 slots each. Dynamic APIs can add more later.
        for zone in ('A', 'B'):
            for col in range(1, 7):
                for slot in range(1, 11):
                    if USE_POSTGRES:
                        cur.execute('''INSERT INTO warehouse_cells(zone,column_index,slot_number,items_json,note,updated_at)
                                       VALUES(%s,%s,%s,%s,%s,%s)
                                       ON CONFLICT(zone,column_index,slot_number) DO NOTHING''', (zone, col, slot, '[]', '', now_iso()))
                    else:
                        cur.execute('''INSERT OR IGNORE INTO warehouse_cells(zone,column_index,slot_number,items_json,note,updated_at)
                                       VALUES(?,?,?,?,?,?)''', (zone, col, slot, '[]', '', now_iso()))
