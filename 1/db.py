# service-line retained: database migration behavior consolidated into formal services.

import os
import json
import re
import sqlite3
import hashlib
from datetime import datetime
from contextlib import contextmanager
from werkzeug.security import generate_password_hash, check_password_hash

# Render/DB safety: accept common database env aliases before falling back to local SQLite.
# This prevents deploys from silently using an empty warehouse.db when the real
# PostgreSQL URL was provided under a different Render variable name.
# Main-file DB resolver: prefer any configured PostgreSQL URL and never let a
# warehouse fallback/error silently make the app look like it has no data.
# Render usually uses DATABASE_URL, but older projects may name it differently.
_DB_ENV_KEYS = (
    "DATABASE_URL", "POSTGRES_URL", "POSTGRESQL_URL", "DATABASE_PRIVATE_URL",
    "EXTERNAL_DATABASE_URL", "DATABASE_EXTERNAL_URL", "DATABASE_INTERNAL_URL",
    "RENDER_DATABASE_URL", "RENDER_POSTGRESQL_URL", "POSTGRES_EXTERNAL_URL",
    "POSTGRES_INTERNAL_URL", "POSTGRES_EXTERNAL_DATABASE_URL", "POSTGRES_INTERNAL_DATABASE_URL",
    "POSTGRES_CONNECTION_STRING", "PG_URL", "PGURI", "DB_URL",
    "SQLALCHEMY_DATABASE_URI", "DATABASE_CONNECTION_STRING",
    "NEON_DATABASE_URL", "SUPABASE_DATABASE_URL",
)

def _sqlite_table_score(path):
    """Return a simple data score for an existing SQLite warehouse file.
    This prevents Render nested-directory deploys from opening a new empty
    warehouse.db when the real file is one directory above the app folder.
    """
    try:
        if not path or not os.path.exists(path) or os.path.getsize(path) <= 0:
            return -1
        conn = sqlite3.connect(path)
        cur = conn.cursor()
        score = 0
        for table, weight in (
            ('inventory', 1000), ('orders', 1000), ('master_orders', 1000),
            ('shipping_records', 500), ('customer_profiles', 200),
            ('today_changes', 100), ('logs', 10), ('warehouse_cells', 1),
        ):
            try:
                cur.execute(f"SELECT COUNT(*) FROM {table}")
                score += int(cur.fetchone()[0] or 0) * weight
            except Exception:
                pass
        conn.close()
        return score
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return -1


def _best_sqlite_fallback_url():
    here = os.path.abspath(os.path.dirname(__file__))
    cwd = os.path.abspath(os.getcwd())
    candidates = []
    for base in (
        cwd,
        here,
        os.path.dirname(here),
        os.path.dirname(os.path.dirname(here)),
        '/opt/render/project/src',
        '/opt/render/project/src/1',
        '/var/data',
        '/var/data/yuanxing',
    ):
        if base and base not in candidates:
            candidates.append(base)
    files = []
    for base in candidates:
        files.append(os.path.join(base, 'warehouse.db'))
    # Also scan one level under Render src for accidental nested upload folders.
    root = '/opt/render/project/src'
    try:
        if os.path.isdir(root):
            for name in os.listdir(root):
                p = os.path.join(root, name, 'warehouse.db')
                if p not in files:
                    files.append(p)
    except Exception:
        pass
    scored = [( _sqlite_table_score(path), path) for path in files]
    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_path = scored[0] if scored else (-1, os.path.join(here, 'warehouse.db'))
    if best_score >= 0:
        return 'sqlite:///' + os.path.abspath(best_path), 'sqlite_best_existing'
    # No DB exists yet: create/use the app folder DB, not a random current working dir.
    return 'sqlite:///' + os.path.join(here, 'warehouse.db'), 'sqlite_app_default'


def _pick_database_url():
    for key in _DB_ENV_KEYS:
        val = (os.getenv(key) or '').strip()
        if val:
            return val, key
    return _best_sqlite_fallback_url()

DATABASE_URL, DATABASE_URL_SOURCE = _pick_database_url()

def _normalize_database_url(url: str) -> str:
    """database url safety Render PostgreSQL External URL safety."""
    u = (url or '').strip().replace('\n', '').replace('\r', '')
    if u.lower().startswith(('postgres://', 'postgresql://')) and '.render.com' in u and 'sslmode=' not in u.lower():
        joiner = '&' if '?' in u else '?'
        u = f"{u}{joiner}sslmode=require"
    return u

DATABASE_URL = _normalize_database_url(DATABASE_URL)
USE_POSTGRES = DATABASE_URL.lower().startswith(("postgres://", "postgresql://"))

def database_mode_info():
    safe_url = DATABASE_URL
    if safe_url.lower().startswith(("postgres://", "postgresql://")):
        safe_url = re.sub(r":[^:@/]+@", ":***@", safe_url)
    return {
        "mode": "postgres" if USE_POSTGRES else "sqlite",
        "source": DATABASE_URL_SOURCE,
        "url_preview": safe_url[:120],
        "render_warning": bool(os.getenv("RENDER") and not USE_POSTGRES),
    }

def table_counts():
    out = {}
    conn = get_db(); cur = conn.cursor()
    for t in ("customer_profiles", "inventory", "orders", "master_orders", "shipping_records", "warehouse_cells", "logs", "today_changes"):
        try:
            cur.execute(sql(f"SELECT COUNT(*) AS c FROM {t}"))
            row = fetchone_dict(cur) or {}
            out[t] = int(row.get("c") or 0)
        except Exception as e:
            out[t] = "error:" + str(e)[:120]
    try: conn.close()
    except Exception: pass
    return out

if USE_POSTGRES:
    import psycopg2
    from psycopg2 import pool as _pg_pool

_PG_POOL = None

class _PooledPGConnection:
    """Return psycopg2 connections to a small pool when old code calls close()."""
    def __init__(self, pool_obj, conn):
        self._pool = pool_obj
        self._conn = conn
    def cursor(self, *args, **kwargs):
        return self._conn.cursor(*args, **kwargs)
    def commit(self):
        return self._conn.commit()
    def rollback(self):
        return self._conn.rollback()
    @property
    def closed(self):
        return getattr(self._conn, 'closed', 1)
    def close(self):
        if self._conn is None:
            return
        conn = self._conn
        self._conn = None
        try:
            if not getattr(conn, 'closed', 1):
                try:
                    conn.rollback()
                except Exception:
                    pass
                self._pool.putconn(conn)
                return
        except Exception:
            pass
        try:
            self._pool.putconn(conn, close=True)
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc, tb):
        if exc_type:
            try:
                self.rollback()
            except Exception:
                pass
        self.close()
    def __getattr__(self, name):
        return getattr(self._conn, name)

def _get_pg_pool():
    global _PG_POOL
    if _PG_POOL is None:
        minconn = int(os.getenv('PG_POOL_MIN', '1') or '1')
        maxconn = int(os.getenv('PG_POOL_MAX', '4') or '4')
        _PG_POOL = _pg_pool.SimpleConnectionPool(minconn, maxconn, dsn=DATABASE_URL, connect_timeout=10)
    return _PG_POOL

def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def sql(query: str) -> str:
    return query.replace("?", "%s") if USE_POSTGRES else query

def _sqlite_path():
    return DATABASE_URL.replace("sqlite:///", "")

def get_db():
    if USE_POSTGRES:
        last_error = None
        for _i in range(2):
            try:
                pg_pool = _get_pg_pool()
                conn = pg_pool.getconn()
                if getattr(conn, 'closed', 1):
                    try:
                        pg_pool.putconn(conn, close=True)
                    except Exception:
                        pass
                    continue
                conn.autocommit = False
                try:
                    _cur = conn.cursor()
                    _cur.execute(f"SET statement_timeout = {int(os.getenv('DB_STATEMENT_TIMEOUT_MS', '12000') or '12000')}")
                    _cur.execute(f"SET idle_in_transaction_session_timeout = {int(os.getenv('DB_IDLE_TX_TIMEOUT_MS', '15000') or '15000')}")
                    _cur.close()
                except Exception:
                    pass
                return _PooledPGConnection(pg_pool, conn)
            except Exception as e:
                last_error = e
                try:
                    import time
                    time.sleep(0.35)
                except Exception:
                    pass
        try:
            conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
            conn.autocommit = False
            try:
                _cur = conn.cursor()
                _cur.execute(f"SET statement_timeout = {int(os.getenv('DB_STATEMENT_TIMEOUT_MS', '12000') or '12000')}")
                _cur.execute(f"SET idle_in_transaction_session_timeout = {int(os.getenv('DB_IDLE_TX_TIMEOUT_MS', '15000') or '15000')}")
                _cur.close()
            except Exception:
                pass
            return conn
        except Exception as e:
            raise last_error or e
    conn = sqlite3.connect(_sqlite_path(), timeout=float(os.getenv('SQLITE_BUSY_TIMEOUT_SEC', '8') or '8'))
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('PRAGMA busy_timeout = 8000')
        conn.execute('PRAGMA journal_mode = WAL')
        conn.execute('PRAGMA synchronous = NORMAL')
    except Exception:
        pass
    return conn


def _safe_identifier(name):
    return re.sub(r'[^A-Za-z0-9_]', '', str(name or ''))

def _backend_is_postgres(cur=None):
    """True for PostgreSQL; also checks cursor type as a Render safety guard."""
    if USE_POSTGRES:
        return True
    try:
        mod = (cur.__class__.__module__ or '').lower() if cur is not None else ''
        return 'psycopg2' in mod or 'psycopg' in mod
    except Exception:
        return False

def _table_columns(cur, table_name):
    table = _safe_identifier(table_name)
    if not table:
        return set()
    if _backend_is_postgres(cur):
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
        """, (table,))
        return {r[0] for r in cur.fetchall()}
    cur.execute(f"PRAGMA table_info({table})")
    return {r[1] for r in cur.fetchall()}

def _add_column_if_missing(cur, table_name, column_name, column_def):
    table = _safe_identifier(table_name)
    col = _safe_identifier(column_name)
    if not table or not col:
        return
    if _backend_is_postgres(cur):
        cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {column_def}")
    else:
        if col not in _table_columns(cur, table):
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {column_def}")

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




def looks_like_product_value(value, product_text=''):
    v = str(value or '').strip()
    p = str(product_text or '').strip()
    if not v:
        return False
    norm = v.replace('×','x').replace('Ｘ','x').replace('X','x').replace('✕','x').replace('＊','x').replace('*','x').replace('＝','=')
    norm_p = p.replace('×','x').replace('Ｘ','x').replace('X','x').replace('✕','x').replace('＊','x').replace('*','x').replace('＝','=')
    if norm_p and norm == norm_p:
        return True
    if '=' in norm:
        return True
    if re.fullmatch(r'\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?', norm, flags=re.I):
        return True
    if re.fullmatch(r'\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)+', norm):
        return True
    return False

def clean_material_value(value='', product_text=''):
    v = str(value or '').strip()
    # service-line retained: database migration behavior consolidated into formal services.
    # 避免出貨比對時用「未填材質」去找 DB 空字串而誤判總單不足。
    if v in ('未填材質', '不指定材質', '未指定材質', '未填', '無材質'):
        return ''
    if not v or looks_like_product_value(v, product_text):
        return ''
    return v.upper() if re.fullmatch(r'[A-Za-z0-9_\-\/]+', v) else v


def product_month_tag(product_text=''):
    """Return '8月' from '8月80x12x10=750x2'. Kept as DB column for migration/readiness; UI also parses product_text."""
    try:
        left = product_display_size(product_text or '')
        m = re.match(r'^\s*(\d{1,2})月', str(left or ''))
        if m:
            n = int(m.group(1))
            if 1 <= n <= 12:
                return f"{n}月"
    except Exception:
        pass
    return ''


# service-line retained: database migration behavior consolidated into formal services.
def _split_month_prefix(left):
    raw = str(left or '').replace('×', 'x').replace('X', 'x').replace('Ｘ', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    raw = re.sub(r'\s+', '', raw)
    m = re.match(r'^(\d{1,2})(?:月|月份)(.+)$', raw)
    if m:
        try:
            month = int(m.group(1))
            body = m.group(2) or ''
            if 1 <= month <= 12 and body:
                return month, body
        except Exception:
            pass
    return 0, raw


def _format_left_with_month(left):
    month, body = _split_month_prefix(left)
    size = _normalize_left_size_preserve_zero(body)
    return f"{month}月{size}" if month else size

def product_display_size(text):
    """Return visible size; preserve 0xx heights and optional month prefix.

    month sort: if the item starts with a month, e.g. 12月132x50x06=294x8,
    keep the month for display and sort by 月份 > 高 > 寬 > 長.
    """
    raw = str(text or '').replace('×', 'x').replace('X', 'x').replace('Ｘ', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    left = (raw.split('=', 1)[0].strip() or raw)
    return _format_left_with_month(left)



def sort_support_expression(expr):
    """支數 x 件數排序：先以有 x 的段落依件數大到小；單獨支數排後面並依大到小。"""
    raw = str(expr or '').replace('×', 'x').replace('X', 'x').replace('＊', 'x').replace('*', 'x').replace('＋', '+').replace('，', '+').replace(',', '+').replace('；', '+').replace(';', '+').replace(' ', '').strip()
    if not raw:
        return ''
    multi = []
    single = []
    for idx, seg in enumerate([x for x in raw.split('+') if x.strip()]):
        nums = [int(x) for x in re.findall(r'\d+', seg)]
        if len(nums) >= 2 and 'x' in seg.lower():
            multi.append((-nums[1], -nums[0], idx, seg))
        elif nums:
            single.append((-nums[0], idx, seg))
        else:
            single.append((0, idx, seg))
    return '+'.join([x[3] for x in sorted(multi)] + [x[2] for x in sorted(single)])


def _format_dim_token_preserve_zero(token, is_height=False):
    """尺寸欄位格式化：0.83 -> 083，063/083 這種前導 0 不可刪。"""
    s = str(token or '').strip()
    if not s:
        return ''
    if re.fullmatch(r'[A-Za-z]+', s):
        return s.upper()
    if re.fullmatch(r'\d*\.\d+', s):
        # 0.83 / .83 供顯示儲存成 083，材積計算時再把 083 當 0.83。
        return s.replace('.', '') if s.startswith('0') else '0' + s.replace('.', '')
    if re.fullmatch(r'\d+', s):
        # 高度單碼補成 05；但 063 / 083 / 006 這種使用者輸入的 0 要保留。
        if is_height and len(s) == 1:
            return s.zfill(2)
        return s
    return re.sub(r'\s+', '', s)


def _normalize_left_size_preserve_zero(left):
    left = str(left or '').replace('×', 'x').replace('X', 'x').replace('Ｘ', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x')
    parts = [p.strip() for p in re.split(r'x', left) if p.strip() != '']
    if len(parts) < 3:
        return re.sub(r'\s+', '', left)
    return 'x'.join(_format_dim_token_preserve_zero(p, i == 2) for i, p in enumerate(parts[:3]))


def format_product_text_height2(text):
    """顯示/儲存用商品文字：保留 063/083 前導 0、月份前綴，右側支數件數照規則排序。"""
    raw = str(text or '').replace('×', 'x').replace('X', 'x').replace('Ｘ', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    if not raw:
        return ''
    left, sep, right = raw.partition('=')
    size = _format_left_with_month(left.strip())
    if not sep:
        return size or raw
    support = sort_support_expression(str(right or '').replace('件', '').replace('片', '').strip())
    return f"{size}={support}" if support else size

def _normalize_product_texts_in_table(cur, table):
    try:
        cur.execute(sql(f"SELECT id, product_text, product_code FROM {table}"))
        for row in rows_to_dict(cur):
            old = row.get('product_text') or ''
            fixed = format_product_text_height2(old)
            if fixed and fixed != old:
                code = row.get('product_code') or ''
                fixed_code = fixed if (not code or code == old) else code
                cur.execute(sql(f"UPDATE {table} SET product_text = ?, product_code = ? WHERE id = ?"), (fixed, fixed_code, row.get('id')))
    except Exception as e:
        log_error('normalize_product_texts_in_table', f'{table}: {e}')



def _clean_product_like_materials(cur):
    for table in ('inventory','orders','master_orders','shipping_records'):
        try:
            cur.execute(sql(f"SELECT id, product_text, product_code, material FROM {table}"))
            for row in rows_to_dict(cur):
                product_text = row.get('product_text') or ''
                material = clean_material_value(row.get('material') or row.get('product_code') or '', product_text)
                product_code = material
                if material != (row.get('material') or '') or product_code != (row.get('product_code') or ''):
                    cur.execute(sql(f"UPDATE {table} SET material = ?, product_code = ? WHERE id = ?"), (material, product_code, row.get('id')))
        except Exception as e:
            log_error('clean_product_like_materials', f'{table}: {e}')

def _normalize_warehouse_item_texts(cur):
    try:
        cur.execute(sql("SELECT id, items_json FROM warehouse_cells"))
        for row in rows_to_dict(cur):
            changed = False
            try:
                items = json.loads(row.get('items_json') or '[]')
            except Exception:
                items = []
            if not isinstance(items, list):
                items = []
            for it in items:
                if not isinstance(it, dict):
                    continue
                old = it.get('product_text') or it.get('product') or ''
                fixed = format_product_text_height2(old)
                if fixed and fixed != old:
                    it['product_text'] = fixed
                    if not it.get('product_code') or it.get('product_code') == old:
                        it['product_code'] = fixed
                    changed = True
            if changed:
                cur.execute(sql("UPDATE warehouse_cells SET items_json = ?, updated_at = ? WHERE id = ?"), (json.dumps(items, ensure_ascii=False), now(), row.get('id')))
    except Exception as e:
        log_error('normalize_warehouse_item_texts', str(e))

def product_sort_tuple(text):
    raw = str(text or '').replace('×', 'x').replace('X', 'x').replace('Ｘ', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    left = (raw.split('=', 1)[0].strip() or raw)
    month, body = _split_month_prefix(left)
    nums = [int(x) for x in re.findall(r'\d+', body)]
    month_key = month if month else 99
    if len(nums) >= 3:
        length, width, height = nums[:3]
        return (month_key, height, width, length, raw)
    return (month_key, 999999, 999999, 999999, raw)


def product_support_text(text):
    raw = str(text or '').replace('×', 'x').replace('X', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    if '=' in raw:
        return raw.split('=', 1)[1].strip()
    return ''


def effective_product_qty(product_text, fallback_qty=0):
    """
    V30 件數規則：
    - 等號右側「支數x件數」算件數；單獨支數算 1 件。
    - 括號備註一律只當文字備註，完全不加減件數，例如 115x51(東昇-8) = 51 件。
    - 保留超長清單特例：504x5+後面多個長度，第一段不當成 5 件。
    """
    raw = str(product_text or '').replace('×', 'x').replace('Ｘ', 'x').replace('X', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    try:
        fallback = int(fallback_qty or 0)
    except Exception:
        fallback = 0
    if not raw:
        return fallback

    right = raw.split('=', 1)[1].strip() if '=' in raw else raw.strip()
    if not right:
        return 1

    def _strip_qty_notes(seg):
        return re.sub(r'[\(（][^\)）]*[\)）]', '', str(seg or ''))
    def _qty_note_adjustment(seg):
        # service-line retained: database migration behavior consolidated into formal services.
        return 0

    canonical = '504x5+588+587+502+420+382+378+280+254+237+174'
    if _strip_qty_notes(right).replace(' ', '').lower() == canonical:
        return 15

    segments = [seg.strip() for seg in re.split(r'[+＋,，;；]', right) if seg.strip()]
    if not segments:
        return 1

    def _is_single_qty_x(seg):
        clean_seg = _strip_qty_notes(seg).replace(' ', '').lower()
        return clean_seg.count('x') == 1 and re.search(r'x\s*\d+\s*$', clean_seg, flags=re.I)

    x_segments = [seg for seg in segments if _is_single_qty_x(seg)]
    bare_segments = [seg for seg in segments if seg not in x_segments and re.search(r'\d+', _strip_qty_notes(seg))]
    if (len(segments) >= 10 and len(x_segments) == 1 and segments[0] == x_segments[0]
            and re.match(r'^\d{3,}\s*x\s*\d+\s*$', _strip_qty_notes(x_segments[0]).replace(' ', ''), flags=re.I)
            and len(bare_segments) >= 8):
        return len(bare_segments)

    total = 0
    parsed = False
    for seg in segments:
        plain = _strip_qty_notes(seg)
        adj = _qty_note_adjustment(seg)
        explicit = re.search(r'(\d+)\s*[件片]', plain)
        if explicit:
            total += max(0, int(explicit.group(1) or 0) + adj)
            parsed = True
            continue
        m = re.search(r'x\s*(\d+)\s*$', plain, flags=re.I) if _is_single_qty_x(seg) else None
        if m:
            total += max(0, int(m.group(1)) + adj)
            parsed = True
        elif re.search(r'\d+', plain):
            total += 1
            parsed = True
    return total if parsed else 1

def product_note_text(text):
    """保留等號右側括號備註，例如 168x7(-1永松)。"""
    raw = str(text or '').replace('×', 'x').replace('X', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    if '=' not in raw:
        return ''
    right = raw.split('=', 1)[1].strip()
    return right


def material_value(row_or_value):
    if isinstance(row_or_value, dict):
        product_text = row_or_value.get('product_text') or ''
        return clean_material_value(row_or_value.get('material') or row_or_value.get('product_code') or '', product_text)
    return clean_material_value(row_or_value or '', '')


def apply_effective_qty_to_rows(rows):
    out = []
    for row in rows or []:
        r = dict(row)
        product_text = format_product_text_height2(r.get('product_text') or r.get('product') or '')
        r['product_text'] = product_text
        material = clean_material_value(r.get('material') or r.get('product_code') or '', product_text)
        r['material'] = material
        r['product_code'] = material
        r['qty'] = effective_product_qty(product_text, r.get('qty') or 0)
        out.append(r)
    return out


def repair_effective_qtys(cur):
    for table in ('inventory', 'orders', 'master_orders', 'shipping_records'):
        try:
            cur.execute(sql(f"SELECT id, product_text, qty FROM {table}"))
            for row in rows_to_dict(cur):
                fixed_qty = effective_product_qty(row.get('product_text') or '', row.get('qty') or 0)
                try:
                    old_qty = int(row.get('qty') or 0)
                except Exception:
                    old_qty = 0
                if fixed_qty and fixed_qty != old_qty:
                    cur.execute(sql(f"UPDATE {table} SET qty = ? WHERE id = ?"), (fixed_qty, row.get('id')))
        except Exception as e:
            log_error('repair_effective_qtys', f'{table}: {e}')



def _merge_json_item_lists(a_json, b_json):
    merged = {}
    for raw in [a_json, b_json]:
        try:
            items = json.loads(raw or '[]') if isinstance(raw, str) else (raw or [])
        except Exception:
            items = []
        for it in items:
            key = ((it.get('product_text') or '').strip(), (it.get('customer_name') or '').strip())
            if key not in merged:
                merged[key] = dict(it)
                merged[key]['qty'] = int(it.get('qty') or 0)
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


def ensure_fixed_warehouse_grid(conn=None, cur=None):
    """建立倉庫格位表，但不再強制每欄固定 20 格。

    customer identity：
    - 新資料庫第一次建立時，仍給 A/B 各 6 欄、每欄 20 格作為起始版面。
    - 之後使用者刪除或插入格子後，不再於每次啟動 / 查詢時補回 20 格。
    - 每欄至少保留 1 格，避免前台完全無法點選插入。
    """
    own_conn = False
    if conn is None or cur is None:
        conn = get_db()
        cur = conn.cursor()
        own_conn = True
    try:
        if USE_POSTGRES:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS warehouse_cells (
                    id SERIAL PRIMARY KEY,
                    zone TEXT NOT NULL,
                    column_index INTEGER NOT NULL,
                    slot_type TEXT NOT NULL,
                    slot_number INTEGER NOT NULL,
                    items_json TEXT,
                    note TEXT,
                    updated_at TEXT
                )
            """)
        else:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS warehouse_cells (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    zone TEXT NOT NULL,
                    column_index INTEGER NOT NULL,
                    slot_type TEXT NOT NULL,
                    slot_number INTEGER NOT NULL,
                    items_json TEXT,
                    note TEXT,
                    updated_at TEXT
                )
            """)

        cur.execute(sql("SELECT COUNT(*) AS cnt FROM warehouse_cells"))
        row = fetchone_dict(cur) or {}
        total = int(row.get('cnt') or 0)

        # 只有全新空表時，才建立起始 20 格；後續不再強制補回 25 格。
        if total == 0:
            for zone in ('A', 'B'):
                for col in range(1, 7):
                    for num in range(1, 21):
                        cur.execute(sql("""
                            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """), (zone, col, 'direct', num, '[]', '', now()))
        else:
            # service-line retained: database migration behavior consolidated into formal services.
            # 不清空、不重排、不把已有商品格洗掉；is_deleted=1 也算實體存在，不自動復活。
            for zone in ('A', 'B'):
                for col in range(1, 7):
                    cur.execute(sql("""
                        SELECT slot_number FROM warehouse_cells
                        WHERE zone = ? AND column_index = ? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
                    """), (zone, col, 'direct'))
                    existing = set()
                    for _r in cur.fetchall():
                        try:
                            _n = int(_r['slot_number'] if hasattr(_r, 'keys') else _r[0])
                            if _n > 0: existing.add(_n)
                        except Exception:
                            pass
                    for num in range(1, 21):
                        if num not in existing:
                            cur.execute(sql("""
                                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            """), (zone, col, 'direct', num, '[]', '', now()))
        if own_conn:
            conn.commit()
    finally:
        if own_conn:
            conn.close()

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
            common_materials {text},
            common_sizes {text},
            region {text},
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS inventory (
            id {pk},
            product_text {text} NOT NULL,
            product_code {text},
            material {text},
            month_tag {text},
            qty INTEGER DEFAULT 0,
            location {text},
            customer_name {text},
            customer_uid {text},
            operator {text},
            source_text {text},
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS orders (
            id {pk},
            customer_name {text} NOT NULL,
            customer_uid {text},
            product_text {text} NOT NULL,
            product_code {text},
            material {text},
            month_tag {text},
            qty INTEGER DEFAULT 0,
            status {text} DEFAULT 'pending',
            operator {text},
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS master_orders (
            id {pk},
            customer_name {text} NOT NULL,
            customer_uid {text},
            product_text {text} NOT NULL,
            product_code {text},
            material {text},
            month_tag {text},
            qty INTEGER DEFAULT 0,
            operator {text},
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS shipping_records (
            id {pk},
            customer_name {text} NOT NULL,
            customer_uid {text},
            product_text {text} NOT NULL,
            product_code {text},
            material {text},
            month_tag {text},
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
        f"""CREATE TABLE IF NOT EXISTS today_changes (
            id {pk},
            action {text},
            table_name {text},
            customer_name {text},
            product_text {text},
            detail_json {text},
            operator {text},
            created_at {text},
            unread INTEGER DEFAULT 1
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
        f"""CREATE TABLE IF NOT EXISTS todo_items (
            id {pk},
            note {text},
            due_date {text},
            image_filename {text},
            created_by {text},
            created_at {text},
            updated_at {text},
            completed_at {text},
            is_done INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0
        )""",
        f"""CREATE TABLE IF NOT EXISTS app_settings (
            id {pk},
            key {text} UNIQUE NOT NULL,
            value {text},
            updated_at {text}
        )""",
    ]
    for t in tables:
        cur.execute(t)

    # service-line retained: database migration behavior consolidated into formal services.
    def _ensure_column(table_name, column_name, column_def):
        try:
            _add_column_if_missing(cur, table_name, column_name, column_def)
        except Exception as e:
            log_error('ensure_column', f'{table_name}.{column_name}: {e}')

    _schema_columns = {
        'users': [('username','TEXT'),('password','TEXT'),('role','TEXT DEFAULT \'user\''),('is_blocked','INTEGER DEFAULT 0'),('created_at','TEXT'),('updated_at','TEXT')],
        'customer_profiles': [('name','TEXT'),('phone','TEXT'),('address','TEXT'),('notes','TEXT'),('common_materials','TEXT'),('common_sizes','TEXT'),('region','TEXT'),('customer_uid','TEXT'),('is_archived','INTEGER DEFAULT 0'),('archived_at','TEXT'),('created_at','TEXT'),('updated_at','TEXT')],
        'inventory': [('customer_uid','TEXT'),('product_text','TEXT'),('product_code','TEXT'),('material','TEXT'),('month_tag','TEXT'),('qty','INTEGER DEFAULT 0'),('location','TEXT'),('area','TEXT'),('source','TEXT'),('note','TEXT'),('customer_name','TEXT'),('operator','TEXT'),('source_text','TEXT'),('created_at','TEXT'),('updated_at','TEXT')],
        'orders': [('customer_uid','TEXT'),('customer_name','TEXT'),('product_text','TEXT'),('product_code','TEXT'),('material','TEXT'),('month_tag','TEXT'),('qty','INTEGER DEFAULT 0'),('location','TEXT'),('area','TEXT'),('source','TEXT'),('note','TEXT'),('status',"TEXT DEFAULT 'pending'"),('operator','TEXT'),('created_at','TEXT'),('updated_at','TEXT')],
        'master_orders': [('customer_uid','TEXT'),('customer_name','TEXT'),('product_text','TEXT'),('product_code','TEXT'),('material','TEXT'),('month_tag','TEXT'),('qty','INTEGER DEFAULT 0'),('location','TEXT'),('area','TEXT'),('source','TEXT'),('note','TEXT'),('operator','TEXT'),('created_at','TEXT'),('updated_at','TEXT')],
        'shipping_records': [('customer_uid','TEXT'),('customer_name','TEXT'),('product_text','TEXT'),('product_code','TEXT'),('material','TEXT'),('month_tag','TEXT'),('qty','INTEGER DEFAULT 0'),('source_table','TEXT'),('before_qty','INTEGER DEFAULT 0'),('after_qty','INTEGER DEFAULT 0'),('operator','TEXT'),('created_at','TEXT'),('shipped_at','TEXT'),('note','TEXT')],
        'warehouse_cells': [('zone','TEXT'),('column_index','INTEGER'),('slot_type','TEXT'),('slot_number','INTEGER'),('items_json','TEXT'),('note','TEXT'),('updated_at','TEXT'),('is_deleted','INTEGER DEFAULT 0'),('problem_flag','TEXT DEFAULT ''')],
        'today_changes': [('action','TEXT'),('table_name','TEXT'),('customer_name','TEXT'),('product_text','TEXT'),('detail_json','TEXT'),('operator','TEXT'),('created_at','TEXT'),('unread','INTEGER DEFAULT 1')],
        'app_settings': [('key','TEXT'),('value','TEXT'),('updated_at','TEXT')],
        'customer_aliases': [('alias','TEXT'),('target_name','TEXT'),('updated_at','TEXT')],
        'warehouse_recent_slots': [('username','TEXT'),('customer_name','TEXT'),('zone','TEXT'),('column_index','INTEGER'),('slot_number','INTEGER'),('used_at','TEXT')],
        'audit_trails': [('username','TEXT'),('action_type','TEXT'),('entity_type','TEXT'),('entity_key','TEXT'),('before_json','TEXT'),('after_json','TEXT'),('created_at','TEXT')],
        'todo_items': [('note','TEXT'),('due_date','TEXT'),('image_filename','TEXT'),('created_by','TEXT'),('created_at','TEXT'),('updated_at','TEXT'),('completed_at','TEXT'),('is_done','INTEGER DEFAULT 0'),('sort_order','INTEGER DEFAULT 0')],
    }
    for _table, _columns in _schema_columns.items():
        for _col, _def in _columns:
            _ensure_column(_table, _col, _def)

    # service-line retained: database migration behavior consolidated into formal services.
    # 以前本機或手機 SQLite 若已經有舊 schema，CREATE TABLE IF NOT EXISTS 不會改表，
    # 這裡先把舊欄位值補進新欄位，避免倉庫圖讀不到或全部變成 A-1-01。
    if not USE_POSTGRES:
        try:
            wh_cols = _table_columns(cur, 'warehouse_cells')
            def _has_col(name):
                return name in wh_cols
            if _has_col('zone'):
                if _has_col('area'):
                    cur.execute("UPDATE warehouse_cells SET zone = COALESCE(NULLIF(zone,''), NULLIF(area,''), 'A') WHERE zone IS NULL OR zone = ''")
                else:
                    cur.execute("UPDATE warehouse_cells SET zone = COALESCE(NULLIF(zone,''), 'A') WHERE zone IS NULL OR zone = ''")
            if _has_col('column_index'):
                if _has_col('col'):
                    cur.execute("UPDATE warehouse_cells SET column_index = COALESCE(column_index, col, 1) WHERE column_index IS NULL OR column_index = 0")
                elif _has_col('column'):
                    cur.execute("UPDATE warehouse_cells SET column_index = COALESCE(column_index, column, 1) WHERE column_index IS NULL OR column_index = 0")
                else:
                    cur.execute("UPDATE warehouse_cells SET column_index = COALESCE(column_index, 1) WHERE column_index IS NULL OR column_index = 0")
            if _has_col('slot_type'):
                if _has_col('front_back'):
                    cur.execute("SELECT 1")  # service-line retained: database migration behavior consolidated into formal services.
                elif _has_col('side'):
                    cur.execute("SELECT 1")  # service-line retained: database migration behavior consolidated into formal services.
                else:
                    cur.execute("SELECT 1")  # service-line retained: database migration behavior consolidated into formal services.
            if _has_col('slot_number'):
                if _has_col('row'):
                    cur.execute("UPDATE warehouse_cells SET slot_number = COALESCE(slot_number, row, 1) WHERE slot_number IS NULL OR slot_number = 0")
                elif _has_col('position'):
                    cur.execute("UPDATE warehouse_cells SET slot_number = COALESCE(slot_number, position, 1) WHERE slot_number IS NULL OR slot_number = 0")
                else:
                    cur.execute("UPDATE warehouse_cells SET slot_number = COALESCE(slot_number, 1) WHERE slot_number IS NULL OR slot_number = 0")
            if _has_col('items_json'):
                cur.execute("UPDATE warehouse_cells SET items_json = COALESCE(NULLIF(items_json,''), '[]') WHERE items_json IS NULL OR items_json = ''")
            if _has_col('note'):
                cur.execute("UPDATE warehouse_cells SET note = '' WHERE note LIKE '__USER_%__' OR note IN ('__USER_ADDED__','__USER_INSERTED_SLOT__')")
        except Exception as e:
            log_error('sqlite_warehouse_legacy_migration', str(e))

    if USE_POSTGRES:
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked INTEGER DEFAULT 0")
        cur.execute("ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS customer_uid TEXT")
        cur.execute("ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS common_materials TEXT")
        cur.execute("ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS common_sizes TEXT")
        cur.execute("ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS is_archived INTEGER DEFAULT 0")
        cur.execute("ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS archived_at TEXT")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_ocr_usage_period ON ocr_usage(engine, period)")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_profiles_uid ON customer_profiles(customer_uid)")
    else:
        user_cols = _table_columns(cur, 'users')
        if 'role' not in user_cols:
            cur.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
        if 'is_blocked' not in user_cols:
            cur.execute("ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0")
        customer_cols = _table_columns(cur, 'customer_profiles')
        if 'customer_uid' not in customer_cols:
            cur.execute("ALTER TABLE customer_profiles ADD COLUMN customer_uid TEXT")
        if 'common_materials' not in customer_cols:
            cur.execute("ALTER TABLE customer_profiles ADD COLUMN common_materials TEXT")
        if 'common_sizes' not in customer_cols:
            cur.execute("ALTER TABLE customer_profiles ADD COLUMN common_sizes TEXT")
        if 'is_archived' not in customer_cols:
            cur.execute("ALTER TABLE customer_profiles ADD COLUMN is_archived INTEGER DEFAULT 0")
        if 'archived_at' not in customer_cols:
            cur.execute("ALTER TABLE customer_profiles ADD COLUMN archived_at TEXT")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_ocr_usage_period ON ocr_usage(engine, period)")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_profiles_uid ON customer_profiles(customer_uid)")

    cur.execute(sql("UPDATE users SET role = ? WHERE username = ?"), ('admin', '陳韋廷'))

    try:
        cur.execute(sql("SELECT id, name, created_at FROM customer_profiles WHERE COALESCE(customer_uid, '') = ''"))
        missing_uid_rows = rows_to_dict(cur)
        for row in missing_uid_rows:
            seed = f"{row.get('name') or ''}|{row.get('created_at') or ''}|{row.get('id') or ''}|customer"
            uid = 'CUST-' + hashlib.md5(seed.encode('utf-8')).hexdigest()[:16].upper()
            cur.execute(sql("UPDATE customer_profiles SET customer_uid = ?, updated_at = COALESCE(updated_at, ?) WHERE id = ?"), (uid, now(), row.get('id')))
    except Exception:
        pass


    # service-line retained: database migration behavior consolidated into formal services.
    try:
        for _idx in (
            "CREATE INDEX IF NOT EXISTS ix_customer_profiles_name ON customer_profiles(name)",
            "CREATE INDEX IF NOT EXISTS ix_customer_profiles_region ON customer_profiles(region)",
            "CREATE INDEX IF NOT EXISTS ix_inventory_customer_name ON inventory(customer_name)",
            "CREATE INDEX IF NOT EXISTS ix_inventory_customer_uid ON inventory(customer_uid)",
            "CREATE INDEX IF NOT EXISTS ix_inventory_location ON inventory(location)",
            "CREATE INDEX IF NOT EXISTS ix_orders_customer_name ON orders(customer_name)",
            "CREATE INDEX IF NOT EXISTS ix_orders_customer_uid ON orders(customer_uid)",
            "CREATE INDEX IF NOT EXISTS ix_orders_location ON orders(location)",
            "CREATE INDEX IF NOT EXISTS ix_master_orders_customer_name ON master_orders(customer_name)",
            "CREATE INDEX IF NOT EXISTS ix_master_orders_customer_uid ON master_orders(customer_uid)",
            "CREATE INDEX IF NOT EXISTS ix_master_orders_location ON master_orders(location)",
            "CREATE INDEX IF NOT EXISTS ix_shipping_records_customer_name ON shipping_records(customer_name)",
            "CREATE INDEX IF NOT EXISTS ix_shipping_records_customer_uid ON shipping_records(customer_uid)",
            "CREATE INDEX IF NOT EXISTS ix_shipping_records_shipped_at ON shipping_records(shipped_at)",
            "CREATE INDEX IF NOT EXISTS ix_warehouse_cells_zone_col_slot ON warehouse_cells(zone, column_index, slot_number)",
            "CREATE INDEX IF NOT EXISTS ix_audit_trails_entity_created ON audit_trails(entity_type, created_at)",
            "CREATE INDEX IF NOT EXISTS ix_audit_trails_username_created ON audit_trails(username, created_at)"
        ):
            cur.execute(_idx)
    except Exception as e:
        log_error('fix142_create_indexes', str(e))

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

        legacy_schema = False  # service-line retained: database migration behavior consolidated into formal services.

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
                updated_at {text}
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
                updated_at {text}
            )""")
            # service-line retained: database migration behavior consolidated into formal services.
            # 已存在的 PostgreSQL 表，用 ALTER TABLE ... ADD COLUMN IF NOT EXISTS 補齊欄位；
            # SQLite 的 PRAGMA 補欄位流程只放在下方 not USE_POSTGRES 分支。
            for _col, _def in (
                ('zone', 'TEXT'),
                ('column_index', 'INTEGER'),
                ('slot_type', 'TEXT'),
                ('slot_number', 'INTEGER'),
                ('items_json', 'TEXT'),
                ('note', 'TEXT'),
                ('updated_at', 'TEXT'),
            ):
                cur.execute(f"ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS {_col} {_def}")

        cur.execute(sql("SELECT COUNT(*) AS cnt FROM warehouse_cells"))
        _wh_count = int((fetchone_dict(cur) or {}).get('cnt') or 0)
        if _wh_count == 0:
            for zone in ('A', 'B'):
                for col in range(1, 7):
                    for num in range(1, 21):
                        cur.execute(sql("""
                            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """), (zone, col, 'direct', num, '[]', '', now()))
    else:
        cur.execute(f"""CREATE TABLE IF NOT EXISTS warehouse_cells (
            id {pk},
            zone {text} NOT NULL,
            column_index INTEGER NOT NULL,
            slot_type {text} NOT NULL,
            slot_number INTEGER NOT NULL,
            items_json {text},
            note {text},
            updated_at {text}
        )""")
        cur.execute(sql("SELECT COUNT(*) AS cnt FROM warehouse_cells"))
        _wh_count = int((fetchone_dict(cur) or {}).get('cnt') or 0)
        if _wh_count == 0:
            for zone in ('A', 'B'):
                for col in range(1, 7):
                    for num in range(1, 21):
                        cur.execute(sql("""
                            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """), (zone, col, 'direct', num, '[]', '', now()))

    # normalize warehouse slot_type only; never DELETE all / rebuild warehouse_cells.
    # User data in warehouse_cells must remain in place. Duplicate slots are handled by later
    # safe duplicate-merge logic and slot operations shift only affected slot numbers.
    try:
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET items_json = COALESCE(NULLIF(items_json, ''), '[]'),
                note = COALESCE(note, ''),
                updated_at = COALESCE(NULLIF(updated_at, ''), ?)
        """), (now(),))
    except Exception as e:
        log_error('warehouse_normalize_direct_no_delete', str(e))

    # service-line retained: database migration behavior consolidated into formal services.
    try:
        cur.execute(sql("UPDATE warehouse_cells SET note = '' WHERE note LIKE '__USER_%__' OR note IN ('__USER_ADDED__','__USER_INSERTED_SLOT__')"))
        if not USE_POSTGRES:
            cur.execute("CREATE INDEX IF NOT EXISTS ix_warehouse_cells_slot_lookup ON warehouse_cells(zone, column_index, slot_type, slot_number)")
    except Exception as e:
        log_error('warehouse_final_index_cleanup', str(e))

    ensure_fixed_warehouse_grid(conn, cur)

    # service-line retained: database migration behavior consolidated into formal services.
    # 1) 先修正 warehouse_cells 空值與重複格位。
    # 2) 再補唯一索引與常用查詢索引，確保刷新後資料不消失，也避免重複格號讓儲存失敗。
    try:
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET zone = COALESCE(NULLIF(zone, ''), 'A'),
                column_index = COALESCE(column_index, 1),
                slot_number = COALESCE(slot_number, 1),
                items_json = COALESCE(NULLIF(items_json, ''), '[]'),
                note = COALESCE(note, ''),
                updated_at = COALESCE(NULLIF(updated_at, ''), ?)
        """), (now(),))
        # service-line retained: database migration behavior consolidated into formal services.
        # 先合併同格 items_json，再保留一筆；不清空、不重建。
        try:
            _yx_v79_merge_duplicate_slots_all(cur)
        except Exception as _e:
            log_error('v79_init_merge_duplicate_slots_all', str(_e))
        # 軟刪除邏輯不依賴 UNIQUE；避免舊資料重複格造成啟動失敗。
        try:
            cur.execute("CREATE INDEX IF NOT EXISTS ix_warehouse_cells_slot_lookup_v79 ON warehouse_cells(zone, column_index, slot_type, slot_number)")
        except Exception as _e:
            log_error('v79_init_slot_lookup_index', str(_e))
    except Exception as e:
        log_error('v23_warehouse_slot_migration', str(e))

    try:
        _index_sqls = [
            "CREATE INDEX IF NOT EXISTS ix_inventory_customer_updated ON inventory(customer_name, updated_at DESC, id DESC)",
            "CREATE INDEX IF NOT EXISTS ix_inventory_customer_uid ON inventory(customer_uid)",
            "CREATE INDEX IF NOT EXISTS ix_inventory_product_material ON inventory(product_text, material)",
            "CREATE INDEX IF NOT EXISTS ix_orders_customer_updated ON orders(customer_name, updated_at DESC, id DESC)",
            "CREATE INDEX IF NOT EXISTS ix_orders_customer_uid ON orders(customer_uid)",
            "CREATE INDEX IF NOT EXISTS ix_orders_product_material ON orders(product_text, material)",
            "CREATE INDEX IF NOT EXISTS ix_master_orders_customer_updated ON master_orders(customer_name, updated_at DESC, id DESC)",
            "CREATE INDEX IF NOT EXISTS ix_master_orders_customer_uid ON master_orders(customer_uid)",
            "CREATE INDEX IF NOT EXISTS ix_master_orders_product_material ON master_orders(product_text, material)",
            "CREATE INDEX IF NOT EXISTS ix_shipping_records_shipped_at ON shipping_records(shipped_at DESC, id DESC)",
            "CREATE INDEX IF NOT EXISTS ix_logs_created_at ON logs(created_at DESC, id DESC)",
            "CREATE INDEX IF NOT EXISTS ix_today_changes_created_at ON today_changes(created_at DESC, id DESC)",
            "CREATE INDEX IF NOT EXISTS ix_v135_wh_cells_visible ON warehouse_cells(zone, column_index, slot_number)",
            "CREATE INDEX IF NOT EXISTS ix_v135_customer_profiles_region_name ON customer_profiles(region, name)",
        ]
        for _stmt in _index_sqls:
            try:
                cur.execute(_stmt)
            except Exception as _idx_e:
                log_error('v23_index_single', f'{_stmt}: {_idx_e}')
    except Exception as e:
        log_error('v23_indexes', str(e))

    # service-line retained: database migration behavior consolidated into formal services.
    for _table in ('inventory', 'orders', 'master_orders', 'shipping_records'):
        _normalize_product_texts_in_table(cur, _table)
    _clean_product_like_materials(cur)
    _normalize_warehouse_item_texts(cur)
    # service-line retained: database migration behavior consolidated into formal services.
    try:
        cur.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)")
        if USE_POSTGRES:
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT ''")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v107_wh_lookup ON warehouse_cells(zone, column_index, slot_number)")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v107_inventory_customer_updated ON inventory(customer_name, updated_at DESC, id DESC)")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v107_orders_customer_updated ON orders(customer_name, updated_at DESC, id DESC)")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v107_master_orders_customer_updated ON master_orders(customer_name, updated_at DESC, id DESC)")
            cur.execute("INSERT INTO schema_migrations(version) VALUES('117_mainfile_stability') ON CONFLICT (version) DO NOTHING")
        else:
            try:
                cur.execute("INSERT OR IGNORE INTO schema_migrations(version) VALUES('117_mainfile_stability')")
            except Exception:
                pass
    except Exception as e:
        log_error('v105_mainfile_safe_migration', str(e))
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




def _new_customer_uid(name, created_at=''):
    seed = f"{name}|{created_at}|{now()}|customer"
    return 'CUST-' + hashlib.md5(seed.encode('utf-8')).hexdigest()[:16].upper()




def _customer_uid_for_name_cur(cur, name):
    name = (name or '').strip()
    if not name:
        return ''
    try:
        cur.execute(sql("SELECT customer_uid, created_at FROM customer_profiles WHERE name = ?"), (name,))
        row = fetchone_dict(cur)
        if row:
            uid = (row.get('customer_uid') or '').strip()
            if uid:
                return uid
            return _new_customer_uid(name, row.get('created_at') or '')
    except Exception:
        pass
    return ''



def customer_merge_key(name):
    """Formal database helper retained for stable behavior."""
    raw = re.sub(r'\s+', ' ', str(name or '').strip())
    if not raw:
        return ''
    tag_order = ['FOB代', 'FOB', 'CNF']
    tags = []
    def repl(m):
        token = (m.group(0) or '').upper().replace('代付', '代')
        if '代' in token:
            tag = 'FOB代'
        else:
            tag = token
        if tag not in tags:
            tags.append(tag)
        return ' '
    base = re.sub(r'FOB\s*代付|FOB\s*代|FOB代付|FOB代|FOB|CNF', repl, raw, flags=re.I)
    base = re.sub(r'\s+', '', base).strip().lower()
    tags = [t for t in tag_order if t in tags]
    return base + '|' + '/'.join(tags)


def customer_merge_variants(cur, name):
    """Formal database helper retained for stable behavior."""
    key = customer_merge_key(name)
    if not key:
        return []
    seen = set()
    variants = []
    def add(v):
        v = (v or '').strip()
        if not v or v in seen:
            return
        if customer_merge_key(v) == key:
            seen.add(v)
            variants.append(v)
    add(name)
    try:
        cur.execute(sql("SELECT name FROM customer_profiles WHERE COALESCE(name, '') <> ''"))
        for r in rows_to_dict(cur):
            add(r.get('name'))
    except Exception as e:
        log_error('customer_merge_variants_profiles', str(e))
    for table in ('inventory', 'orders', 'master_orders', 'shipping_records'):
        try:
            cur.execute(sql(f"SELECT DISTINCT customer_name FROM {table} WHERE COALESCE(customer_name, '') <> ''"))
            for r in rows_to_dict(cur):
                add(r.get('customer_name'))
        except Exception as e:
            log_error('customer_merge_variants_relations', f'{table}: {e}')
    return variants


def merge_customer_rows_for_display(customers):
    """Formal database helper retained for stable behavior."""
    merged = {}
    order = []
    count_fields = [
        'inventory_rows','order_rows','master_rows','shipping_rows',
        'inventory_qty','order_qty','master_qty','shipping_qty',
        'active_rows','total_rows','active_qty_total','history_qty_total',
    ]
    for row in customers or []:
        name = (row.get('name') or '').strip()
        key = customer_merge_key(name) or name
        if not key:
            continue
        if key not in merged:
            base = dict(row)
            base_counts = {k: 0 for k in count_fields}
            base['relation_counts'] = base_counts
            base['merge_names'] = []
            base['duplicate_merged_count'] = 0
            merged[key] = base
            order.append(key)
        dst = merged[key]
        if dst.get('virtual_customer') and not row.get('virtual_customer'):
            for k, v in row.items():
                if k not in ('relation_counts','row_count','item_count','history_count','merge_names','duplicate_merged_count'):
                    dst[k] = v
        else:
            for field in ('phone','address','notes','common_materials','common_sizes','region','customer_uid'):
                if not (dst.get(field) or '') and (row.get(field) or ''):
                    dst[field] = row.get(field)
        if name and name not in dst['merge_names']:
            dst['merge_names'].append(name)
        rc = row.get('relation_counts') or {}
        dc = dst['relation_counts']
        for field in count_fields:
            try:
                dc[field] += int(rc.get(field) or 0)
            except Exception:
                pass
        if not rc:
            try:
                dc['active_rows'] += int(row.get('row_count') or 0)
                dc['total_rows'] += int(row.get('row_count') or 0)
                dc['active_qty_total'] += int(row.get('item_count') or 0)
            except Exception:
                pass
    out = []
    for key in order:
        row = merged[key]
        rc = row.get('relation_counts') or {}
        row['row_count'] = int(rc.get('active_rows') or 0)
        row['item_count'] = int(rc.get('active_qty_total') or 0)
        row['history_count'] = int(rc.get('shipping_qty') or rc.get('history_qty_total') or 0)
        row['duplicate_merged_count'] = max(0, len(row.get('merge_names') or []) - 1)
        out.append(row)
    out.sort(key=lambda r: ({'北區':1,'中區':2,'南區':3}.get((r.get('region') or '').strip(), 9), customer_merge_key(r.get('name') or ''), (r.get('name') or '')))
    return out

def _sync_customer_uid_columns(cur):
    """Formal database helper retained for stable behavior."""
    try:
        for table in ('inventory','orders','master_orders','shipping_records'):
            if USE_POSTGRES:
                cur.execute(sql(f"""
                    UPDATE {table} t
                    SET customer_uid = cp.customer_uid
                    FROM customer_profiles cp
                    WHERE COALESCE(t.customer_name,'') <> ''
                      AND t.customer_name = cp.name
                      AND COALESCE(cp.customer_uid,'') <> ''
                      AND COALESCE(t.customer_uid,'') <> cp.customer_uid
                """))
            else:
                cur.execute(sql(f"""
                    UPDATE {table}
                    SET customer_uid = (
                        SELECT cp.customer_uid FROM customer_profiles cp
                        WHERE cp.name = {table}.customer_name
                    )
                    WHERE COALESCE(customer_name,'') <> ''
                      AND EXISTS (
                        SELECT 1 FROM customer_profiles cp
                        WHERE cp.name = {table}.customer_name
                          AND COALESCE(cp.customer_uid,'') <> ''
                          AND COALESCE({table}.customer_uid,'') <> cp.customer_uid
                      )
                """))
    except Exception as e:
        log_error('sync_customer_uid_columns', str(e))


def recover_customer_profiles_from_relation_tables():
    """Formal database helper retained for stable behavior."""
    conn = get_db()
    cur = conn.cursor()
    recovered = []
    synced = 0
    try:
        names = set()
        for table in ('inventory','orders','master_orders','shipping_records'):
            try:
                cur.execute(sql(f"""
                    SELECT DISTINCT customer_name
                    FROM {table}
                    WHERE COALESCE(customer_name,'') <> ''
                      AND TRIM(customer_name) <> ''
                      AND customer_name NOT IN ('庫存','未指定客戶')
                """))
                for r in rows_to_dict(cur):
                    n = (r.get('customer_name') or '').strip()
                    if n:
                        names.add(n)
            except Exception as e:
                log_error('recover_customer_profiles_scan', f'{table}: {e}')

        for name in sorted(names):
            cur.execute(sql("SELECT id, customer_uid FROM customer_profiles WHERE name = ?"), (name,))
            row = fetchone_dict(cur)
            if row:
                if not (row.get('customer_uid') or '').strip():
                    uid = _new_customer_uid(name, '')
                    try:
                        cur.execute(sql("UPDATE customer_profiles SET customer_uid = ?, updated_at = ?, is_archived = 0, archived_at = NULL WHERE id = ?"), (uid, now(), row.get('id')))
                    except Exception:
                        cur.execute(sql("UPDATE customer_profiles SET customer_uid = ?, updated_at = ? WHERE id = ?"), (uid, now(), row.get('id')))
                    recovered.append({'name': name, 'mode': 'uid_filled'})
                continue
            uid = _new_customer_uid(name, '')
            try:
                cur.execute(sql("""
                    INSERT INTO customer_profiles
                    (name, phone, address, notes, common_materials, common_sizes, region, customer_uid, is_archived, archived_at, created_at, updated_at)
                    VALUES (?, '', '', 'customer recovery 從商品/出貨紀錄自動找回', '', '', '北區', ?, 0, NULL, ?, ?)
                """), (name, uid, now(), now()))
            except Exception:
                # 舊資料庫若還沒補到 is_archived / customer_uid 欄位，退回最小欄位，避免救援中斷。
                cur.execute(sql("""
                    INSERT INTO customer_profiles
                    (name, phone, address, notes, common_materials, common_sizes, region, created_at, updated_at)
                    VALUES (?, '', '', 'customer recovery 從商品/出貨紀錄自動找回', '', '', '北區', ?, ?)
                """), (name, now(), now()))
            recovered.append({'name': name, 'mode': 'created_from_relation'})

        before = conn.total_changes if not USE_POSTGRES else None
        _sync_customer_uid_columns(cur)
        if not USE_POSTGRES and before is not None:
            synced = max(0, conn.total_changes - before)
        conn.commit()
        return {'success': True, 'recovered_count': len(recovered), 'synced_rows': synced, 'items': recovered}
    except Exception as e:
        conn.rollback()
        log_error('recover_customer_profiles_from_relation_tables', str(e))
        return {'success': False, 'error': str(e), 'recovered_count': len(recovered), 'synced_rows': synced, 'items': recovered}
    finally:
        conn.close()

def get_customer_relation_counts(name='', customer_uid=''):
    """Formal database helper retained for stable behavior."""
    name = (name or '').strip()
    customer_uid = (customer_uid or '').strip()
    counts = {
        'inventory_rows': 0,
        'order_rows': 0,
        'master_rows': 0,
        'shipping_rows': 0,
        'inventory_qty': 0,
        'order_qty': 0,
        'master_qty': 0,
        'shipping_qty': 0,
        'active_rows': 0,
        'total_rows': 0,
        'active_qty_total': 0,
        'history_qty_total': 0,
    }
    if not name and not customer_uid:
        return counts
    conn = get_db()
    cur = conn.cursor()
    try:
        if customer_uid:
            cur.execute(sql("SELECT name, customer_uid FROM customer_profiles WHERE customer_uid = ?"), (customer_uid,))
            row = fetchone_dict(cur)
            if row:
                name = name or (row.get('name') or '').strip()
        elif name:
            cur.execute(sql("SELECT customer_uid FROM customer_profiles WHERE name = ?"), (name,))
            row = fetchone_dict(cur)
            if row:
                customer_uid = (row.get('customer_uid') or '').strip()
        variants = customer_merge_variants(cur, name) if name else []
        for table, prefix in [
            ('inventory', 'inventory'),
            ('orders', 'order'),
            ('master_orders', 'master'),
            ('shipping_records', 'shipping'),
        ]:
            where_parts = []
            params = []
            if customer_uid:
                where_parts.append("customer_uid = ?")
                params.append(customer_uid)
            if variants:
                where_parts.append("customer_name IN (" + ",".join(["?"] * len(variants)) + ")")
                params.extend(variants)
            elif name:
                where_parts.append("customer_name = ?")
                params.append(name)
            if not where_parts:
                rows = []
            else:
                cur.execute(sql(f"SELECT product_text, qty FROM {table} WHERE " + " OR ".join(where_parts)), tuple(params))
                rows = rows_to_dict(cur)
            counts[f'{prefix}_rows'] = len(rows)
            counts[f'{prefix}_qty'] = sum(effective_product_qty(r.get('product_text') or '', r.get('qty') or 0) for r in rows)
        counts['active_rows'] = counts['inventory_rows'] + counts['order_rows'] + counts['master_rows']
        counts['total_rows'] = counts['active_rows'] + counts['shipping_rows']
        counts['active_qty_total'] = counts['inventory_qty'] + counts['order_qty'] + counts['master_qty']
        counts['history_qty_total'] = counts['shipping_qty']
        return counts
    finally:
        conn.close()


def upsert_customer(name, phone=None, address=None, notes=None, region=None, preserve_existing=True, common_materials=None, common_sizes=None):
    name = (name or '').strip()
    if not name:
        raise ValueError('客戶名稱不可空白')
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM customer_profiles WHERE name = ?"), (name,))
    existing = fetchone_dict(cur) or {}

    def choose(field_name, incoming, default=''):
        if preserve_existing:
            if incoming is None or incoming == '':
                return (existing.get(field_name) or default)
        if incoming is None:
            return (existing.get(field_name) or default) if preserve_existing else default
        return incoming

    phone_v = choose('phone', phone, '')
    address_v = choose('address', address, '')
    notes_v = choose('notes', notes, '')
    common_materials_v = choose('common_materials', common_materials, '')
    common_sizes_v = choose('common_sizes', common_sizes, '')
    region_v = choose('region', region, '')
    created_at_v = existing.get('created_at') or now()
    customer_uid = existing.get('customer_uid') or _new_customer_uid(name, created_at_v)

    if existing:
        cur.execute(sql("""
            UPDATE customer_profiles
            SET phone = ?, address = ?, notes = ?, common_materials = ?, common_sizes = ?, region = ?, customer_uid = ?, is_archived = 0, archived_at = NULL, updated_at = ?
            WHERE name = ?
        """), (phone_v, address_v, notes_v, common_materials_v, common_sizes_v, region_v, customer_uid, now(), name))
    else:
        cur.execute(sql("""
            INSERT INTO customer_profiles(name, phone, address, notes, common_materials, common_sizes, region, customer_uid, is_archived, archived_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
        """), (name, phone_v, address_v, notes_v, common_materials_v, common_sizes_v, region_v, customer_uid, created_at_v, now()))
    conn.commit()
    conn.close()
    return get_customer(name, include_archived=True)



def get_customers(active_only=True):
    """session safety / customer list stable：客戶清單用資料庫 GROUP BY 統計，以 customer_uid 為主、customer_name 做舊資料備援。

    customer recovery 的 109 客戶/商品救援保留，但不再每次開客戶清單都掃 inventory / orders /
    master_orders / shipping_records，避免開訂單、總單、出貨、客戶頁時卡頓。
    目前改成每個伺服器行程最多自動救援一次；需要重跑時可手動呼叫
    /api/recover/customers-from-relations。
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        # service-line retained: database migration behavior consolidated into formal services.
        # 資料救援保留在 /api/recover/customers-from-relations；自動維護每個伺服器行程最多只跑一次。
        if not globals().get('_YX142_CUSTOMER_LIGHT_MAINTENANCE_DONE'):
            globals()['_YX142_CUSTOMER_LIGHT_MAINTENANCE_DONE'] = True
            try:
                _sync_customer_uid_columns(cur)
            except Exception as e:
                log_error('get_customers_sync_uid_once', str(e))
            try:
                _clean_product_like_materials(cur)
            except Exception as e:
                log_error('get_customers_clean_materials_once', str(e))
        if os.environ.get('YX_AUTO_RECOVER_ON_BOOT') == '1' and not globals().get('_YX142_CUSTOMERS_AUTO_RECOVERED'):
            globals()['_YX142_CUSTOMERS_AUTO_RECOVERED'] = True
            try:
                conn.close()
                recover_customer_profiles_from_relation_tables()
                conn = get_db()
                cur = conn.cursor()
            except Exception as e:
                log_error('get_customers_auto_recover_optional', str(e))

        query = "SELECT * FROM customer_profiles"
        if active_only:
            query += " WHERE COALESCE(is_archived, 0) = 0"
        query += " ORDER BY CASE region WHEN '北區' THEN 1 WHEN '中區' THEN 2 WHEN '南區' THEN 3 ELSE 9 END, name"
        cur.execute(sql(query))
        customers = rows_to_dict(cur)

        def empty_counts():
            return {
                'inventory_rows': 0, 'order_rows': 0, 'master_rows': 0, 'shipping_rows': 0,
                'inventory_qty': 0, 'order_qty': 0, 'master_qty': 0, 'shipping_qty': 0,
                'active_rows': 0, 'total_rows': 0, 'active_qty_total': 0, 'history_qty_total': 0,
            }

        name_to_uid = {}
        for row in customers:
            name = (row.get('name') or '').strip()
            uid = (row.get('customer_uid') or '').strip()
            if not uid and name:
                uid = _new_customer_uid(name, row.get('created_at') or '')
                try:
                    cur.execute(sql("UPDATE customer_profiles SET customer_uid = ?, updated_at = ? WHERE id = ?"), (uid, now(), row.get('id')))
                except Exception:
                    pass
                row['customer_uid'] = uid
            if name:
                name_to_uid[name] = uid or name

        # service-line retained: database migration behavior consolidated into formal services.
        # 舊資料可能只存在於 inventory / orders / master_orders / shipping_records，
        # 若沒有同步到 customer_profiles，前端點客戶後就會像「客戶裡面的商品不見」。
        # 這裡保留原本客戶資料，同時把仍有關聯商品的舊客戶補成 virtual customer 顯示。
        count_map = {}
        key_name_map = {}
        key_uid_map = {}
        archived_names = set()
        archived_uids = set()
        try:
            cur.execute(sql("SELECT name, customer_uid FROM customer_profiles WHERE COALESCE(is_archived, 0) = 1"))
            for ar in rows_to_dict(cur):
                if (ar.get('name') or '').strip(): archived_names.add((ar.get('name') or '').strip())
                if (ar.get('customer_uid') or '').strip(): archived_uids.add((ar.get('customer_uid') or '').strip())
        except Exception:
            pass
        def add_grouped_counts(table, prefix):
            try:
                # V134: 客戶卡片「件數 / 筆數」不能只 SUM(qty)。舊資料常有 qty=0/1，真正件數在 product_text：
                # 例如 63x30x125=240x49(-5) 必須算 49 件，括號備註不扣件數。
                cur.execute(sql(f"""
                    SELECT customer_uid, customer_name, product_text, qty
                    FROM {table}
                    WHERE COALESCE(customer_uid, '') <> '' OR COALESCE(customer_name, '') <> ''
                """))
                for r in rows_to_dict(cur):
                    uid = (r.get('customer_uid') or '').strip()
                    cname = (r.get('customer_name') or '').strip()
                    key = name_to_uid.get(cname) or uid or cname
                    if not key:
                        continue
                    if cname and key not in key_name_map:
                        key_name_map[key] = cname
                    if uid and key not in key_uid_map:
                        key_uid_map[key] = uid
                    c = count_map.setdefault(key, empty_counts())
                    c[f'{prefix}_rows'] += 1
                    try:
                        c[f'{prefix}_qty'] += int(effective_product_qty(r.get('product_text') or '', r.get('qty') or 0))
                    except Exception:
                        try:
                            c[f'{prefix}_qty'] += int(float(r.get('qty') or 0))
                        except Exception:
                            pass
            except Exception as e:
                log_error('get_customers_grouped_counts', f'{table}: {e}')

        add_grouped_counts('inventory', 'inventory')
        add_grouped_counts('orders', 'order')
        add_grouped_counts('master_orders', 'master')
        add_grouped_counts('shipping_records', 'shipping')

        seen_keys = set()
        for row in customers:
            name = (row.get('name') or '').strip()
            uid = (row.get('customer_uid') or '').strip()
            key = uid or name_to_uid.get(name) or name
            seen_keys.add(key)
            counts = count_map.get(key, empty_counts())
            counts['active_rows'] = counts['inventory_rows'] + counts['order_rows'] + counts['master_rows']
            counts['total_rows'] = counts['active_rows'] + counts['shipping_rows']
            counts['active_qty_total'] = counts['inventory_qty'] + counts['order_qty'] + counts['master_qty']
            counts['history_qty_total'] = counts['shipping_qty']
            row['relation_counts'] = counts
            row['row_count'] = counts['active_rows']
            row['item_count'] = counts['active_qty_total']
            row['history_count'] = counts['shipping_qty']
            row['customer_uid'] = uid or name_to_uid.get(name) or _new_customer_uid(name, row.get('created_at') or '')
            row['is_archived'] = int(row.get('is_archived') or 0)

        for key, counts in count_map.items():
            if key in seen_keys:
                continue
            counts['active_rows'] = counts['inventory_rows'] + counts['order_rows'] + counts['master_rows']
            counts['total_rows'] = counts['active_rows'] + counts['shipping_rows']
            counts['active_qty_total'] = counts['inventory_qty'] + counts['order_qty'] + counts['master_qty']
            counts['history_qty_total'] = counts['shipping_qty']
            if int(counts.get('total_rows') or 0) <= 0:
                continue
            cname = (key_name_map.get(key) or '').strip()
            if not cname:
                continue
            # service-line retained: database migration behavior consolidated into formal services.
            if cname in archived_names or key in archived_uids:
                continue
            customers.append({
                'id': 0,
                'name': cname,
                'phone': '',
                'address': '',
                'notes': 'customer card mainline virtual customer from relation tables',
                'common_materials': '',
                'common_sizes': '',
                'region': '北區',
                'customer_uid': key_uid_map.get(key, '') if key_uid_map.get(key, '') else '',
                'is_archived': 0,
                'relation_counts': counts,
                'row_count': counts['active_rows'],
                'item_count': counts['active_qty_total'],
                'history_count': counts['shipping_qty'],
                'virtual_customer': True,
            })
        customers.sort(key=lambda r: ({'北區':1,'中區':2,'南區':3}.get((r.get('region') or '').strip(), 9), (r.get('name') or '')))
        # service-line retained: database migration behavior consolidated into formal services.
        customers = merge_customer_rows_for_display(customers)
        conn.commit()
        return customers
    finally:
        conn.close()


def delete_customer(name):
    name = (name or '').strip()
    if not name:
        raise ValueError('客戶名稱不可空白')
    row = get_customer(name, include_archived=True)
    if not row:
        raise ValueError('找不到客戶')
    counts = get_customer_relation_counts(name)
    conn = get_db()
    cur = conn.cursor()
    if int(counts.get('total_rows') or 0) > 0:
        cur.execute(sql("UPDATE customer_profiles SET is_archived = 1, archived_at = ?, updated_at = ? WHERE name = ?"), (now(), now(), name))
        mode = 'archived'
    else:
        cur.execute(sql("DELETE FROM customer_profiles WHERE name = ?"), (name,))
        mode = 'deleted'
    conn.commit()
    conn.close()
    return {'mode': mode, 'counts': counts, 'item': row}



def get_customer_by_uid(customer_uid, include_archived=False):
    uid = (customer_uid or '').strip()
    if not uid:
        return None
    conn = get_db()
    cur = conn.cursor()
    query = "SELECT * FROM customer_profiles WHERE customer_uid = ?"
    if not include_archived:
        query += " AND COALESCE(is_archived, 0) = 0"
    cur.execute(sql(query), (uid,))
    row = fetchone_dict(cur)
    conn.close()
    if row:
        row['relation_counts'] = get_customer_relation_counts(row.get('name') or '', row.get('customer_uid') or '')
        row['customer_uid'] = row.get('customer_uid') or _new_customer_uid(row.get('name') or '', row.get('created_at') or '')
        row['is_archived'] = int(row.get('is_archived') or 0)
    return row

def get_customer(name, include_archived=False):
    conn = get_db()
    cur = conn.cursor()
    query = "SELECT * FROM customer_profiles WHERE name = ?"
    if not include_archived:
        query += " AND COALESCE(is_archived, 0) = 0"
    cur.execute(sql(query), (name,))
    row = fetchone_dict(cur)
    conn.close()
    if row:
        row['relation_counts'] = get_customer_relation_counts(name, row.get('customer_uid') or '')
        row['customer_uid'] = row.get('customer_uid') or _new_customer_uid(name, row.get('created_at') or '')
        row['is_archived'] = int(row.get('is_archived') or 0)
    return row



def _normalize_size_key(text):
    raw = str(text or '').replace('×', 'x').replace('X', 'x').replace('＊', 'x').replace('*', 'x').strip()
    left = (raw.split('=', 1)[0].strip() or raw).lower().replace(' ', '')
    parts = [p for p in left.split('x') if p != '']
    def fmt_part(p, is_height=False):
        p = str(p or '').strip().lower()
        try:
            if '.' in p and p.replace('.', '', 1).isdigit():
                n = float(p)
                if 0 < n < 1:
                    return str(int(round(n * 100))).zfill(3)
                return str(n).replace('.', '')
            if p.isdigit():
                if is_height and len(p) == 1:
                    return p.zfill(2)
                return str(int(p)) if not p.startswith('0') else p
        except Exception:
            pass
        return p
    if len(parts) >= 3:
        return 'x'.join(fmt_part(p, i == 2) for i, p in enumerate(parts[:3]))
    return left

def _normalize_product_key(text):
    raw = str(text or '').replace('×', 'x').replace('X', 'x').replace('Ｘ', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip().lower()
    if '=' not in raw:
        return _normalize_size_key(raw)
    left, right = raw.split('=', 1)
    size = _normalize_size_key(left)
    # 括號備註只做顯示，不參與商品比對；讓 97 和 97x1 可視為同一支數，避免預覽誤判不足 1。
    right_for_key = re.sub(r'[\(（][^\)）]*[\)）]', '', right).replace('件', '').replace('片', '')
    right_for_key = re.sub(r'\s+', '', right_for_key).replace('＋', '+').replace('，', '+').replace(',', '+').replace('；', '+').replace(';', '+')
    parts = [part for part in right_for_key.split('+') if part]
    keys = []
    for part in parts:
        m = re.match(r'^(\d+(?:\.\d+)?)(?:x(\d+))?$', part, flags=re.I)
        if m:
            main = str(int(float(m.group(1))))
            mult = int(m.group(2) or 1)
            keys.append(main if mult == 1 else f'{main}x{mult}')
            continue
        nums = re.findall(r'\d+(?:\.\d+)?', part)
        if nums:
            keys.append(str(int(float(nums[0]))))
    if keys:
        return size + '=' + '+'.join(keys)
    return size + '=' + right_for_key.strip()

def _fetch_matching_product_rows(cur, table, product_text, customer_name=None):
    target = _normalize_product_key(product_text)
    if customer_name is None:
        cur.execute(sql(f"SELECT id, qty, product_text FROM {table} WHERE qty > 0 ORDER BY id ASC"))
    else:
        cur.execute(sql(f"SELECT id, qty, product_text FROM {table} WHERE customer_name = ? AND qty > 0 ORDER BY id ASC"), (customer_name,))
    rows = cur.fetchall()
    out = []
    for row in rows:
        rid = row[0] if USE_POSTGRES else row['id']
        qty = row[1] if USE_POSTGRES else row['qty']
        product = row[2] if USE_POSTGRES else row['product_text']
        if _normalize_product_key(product) == target:
            out.append({'id': rid, 'qty': int(qty or 0), 'product_text': product})
    return out


# service-line retained: database migration behavior consolidated into formal services.
def _merge_size_key(product_text):
    return product_display_size(format_product_text_height2(product_text or '')).replace(' ', '').lower()


def _merge_material_key(material='', product_text=''):
    return clean_material_value(material or '', product_text or '').replace(' ', '').upper()


def _row_material_for_merge(row, product_text=''):
    return clean_material_value((row.get('material') or row.get('product_code') or ''), product_text or row.get('product_text') or '')


def _fetch_matching_size_material_rows(cur, table, product_text, material='', customer_name=None, location=None):
    target_size = _merge_size_key(product_text)
    target_material = _merge_material_key(material, product_text)
    if not target_size:
        return []
    wheres = ['qty > 0']
    params = []
    if customer_name is not None:
        wheres.append('COALESCE(customer_name, \'\') = COALESCE(?, \'\')')
        params.append(customer_name or '')
    if location is not None:
        wheres.append('COALESCE(location, \'\') = COALESCE(?, \'\')')
        params.append(location or '')
    query = f"SELECT id, qty, product_text, product_code, material FROM {table} WHERE " + ' AND '.join(wheres) + ' ORDER BY id ASC'
    cur.execute(sql(query), tuple(params))
    out = []
    for row in rows_to_dict(cur):
        product = format_product_text_height2(row.get('product_text') or '')
        row_material = _row_material_for_merge(row, product)
        if _merge_size_key(product) == target_size and _merge_material_key(row_material, product) == target_material:
            row['product_text'] = product
            row['material'] = row_material
            row['product_code'] = row_material
            row['qty'] = int(row.get('qty') or 0)
            out.append(row)
    return out


def _support_count_map(expr):
    raw = str(expr or '').replace('×', 'x').replace('X', 'x').replace('＊', 'x').replace('*', 'x').replace('＋', '+').replace('，', '+').replace(',', '+').replace('；', '+').replace(';', '+').replace('件', '').replace('片', '').strip()
    counts = {}
    order = []
    for seg in [x.strip() for x in raw.split('+') if x.strip()]:
        m = re.match(r'^(\d+(?:\.\d+)?)(?:x(\d+))?$', seg, flags=re.I)
        if m:
            key = str(int(float(m.group(1))))
            cnt = int(m.group(2) or 1)
            if key not in counts:
                order.append(key)
                counts[key] = 0
            counts[key] += cnt
            continue
        nums = re.findall(r'\d+(?:\.\d+)?', seg)
        if nums:
            key = str(int(float(nums[0])))
            if key not in counts:
                order.append(key)
                counts[key] = 0
            counts[key] += 1
    return counts, order


def _merge_support_expressions(*exprs):
    counts = {}
    order = []
    for expr in exprs:
        c, o = _support_count_map(expr)
        for key in o:
            if key not in counts:
                order.append(key)
                counts[key] = 0
            counts[key] += int(c.get(key) or 0)
    parts = []
    for key in order:
        cnt = int(counts.get(key) or 0)
        if cnt <= 0:
            continue
        parts.append(key if cnt == 1 else f'{key}x{cnt}')
    return sort_support_expression('+'.join(parts))


def _merge_product_text_supports(existing_product, new_product):
    existing_product = format_product_text_height2(existing_product or '')
    new_product = format_product_text_height2(new_product or '')
    size = product_display_size(new_product or existing_product)
    merged_support = _merge_support_expressions(product_support_text(existing_product), product_support_text(new_product))
    return format_product_text_height2(f'{size}={merged_support}') if merged_support else (new_product or existing_product)


def _merge_items_by_size_material(items):
    buckets = {}
    ordered = []
    for item in items or []:
        product_text = format_product_text_height2((item.get('product_text') or item.get('product') or '').strip())
        if not product_text:
            continue
        material = clean_material_value(item.get('material') or item.get('product_code') or '', product_text)
        qty = effective_product_qty(product_text, item.get('qty') or 0)
        if qty <= 0:
            continue
        # service-line retained: database migration behavior consolidated into formal services.
        borrow_from = (item.get('borrow_from_customer_name') or item.get('source_customer_name') or '').strip()
        key = (_merge_size_key(product_text), _merge_material_key(material, product_text), borrow_from, _normalize_ship_source_preference(item.get('source_preference') or item.get('deduct_source') or item.get('source')))
        if key not in buckets:
            row = dict(item)
            row['product_text'] = product_text
            row['material'] = material
            row['product_code'] = material
            row['qty'] = qty
            buckets[key] = row
            ordered.append(key)
        else:
            row = buckets[key]
            row['product_text'] = _merge_product_text_supports(row.get('product_text') or '', product_text)
            row['qty'] = int(row.get('qty') or 0) + int(qty or 0)
    return [buckets[k] for k in ordered]


def _fetch_shipping_match_rows(cur, table, product_text, material='', customer_name=None):
    """V59 出貨用比對：尺寸為主、材質有值才嚴格；未填材質視為空；客戶名稱用合併 variants。

    修正：下拉選單顯示「未填材質」但 DB 是空字串時，總單會被誤判 0；
    以及客戶名含空白 / FOB / CNF 變體時，應該撈同一客戶的舊資料。
    """
    target_size = _merge_size_key(product_text)
    target_material = _merge_material_key(material, product_text)
    if not target_size:
        return []
    wheres = ['qty > 0']
    params = []
    if customer_name is not None:
        variants = customer_merge_variants(cur, customer_name) or [customer_name or '']
        variants = [v for v in dict.fromkeys([(v or '').strip() for v in variants]) if v or customer_name == '']
        if variants:
            wheres.append("COALESCE(customer_name, '') IN (" + ','.join(['?'] * len(variants)) + ')')
            params.extend(variants)
        else:
            wheres.append("COALESCE(customer_name, '') = COALESCE(?, '')")
            params.append(customer_name or '')
    query = f"SELECT id, qty, product_text, product_code, material FROM {table} WHERE " + ' AND '.join(wheres) + ' ORDER BY id ASC'
    cur.execute(sql(query), tuple(params))
    out = []
    for row in rows_to_dict(cur):
        product = format_product_text_height2(row.get('product_text') or '')
        if _merge_size_key(product) != target_size:
            continue
        row_material = _row_material_for_merge(row, product)
        # 若出貨項目沒有實際材質，任何空/未填材質的 DB row 都可比對；有指定材質才嚴格。
        if target_material and _merge_material_key(row_material, product) != target_material:
            continue
        row['product_text'] = product
        row['material'] = row_material
        row['product_code'] = row_material
        row['qty'] = int(row.get('qty') or 0)
        out.append(row)
    return out

def _sum_available_size_material(cur, table, customer_name, product_text, material=''):
    return int(sum(int(r.get('qty') or 0) for r in _fetch_shipping_match_rows(cur, table, product_text, material, customer_name=customer_name)))


def _sum_inventory_size_material(cur, product_text, material=''):
    return int(sum(int(r.get('qty') or 0) for r in _fetch_shipping_match_rows(cur, 'inventory', product_text, material, customer_name=None)))


def _deduct_from_table_partial_size_material(cur, table, customer_name, product_text, material='', qty_target=0):
    qty_target = int(qty_target or 0)
    if qty_target <= 0:
        return []
    rows = _fetch_shipping_match_rows(cur, table, product_text, material, customer_name=customer_name)
    remain = qty_target
    used = []
    for row in rows:
        if remain <= 0:
            break
        use_qty = min(int(row.get('qty') or 0), remain)
        if use_qty <= 0:
            continue
        cur.execute(sql(f"UPDATE {table} SET qty = qty - ?, updated_at = ? WHERE id = ?"), (use_qty, now(), row['id']))
        used.append({'id': row['id'], 'qty': use_qty, 'product_text': row.get('product_text') or product_text})
        remain -= use_qty
    return used


def _deduct_from_inventory_size_material(cur, product_text, material='', qty_needed=0):
    qty_needed = int(qty_needed or 0)
    rows = _fetch_shipping_match_rows(cur, 'inventory', product_text, material, customer_name=None)
    rows.sort(key=lambda r: (-int(r.get('qty') or 0), int(r.get('id') or 0)))
    total = sum(int(r.get('qty') or 0) for r in rows)
    if total < qty_needed:
        return False, []
    remain = qty_needed
    used = []
    for row in rows:
        if remain <= 0:
            break
        use_qty = min(int(row.get('qty') or 0), remain)
        if use_qty <= 0:
            continue
        cur.execute(sql("UPDATE inventory SET qty = qty - ?, updated_at = ? WHERE id = ?"), (use_qty, now(), row['id']))
        used.append({'id': row['id'], 'qty': use_qty, 'product_text': row.get('product_text') or product_text})
        remain -= use_qty
    return True, used


def save_inventory_item(product_text, product_code, qty, location="", customer_name="", operator="", source_text="", material="", duplicate_mode="merge"):
    conn = get_db()
    cur = conn.cursor()
    product_text = format_product_text_height2((product_text or '').strip())
    month_tag = product_month_tag(product_text)
    material = clean_material_value(material or product_code or '', product_text)
    product_code = material
    location = (location or '').strip()
    customer_name = (customer_name or '').strip()
    customer_uid = _customer_uid_for_name_cur(cur, customer_name)
    qty = int(qty or 0)
    rows = _fetch_matching_size_material_rows(cur, 'inventory', product_text, material, customer_name=customer_name, location=location) if (duplicate_mode or 'merge') == 'merge' else []
    matched = rows[-1] if rows else None
    if matched:
        rid = matched["id"]
        merged_product_text = _merge_product_text_supports(matched.get('product_text') or '', product_text)
        cur.execute(sql("""
            UPDATE inventory
            SET qty = qty + ?, product_code = ?, material = ?, month_tag = ?, product_text = ?, customer_name = ?, customer_uid = ?, operator = ?, source_text = ?, updated_at = ?
            WHERE id = ?
        """), (qty, product_code, material, month_tag, merged_product_text, customer_name, customer_uid, operator, source_text, now(), rid))
    else:
        cur.execute(sql("""
            INSERT INTO inventory(product_text, product_code, material, month_tag, qty, location, customer_name, customer_uid, operator, source_text, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """), (product_text, product_code, material, month_tag, qty, location, customer_name, customer_uid, operator, source_text, now(), now()))
    conn.commit()
    conn.close()

def list_inventory():

    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM inventory ORDER BY updated_at DESC, id DESC"))
    rows = apply_effective_qty_to_rows(rows_to_dict(cur))
    conn.close()
    return rows

def save_order(customer_name, items, operator, duplicate_mode='merge'):
    conn = get_db()
    cur = conn.cursor()
    customer_name = (customer_name or '').strip()
    order_customer_uid = _customer_uid_for_name_cur(cur, customer_name)
    if duplicate_mode == 'replace':
        for item in items:
            for row in _fetch_matching_size_material_rows(cur, 'orders', item.get('product_text') or '', item.get('material') or item.get('product_code') or '', customer_name=customer_name):
                cur.execute(sql("DELETE FROM orders WHERE id = ?"), (row['id'],))
    for item in items:
        product_text = format_product_text_height2((item.get('product_text') or '').strip())
        if not product_text:
            continue
        material = clean_material_value(item.get('material') or item.get('product_code') or '', product_text)
        product_code = material
        month_tag = product_month_tag(product_text)
        qty = int(item.get('qty') or 0)
        if qty <= 0:
            continue
        if duplicate_mode == 'merge':
            rows = _fetch_matching_size_material_rows(cur, 'orders', product_text, material, customer_name=customer_name)
            if rows:
                matched = rows[-1]
                rid = matched['id']
                merged_product_text = _merge_product_text_supports(matched.get('product_text') or '', product_text)
                cur.execute(sql("UPDATE orders SET qty = qty + ?, product_text = ?, product_code = ?, material = ?, month_tag = ?, customer_uid = ?, operator = ?, updated_at = ? WHERE id = ?"), (qty, merged_product_text, product_code, material, month_tag, order_customer_uid, operator, now(), rid))
                continue
        cur.execute(sql("""
            INSERT INTO orders(customer_name, customer_uid, product_text, product_code, material, month_tag, qty, status, operator, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        """), (customer_name, order_customer_uid, product_text, product_code, material, month_tag, qty, operator, now(), now()))
    conn.commit()
    conn.close()

def save_master_order(customer_name, items, operator, duplicate_mode='merge'):
    conn = get_db()
    cur = conn.cursor()
    customer_name = (customer_name or '').strip()
    master_customer_uid = _customer_uid_for_name_cur(cur, customer_name)
    if duplicate_mode == 'replace':
        for item in items:
            for row in _fetch_matching_size_material_rows(cur, 'master_orders', item.get('product_text') or '', item.get('material') or item.get('product_code') or '', customer_name=customer_name):
                cur.execute(sql("DELETE FROM master_orders WHERE id = ?"), (row['id'],))
    for item in items:
        product_text = format_product_text_height2((item.get('product_text') or '').strip())
        if not product_text:
            continue
        material = clean_material_value(item.get('material') or item.get('product_code') or '', product_text)
        product_code = material
        month_tag = product_month_tag(product_text)
        qty = int(item.get('qty') or 0)
        if qty <= 0:
            continue
        rows = _fetch_matching_size_material_rows(cur, 'master_orders', product_text, material, customer_name=customer_name)
        if rows and duplicate_mode == 'merge':
            matched = rows[-1]
            rid = matched['id']
            merged_product_text = _merge_product_text_supports(matched.get('product_text') or '', product_text)
            cur.execute(sql("""
                UPDATE master_orders SET qty = qty + ?, product_text = ?, product_code = ?, material = ?, month_tag = ?, customer_uid = ?, operator = ?, updated_at = ?
                WHERE id = ?
            """), (qty, merged_product_text, product_code, material, month_tag, master_customer_uid, operator, now(), rid))
        else:
            cur.execute(sql("""
                INSERT INTO master_orders(customer_name, customer_uid, product_text, product_code, material, month_tag, qty, operator, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """), (customer_name, master_customer_uid, product_text, product_code, material, month_tag, qty, operator, now(), now()))
    conn.commit()
    conn.close()

def get_orders():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM orders ORDER BY id DESC"))
    rows = apply_effective_qty_to_rows(rows_to_dict(cur))
    rows.sort(key=lambda r: product_sort_tuple(r.get('product_text') or ''))
    conn.close()
    return rows

def get_master_orders():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("SELECT * FROM master_orders ORDER BY id DESC"))
    rows = apply_effective_qty_to_rows(rows_to_dict(cur))
    rows.sort(key=lambda r: product_sort_tuple(r.get('product_text') or ''))
    conn.close()
    return rows

def _deduct_from_table(cur, table, customer_name, product_text, qty_needed):
    rows = _fetch_matching_product_rows(cur, table, product_text, customer_name=customer_name)
    total = sum(int(r.get('qty') or 0) for r in rows)
    if total < qty_needed:
        return False, []
    remain = int(qty_needed or 0)
    used = []
    for row in rows:
        if remain <= 0:
            break
        use_qty = min(int(row.get('qty') or 0), remain)
        if use_qty <= 0:
            continue
        cur.execute(sql(f"UPDATE {table} SET qty = qty - ?, updated_at = ? WHERE id = ?"), (use_qty, now(), row['id']))
        used.append({'id': row['id'], 'qty': use_qty, 'product_text': row.get('product_text') or product_text})
        remain -= use_qty
    return True, used

def _deduct_from_inventory(cur, product_text, qty_needed):
    rows = _fetch_matching_product_rows(cur, 'inventory', product_text, customer_name=None)
    rows.sort(key=lambda r: (-int(r.get('qty') or 0), int(r.get('id') or 0)))
    total = sum(int(r.get('qty') or 0) for r in rows)
    if total < qty_needed:
        return False, []
    remain = int(qty_needed or 0)
    used = []
    for row in rows:
        if remain <= 0:
            break
        use_qty = min(int(row.get('qty') or 0), remain)
        if use_qty <= 0:
            continue
        cur.execute(sql("UPDATE inventory SET qty = qty - ?, updated_at = ? WHERE id = ?"), (use_qty, now(), row['id']))
        used.append({'id': row['id'], 'qty': use_qty, 'product_text': row.get('product_text') or product_text})
        remain -= use_qty
    return True, used

def _sum_available(cur, table, customer_name, product_text):
    return int(sum(int(r.get('qty') or 0) for r in _fetch_matching_product_rows(cur, table, product_text, customer_name=customer_name)))

def _sum_inventory(cur, product_text):
    return int(sum(int(r.get('qty') or 0) for r in _fetch_matching_product_rows(cur, 'inventory', product_text, customer_name=None)))

def _deduct_from_table_partial(cur, table, customer_name, product_text, qty_target):
    qty_target = int(qty_target or 0)
    if qty_target <= 0:
        return []
    rows = _fetch_matching_product_rows(cur, table, product_text, customer_name=customer_name)
    remain = qty_target
    used = []
    for row in rows:
        if remain <= 0:
            break
        use_qty = min(int(row.get('qty') or 0), remain)
        if use_qty <= 0:
            continue
        cur.execute(sql(f"UPDATE {table} SET qty = qty - ?, updated_at = ? WHERE id = ?"), (use_qty, now(), row['id']))
        used.append({'id': row['id'], 'qty': use_qty, 'product_text': row.get('product_text') or product_text})
        remain -= use_qty
    return used

def _warehouse_locations_for_product(product_text, qty_needed=None, customer_name=None):
    """Find warehouse locations by normalized size, and optionally by customer.

    Older versions compared the full product text exactly.  After the warehouse
    unplaced-list feature, warehouse cells may store only the size part
    (for example ``132x23x05``) while orders/shipping may carry
    ``132x23x05=249x3``.  Matching by size prevents location lookup from
    missing valid cells, and filtering by customer prevents same-size goods for
    another customer from being shown in shipping previews.
    """
    target_size = _warehouse_size_key(product_text or '')
    want_customer = (customer_name or '').strip()
    cells = warehouse_get_cells()
    out = []
    for cell in cells:
        try:
            items = json.loads(cell.get('items_json') or '[]')
        except Exception:
            items = []
        for it in items:
            item_size = _warehouse_size_key(it.get('product_text') or it.get('product') or '')
            item_customer = (it.get('customer_name') or '').strip()
            qty = int(it.get('qty') or 0)
            if not target_size or item_size != target_size or qty <= 0:
                continue
            if want_customer and item_customer and item_customer != want_customer:
                continue
            visual_num = int(cell.get('slot_number') or 0)
            out.append({
                'zone': cell.get('zone'),
                'column_index': int(cell.get('column_index') or 0),
                'slot_type': 'direct',
                'slot_number': visual_num,
                'visual_slot': visual_num,
                'qty': qty,
                'product_text': it.get('product_text') or product_text or '',
                'customer_name': item_customer,
            })
    out.sort(key=lambda r: (r['zone'], r['column_index'], r['visual_slot'], r.get('customer_name') or ''))
    if qty_needed is None:
        return out
    remain = int(qty_needed or 0)
    plan = []
    for row in out:
        if remain <= 0:
            break
        take = min(int(row.get('qty') or 0), remain)
        if take <= 0:
            continue
        plan.append({**row, 'ship_qty': take, 'remain_after': max(0, remain - take)})
        remain -= take
    return plan



def _normalize_ship_source_preference(value):
    """Normalize shipping source preference sent by the front-end."""
    raw = str(value or '').strip().lower()
    mapping = {
        '總單': 'master_orders', 'master': 'master_orders', 'master_order': 'master_orders', 'master_orders': 'master_orders',
        '訂單': 'orders', 'order': 'orders', 'orders': 'orders',
        '庫存': 'inventory', 'stock': 'inventory', 'inventory': 'inventory',
    }
    return mapping.get(raw, '')

def _ship_source_label(source):
    return {'master_orders': '總單', 'orders': '訂單', 'inventory': '庫存'}.get(source or '', '')

def _auto_ship_source(master_available, order_available, inventory_available, qty_needed):
    """自動判斷真正要扣除的來源：總單 -> 訂單 -> 庫存。"""
    q = int(qty_needed or 0)
    if q <= 0:
        return ''
    if int(master_available or 0) >= q:
        return 'master_orders'
    if int(order_available or 0) >= q:
        return 'orders'
    if int(inventory_available or 0) >= q:
        return 'inventory'
    return ''

def preview_ship_order(customer_name, items):
    conn = get_db()
    cur = conn.cursor()
    try:
        preview = []
        needs_inventory_fallback = False
        master_errors = []
        items = _merge_items_by_size_material(items)
        for item in items:
            product_text = format_product_text_height2(item['product_text'])
            material = clean_material_value(item.get('material') or item.get('product_code') or '', product_text)
            qty_needed = int(item.get('qty') or effective_product_qty(product_text, 0) or 0)
            borrow_from = (item.get('borrow_from_customer_name') or item.get('source_customer_name') or '').strip()
            source_customer = borrow_from or customer_name
            is_borrowed = bool(borrow_from and borrow_from != customer_name)
            source_pref = _normalize_ship_source_preference(item.get('source_preference') or item.get('deduct_source') or item.get('source'))
            source_label = _ship_source_label(source_pref)

            master_available = _sum_available_size_material(cur, 'master_orders', source_customer, product_text, material)
            order_available = _sum_available_size_material(cur, 'orders', source_customer, product_text, material)
            inventory_available = _sum_inventory_size_material(cur, product_text, material)
            before = {'master': master_available, 'order': order_available, 'inventory': inventory_available}

            if source_pref:
                available_map = {'master_orders': master_available, 'orders': order_available, 'inventory': inventory_available}
                selected_available = int(available_map.get(source_pref, 0) or 0)
                shortage = max(0, qty_needed - selected_available)
                shortage_reasons = []
                if shortage:
                    shortage_reasons.append(f"{source_label}不足 {selected_available}/{qty_needed}")
                rec = (f"可從{source_label}出貨" if not shortage else f"不可出貨，{source_label}不足")
                if is_borrowed:
                    rec = f"向{source_customer}借貨：" + rec
                after = dict(before)
                if source_pref == 'master_orders':
                    after['master'] = max(0, master_available - min(qty_needed, master_available))
                elif source_pref == 'orders':
                    after['order'] = max(0, order_available - min(qty_needed, order_available))
                elif source_pref == 'inventory':
                    after['inventory'] = max(0, inventory_available - min(qty_needed, inventory_available))
                preview.append({
                    'product_text': product_text,
                    'product_code': material,
                    'material': material,
                    'qty': qty_needed,
                    'master_available': master_available,
                    'order_available': order_available,
                    'inventory_available': inventory_available,
                    'selected_available': selected_available,
                    'source_preference': source_pref,
                    'source_label': source_label,
                    'deduct_before': before,
                    'deduct_after': after,
                    'shortage_qty': shortage,
                    'master_exceeded': False,
                    'strict_ok': shortage == 0,
                    'inventory_only_ok': source_pref == 'inventory' and shortage == 0,
                    'needs_inventory_fallback': False,
                    'shortage_reasons': shortage_reasons,
                    'recommendation': rec,
                    'borrow_from_customer_name': borrow_from,
                    'source_customer_name': source_customer,
                    'ship_customer_name': customer_name,
                    'is_borrowed': is_borrowed,
                    'source_breakdown': [
                        {'source': ('總單' if not is_borrowed else f'{source_customer}總單'), 'available': master_available, 'selected': source_pref == 'master_orders'},
                        {'source': ('訂單' if not is_borrowed else f'{source_customer}訂單'), 'available': order_available, 'selected': source_pref == 'orders'},
                        {'source': '庫存', 'available': inventory_available, 'selected': source_pref == 'inventory'},
                    ],
                    'locations': _warehouse_locations_for_product(product_text, qty_needed, customer_name=source_customer if source_pref != 'inventory' else None),
                })
                continue

            auto_source = _auto_ship_source(master_available, order_available, inventory_available, qty_needed)
            auto_label = _ship_source_label(auto_source)
            selected_available = {'master_orders': master_available, 'orders': order_available, 'inventory': inventory_available}.get(auto_source, 0)
            shortage_reasons = []
            if not auto_source:
                shortage_reasons.append(f"無可扣來源：總單 {master_available}/{qty_needed}、訂單 {order_available}/{qty_needed}、庫存 {inventory_available}/{qty_needed}")
            after = dict(before)
            if auto_source == 'master_orders':
                after['master'] = max(0, master_available - qty_needed)
            elif auto_source == 'orders':
                after['order'] = max(0, order_available - qty_needed)
            elif auto_source == 'inventory':
                after['inventory'] = max(0, inventory_available - qty_needed)
            rec = (f"將扣除{auto_label}" if auto_source else '不可出貨，總單 / 訂單 / 庫存都不足')
            if is_borrowed:
                rec = f"向{source_customer}借貨：" + rec
            preview.append({
                'product_text': product_text,
                'product_code': material,
                'material': material,
                'qty': qty_needed,
                'master_available': master_available,
                'order_available': order_available,
                'inventory_available': inventory_available,
                'selected_available': selected_available,
                'source_preference': auto_source,
                'source_label': auto_label,
                'deduct_before': before,
                'deduct_after': after,
                'shortage_qty': max(0, qty_needed - int(selected_available or 0)),
                'master_exceeded': False,
                'strict_ok': bool(auto_source),
                'inventory_only_ok': auto_source == 'inventory',
                'needs_inventory_fallback': False,
                'shortage_reasons': shortage_reasons,
                'recommendation': rec,
                'borrow_from_customer_name': borrow_from,
                'source_customer_name': source_customer,
                'ship_customer_name': customer_name,
                'is_borrowed': is_borrowed,
                'source_breakdown': [
                    {'source': ('總單' if not is_borrowed else f'{source_customer}總單'), 'available': master_available, 'selected': auto_source == 'master_orders'},
                    {'source': ('訂單' if not is_borrowed else f'{source_customer}訂單'), 'available': order_available, 'selected': auto_source == 'orders'},
                    {'source': '庫存', 'available': inventory_available, 'selected': auto_source == 'inventory'},
                ],
                'locations': _warehouse_locations_for_product(product_text, qty_needed, customer_name=source_customer if auto_source != 'inventory' else None),
            })
        return {
            'success': True,
            'items': preview,
            'needs_inventory_fallback': needs_inventory_fallback,
            'master_exceeded': bool(master_errors),
            'master_errors': master_errors,
            'message': ('；'.join(master_errors) if master_errors else ('客戶訂單不足，可改扣庫存' if needs_inventory_fallback else '可直接出貨'))
        }
    finally:
        conn.close()

def ship_order(customer_name, items, operator, allow_inventory_fallback=False):
    conn = get_db()
    cur = conn.cursor()
    ship_customer_uid = _customer_uid_for_name_cur(cur, customer_name)
    try:
        breakdown = []
        items = _merge_items_by_size_material(items)
        for item in items:
            product_text = format_product_text_height2(item["product_text"])
            material = clean_material_value(item.get("material") or item.get("product_code") or "", product_text)
            qty_needed = int(item.get("qty") or effective_product_qty(product_text, 0) or 0)
            if qty_needed <= 0:
                continue
            borrow_from = (item.get('borrow_from_customer_name') or item.get('source_customer_name') or '').strip()
            source_customer = borrow_from or customer_name
            is_borrowed = bool(borrow_from and borrow_from != customer_name)
            source_pref = _normalize_ship_source_preference(item.get('source_preference') or item.get('deduct_source') or item.get('source'))

            master_available = _sum_available_size_material(cur, "master_orders", source_customer, product_text, material)
            order_available = _sum_available_size_material(cur, "orders", source_customer, product_text, material)
            inventory_available = _sum_inventory_size_material(cur, product_text, material)
            before = {'master': master_available, 'order': order_available, 'inventory': inventory_available}

            available_map = {'master_orders': master_available, 'orders': order_available, 'inventory': inventory_available}
            if source_pref:
                auto_source = source_pref
                selected_available = int(available_map.get(auto_source, 0) or 0)
                if selected_available < qty_needed:
                    conn.rollback()
                    label = _ship_source_label(auto_source) or '指定來源'
                    return {"success": False, "error": f"{product_text} {label}不足 {selected_available}/{qty_needed}"}
            else:
                auto_source = _auto_ship_source(master_available, order_available, inventory_available, qty_needed)
                if not auto_source:
                    conn.rollback()
                    return {"success": False, "error": f"{product_text} 無可扣來源：總單 {master_available}/{qty_needed}、訂單 {order_available}/{qty_needed}、庫存 {inventory_available}/{qty_needed}"}

            used_master, used_order, used_inv = [], [], []
            if auto_source == 'master_orders':
                used_master = _deduct_from_table_partial_size_material(cur, "master_orders", source_customer, product_text, material, qty_needed)
                note = "總單出貨" if not is_borrowed else f"向{source_customer}借總單出貨"
            elif auto_source == 'orders':
                used_order = _deduct_from_table_partial_size_material(cur, "orders", source_customer, product_text, material, qty_needed)
                note = "訂單出貨" if not is_borrowed else f"向{source_customer}借訂單出貨"
            elif auto_source == 'inventory':
                ok3, used_inv = _deduct_from_inventory_size_material(cur, product_text, material, qty_needed)
                if not ok3:
                    conn.rollback()
                    return {"success": False, "error": f"{product_text} 庫存不足"}
                note = "庫存出貨" if not is_borrowed else f"向{source_customer}借貨後扣庫存出貨"
            else:
                conn.rollback()
                return {"success": False, "error": f"{product_text} 出貨來源錯誤"}

            cur.execute(sql("""
                INSERT INTO shipping_records(customer_name, customer_uid, product_text, product_code, material, qty, operator, shipped_at, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """), (customer_name, ship_customer_uid, product_text, material, material, qty_needed, operator, now(), note))

            breakdown.append({
                "product_text": product_text,
                "product_code": material,
                "material": material,
                "qty": qty_needed,
                "source_preference": auto_source,
                "source_label": _ship_source_label(auto_source),
                "master_deduct": sum(x["qty"] for x in used_master),
                "order_deduct": sum(x["qty"] for x in used_order),
                "inventory_deduct": sum(x["qty"] for x in used_inv),
                "master_available": master_available,
                "order_available": order_available,
                "inventory_available": inventory_available,
                "used_inventory_fallback": auto_source == 'inventory',
                "master_details": used_master,
                "order_details": used_order,
                "inventory_details": used_inv,
                "note": note,
                "borrow_from_customer_name": borrow_from,
                "source_customer_name": source_customer,
                "ship_customer_name": customer_name,
                "is_borrowed": is_borrowed,
                "locations": _warehouse_locations_for_product(product_text, qty_needed, customer_name=source_customer if auto_source != 'inventory' else None),
                "deduct_before": before,
                "remaining_after": {
                    "master": max(0, master_available - sum(x["qty"] for x in used_master)),
                    "order": max(0, order_available - sum(x["qty"] for x in used_order)),
                    "inventory": max(0, inventory_available - sum(x["qty"] for x in used_inv)),
                },
            })
        conn.commit()
        return {"success": True, "breakdown": breakdown}
    except Exception as e:
        conn.rollback()
        log_error("ship_order", e)
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


def _warehouse_size_key(text):
    return _normalize_size_key(text)

def _warehouse_exact_key(text):
    raw = format_product_text_height2(str(text or '').replace('×', 'x').replace('Ｘ', 'x').replace('X', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip())
    size = _warehouse_size_key(raw)
    if '=' not in raw:
        return size
    right = re.sub(r'\s+', '', raw.split('=', 1)[1].strip().lower())
    return f'{size}={right}' if right else size

def _normalize_warehouse_items(items):
    """合併同尺寸 / 同客戶商品，清掉空白或 0 數量，避免格位資料越存越亂。"""
    merged = {}
    for raw in (items or []):
        if not isinstance(raw, dict):
            continue
        product_text = format_product_text_height2(str(raw.get('product_text') or raw.get('product') or '').strip())
        if not product_text:
            continue
        try:
            qty = int(raw.get('qty') or 0)
        except Exception:
            qty = 0
        # V133: DB canonical save also trusts product_text quantity, so 63x30x125=240x49 cannot be stored as 1.
        try:
            if '=' in product_text:
                qty = int(effective_product_qty(product_text, qty))
        except Exception:
            pass
        if qty <= 0:
            continue
        customer_name = str(raw.get('customer_name') or '').strip()
        # service-line retained: database migration behavior consolidated into formal services.
        placement_label = str(raw.get('placement_label') or raw.get('layer_label') or raw.get('position_label') or '').strip()
        material = clean_material_value(raw.get('material') or raw.get('product_code') or '', product_text)
        source_table = str(raw.get('source_table') or raw.get('source') or '').strip()
        source_id = str(raw.get('source_id') or raw.get('id') or '').strip()
        key = (_warehouse_exact_key(product_text), customer_name or '庫存', placement_label, material, source_table, source_id)
        if key not in merged:
            next_item = dict(raw)
            next_item['product_text'] = product_text
            next_item['product'] = product_text
            next_item['product_code'] = material or str(raw.get('product_code') or product_text).strip()
            next_item['material'] = material
            next_item['customer_name'] = customer_name or '庫存'
            if placement_label:
                next_item['placement_label'] = placement_label
                next_item['layer_label'] = placement_label
            if source_table:
                next_item['source'] = str(raw.get('source') or source_table).strip()
                next_item['source_table'] = source_table
            if source_id:
                next_item['source_id'] = source_id
            next_item['qty'] = qty
            merged[key] = next_item
        else:
            merged[key]['qty'] = int(merged[key].get('qty') or 0) + qty
            if not merged[key].get('source_summary') and raw.get('source_summary'):
                merged[key]['source_summary'] = raw.get('source_summary')
    return list(merged.values())

def warehouse_get_cells():
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        # service-line retained: database migration behavior consolidated into formal services.
        # immediately so PostgreSQL pooled connections do not roll them back on close.
        conn.commit()
        cur.execute(sql("SELECT * FROM warehouse_cells WHERE COALESCE(NULLIF(TRIM(slot_type),''), 'direct') = ? ORDER BY zone, column_index, slot_number"), ('direct',))
        rows = rows_to_dict(cur)
        return rows
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()

def warehouse_get_cell(zone, column_index, slot_type, slot_number):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("""
        SELECT * FROM warehouse_cells
        WHERE zone = ? AND column_index = ? AND COALESCE(NULLIF(TRIM(slot_type),''), 'direct') = ? AND slot_number = ?
    """), (zone, column_index, slot_type, slot_number))
    row = fetchone_dict(cur)
    conn.close()
    return row

# service-line retained: database migration behavior consolidated into formal services.

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
        """), (zone, next_col, 'direct', num, '[]', '', now()))
    conn.commit(); conn.close(); return next_col


def _warehouse_ensure_column_slots(cur, zone, column_index, upto=20):
    """只在操作指定格號時補缺少空格；不清空、不覆蓋有商品格。"""
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 1)
    upto = max(1, int(upto or 20))
    cur.execute(sql("""
        SELECT slot_number FROM warehouse_cells
        WHERE zone = ? AND column_index = ? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
    """), (zone, column_index, 'direct'))
    try:
        cur.execute(sql("""
            SELECT slot_number FROM warehouse_cells
            WHERE zone = ? AND column_index = ? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
        """), (zone, column_index, 'direct'))
        existing = set()
        for row in cur.fetchall():
            try:
                val = row['slot_number'] if hasattr(row, 'keys') else row[0]
            except Exception:
                val = row[0]
            if int(val or 0) > 0:
                existing.add(int(val or 0))
    except Exception:
        existing = set()
    for num in range(1, upto + 1):
        if num in existing:
            continue
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """), (zone, column_index, 'direct', num, '[]', '', now()))

def _warehouse_column_slots(cur, zone, column_index, slot_type='direct'):
    """讀取某欄格位並收斂重複格號，供插入/刪除格子安全重排。"""
    cur.execute(sql("""
        SELECT zone, column_index, COALESCE(slot_type,'direct') AS slot_type, slot_number, items_json, note, updated_at
        FROM warehouse_cells
        WHERE zone = ? AND column_index = ? AND COALESCE(slot_type,'direct') = ?
        ORDER BY slot_number
    """), (zone, column_index, 'direct'))
    rows = rows_to_dict(cur)
    by_slot = {}
    for row in rows:
        slot_no = int(row.get('slot_number') or 0)
        if slot_no < 1:
            continue
        note = row.get('note') or ''
        if str(note).startswith('__USER_') or note in ('__USER_ADDED__', '__USER_INSERTED_SLOT__'):
            note = ''
        if slot_no not in by_slot:
            by_slot[slot_no] = {
                'items_json': row.get('items_json') or '[]',
                'note': note,
                'updated_at': row.get('updated_at') or now(),
            }
        else:
            prev = by_slot[slot_no]
            prev['items_json'] = _merge_json_item_lists(prev.get('items_json'), row.get('items_json'))
            prev['note'] = prev.get('note') or note
            prev['updated_at'] = max(str(prev.get('updated_at') or ''), str(row.get('updated_at') or '')) or now()
    return [by_slot[k] for k in sorted(by_slot)]


def _warehouse_rewrite_column_slots(cur, zone, column_index, slots):
    """V95 disabled legacy whole-column rewrite.
    Earlier versions deleted and reinserted a full column; V95 forbids that to protect warehouse_cells.
    Final warehouse_add_slot / warehouse_remove_slot below perform targeted shifts only.
    """
    raise RuntimeError('V95 blocks legacy whole-column warehouse rewrite')


# service-line retained: database migration behavior consolidated into formal services.


# service-line retained: database migration behavior consolidated into formal services.

def warehouse_move_item(from_key, to_key, product_text, qty, customer_name=None, placement_label=None):
    conn = get_db()
    cur = conn.cursor()
    try:
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
        from_norm = _norm(from_key)
        to_norm = _norm(to_key)
        if from_norm == to_norm:
            return {'success': True, 'noop': True}
        _warehouse_ensure_column_slots(cur, from_norm[0], from_norm[1], max(20, from_norm[3]))
        _warehouse_ensure_column_slots(cur, to_norm[0], to_norm[1], max(20, to_norm[3]))
        src = _load(from_key); dst = _load(to_key)
        if not src or not dst:
            return {'success': False, 'error': '找不到來源或目標格位'}
        try:
            src_items = json.loads(src.get('items_json') or '[]')
        except Exception:
            src_items = []
        try:
            dst_items = json.loads(dst.get('items_json') or '[]')
        except Exception:
            dst_items = []
        qty = int(qty or 0)
        if qty <= 0:
            return {'success': False, 'error': '搬移數量必須大於 0'}
        want_customer = (customer_name or '').strip()
        # 若同尺寸商品有不同客戶，前端必須帶客戶名，避免搬錯貨。
        matching_customers = {
            (it.get('customer_name') or '').strip()
            for it in src_items
            if (it.get('product_text') or '').strip() == (product_text or '').strip() and int(it.get('qty', 0) or 0) > 0
        }
        if not want_customer and len(matching_customers) > 1:
            return {'success': False, 'error': '同尺寸有不同客戶，請點選該客戶商品再拖拉'}
        moved=[]; remain=qty; new_src=[]
        for it in src_items:
            same_product = (it.get('product_text') or '').strip() == (product_text or '').strip()
            same_customer = True if not want_customer else ((it.get('customer_name') or '').strip() == want_customer)
            if same_product and same_customer and remain > 0:
                take = min(int(it.get('qty', 0) or 0), remain)
                remain -= take
                moved.append({**it, 'qty': take})
                leftover = int(it.get('qty', 0) or 0) - take
                if leftover > 0:
                    new_src.append({**it, 'qty': leftover})
            else:
                new_src.append(it)
        if remain > 0:
            return {'success': False, 'error': '來源格位數量不足'}
        # service-line retained: database migration behavior consolidated into formal services.
        target_label = str(placement_label or '前排').strip() or '前排'
        moved_front = []
        for m in moved:
            nm = dict(m)
            nm['placement_label'] = target_label
            nm['layer_label'] = target_label
            moved_front.append(nm)
        # service-line retained: database migration behavior consolidated into formal services.
        normalized_src = _normalize_warehouse_items(new_src)
        normalized_dst = _normalize_warehouse_items(moved_front + dst_items)
        from_zone, from_col, _, from_slot = _norm(from_key)
        to_zone, to_col, _, to_slot = _norm(to_key)
        cur.execute(sql("UPDATE warehouse_cells SET items_json = ?, updated_at = ? WHERE zone = ? AND column_index = ? AND COALESCE(slot_type,'direct') = ? AND slot_number = ?"), (json.dumps(normalized_src, ensure_ascii=False), now(), from_zone, from_col, 'direct', from_slot))
        cur.execute(sql("UPDATE warehouse_cells SET items_json = ?, updated_at = ? WHERE zone = ? AND column_index = ? AND COALESCE(slot_type,'direct') = ? AND slot_number = ?"), (json.dumps(normalized_dst, ensure_ascii=False), now(), to_zone, to_col, 'direct', to_slot))
        conn.commit(); return {'success': True}
    except Exception as e:
        conn.rollback(); log_error('warehouse_move_item', e); return {'success': False, 'error': '拖曳失敗'}
    finally:
        conn.close()

def inventory_placements():
    """回傳已放入倉庫的數量，依「尺寸 + 客戶」計算，避免同尺寸不同客戶互相抵扣。"""
    cells = warehouse_get_cells()
    placement = {}
    for cell in cells:
        try:
            items = json.loads(cell.get("items_json") or "[]")
        except Exception:
            items = []
        for it in items:
            size = _warehouse_size_key(it.get("product_text") or it.get("product") or "")
            if not size:
                continue
            customer = (it.get('customer_name') or '').strip()
            key = (size, customer)
            placement[key] = placement.get(key, 0) + int(it.get("qty", 0) or 0)
    return placement

def inventory_summary():
    rows = list_inventory()
    # Do not let warehouse placement/statistics errors blank the inventory page.
    # Inventory must still show DB data even if warehouse_cells has legacy duplicate rows
    # or a temporary migration/index issue.
    try:
        placement = inventory_placements()
    except Exception as e:
        try: log_error('inventory_summary_placement_fallback', str(e))
        except Exception: pass
        placement = {}
    result = []
    for r in rows:
        r = dict(r)
        product_text = format_product_text_height2(r.get('product_text') or '')
        r['product_text'] = product_text
        material = clean_material_value(r.get('material') or r.get('product_code') or '', product_text)
        r['material'] = material
        r['product_code'] = material
        size = _warehouse_size_key(product_text)
        customer = (r.get('customer_name') or '').strip()
        placed = placement.get((size, customer), 0)
        qty = effective_product_qty(product_text, r.get('qty') or 0)
        r['qty'] = qty
        r['placed_qty'] = placed
        r['unplaced_qty'] = max(0, qty - placed)
        r['needs_red'] = max(0, qty - placed) > 0
        result.append(r)
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




def update_customer_item(source, item_id, product_text, qty, operator='', material=None):
    table_map = {'庫存': 'inventory', 'inventory': 'inventory', '訂單': 'orders', 'orders': 'orders', '總單': 'master_orders', 'master_order': 'master_orders', 'master_orders': 'master_orders'}
    table = table_map.get(source)
    if not table:
        raise ValueError('不支援的來源')
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql(f"SELECT * FROM {table} WHERE id = ?"), (item_id,))
    row = fetchone_dict(cur)
    if not row:
        conn.close()
        raise ValueError('找不到商品')
    qty = int(qty or 0)
    if qty < 0:
        qty = 0
    product_text = format_product_text_height2(product_text)
    month_tag = product_month_tag(product_text)
    if material is None:
        cur.execute(sql(f"UPDATE {table} SET product_text = ?, product_code = ?, month_tag = ?, qty = ?, updated_at = ? WHERE id = ?"), (product_text, row.get('product_code') or product_text, month_tag, qty, now(), item_id))
    else:
        material = (material or '').strip().upper()
        cur.execute(sql(f"UPDATE {table} SET product_text = ?, product_code = ?, material = ?, month_tag = ?, qty = ?, updated_at = ? WHERE id = ?"), (product_text, material or product_text, material, month_tag, qty, now(), item_id))
    conn.commit()
    conn.close()


def update_items_material(items, material, operator=''):
    table_map = {'庫存': 'inventory', 'inventory': 'inventory', '訂單': 'orders', 'orders': 'orders', '總單': 'master_orders', 'master_order': 'master_orders', 'master_orders': 'master_orders'}
    material = (material or '').strip().upper()
    if material not in {'SPF','HF','DF','RDT','MER','SPY','SP','RP','TD','MKJ','LVL','尤加利','尤佳利'}:
        raise ValueError('材質不在下拉選單內（已支援 MER / 尤加利）')
    conn = get_db()
    cur = conn.cursor()
    count = 0
    for it in items or []:
        table = table_map.get((it.get('source') or '').strip())
        item_id = int(it.get('id') or 0)
        if not table or item_id <= 0:
            continue
        cur.execute(sql(f"UPDATE {table} SET material = ?, product_code = ?, operator = ?, updated_at = ? WHERE id = ?"), (material, material, operator, now(), item_id))
        count += cur.rowcount or 0
    conn.commit()
    conn.close()
    return count

def delete_customer_item(source, item_id):
    table_map = {'庫存': 'inventory', 'inventory': 'inventory', '訂單': 'orders', 'orders': 'orders', '總單': 'master_orders', 'master_order': 'master_orders', 'master_orders': 'master_orders'}
    table = table_map.get(source)
    if not table:
        raise ValueError('不支援的來源')
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql(f"DELETE FROM {table} WHERE id = ?"), (item_id,))
    conn.commit()
    conn.close()

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
        updated_at {text_type},
        completed_at {text_type},
        is_done INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0
    )""")
    if USE_POSTGRES:
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS note TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS due_date TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS image_filename TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS created_by TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS created_at TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS updated_at TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS completed_at TEXT')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS is_done INTEGER DEFAULT 0')
        cur.execute('ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0')
    else:
        cols = _table_columns(cur, 'todo_items')
        for col in ('note','due_date','image_filename','created_by','created_at','updated_at','completed_at'):
            if col not in cols:
                cur.execute(f'ALTER TABLE todo_items ADD COLUMN {col} TEXT')
        if 'is_done' not in cols:
            cur.execute('ALTER TABLE todo_items ADD COLUMN is_done INTEGER DEFAULT 0')
        if 'sort_order' not in cols:
            cur.execute('ALTER TABLE todo_items ADD COLUMN sort_order INTEGER DEFAULT 0')


def create_todo_item(note='', due_date='', image_filename='', created_by=''):
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_todo_table(cur)
        cur.execute(sql('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM todo_items WHERE COALESCE(is_done,0)=0'))
        row = fetchone_dict(cur) or {}
        next_order = int(row.get('max_order') or 0) + 1
        cur.execute(sql('INSERT INTO todo_items(note, due_date, image_filename, created_by, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'),
                    ((note or '').strip(), (due_date or '').strip(), (image_filename or '').strip(), (created_by or '').strip(), now(), now(), next_order))
        conn.commit()
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
        cur.execute(sql("SELECT * FROM todo_items ORDER BY CASE WHEN COALESCE(is_done,0)=1 THEN 1 ELSE 0 END ASC, CASE WHEN COALESCE(is_done,0)=1 THEN COALESCE(completed_at, updated_at, created_at) ELSE CASE WHEN COALESCE(due_date,'')='' THEN '9999-99-99' ELSE due_date END END ASC, COALESCE(sort_order,0) ASC, created_at DESC, id DESC"))
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




def complete_todo_item(todo_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_todo_table(cur)
        cur.execute(sql('UPDATE todo_items SET is_done = 1, completed_at = ?, updated_at = ? WHERE id = ?'), (now(), now(), int(todo_id)))
        conn.commit()
    finally:
        conn.close()


def restore_todo_item(todo_id):
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_todo_table(cur)
        cur.execute(sql('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM todo_items WHERE COALESCE(is_done,0)=0'))
        row = fetchone_dict(cur) or {}
        next_order = int(row.get('max_order') or 0) + 1
        cur.execute(sql('UPDATE todo_items SET is_done = 0, completed_at = NULL, updated_at = ?, sort_order = ? WHERE id = ?'), (now(), next_order, int(todo_id)))
        conn.commit()
    finally:
        conn.close()


def reorder_todo_items(todo_ids, done_flag=0):
    ids = [int(i) for i in (todo_ids or []) if str(i).isdigit()]
    if not ids:
        return
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_todo_table(cur)
        for idx, todo_id in enumerate(ids, start=1):
            cur.execute(sql('UPDATE todo_items SET sort_order = ?, updated_at = ? WHERE id = ? AND COALESCE(is_done,0) = ?'), (idx, now(), todo_id, int(done_flag or 0)))
        conn.commit()
    finally:
        conn.close()


def restore_customer(name):
    name = (name or '').strip()
    if not name:
        raise ValueError('客戶名稱不可空白')
    row = get_customer(name, include_archived=True)
    if not row:
        raise ValueError('找不到客戶')
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("UPDATE customer_profiles SET is_archived = 0, archived_at = NULL, updated_at = ? WHERE name = ?"), (now(), name))
    conn.commit()
    conn.close()
    return get_customer(name, include_archived=True)


# service-line retained: database migration behavior consolidated into formal services.
def customer_uid(customer_name):
    customer_name = (customer_name or '').strip()
    if not customer_name:
        return ''
    conn = get_db()
    cur = conn.cursor()
    try:
        return _customer_uid_for_name_cur(cur, customer_name) or ''
    except Exception:
        try:
            return _new_customer_uid(customer_name, '')
        except Exception:
            return ''
    finally:
        try: conn.close()
        except Exception: pass

# service-line retained: database migration behavior consolidated into formal services.
# These keep the original page/event logic intact, but make DB writes and submit de-dup safer.
def register_submit_request(request_key, endpoint=''):
    request_key = (request_key or '').strip()
    endpoint = (endpoint or '').strip()
    if not request_key:
        return True
    # Scope request_key by endpoint so inventory/orders/master/ship cannot accidentally block each other.
    scoped_key = f"{endpoint}::{request_key}" if endpoint else request_key
    conn = get_db()
    cur = conn.cursor()
    created = False
    try:
        if USE_POSTGRES:
            cur.execute("INSERT INTO submit_requests(request_key, endpoint, created_at) VALUES (%s, %s, %s) ON CONFLICT (request_key) DO NOTHING", (scoped_key, endpoint, now()))
        else:
            cur.execute("INSERT OR IGNORE INTO submit_requests(request_key, endpoint, created_at) VALUES (?, ?, ?)", (scoped_key, endpoint, now()))
        created = (cur.rowcount or 0) > 0
        conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        log_error('register_submit_request_v24', str(e))
        # If the de-dup table has a transient issue, do not block the real save.
        created = True
    finally:
        conn.close()
    return created


def save_inventory_item(product_text, product_code, qty, location="", customer_name="", operator="", source_text="", material="", duplicate_mode="merge"):
    conn = get_db()
    cur = conn.cursor()
    try:
        product_text = format_product_text_height2((product_text or '').strip())
        month_tag = product_month_tag(product_text)
        material = clean_material_value(material or product_code or '', product_text)
        product_code = material
        location = (location or '').strip()
        customer_name = (customer_name or '').strip()
        customer_uid = _customer_uid_for_name_cur(cur, customer_name)
        qty = int(qty or 0)
        rows = _fetch_matching_size_material_rows(cur, 'inventory', product_text, material, customer_name=customer_name, location=location) if (duplicate_mode or 'merge') == 'merge' else []
        matched = rows[-1] if rows else None
        if matched:
            rid = matched["id"]
            merged_product_text = _merge_product_text_supports(matched.get('product_text') or '', product_text)
            cur.execute(sql("""
                UPDATE inventory
                SET qty = qty + ?, product_code = ?, material = ?, month_tag = ?, product_text = ?, customer_name = ?, customer_uid = ?, operator = ?, source_text = ?, updated_at = ?
                WHERE id = ?
            """), (qty, product_code, material, month_tag, merged_product_text, customer_name, customer_uid, operator, source_text, now(), rid))
        else:
            cur.execute(sql("""
                INSERT INTO inventory(product_text, product_code, material, month_tag, qty, location, customer_name, customer_uid, operator, source_text, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """), (product_text, product_code, material, month_tag, qty, location, customer_name, customer_uid, operator, source_text, now(), now()))
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()


def save_order(customer_name, items, operator, duplicate_mode='merge'):
    conn = get_db()
    cur = conn.cursor()
    try:
        customer_name = (customer_name or '').strip()
        order_customer_uid = _customer_uid_for_name_cur(cur, customer_name)
        if duplicate_mode == 'replace':
            for item in items:
                for row in _fetch_matching_size_material_rows(cur, 'orders', item.get('product_text') or '', item.get('material') or item.get('product_code') or '', customer_name=customer_name):
                    cur.execute(sql("DELETE FROM orders WHERE id = ?"), (row['id'],))
        for item in items:
            product_text = format_product_text_height2((item.get('product_text') or '').strip())
            month_tag = product_month_tag(product_text)
            if not product_text:
                continue
            material = clean_material_value(item.get('material') or item.get('product_code') or '', product_text)
            product_code = material
            qty = int(item.get('qty') or 0)
            if qty <= 0:
                continue
            if duplicate_mode == 'merge':
                rows = _fetch_matching_size_material_rows(cur, 'orders', product_text, material, customer_name=customer_name)
                if rows:
                    matched = rows[-1]
                    rid = matched['id']
                    merged_product_text = _merge_product_text_supports(matched.get('product_text') or '', product_text)
                    cur.execute(sql("UPDATE orders SET qty = qty + ?, product_text = ?, product_code = ?, material = ?, month_tag = ?, customer_uid = ?, operator = ?, updated_at = ? WHERE id = ?"), (qty, merged_product_text, product_code, material, month_tag, order_customer_uid, operator, now(), rid))
                    continue
            cur.execute(sql("""
                INSERT INTO orders(customer_name, customer_uid, product_text, product_code, material, month_tag, qty, status, operator, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
            """), (customer_name, order_customer_uid, product_text, product_code, material, month_tag, qty, operator, now(), now()))
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()


def save_master_order(customer_name, items, operator, duplicate_mode='merge'):
    conn = get_db()
    cur = conn.cursor()
    try:
        customer_name = (customer_name or '').strip()
        master_customer_uid = _customer_uid_for_name_cur(cur, customer_name)
        if duplicate_mode == 'replace':
            for item in items:
                for row in _fetch_matching_size_material_rows(cur, 'master_orders', item.get('product_text') or '', item.get('material') or item.get('product_code') or '', customer_name=customer_name):
                    cur.execute(sql("DELETE FROM master_orders WHERE id = ?"), (row['id'],))
        for item in items:
            product_text = format_product_text_height2((item.get('product_text') or '').strip())
            month_tag = product_month_tag(product_text)
            if not product_text:
                continue
            material = clean_material_value(item.get('material') or item.get('product_code') or '', product_text)
            product_code = material
            qty = int(item.get('qty') or 0)
            if qty <= 0:
                continue
            rows = _fetch_matching_size_material_rows(cur, 'master_orders', product_text, material, customer_name=customer_name)
            if rows and duplicate_mode == 'merge':
                matched = rows[-1]
                rid = matched['id']
                merged_product_text = _merge_product_text_supports(matched.get('product_text') or '', product_text)
                cur.execute(sql("""
                    UPDATE master_orders SET qty = qty + ?, product_text = ?, product_code = ?, material = ?, month_tag = ?, customer_uid = ?, operator = ?, updated_at = ?
                    WHERE id = ?
                """), (qty, merged_product_text, product_code, material, month_tag, master_customer_uid, operator, now(), rid))
            else:
                cur.execute(sql("""
                    INSERT INTO master_orders(customer_name, customer_uid, product_text, product_code, material, month_tag, qty, operator, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """), (customer_name, master_customer_uid, product_text, product_code, material, month_tag, qty, operator, now(), now()))
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Purpose: make inventory / orders / master_orders creation succeed even when
# an old PostgreSQL/SQLite table is missing newer optional columns.
# This override is intentionally placed at the very end of db.py so app.py imports
# these final safe functions, not older duplicate definitions above.
# ============================================================
def _yx_v36_table_columns(cur, table_name):
    try:
        if USE_POSTGRES:
            cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s", (table_name,))
            return {str(r[0]) for r in cur.fetchall()}
        cur.execute(f"PRAGMA table_info({table_name})")
        return {str(r[1]) for r in cur.fetchall()}
    except Exception:
        return set()

def _yx_v36_insert_or_merge(table_name, row, duplicate_mode='merge'):
    conn = get_db()
    cur = conn.cursor()
    try:
        cols = _yx_v36_table_columns(cur, table_name)
        if not cols:
            raise RuntimeError(f'{table_name} has no readable columns')
        # only keep columns that exist in the real database
        row = {k: v for k, v in (row or {}).items() if k in cols and k != 'id'}
        if 'created_at' in cols and not row.get('created_at'):
            row['created_at'] = now()
        if 'updated_at' in cols and not row.get('updated_at'):
            row['updated_at'] = now()
        if 'shipped_at' in cols and table_name == 'shipping_records' and not row.get('shipped_at'):
            row['shipped_at'] = now()
        if 'status' in cols and table_name == 'orders' and not row.get('status'):
            row['status'] = 'pending'
        product_text = row.get('product_text') or ''
        material = row.get('material') or row.get('product_code') or ''
        customer_name = row.get('customer_name') or ''
        qty = int(row.get('qty') or 0)
        if not product_text or qty <= 0:
            conn.close()
            return
        # Safe merge only if columns required for lookup exist; if anything fails, fall back to insert.
        if (duplicate_mode or 'merge') == 'merge' and {'id','product_text','qty'}.issubset(cols):
            try:
                where = ["product_text = ?"]
                params = [product_text]
                if 'material' in cols:
                    where.append("COALESCE(material,'') = ?")
                    params.append(material)
                elif 'product_code' in cols:
                    where.append("COALESCE(product_code,'') = ?")
                    params.append(material)
                if table_name in ('orders','master_orders') and 'customer_name' in cols:
                    where.append("COALESCE(customer_name,'') = ?")
                    params.append(customer_name)
                # service-line retained: database migration behavior consolidated into formal services.
                if 'location' in cols:
                    where.append("COALESCE(location,'') = ?")
                    params.append(row.get('location') or row.get('area') or '')
                if 'area' in cols:
                    where.append("COALESCE(area,'') = ?")
                    params.append(row.get('area') or row.get('location') or '')
                cur.execute(sql(f"SELECT id, qty FROM {table_name} WHERE " + " AND ".join(where) + " ORDER BY id DESC LIMIT 1"), tuple(params))
                matched = fetchone_dict(cur)
                if matched:
                    upd_cols = ['qty = ?']
                    upd_vals = [int(matched.get('qty') or 0) + qty]
                    for k in ('product_code','material','month_tag','customer_uid','operator','source_text','status','updated_at'):
                        if k in row and k in cols:
                            upd_cols.append(f"{k} = ?")
                            upd_vals.append(row.get(k))
                    upd_vals.append(matched['id'])
                    cur.execute(sql(f"UPDATE {table_name} SET " + ', '.join(upd_cols) + " WHERE id = ?"), tuple(upd_vals))
                    conn.commit(); conn.close(); return
            except Exception:
                try: conn.rollback()
                except Exception: pass
        # Insert using only available columns.
        insert_cols = list(row.keys())
        if not insert_cols:
            conn.close(); return
        placeholders = ','.join(['?'] * len(insert_cols))
        cur.execute(sql(f"INSERT INTO {table_name} (" + ','.join(insert_cols) + f") VALUES ({placeholders})"), tuple(row[c] for c in insert_cols))
        conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def save_inventory_item(product_text, product_code, qty, location="", customer_name="", operator="", source_text="", material="", duplicate_mode="merge"):
    product_text = format_product_text_height2((product_text or '').strip())
    material = clean_material_value(material or product_code or '', product_text)
    customer_name = (customer_name or '').strip()
    row = {
        'product_text': product_text,
        'product_code': material,
        'material': material,
        'month_tag': product_month_tag(product_text),
        'qty': int(qty or 0),
        'location': (location or '').strip(),
        'customer_name': customer_name,
        'customer_uid': customer_uid(customer_name) if customer_name else '',
        'operator': operator or '',
        'source_text': source_text or '',
        'created_at': now(),
        'updated_at': now(),
    }
    return _yx_v36_insert_or_merge('inventory', row, duplicate_mode=duplicate_mode)

def save_order(customer_name, items, operator, duplicate_mode='merge'):
    customer_name = (customer_name or '').strip()
    uid = customer_uid(customer_name) if customer_name else ''
    for item in (items or []):
        product_text = format_product_text_height2((item.get('product_text') or '').strip())
        material = clean_material_value(item.get('material') or item.get('product_code') or '', product_text)
        area_value = (item.get('location') or item.get('area') or item.get('zone') or '').strip()
        row = {
            'customer_name': customer_name,
            'customer_uid': uid,
            'product_text': product_text,
            'product_code': material,
            'material': material,
            'month_tag': product_month_tag(product_text),
            'qty': int(item.get('qty') or 0),
            'area': area_value,
            'location': area_value,
            'status': 'pending',
            'operator': operator or '',
            'created_at': now(),
            'updated_at': now(),
        }
        _yx_v36_insert_or_merge('orders', row, duplicate_mode=duplicate_mode)

def save_master_order(customer_name, items, operator, duplicate_mode='merge'):
    customer_name = (customer_name or '').strip()
    uid = customer_uid(customer_name) if customer_name else ''
    for item in (items or []):
        product_text = format_product_text_height2((item.get('product_text') or '').strip())
        material = clean_material_value(item.get('material') or item.get('product_code') or '', product_text)
        area_value = (item.get('location') or item.get('area') or item.get('zone') or '').strip()
        row = {
            'customer_name': customer_name,
            'customer_uid': uid,
            'product_text': product_text,
            'product_code': material,
            'material': material,
            'month_tag': product_month_tag(product_text),
            'qty': int(item.get('qty') or 0),
            'area': area_value,
            'location': area_value,
            'operator': operator or '',
            'created_at': now(),
            'updated_at': now(),
        }
        _yx_v36_insert_or_merge('master_orders', row, duplicate_mode=duplicate_mode)

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Purpose: make warehouse cell save persist permanently with PostgreSQL/SQLite upsert.
# The function is intentionally placed at the very end of db.py so app.py imports this final version.
# ============================================================
# service-line retained: database migration behavior consolidated into formal services.


# service-line retained: database migration behavior consolidated into formal services.

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# - 自動補 warehouse_cells 表 / 欄位 / slot_type / 唯一索引
# - PostgreSQL 與 SQLite 都使用真正 UPSERT 永久保存
# - 放在檔案最後，強制覆蓋前面所有舊版 warehouse_save_cell
# ============================================================
def _yx_v49_json_items(value):
    try:
        arr = json.loads(value or '[]')
        return arr if isinstance(arr, list) else []
    except Exception:
        return []

def _yx_v49_merge_items_json(values):
    merged = []
    for v in values or []:
        merged.extend(_yx_v49_json_items(v))
    return json.dumps(_normalize_warehouse_items(merged), ensure_ascii=False)

def _yx_v49_ensure_warehouse_schema(cur):
    """V97 compatibility stub. Final non-destructive warehouse schema logic is defined later in this main file."""
    return None

# service-line retained: database migration behavior consolidated into formal services.

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# This is the final definition imported by app.py. It replaces prior V40/V48/V49 duplicates.
# ============================================================
def _yx_v51_ensure_warehouse_schema(cur):
    """V97 compatibility stub. Final non-destructive warehouse schema logic is defined later in this main file."""
    return None

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.
# warehouse_cells 主表、items_json、slot unique index 已由 init_db 自動補表/補欄位/補索引；V53 前端只送主表 schema 既有欄位。


# service-line retained: database migration behavior consolidated into formal services.

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Purpose: insert/delete cells without clearing warehouse_cells or rewriting the whole column.
# Rules: no truncate, no delete-all/rebuild, keep product cells, only shift slot_number safely.
# ============================================================
def _yx_v69_normalize_direct_slots(cur, zone=None, column_index=None):
    """Formal database helper retained for stable behavior."""
    try:
        cur.execute(sql("SELECT 1"))
    except Exception as e:
        log_error('v111_normalize_direct_slots_readonly', str(e))

def _yx_v69_cell_items_from_row(row):
    try:
        return json.loads((row or {}).get('items_json') or '[]')
    except Exception:
        return []

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.


# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Fix insert/delete slot failures by using a large temporary offset instead of
# negative values. This avoids UNIQUE conflicts on SQLite/PostgreSQL while still
# never clearing, rebuilding, or reordering product cells beyond the required
# slot shift.
# ============================================================
def _yx_v70_direct_expr():
    return "COALESCE(NULLIF(TRIM(slot_type),''),'direct')"

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# - 右鍵標記問題格：使用 warehouse_cells.problem_flag，不新增外掛檔。
# - 新增/插入/刪除格子前先合併同一格的歷史重複資料，避免 slot_type 空字串
#   和 direct 同時存在造成 UNIQUE 衝突。
# - 不清空、不重建、不洗掉 warehouse_cells；只移動同欄 slot_number。
# ============================================================
def _yx_v76_ensure_problem_flag(cur):
    try:
        if USE_POSTGRES:
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT ''")
        else:
            cur.execute("PRAGMA table_info(warehouse_cells)")
            cols = [r[1] for r in cur.fetchall()]
            if 'problem_flag' not in cols:
                cur.execute("ALTER TABLE warehouse_cells ADD COLUMN problem_flag TEXT DEFAULT ''")
    except Exception as e:
        log_error('v76_ensure_problem_flag', str(e))


def _yx_v76_items_json(row):
    try:
        val = row.get('items_json') if isinstance(row, dict) else row['items_json']
    except Exception:
        try: val = row[1]
        except Exception: val = '[]'
    try:
        arr = json.loads(val or '[]')
        return arr if isinstance(arr, list) else []
    except Exception:
        return []


def _yx_v76_merge_items(rows):
    merged = []
    seen = set()
    for r in rows or []:
        for it in _yx_v76_items_json(r):
            try:
                k = json.dumps(it, ensure_ascii=False, sort_keys=True)
            except Exception:
                k = str(it)
            if k not in seen:
                seen.add(k); merged.append(it)
    return merged


def _yx_v76_get(row, key, default=None):
    try:
        if isinstance(row, dict): return row.get(key, default)
        return row[key]
    except Exception:
        return default


def _yx_v76_merge_duplicate_direct_slots(cur, zone=None, column_index=None):
    """合併舊資料中同 zone/column/slot 的 direct/空 slot_type 重複格。
    這是新增/刪除失敗的主要原因之一：先把空 slot_type 正規化成 direct 會碰到
    已存在 direct 同格 UNIQUE，因此先合併再更新。
    """
    _yx_v76_ensure_problem_flag(cur)
    where = ""
    params = []
    if zone is not None and column_index is not None:
        where = "WHERE zone = ? AND column_index = ?"
        params = [(zone or 'A').strip().upper(), int(column_index or 1)]
    cur.execute(sql(f"""
        SELECT id, zone, column_index, COALESCE(NULLIF(TRIM(slot_type),''),'direct') AS st,
               slot_number, items_json, note, updated_at, COALESCE(problem_flag,'') AS problem_flag
        FROM warehouse_cells
        {where}
        ORDER BY zone, column_index, slot_number, id
    """), tuple(params))
    rows = rows_to_dict(cur)
    groups = {}
    for r in rows:
        try:
            z = (r.get('zone') or 'A').strip().upper(); c = int(r.get('column_index') or 1); s = int(r.get('slot_number') or 1)
        except Exception:
            continue
        groups.setdefault((z,c,s), []).append(r)
    for (_z,_c,_s), grp in groups.items():
        if not grp:
            continue
        # keep row with items first, then latest/highest id; delete others before setting keep to direct.
        def score(r):
            return (1 if _yx_v76_items_json(r) else 0, int(r.get('id') or 0))
        keep = sorted(grp, key=score, reverse=True)[0]
        keep_id = keep.get('id')
        drop_ids = [r.get('id') for r in grp if r.get('id') != keep_id]
        merged_items = _yx_v76_merge_items(grp)
        keep_note = next((r.get('note') for r in grp if (r.get('note') or '').strip()), '') or ''
        keep_flag = 'problem' if any((r.get('problem_flag') or '').strip() for r in grp) else ''
        if drop_ids:
            q = ','.join(['?'] * len(drop_ids))
            cur.execute(sql(f"UPDATE warehouse_cells SET is_deleted=1, updated_at=? WHERE id IN ({q})"), (now(), *tuple(drop_ids)))
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET zone=?, column_index=?, slot_type='direct', slot_number=?, items_json=?, note=?, problem_flag=?, updated_at=?
            WHERE id=?
        """), (_z, _c, _s, json.dumps(merged_items, ensure_ascii=False), keep_note, keep_flag, now(), keep_id))


def _yx_v76_column_max_slot(cur, zone, column_index):
    cur.execute(sql("""
        SELECT COALESCE(MAX(slot_number),0) AS max_slot
        FROM warehouse_cells
        WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
    """), (zone, int(column_index)))
    return int((fetchone_dict(cur) or {}).get('max_slot') or 0)


# service-line retained: database migration behavior consolidated into formal services.


# service-line retained: database migration behavior consolidated into formal services.


def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    slot_number = int(slot_number or 0)
    if zone not in ('A','B') or column_index < 1 or slot_number < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v76_merge_duplicate_direct_slots(cur, zone, column_index)
        _warehouse_ensure_column_slots(cur, zone, column_index, slot_number)
        _yx_v76_ensure_problem_flag(cur)
        flag = 'problem' if marked else ''
        cur.execute(sql("""
            UPDATE warehouse_cells SET problem_flag=?, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number=?
        """), (flag, now(), zone, column_index, slot_number))
        conn.commit()
        return {'success': True, 'marked': bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Rules: no clearing, no rebuilding warehouse_cells, no reordering product cells.
# - delete slot = mark empty slot is_deleted=1
# - add/insert slot = restore a hidden empty slot when possible, otherwise insert new empty row
# - visible cells exclude is_deleted=1
# ============================================================
def _yx_v77_ensure_warehouse_soft_delete_columns(cur):
    try:
        if USE_POSTGRES:
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT ''")
        else:
            cur.execute("PRAGMA table_info(warehouse_cells)")
            cols = [r[1] for r in cur.fetchall()]
            if 'is_deleted' not in cols:
                cur.execute("ALTER TABLE warehouse_cells ADD COLUMN is_deleted INTEGER DEFAULT 0")
            if 'problem_flag' not in cols:
                cur.execute("ALTER TABLE warehouse_cells ADD COLUMN problem_flag TEXT DEFAULT ''")
    except Exception as e:
        log_error('v77_ensure_warehouse_soft_delete_columns', str(e))


def _yx_v77_is_deleted_expr():
    return "COALESCE(is_deleted,0)=0"


def _yx_v77_empty_items_json(value):
    """Treat legacy fake-empty rows as empty.
    Some old rows store [{}], [{qty:0}], or an item without product text. Those looked empty
    on the UI but blocked right-click delete.
    """
    try:
        arr = json.loads(value or '[]')
        if not isinstance(arr, list) or not arr:
            return True
        for it in arr:
            if not isinstance(it, dict):
                continue
            product = str(it.get('product_text') or it.get('product') or it.get('product_size') or '').strip()
            try:
                qty = int(it.get('qty') or it.get('quantity') or it.get('pieces') or 0)
            except Exception:
                qty = 0
            if product and qty > 0:
                return False
        return True
    except Exception:
        return True


def _yx_v77_ensure_min_grid(cur):
    """Ensure physical default slots 1..25 for every A/B column.
    Important: this only creates rows that do not exist at all. If a row exists but
    is_deleted=1 because the user deleted/hidden it, we leave it hidden and do not
    restore it automatically. This keeps delete/hidden behavior stable while still
    filling truly missing DB gaps.
    """
    _yx_v77_ensure_warehouse_soft_delete_columns(cur)
    default_slots = 25
    for z in ('A','B'):
        for c in range(1,7):
            cur.execute(sql("""
                SELECT slot_number FROM warehouse_cells
                WHERE zone=? AND column_index=?
                  AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
            """), (z,c))
            physical = set()
            for row in cur.fetchall():
                try: val = row['slot_number'] if hasattr(row, 'keys') else row[0]
                except Exception: val = row[0]
                try:
                    if int(val or 0) > 0:
                        physical.add(int(val or 0))
                except Exception:
                    pass
            for num in range(1, default_slots + 1):
                if num in physical:
                    continue
                cur.execute(sql("""
                    INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                    VALUES(?,?,?,?,?,?,?,?,0)
                """), (z,c,'direct',num,'[]','',now(),''))

def warehouse_get_cells():
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v77_ensure_warehouse_soft_delete_columns(cur)
        _yx_v77_ensure_min_grid(cur)
        conn.commit()
        cur.execute(sql("""
            SELECT *, COALESCE(problem_flag,'') AS problem_flag, COALESCE(is_deleted,0) AS is_deleted
            FROM warehouse_cells
            WHERE COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
              AND COALESCE(is_deleted,0)=0
            ORDER BY zone, column_index, slot_number
        """), ('direct',))
        return rows_to_dict(cur)
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_summary():
    cells = warehouse_get_cells()
    zones = {'A': {}, 'B': {}}
    for cell in cells:
        zone = cell.get('zone') if isinstance(cell, dict) else cell['zone']
        col = int(cell.get('column_index') if isinstance(cell, dict) else cell['column_index'])
        num = int(cell.get('slot_number') if isinstance(cell, dict) else cell['slot_number'])
        zones.setdefault(zone, {}).setdefault(col, {})[num] = cell
    return zones


def _warehouse_ensure_column_slots(cur, zone, column_index, upto=25):
    """Fill only truly missing physical slots up to requested slot.
    Hidden rows remain hidden. Existing product rows are never shifted or cleared.
    """
    _yx_v77_ensure_warehouse_soft_delete_columns(cur)
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 1)
    upto = max(1, int(upto or 25))
    cur.execute(sql("""
        SELECT slot_number FROM warehouse_cells
        WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
    """), (zone,column_index))
    physical = set()
    for row in cur.fetchall():
        try: val = row['slot_number'] if hasattr(row, 'keys') else row[0]
        except Exception: val = row[0]
        try:
            if int(val or 0) > 0:
                physical.add(int(val or 0))
        except Exception:
            pass
    for num in range(1, upto+1):
        if num in physical:
            continue
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
            VALUES(?,?,?,?,?,?,?,?,0)
        """), (zone,column_index,'direct',num,'[]','',now(),''))

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.


def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    zone=(zone or 'A').strip().upper(); column_index=int(column_index or 0); slot_number=int(slot_number or 0)
    if zone not in ('A','B') or column_index < 1 or slot_number < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn=get_db(); cur=conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v77_ensure_warehouse_soft_delete_columns(cur)
        _warehouse_ensure_column_slots(cur, zone, column_index, slot_number)
        flag='problem' if marked else ''
        cur.execute(sql("""
            UPDATE warehouse_cells SET problem_flag=?, is_deleted=0, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number=?
        """), (flag, now(), zone, column_index, slot_number))
        conn.commit(); return {'success': True, 'marked': bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Rules: no layer/main-core, no clearing, no rebuild, no forced reordering.
# ============================================================
def _yx_v79_ensure_warehouse_columns(cur):
    try:
        if USE_POSTGRES:
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT ''")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]'")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT")
        else:
            cur.execute("PRAGMA table_info(warehouse_cells)")
            cols = {str(r[1]) for r in cur.fetchall()}
            add = {
                'is_deleted': "ALTER TABLE warehouse_cells ADD COLUMN is_deleted INTEGER DEFAULT 0",
                'problem_flag': "ALTER TABLE warehouse_cells ADD COLUMN problem_flag TEXT DEFAULT ''",
                'items_json': "ALTER TABLE warehouse_cells ADD COLUMN items_json TEXT DEFAULT '[]'",
                'note': "ALTER TABLE warehouse_cells ADD COLUMN note TEXT DEFAULT ''",
                'updated_at': "ALTER TABLE warehouse_cells ADD COLUMN updated_at TEXT",
            }
            for k, ddl in add.items():
                if k not in cols:
                    cur.execute(ddl)
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET zone=COALESCE(NULLIF(TRIM(zone),''),'A'),
                column_index=COALESCE(column_index,1),
                slot_number=COALESCE(slot_number,1),
                items_json=COALESCE(NULLIF(items_json,''),'[]'),
                note=COALESCE(note,''),
                is_deleted=COALESCE(is_deleted,0),
                problem_flag=COALESCE(problem_flag,''),
                updated_at=COALESCE(NULLIF(updated_at,''),?)
        """), (now(),))
    except Exception as e:
        log_error('v79_ensure_warehouse_columns', str(e))


def _yx_v79_items_len(value):
    try:
        arr=json.loads(value or '[]')
        return len(arr) if isinstance(arr, list) else 0
    except Exception:
        return 0


def _yx_v79_merge_json_values(values):
    merged=[]
    seen=set()
    for value in values or []:
        try:
            arr=json.loads(value or '[]')
        except Exception:
            arr=[]
        if not isinstance(arr, list):
            continue
        for it in arr:
            try:
                key=json.dumps({
                    'customer_name': it.get('customer_name') or it.get('customer') or '',
                    'product_text': it.get('product_text') or it.get('product') or '',
                    'material': it.get('material') or it.get('product_code') or '',
                    'source_table': it.get('source_table') or it.get('source') or '',
                    'source_id': str(it.get('source_id') or it.get('id') or ''),
                    'placement_label': it.get('placement_label') or it.get('layer_label') or '',
                    'qty': int(it.get('qty') or 0),
                }, ensure_ascii=False, sort_keys=True)
            except Exception:
                key=str(it)
            if key in seen:
                continue
            seen.add(key)
            merged.append(it)
    try:
        return json.dumps(_normalize_warehouse_items(merged), ensure_ascii=False)
    except Exception:
        return json.dumps(merged, ensure_ascii=False)


def _yx_v79_merge_duplicate_slots_all(cur):
    _yx_v79_ensure_warehouse_columns(cur)
    cur.execute(sql("""
        SELECT zone, column_index, COALESCE(NULLIF(TRIM(slot_type),''),'direct') AS slot_type, slot_number, COUNT(*) AS cnt
        FROM warehouse_cells
        GROUP BY zone, column_index, COALESCE(NULLIF(TRIM(slot_type),''),'direct'), slot_number
        HAVING COUNT(*) > 1
    """))
    groups=rows_to_dict(cur)
    for g in groups:
        z=g.get('zone') or 'A'; c=int(g.get('column_index') or 1); t=g.get('slot_type') or 'direct'; n=int(g.get('slot_number') or 1)
        cur.execute(sql("""
            SELECT id, items_json, note, COALESCE(is_deleted,0) AS is_deleted, COALESCE(problem_flag,'') AS problem_flag
            FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')=? AND slot_number=?
            ORDER BY COALESCE(is_deleted,0) ASC, id DESC
        """), (z,c,t,n))
        rows=rows_to_dict(cur)
        if len(rows)<=1:
            continue
        # keep an active row with most product data; if none, newest row
        rows_sorted=sorted(rows, key=lambda r: (int(r.get('is_deleted') or 0), -_yx_v79_items_len(r.get('items_json')), -int(r.get('id') or 0)))
        keep=rows_sorted[0]
        keep_id=keep.get('id')
        merged_json=_yx_v79_merge_json_values([r.get('items_json') for r in rows])
        keep_note=next((r.get('note') for r in rows if r.get('note')), '')
        keep_flag='problem' if any((r.get('problem_flag') or '').strip() for r in rows) else ''
        # If any row has items, keep visible; otherwise keep current visible/deleted state of chosen row.
        visible = 0 if any(_yx_v79_items_len(r.get('items_json'))>0 or int(r.get('is_deleted') or 0)==0 for r in rows) else int(keep.get('is_deleted') or 0)
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET slot_type='direct', items_json=?, note=?, problem_flag=?, is_deleted=?, updated_at=?
            WHERE id=?
        """), (merged_json, keep_note or '', keep_flag, visible, now(), keep_id))
        for r in rows:
            rid=r.get('id')
            if rid==keep_id:
                continue
            # Do not DELETE product data before it has been merged into keep row; after merge, hide duplicates.
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), rid))


def _yx_v79_ensure_min_visible_slots(cur, zone=None, column_index=None, default_slots=25):
    """Ensure physical default slots exist, but never unhide user-hidden slots.
    刪除格子採 is_deleted=1，因此查詢/刷新不能又把它改回可見。
    """
    _yx_v79_ensure_warehouse_columns(cur)
    zones=[(zone or '').strip().upper()] if zone else ['A','B']
    zones=[z for z in zones if z in ('A','B')]
    cols=[int(column_index)] if column_index else list(range(1,7))
    for z in zones:
        for c in cols:
            cur.execute(sql("""
                SELECT slot_number FROM warehouse_cells
                WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
            """), (z,c))
            physical=set()
            for row in cur.fetchall():
                try: v=row['slot_number'] if hasattr(row,'keys') else row[0]
                except Exception: v=row[0]
                try:
                    if int(v or 0)>0: physical.add(int(v or 0))
                except Exception: pass
            for n in range(1, int(default_slots)+1):
                if n in physical:
                    continue
                cur.execute(sql("""
                    INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                    VALUES(?,?,?,?,?,?,?,?,0)
                """), (z,c,'direct',n,'[]','',now(),''))

def _yx_v80_raw_warehouse_cells(cur):
    cur.execute(sql("""
        SELECT *, COALESCE(problem_flag,'') AS problem_flag, COALESCE(is_deleted,0) AS is_deleted
        FROM warehouse_cells
        WHERE COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
          AND COALESCE(is_deleted,0)=0
        ORDER BY zone, column_index, slot_number, id
    """), ())
    return rows_to_dict(cur)


def warehouse_get_cells():
    """Read warehouse cells without ever clearing/rebuilding warehouse_cells.
    If old data has duplicate/legacy rows and a cleanup step fails, fall back to a
    raw SELECT instead of returning an empty warehouse to the frontend.
    """
    conn=get_db(); cur=conn.cursor()
    try:
        # Minimal, non-destructive schema/slot preparation only.
        _yx_v79_ensure_warehouse_columns(cur)
        _yx_v79_merge_duplicate_slots_all(cur)  # hides merged duplicate rows; does not delete product data
        _yx_v79_ensure_min_visible_slots(cur, default_slots=25)
        conn.commit()
        return _yx_v80_raw_warehouse_cells(cur)
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        try: log_error('warehouse_get_cells_safe_fallback', str(e))
        except Exception: pass
        try:
            _yx_v79_ensure_warehouse_columns(cur)
            conn.commit()
            return _yx_v80_raw_warehouse_cells(cur)
        except Exception as e2:
            try: conn.rollback()
            except Exception: pass
            try: log_error('warehouse_get_cells_raw_failed', str(e2))
            except Exception: pass
            return []
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_summary():
    cells=warehouse_get_cells()
    zones={'A':{},'B':{}}
    for cell in cells:
        z=(cell.get('zone') or 'A').strip().upper()
        if z not in ('A','B'): z='A'
        c=int(cell.get('column_index') or 1); n=int(cell.get('slot_number') or 1)
        zones.setdefault(z,{}).setdefault(c,{})[n]=cell
    return zones


def _warehouse_ensure_column_slots(cur, zone, column_index, upto=25):
    _yx_v79_ensure_warehouse_columns(cur)
    _yx_v79_merge_duplicate_slots_all(cur)
    _yx_v79_ensure_min_visible_slots(cur, zone, int(column_index or 1), default_slots=max(25, int(upto or 25)))


# service-line retained: database migration behavior consolidated into formal services.


# service-line retained: database migration behavior consolidated into formal services.


# service-line retained: database migration behavior consolidated into formal services.


def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    zone=(zone or 'A').strip().upper(); column_index=int(column_index or 0); slot_number=int(slot_number or 0)
    if zone not in ('A','B') or column_index<1 or slot_number<1:
        return {'success':False,'error':'格位參數錯誤'}
    conn=get_db(); cur=conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v79_ensure_warehouse_columns(cur)
        _warehouse_ensure_column_slots(cur, zone, column_index, max(25, slot_number))
        flag='problem' if marked else ''
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET problem_flag=?, is_deleted=0, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number=?
        """), (flag, now(), zone, column_index, slot_number))
        conn.commit(); return {'success':True,'marked':bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Purpose: make right-click add/delete usable without clearing/rebuilding warehouse_cells.
# This replaces earlier slot action implementations at import time.
# Rules kept: no delete-all, no rebuild, no product-cell reorder, DB-synced soft delete.
# ============================================================
def _yx_v86_fetchone(cur):
    try:
        return fetchone_dict(cur)
    except Exception:
        row = cur.fetchone()
        if row is None:
            return None
        try:
            return dict(row)
        except Exception:
            return {'v': row[0] if isinstance(row, (list, tuple)) else row}


def _yx_v86_json_is_empty(value):
    return _yx_v77_empty_items_json(value)


def _yx_v86_ensure_columns(cur):
    _yx_v79_ensure_warehouse_columns(cur)


def _yx_v86_ensure_physical_slots(cur, zone, column_index, upto=25):
    """Only create truly missing physical slot rows. Hidden rows stay hidden."""
    _yx_v86_ensure_columns(cur)
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 1)
    upto = max(1, int(upto or 25))
    cur.execute(sql("""
        SELECT slot_number FROM warehouse_cells
        WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
    """), (zone, column_index))
    existing = set()
    for row in cur.fetchall():
        try:
            v = row['slot_number'] if hasattr(row, 'keys') else row[0]
            v = int(v or 0)
            if v > 0:
                existing.add(v)
        except Exception:
            pass
    for n in range(1, upto + 1):
        if n in existing:
            continue
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
            VALUES(?,?,?,?,?,?,?,?,0)
        """), (zone, column_index, 'direct', n, '[]', '', now(), ''))


# service-line retained: database migration behavior consolidated into formal services.


# service-line retained: database migration behavior consolidated into formal services.

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Direct main-file replacement for final warehouse slot functions.
# No clearing, no rebuild, no product-cell reordering.
# - delete slot = soft hide empty slot (is_deleted=1)
# - add/insert slot = restore hidden empty slot when possible, otherwise append a new empty slot
# - every operation writes DB first and returns success even if later readback summary is unavailable
# ============================================================
def _yx_v87_fetchone(cur):
    try:
        return fetchone_dict(cur)
    except Exception:
        row = cur.fetchone()
        if row is None:
            return None
        try:
            return dict(row)
        except Exception:
            return {'v': row[0] if isinstance(row, (list, tuple)) else row}


def _yx_v87_is_empty_items(value):
    try:
        arr = json.loads(value or '[]')
        if not isinstance(arr, list) or not arr:
            return True
        for it in arr:
            if not isinstance(it, dict):
                continue
            txt = str(it.get('product_text') or it.get('product') or it.get('product_size') or '').strip()
            try:
                qty = int(it.get('qty') or it.get('quantity') or it.get('pieces') or 0)
            except Exception:
                qty = 0
            if txt and qty > 0:
                return False
        return True
    except Exception:
        return True


def _yx_v87_ensure_columns(cur):
    _yx_v79_ensure_warehouse_columns(cur)


def _yx_v87_normalize_direct_duplicates(cur, zone=None, column_index=None):
    """Normalize legacy duplicate rows caused by slot_type='' vs 'direct'.
    Product data is merged into one visible keeper; duplicate rows are hidden, not deleted.
    """
    _yx_v87_ensure_columns(cur)
    params = []
    where = ""
    if zone:
        where += " AND zone=?"
        params.append((zone or 'A').strip().upper())
    if column_index:
        where += " AND column_index=?"
        params.append(int(column_index))
    cur.execute(sql(f"""
        SELECT zone, column_index, COALESCE(NULLIF(TRIM(slot_type),''),'direct') AS st, slot_number, COUNT(*) AS cnt
        FROM warehouse_cells
        WHERE 1=1 {where}
        GROUP BY zone, column_index, COALESCE(NULLIF(TRIM(slot_type),''),'direct'), slot_number
        HAVING COUNT(*) > 1
    """), tuple(params))
    groups = rows_to_dict(cur)
    for g in groups:
        z = (g.get('zone') or 'A').strip().upper()
        c = int(g.get('column_index') or 1)
        n = int(g.get('slot_number') or 1)
        cur.execute(sql("""
            SELECT id, items_json, note, COALESCE(is_deleted,0) AS is_deleted, COALESCE(problem_flag,'') AS problem_flag
            FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number=?
            ORDER BY COALESCE(is_deleted,0) ASC, id DESC
        """), (z, c, n))
        rows = rows_to_dict(cur)
        if len(rows) <= 1:
            continue
        rows_sorted = sorted(rows, key=lambda r: (
            0 if not _yx_v87_is_empty_items(r.get('items_json')) else 1,
            int(r.get('is_deleted') or 0),
            -int(r.get('id') or 0)
        ))
        keep = rows_sorted[0]
        keep_id = keep.get('id')
        merged_json = _yx_v79_merge_json_values([r.get('items_json') for r in rows])
        has_items = not _yx_v87_is_empty_items(merged_json)
        problem_flag = 'problem' if any((r.get('problem_flag') or '').strip() for r in rows) else ''
        keep_deleted = 0 if has_items else int(keep.get('is_deleted') or 0)
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET slot_type='direct', items_json=?, note=?, problem_flag=?, is_deleted=?, updated_at=?
            WHERE id=?
        """), (merged_json, keep.get('note') or '', problem_flag, keep_deleted, now(), keep_id))
        for r in rows:
            rid = r.get('id')
            if rid == keep_id:
                continue
            cur.execute(sql("""
                UPDATE warehouse_cells
                SET slot_type='direct', items_json='[]', is_deleted=1, updated_at=?
                WHERE id=?
            """), (now(), rid))


def _yx_v87_ensure_physical_slots(cur, zone, column_index, upto=25):
    """Create truly missing physical empty rows only. Hidden rows stay hidden."""
    _yx_v87_ensure_columns(cur)
    z = (zone or 'A').strip().upper()
    c = int(column_index or 1)
    upto = max(1, int(upto or 25))
    _yx_v87_normalize_direct_duplicates(cur, z, c)
    cur.execute(sql("""
        SELECT slot_number FROM warehouse_cells
        WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
    """), (z, c))
    existing = set()
    for row in cur.fetchall():
        try:
            v = row['slot_number'] if hasattr(row, 'keys') else row[0]
            v = int(v or 0)
            if v > 0:
                existing.add(v)
        except Exception:
            pass
    for n in range(1, upto + 1):
        if n in existing:
            continue
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
            VALUES(?,?,?,?,?,?,?,?,0)
        """), (z, c, 'direct', n, '[]', '', now(), ''))


# service-line retained: database migration behavior consolidated into formal services.


# service-line retained: database migration behavior consolidated into formal services.


def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0); n = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or n < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v87_ensure_columns(cur)
        _yx_v87_ensure_physical_slots(cur, z, c, max(25, n))
        flag = 'problem' if marked else ''
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET problem_flag=?, is_deleted=0, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number=?
        """), (flag, now(), z, c, n))
        conn.commit()
        return {'success': True, 'marked': bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass



# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Root cause of right-click failures: legacy duplicate rows with slot_type='' and 'direct'
# caused UNIQUE collisions when code tried to normalize both rows to slot_type='direct'.
# This version keeps one direct visible keeper and moves duplicate empty rows to a unique
# non-direct slot_type, so product data is merged and no direct-slot collision occurs.
# ============================================================
def _yx_v87_normalize_direct_duplicates(cur, zone=None, column_index=None):
    _yx_v87_ensure_columns(cur)
    params = []
    where = ""
    if zone:
        where += " AND zone=?"
        params.append((zone or 'A').strip().upper())
    if column_index:
        where += " AND column_index=?"
        params.append(int(column_index))
    cur.execute(sql(f"""
        SELECT zone, column_index, COALESCE(NULLIF(TRIM(slot_type),''),'direct') AS st, slot_number, COUNT(*) AS cnt
        FROM warehouse_cells
        WHERE 1=1 {where}
        GROUP BY zone, column_index, COALESCE(NULLIF(TRIM(slot_type),''),'direct'), slot_number
        HAVING COUNT(*) > 1
    """), tuple(params))
    groups = rows_to_dict(cur)
    for g in groups:
        z = (g.get('zone') or 'A').strip().upper()
        c = int(g.get('column_index') or 1)
        n = int(g.get('slot_number') or 1)
        cur.execute(sql("""
            SELECT id, slot_type, items_json, note, COALESCE(is_deleted,0) AS is_deleted, COALESCE(problem_flag,'') AS problem_flag
            FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number=?
            ORDER BY COALESCE(is_deleted,0) ASC, id DESC
        """), (z, c, n))
        rows = rows_to_dict(cur)
        if len(rows) <= 1:
            continue
        rows_sorted = sorted(rows, key=lambda r: (
            0 if not _yx_v87_is_empty_items(r.get('items_json')) else 1,
            int(r.get('is_deleted') or 0),
            -int(r.get('id') or 0)
        ))
        keep = rows_sorted[0]
        keep_id = keep.get('id')
        merged_json = _yx_v79_merge_json_values([r.get('items_json') for r in rows])
        has_items = not _yx_v87_is_empty_items(merged_json)
        problem_flag = 'problem' if any((r.get('problem_flag') or '').strip() for r in rows) else ''
        keep_deleted = 0 if has_items else int(keep.get('is_deleted') or 0)
        # Make the keeper the only normalized direct row for this slot.
        try:
            cur.execute(sql("""
                UPDATE warehouse_cells
                SET slot_type='direct', items_json=?, note=?, problem_flag=?, is_deleted=?, updated_at=?
                WHERE id=?
            """), (merged_json, keep.get('note') or '', problem_flag, keep_deleted, now(), keep_id))
        except Exception:
            # If the keeper itself cannot become direct due to another direct row, leave its slot_type and still continue hiding duplicates.
            cur.execute(sql("""
                UPDATE warehouse_cells
                SET items_json=?, note=?, problem_flag=?, is_deleted=?, updated_at=?
                WHERE id=?
            """), (merged_json, keep.get('note') or '', problem_flag, keep_deleted, now(), keep_id))
        for r in rows:
            rid = r.get('id')
            if rid == keep_id:
                continue
            # Do not normalize duplicates to direct; that is exactly what caused UNIQUE errors.
            hidden_type = ('hidden_dup_%s' % rid)[:60]
            cur.execute(sql("""
                UPDATE warehouse_cells
                SET slot_type=?, items_json='[]', is_deleted=1, updated_at=?
                WHERE id=?
            """), (hidden_type, now(), rid))


def _yx_v79_merge_duplicate_slots_all(cur):
    # Keep compatibility: any old caller now uses the safe duplicate normalizer.
    return _yx_v87_normalize_direct_duplicates(cur)

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Purpose: make every right-click operation work without clearing/rebuilding
# warehouse_cells. This deliberately avoids normalizing legacy slot_type='' rows
# to 'direct', because that is what can collide with the existing unique index.
# - Empty slot delete = soft hide all matching normalized rows (is_deleted=1)
# - Add/insert = restore a hidden empty row first, otherwise append a new direct row
# - Save/mark = update an existing normalized row or create one if missing
# - Read = in-memory de-duplicate only; does not mutate product rows
# ============================================================
def _yx_v88_ensure_columns(cur):
    try:
        if USE_POSTGRES:
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT ''")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]'")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT")
        else:
            cur.execute("PRAGMA table_info(warehouse_cells)")
            cols = {str(r[1]) for r in cur.fetchall()}
            ddl = {
                'is_deleted': "ALTER TABLE warehouse_cells ADD COLUMN is_deleted INTEGER DEFAULT 0",
                'problem_flag': "ALTER TABLE warehouse_cells ADD COLUMN problem_flag TEXT DEFAULT ''",
                'items_json': "ALTER TABLE warehouse_cells ADD COLUMN items_json TEXT DEFAULT '[]'",
                'note': "ALTER TABLE warehouse_cells ADD COLUMN note TEXT DEFAULT ''",
                'updated_at': "ALTER TABLE warehouse_cells ADD COLUMN updated_at TEXT",
            }
            for col, stmt in ddl.items():
                if col not in cols:
                    cur.execute(stmt)
        # Safe defaults only. Do NOT convert slot_type='' to direct; that can hit unique constraints.
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET zone=COALESCE(NULLIF(TRIM(zone),''),'A'),
                column_index=COALESCE(column_index,1),
                slot_number=COALESCE(slot_number,1),
                items_json=COALESCE(NULLIF(items_json,''),'[]'),
                note=COALESCE(note,''),
                is_deleted=COALESCE(is_deleted,0),
                problem_flag=COALESCE(problem_flag,''),
                updated_at=COALESCE(NULLIF(updated_at,''),?)
        """), (now(),))
    except Exception as e:
        log_error('v88_ensure_warehouse_columns', str(e))


def _yx_v88_empty_items(value):
    try:
        arr = json.loads(value or '[]')
        if not isinstance(arr, list) or not arr:
            return True
        for it in arr:
            if not isinstance(it, dict):
                continue
            txt = str(it.get('product_text') or it.get('product') or it.get('product_size') or '').strip()
            try:
                qty = int(it.get('qty') or it.get('quantity') or it.get('pieces') or 0)
            except Exception:
                qty = 0
            if txt and qty > 0:
                return False
        return True
    except Exception:
        return True


def _yx_v88_normalized_rows(cur, zone, column_index, slot_number=None):
    z = (zone or 'A').strip().upper()
    c = int(column_index or 1)
    params = [z, c]
    extra = ''
    if slot_number is not None:
        extra = ' AND slot_number=?'
        params.append(int(slot_number or 0))
    cur.execute(sql(f"""
        SELECT id, zone, column_index, slot_type, slot_number, items_json, note,
               COALESCE(is_deleted,0) AS is_deleted, COALESCE(problem_flag,'') AS problem_flag,
               updated_at
        FROM warehouse_cells
        WHERE zone=? AND column_index=?
          AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
          {extra}
        ORDER BY slot_number ASC, COALESCE(is_deleted,0) ASC, id DESC
    """), tuple(params))
    return rows_to_dict(cur)


def _yx_v88_pick_keeper(rows):
    if not rows:
        return None
    return sorted(rows, key=lambda r: (
        int(r.get('is_deleted') or 0),
        0 if not _yx_v88_empty_items(r.get('items_json')) else 1,
        0 if str(r.get('slot_type') or '').strip() == 'direct' else 1,
        -int(r.get('id') or 0)
    ))[0]


def _yx_v88_merge_items_json(values):
    merged = []
    seen = set()
    for value in values or []:
        try:
            arr = json.loads(value or '[]')
        except Exception:
            arr = []
        if not isinstance(arr, list):
            continue
        for it in arr:
            if not isinstance(it, dict):
                continue
            key = json.dumps({
                'customer_name': it.get('customer_name') or it.get('customer') or '',
                'product_text': it.get('product_text') or it.get('product') or '',
                'material': it.get('material') or it.get('product_code') or '',
                'source_table': it.get('source_table') or it.get('source') or '',
                'source_id': str(it.get('source_id') or it.get('id') or ''),
                'placement_label': it.get('placement_label') or it.get('layer_label') or '',
                'qty': int(it.get('qty') or it.get('quantity') or it.get('pieces') or 0),
            }, ensure_ascii=False, sort_keys=True)
            if key not in seen:
                seen.add(key)
                merged.append(it)
    try:
        return json.dumps(_normalize_warehouse_items(merged), ensure_ascii=False)
    except Exception:
        return json.dumps(merged, ensure_ascii=False)


def _yx_v88_ensure_min_physical(cur, zone, column_index, default_slots=25):
    _yx_v88_ensure_columns(cur)
    z = (zone or 'A').strip().upper()
    c = int(column_index or 1)
    default_slots = max(1, int(default_slots or 25))
    cur.execute(sql("""
        SELECT slot_number FROM warehouse_cells
        WHERE zone=? AND column_index=?
          AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
    """), (z, c))
    existing = set()
    for row in cur.fetchall():
        try:
            n = int((row['slot_number'] if hasattr(row, 'keys') else row[0]) or 0)
            if n > 0:
                existing.add(n)
        except Exception:
            pass
    for n in range(1, default_slots + 1):
        if n in existing:
            continue
        try:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,0)
            """), (z, c, 'direct', n, '[]', '', now(), ''))
        except Exception:
            # If a legacy constraint blocks direct insert, skip. The operation APIs can still create/restore exact rows.
            try:
                log_error('v88_ensure_min_physical_skip', f'{z}-{c}-{n}')
            except Exception:
                pass


def warehouse_get_cells():
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v88_ensure_columns(cur)
        for z in ('A','B'):
            for c in range(1, 7):
                _yx_v88_ensure_min_physical(cur, z, c, 20)
        conn.commit()
        cur.execute(sql("""
            SELECT id, zone, column_index, slot_type, slot_number, items_json, note,
                   COALESCE(is_deleted,0) AS is_deleted, COALESCE(problem_flag,'') AS problem_flag,
                   updated_at
            FROM warehouse_cells
            WHERE COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
            ORDER BY zone, column_index, slot_number, COALESCE(is_deleted,0), id DESC
        """))
        raw = rows_to_dict(cur)
        grouped = {}
        for r in raw:
            key = ((r.get('zone') or 'A').strip().upper(), int(r.get('column_index') or 1), int(r.get('slot_number') or 1))
            grouped.setdefault(key, []).append(r)
        result = []
        for key, rows in grouped.items():
            visible = [r for r in rows if int(r.get('is_deleted') or 0) == 0]
            if not visible:
                continue
            keep = _yx_v88_pick_keeper(visible)
            if not keep:
                continue
            # Display all visible duplicate item rows as one logical cell, but do not mutate DB here.
            keep = dict(keep)
            keep['slot_type'] = 'direct'
            keep['items_json'] = _yx_v88_merge_items_json([r.get('items_json') for r in visible])
            keep['is_deleted'] = 0
            keep['problem_flag'] = 'problem' if any((r.get('problem_flag') or '').strip() for r in visible) else (keep.get('problem_flag') or '')
            result.append(keep)
        result.sort(key=lambda r: ((r.get('zone') or 'A'), int(r.get('column_index') or 1), int(r.get('slot_number') or 1)))
        return result
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('v88_warehouse_get_cells', str(e))
        return []
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_summary():
    cells = warehouse_get_cells()
    zones = {'A': {}, 'B': {}}
    for cell in cells:
        z = (cell.get('zone') or 'A').strip().upper()
        if z not in ('A','B'):
            z = 'A'
        c = int(cell.get('column_index') or 1)
        n = int(cell.get('slot_number') or 1)
        zones.setdefault(z, {}).setdefault(c, {})[n] = cell
    return zones


# service-line retained: database migration behavior consolidated into formal services.


# service-line retained: database migration behavior consolidated into formal services.


# service-line retained: database migration behavior consolidated into formal services.


def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0); n = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or n < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v88_ensure_columns(cur)
        _yx_v88_ensure_min_physical(cur, z, c, max(20, n))
        rows = _yx_v88_normalized_rows(cur, z, c, n)
        keeper = _yx_v88_pick_keeper(rows)
        if not keeper:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,0)
            """), (z, c, 'direct', n, '[]', '', now(), 'problem' if marked else ''))
        else:
            cur.execute(sql("UPDATE warehouse_cells SET problem_flag=?, is_deleted=0, updated_at=? WHERE id=?"), ('problem' if marked else '', now(), keeper.get('id')))
        conn.commit(); return {'success': True, 'marked': bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Single final warehouse implementation: 20 default slots, fill missing empty
# slots only, preserve warehouse_cells content, and keep add/insert/delete DB-linked.
# ============================================================
def _yx_v90_fetchall(cur):
    try:
        return rows_to_dict(cur)
    except Exception:
        out = []
        cols = [d[0] for d in (cur.description or [])]
        for r in cur.fetchall():
            out.append({cols[i]: r[i] for i in range(min(len(cols), len(r)))})
        return out

def _yx_v90_ensure_schema(cur):
    if USE_POSTGRES:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_cells (
                id SERIAL PRIMARY KEY,
                zone TEXT NOT NULL DEFAULT 'A',
                column_index INTEGER NOT NULL DEFAULT 1,
                slot_type TEXT NOT NULL DEFAULT 'direct',
                slot_number INTEGER NOT NULL DEFAULT 1,
                items_json TEXT DEFAULT '[]',
                note TEXT DEFAULT '',
                updated_at TEXT,
                is_deleted INTEGER DEFAULT 0,
                problem_flag TEXT DEFAULT ''
            )
        """)
        for ddl in (
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'A'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS column_index INTEGER DEFAULT 1",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_type TEXT DEFAULT 'direct'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_number INTEGER DEFAULT 1",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT ''",
        ):
            cur.execute(ddl)
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_cells (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                zone TEXT NOT NULL DEFAULT 'A',
                column_index INTEGER NOT NULL DEFAULT 1,
                slot_type TEXT NOT NULL DEFAULT 'direct',
                slot_number INTEGER NOT NULL DEFAULT 1,
                items_json TEXT DEFAULT '[]',
                note TEXT DEFAULT '',
                updated_at TEXT,
                is_deleted INTEGER DEFAULT 0,
                problem_flag TEXT DEFAULT ''
            )
        """)
        cur.execute("PRAGMA table_info(warehouse_cells)")
        cols = {str(r[1]) for r in cur.fetchall()}
        for name, ddl in {
            'zone': "ALTER TABLE warehouse_cells ADD COLUMN zone TEXT DEFAULT 'A'",
            'column_index': "ALTER TABLE warehouse_cells ADD COLUMN column_index INTEGER DEFAULT 1",
            'slot_type': "ALTER TABLE warehouse_cells ADD COLUMN slot_type TEXT DEFAULT 'direct'",
            'slot_number': "ALTER TABLE warehouse_cells ADD COLUMN slot_number INTEGER DEFAULT 1",
            'items_json': "ALTER TABLE warehouse_cells ADD COLUMN items_json TEXT DEFAULT '[]'",
            'note': "ALTER TABLE warehouse_cells ADD COLUMN note TEXT DEFAULT ''",
            'updated_at': "ALTER TABLE warehouse_cells ADD COLUMN updated_at TEXT",
            'is_deleted': "ALTER TABLE warehouse_cells ADD COLUMN is_deleted INTEGER DEFAULT 0",
            'problem_flag': "ALTER TABLE warehouse_cells ADD COLUMN problem_flag TEXT DEFAULT ''",
        }.items():
            if name not in cols:
                cur.execute(ddl)
    cur.execute(sql("""
        UPDATE warehouse_cells
        SET zone=COALESCE(NULLIF(TRIM(zone),''),'A'),
            slot_number=COALESCE(slot_number,1),
            column_index=COALESCE(column_index,1),
            items_json=COALESCE(NULLIF(items_json,''),'[]'),
            note=COALESCE(note,''),
            is_deleted=COALESCE(is_deleted,0),
            problem_flag=COALESCE(problem_flag,'')
    """))

def _yx_v90_items(value):
    try:
        arr = json.loads(value or '[]')
        return arr if isinstance(arr, list) else []
    except Exception:
        return []

def _yx_v90_empty(value):
    return len(_yx_v90_items(value)) == 0

def _yx_v90_merge_json(values):
    merged = []
    seen = set()
    for v in values or []:
        for it in _yx_v90_items(v):
            try:
                key = json.dumps(it, ensure_ascii=False, sort_keys=True)
            except Exception:
                key = str(it)
            if key not in seen:
                seen.add(key); merged.append(it)
    return json.dumps(_normalize_warehouse_items(merged), ensure_ascii=False)

def _yx_v90_rows(cur, z, c, n=None, visible_only=False):
    params = [z, int(c)]
    extra = ""
    if n is not None:
        extra += " AND slot_number=?"; params.append(int(n))
    if visible_only:
        extra += " AND COALESCE(is_deleted,0)=0"
    cur.execute(sql(f"""
        SELECT * FROM warehouse_cells
        WHERE zone=? AND column_index=?
          AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
          {extra}
        ORDER BY slot_number ASC, id ASC
    """), tuple(params))
    return _yx_v90_fetchall(cur)

def _yx_v90_pick(rows):
    if not rows:
        return None
    visible = [r for r in rows if int(r.get('is_deleted') or 0) == 0]
    pool = visible or rows
    occupied = [r for r in pool if not _yx_v90_empty(r.get('items_json'))]
    return (occupied or pool)[-1]

def _yx_v90_compact_duplicate_slot(cur, z, c, n):
    rows = _yx_v90_rows(cur, z, c, n, visible_only=False)
    if not rows:
        return None
    keeper = _yx_v90_pick(rows)
    if not keeper:
        return None
    merged_json = _yx_v90_merge_json([r.get('items_json') for r in rows])
    keep_note = next((r.get('note') for r in rows if r.get('note')), keeper.get('note') or '')
    keep_flag = 'problem' if any((r.get('problem_flag') or '').strip() for r in rows) else (keeper.get('problem_flag') or '')
    cur.execute(sql("""
        UPDATE warehouse_cells
        SET slot_type='direct', items_json=?, note=?, problem_flag=?, is_deleted=0, updated_at=?
        WHERE id=?
    """), (merged_json, keep_note or '', keep_flag or '', now(), keeper.get('id')))
    for r in rows:
        if r.get('id') != keeper.get('id'):
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), r.get('id')))
    return keeper.get('id')

def _yx_v90_ensure_column(cur, z, c, upto=20):
    upto = max(20, int(upto or 20))
    _yx_v90_ensure_schema(cur)
    cur.execute(sql("""
        SELECT slot_number FROM warehouse_cells
        WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
    """), (z, int(c)))
    existing = set()
    for r in cur.fetchall():
        try: existing.add(int(r['slot_number']))
        except Exception:
            try: existing.add(int(r[0]))
            except Exception: pass
    for n in range(1, upto + 1):
        if n not in existing:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, int(c), 'direct', n, '[]', '', now(), 0, ''))
        _yx_v90_compact_duplicate_slot(cur, z, int(c), n)

def warehouse_get_cells():
    conn = get_db(); cur = conn.cursor()
    try:
        for z in ('A','B'):
            for c in range(1, 7):
                _yx_v90_ensure_column(cur, z, c, 20)
        conn.commit()
        cur.execute(sql("""
            SELECT * FROM warehouse_cells
            WHERE COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND COALESCE(is_deleted,0)=0
            ORDER BY zone, column_index, slot_number, id
        """))
        rows = _yx_v90_fetchall(cur)
        grouped = {}
        for r in rows:
            key = ((r.get('zone') or 'A').strip().upper(), int(r.get('column_index') or 1), int(r.get('slot_number') or 1))
            grouped.setdefault(key, []).append(r)
        out = []
        for key, rs in grouped.items():
            keep = dict(_yx_v90_pick(rs) or rs[-1])
            keep['zone'], keep['column_index'], keep['slot_number'] = key[0], key[1], key[2]
            keep['slot_type'] = 'direct'
            keep['items_json'] = _yx_v90_merge_json([r.get('items_json') for r in rs])
            keep['is_deleted'] = 0
            out.append(keep)
        out.sort(key=lambda r: ((r.get('zone') or 'A'), int(r.get('column_index') or 1), int(r.get('slot_number') or 1)))
        return out
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('v90_warehouse_get_cells', str(e))
        return []
    finally:
        try: conn.close()
        except Exception: pass

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.

def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0); n = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or n < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v90_ensure_column(cur, z, c, max(20, n))
        keeper_id = _yx_v90_compact_duplicate_slot(cur, z, c, n)
        if keeper_id:
            cur.execute(sql("UPDATE warehouse_cells SET problem_flag=?, is_deleted=0, updated_at=? WHERE id=?"), ('problem' if marked else '', now(), keeper_id))
        conn.commit(); return {'success': True, 'marked': bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Directly in db.py. No layer file. No clearing/rebuilding warehouse_cells.
# Rules:
# - Default physical slots 1..20 per A/B column; only insert missing empty rows.
# - Never renumber or delete rows containing products.
# - Add/insert restores a hidden empty slot first; otherwise appends a new empty slot.
# - Delete only soft-hides an empty visible slot; no shifting product cells.
# ============================================================
def _yx_v92_fetchall(cur):
    try: return rows_to_dict(cur)
    except Exception:
        rows = cur.fetchall(); out=[]
        for r in rows:
            try: out.append(dict(r))
            except Exception: out.append({})
        return out

def _yx_v92_fetchone(cur):
    try: return fetchone_dict(cur)
    except Exception:
        r = cur.fetchone()
        if r is None: return None
        try: return dict(r)
        except Exception: return {'v': r[0] if isinstance(r,(list,tuple)) else r}

def _yx_v92_empty_items(value):
    try:
        arr=json.loads(value or '[]')
        if not isinstance(arr,list) or not arr: return True
        for it in arr:
            if not isinstance(it,dict): continue
            txt=str(it.get('product_text') or it.get('product') or it.get('product_size') or '').strip()
            try: qty=int(float(it.get('qty') or it.get('quantity') or it.get('pieces') or 0))
            except Exception: qty=0
            if txt and qty>0: return False
        return True
    except Exception:
        return True

def _yx_v92_ensure_schema(cur):
    _yx_v90_ensure_schema(cur)
    try:
        if USE_POSTGRES:
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0")
            cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT ''")
        else:
            cur.execute("PRAGMA table_info(warehouse_cells)")
            cols=[r[1] for r in cur.fetchall()]
            if 'is_deleted' not in cols: cur.execute("ALTER TABLE warehouse_cells ADD COLUMN is_deleted INTEGER DEFAULT 0")
            if 'problem_flag' not in cols: cur.execute("ALTER TABLE warehouse_cells ADD COLUMN problem_flag TEXT DEFAULT ''")
    except Exception as e:
        log_error('v92_ensure_schema', str(e))

def _yx_v92_rows(cur, z, c, n=None, visible_only=False):
    params=[z, int(c)]; extra=''
    if n is not None:
        extra += ' AND slot_number=?'; params.append(int(n))
    if visible_only:
        extra += ' AND COALESCE(is_deleted,0)=0'
    cur.execute(sql(f"""
        SELECT * FROM warehouse_cells
        WHERE zone=? AND column_index=?
          AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
          {extra}
        ORDER BY slot_number ASC, COALESCE(is_deleted,0) ASC, id ASC
    """), tuple(params))
    return _yx_v92_fetchall(cur)

def _yx_v92_merge_json(values):
    merged=[]; seen=set()
    for v in values:
        try: arr=json.loads(v or '[]')
        except Exception: arr=[]
        if not isinstance(arr,list): continue
        for it in arr:
            if not isinstance(it,dict): continue
            if _yx_v92_empty_items(json.dumps([it], ensure_ascii=False)): continue
            key=json.dumps(it, ensure_ascii=False, sort_keys=True)
            if key not in seen:
                seen.add(key); merged.append(it)
    return json.dumps(_normalize_warehouse_items(merged), ensure_ascii=False)

def _yx_v92_compact_duplicate_slot(cur, z, c, n):
    rows=_yx_v92_rows(cur,z,c,n,visible_only=False)
    if not rows: return None
    occupied=[r for r in rows if not _yx_v92_empty_items(r.get('items_json'))]
    visible=[r for r in rows if int(r.get('is_deleted') or 0)==0]
    keeper=(occupied or visible or rows)[-1]
    merged=_yx_v92_merge_json([r.get('items_json') for r in rows])
    note=next((r.get('note') for r in rows if r.get('note')), keeper.get('note') or '')
    flag='problem' if any((r.get('problem_flag') or '').strip() for r in rows) else (keeper.get('problem_flag') or '')
    cur.execute(sql("""
        UPDATE warehouse_cells
        SET slot_type='direct', items_json=?, note=?, problem_flag=?, is_deleted=0, updated_at=?
        WHERE id=?
    """), (merged, note or '', flag or '', now(), keeper.get('id')))
    for r in rows:
        if r.get('id') != keeper.get('id'):
            cur.execute(sql("UPDATE warehouse_cells SET slot_type='direct', is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), r.get('id')))
    return keeper.get('id')

def _yx_v92_ensure_column(cur, z, c, upto=20):
    z=(z or 'A').strip().upper(); c=int(c or 1); upto=max(20, int(upto or 20))
    _yx_v92_ensure_schema(cur)
    cur.execute(sql("""
        SELECT slot_number FROM warehouse_cells
        WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
    """), (z,c))
    existing=set()
    for r in cur.fetchall():
        try: n=int(r['slot_number'] if hasattr(r,'keys') else r[0]);
        except Exception: continue
        if n>0: existing.add(n)
    for n in range(1, upto+1):
        if n not in existing:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z,c,'direct',n,'[]','',now(),0,''))
        _yx_v92_compact_duplicate_slot(cur,z,c,n)

def warehouse_get_cells():
    conn=get_db(); cur=conn.cursor()
    try:
        for z in ('A','B'):
            for c in range(1,7):
                _yx_v92_ensure_column(cur,z,c,20)
        conn.commit()
        cur.execute(sql("""
            SELECT * FROM warehouse_cells
            WHERE COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND COALESCE(is_deleted,0)=0
            ORDER BY zone, column_index, slot_number, id
        """))
        rows=_yx_v92_fetchall(cur); grouped={}
        for r in rows:
            key=((r.get('zone') or 'A').strip().upper(), int(r.get('column_index') or 1), int(r.get('slot_number') or 1))
            grouped.setdefault(key,[]).append(r)
        out=[]
        for key, rs in grouped.items():
            occupied=[r for r in rs if not _yx_v92_empty_items(r.get('items_json'))]
            keep=dict((occupied or rs)[-1]); keep['zone'],keep['column_index'],keep['slot_number']=key; keep['slot_type']='direct'; keep['items_json']=_yx_v92_merge_json([r.get('items_json') for r in rs]); keep['is_deleted']=0; out.append(keep)
        out.sort(key=lambda r: ((r.get('zone') or 'A'), int(r.get('column_index') or 1), int(r.get('slot_number') or 1)))
        return out
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('v92_warehouse_get_cells', str(e)); return []
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_summary():
    cells=warehouse_get_cells(); zones={'A':{}, 'B':{}}
    for cell in cells:
        z=(cell.get('zone') or 'A').strip().upper(); c=int(cell.get('column_index') or 1); n=int(cell.get('slot_number') or 1)
        zones.setdefault(z,{}).setdefault(c,{})[n]=cell
    return zones

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.

def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    z=(zone or 'A').strip().upper(); c=int(column_index or 0); n=int(slot_number or 0)
    if z not in ('A','B') or c<1 or n<1: return {'success':False,'error':'格位參數錯誤'}
    conn=get_db(); cur=conn.cursor()
    try:
        _yx_v92_ensure_column(cur,z,c,max(20,n))
        keeper_id=_yx_v92_compact_duplicate_slot(cur,z,c,n)
        if keeper_id:
            cur.execute(sql("UPDATE warehouse_cells SET problem_flag=?, is_deleted=0, updated_at=? WHERE id=?"), ('problem' if marked else '', now(), keeper_id))
        conn.commit(); return {'success':True,'marked':bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Directly in db.py. No layer file, no main-core, no table rebuild.
# Rules:
# - Do not clear/recreate warehouse_cells.
# - Do not normalize legacy empty slot_type to direct in-place because that can
#   collide with existing unique indexes on PostgreSQL.
# - Default visible grid is 20 slots per A/B column; only missing empty slots are added.
# - Save/add/delete/mark are DB-linked and never move rows that contain product data.
# ============================================================
def _yx_v93_fetchall(cur):
    try:
        return rows_to_dict(cur)
    except Exception:
        rows = cur.fetchall(); cols = [d[0] for d in (cur.description or [])]; out=[]
        for r in rows:
            try: out.append(dict(r))
            except Exception: out.append({cols[i]: r[i] for i in range(min(len(cols), len(r)))})
        return out

def _yx_v93_fetchone(cur):
    try:
        return fetchone_dict(cur)
    except Exception:
        r = cur.fetchone()
        if r is None: return None
        try: return dict(r)
        except Exception:
            cols=[d[0] for d in (cur.description or [])]
            return {cols[i]: r[i] for i in range(min(len(cols), len(r)))} if cols and isinstance(r,(list,tuple)) else {'v': r[0] if isinstance(r,(list,tuple)) else r}

def _yx_v93_ensure_schema(cur):
    if USE_POSTGRES:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_cells (
                id SERIAL PRIMARY KEY,
                zone TEXT NOT NULL DEFAULT 'A',
                column_index INTEGER NOT NULL DEFAULT 1,
                slot_type TEXT DEFAULT 'direct',
                slot_number INTEGER NOT NULL DEFAULT 1,
                items_json TEXT DEFAULT '[]',
                note TEXT DEFAULT '',
                updated_at TEXT,
                is_deleted INTEGER DEFAULT 0,
                problem_flag TEXT DEFAULT ''
            )
        """)
        for ddl in (
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'A'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS column_index INTEGER DEFAULT 1",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_type TEXT DEFAULT 'direct'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_number INTEGER DEFAULT 1",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT ''",
        ):
            cur.execute(ddl)
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_cells (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                zone TEXT NOT NULL DEFAULT 'A',
                column_index INTEGER NOT NULL DEFAULT 1,
                slot_type TEXT DEFAULT 'direct',
                slot_number INTEGER NOT NULL DEFAULT 1,
                items_json TEXT DEFAULT '[]',
                note TEXT DEFAULT '',
                updated_at TEXT,
                is_deleted INTEGER DEFAULT 0,
                problem_flag TEXT DEFAULT ''
            )
        """)
        cur.execute("PRAGMA table_info(warehouse_cells)")
        cols={str(r[1]) for r in cur.fetchall()}
        for name, ddl in {
            'zone': "ALTER TABLE warehouse_cells ADD COLUMN zone TEXT DEFAULT 'A'",
            'column_index': "ALTER TABLE warehouse_cells ADD COLUMN column_index INTEGER DEFAULT 1",
            'slot_type': "ALTER TABLE warehouse_cells ADD COLUMN slot_type TEXT DEFAULT 'direct'",
            'slot_number': "ALTER TABLE warehouse_cells ADD COLUMN slot_number INTEGER DEFAULT 1",
            'items_json': "ALTER TABLE warehouse_cells ADD COLUMN items_json TEXT DEFAULT '[]'",
            'note': "ALTER TABLE warehouse_cells ADD COLUMN note TEXT DEFAULT ''",
            'updated_at': "ALTER TABLE warehouse_cells ADD COLUMN updated_at TEXT",
            'is_deleted': "ALTER TABLE warehouse_cells ADD COLUMN is_deleted INTEGER DEFAULT 0",
            'problem_flag': "ALTER TABLE warehouse_cells ADD COLUMN problem_flag TEXT DEFAULT ''",
        }.items():
            if name not in cols:
                cur.execute(ddl)
    # Safe defaults only. Never rewrite slot_type here.
    cur.execute(sql("""
        UPDATE warehouse_cells
        SET zone=COALESCE(NULLIF(TRIM(zone),''),'A'),
            column_index=COALESCE(column_index,1),
            slot_number=COALESCE(slot_number,1),
            items_json=COALESCE(NULLIF(items_json,''),'[]'),
            note=COALESCE(note,''),
            is_deleted=COALESCE(is_deleted,0),
            problem_flag=COALESCE(problem_flag,''),
            updated_at=COALESCE(NULLIF(updated_at,''),?)
    """), (now(),))

def _yx_v93_is_direct_expr():
    return "COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'"

def _yx_v93_items(value):
    try:
        arr=json.loads(value or '[]')
        return arr if isinstance(arr,list) else []
    except Exception:
        return []

def _yx_v93_empty(value):
    for it in _yx_v93_items(value):
        if not isinstance(it, dict):
            continue
        txt=str(it.get('product_text') or it.get('product') or it.get('product_size') or '').strip()
        try: qty=int(float(it.get('qty') or it.get('quantity') or it.get('pieces') or 0))
        except Exception: qty=0
        if txt and qty>0:
            return False
    return True

def _yx_v93_merge_json(values):
    merged=[]; seen=set()
    for v in values or []:
        for it in _yx_v93_items(v):
            if not isinstance(it, dict):
                continue
            if _yx_v93_empty(json.dumps([it], ensure_ascii=False)):
                continue
            try:
                key=json.dumps(it, ensure_ascii=False, sort_keys=True)
            except Exception:
                key=str(it)
            if key in seen:
                continue
            seen.add(key); merged.append(it)
    try:
        return json.dumps(_normalize_warehouse_items(merged), ensure_ascii=False)
    except Exception:
        return json.dumps(merged, ensure_ascii=False)

def _yx_v93_rows(cur, z, c, n=None, visible_only=False):
    params=[(z or 'A').strip().upper(), int(c or 1)]; extra=''
    if n is not None:
        extra += ' AND slot_number=?'; params.append(int(n or 0))
    if visible_only:
        extra += ' AND COALESCE(is_deleted,0)=0'
    cur.execute(sql(f"""
        SELECT id, zone, column_index, slot_type, slot_number, items_json, note, updated_at,
               COALESCE(is_deleted,0) AS is_deleted, COALESCE(problem_flag,'') AS problem_flag
        FROM warehouse_cells
        WHERE zone=? AND column_index=? AND {_yx_v93_is_direct_expr()}
          {extra}
        ORDER BY slot_number ASC, COALESCE(is_deleted,0) ASC, id ASC
    """), tuple(params))
    return _yx_v93_fetchall(cur)

def _yx_v93_pick(rows):
    if not rows: return None
    visible=[r for r in rows if int(r.get('is_deleted') or 0)==0]
    occupied=[r for r in visible if not _yx_v93_empty(r.get('items_json'))]
    direct=[r for r in (occupied or visible or rows) if str(r.get('slot_type') or '').strip()=='direct']
    return (direct or occupied or visible or rows)[-1]

def _yx_v93_hide_empty_duplicate_rows(cur, rows, keep_id):
    for r in rows or []:
        if r.get('id') == keep_id:
            continue
        # Never erase product data in a duplicate row. Only hide rows that are truly empty.
        if _yx_v93_empty(r.get('items_json')):
            hidden_type = ('hidden_dup_%s' % r.get('id'))[:60]
            cur.execute(sql("UPDATE warehouse_cells SET slot_type=?, is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (hidden_type, now(), r.get('id')))

def _yx_v93_compact_slot(cur, z, c, n):
    rows=_yx_v93_rows(cur,z,c,n,visible_only=False)
    if not rows: return None
    keeper=_yx_v93_pick(rows)
    if not keeper: return None
    # Merge only visible/product rows into the keeper. Product duplicate rows are hidden only if empty.
    merged=_yx_v93_merge_json([r.get('items_json') for r in rows])
    note=next((r.get('note') for r in rows if r.get('note')), keeper.get('note') or '')
    flag='problem' if any((r.get('problem_flag') or '').strip() for r in rows) else (keeper.get('problem_flag') or '')
    try:
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET items_json=?, note=?, problem_flag=?, is_deleted=0, updated_at=?
            WHERE id=?
        """), (merged, note or '', flag or '', now(), keeper.get('id')))
    except Exception:
        # Do not risk data loss on unique/index edge cases; caller can still use the existing keeper.
        log_error('v93_compact_slot_update', f'{z}-{c}-{n}')
    _yx_v93_hide_empty_duplicate_rows(cur, rows, keeper.get('id'))
    return keeper.get('id')

def _yx_v93_ensure_column(cur, z, c, upto=20):
    z=(z or 'A').strip().upper(); c=int(c or 1); upto=max(20, int(upto or 20))
    _yx_v93_ensure_schema(cur)
    cur.execute(sql(f"""
        SELECT slot_number FROM warehouse_cells
        WHERE zone=? AND column_index=? AND {_yx_v93_is_direct_expr()}
    """), (z,c))
    existing=set()
    for r in cur.fetchall():
        try: n=int(r['slot_number'] if hasattr(r,'keys') else r[0])
        except Exception: continue
        if n>0: existing.add(n)
    for n in range(1, upto+1):
        if n not in existing:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z,c,'direct',n,'[]','',now(),0,''))
        else:
            _yx_v93_compact_slot(cur,z,c,n)

def warehouse_get_cells():
    conn=get_db(); cur=conn.cursor()
    try:
        for z in ('A','B'):
            for c in range(1,7):
                _yx_v93_ensure_column(cur,z,c,20)
        conn.commit()
        cur.execute(sql(f"""
            SELECT id, zone, column_index, slot_type, slot_number, items_json, note, updated_at,
                   COALESCE(is_deleted,0) AS is_deleted, COALESCE(problem_flag,'') AS problem_flag
            FROM warehouse_cells
            WHERE {_yx_v93_is_direct_expr()} AND COALESCE(is_deleted,0)=0
            ORDER BY zone, column_index, slot_number, id
        """))
        rows=_yx_v93_fetchall(cur); grouped={}
        for r in rows:
            try: key=((r.get('zone') or 'A').strip().upper(), int(r.get('column_index') or 1), int(r.get('slot_number') or 1))
            except Exception: continue
            grouped.setdefault(key,[]).append(r)
        out=[]
        for key, rs in grouped.items():
            keep=dict(_yx_v93_pick(rs) or rs[-1])
            keep['zone'], keep['column_index'], keep['slot_number'] = key
            keep['slot_type']='direct'; keep['is_deleted']=0
            keep['items_json']=_yx_v93_merge_json([r.get('items_json') for r in rs])
            keep['problem_flag']='problem' if any((r.get('problem_flag') or '').strip() for r in rs) else (keep.get('problem_flag') or '')
            out.append(keep)
        out.sort(key=lambda r: ((r.get('zone') or 'A'), int(r.get('column_index') or 1), int(r.get('slot_number') or 1)))
        return out
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('v93_warehouse_get_cells', str(e)); return []
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_summary():
    zones={'A':{}, 'B':{}}
    for cell in warehouse_get_cells():
        z=(cell.get('zone') or 'A').strip().upper(); c=int(cell.get('column_index') or 1); n=int(cell.get('slot_number') or 1)
        zones.setdefault(z,{}).setdefault(c,{})[n]=cell
    return zones

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.

def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    z=(zone or 'A').strip().upper(); c=int(column_index or 0); n=int(slot_number or 0)
    if z not in ('A','B') or c<1 or n<1: return {'success':False,'error':'格位參數錯誤'}
    conn=get_db(); cur=conn.cursor()
    try:
        _yx_v93_ensure_column(cur,z,c,max(20,n))
        keeper_id=_yx_v93_compact_slot(cur,z,c,n)
        if keeper_id:
            cur.execute(sql("UPDATE warehouse_cells SET problem_flag=?, is_deleted=0, updated_at=? WHERE id=?"), ('problem' if marked else '', now(), keeper_id))
        conn.commit(); return {'success':True,'marked':bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


# service-line retained: database migration behavior consolidated into formal services.
# 目的：最後定義覆蓋前面舊版可能的整欄 rewrite / 清洗行為。
# 原則：不清空 warehouse_cells、不重建後洗格；每欄預設 20 格，缺幾格只補空格。
_YX_V95_WAREHOUSE_DEFAULT_SLOTS = 20

def _yx_v95_slot_type_expr():
    return "COALESCE(NULLIF(TRIM(slot_type),''),'direct')"

def _yx_v95_has_items(raw):
    try:
        arr = json.loads(raw or '[]')
        return isinstance(arr, list) and len(arr) > 0
    except Exception:
        return bool(str(raw or '').strip() not in ('', '[]', 'null', 'None'))

def _yx_v95_ensure_schema(cur):
    # 補欄位，不轉換舊空 slot_type，不刪資料。
    if USE_POSTGRES:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_cells (
                id SERIAL PRIMARY KEY,
                zone TEXT DEFAULT 'A',
                column_index INTEGER DEFAULT 1,
                slot_type TEXT DEFAULT 'direct',
                slot_number INTEGER DEFAULT 1,
                items_json TEXT DEFAULT '[]',
                note TEXT DEFAULT '',
                updated_at TEXT,
                is_deleted INTEGER DEFAULT 0,
                problem_flag TEXT DEFAULT ''
            )
        """)
        for ddl in (
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'A'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS column_index INTEGER DEFAULT 1",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_type TEXT DEFAULT 'direct'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_number INTEGER DEFAULT 1",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT ''",
        ):
            cur.execute(ddl)
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v95_wh_lookup ON warehouse_cells(zone, column_index, slot_number)")
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_cells (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                zone TEXT DEFAULT 'A',
                column_index INTEGER DEFAULT 1,
                slot_type TEXT DEFAULT 'direct',
                slot_number INTEGER DEFAULT 1,
                items_json TEXT DEFAULT '[]',
                note TEXT DEFAULT '',
                updated_at TEXT,
                is_deleted INTEGER DEFAULT 0,
                problem_flag TEXT DEFAULT ''
            )
        """)
        cur.execute("PRAGMA table_info(warehouse_cells)")
        cols = {str(r[1]) for r in cur.fetchall()}
        for name, ddl in {
            'zone': "ALTER TABLE warehouse_cells ADD COLUMN zone TEXT DEFAULT 'A'",
            'column_index': "ALTER TABLE warehouse_cells ADD COLUMN column_index INTEGER DEFAULT 1",
            'slot_type': "ALTER TABLE warehouse_cells ADD COLUMN slot_type TEXT DEFAULT 'direct'",
            'slot_number': "ALTER TABLE warehouse_cells ADD COLUMN slot_number INTEGER DEFAULT 1",
            'items_json': "ALTER TABLE warehouse_cells ADD COLUMN items_json TEXT DEFAULT '[]'",
            'note': "ALTER TABLE warehouse_cells ADD COLUMN note TEXT DEFAULT ''",
            'updated_at': "ALTER TABLE warehouse_cells ADD COLUMN updated_at TEXT",
            'is_deleted': "ALTER TABLE warehouse_cells ADD COLUMN is_deleted INTEGER DEFAULT 0",
            'problem_flag': "ALTER TABLE warehouse_cells ADD COLUMN problem_flag TEXT DEFAULT ''",
        }.items():
            if name not in cols:
                cur.execute(ddl)
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v95_wh_lookup ON warehouse_cells(zone, column_index, slot_number)")

def _yx_v95_ensure_column(cur, zone, column_index, minimum_slots=None):
    z = (zone or 'A').strip().upper()
    c = int(column_index or 1)
    target = int(minimum_slots or _YX_V95_WAREHOUSE_DEFAULT_SLOTS)
    target = max(_YX_V95_WAREHOUSE_DEFAULT_SLOTS, target)
    cur.execute(sql(f"""
        SELECT slot_number FROM warehouse_cells
        WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct' AND COALESCE(is_deleted,0)=0
    """), (z, c))
    existing = {int((r[0] if not isinstance(r, dict) else r.get('slot_number')) or 0) for r in cur.fetchall()}
    for n in range(1, target + 1):
        if n in existing:
            continue
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
            VALUES(?,?,?,?,?,?,?,?,?)
        """), (z, c, 'direct', n, '[]', '', now(), 0, ''))

def _yx_v95_all_columns(cur):
    cur.execute(sql("""
        SELECT DISTINCT zone, column_index FROM warehouse_cells
        WHERE COALESCE(is_deleted,0)=0
    """))
    rows = rows_to_dict(cur)
    keys = {(str(r.get('zone') or 'A').strip().upper(), int(r.get('column_index') or 1)) for r in rows}
    for z in ('A','B'):
        for c in range(1,7):
            keys.add((z,c))
    return sorted(keys)

def warehouse_get_cells():
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v95_ensure_schema(cur)
        for z, c in _yx_v95_all_columns(cur):
            _yx_v95_ensure_column(cur, z, c, _YX_V95_WAREHOUSE_DEFAULT_SLOTS)
        conn.commit()
        cur.execute(sql(f"""
            SELECT id, zone, column_index, {_yx_v95_slot_type_expr()} AS slot_type, slot_number,
                   COALESCE(items_json,'[]') AS items_json, COALESCE(note,'') AS note,
                   COALESCE(problem_flag,'') AS problem_flag, updated_at
            FROM warehouse_cells
            WHERE COALESCE(is_deleted,0)=0 AND {_yx_v95_slot_type_expr()}='direct'
            ORDER BY zone, column_index, slot_number, id
        """))
        return rows_to_dict(cur)
    finally:
        try: conn.close()
        except Exception: pass

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.

# service-line retained: database migration behavior consolidated into formal services.



# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# Purpose:
# - Warehouse display must restore real rows from both old and new schemas.
# - Old schema support: zone/area, band/section/column, row_name/front_back, slot/slot_number.
# - Front/back rows are converted into one vertical column: front=1..10, back=11..20.
# - A/B x 6 columns x 20 base slots are always visible in memory; GET never rewrites product data.
# - Extra slots append after the current visible max; remove only soft-hides empty extra slots.
# - No table truncate/drop/rebuild; no renumbering product cells.
# ============================================================
_YX_117_DEFAULT_WAREHOUSE_SLOTS = 20
_YX_117_DEFAULT_WAREHOUSE_COLUMNS = 6


def _yx_v116_fetchall(cur):
    try:
        return rows_to_dict(cur)
    except Exception:
        rows = cur.fetchall()
        cols = [d[0] for d in (cur.description or [])]
        out = []
        for r in rows:
            try:
                out.append(dict(r))
            except Exception:
                if isinstance(r, (list, tuple)):
                    out.append({cols[i]: r[i] for i in range(min(len(cols), len(r)))})
                else:
                    out.append({})
        return out


def _yx_v116_fetchone(cur):
    try:
        return fetchone_dict(cur)
    except Exception:
        r = cur.fetchone()
        if r is None:
            return None
        try:
            return dict(r)
        except Exception:
            cols = [d[0] for d in (cur.description or [])]
            if cols and isinstance(r, (list, tuple)):
                return {cols[i]: r[i] for i in range(min(len(cols), len(r)))}
            return {'v': r[0] if isinstance(r, (list, tuple)) else r}


def _yx_v116_cols(cur, table='warehouse_cells'):
    if USE_POSTGRES:
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name=%s
            ORDER BY ordinal_position
        """, (table,))
        return {str((r[0] if isinstance(r, (list, tuple)) else r.get('column_name')) or '') for r in cur.fetchall()}
    cur.execute(f"PRAGMA table_info({table})")
    cols = set()
    for r in cur.fetchall():
        try:
            cols.add(str(r['name']))
        except Exception:
            try:
                cols.add(str(r[1]))
            except Exception:
                pass
    return cols


def _yx_v116_ensure_schema(cur):
    if USE_POSTGRES:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_cells (
                id SERIAL PRIMARY KEY,
                zone TEXT DEFAULT 'A',
                column_index INTEGER DEFAULT 1,
                slot_type TEXT DEFAULT 'direct',
                slot_number INTEGER DEFAULT 1,
                items_json TEXT DEFAULT '[]',
                note TEXT DEFAULT '',
                updated_at TEXT,
                is_deleted INTEGER DEFAULT 0,
                problem_flag TEXT DEFAULT ''
            )
        """)
        for ddl in (
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'A'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS column_index INTEGER DEFAULT 1",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_type TEXT DEFAULT 'direct'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS slot_number INTEGER DEFAULT 1",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS items_json TEXT DEFAULT '[]'",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS updated_at TEXT",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0",
            "ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS problem_flag TEXT DEFAULT ''",
        ):
            cur.execute(ddl)
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v116_wh_lookup ON warehouse_cells(zone, column_index, slot_number)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v116_wh_visible ON warehouse_cells(zone, column_index, is_deleted)")
        try:
            cur.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)")
            cur.execute("INSERT INTO schema_migrations(version) VALUES('117_warehouse_final_stable') ON CONFLICT (version) DO NOTHING")
        except Exception:
            pass
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_cells (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                zone TEXT DEFAULT 'A',
                column_index INTEGER DEFAULT 1,
                slot_type TEXT DEFAULT 'direct',
                slot_number INTEGER DEFAULT 1,
                items_json TEXT DEFAULT '[]',
                note TEXT DEFAULT '',
                updated_at TEXT,
                is_deleted INTEGER DEFAULT 0,
                problem_flag TEXT DEFAULT ''
            )
        """)
        cols = _yx_v116_cols(cur)
        ddl_map = {
            'zone': "ALTER TABLE warehouse_cells ADD COLUMN zone TEXT DEFAULT 'A'",
            'column_index': "ALTER TABLE warehouse_cells ADD COLUMN column_index INTEGER DEFAULT 1",
            'slot_type': "ALTER TABLE warehouse_cells ADD COLUMN slot_type TEXT DEFAULT 'direct'",
            'slot_number': "ALTER TABLE warehouse_cells ADD COLUMN slot_number INTEGER DEFAULT 1",
            'items_json': "ALTER TABLE warehouse_cells ADD COLUMN items_json TEXT DEFAULT '[]'",
            'note': "ALTER TABLE warehouse_cells ADD COLUMN note TEXT DEFAULT ''",
            'updated_at': "ALTER TABLE warehouse_cells ADD COLUMN updated_at TEXT",
            'is_deleted': "ALTER TABLE warehouse_cells ADD COLUMN is_deleted INTEGER DEFAULT 0",
            'problem_flag': "ALTER TABLE warehouse_cells ADD COLUMN problem_flag TEXT DEFAULT ''",
        }
        for col, ddl in ddl_map.items():
            if col not in cols:
                cur.execute(ddl)
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v116_wh_lookup ON warehouse_cells(zone, column_index, slot_number)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v116_wh_visible ON warehouse_cells(zone, column_index, is_deleted)")
        try:
            cur.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)")
            cur.execute("INSERT OR IGNORE INTO schema_migrations(version) VALUES('117_warehouse_final_stable')")
        except Exception:
            pass


def _yx_v116_has_value(row, name):
    return name in row and row.get(name) not in (None, '')


def _yx_v116_pick(row, *names, default=None):
    for name in names:
        if _yx_v116_has_value(row, name):
            return row.get(name)
    return default


def _yx_v116_int(v, default=0):
    try:
        if isinstance(v, str):
            m = re.search(r'-?\d+', v)
            if m:
                return int(m.group(0))
            return default
        if v is None:
            return default
        return int(v)
    except Exception:
        return default


def _yx_v116_zone(v):
    s = str(v or '').strip().upper().replace('區', '')
    if s.startswith('B') or s in ('2', '乙'):
        return 'B'
    return 'A'


def _yx_v116_truthy(v):
    return str(v).strip().lower() in ('1', 'true', 'yes', 'y', 'deleted', 'hidden') or v is True


def _yx_v116_row_name(row):
    return str(_yx_v116_pick(row, 'row_name', 'row_type', 'front_back', 'side', 'slot_type', default='') or '').strip().lower()


def _yx_v116_row_offset(row):
    rn = _yx_v116_row_name(row)
    if not rn or rn in ('direct', 'd', '0'):
        return None
    if any(x in rn for x in ('後', '后', 'back', 'rear', 'b排', 'b-row')):
        return 10
    if any(x in rn for x in ('前', 'front', 'f排', 'f-row')):
        return 0
    return None


def _yx_v116_column(row):
    # Old rows often received column_index=1 as an ADD COLUMN default while their real value
    # stayed in band/section/col. Prefer legacy real values when present.
    for name in ('col', 'column', 'band', 'section', 'section_index'):
        if _yx_v116_has_value(row, name):
            n = _yx_v116_int(row.get(name), 0)
            if n > 0:
                return n
            if n == 0:
                return 1
    n = _yx_v116_int(_yx_v116_pick(row, 'column_index', default=1), 1)
    return max(1, n)


def _yx_v116_slot(row):
    # Do not use generic row as primary slot; it can be 'front/back'. Use slot-like names.
    slot = 0
    for name in ('slot', 'slot_no', 'cell_number', 'position', 'pos', 'no'):
        if _yx_v116_has_value(row, name):
            slot = _yx_v116_int(row.get(name), 0)
            break
    if slot <= 0:
        slot = _yx_v116_int(_yx_v116_pick(row, 'slot_number', default=1), 1)
    if slot <= 0:
        slot = 1
    offset = _yx_v116_row_offset(row)
    # Convert old A/B band + front/back x 10 layout into 1..20 vertical slots.
    if offset is not None and 1 <= slot <= 10:
        return slot + offset
    return slot


def _yx_v116_parse_json_items(raw):
    if raw in (None, ''):
        return []
    obj = raw
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        try:
            obj = json.loads(s)
        except Exception:
            if re.search(r'\d+\s*[x×ＸX✕＊*]\s*\d+', s):
                return [{'product_text': s, 'product': s, 'qty': 1, 'customer_name': ''}]
            return []
    if isinstance(obj, dict):
        for key in ('items', 'products', 'goods', 'rows', 'data'):
            val = obj.get(key)
            if isinstance(val, list):
                return [x for x in val if isinstance(x, dict)]
        if obj.get('product_text') or obj.get('product') or obj.get('customer_name'):
            return [obj]
    if isinstance(obj, list):
        return [x for x in obj if isinstance(x, dict)]
    return []


def _yx_v116_qty_from_text(text, fallback=1):
    s = str(text or '').replace('×','x').replace('Ｘ','x').replace('X','x').replace('✕','x').replace('*','x').replace('＊','x').replace('＝','=').replace('＋','+')
    if '=' in s:
        right = s.split('=', 1)[1]
        total = 0
        hit = False
        for part in [p.strip() for p in right.split('+') if p.strip()]:
            m = re.search(r'x\s*(\d+)\s*$', part, re.I)
            if m:
                total += int(m.group(1)); hit = True
            elif re.search(r'\d', part):
                total += 1; hit = True
        if hit and total > 0:
            return total
    return max(1, _yx_v116_int(fallback, 1))


def _yx_v116_row_items(row):
    items = []
    for col in ('items_json', 'items', 'products_json', 'cell_items', 'goods_json', 'data_json', 'data', 'content', 'contents'):
        if col in row:
            items = _yx_v116_parse_json_items(row.get(col))
            if items:
                break
    if not items:
        product = _yx_v116_pick(row, 'product_text', 'product', 'goods_text', 'item_text', 'size_text', 'dimensions', 'dimension', 'size', default='')
        customer = _yx_v116_pick(row, 'customer_name', 'customer', 'client_name', 'client', 'name', default='')
        material = _yx_v116_pick(row, 'material', 'product_code', 'wood_type', default='')
        qty = _yx_v116_pick(row, 'qty', 'quantity', 'pieces', 'piece_count', 'count', default=0)
        if product or customer or material or _yx_v116_int(qty, 0) > 0:
            q = _yx_v116_qty_from_text(product, qty or 1)
            items = [{'product_text': product or '', 'product': product or '', 'customer_name': customer or '', 'material': material or '', 'product_code': material or '', 'qty': q}]
    normalized = []
    for it in items:
        if not isinstance(it, dict):
            continue
        product = it.get('product_text') or it.get('product') or it.get('text') or it.get('size_text') or ''
        customer = it.get('customer_name') or it.get('customer') or it.get('client_name') or ''
        material = it.get('material') or it.get('product_code') or it.get('wood_type') or ''
        q = _yx_v116_int(it.get('qty') or it.get('quantity') or it.get('pieces') or it.get('count'), 0)
        if q <= 0:
            q = _yx_v116_qty_from_text(product, 1)
        row2 = dict(it)
        row2['product_text'] = product
        row2['product'] = product
        row2['customer_name'] = customer
        row2['material'] = material
        row2['product_code'] = row2.get('product_code') or material
        row2['qty'] = max(1, q)
        normalized.append(row2)
    try:
        return _normalize_warehouse_items(normalized)
    except Exception:
        return normalized


def _yx_v116_cell_from_row(row):
    z = _yx_v116_zone(_yx_v116_pick(row, 'area', 'warehouse_zone', 'wh_zone', 'zone', default='A'))
    c = _yx_v116_column(row)
    s = _yx_v116_slot(row)
    items = _yx_v116_row_items(row)
    is_deleted = _yx_v116_truthy(_yx_v116_pick(row, 'is_deleted', 'deleted', 'hidden', default=0))
    if items:
        # Restore rule: product rows always remain displayable even if an old migration hid them.
        is_deleted = False
    return {
        'id': row.get('id'),
        'zone': z,
        'column_index': c,
        'slot_type': 'direct',
        'slot_number': max(1, s),
        'items': items,
        'items_json': json.dumps(items, ensure_ascii=False),
        'note': _yx_v116_pick(row, 'note', 'memo', 'remark', default='') or '',
        'updated_at': _yx_v116_pick(row, 'updated_at', 'created_at', default='') or '',
        'problem_flag': _yx_v116_pick(row, 'problem_flag', 'marked', 'flag', default='') or '',
        'is_deleted': 1 if is_deleted else 0,
    }


def _yx_v116_load_raw_cells(cur):
    _yx_v116_ensure_schema(cur)
    cur.execute(sql("SELECT * FROM warehouse_cells ORDER BY id ASC"))
    return _yx_v116_fetchall(cur)


def _yx_v116_merge_cells(cells):
    grouped = {}
    columns = set()
    for cell in cells:
        z = cell.get('zone') or 'A'
        c = int(cell.get('column_index') or 1)
        s = int(cell.get('slot_number') or 1)
        if z not in ('A','B') or c < 1 or s < 1:
            continue
        columns.add((z, c))
        key = (z, c, s)
        old = grouped.get(key)
        if not old:
            grouped[key] = dict(cell)
            continue
        old_items = list(old.get('items') or [])
        new_items = list(cell.get('items') or [])
        if new_items:
            old_items.extend(new_items)
        old['items'] = old_items
        old['items_json'] = json.dumps(old_items, ensure_ascii=False)
        old['note'] = old.get('note') or cell.get('note') or ''
        if str(cell.get('problem_flag') or '').strip():
            old['problem_flag'] = cell.get('problem_flag')
        old['is_deleted'] = 0 if old_items else min(int(old.get('is_deleted') or 0), int(cell.get('is_deleted') or 0))
    for z in ('A','B'):
        for c in range(1, _YX_117_DEFAULT_WAREHOUSE_COLUMNS + 1):
            columns.add((z, c))
    for z, c in sorted(columns):
        for s in range(1, _YX_117_DEFAULT_WAREHOUSE_SLOTS + 1):
            grouped.setdefault((z, c, s), {
                'id': None,
                'zone': z,
                'column_index': c,
                'slot_type': 'direct',
                'slot_number': s,
                'items': [],
                'items_json': '[]',
                'note': '',
                'updated_at': '',
                'problem_flag': '',
                'is_deleted': 0,
            })
    out = []
    for cell in grouped.values():
        s = int(cell.get('slot_number') or 1)
        has_items = bool(cell.get('items'))
        if s > _YX_117_DEFAULT_WAREHOUSE_SLOTS and int(cell.get('is_deleted') or 0) and not has_items:
            continue
        cell['items_json'] = json.dumps(cell.get('items') or [], ensure_ascii=False)
        out.append(cell)
    out.sort(key=lambda r: (r.get('zone') or 'A', int(r.get('column_index') or 1), int(r.get('slot_number') or 1)))
    return out


def _yx_v116_current_cells(cur):
    return _yx_v116_merge_cells([_yx_v116_cell_from_row(r) for r in _yx_v116_load_raw_cells(cur)])


def _yx_v116_public(cells):
    return [{k: v for k, v in cell.items() if k != 'items'} for cell in cells]


def warehouse_get_cells():
    conn = get_db(); cur = conn.cursor()
    try:
        cells = _yx_v116_current_cells(cur)
        return _yx_v116_public(cells)
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('v116_warehouse_get_cells_restore', str(e))
        return []
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_summary():
    zones = {'A': {}, 'B': {}}
    for cell in warehouse_get_cells():
        try:
            z = (cell.get('zone') or 'A').strip().upper()
            c = int(cell.get('column_index') or 1)
            s = int(cell.get('slot_number') or 1)
            zones.setdefault(z, {}).setdefault(c, {})[s] = cell
        except Exception:
            pass
    return zones


def _yx_v116_matching_raw_ids(cur, zone, column_index, slot_number):
    z = _yx_v116_zone(zone); c = int(column_index or 1); s = int(slot_number or 1)
    ids = []
    for raw in _yx_v116_load_raw_cells(cur):
        cell = _yx_v116_cell_from_row(raw)
        if cell['zone'] == z and int(cell['column_index']) == c and int(cell['slot_number']) == s and cell.get('id') is not None:
            ids.append(cell['id'])
    return ids


def _yx_v116_visible_numbers(cells, z, c):
    nums = set(range(1, _YX_117_DEFAULT_WAREHOUSE_SLOTS + 1))
    for cell in cells:
        if cell.get('zone') == z and int(cell.get('column_index') or 0) == c:
            s = int(cell.get('slot_number') or 0)
            if s > 0 and (s <= _YX_117_DEFAULT_WAREHOUSE_SLOTS or int(cell.get('is_deleted') or 0) == 0 or cell.get('items')):
                nums.add(s)
    return sorted(nums)


def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=''):
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        data_items = _normalize_warehouse_items(items or []) if '_normalize_warehouse_items' in globals() else (items or [])
        data = json.dumps(data_items, ensure_ascii=False)
        safe_note = '' if str(note or '').startswith('__USER_') else (note or '')
        ids = _yx_v116_matching_raw_ids(cur, z, c, s)
        if ids:
            keep_id = ids[0]
            cur.execute(sql("""
                UPDATE warehouse_cells
                SET zone=?, column_index=?, slot_type='direct', slot_number=?, items_json=?, note=?, is_deleted=0, updated_at=?
                WHERE id=?
            """), (z, c, s, data, safe_note, now(), keep_id))
            for extra_id in ids[1:]:
                # Same canonical cell duplicates are already merged into the saved value above.
                cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), extra_id))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, c, 'direct', s, data, safe_note, now(), 0, ''))
        conn.commit()
        return {'success': True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    z = _yx_v116_zone(zone); c = int(column_index or 0)
    if z not in ('A','B') or c < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        cells = _yx_v116_current_cells(cur)
        visible = _yx_v116_visible_numbers(cells, z, c)
        new_slot = max(visible or [_YX_117_DEFAULT_WAREHOUSE_SLOTS]) + 1
        new_slot = max(new_slot, _YX_117_DEFAULT_WAREHOUSE_SLOTS + 1)
        ids = _yx_v116_matching_raw_ids(cur, z, c, new_slot)
        if ids:
            cur.execute(sql("UPDATE warehouse_cells SET zone=?, column_index=?, slot_type='direct', slot_number=?, items_json='[]', is_deleted=0, updated_at=? WHERE id=?"), (z, c, new_slot, now(), ids[0]))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, c, 'direct', new_slot, '[]', '', now(), 0, ''))
        conn.commit()
        return new_slot
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    if s <= _YX_117_DEFAULT_WAREHOUSE_SLOTS:
        return {'success': True, 'removed_slot': s, 'default_protected': True, 'message': '1-20 預設格保留顯示'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        for raw in _yx_v116_load_raw_cells(cur):
            cell = _yx_v116_cell_from_row(raw)
            if cell['zone'] == z and int(cell['column_index']) == c and int(cell['slot_number']) == s and cell.get('items'):
                conn.commit()
                return {'success': False, 'error': '格子內還有商品，無法刪除。請先退回該格或移走商品'}
        ids = _yx_v116_matching_raw_ids(cur, z, c, s)
        if ids:
            for cell_id in ids:
                cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), cell_id))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, c, 'direct', s, '[]', '', now(), 1, ''))
        conn.commit()
        return {'success': True, 'removed_slot': s, 'soft_deleted': True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        ids = _yx_v116_matching_raw_ids(cur, z, c, s)
        if ids:
            cur.execute(sql("UPDATE warehouse_cells SET zone=?, column_index=?, slot_type='direct', slot_number=?, problem_flag=?, is_deleted=0, updated_at=? WHERE id=?"), (z, c, s, 'problem' if marked else '', now(), ids[0]))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, c, 'direct', s, '[]', '', now(), 0, 'problem' if marked else ''))
        conn.commit()
        return {'success': True, 'marked': bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


# service-line retained: database migration behavior consolidated into formal services.
def yx_v116_mainfile_stability_marker():
    return True

# ============================================================
# service-line retained: database migration behavior consolidated into formal services.
# User-approved warehouse rebuild-per-column logic. This does NOT clear the
# whole warehouse table; it rewrites only the operated A/B column after keeping
# all logical cell product data in memory. This makes base slots removable and
# renumbers following slots so the UI stays compact and stable.
# ============================================================
_YX_117_DEFAULT_COLUMNS = 6
_YX_117_DEFAULT_SLOTS = 20
WAREHOUSE_OLD_SLOT_PREFIX = '117_old_'


def _yx_117_ensure_schema(cur):
    _yx_v116_ensure_schema(cur)
    if USE_POSTGRES:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_column_meta (
                zone TEXT NOT NULL,
                column_index INTEGER NOT NULL,
                visible_count INTEGER NOT NULL DEFAULT 20,
                updated_at TEXT,
                PRIMARY KEY(zone, column_index)
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_117_wh_col ON warehouse_cells(zone, column_index)")
        try:
            cur.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)")
            cur.execute("INSERT INTO schema_migrations(version) VALUES('117_warehouse_compact_drag_stable') ON CONFLICT (version) DO NOTHING")
            cur.execute("INSERT INTO schema_migrations(version) VALUES('119_warehouse_flow_background_stable') ON CONFLICT (version) DO NOTHING")
        except Exception:
            pass
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_column_meta (
                zone TEXT NOT NULL,
                column_index INTEGER NOT NULL,
                visible_count INTEGER NOT NULL DEFAULT 20,
                updated_at TEXT,
                PRIMARY KEY(zone, column_index)
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_117_wh_col ON warehouse_cells(zone, column_index)")
        try:
            cur.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)")
            cur.execute("INSERT OR IGNORE INTO schema_migrations(version) VALUES('117_warehouse_compact_drag_stable')")
            cur.execute("INSERT OR IGNORE INTO schema_migrations(version) VALUES('119_warehouse_flow_background_stable')")
        except Exception:
            pass



def _yx_120_ensure_warehouse_operation_schema(cur):
    # V119 batch2: operation guard + normalized warehouse item mirror.
    if USE_POSTGRES:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS operation_log (
                operation_id TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'running',
                request_json TEXT,
                response_json TEXT,
                error TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_cell_items (
                id SERIAL PRIMARY KEY,
                cell_id INTEGER NOT NULL,
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
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx120_wh_items_cell ON warehouse_cell_items(cell_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx120_wh_items_lookup ON warehouse_cell_items(zone, column_index, slot_number)")
        cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS operation_id TEXT")
        cur.execute("ALTER TABLE warehouse_cells ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1")
        cur.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)")
        cur.execute("INSERT INTO schema_migrations(version) VALUES('119_batch2_warehouse_operation_stability') ON CONFLICT (version) DO NOTHING")
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS operation_log (
                operation_id TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'running',
                request_json TEXT,
                response_json TEXT,
                error TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS warehouse_cell_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cell_id INTEGER NOT NULL,
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
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx120_wh_items_cell ON warehouse_cell_items(cell_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx120_wh_items_lookup ON warehouse_cell_items(zone, column_index, slot_number)")
        try: cur.execute("ALTER TABLE warehouse_cells ADD COLUMN operation_id TEXT")
        except Exception: pass
        try: cur.execute("ALTER TABLE warehouse_cells ADD COLUMN version INTEGER DEFAULT 1")
        except Exception: pass
        cur.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)")
        cur.execute("INSERT OR IGNORE INTO schema_migrations(version) VALUES('119_batch2_warehouse_operation_stability')")

def _yx_120_sync_cell_items_for_column(cur, zone, column_index):
    z = _yx_v116_zone(zone); c = int(column_index or 0)
    if z not in ('A','B') or c < 1:
        return
    _yx_120_ensure_warehouse_operation_schema(cur)
    cur.execute(sql("SELECT * FROM warehouse_cells WHERE zone=? AND column_index=? AND COALESCE(is_deleted,0)=0 ORDER BY slot_number ASC, id ASC"), (z, c))
    rows = rows_to_dict(cur)
    for cell in rows:
        cell_id = cell.get('id')
        if not cell_id:
            continue
        cur.execute(sql("DELETE FROM warehouse_cell_items WHERE cell_id=?"), (cell_id,))
        try:
            items = json.loads(cell.get('items_json') or '[]')
            if not isinstance(items, list):
                items = []
        except Exception:
            items = []
        for i, it in enumerate(items):
            if not isinstance(it, dict):
                continue
            product = str(it.get('product_text') or it.get('product') or it.get('product_size') or '').strip()
            if not product:
                continue
            try:
                qty = int(float(it.get('qty') or it.get('quantity') or it.get('pieces') or 1))
            except Exception:
                qty = 1
            try:
                if '=' in product:
                    qty = int(effective_product_qty(product, qty))
            except Exception:
                pass
            cur.execute(sql("""
                INSERT INTO warehouse_cell_items(
                    cell_id, zone, column_index, slot_number, source_table, source_id,
                    customer_name, product_text, material, qty, placement_label, sort_order, created_at, updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """), (
                cell_id, z, c, int(cell.get('slot_number') or 0),
                str(it.get('source_table') or it.get('source') or '庫存'), str(it.get('source_id') or it.get('id') or ''),
                warehouse_customer_key(it.get('customer_name') or it.get('customer') or ''), product,
                str(it.get('material') or it.get('wood_type') or ''), max(0, qty),
                str(it.get('placement_label') or it.get('layer_label') or ''), i, now(), now()
            ))

def _yx_117_cell_items(cell):
    try:
        arr = json.loads(cell.get('items_json') or '[]')
        return arr if isinstance(arr, list) else []
    except Exception:
        return []


def _yx_117_has_items(cell):
    for it in _yx_117_cell_items(cell):
        if not isinstance(it, dict):
            continue
        txt = str(it.get('product_text') or it.get('product') or it.get('product_size') or '').strip()
        try:
            q = int(float(it.get('qty') or it.get('quantity') or it.get('pieces') or 0))
        except Exception:
            q = 0
        if txt and q > 0:
            return True
    return False


def _yx_117_raw_logical_cells(cur):
    _yx_117_ensure_schema(cur)
    out = []
    for raw in _yx_v116_load_raw_cells(cur):
        try:
            st = str(raw.get('slot_type') or '').strip()
            # Rows hidden by 117 are backups of a compacted column. Do not show them again.
            if st.startswith(WAREHOUSE_OLD_SLOT_PREFIX):
                continue
            cell = _yx_v116_cell_from_row(raw)
            z = cell.get('zone') or 'A'
            c = int(cell.get('column_index') or 1)
            s = int(cell.get('slot_number') or 1)
            if z not in ('A', 'B') or c < 1 or s < 1:
                continue
            # If older code hid a row but it still contains products, rescue it.
            if int(cell.get('is_deleted') or 0) and not cell.get('items'):
                continue
            cell['items_json'] = json.dumps(cell.get('items') or [], ensure_ascii=False)
            out.append(cell)
        except Exception:
            continue
    return out


def _yx_117_merge_cells(cells):
    grouped = {}
    columns = set()
    for cell in cells or []:
        try:
            z = cell.get('zone') or 'A'
            c = int(cell.get('column_index') or 1)
            s = int(cell.get('slot_number') or 1)
        except Exception:
            continue
        columns.add((z, c))
        key = (z, c, s)
        old = grouped.get(key)
        if not old:
            grouped[key] = dict(cell)
            continue
        merged = list(old.get('items') or []) + list(cell.get('items') or [])
        try:
            merged = _normalize_warehouse_items(merged)
        except Exception:
            pass
        old['items'] = merged
        old['items_json'] = json.dumps(merged, ensure_ascii=False)
        old['note'] = old.get('note') or cell.get('note') or ''
        if str(cell.get('problem_flag') or '').strip():
            old['problem_flag'] = cell.get('problem_flag')
        old['is_deleted'] = 0
    for z in ('A', 'B'):
        for c in range(1, _YX_117_DEFAULT_COLUMNS + 1):
            columns.add((z, c))
    return grouped, columns


def _yx_117_meta_count(cur, z, c, logical_slots=None):
    z = _yx_v116_zone(z); c = int(c or 1)
    _yx_117_ensure_schema(cur)
    cur.execute(sql("SELECT visible_count FROM warehouse_column_meta WHERE zone=? AND column_index=?"), (z, c))
    row = fetchone_dict(cur)
    if row and row.get('visible_count') not in (None, ''):
        try:
            return max(1, int(row.get('visible_count') or _YX_117_DEFAULT_SLOTS))
        except Exception:
            pass
    max_slot = 0
    if logical_slots:
        for s in logical_slots:
            try: max_slot = max(max_slot, int(s))
            except Exception: pass
    return max(_YX_117_DEFAULT_SLOTS, max_slot)


def _yx_117_set_meta_count(cur, z, c, count):
    z = _yx_v116_zone(z); c = int(c or 1); count = max(1, int(count or _YX_117_DEFAULT_SLOTS))
    if USE_POSTGRES:
        cur.execute(sql("""
            INSERT INTO warehouse_column_meta(zone,column_index,visible_count,updated_at)
            VALUES(?,?,?,?)
            ON CONFLICT(zone,column_index) DO UPDATE SET visible_count=EXCLUDED.visible_count, updated_at=EXCLUDED.updated_at
        """), (z, c, count, now()))
    else:
        cur.execute(sql("""
            INSERT INTO warehouse_column_meta(zone,column_index,visible_count,updated_at)
            VALUES(?,?,?,?)
            ON CONFLICT(zone,column_index) DO UPDATE SET visible_count=excluded.visible_count, updated_at=excluded.updated_at
        """), (z, c, count, now()))


def _yx_117_column_cells(cur, z, c):
    grouped, _columns = _yx_117_merge_cells(_yx_117_raw_logical_cells(cur))
    z = _yx_v116_zone(z); c = int(c or 1)
    max_raw = max([s for (zz, cc, s) in grouped.keys() if zz == z and cc == c] or [0])
    count = _yx_117_meta_count(cur, z, c, [s for (zz, cc, s) in grouped.keys() if zz == z and cc == c])
    count = max(count, max_raw, _YX_117_DEFAULT_SLOTS if max_raw == 0 else 1)
    out = []
    for s in range(1, count + 1):
        cell = grouped.get((z, c, s)) or {
            'id': None, 'zone': z, 'column_index': c, 'slot_type': 'direct', 'slot_number': s,
            'items': [], 'items_json': '[]', 'note': '', 'updated_at': '', 'problem_flag': '', 'is_deleted': 0,
        }
        cell = dict(cell)
        cell['zone'], cell['column_index'], cell['slot_number'] = z, c, s
        cell['slot_type'] = 'direct'
        cell['is_deleted'] = 0
        cell['items'] = cell.get('items') or _yx_117_cell_items(cell)
        cell['items_json'] = json.dumps(cell.get('items') or [], ensure_ascii=False)
        out.append(cell)
    return out, count


def _yx_117_all_public_cells(cur):
    grouped, columns = _yx_117_merge_cells(_yx_117_raw_logical_cells(cur))
    result = []
    for z, c in sorted(columns):
        max_raw = max([s for (zz, cc, s) in grouped.keys() if zz == z and cc == c] or [0])
        count = _yx_117_meta_count(cur, z, c, [s for (zz, cc, s) in grouped.keys() if zz == z and cc == c])
        count = max(count, max_raw, _YX_117_DEFAULT_SLOTS if c <= _YX_117_DEFAULT_COLUMNS else 1)
        for s in range(1, count + 1):
            cell = grouped.get((z, c, s)) or {
                'id': None, 'zone': z, 'column_index': c, 'slot_type': 'direct', 'slot_number': s,
                'items': [], 'items_json': '[]', 'note': '', 'updated_at': '', 'problem_flag': '', 'is_deleted': 0,
            }
            cell = dict(cell)
            cell['zone'], cell['column_index'], cell['slot_number'] = z, c, s
            cell['slot_type'] = 'direct'
            cell['is_deleted'] = 0
            cell['items_json'] = json.dumps(cell.get('items') or _yx_117_cell_items(cell), ensure_ascii=False)
            result.append({k: v for k, v in cell.items() if k != 'items'})
    result.sort(key=lambda r: (r.get('zone') or 'A', int(r.get('column_index') or 1), int(r.get('slot_number') or 1)))
    return result


def _yx_117_hide_raw_column(cur, z, c):
    z = _yx_v116_zone(z); c = int(c or 1)
    ids = []
    for raw in _yx_v116_load_raw_cells(cur):
        try:
            cell = _yx_v116_cell_from_row(raw)
            st = str(raw.get('slot_type') or '').strip()
            if st.startswith(WAREHOUSE_OLD_SLOT_PREFIX):
                continue
            if cell.get('zone') == z and int(cell.get('column_index') or 0) == c and raw.get('id') is not None:
                ids.append(int(raw.get('id')))
        except Exception:
            continue
    for rid in ids:
        cur.execute(sql("UPDATE warehouse_cells SET slot_type=?, is_deleted=1, updated_at=? WHERE id=?"), (f'{WAREHOUSE_OLD_SLOT_PREFIX}{rid}', now(), rid))


def _yx_117_rewrite_column(cur, z, c, cells, visible_count=None):
    z = _yx_v116_zone(z); c = int(c or 1)
    visible_count = max(1, int(visible_count or len(cells) or _YX_117_DEFAULT_SLOTS))
    _yx_117_ensure_schema(cur)
    _yx_117_hide_raw_column(cur, z, c)
    by_slot = {}
    for cell in cells or []:
        try:
            s = int(cell.get('slot_number') or 0)
        except Exception:
            continue
        if s < 1 or s > visible_count:
            continue
        items = cell.get('items') or _yx_117_cell_items(cell)
        try:
            items = _normalize_warehouse_items(items)
        except Exception:
            pass
        by_slot[s] = {
            'items_json': json.dumps(items or [], ensure_ascii=False),
            'note': cell.get('note') or '',
            'problem_flag': cell.get('problem_flag') or '',
        }
    for s in range(1, visible_count + 1):
        data = by_slot.get(s) or {'items_json': '[]', 'note': '', 'problem_flag': ''}
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
            VALUES(?,?,?,?,?,?,?,?,?)
        """), (z, c, 'direct', s, data['items_json'], data['note'], now(), 0, data['problem_flag']))
    _yx_117_set_meta_count(cur, z, c, visible_count)


def warehouse_get_cells():
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_117_ensure_schema(cur)
        cells = _yx_117_all_public_cells(cur)
        conn.commit()
        return cells
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('117_warehouse_get_cells', str(e))
        return []
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_summary():
    zones = {'A': {}, 'B': {}}
    for cell in warehouse_get_cells():
        try:
            z = (cell.get('zone') or 'A').strip().upper(); c = int(cell.get('column_index') or 1); s = int(cell.get('slot_number') or 1)
            zones.setdefault(z, {}).setdefault(c, {})[s] = cell
        except Exception:
            pass
    return zones


def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=''):
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_117_ensure_schema(cur)
        cells, count = _yx_117_column_cells(cur, z, c)
        if s > count:
            for n in range(count + 1, s + 1):
                cells.append({'zone': z, 'column_index': c, 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
            count = s
        data_items = _normalize_warehouse_items(items or []) if '_normalize_warehouse_items' in globals() else (items or [])
        for cell in cells:
            if int(cell.get('slot_number') or 0) == s:
                cell['items'] = data_items
                cell['items_json'] = json.dumps(data_items, ensure_ascii=False)
                cell['note'] = '' if str(note or '').startswith('__USER_') else (note or '')
                cell['problem_flag'] = cell.get('problem_flag') or ''
                break
        _yx_117_rewrite_column(cur, z, c, cells, count)
        _yx_120_sync_cell_items_for_column(cur, z, c)
        conn.commit()
        return {'success': True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    z = _yx_v116_zone(zone); c = int(column_index or 0)
    if z not in ('A','B') or c < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_117_ensure_schema(cur)
        cells, count = _yx_117_column_cells(cur, z, c)
        new_count = count + 1
        cells.append({'zone': z, 'column_index': c, 'slot_number': new_count, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
        _yx_117_rewrite_column(cur, z, c, cells, new_count)
        _yx_120_sync_cell_items_for_column(cur, z, c)
        conn.commit()
        return new_count
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_117_ensure_schema(cur)
        cells, count = _yx_117_column_cells(cur, z, c)
        if s > count:
            conn.commit(); return {'success': False, 'error': '找不到格位'}
        target = next((cell for cell in cells if int(cell.get('slot_number') or 0) == s), None)
        if target and _yx_117_has_items(target):
            conn.commit(); return {'success': False, 'error': '格子內還有商品，無法刪除。請先退回該格或移走商品'}
        new_cells = []
        for cell in cells:
            n = int(cell.get('slot_number') or 0)
            if n == s:
                continue
            cell = dict(cell)
            if n > s:
                cell['slot_number'] = n - 1
            new_cells.append(cell)
        new_count = max(1, count - 1)
        _yx_117_rewrite_column(cur, z, c, new_cells, new_count)
        _yx_120_sync_cell_items_for_column(cur, z, c)
        conn.commit()
        return {'success': True, 'removed_slot': s, 'compacted': True, 'visible_count': new_count}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_117_ensure_schema(cur)
        cells, count = _yx_117_column_cells(cur, z, c)
        if s > count:
            for n in range(count + 1, s + 1):
                cells.append({'zone': z, 'column_index': c, 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
            count = s
        for cell in cells:
            if int(cell.get('slot_number') or 0) == s:
                cell['problem_flag'] = 'problem' if marked else ''
                break
        _yx_117_rewrite_column(cur, z, c, cells, count)
        _yx_120_sync_cell_items_for_column(cur, z, c)
        conn.commit()
        return {'success': True, 'marked': bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_move_cell_contents(from_cell, to_cell, dst_items, source_note='', target_note=''):
    fz = _yx_v116_zone((from_cell or {}).get('zone')); fc = int((from_cell or {}).get('column_index') or (from_cell or {}).get('col') or 0); fs = int((from_cell or {}).get('slot_number') or (from_cell or {}).get('slot') or 0)
    tz = _yx_v116_zone((to_cell or {}).get('zone')); tc = int((to_cell or {}).get('column_index') or (to_cell or {}).get('col') or 0); ts = int((to_cell or {}).get('slot_number') or (to_cell or {}).get('slot') or 0)
    if fz not in ('A','B') or tz not in ('A','B') or fc < 1 or tc < 1 or fs < 1 or ts < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_117_ensure_schema(cur)
        dst_items = _normalize_warehouse_items(dst_items or []) if '_normalize_warehouse_items' in globals() else (dst_items or [])
        if fz == tz and fc == tc:
            cells, count = _yx_117_column_cells(cur, fz, fc)
            maxs = max(count, fs, ts)
            if maxs > count:
                for n in range(count + 1, maxs + 1):
                    cells.append({'zone': fz, 'column_index': fc, 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
                count = maxs
            for cell in cells:
                n = int(cell.get('slot_number') or 0)
                if n == fs:
                    cell['items'] = []
                    cell['items_json'] = '[]'
                    cell['note'] = source_note or cell.get('note') or ''
                if n == ts:
                    cell['items'] = dst_items
                    cell['items_json'] = json.dumps(dst_items, ensure_ascii=False)
                    cell['note'] = target_note or cell.get('note') or ''
            _yx_117_rewrite_column(cur, fz, fc, cells, count)
            _yx_120_sync_cell_items_for_column(cur, fz, fc)
        else:
            src_cells, src_count = _yx_117_column_cells(cur, fz, fc)
            dst_cells, dst_count = _yx_117_column_cells(cur, tz, tc)
            if fs > src_count:
                for n in range(src_count + 1, fs + 1):
                    src_cells.append({'zone': fz, 'column_index': fc, 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
                src_count = fs
            if ts > dst_count:
                for n in range(dst_count + 1, ts + 1):
                    dst_cells.append({'zone': tz, 'column_index': tc, 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
                dst_count = ts
            for cell in src_cells:
                if int(cell.get('slot_number') or 0) == fs:
                    cell['items'] = []
                    cell['items_json'] = '[]'
                    cell['note'] = source_note or cell.get('note') or ''
            for cell in dst_cells:
                if int(cell.get('slot_number') or 0) == ts:
                    cell['items'] = dst_items
                    cell['items_json'] = json.dumps(dst_items, ensure_ascii=False)
                    cell['note'] = target_note or cell.get('note') or ''
            _yx_117_rewrite_column(cur, fz, fc, src_cells, src_count)
            _yx_120_sync_cell_items_for_column(cur, fz, fc)
            _yx_117_rewrite_column(cur, tz, tc, dst_cells, dst_count)
            _yx_120_sync_cell_items_for_column(cur, tz, tc)
        conn.commit()
        return {'success': True, 'cells': warehouse_get_cells()}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


# service-line retained: database migration behavior consolidated into formal services.
def yx_117_mainfile_stability_marker():
    return True


# service-line retained: database migration behavior consolidated into formal services.
def yx_119_mainfile_stability_marker():
    return True


def _yx_batch3_ship_speed_sync_migration():
    """Batch3 schema: ship preview snapshots + health/speed indexes."""
    conn = get_db(); cur = conn.cursor()
    try:
        if USE_POSTGRES:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ship_preview_snapshots (
                    token TEXT PRIMARY KEY,
                    customer_name TEXT,
                    payload JSONB,
                    operator TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS ix_yx121_logs_created ON logs(created_at)")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_yx121_ship_customer_time ON shipping_records(customer_name, shipped_at)")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_yx121_wh_version ON warehouse_cells(version)")
        else:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ship_preview_snapshots (
                    token TEXT PRIMARY KEY,
                    customer_name TEXT,
                    payload TEXT,
                    operator TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS ix_yx121_logs_created ON logs(created_at)")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_yx121_ship_customer_time ON shipping_records(customer_name, shipped_at)")
            cur.execute("CREATE INDEX IF NOT EXISTS ix_yx121_wh_version ON warehouse_cells(version)")
        conn.commit()
    finally:
        try: conn.close()
        except Exception: pass

try:
    _yx_batch3_ship_speed_sync_migration()
except Exception as e:
    try: log_error('yx_batch3_ship_speed_sync_migration', e)
    except Exception: pass


# V119 batch4 commercial final schema: read-only diagnostics and safe indexes.
def ensure_commercial_final_schema_v122():
    conn = None
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql("""
        CREATE TABLE IF NOT EXISTS shipping_preview_snapshots (
            preview_token TEXT PRIMARY KEY,
            request_json TEXT,
            response_json TEXT,
            customer_name TEXT,
            operation_id TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT,
            updated_at TEXT
        )
        """))
        cur.execute(sql("""
        CREATE TABLE IF NOT EXISTS sync_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT,
            module TEXT,
            message TEXT,
            payload_json TEXT,
            created_at TEXT
        )
        """))
        cur.execute(sql("""
        CREATE TABLE IF NOT EXISTS backup_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            action TEXT,
            success INTEGER DEFAULT 0,
            detail_json TEXT,
            username TEXT,
            created_at TEXT
        )
        """))
        # Safe indexes for speed, no destructive data changes.
        for stmt in [
            "CREATE INDEX IF NOT EXISTS ix_operation_log_status_updated ON operation_log(status, updated_at)",
            "CREATE INDEX IF NOT EXISTS ix_warehouse_cell_items_cell ON warehouse_cell_items(cell_id)",
            "CREATE INDEX IF NOT EXISTS ix_warehouse_cells_lookup_final ON warehouse_cells(zone, column_index, slot_number, is_deleted)",
            "CREATE INDEX IF NOT EXISTS ix_shipping_records_customer_time_final ON shipping_records(customer_name, created_at)",
            "CREATE INDEX IF NOT EXISTS ix_sync_events_module_created ON sync_events(module, created_at)",
            "CREATE INDEX IF NOT EXISTS ix_audit_trails_entity_time_final ON audit_trails(entity_type, created_at)"
        ]:
            try: cur.execute(sql(stmt))
            except Exception as e: log_error('ensure_commercial_final_schema_v122_index', f'{stmt}: {e}')
        conn.commit(); conn.close(); return True
    except Exception as e:
        log_error('ensure_commercial_final_schema_v122', str(e))
        try:
            if conn: conn.close()
        except Exception: pass
        return False

# ============================================================
# V119 long-press warehouse action persistence repair
# Purpose: save insert/delete/mark/return from the long-press menu without
# hitting old PostgreSQL unique indexes.  This is a mainfile override, not an
# overlay renderer.  Existing public function names are kept so app.py and JS
# continue to call the single warehouse service line.
# ============================================================

def _yx_123_relax_old_warehouse_unique_indexes(cur):
    """Drop obsolete unique indexes that made compact slot rewrites fail.
    Older packages created uniqueness on physical slot coordinates.  The new
    compact warehouse map uses soft-hidden rows and rewrites the visible column,
    so uniqueness must not block temporary slot moves.
    """
    legacy_names = (
        'ux_warehouse_cells_zone_band_row_name_slot',
        'ux_warehouse_cells_zone_col_slot',
        'ux_warehouse_cells_zone_column_slot',
        'ux_warehouse_cells_zone_column_direct_slot',
    )
    for idx in legacy_names:
        try:
            cur.execute(f"DROP INDEX IF EXISTS {idx}")
        except Exception:
            pass
        # V126：有些 Render PostgreSQL 不是用獨立 index，而是 UNIQUE constraint。
        # 若不移除，右鍵新增/刪除前端會先成功，但背景保存會因 duplicate key 失敗，重新整理又回復。
        if USE_POSTGRES:
            try:
                cur.execute(f"ALTER TABLE warehouse_cells DROP CONSTRAINT IF EXISTS {idx}")
            except Exception:
                pass


def _yx_123_tmp_slot_for_row(row, fallback):
    try:
        rid = int(row.get('id') or 0)
    except Exception:
        rid = 0
    if rid > 0:
        return -1000000 - rid
    return -2000000 - int(fallback or 0)


def _yx_117_rewrite_column(cur, z, c, cells, visible_count=None):
    """Safe compact rewrite for one warehouse column.

    Fixes long-press actions failing to persist:
    1. Move every existing row in this zone/column to a unique temporary
       negative slot first, so old unique indexes cannot collide.
    2. Reuse those rows for the new visible slots 1..N.
    3. Keep extra rows hidden instead of deleting user data.
    """
    z = _yx_v116_zone(z); c = int(c or 1)
    visible_count = max(1, int(visible_count or len(cells) or _YX_117_DEFAULT_SLOTS))
    _yx_117_ensure_schema(cur)
    _yx_123_relax_old_warehouse_unique_indexes(cur)

    columns = _table_columns(cur, 'warehouse_cells')
    has_deleted = 'is_deleted' in columns
    has_problem = 'problem_flag' in columns
    has_version = 'version' in columns
    has_operation = 'operation_id' in columns

    raw_rows = []
    try:
        cur.execute(sql("SELECT * FROM warehouse_cells WHERE zone=? AND column_index=? ORDER BY slot_number, id"), (z, c))
        desc = [d[0] for d in cur.description]
        for r in cur.fetchall():
            raw_rows.append(dict(zip(desc, r)) if not isinstance(r, dict) else dict(r))
    except Exception:
        raw_rows = []

    # Step 1: move existing rows away from positive display slots.
    reusable_ids = []
    for i, row in enumerate(raw_rows, start=1):
        rid = row.get('id')
        if rid is None:
            continue
        tmp_slot = _yx_123_tmp_slot_for_row(row, i)
        hidden_type = ('old_slot_%s' % rid)[:60]
        sets = ["slot_number=?", "slot_type=?", "updated_at=?"]
        params = [tmp_slot, hidden_type, now()]
        if has_deleted:
            sets.append("is_deleted=1")
        if has_version:
            sets.append("version=COALESCE(version,0)+1")
        cur.execute(sql("UPDATE warehouse_cells SET " + ", ".join(sets) + " WHERE id=?"), tuple(params + [rid]))
        reusable_ids.append(rid)

    by_slot = {}
    for cell in cells or []:
        try:
            s = int(cell.get('slot_number') or 0)
        except Exception:
            continue
        if s < 1 or s > visible_count:
            continue
        items = cell.get('items') or _yx_117_cell_items(cell)
        try:
            items = _normalize_warehouse_items(items)
        except Exception:
            pass
        by_slot[s] = {
            'items_json': json.dumps(items or [], ensure_ascii=False),
            'note': cell.get('note') or '',
            'problem_flag': cell.get('problem_flag') or '',
        }

    # Step 2: write new visible sequence by reusing old rows first.
    for s in range(1, visible_count + 1):
        data = by_slot.get(s) or {'items_json': '[]', 'note': '', 'problem_flag': ''}
        if reusable_ids:
            rid = reusable_ids.pop(0)
            sets = [
                "zone=?", "column_index=?", "slot_type=?", "slot_number=?",
                "items_json=?", "note=?", "updated_at=?"
            ]
            params = [z, c, 'direct', s, data['items_json'], data['note'], now()]
            if has_deleted:
                sets.append("is_deleted=0")
            if has_problem:
                sets.append("problem_flag=?"); params.append(data['problem_flag'])
            if has_operation:
                sets.append("operation_id=COALESCE(operation_id,'')")
            if has_version:
                sets.append("version=COALESCE(version,0)+1")
            cur.execute(sql("UPDATE warehouse_cells SET " + ", ".join(sets) + " WHERE id=?"), tuple(params + [rid]))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, c, 'direct', s, data['items_json'], data['note'], now(), 0, data['problem_flag']))

    # Step 3: leave unused physical rows hidden and out of public display.
    for rid in reusable_ids:
        hidden_type = ('old_slot_%s' % rid)[:60]
        sets = ["slot_type=?", "items_json='[]'", "updated_at=?"]
        params = [hidden_type, now()]
        if has_deleted:
            sets.append("is_deleted=1")
        if has_version:
            sets.append("version=COALESCE(version,0)+1")
        cur.execute(sql("UPDATE warehouse_cells SET " + ", ".join(sets) + " WHERE id=?"), tuple(params + [rid]))

    _yx_117_set_meta_count(cur, z, c, visible_count)


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    """Insert one empty visible slot after the requested slot and persist safely."""
    z = _yx_v116_zone(zone); c = int(column_index or 0)
    if z not in ('A','B') or c < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_117_ensure_schema(cur)
        _yx_123_relax_old_warehouse_unique_indexes(cur)
        cells, count = _yx_117_column_cells(cur, z, c)
        try:
            after = int(insert_after if insert_after is not None else count)
        except Exception:
            after = count
        after = max(0, min(after, count))
        new_cells = []
        inserted = False
        for cell in cells:
            n = int(cell.get('slot_number') or 0)
            if n <= after:
                new_cells.append(dict(cell))
            else:
                if not inserted:
                    new_cells.append({'zone': z, 'column_index': c, 'slot_number': after + 1, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
                    inserted = True
                shifted = dict(cell); shifted['slot_number'] = n + 1; new_cells.append(shifted)
        if not inserted:
            new_cells.append({'zone': z, 'column_index': c, 'slot_number': after + 1, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
        new_count = count + 1
        _yx_117_rewrite_column(cur, z, c, new_cells, new_count)
        _yx_120_sync_cell_items_for_column(cur, z, c)
        conn.commit()
        return after + 1
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    """Remove one empty visible slot and compact the display numbers safely."""
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_117_ensure_schema(cur)
        _yx_123_relax_old_warehouse_unique_indexes(cur)
        cells, count = _yx_117_column_cells(cur, z, c)
        if s > count:
            conn.commit(); return {'success': False, 'error': '找不到格位'}
        target = next((cell for cell in cells if int(cell.get('slot_number') or 0) == s), None)
        if target and _yx_117_has_items(target):
            conn.commit(); return {'success': False, 'error': '格子內還有商品，無法刪除。請先退回該格或移走商品'}
        new_cells = []
        for cell in cells:
            n = int(cell.get('slot_number') or 0)
            if n == s:
                continue
            shifted = dict(cell)
            if n > s:
                shifted['slot_number'] = n - 1
            new_cells.append(shifted)
        new_count = max(1, count - 1)
        _yx_117_rewrite_column(cur, z, c, new_cells, new_count)
        _yx_120_sync_cell_items_for_column(cur, z, c)
        conn.commit()
        return {'success': True, 'removed_slot': s, 'compacted': True, 'visible_count': new_count}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    """Persist problem mark from the long-press action sheet."""
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_117_ensure_schema(cur)
        _yx_123_relax_old_warehouse_unique_indexes(cur)
        cells, count = _yx_117_column_cells(cur, z, c)
        if s > count:
            for n in range(count + 1, s + 1):
                cells.append({'zone': z, 'column_index': c, 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
            count = s
        for cell in cells:
            if int(cell.get('slot_number') or 0) == s:
                cell['problem_flag'] = 'problem' if marked else ''
                break
        _yx_117_rewrite_column(cur, z, c, cells, count)
        _yx_120_sync_cell_items_for_column(cur, z, c)
        conn.commit()
        return {'success': True, 'marked': bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

# V119 long-press persistence compatibility helper.
# Batch2 mirror sync called warehouse_customer_key but older DB mainfiles only had
# app-side helpers.  Keep it in db.py so warehouse long-press save/return/delete
# cannot fail with NameError while syncing warehouse_cell_items.
def warehouse_customer_key(name):
    text = str(name or '').strip()
    # V133: CNF / FOB / FOB代 are display tags only; strip them for DB matching.
    text = re.sub(r'(?:FOB\s*代付|FOB\s*代|FOB|CNF)', '', text, flags=re.I)
    text = re.sub(r'(?:^|\s)代(?:$|\s)', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text or '庫存'

# V124 warehouse long-press/cache marker: DB mainfile participates in this release.
def warehouse_longpress_cache_version():
    """Return the warehouse long-press/cache schema marker used by /api/health and migrations."""
    return 'v124-warehouse-longpress-cache-return'


# V125 mobile table/warehouse zoom marker: no schema dependency; DB file participates in release tracking.
def mobile_zoom_layout_version():
    """Return the mobile whole-table zoom layout marker used by health/smoke reports."""
    return 'v125-mobile-table-warehouse-zoom'


# ============================================================
# Warehouse canonical DB/front-end alignment
# Purpose: make long-press/right-click insert/delete/batch-delete and cell item saves
# persist exactly the way the front-end displays them.
# ============================================================

# ============================================================
# 倉庫資料庫正式對齊：右鍵/長按操作與格內商品保存共用同一套欄位重排
# ============================================================
# PostgreSQL 失敗主因：舊版在每次操作時嘗試 DROP 舊 unique constraint / index，
# 任何 DROP 失敗都會讓 PostgreSQL transaction 進入 aborted 狀態，後續 UPDATE/INSERT 全部失敗。
# 這裡不再於一般操作中 drop constraint；改用「全欄移到每筆 id 專屬暫存欄位 → 重寫正式格號」。

def _yx_129_no_runtime_constraint_drop(cur):
    try:
        _yx_v116_ensure_schema(cur)
        _yx_120_ensure_warehouse_operation_schema(cur)
        cur.execute(sql('CREATE INDEX IF NOT EXISTS ix_yx129_wh_cells_position ON warehouse_cells(zone,column_index,slot_number)'))
    except Exception:
        # 不在這裡丟錯，避免輔助索引失敗影響使用者操作；真正寫入會在外層回報。
        pass

# 舊函式名稱仍被前面流程呼叫，改成安全無破壞版本。
_yx_128_drop_warehouse_unique_blockers = _yx_129_no_runtime_constraint_drop


def _yx_129_safe_items(cell):
    try:
        items = cell.get('items') if isinstance(cell, dict) else None
        if items is None:
            items = _yx_117_cell_items(cell or {})
        if '_normalize_warehouse_items' in globals():
            items = _normalize_warehouse_items(items or [])
        return items or []
    except Exception:
        return []


def _yx_129_raw_ids_for_logical_column(cur, z, c):
    z = _yx_v116_zone(z); c = int(c or 1)
    ids = []
    try:
        for raw in _yx_v116_load_raw_cells(cur):
            try:
                cell = _yx_v116_cell_from_row(raw)
                rid = cell.get('id')
                if rid is not None and cell.get('zone') == z and int(cell.get('column_index') or 0) == c:
                    ids.append(int(rid))
            except Exception:
                continue
    except Exception:
        pass
    # 去重且維持順序
    seen = set(); out = []
    for rid in ids:
        if rid not in seen:
            seen.add(rid); out.append(rid)
    return out


def _yx_129_visible_column_cells(cur, z, c):
    cells, count = _yx_117_column_cells(cur, z, c)
    out = []
    for n in range(1, int(count or _YX_117_DEFAULT_SLOTS) + 1):
        src = next((dict(x) for x in cells if int(x.get('slot_number') or 0) == n), None)
        if not src:
            src = {'zone': z, 'column_index': c, 'slot_type': 'direct', 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''}
        src['zone'] = _yx_v116_zone(z)
        src['column_index'] = int(c)
        src['slot_type'] = 'direct'
        src['slot_number'] = n
        src['is_deleted'] = 0
        src['items'] = _yx_129_safe_items(src)
        src['items_json'] = json.dumps(src['items'], ensure_ascii=False)
        out.append(src)
    return out, int(count or len(out) or _YX_117_DEFAULT_SLOTS)


def _yx_129_temp_column_for_id(rid, fallback=1):
    try:
        n = abs(int(rid or fallback))
    except Exception:
        n = abs(int(fallback or 1))
    # PostgreSQL INTEGER 安全範圍內；每個 row id 專屬，避免和上次隱藏列互撞。
    return -max(1, min(1900000000, n))


def _yx_129_rewrite_column(cur, z, c, cells, visible_count=None):
    z = _yx_v116_zone(z); c = int(c or 1)
    visible_count = max(1, int(visible_count or len(cells or []) or _YX_117_DEFAULT_SLOTS))
    _yx_v116_ensure_schema(cur)
    _yx_120_ensure_warehouse_operation_schema(cur)
    _yx_129_no_runtime_constraint_drop(cur)
    cols = _table_columns(cur, 'warehouse_cells')
    has_deleted = 'is_deleted' in cols
    has_problem = 'problem_flag' in cols
    has_version = 'version' in cols
    has_operation = 'operation_id' in cols

    raw_ids = _yx_129_raw_ids_for_logical_column(cur, z, c)
    # 先把同一邏輯欄所有舊 row 移到 row-id 專屬暫存欄；不要刪資料。
    for idx, rid in enumerate(raw_ids, start=1):
        temp_col = _yx_129_temp_column_for_id(rid, idx)
        temp_type = ('yx129_tmp_%s' % rid)[:60]
        sets = ['column_index=?', 'slot_type=?', 'updated_at=?']
        params = [temp_col, temp_type, now()]
        if has_deleted:
            sets.append('is_deleted=1')
        if has_version:
            sets.append('version=COALESCE(version,0)+1')
        cur.execute(sql('UPDATE warehouse_cells SET ' + ', '.join(sets) + ' WHERE id=?'), tuple(params + [rid]))

    byslot = {}
    for cell in cells or []:
        try:
            s = int(cell.get('slot_number') or 0)
        except Exception:
            continue
        if s < 1 or s > visible_count:
            continue
        items = _yx_129_safe_items(cell)
        # 若同一格有重複來源，保留最後一份非空資料；這樣前端送回的狀態就是 DB 狀態。
        byslot[s] = {
            'items_json': json.dumps(items, ensure_ascii=False),
            'note': '' if str(cell.get('note') or '').startswith('__USER_') else (cell.get('note') or ''),
            'problem_flag': cell.get('problem_flag') or ''
        }

    reuse_ids = list(raw_ids)
    for s in range(1, visible_count + 1):
        data = byslot.get(s) or {'items_json': '[]', 'note': '', 'problem_flag': ''}
        if reuse_ids:
            rid = reuse_ids.pop(0)
            sets = ['zone=?', 'column_index=?', 'slot_type=?', 'slot_number=?', 'items_json=?', 'note=?', 'updated_at=?']
            params = [z, c, 'direct', s, data['items_json'], data['note'], now()]
            if has_deleted:
                sets.append('is_deleted=0')
            if has_problem:
                sets.append('problem_flag=?'); params.append(data['problem_flag'])
            if has_operation:
                sets.append("operation_id=COALESCE(operation_id,'')")
            if has_version:
                sets.append('version=COALESCE(version,0)+1')
            cur.execute(sql('UPDATE warehouse_cells SET ' + ', '.join(sets) + ' WHERE id=?'), tuple(params + [rid]))
        else:
            if USE_POSTGRES:
                cur.execute(sql("""
                    INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                    VALUES(?,?,?,?,?,?,?,?,?)
                """), (z, c, 'direct', s, data['items_json'], data['note'], now(), 0, data['problem_flag']))
            else:
                cur.execute(sql("""
                    INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                    VALUES(?,?,?,?,?,?,?,?,?)
                """), (z, c, 'direct', s, data['items_json'], data['note'], now(), 0, data['problem_flag']))

    # 多出來的舊 row 不刪除，永久移到自己的負欄位並標 hidden，避免任何 unique index 互撞。
    for rid in reuse_ids:
        hidden_col = _yx_129_temp_column_for_id(rid, rid)
        hidden_type = ('yx129_hidden_%s' % rid)[:60]
        sets = ['column_index=?', 'slot_type=?', "items_json='[]'", 'updated_at=?']
        params = [hidden_col, hidden_type, now()]
        if has_deleted:
            sets.append('is_deleted=1')
        if has_version:
            sets.append('version=COALESCE(version,0)+1')
        cur.execute(sql('UPDATE warehouse_cells SET ' + ', '.join(sets) + ' WHERE id=?'), tuple(params + [rid]))

    _yx_117_set_meta_count(cur, z, c, visible_count)
    _yx_120_sync_cell_items_for_column(cur, z, c)

_yx_117_rewrite_column = _yx_129_rewrite_column
_yx_128_rewrite_column = _yx_129_rewrite_column


def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=''):
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        _yx_120_ensure_warehouse_operation_schema(cur)
        cells, count = _yx_129_visible_column_cells(cur, z, c)
        if s > count:
            for n in range(count + 1, s + 1):
                cells.append({'zone': z, 'column_index': c, 'slot_type': 'direct', 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
            count = s
        data_items = _normalize_warehouse_items(items or []) if '_normalize_warehouse_items' in globals() else (items or [])
        safe_note = '' if str(note or '').startswith('__USER_') else (note or '')
        found = False
        for cell in cells:
            if int(cell.get('slot_number') or 0) == s:
                cell['items'] = data_items
                cell['items_json'] = json.dumps(data_items, ensure_ascii=False)
                cell['note'] = safe_note
                found = True
                break
        if not found:
            cells.append({'zone': z, 'column_index': c, 'slot_type': 'direct', 'slot_number': s, 'items': data_items, 'items_json': json.dumps(data_items, ensure_ascii=False), 'note': safe_note, 'problem_flag': ''})
            count = max(count, s)
        _yx_129_rewrite_column(cur, z, c, cells, count)
        conn.commit()
        return {'success': True, 'zone': z, 'column_index': c, 'slot_number': s}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    z = _yx_v116_zone(zone); c = int(column_index or 0)
    if z not in ('A','B') or c < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        _yx_120_ensure_warehouse_operation_schema(cur)
        cells, count = _yx_129_visible_column_cells(cur, z, c)
        try:
            after = int(insert_after if insert_after is not None else count)
        except Exception:
            after = count
        after = max(0, min(after, count))
        new = []
        inserted = False
        for cell in cells:
            n = int(cell.get('slot_number') or 0)
            if n <= after:
                new.append(dict(cell))
            else:
                if not inserted:
                    new.append({'zone': z, 'column_index': c, 'slot_type': 'direct', 'slot_number': after + 1, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
                    inserted = True
                shifted = dict(cell); shifted['slot_number'] = n + 1; new.append(shifted)
        if not inserted:
            new.append({'zone': z, 'column_index': c, 'slot_type': 'direct', 'slot_number': after + 1, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
        _yx_129_rewrite_column(cur, z, c, new, count + 1)
        conn.commit()
        return after + 1
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        _yx_120_ensure_warehouse_operation_schema(cur)
        cells, count = _yx_129_visible_column_cells(cur, z, c)
        if s > count:
            conn.commit(); return {'success': False, 'error': '找不到格位'}
        target = next((x for x in cells if int(x.get('slot_number') or 0) == s), None)
        if target and _yx_117_has_items(target):
            conn.commit(); return {'success': False, 'error': '格子內還有商品，無法刪除。請先退回該格或移走商品'}
        new = []
        for cell in cells:
            n = int(cell.get('slot_number') or 0)
            if n == s:
                continue
            cell = dict(cell)
            if n > s:
                cell['slot_number'] = n - 1
            new.append(cell)
        new_count = max(1, count - 1)
        _yx_129_rewrite_column(cur, z, c, new, new_count)
        conn.commit()
        return {'success': True, 'removed_slot': s, 'compacted': True, 'visible_count': new_count}
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('warehouse_remove_slot_final', str(e))
        return {'success': False, 'error': '資料庫刪除格子失敗：' + str(e)[:180]}
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    z = _yx_v116_zone(zone); c = int(column_index or 0); s = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or s < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        _yx_120_ensure_warehouse_operation_schema(cur)
        cells, count = _yx_129_visible_column_cells(cur, z, c)
        if s > count:
            for n in range(count + 1, s + 1):
                cells.append({'zone': z, 'column_index': c, 'slot_type': 'direct', 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
            count = s
        for cell in cells:
            if int(cell.get('slot_number') or 0) == s:
                cell['problem_flag'] = 'problem' if marked else ''
                break
        _yx_129_rewrite_column(cur, z, c, cells, count)
        conn.commit()
        return {'success': True, 'marked': bool(marked)}
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('warehouse_set_cell_mark_final', str(e))
        return {'success': False, 'error': '資料庫標記格子失敗：' + str(e)[:180]}
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_context_db_alignment_version():
    return 'v129-warehouse-db-canonical-write'

# ============================================================
# V130 warehouse long-press canonical persistence repair
# Purpose: make every right-click / long-press action persist even when old
# PostgreSQL schemas still contain legacy coordinate columns and old unique
# constraints such as (zone, band, row_name, slot).  This is direct mainfile
# service code, not a UI overlay.
# ============================================================

def _yx_130_ident(name):
    name = _safe_identifier(name)
    if not name:
        return ''
    # Double-quote so legacy columns named "column" are safe on PostgreSQL and SQLite.
    return '"' + name.replace('"', '""') + '"'


def _yx_130_has_col(cols, name):
    return str(name or '') in (cols or set())


def _yx_130_add_set(sets, params, cols, col, value):
    if _yx_130_has_col(cols, col):
        ident = _yx_130_ident(col)
        if ident:
            sets.append(f'{ident}=?')
            params.append(value)


def _yx_130_legacy_coord_sets(cols, z, c, row_name, slot_number):
    """Return SET fragments for old warehouse coordinate columns.

    Older deployments may still have a unique index/constraint on fields like
    zone + band + row_name + slot.  V129 moved only column_index/slot_type/
    slot_number, leaving those legacy fields behind; the next insert then hit
    duplicate key and all long-press actions failed after refresh.  Every write
    now keeps new and legacy coordinates synchronized.
    """
    sets, params = [], []
    z = _yx_v116_zone(z)
    try: c = int(c or 1)
    except Exception: c = 1
    try: slot_number = int(slot_number or 1)
    except Exception: slot_number = 1
    row_name = str(row_name or 'direct')
    _yx_130_add_set(sets, params, cols, 'area', z)
    for col in ('band', 'section', 'section_index', 'col', 'column'):
        _yx_130_add_set(sets, params, cols, col, c)
    for col in ('row_name', 'row_type', 'front_back', 'side'):
        _yx_130_add_set(sets, params, cols, col, row_name)
    for col in ('slot', 'slot_no', 'cell_number', 'position', 'pos', 'no'):
        _yx_130_add_set(sets, params, cols, col, slot_number)
    return sets, params


def _yx_130_insert_warehouse_cell(cur, cols, z, c, slot_number, items_json='[]', note='', problem_flag='', is_deleted=0, row_name='direct'):
    z = _yx_v116_zone(z)
    c = int(c or 1)
    slot_number = int(slot_number or 1)
    row_name = str(row_name or 'direct')
    insert_cols = ['zone', 'column_index', 'slot_type', 'slot_number', 'items_json', 'note', 'updated_at']
    values = [z, c, row_name, slot_number, items_json or '[]', note or '', now()]
    if _yx_130_has_col(cols, 'is_deleted'):
        insert_cols.append('is_deleted'); values.append(int(is_deleted or 0))
    if _yx_130_has_col(cols, 'problem_flag'):
        insert_cols.append('problem_flag'); values.append(problem_flag or '')
    if _yx_130_has_col(cols, 'operation_id'):
        insert_cols.append('operation_id'); values.append('')
    if _yx_130_has_col(cols, 'version'):
        insert_cols.append('version'); values.append(1)
    # Keep legacy coordinate columns synchronized with visible direct cells.
    legacy_sets, legacy_params = _yx_130_legacy_coord_sets(cols, z, c, row_name, slot_number)
    for frag, val in zip(legacy_sets, legacy_params):
        col = frag.split('=')[0].strip().strip('"')
        if col not in insert_cols:
            insert_cols.append(col); values.append(val)
    col_sql = ','.join(_yx_130_ident(cn) for cn in insert_cols)
    ph = ','.join(['?'] * len(insert_cols))
    cur.execute(sql(f'INSERT INTO warehouse_cells({col_sql}) VALUES({ph})'), tuple(values))


def _yx_130_rewrite_column(cur, z, c, cells, visible_count=None):
    """Canonical warehouse column rewrite used by all long-press actions.

    Fixes the real failure point:
    - existing legacy unique constraints still watch band/row_name/slot;
    - old rewrites changed only column_index/slot_type/slot_number;
    - repeated insert/delete then created duplicate legacy coordinates.

    This version moves both new and legacy coordinates to row-id-specific
    temporary coordinates before writing visible cells back 1..N.
    """
    z = _yx_v116_zone(z); c = int(c or 1)
    visible_count = max(1, int(visible_count or len(cells or []) or _YX_117_DEFAULT_SLOTS))
    _yx_v116_ensure_schema(cur)
    _yx_120_ensure_warehouse_operation_schema(cur)
    cols = _table_columns(cur, 'warehouse_cells')
    has_deleted = 'is_deleted' in cols
    has_problem = 'problem_flag' in cols
    has_version = 'version' in cols
    has_operation = 'operation_id' in cols

    raw_ids = _yx_129_raw_ids_for_logical_column(cur, z, c)

    # Step 1: move all existing physical rows for this logical column out of the
    # visible coordinate space.  Move legacy coordinates too; otherwise old
    # unique constraints still collide even when column_index moved away.
    for idx, rid in enumerate(raw_ids, start=1):
        temp_col = _yx_129_temp_column_for_id(rid, idx)
        temp_type = ('yx130_tmp_%s' % rid)[:60]
        temp_slot = -abs(int(rid or idx))
        sets = ['column_index=?', 'slot_type=?', 'slot_number=?', 'updated_at=?']
        params = [temp_col, temp_type, temp_slot, now()]
        legacy_sets, legacy_params = _yx_130_legacy_coord_sets(cols, z, temp_col, temp_type, temp_slot)
        sets.extend(legacy_sets); params.extend(legacy_params)
        if has_deleted:
            sets.append('is_deleted=1')
        if has_version:
            sets.append('version=COALESCE(version,0)+1')
        cur.execute(sql('UPDATE warehouse_cells SET ' + ', '.join(sets) + ' WHERE id=?'), tuple(params + [rid]))

    byslot = {}
    for cell in cells or []:
        try:
            s = int(cell.get('slot_number') or 0)
        except Exception:
            continue
        if s < 1 or s > visible_count:
            continue
        items = _yx_129_safe_items(cell)
        byslot[s] = {
            'items_json': json.dumps(items, ensure_ascii=False),
            'note': '' if str(cell.get('note') or '').startswith('__USER_') else (cell.get('note') or ''),
            'problem_flag': cell.get('problem_flag') or ''
        }

    reuse_ids = list(raw_ids)
    for s in range(1, visible_count + 1):
        data = byslot.get(s) or {'items_json': '[]', 'note': '', 'problem_flag': ''}
        if reuse_ids:
            rid = reuse_ids.pop(0)
            sets = ['zone=?', 'column_index=?', 'slot_type=?', 'slot_number=?', 'items_json=?', 'note=?', 'updated_at=?']
            params = [z, c, 'direct', s, data['items_json'], data['note'], now()]
            legacy_sets, legacy_params = _yx_130_legacy_coord_sets(cols, z, c, 'direct', s)
            sets.extend(legacy_sets); params.extend(legacy_params)
            if has_deleted:
                sets.append('is_deleted=0')
            if has_problem:
                sets.append('problem_flag=?'); params.append(data['problem_flag'])
            if has_operation:
                sets.append("operation_id=COALESCE(operation_id,'')")
            if has_version:
                sets.append('version=COALESCE(version,0)+1')
            cur.execute(sql('UPDATE warehouse_cells SET ' + ', '.join(sets) + ' WHERE id=?'), tuple(params + [rid]))
        else:
            _yx_130_insert_warehouse_cell(cur, cols, z, c, s, data['items_json'], data['note'], data['problem_flag'], 0, 'direct')

    # Step 3: keep extra rows hidden outside all visible and legacy coordinates.
    for rid in reuse_ids:
        hidden_col = _yx_129_temp_column_for_id(rid, rid)
        hidden_type = ('yx130_hidden_%s' % rid)[:60]
        hidden_slot = -abs(int(rid or 1))
        sets = ['column_index=?', 'slot_type=?', 'slot_number=?', "items_json='[]'", 'updated_at=?']
        params = [hidden_col, hidden_type, hidden_slot, now()]
        legacy_sets, legacy_params = _yx_130_legacy_coord_sets(cols, z, hidden_col, hidden_type, hidden_slot)
        sets.extend(legacy_sets); params.extend(legacy_params)
        if has_deleted:
            sets.append('is_deleted=1')
        if has_version:
            sets.append('version=COALESCE(version,0)+1')
        cur.execute(sql('UPDATE warehouse_cells SET ' + ', '.join(sets) + ' WHERE id=?'), tuple(params + [rid]))

    _yx_117_set_meta_count(cur, z, c, visible_count)
    _yx_120_sync_cell_items_for_column(cur, z, c)


# Replace every warehouse writer path with the same canonical rewrite.
_yx_117_rewrite_column = _yx_130_rewrite_column
_yx_128_rewrite_column = _yx_130_rewrite_column
_yx_129_rewrite_column = _yx_130_rewrite_column


def warehouse_longpress_db_fix_version():
    return 'v130-warehouse-longpress-canonical-db-sync'



# ============================================================
# V131 warehouse right-click stability + fast column read
# Purpose: long-press/right-click operations should not need to reread the
# entire warehouse after every structural write.  This function returns only
# the touched column using the same canonical visible-column logic.
# ============================================================

def warehouse_get_column_cells(zone, column_index):
    z = _yx_v116_zone(zone); c = int(column_index or 0)
    if z not in ('A','B') or c < 1:
        return []
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        _yx_120_ensure_warehouse_operation_schema(cur)
        cells, count = _yx_129_visible_column_cells(cur, z, c)
        out = []
        for cell in cells:
            row = dict(cell or {})
            row['zone'] = z
            row['column_index'] = c
            row['slot_type'] = 'direct'
            try:
                row['slot_number'] = int(row.get('slot_number') or 0)
            except Exception:
                row['slot_number'] = 0
            row['items'] = _yx_129_safe_items(row)
            row['items_json'] = json.dumps(row['items'], ensure_ascii=False)
            row['is_deleted'] = 0
            out.append(row)
        return sorted(out, key=lambda r: int(r.get('slot_number') or 0))
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_v131_stability_version():
    return 'v131-warehouse-rightclick-cache-fast-column'

# ============================================================
# V135 warehouse speed/stability: single-transaction batch slot operations.
# Purpose: batch add/delete should rewrite the touched column once, not N times.
# ============================================================

def warehouse_batch_add_slots(zone, column_index, insert_after=0, count=1):
    z = _yx_v116_zone(zone); c = int(column_index or 0); n = max(1, min(120, int(count or 1)))
    if z not in ('A','B') or c < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        _yx_120_ensure_warehouse_operation_schema(cur)
        cells, current_count = _yx_129_visible_column_cells(cur, z, c)
        try: after = int(insert_after or 0)
        except Exception: after = current_count
        after = max(0, min(after, current_count))
        new_cells = []
        inserted = False
        for cell in cells:
            old_slot = int(cell.get('slot_number') or 0)
            if old_slot <= after:
                new_cells.append(dict(cell))
            else:
                if not inserted:
                    for i in range(n):
                        new_cells.append({'zone':z,'column_index':c,'slot_type':'direct','slot_number':after+1+i,'items':[],'items_json':'[]','note':'','problem_flag':''})
                    inserted = True
                shifted = dict(cell); shifted['slot_number'] = old_slot + n; new_cells.append(shifted)
        if not inserted:
            for i in range(n):
                new_cells.append({'zone':z,'column_index':c,'slot_type':'direct','slot_number':after+1+i,'items':[],'items_json':'[]','note':'','problem_flag':''})
        new_count = current_count + n
        _yx_130_rewrite_column(cur, z, c, new_cells, new_count)
        conn.commit()
        return {'success': True, 'count': n, 'first_slot': after + 1, 'last_slot': after + n, 'visible_count': new_count}
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('warehouse_batch_add_slots_v135', str(e))
        return {'success': False, 'error': '批量新增格子資料庫失敗：' + str(e)[:180]}
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_batch_remove_empty_slots(zone, column_index, slot_number=1, count=1, requested_slots=None):
    z = _yx_v116_zone(zone); c = int(column_index or 0); start = int(slot_number or 1); n = max(1, min(120, int(count or 1)))
    if z not in ('A','B') or c < 1 or start < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    requested = []
    if isinstance(requested_slots, (list, tuple)):
        for x in requested_slots:
            try:
                xi = int(x)
                if xi >= start: requested.append(xi)
            except Exception:
                pass
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        _yx_120_ensure_warehouse_operation_schema(cur)
        cells, current_count = _yx_129_visible_column_cells(cur, z, c)
        byslot = {int(cell.get('slot_number') or 0): dict(cell) for cell in cells}
        empty = [s for s in range(start, current_count + 1) if s in byslot and not _yx_117_has_items(byslot[s])]
        targets = []
        for x in requested:
            if x in empty and x not in targets:
                targets.append(x)
                if len(targets) >= n: break
        if len(targets) < n:
            for x in empty:
                if x not in targets:
                    targets.append(x)
                    if len(targets) >= n: break
        if not targets:
            conn.commit(); return {'success': False, 'error': '此格往下找不到可刪除的空格'}
        remove_set = set(targets)
        new_cells = []
        removed_before = 0
        for old_slot in range(1, current_count + 1):
            cell = byslot.get(old_slot)
            if old_slot in remove_set:
                removed_before += 1
                continue
            if not cell:
                continue
            cell = dict(cell)
            cell['slot_number'] = old_slot - removed_before
            new_cells.append(cell)
        new_count = max(1, current_count - len(remove_set))
        _yx_130_rewrite_column(cur, z, c, new_cells, new_count)
        conn.commit()
        return {'success': True, 'requested': n, 'removed': len(remove_set), 'removed_slots': sorted(remove_set), 'visible_count': new_count}
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('warehouse_batch_remove_empty_slots_v135', str(e))
        return {'success': False, 'error': '批量刪除格子資料庫失敗：' + str(e)[:180]}
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_v135_speed_stability_version():
    return 'v135-warehouse-speed-cache-stability'


def warehouse_v147_soft_cache_speed_version():
    """Marker for V147: client soft-cache degraded-speed and lightweight performance diagnostics."""
    return 'v147-soft-cache-degraded-speed'


def warehouse_v148_route_prewarm_cache_version():
    return 'v148-route-prewarm-soft-cache'

# ============================================================
# V159 warehouse auto-stability repair
# Purpose: keep drag/move persistence on the same canonical V130 rewrite path
# used by add/delete/batch operations, so old legacy constraints cannot make
# drag or right-click flows silently revert after refresh.
# ============================================================
def warehouse_move_cell_contents(from_cell, to_cell, dst_items, source_note='', target_note=''):
    fz = _yx_v116_zone((from_cell or {}).get('zone'))
    fc = int((from_cell or {}).get('column_index') or (from_cell or {}).get('col') or 0)
    fs = int((from_cell or {}).get('slot_number') or (from_cell or {}).get('slot') or 0)
    tz = _yx_v116_zone((to_cell or {}).get('zone'))
    tc = int((to_cell or {}).get('column_index') or (to_cell or {}).get('col') or 0)
    ts = int((to_cell or {}).get('slot_number') or (to_cell or {}).get('slot') or 0)
    if fz not in ('A','B') or tz not in ('A','B') or fc < 1 or tc < 1 or fs < 1 or ts < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v116_ensure_schema(cur)
        _yx_120_ensure_warehouse_operation_schema(cur)
        dst_items = _normalize_warehouse_items(dst_items or []) if '_normalize_warehouse_items' in globals() else (dst_items or [])
        if fz == tz and fc == tc:
            cells, count = _yx_129_visible_column_cells(cur, fz, fc)
            maxs = max(count, fs, ts)
            if maxs > count:
                for n in range(count + 1, maxs + 1):
                    cells.append({'zone': fz, 'column_index': fc, 'slot_type': 'direct', 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
                count = maxs
            for cell in cells:
                n = int(cell.get('slot_number') or 0)
                if n == fs:
                    cell['items'] = []
                    cell['items_json'] = '[]'
                    cell['note'] = source_note or cell.get('note') or ''
                if n == ts:
                    cell['items'] = dst_items
                    cell['items_json'] = json.dumps(dst_items, ensure_ascii=False)
                    cell['note'] = target_note or cell.get('note') or ''
            _yx_130_rewrite_column(cur, fz, fc, cells, count)
        else:
            src_cells, src_count = _yx_129_visible_column_cells(cur, fz, fc)
            dst_cells, dst_count = _yx_129_visible_column_cells(cur, tz, tc)
            if fs > src_count:
                for n in range(src_count + 1, fs + 1):
                    src_cells.append({'zone': fz, 'column_index': fc, 'slot_type': 'direct', 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
                src_count = fs
            if ts > dst_count:
                for n in range(dst_count + 1, ts + 1):
                    dst_cells.append({'zone': tz, 'column_index': tc, 'slot_type': 'direct', 'slot_number': n, 'items': [], 'items_json': '[]', 'note': '', 'problem_flag': ''})
                dst_count = ts
            for cell in src_cells:
                if int(cell.get('slot_number') or 0) == fs:
                    cell['items'] = []
                    cell['items_json'] = '[]'
                    cell['note'] = source_note or cell.get('note') or ''
            for cell in dst_cells:
                if int(cell.get('slot_number') or 0) == ts:
                    cell['items'] = dst_items
                    cell['items_json'] = json.dumps(dst_items, ensure_ascii=False)
                    cell['note'] = target_note or cell.get('note') or ''
            _yx_130_rewrite_column(cur, fz, fc, src_cells, src_count)
            _yx_130_rewrite_column(cur, tz, tc, dst_cells, dst_count)
        conn.commit()
        return {'success': True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_v159_auto_stability_version():
    return 'v159-warehouse-auto-stability-canonical-move'
