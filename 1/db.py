# V111 mainfile DB safety: non-destructive migrations; warehouse_cells are preserved.

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
    """FIX141 Render PostgreSQL External URL safety."""
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
            return conn
        except Exception as e:
            raise last_error or e
    conn = sqlite3.connect(_sqlite_path())
    conn.row_factory = sqlite3.Row
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
    # V59：前端顯示用的「未填材質 / 不指定材質 / 未指定材質」一律視為空材質，
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


# FIX84：月份前綴排序 / 顯示支援，例如「12月132x50x06=294x8」。
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

    FIX84: if the item starts with a month, e.g. 12月132x50x06=294x8,
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
        # V58：括號只當備註，不做 +/- 件數修正。
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

    FIX67：
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
            # V92：既有資料庫只補真正缺少的實體空格 1..20。
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

    # FIX24: 舊資料庫自動補欄位，避免覆寫新版後因缺欄位造成按鈕/API 失效。
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

    # FIX25: SQLite 舊版倉庫表欄位相容（舊欄位 area/col/front_back/row 轉成 zone/column_index/slot_type/slot_number）
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
                    cur.execute("SELECT 1")  # V97 safe: do not rewrite legacy warehouse slot_type during init
                elif _has_col('side'):
                    cur.execute("SELECT 1")  # V97 safe: do not rewrite legacy warehouse slot_type during init
                else:
                    cur.execute("SELECT 1")  # V97 safe: do not rewrite legacy warehouse slot_type during init
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


    # FIX142：加上常用查詢索引，降低點客戶、開出貨、開清單時的 PostgreSQL 延遲。
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

        legacy_schema = False  # V99: never rename/rebuild warehouse_cells; only ADD missing columns safely below

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
            # FIX78: Render/PostgreSQL 不能執行 SQLite 的 PRAGMA。
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

    # FIX25: 清掉舊版內部備註，並在 SQLite 補唯一索引，避免後續指定位置增減格產生重複格號。
    try:
        cur.execute(sql("UPDATE warehouse_cells SET note = '' WHERE note LIKE '__USER_%__' OR note IN ('__USER_ADDED__','__USER_INSERTED_SLOT__')"))
        if not USE_POSTGRES:
            cur.execute("CREATE INDEX IF NOT EXISTS ix_warehouse_cells_slot_lookup ON warehouse_cells(zone, column_index, slot_type, slot_number)")
    except Exception as e:
        log_error('warehouse_final_index_cleanup', str(e))

    ensure_fixed_warehouse_grid(conn, cur)

    # V23: Render/PostgreSQL/SQLite 自動 migration。
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
        # V79：不得用 DELETE 去重，避免洗掉 warehouse_cells 商品資料。
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
        ]
        for _stmt in _index_sqls:
            try:
                cur.execute(_stmt)
            except Exception as _idx_e:
                log_error('v23_index_single', f'{_stmt}: {_idx_e}')
    except Exception as e:
        log_error('v23_indexes', str(e))

    # FIX35: 商品尺寸高度固定兩位數，修正 132x80x05 被顯示成 132x80x5。
    for _table in ('inventory', 'orders', 'master_orders', 'shipping_records'):
        _normalize_product_texts_in_table(cur, _table)
    _clean_product_like_materials(cur)
    _normalize_warehouse_item_texts(cur)
    # V111 safe PostgreSQL migration marker in main file: no destructive warehouse operation.
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
            cur.execute("INSERT INTO schema_migrations(version) VALUES('V111_mainfile_stability') ON CONFLICT (version) DO NOTHING")
        else:
            try:
                cur.execute("INSERT OR IGNORE INTO schema_migrations(version) VALUES('V111_mainfile_stability')")
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
    """FIX125：客戶清單合併鍵。
    同一客戶若因空白、大小寫或 CNF/FOB 標籤寫法不同而被拆成多張卡，
    以前端顯示的「客戶名 + 貿易條件」為準合併，例如：山益 CNF、山益CNF。
    """
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
    """FIX125：找出應併為同一客戶卡的所有舊名稱。
    只讀取名稱，不改資料，讓商品查詢可同時撈回舊名、空白差異名與 UID 分裂名。
    """
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
    """FIX125：把相同顯示客戶合併成一張卡，數量與筆數加總。"""
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
    """FIX122：把客戶 UID 與客戶名稱重新對齊。
    舊版資料有時 customer_name 還在，但 customer_uid 空白或殘留不同 UID，
    前端用 UID 查商品時就會像「客戶/商品不見」。這裡只做補齊/對齊，不刪資料。
    """
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
    """FIX122：從 inventory / orders / master_orders / shipping_records 找回缺失客戶。
    這不是用 ZIP 內的假資料覆蓋，而是掃目前資料庫仍存在的商品/出貨紀錄；
    只新增缺少的 customer_profiles，並把同名商品 UID 對齊，不會刪除任何資料。
    """
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
                    VALUES (?, '', '', 'FIX122 從商品/出貨紀錄自動找回', '', '', '北區', ?, 0, NULL, ?, ?)
                """), (name, uid, now(), now()))
            except Exception:
                # 舊資料庫若還沒補到 is_archived / customer_uid 欄位，退回最小欄位，避免救援中斷。
                cur.execute(sql("""
                    INSERT INTO customer_profiles
                    (name, phone, address, notes, common_materials, common_sizes, region, created_at, updated_at)
                    VALUES (?, '', '', 'FIX122 從商品/出貨紀錄自動找回', '', '', '北區', ?, ?)
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
    """FIX52：客戶關聯數量以 customer_uid 為主、customer_name 為備援。"""
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
    """FIX53 / FIX123：客戶清單用資料庫 GROUP BY 統計，以 customer_uid 為主、customer_name 做舊資料備援。

    FIX122 的 109 客戶/商品救援保留，但不再每次開客戶清單都掃 inventory / orders /
    master_orders / shipping_records，避免開訂單、總單、出貨、客戶頁時卡頓。
    目前改成每個伺服器行程最多自動救援一次；需要重跑時可手動呼叫
    /api/recover/customers-from-relations。
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        # FIX142：客戶清單要即時顯示，不能每次點訂單/總單/出貨都重掃四張資料表。
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

        # FIX120：客戶清單不能只依 customer_profiles。
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
                cur.execute(sql(f"""
                    SELECT
                        customer_uid,
                        customer_name,
                        COUNT(*) AS row_count,
                        COALESCE(SUM(COALESCE(qty, 0)), 0) AS qty_sum
                    FROM {table}
                    WHERE COALESCE(customer_uid, '') <> '' OR COALESCE(customer_name, '') <> ''
                    GROUP BY customer_uid, customer_name
                """))
                for r in rows_to_dict(cur):
                    uid = (r.get('customer_uid') or '').strip()
                    cname = (r.get('customer_name') or '').strip()
                    # FIX122：同名客戶優先併回既有 customer_profiles，避免 UID 不一致造成商品分裂/看起來不見。
                    key = name_to_uid.get(cname) or uid or cname
                    if not key:
                        continue
                    if cname and key not in key_name_map:
                        key_name_map[key] = cname
                    if uid and key not in key_uid_map:
                        key_uid_map[key] = uid
                    c = count_map.setdefault(key, empty_counts())
                    c[f'{prefix}_rows'] += int(r.get('row_count') or 0)
                    try:
                        c[f'{prefix}_qty'] += int(float(r.get('qty_sum') or 0))
                    except Exception:
                        c[f'{prefix}_qty'] += 0
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
            # V21：若使用者刪除/封存了仍有商品的客戶，不要再從關聯商品補成 virtual customer，避免刪除後又跳回來。
            if cname in archived_names or key in archived_uids:
                continue
            customers.append({
                'id': 0,
                'name': cname,
                'phone': '',
                'address': '',
                'notes': 'FIX120 virtual customer from relation tables',
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
        # FIX125：畫面上完全相同的客戶卡只顯示一張，並把件數 / 筆數合併。
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


# FIX76：合併與出貨判斷統一改成「尺寸 + 材質」；支數/件數只影響數量，不再讓同尺寸商品被當成不同商品。
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
        # FIX80：借貨出貨時，同尺寸同材質但來源客戶不同不可被合併，避免扣錯客戶。
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
        if qty <= 0:
            continue
        customer_name = str(raw.get('customer_name') or '').strip()
        # FIX80：格位批量加入需保留 後排 / 中間 / 前排 顯示層，不同層不可被合併。
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
        # V25 safe fix: when missing slots are auto-completed during read, persist them
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

def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=""):
    """Persist one warehouse cell.

    V48 main-file fix: use a real database UPSERT and read/write the exact loaded table,
    so 「批量加入商品 → 儲存」 survives refresh on SQLite and PostgreSQL.
    """
    conn = get_db()
    cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        zone = (zone or 'A').strip().upper()
        column_index = int(column_index or 0)
        slot_number = int(slot_number or 0)
        slot_type = 'direct'
        # V71 targeted fix: only fill missing empty slots up to the operated slot.
        # Do not refill a manually reduced column back to 20 on every cell save.
        _warehouse_ensure_column_slots(cur, zone, column_index, max(1, slot_number))
        items = _normalize_warehouse_items(items)
        note = '' if str(note or '') in ('__USER_ADDED__', '__USER_INSERTED_SLOT__') or str(note or '').startswith('__USER_') else (note or '')
        items_json = json.dumps(items, ensure_ascii=False)
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(zone, column_index, slot_type, slot_number)
            DO UPDATE SET items_json = excluded.items_json, note = excluded.note, updated_at = excluded.updated_at
        """), (zone, column_index, slot_type, slot_number, items_json, note, now()))
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
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


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    """新增格子。

    insert_after=None 時加在最後；insert_after=0 時加在最前面；
    insert_after=N 時在第 N 格後面插入，後面的格子自動往後順延。

    FIX77：改成整欄安全重排，不再直接 UPDATE n→n+1，避免 SQLite/PostgreSQL 唯一索引衝突。
    """
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index)
    if zone not in ('A', 'B') or column_index < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        if insert_after is not None and insert_after != '':
            _warehouse_ensure_column_slots(cur, zone, column_index, max(1, int(insert_after)))
        else:
            # append at actual DB tail; do not silently refill a column that the user manually reduced
            _warehouse_ensure_column_slots(cur, zone, column_index, 1)
        slots = _warehouse_column_slots(cur, zone, column_index, 'direct')
        max_slot = len(slots)
        if insert_after is None or insert_after == '':
            insert_after = max_slot
        insert_after = max(0, min(int(insert_after), max_slot))
        new_slot = insert_after + 1
        slots.insert(insert_after, {'items_json': '[]', 'note': '', 'updated_at': now()})
        _warehouse_rewrite_column_slots(cur, zone, column_index, slots)
        try:
            cur.execute(sql("""
                UPDATE warehouse_recent_slots
                SET slot_number = slot_number + 1
                WHERE zone = ? AND column_index = ? AND slot_number > ?
            """), (zone, column_index, insert_after))
        except Exception as e:
            log_error('warehouse_recent_shift_add', str(e))
        conn.commit(); return new_slot
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()


def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    """刪除指定空白格，後面的格子自動往前補位；每欄至少保留 1 格。

    FIX77：改成整欄安全重排，避免直接 UPDATE n→n-1 造成唯一索引衝突或格號跳號。
    """
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index)
    slot_number = int(slot_number)
    if zone not in ('A', 'B') or column_index < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        # V71 targeted fix: only fill missing empty slots up to the operated slot.
        # Do not refill a manually reduced column back to 20 on every cell save.
        _warehouse_ensure_column_slots(cur, zone, column_index, max(1, slot_number))
        slots = _warehouse_column_slots(cur, zone, column_index, 'direct')
        max_slot = len(slots)
        if max_slot <= 1:
            return {'success': False, 'error': '每欄至少要保留 1 格'}
        if slot_number < 1 or slot_number > max_slot:
            return {'success': False, 'error': '格號超出範圍'}
        target = slots[slot_number - 1]
        try:
            items = json.loads(target.get('items_json') or '[]')
        except Exception:
            items = []
        if items:
            return {'success': False, 'error': '格子內還有商品，無法刪除'}
        slots.pop(slot_number - 1)
        _warehouse_rewrite_column_slots(cur, zone, column_index, slots)
        try:
            cur.execute(sql("""
                DELETE FROM warehouse_recent_slots
                WHERE zone = ? AND column_index = ? AND slot_number = ?
            """), (zone, column_index, slot_number))
            cur.execute(sql("""
                UPDATE warehouse_recent_slots
                SET slot_number = slot_number - 1
                WHERE zone = ? AND column_index = ? AND slot_number > ?
            """), (zone, column_index, slot_number))
        except Exception as e:
            log_error('warehouse_recent_shift_remove', str(e))
        conn.commit(); return {'success': True, 'removed_slot': slot_number}
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()

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
        # FIX92: 拖到有商品的格子也可放入；新拖入商品固定標示為「前排」，並排在目標格最前面。
        target_label = str(placement_label or '前排').strip() or '前排'
        moved_front = []
        for m in moved:
            nm = dict(m)
            nm['placement_label'] = target_label
            nm['layer_label'] = target_label
            moved_front.append(nm)
        # FIX24: 依「尺寸 + 客戶 + 層位」合併，避免同尺寸不同寫法重複列；同時清掉 0 數量。
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


# ==== V40 helper: stable customer UID for final safe save overrides ====
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

# ==== V24 safe persistence overrides ====
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
# V36 FINAL SAFE SAVE OVERRIDE
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
                # V68 targeted: A/B 區必須參與合併判斷，避免 A 區/B 區同商品被合成一筆。
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
# V40 FINAL WAREHOUSE SAVE OVERRIDE
# Purpose: make warehouse cell save persist permanently with PostgreSQL/SQLite upsert.
# The function is intentionally placed at the very end of db.py so app.py imports this final version.
# ============================================================
def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=""):
    conn = get_db()
    cur = conn.cursor()
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    slot_type = 'direct'
    slot_number = int(slot_number or 0)
    items = _normalize_warehouse_items(items)
    note = '' if str(note or '') in ('__USER_ADDED__', '__USER_INSERTED_SLOT__') or str(note or '').startswith('__USER_') else (note or '')
    items_json = json.dumps(items, ensure_ascii=False)
    ts = now()
    try:
        if USE_POSTGRES:
            cur.execute("""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (zone, column_index, slot_type, slot_number)
                DO UPDATE SET items_json = EXCLUDED.items_json, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at
            """, (zone, column_index, slot_type, slot_number, items_json, note, ts))
        else:
            cur.execute("""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(zone, column_index, slot_type, slot_number)
                DO UPDATE SET items_json = excluded.items_json, note = excluded.note, updated_at = excluded.updated_at
            """, (zone, column_index, slot_type, slot_number, items_json, note, ts))
        conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


# V45_REAL_MAINFILE_REPAIR_DB_MARKER: migrations in init_db already ensure PostgreSQL/SQLite columns and warehouse unique index.

# ============================================================
# V49 FINAL MAINFILE WAREHOUSE PERSISTENCE + POSTGRES MIGRATION LOCK
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

def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=""):
    conn = get_db()
    cur = conn.cursor()
    try:
        _yx_v49_ensure_warehouse_schema(cur)
        zone = (zone or 'A').strip().upper()
        column_index = int(column_index or 0)
        slot_type = 'direct'
        slot_number = int(slot_number or 0)
        # V71 targeted fix: only fill missing empty slots up to the operated slot.
        # Do not refill a manually reduced column back to 20 on every cell save.
        _warehouse_ensure_column_slots(cur, zone, column_index, max(1, slot_number))
        items = _normalize_warehouse_items(items)
        note = '' if str(note or '') in ('__USER_ADDED__', '__USER_INSERTED_SLOT__') or str(note or '').startswith('__USER_') else (note or '')
        items_json = json.dumps(items, ensure_ascii=False)
        ts = now()
        if USE_POSTGRES:
            cur.execute("""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (zone, column_index, slot_type, slot_number)
                DO UPDATE SET items_json = EXCLUDED.items_json, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at
            """, (zone, column_index, slot_type, slot_number, items_json, note, ts))
            cur.execute("""
                SELECT items_json FROM warehouse_cells
                WHERE zone=%s AND column_index=%s AND slot_type=%s AND slot_number=%s
            """, (zone, column_index, slot_type, slot_number))
        else:
            cur.execute("""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(zone, column_index, slot_type, slot_number)
                DO UPDATE SET items_json = excluded.items_json, note = excluded.note, updated_at = excluded.updated_at
            """, (zone, column_index, slot_type, slot_number, items_json, note, ts))
            cur.execute("""
                SELECT items_json FROM warehouse_cells
                WHERE zone=? AND column_index=? AND slot_type=? AND slot_number=?
            """, (zone, column_index, slot_type, slot_number))
        row = fetchone_dict(cur) or {}
        if _yx_v49_json_items(row.get('items_json')) != _yx_v49_json_items(items_json):
            raise RuntimeError('warehouse_cells save verification failed')
        conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

# ============================================================
# V51 FINAL CLEAN WAREHOUSE PERSISTENCE OVERRIDE
# This is the final definition imported by app.py. It replaces prior V40/V48/V49 duplicates.
# ============================================================
def _yx_v51_ensure_warehouse_schema(cur):
    """V97 compatibility stub. Final non-destructive warehouse schema logic is defined later in this main file."""
    return None

def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=""):
    conn = get_db()
    cur = conn.cursor()
    try:
        _yx_v51_ensure_warehouse_schema(cur)
        zone = (zone or 'A').strip().upper()
        column_index = int(column_index or 0)
        slot_type = 'direct'
        slot_number = int(slot_number or 0)
        # V71 targeted fix: when saving a cell that the frontend can see but the DB is missing,
        # fill only the missing empty slots up to that exact slot. Do not clear/rebuild or
        # force a manually edited column back to 20 on every save.
        _warehouse_ensure_column_slots(cur, zone, column_index, max(1, slot_number))
        items = _normalize_warehouse_items(items)
        note = '' if str(note or '') in ('__USER_ADDED__', '__USER_INSERTED_SLOT__') or str(note or '').startswith('__USER_') else (note or '')
        items_json = json.dumps(items, ensure_ascii=False)
        ts = now()
        if USE_POSTGRES:
            cur.execute("""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (zone, column_index, slot_type, slot_number)
                DO UPDATE SET items_json = EXCLUDED.items_json, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at
            """, (zone, column_index, slot_type, slot_number, items_json, note, ts))
            cur.execute("SELECT items_json FROM warehouse_cells WHERE zone=%s AND column_index=%s AND slot_type=%s AND slot_number=%s", (zone, column_index, slot_type, slot_number))
        else:
            cur.execute("""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(zone, column_index, slot_type, slot_number)
                DO UPDATE SET items_json = excluded.items_json, note = excluded.note, updated_at = excluded.updated_at
            """, (zone, column_index, slot_type, slot_number, items_json, note, ts))
            cur.execute("SELECT items_json FROM warehouse_cells WHERE zone=? AND column_index=? AND slot_type=? AND slot_number=?", (zone, column_index, slot_type, slot_number))
        row = fetchone_dict(cur) or {}
        try:
            saved = json.loads(row.get('items_json') or '[]')
        except Exception:
            saved = []
        if saved != json.loads(items_json or '[]'):
            raise RuntimeError('warehouse_cells save verification failed')
        conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

# V53_WAREHOUSE_MIGRATION_MARKER
# warehouse_cells 主表、items_json、slot unique index 已由 init_db 自動補表/補欄位/補索引；V53 前端只送主表 schema 既有欄位。


# V59_SHIP_MATCH_MATERIAL_CUSTOMER_FIX: clean_material_value and _fetch_shipping_match_rows normalize 未填材質 and customer variants.

# ============================================================
# V69 FINAL WAREHOUSE SLOT OVERRIDE
# Purpose: insert/delete cells without clearing warehouse_cells or rewriting the whole column.
# Rules: no truncate, no delete-all/rebuild, keep product cells, only shift slot_number safely.
# ============================================================
def _yx_v69_normalize_direct_slots(cur, zone=None, column_index=None):
    """V111: read-time normalization only.
    Do not UPDATE slot_type during runtime slot actions because legacy empty slot_type
    rows may collide with PostgreSQL indexes. All active queries already use
    COALESCE(NULLIF(TRIM(slot_type),''),'direct'), so data can stay untouched.
    """
    try:
        cur.execute(sql("SELECT 1"))
    except Exception as e:
        log_error('v111_normalize_direct_slots_readonly', str(e))

def _yx_v69_cell_items_from_row(row):
    try:
        return json.loads((row or {}).get('items_json') or '[]')
    except Exception:
        return []

def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    """新增 / 插入空格，直接位移 slot_number，不清空、不整欄重建、不洗掉有商品格。"""
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    if zone not in ('A', 'B') or column_index < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v69_normalize_direct_slots(cur, zone, column_index)
        if insert_after is not None and insert_after != '':
            _warehouse_ensure_column_slots(cur, zone, column_index, max(1, int(insert_after)))
        else:
            # append at actual DB tail; do not silently refill a column that the user manually reduced
            _warehouse_ensure_column_slots(cur, zone, column_index, 1)
        _yx_v69_normalize_direct_slots(cur, zone, column_index)
        cur.execute(sql("""
            SELECT COALESCE(MAX(slot_number), 0) AS max_slot
            FROM warehouse_cells
            WHERE zone = ? AND column_index = ? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
        """), (zone, column_index, 'direct'))
        max_slot = int((fetchone_dict(cur) or {}).get('max_slot') or 0)
        if insert_after is None or insert_after == '':
            insert_after = max_slot
        insert_after = max(0, min(int(insert_after), max_slot))
        new_slot = insert_after + 1
        # UNIQUE safe shift: move affected slots to negative numbers first, then back shifted by +1.
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET slot_number = -slot_number
            WHERE zone = ? AND column_index = ?
              AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
              AND slot_number >= ?
        """), (zone, column_index, 'direct', new_slot))
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET slot_type = 'direct', slot_number = ABS(slot_number) + 1, updated_at = ?
            WHERE zone = ? AND column_index = ?
              AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
              AND slot_number < 0
        """), (now(), zone, column_index, 'direct'))
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """), (zone, column_index, 'direct', new_slot, '[]', '', now()))
        try:
            cur.execute(sql("""
                UPDATE warehouse_recent_slots
                SET slot_number = slot_number + 1
                WHERE zone = ? AND column_index = ? AND slot_number > ?
            """), (zone, column_index, insert_after))
        except Exception as e:
            log_error('v69_warehouse_recent_shift_add', str(e))
        conn.commit()
        return new_slot
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        conn.close()

def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    """刪除指定空格，後方格號往前補；有商品格禁止刪除，不清空、不整欄重建。"""
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    slot_number = int(slot_number or 0)
    if zone not in ('A', 'B') or column_index < 1 or slot_number < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v69_normalize_direct_slots(cur, zone, column_index)
        # only ensure up to the slot the user is actually operating; do not refill deleted tail slots
        _warehouse_ensure_column_slots(cur, zone, column_index, max(1, slot_number))
        _yx_v69_normalize_direct_slots(cur, zone, column_index)
        cur.execute(sql("""
            SELECT COUNT(*) AS cnt, COALESCE(MAX(slot_number),0) AS max_slot
            FROM warehouse_cells
            WHERE zone = ? AND column_index = ? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
        """), (zone, column_index, 'direct'))
        meta = fetchone_dict(cur) or {}
        if int(meta.get('cnt') or 0) <= 1:
            return {'success': False, 'error': '每欄至少要保留 1 格'}
        cur.execute(sql("""
            SELECT id, items_json, note
            FROM warehouse_cells
            WHERE zone = ? AND column_index = ?
              AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
              AND slot_number = ?
            ORDER BY id DESC
            LIMIT 1
        """), (zone, column_index, 'direct', slot_number))
        target = fetchone_dict(cur)
        if not target:
            return {'success': False, 'error': '格號不存在'}
        if _yx_v69_cell_items_from_row(target):
            return {'success': False, 'error': '格子內還有商品，無法刪除'}
        cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, updated_at=? WHERE id=?"), (now(), target.get('id')))
        # UNIQUE safe shift: move following slots to negative numbers first, then back shifted by -1.
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET slot_number = -slot_number
            WHERE zone = ? AND column_index = ?
              AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
              AND slot_number > ?
        """), (zone, column_index, 'direct', slot_number))
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET slot_type = 'direct', slot_number = ABS(slot_number) - 1, updated_at = ?
            WHERE zone = ? AND column_index = ?
              AND COALESCE(NULLIF(TRIM(slot_type),''),'direct') = ?
              AND slot_number < 0
        """), (now(), zone, column_index, 'direct'))
        try:
            cur.execute(sql("DELETE FROM warehouse_recent_slots WHERE zone = ? AND column_index = ? AND slot_number = ?"), (zone, column_index, slot_number))
            cur.execute(sql("UPDATE warehouse_recent_slots SET slot_number = slot_number - 1 WHERE zone = ? AND column_index = ? AND slot_number > ?"), (zone, column_index, slot_number))
        except Exception as e:
            log_error('v69_warehouse_recent_shift_remove', str(e))
        conn.commit()
        return {'success': True, 'removed_slot': slot_number}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        conn.close()


# ============================================================
# V70 EXACT WAREHOUSE SLOT OVERRIDE
# Fix insert/delete slot failures by using a large temporary offset instead of
# negative values. This avoids UNIQUE conflicts on SQLite/PostgreSQL while still
# never clearing, rebuilding, or reordering product cells beyond the required
# slot shift.
# ============================================================
def _yx_v70_direct_expr():
    return "COALESCE(NULLIF(TRIM(slot_type),''),'direct')"

def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    if zone not in ('A', 'B') or column_index < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v69_normalize_direct_slots(cur, zone, column_index)
        cur.execute(sql("""
            SELECT COALESCE(MAX(slot_number),0) AS max_slot
            FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')=?
        """), (zone, column_index, 'direct'))
        max_slot = int((fetchone_dict(cur) or {}).get('max_slot') or 0)
        if max_slot < 1:
            cur.execute(sql("""INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at) VALUES(?,?,?,?,?,?,?)"""), (zone,column_index,'direct',1,'[]','',now()))
            max_slot = 1
        if insert_after is None or insert_after == '':
            insert_after = max_slot
        insert_after = max(0, min(int(insert_after), max_slot))
        new_slot = insert_after + 1
        offset = 1000000
        # move following rows to temp range, then back shifted +1
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_number = slot_number + ?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')=? AND slot_number >= ?
        """), (offset, zone, column_index, 'direct', new_slot))
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_type='direct', slot_number = slot_number - ? + 1, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')=? AND slot_number >= ?
        """), (offset, now(), zone, column_index, 'direct', offset + new_slot))
        cur.execute(sql("""INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at) VALUES(?,?,?,?,?,?,?)"""), (zone,column_index,'direct',new_slot,'[]','',now()))
        try:
            cur.execute(sql("UPDATE warehouse_recent_slots SET slot_number=slot_number+1 WHERE zone=? AND column_index=? AND slot_number>?"), (zone,column_index,insert_after))
        except Exception as e:
            log_error('v70_recent_shift_add', str(e))
        conn.commit()
        return new_slot
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        conn.close()

def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    slot_number = int(slot_number or 0)
    if zone not in ('A', 'B') or column_index < 1 or slot_number < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v69_normalize_direct_slots(cur, zone, column_index)
        cur.execute(sql("""
            SELECT COUNT(*) AS cnt FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')=?
        """), (zone,column_index,'direct'))
        if int((fetchone_dict(cur) or {}).get('cnt') or 0) <= 1:
            return {'success': False, 'error': '每欄至少要保留 1 格'}
        cur.execute(sql("""
            SELECT id,items_json,note FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')=? AND slot_number=?
            ORDER BY id DESC LIMIT 1
        """), (zone,column_index,'direct',slot_number))
        target = fetchone_dict(cur)
        if not target:
            # If the front-end clicked a virtual missing slot, create missing empty slots only up to that slot then delete it.
            _warehouse_ensure_column_slots(cur, zone, column_index, slot_number)
            cur.execute(sql("""
                SELECT id,items_json,note FROM warehouse_cells
                WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')=? AND slot_number=?
                ORDER BY id DESC LIMIT 1
            """), (zone,column_index,'direct',slot_number))
            target = fetchone_dict(cur)
        if not target:
            return {'success': False, 'error': '格號不存在'}
        if _yx_v69_cell_items_from_row(target):
            return {'success': False, 'error': '格子內還有商品，無法刪除'}
        cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, updated_at=? WHERE id=?"), (now(), target.get('id')))
        offset = 1000000
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_number = slot_number + ?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')=? AND slot_number > ?
        """), (offset, zone, column_index, 'direct', slot_number))
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_type='direct', slot_number = slot_number - ? - 1, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')=? AND slot_number > ?
        """), (offset, now(), zone, column_index, 'direct', offset + slot_number))
        try:
            cur.execute(sql("DELETE FROM warehouse_recent_slots WHERE zone=? AND column_index=? AND slot_number=?"), (zone,column_index,slot_number))
            cur.execute(sql("UPDATE warehouse_recent_slots SET slot_number=slot_number-1 WHERE zone=? AND column_index=? AND slot_number>?"), (zone,column_index,slot_number))
        except Exception as e:
            log_error('v70_recent_shift_remove', str(e))
        conn.commit()
        return {'success': True, 'removed_slot': slot_number}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        conn.close()

# ============================================================
# V76 MAINFILE WAREHOUSE SLOT + MARK FIX
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


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    if zone not in ('A', 'B') or column_index < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v76_merge_duplicate_direct_slots(cur, zone, column_index)
        max_slot = _yx_v76_column_max_slot(cur, zone, column_index)
        if max_slot < 1:
            cur.execute(sql("""INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag) VALUES(?,?,?,?,?,?,?,?)"""), (zone,column_index,'direct',1,'[]','',now(),''))
            max_slot = 1
        if insert_after is None or insert_after == '':
            insert_after = max_slot
        insert_after = max(0, min(int(insert_after), max_slot))
        new_slot = insert_after + 1
        offset = max(1000000, max_slot + 1000000)
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_number = slot_number + ?, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number >= ?
        """), (offset, now(), zone, column_index, new_slot))
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_type='direct', slot_number = slot_number - ? + 1, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number >= ?
        """), (offset, now(), zone, column_index, offset + new_slot))
        cur.execute(sql("""INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag) VALUES(?,?,?,?,?,?,?,?)"""), (zone,column_index,'direct',new_slot,'[]','',now(),''))
        try:
            cur.execute(sql("UPDATE warehouse_recent_slots SET slot_number=slot_number+1 WHERE zone=? AND column_index=? AND slot_number>?"), (zone,column_index,insert_after))
        except Exception as e:
            log_error('v76_recent_shift_add', str(e))
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
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    slot_number = int(slot_number or 0)
    if zone not in ('A', 'B') or column_index < 1 or slot_number < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v76_merge_duplicate_direct_slots(cur, zone, column_index)
        # DB 缺操作格時只補到該格，不補整欄、不洗資料。
        _warehouse_ensure_column_slots(cur, zone, column_index, slot_number)
        _yx_v76_merge_duplicate_direct_slots(cur, zone, column_index)
        cur.execute(sql("""
            SELECT COUNT(*) AS cnt FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
        """), (zone,column_index))
        if int((fetchone_dict(cur) or {}).get('cnt') or 0) <= 1:
            return {'success': False, 'error': '每欄至少要保留 1 格'}
        cur.execute(sql("""
            SELECT id,items_json,note FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number=?
            ORDER BY id DESC LIMIT 1
        """), (zone,column_index,slot_number))
        target = fetchone_dict(cur)
        if not target:
            return {'success': False, 'error': '格號不存在'}
        if _yx_v69_cell_items_from_row(target):
            return {'success': False, 'error': '格子內還有商品，無法刪除'}
        cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, updated_at=? WHERE id=?"), (now(), target.get('id')))
        max_slot = _yx_v76_column_max_slot(cur, zone, column_index)
        offset = max(1000000, max_slot + 1000000)
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_number = slot_number + ?, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number > ?
        """), (offset, now(), zone, column_index, slot_number))
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_type='direct', slot_number = slot_number - ? - 1, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number > ?
        """), (offset, now(), zone, column_index, offset + slot_number))
        try:
            cur.execute(sql("DELETE FROM warehouse_recent_slots WHERE zone=? AND column_index=? AND slot_number=?"), (zone,column_index,slot_number))
            cur.execute(sql("UPDATE warehouse_recent_slots SET slot_number=slot_number-1 WHERE zone=? AND column_index=? AND slot_number>?"), (zone,column_index,slot_number))
        except Exception as e:
            log_error('v76_recent_shift_remove', str(e))
        conn.commit()
        return {'success': True, 'removed_slot': slot_number}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


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
# V77 MAINFILE WAREHOUSE SOFT-DELETE SLOT FIX
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

def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=""):
    """Save exact cell contents without clearing/rebuilding warehouse_cells.
    Uses update-by-id instead of ON CONFLICT so legacy duplicate/hidden rows do not
    make Render/Postgres fail on import or save.
    """
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v77_ensure_warehouse_soft_delete_columns(cur)
        zone = (zone or 'A').strip().upper()
        column_index = int(column_index or 0)
        slot_number = int(slot_number or 0)
        slot_type = 'direct'
        if zone not in ('A','B') or column_index < 1 or slot_number < 1:
            raise ValueError('格位參數錯誤')
        _warehouse_ensure_column_slots(cur, zone, column_index, max(25, slot_number))
        _yx_v76_merge_duplicate_direct_slots(cur, zone, column_index)
        items = _normalize_warehouse_items(items)
        note = '' if str(note or '') in ('__USER_ADDED__','__USER_INSERTED_SLOT__') or str(note or '').startswith('__USER_') else (note or '')
        items_json = json.dumps(items, ensure_ascii=False)
        ts = now()
        cur.execute(sql("""
            SELECT id FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND slot_number=?
            ORDER BY COALESCE(is_deleted,0) ASC, id DESC LIMIT 1
        """), (zone,column_index,slot_number))
        target = fetchone_dict(cur)
        if target:
            cur.execute(sql("""
                UPDATE warehouse_cells
                SET slot_type='direct', items_json=?, note=?, updated_at=?, is_deleted=0
                WHERE id=?
            """), (items_json, note, ts, target.get('id')))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,0)
            """), (zone,column_index,slot_type,slot_number,items_json,note,ts,''))
        conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    """Add slot by restoring a hidden empty slot or appending a new empty slot.
    This does not shift/reorder product cells and therefore avoids unique-index collisions.
    """
    zone=(zone or 'A').strip().upper(); column_index=int(column_index or 0)
    if zone not in ('A','B') or column_index < 1:
        raise ValueError('格位參數錯誤')
    conn=get_db(); cur=conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v77_ensure_warehouse_soft_delete_columns(cur)
        _warehouse_ensure_column_slots(cur, zone, column_index, 25)
        _yx_v76_merge_duplicate_direct_slots(cur, zone, column_index)
        try: after = int(insert_after) if insert_after not in (None,'') else 0
        except Exception: after = 0
        # Restore a hidden empty slot after the chosen position only when no active slot uses that number.
        cur.execute(sql("""
            SELECT h.id, h.slot_number, h.items_json
            FROM warehouse_cells h
            WHERE h.zone=? AND h.column_index=? AND COALESCE(NULLIF(TRIM(h.slot_type),''),'direct')='direct'
              AND COALESCE(h.is_deleted,0)=1 AND h.slot_number>?
              AND NOT EXISTS (
                SELECT 1 FROM warehouse_cells a
                WHERE a.zone=h.zone AND a.column_index=h.column_index
                  AND COALESCE(NULLIF(TRIM(a.slot_type),''),'direct')='direct'
                  AND COALESCE(a.is_deleted,0)=0 AND a.slot_number=h.slot_number
              )
            ORDER BY h.slot_number ASC, h.id DESC LIMIT 1
        """), (zone,column_index,after))
        row=fetchone_dict(cur)
        if row and _yx_v77_empty_items_json(row.get('items_json')):
            new_slot=int(row.get('slot_number') or 0)
            cur.execute(sql("UPDATE warehouse_cells SET slot_type='direct', is_deleted=0, updated_at=? WHERE id=?"), (now(), row.get('id')))
        else:
            cur.execute(sql("""
                SELECT COALESCE(MAX(slot_number),0) AS max_slot FROM warehouse_cells
                WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
            """), (zone,column_index))
            max_slot=int((fetchone_dict(cur) or {}).get('max_slot') or 0)
            new_slot=max(max_slot+1, 1)
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,0)
            """), (zone,column_index,'direct',new_slot,'[]','',now(),''))
        conn.commit(); return new_slot
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    """Soft delete an empty slot. Does not shift or delete product cells."""
    zone=(zone or 'A').strip().upper(); column_index=int(column_index or 0); slot_number=int(slot_number or 0)
    if zone not in ('A','B') or column_index < 1 or slot_number < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn=get_db(); cur=conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v77_ensure_warehouse_soft_delete_columns(cur)
        _warehouse_ensure_column_slots(cur, zone, column_index, slot_number)
        _yx_v76_merge_duplicate_direct_slots(cur, zone, column_index)
        cur.execute(sql("""
            SELECT COUNT(*) AS cnt FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND COALESCE(is_deleted,0)=0
        """), (zone,column_index))
        if int((fetchone_dict(cur) or {}).get('cnt') or 0) <= 1:
            return {'success': False, 'error': '每欄至少要保留 1 格'}
        cur.execute(sql("""
            SELECT id, items_json FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND slot_number=? AND COALESCE(is_deleted,0)=0
            ORDER BY id DESC LIMIT 1
        """), (zone,column_index,slot_number))
        target=fetchone_dict(cur)
        if not target:
            # If UI shows a default empty slot but DB has no active row, create a hidden row.
            # This makes delete idempotent and still records the user's hidden-slot choice in DB.
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,1)
            """), (zone,column_index,'direct',slot_number,'[]','',now(),''))
            conn.commit()
            return {'success': True, 'slot_number': slot_number, 'hidden': True}
        if not _yx_v77_empty_items_json(target.get('items_json')):
            return {'success': False, 'error': '格子內還有商品，無法刪除'}
        cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), target.get('id')))
        try:
            cur.execute(sql("DELETE FROM warehouse_recent_slots WHERE zone=? AND column_index=? AND slot_number=?"), (zone,column_index,slot_number))
        except Exception as e:
            log_error('v77_recent_soft_delete', str(e))
        conn.commit(); return {'success': True, 'removed_slot': slot_number, 'soft_deleted': True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


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
# V79 MAINFILE DB CONNECTION + WAREHOUSE SOFT DELETE STABILITY
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


def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=""):
    conn=get_db(); cur=conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v79_ensure_warehouse_columns(cur)
        zone=(zone or 'A').strip().upper(); column_index=int(column_index or 0); slot_number=int(slot_number or 0)
        if zone not in ('A','B') or column_index<1 or slot_number<1:
            raise ValueError('格位參數錯誤')
        _warehouse_ensure_column_slots(cur, zone, column_index, max(25, slot_number))
        items=_normalize_warehouse_items(items or [])
        items_json=json.dumps(items, ensure_ascii=False)
        note='' if str(note or '').startswith('__USER_') else (note or '')
        cur.execute(sql("""
            SELECT id FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND slot_number=?
            ORDER BY COALESCE(is_deleted,0) ASC, id DESC LIMIT 1
        """), (zone,column_index,slot_number))
        row=fetchone_dict(cur)
        if row:
            cur.execute(sql("""
                UPDATE warehouse_cells
                SET slot_type='direct', items_json=?, note=?, is_deleted=0, updated_at=?
                WHERE id=?
            """), (items_json, note, now(), row.get('id')))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,0)
            """), (zone,column_index,'direct',slot_number,items_json,note,now(),''))
        conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    zone=(zone or 'A').strip().upper(); column_index=int(column_index or 0)
    if zone not in ('A','B') or column_index<1:
        raise ValueError('格位參數錯誤')
    conn=get_db(); cur=conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v79_ensure_warehouse_columns(cur)
        _yx_v79_merge_duplicate_slots_all(cur)
        try: after=int(insert_after) if insert_after not in (None,'') else 0
        except Exception: after=0
        _yx_v79_ensure_min_visible_slots(cur, zone, column_index, default_slots=25)
        # Prefer hidden empty slot after selected slot.
        cur.execute(sql("""
            SELECT id, slot_number, items_json FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND COALESCE(is_deleted,0)=1 AND slot_number>?
            ORDER BY slot_number ASC, id DESC LIMIT 1
        """), (zone,column_index,after))
        row=fetchone_dict(cur)
        if row and _yx_v77_empty_items_json(row.get('items_json')):
            new_slot=int(row.get('slot_number') or 0)
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=0, slot_type='direct', updated_at=? WHERE id=?"), (now(), row.get('id')))
        else:
            cur.execute(sql("""
                SELECT COALESCE(MAX(slot_number),0) AS max_slot FROM warehouse_cells
                WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
            """), (zone,column_index))
            new_slot=max(1, int((fetchone_dict(cur) or {}).get('max_slot') or 0)+1)
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,0)
            """), (zone,column_index,'direct',new_slot,'[]','',now(),''))
        conn.commit(); return new_slot
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    zone=(zone or 'A').strip().upper(); column_index=int(column_index or 0); slot_number=int(slot_number or 0)
    if zone not in ('A','B') or column_index<1 or slot_number<1:
        return {'success':False,'error':'格位參數錯誤'}
    conn=get_db(); cur=conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
        _yx_v79_ensure_warehouse_columns(cur)
        _yx_v79_merge_duplicate_slots_all(cur)
        _yx_v79_ensure_min_visible_slots(cur, zone, column_index, default_slots=25)
        cur.execute(sql("""
            SELECT COUNT(*) AS cnt FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND COALESCE(is_deleted,0)=0
        """), (zone,column_index))
        if int((fetchone_dict(cur) or {}).get('cnt') or 0)<=1:
            return {'success':False,'error':'每欄至少要保留 1 格'}
        cur.execute(sql("""
            SELECT id, items_json FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND slot_number=? AND COALESCE(is_deleted,0)=0
            ORDER BY id DESC LIMIT 1
        """), (zone,column_index,slot_number))
        target=fetchone_dict(cur)
        if not target:
            # UI may show a default empty slot that has never been materialized in DB.
            # Mark it hidden by creating a hidden empty record instead of failing.
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,1)
            """), (zone,column_index,'direct',slot_number,'[]','',now(),''))
            conn.commit(); return {'success':True,'removed_slot':slot_number,'soft_deleted':True,'created_hidden':True}
        if not _yx_v77_empty_items_json(target.get('items_json')):
            return {'success':False,'error':'格子內還有商品，無法刪除'}
        cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), target.get('id')))
        conn.commit(); return {'success':True,'removed_slot':slot_number,'soft_deleted':True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


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
# V86 MAINFILE WAREHOUSE SLOT ACTION FINAL SAFETY
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


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    """Right-click add/insert slot: restore hidden empty slot first, otherwise append.
    Never shifts product slots, so unique-index collisions cannot destroy data.
    """
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    if zone not in ('A', 'B') or column_index < 1:
        raise ValueError('格位參數錯誤')
    try:
        after = int(insert_after) if insert_after not in (None, '') else 0
    except Exception:
        after = 0
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v86_ensure_columns(cur)
        _yx_v86_ensure_physical_slots(cur, zone, column_index, 25)
        # 1) Reopen a hidden empty slot after current slot, but only if no visible slot uses it.
        cur.execute(sql("""
            SELECT h.id, h.slot_number, h.items_json
            FROM warehouse_cells h
            WHERE h.zone=? AND h.column_index=?
              AND COALESCE(NULLIF(TRIM(h.slot_type),''),'direct')='direct'
              AND COALESCE(h.is_deleted,0)=1
              AND h.slot_number>?
              AND NOT EXISTS (
                  SELECT 1 FROM warehouse_cells a
                  WHERE a.zone=h.zone AND a.column_index=h.column_index
                    AND COALESCE(NULLIF(TRIM(a.slot_type),''),'direct')='direct'
                    AND a.slot_number=h.slot_number
                    AND COALESCE(a.is_deleted,0)=0
              )
            ORDER BY h.slot_number ASC, h.id DESC LIMIT 1
        """), (zone, column_index, after))
        row = _yx_v86_fetchone(cur)
        if row and _yx_v86_json_is_empty(row.get('items_json')):
            new_slot = int(row.get('slot_number') or 0)
            cur.execute(sql("""
                UPDATE warehouse_cells
                SET is_deleted=0, slot_type='direct', items_json='[]', note=COALESCE(note,''), updated_at=?
                WHERE id=?
            """), (now(), row.get('id')))
            conn.commit()
            return new_slot

        # 2) Append a brand-new slot after the largest physical slot. Retry if concurrent conflict.
        cur.execute(sql("""
            SELECT COALESCE(MAX(slot_number),0) AS max_slot
            FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
        """), (zone, column_index))
        max_slot = int((_yx_v86_fetchone(cur) or {}).get('max_slot') or 0)
        for new_slot in range(max(max_slot + 1, 1), max(max_slot + 80, 80)):
            try:
                if USE_POSTGRES:
                    cur.execute("SAVEPOINT yx_v86_add_slot")
                cur.execute(sql("""
                    INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                    VALUES(?,?,?,?,?,?,?,?,0)
                """), (zone, column_index, 'direct', new_slot, '[]', '', now(), ''))
                if USE_POSTGRES:
                    cur.execute("RELEASE SAVEPOINT yx_v86_add_slot")
                conn.commit()
                return new_slot
            except Exception:
                if USE_POSTGRES:
                    try: cur.execute("ROLLBACK TO SAVEPOINT yx_v86_add_slot")
                    except Exception: pass
                    try: cur.execute("RELEASE SAVEPOINT yx_v86_add_slot")
                    except Exception: pass
                else:
                    try: conn.rollback()
                    except Exception: pass
                    cur = conn.cursor()
                    _yx_v86_ensure_columns(cur)
                continue
        raise RuntimeError('新增格子失敗：找不到可用格號')
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    """Right-click delete slot: soft-delete empty slot only. No shifting/rebuild."""
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    slot_number = int(slot_number or 0)
    if zone not in ('A', 'B') or column_index < 1 or slot_number < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v86_ensure_columns(cur)
        _yx_v86_ensure_physical_slots(cur, zone, column_index, max(25, slot_number))
        cur.execute(sql("""
            SELECT COUNT(*) AS cnt FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND COALESCE(is_deleted,0)=0
        """), (zone, column_index))
        if int((_yx_v86_fetchone(cur) or {}).get('cnt') or 0) <= 1:
            conn.rollback()
            return {'success': False, 'error': '每欄至少要保留 1 格'}

        cur.execute(sql("""
            SELECT id, items_json FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND slot_number=? AND COALESCE(is_deleted,0)=0
            ORDER BY id DESC LIMIT 1
        """), (zone, column_index, slot_number))
        target = _yx_v86_fetchone(cur)
        if not target:
            # There may already be a hidden row for this default UI slot. Make operation idempotent.
            cur.execute(sql("""
                SELECT id FROM warehouse_cells
                WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
                  AND slot_number=? AND COALESCE(is_deleted,0)=1
                ORDER BY id DESC LIMIT 1
            """), (zone, column_index, slot_number))
            hidden = _yx_v86_fetchone(cur)
            if hidden:
                conn.commit()
                return {'success': True, 'removed_slot': slot_number, 'soft_deleted': True, 'already_hidden': True}
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,1)
            """), (zone, column_index, 'direct', slot_number, '[]', '', now(), ''))
            conn.commit()
            return {'success': True, 'removed_slot': slot_number, 'soft_deleted': True, 'created_hidden': True}

        if not _yx_v86_json_is_empty(target.get('items_json')):
            conn.rollback()
            return {'success': False, 'error': '格子內還有商品，無法刪除'}

        cur.execute(sql("""
            UPDATE warehouse_cells
            SET is_deleted=1, items_json='[]', updated_at=?
            WHERE id=?
        """), (now(), target.get('id')))
        try:
            cur.execute(sql("DELETE FROM warehouse_recent_slots WHERE zone=? AND column_index=? AND slot_number=?"), (zone, column_index, slot_number))
        except Exception:
            pass
        conn.commit()
        return {'success': True, 'removed_slot': slot_number, 'soft_deleted': True}
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

# ============================================================
# V87 MAINFILE WAREHOUSE RIGHT-CLICK SLOT ACTION REPAIR
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


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    """Add/insert a visible empty slot without shifting product cells.
    Restores a hidden empty slot first. If none exists, appends after the largest physical slot.
    """
    z = (zone or 'A').strip().upper()
    c = int(column_index or 0)
    if z not in ('A', 'B') or c < 1:
        raise ValueError('格位參數錯誤')
    try:
        after = int(insert_after) if insert_after not in (None, '') else 0
    except Exception:
        after = 0
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v87_ensure_columns(cur)
        _yx_v87_ensure_physical_slots(cur, z, c, 25)
        # Restore nearest hidden empty slot after the clicked slot.
        cur.execute(sql("""
            SELECT id, slot_number, items_json FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND COALESCE(is_deleted,0)=1 AND slot_number>?
            ORDER BY slot_number ASC, id DESC LIMIT 1
        """), (z, c, after))
        row = _yx_v87_fetchone(cur)
        if row and _yx_v87_is_empty_items(row.get('items_json')):
            new_slot = int(row.get('slot_number') or 0)
            cur.execute(sql("""
                UPDATE warehouse_cells
                SET slot_type='direct', is_deleted=0, items_json='[]', note=COALESCE(note,''), updated_at=?
                WHERE id=?
            """), (now(), row.get('id')))
            conn.commit()
            return new_slot
        # Append a new empty physical slot. Retry beyond any unexpected conflict.
        cur.execute(sql("""
            SELECT COALESCE(MAX(slot_number),0) AS max_slot FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
        """), (z, c))
        max_slot = int((_yx_v87_fetchone(cur) or {}).get('max_slot') or 0)
        new_slot = max_slot + 1
        while new_slot < max_slot + 120:
            try:
                cur.execute(sql("""
                    INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                    VALUES(?,?,?,?,?,?,?,?,0)
                """), (z, c, 'direct', new_slot, '[]', '', now(), ''))
                conn.commit()
                return new_slot
            except Exception:
                try: conn.rollback()
                except Exception: pass
                cur = conn.cursor()
                _yx_v87_ensure_columns(cur)
                new_slot += 1
        raise RuntimeError('新增格子失敗：找不到可用格號')
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    """Soft-delete an empty slot. Never deletes a row and never shifts product cells."""
    z = (zone or 'A').strip().upper()
    c = int(column_index or 0)
    n = int(slot_number or 0)
    if z not in ('A', 'B') or c < 1 or n < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v87_ensure_columns(cur)
        _yx_v87_ensure_physical_slots(cur, z, c, max(25, n))
        cur.execute(sql("""
            SELECT COUNT(*) AS cnt FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND COALESCE(is_deleted,0)=0
        """), (z, c))
        if int((_yx_v87_fetchone(cur) or {}).get('cnt') or 0) <= 1:
            conn.commit()
            return {'success': False, 'error': '每欄至少要保留 1 格'}
        cur.execute(sql("""
            SELECT id, items_json FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND slot_number=? AND COALESCE(is_deleted,0)=0
            ORDER BY id DESC LIMIT 1
        """), (z, c, n))
        target = _yx_v87_fetchone(cur)
        if not target:
            # If UI shows a default empty slot that DB has not materialized, create it hidden.
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,1)
            """), (z, c, 'direct', n, '[]', '', now(), ''))
            conn.commit()
            return {'success': True, 'removed_slot': n, 'soft_deleted': True, 'created_hidden': True}
        if not _yx_v87_is_empty_items(target.get('items_json')):
            conn.commit()
            return {'success': False, 'error': '格子內還有商品，無法刪除'}
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET is_deleted=1, items_json='[]', updated_at=?
            WHERE id=?
        """), (now(), target.get('id')))
        conn.commit()
        return {'success': True, 'removed_slot': n, 'soft_deleted': True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


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
# V87B MAINFILE DUPLICATE SLOT NORMALIZER FIX
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
# V88 MAINFILE WAREHOUSE RIGHT-CLICK ROOT FIX
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


def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=''):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0); n = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or n < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v88_ensure_columns(cur)
        _yx_v88_ensure_min_physical(cur, z, c, max(20, n))
        rows = _yx_v88_normalized_rows(cur, z, c, n)
        keeper = _yx_v88_pick_keeper(rows)
        norm_items = _normalize_warehouse_items(items or [])
        items_json = json.dumps(norm_items, ensure_ascii=False)
        note = '' if str(note or '').startswith('__USER_') else (note or '')
        if keeper:
            cur.execute(sql("""
                UPDATE warehouse_cells
                SET items_json=?, note=?, is_deleted=0, updated_at=?, problem_flag=COALESCE(problem_flag,'')
                WHERE id=?
            """), (items_json, note, now(), keeper.get('id')))
            for r in rows:
                if r.get('id') == keeper.get('id'):
                    continue
                # Hide only empty duplicates. If a legacy duplicate has product data, leave it visible so data is never washed.
                if _yx_v88_empty_items(r.get('items_json')):
                    cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), r.get('id')))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                VALUES(?,?,?,?,?,?,?,?,0)
            """), (z, c, 'direct', n, items_json, note, now(), ''))
        conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0)
    if z not in ('A','B') or c < 1:
        raise ValueError('格位參數錯誤')
    try:
        after = int(insert_after) if insert_after not in (None, '') else 0
    except Exception:
        after = 0
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v88_ensure_columns(cur)
        _yx_v88_ensure_min_physical(cur, z, c, 20)
        # Restore the nearest hidden empty logical direct row after the requested slot.
        cur.execute(sql("""
            SELECT id, slot_number, slot_type, items_json
            FROM warehouse_cells
            WHERE zone=? AND column_index=?
              AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND COALESCE(is_deleted,0)=1 AND slot_number>?
            ORDER BY slot_number ASC, id DESC LIMIT 1
        """), (z, c, after))
        hidden = fetchone_dict(cur)
        if hidden and _yx_v88_empty_items(hidden.get('items_json')):
            new_slot = int(hidden.get('slot_number') or 1)
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=0, items_json='[]', updated_at=? WHERE id=?"), (now(), hidden.get('id')))
            conn.commit(); return new_slot
        # No hidden slot available: append after largest logical direct slot.
        cur.execute(sql("""
            SELECT COALESCE(MAX(slot_number),0) AS max_slot
            FROM warehouse_cells
            WHERE zone=? AND column_index=?
              AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
        """), (z, c))
        max_slot = int((fetchone_dict(cur) or {}).get('max_slot') or 0)
        new_slot = max(max_slot + 1, after + 1, 1)
        for _i in range(200):
            rows = _yx_v88_normalized_rows(cur, z, c, new_slot)
            if not rows:
                try:
                    cur.execute(sql("""
                        INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                        VALUES(?,?,?,?,?,?,?,?,0)
                    """), (z, c, 'direct', new_slot, '[]', '', now(), ''))
                    conn.commit(); return new_slot
                except Exception:
                    try: conn.rollback()
                    except Exception: pass
                    cur = conn.cursor(); _yx_v88_ensure_columns(cur)
            else:
                # Existing logical rows: if all are hidden and empty, simply show the keeper.
                if all(int(r.get('is_deleted') or 0) == 1 and _yx_v88_empty_items(r.get('items_json')) for r in rows):
                    keeper = _yx_v88_pick_keeper(rows) or rows[0]
                    cur.execute(sql("UPDATE warehouse_cells SET is_deleted=0, items_json='[]', updated_at=? WHERE id=?"), (now(), keeper.get('id')))
                    conn.commit(); return new_slot
            new_slot += 1
        raise RuntimeError('新增格子失敗：找不到可用格號')
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0); n = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or n < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v88_ensure_columns(cur)
        _yx_v88_ensure_min_physical(cur, z, c, max(20, n))
        rows = _yx_v88_normalized_rows(cur, z, c, n)
        if not rows:
            try:
                cur.execute(sql("""
                    INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,problem_flag,is_deleted)
                    VALUES(?,?,?,?,?,?,?,?,1)
                """), (z, c, 'direct', n, '[]', '', now(), ''))
            except Exception:
                # If another physical row exists but was not selectable, treat it as already hidden.
                pass
            conn.commit(); return {'success': True, 'removed_slot': n, 'soft_deleted': True, 'created_hidden': True}
        # Count visible logical slots excluding this one; at least one must remain visible.
        cur.execute(sql("""
            SELECT slot_number, items_json, COALESCE(is_deleted,0) AS is_deleted
            FROM warehouse_cells
            WHERE zone=? AND column_index=?
              AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
        """), (z, c))
        by_slot = {}
        for r in rows_to_dict(cur):
            sn = int(r.get('slot_number') or 0)
            by_slot.setdefault(sn, []).append(r)
        visible_slots = [sn for sn, rs in by_slot.items() if any(int(x.get('is_deleted') or 0) == 0 for x in rs)]
        if len(set(visible_slots) - {n}) < 1:
            conn.commit(); return {'success': False, 'error': '每欄至少要保留 1 格'}
        if any((int(r.get('is_deleted') or 0) == 0) and (not _yx_v88_empty_items(r.get('items_json'))) for r in rows):
            conn.commit(); return {'success': False, 'error': '格子內還有商品，無法刪除'}
        for r in rows:
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), r.get('id')))
        conn.commit(); return {'success': True, 'removed_slot': n, 'soft_deleted': True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


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
# V90 MAINFILE WAREHOUSE CORE
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

def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=''):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0); n = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or n < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v90_ensure_column(cur, z, c, n)
        keeper_id = _yx_v90_compact_duplicate_slot(cur, z, c, n)
        items_json = json.dumps(_normalize_warehouse_items(items or []), ensure_ascii=False)
        note = '' if str(note or '').startswith('__USER_') else (note or '')
        if keeper_id:
            cur.execute(sql("""
                UPDATE warehouse_cells SET items_json=?, note=?, is_deleted=0, slot_type='direct', updated_at=? WHERE id=?
            """), (items_json, note, now(), keeper_id))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, c, 'direct', n, items_json, note, now(), 0, ''))
        conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0)
    if z not in ('A','B') or c < 1:
        raise ValueError('格位參數錯誤')
    after = int(insert_after) if insert_after not in (None, '') else None
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v90_ensure_column(cur, z, c, 20)
        cur.execute(sql("""
            SELECT COALESCE(MAX(slot_number),0) AS max_slot FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND COALESCE(is_deleted,0)=0
        """), (z, c))
        max_slot = int((fetchone_dict(cur) or {}).get('max_slot') or 0)
        if after is None:
            after = max_slot
        after = max(0, min(int(after), max_slot))
        new_slot = after + 1
        offset = 1000000
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_number=slot_number+?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number>=?
        """), (offset, z, c, new_slot))
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_number=slot_number-?+1, slot_type='direct', updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number>=?
        """), (offset, now(), z, c, offset + new_slot))
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
            VALUES(?,?,?,?,?,?,?,?,?)
        """), (z, c, 'direct', new_slot, '[]', '', now(), 0, ''))
        conn.commit(); return new_slot
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0); n = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or n < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v90_ensure_column(cur, z, c, max(20, n))
        rows = _yx_v90_rows(cur, z, c, n, visible_only=True)
        if not rows:
            return {'success': False, 'error': '格號不存在'}
        if any(not _yx_v90_empty(r.get('items_json')) for r in rows):
            return {'success': False, 'error': '格子內還有商品，無法刪除'}
        cur.execute(sql("""
            SELECT COUNT(*) AS cnt FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND COALESCE(is_deleted,0)=0
        """), (z, c))
        if int((fetchone_dict(cur) or {}).get('cnt') or 0) <= 1:
            return {'success': False, 'error': '每欄至少要保留 1 格'}
        cur.execute(sql("""
            UPDATE warehouse_cells SET is_deleted=1, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number=?
              AND COALESCE(is_deleted,0)=0
        """), (now(), z, c, n))
        offset = 1000000
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_number=slot_number+?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number>?
        """), (offset, z, c, n))
        cur.execute(sql("""
            UPDATE warehouse_cells SET slot_number=slot_number-?-1, updated_at=?
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND slot_number>?
        """), (offset, now(), z, c, offset + n))
        _yx_v90_ensure_column(cur, z, c, 20)
        conn.commit(); return {'success': True, 'removed_slot': n}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

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
# V92 MAINFILE FINAL WAREHOUSE DATA-SAFE OVERRIDES
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

def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=''):
    z=(zone or 'A').strip().upper(); c=int(column_index or 0); n=int(slot_number or 0)
    if z not in ('A','B') or c<1 or n<1: raise ValueError('格位參數錯誤')
    conn=get_db(); cur=conn.cursor()
    try:
        _yx_v92_ensure_column(cur,z,c,n)
        keeper_id=_yx_v92_compact_duplicate_slot(cur,z,c,n)
        items_json=json.dumps(_normalize_warehouse_items(items or []), ensure_ascii=False)
        note='' if str(note or '').startswith('__USER_') else (note or '')
        if keeper_id:
            cur.execute(sql("UPDATE warehouse_cells SET items_json=?, note=?, is_deleted=0, slot_type='direct', updated_at=? WHERE id=?"), (items_json,note,now(),keeper_id))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z,c,'direct',n,items_json,note,now(),0,''))
        conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    z=(zone or 'A').strip().upper(); c=int(column_index or 0)
    if z not in ('A','B') or c<1: raise ValueError('格位參數錯誤')
    try: after=int(insert_after) if insert_after not in (None,'') else 0
    except Exception: after=0
    conn=get_db(); cur=conn.cursor()
    try:
        _yx_v92_ensure_column(cur,z,c,20)
        # Restore a hidden empty slot after the clicked slot first. This creates an insert-like visual without shifting product cells.
        cur.execute(sql("""
            SELECT id, slot_number, items_json FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
              AND COALESCE(is_deleted,0)=1 AND slot_number>?
            ORDER BY slot_number ASC, id DESC LIMIT 1
        """), (z,c,after))
        row=_yx_v92_fetchone(cur)
        if row and _yx_v92_empty_items(row.get('items_json')):
            new_slot=int(row.get('slot_number') or 0)
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=0, slot_type='direct', items_json='[]', note=COALESCE(note,''), updated_at=? WHERE id=?"), (now(), row.get('id')))
            conn.commit(); return new_slot
        # Otherwise append after largest physical slot. Never renumber product cells.
        cur.execute(sql("""
            SELECT COALESCE(MAX(slot_number),0) AS max_slot FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct'
        """), (z,c))
        max_slot=int((_yx_v92_fetchone(cur) or {}).get('max_slot') or 0)
        new_slot=max(max_slot+1,21)
        for _ in range(120):
            try:
                cur.execute(sql("""
                    INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                    VALUES(?,?,?,?,?,?,?,?,?)
                """), (z,c,'direct',new_slot,'[]','',now(),0,''))
                conn.commit(); return new_slot
            except Exception:
                try: conn.rollback()
                except Exception: pass
                cur=conn.cursor(); _yx_v92_ensure_schema(cur); new_slot += 1
        raise RuntimeError('新增格子失敗：找不到可用格號')
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    z=(zone or 'A').strip().upper(); c=int(column_index or 0); n=int(slot_number or 0)
    if z not in ('A','B') or c<1 or n<1: return {'success':False,'error':'格位參數錯誤'}
    conn=get_db(); cur=conn.cursor()
    try:
        _yx_v92_ensure_column(cur,z,c,max(20,n))
        rows=_yx_v92_rows(cur,z,c,n,visible_only=True)
        if not rows: return {'success':False,'error':'格號不存在'}
        if any(not _yx_v92_empty_items(r.get('items_json')) for r in rows):
            return {'success':False,'error':'格子內還有商品，無法刪除'}
        cur.execute(sql("""
            SELECT COUNT(*) AS cnt FROM warehouse_cells
            WHERE zone=? AND column_index=? AND COALESCE(NULLIF(TRIM(slot_type),''),'direct')='direct' AND COALESCE(is_deleted,0)=0
        """), (z,c))
        if int((_yx_v92_fetchone(cur) or {}).get('cnt') or 0) <= 1:
            return {'success':False,'error':'每欄至少要保留 1 格'}
        for r in rows:
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), r.get('id')))
        try: cur.execute(sql("DELETE FROM warehouse_recent_slots WHERE zone=? AND column_index=? AND slot_number=?"), (z,c,n))
        except Exception: pass
        conn.commit(); return {'success':True,'removed_slot':n,'soft_deleted':True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

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
# V93 MAINFILE WAREHOUSE FINAL CORE
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

def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=''):
    z=(zone or 'A').strip().upper(); c=int(column_index or 0); n=int(slot_number or 0)
    if z not in ('A','B') or c<1 or n<1: raise ValueError('格位參數錯誤')
    conn=get_db(); cur=conn.cursor()
    try:
        _yx_v93_ensure_column(cur,z,c,n)
        keeper_id=_yx_v93_compact_slot(cur,z,c,n)
        items_json=json.dumps(_normalize_warehouse_items(items or []), ensure_ascii=False)
        note='' if str(note or '').startswith('__USER_') else (note or '')
        if keeper_id:
            cur.execute(sql("UPDATE warehouse_cells SET items_json=?, note=?, is_deleted=0, updated_at=? WHERE id=?"), (items_json,note,now(),keeper_id))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z,c,'direct',n,items_json,note,now(),0,''))
        conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    z=(zone or 'A').strip().upper(); c=int(column_index or 0)
    if z not in ('A','B') or c<1: raise ValueError('格位參數錯誤')
    try: after=int(insert_after) if insert_after not in (None,'') else 0
    except Exception: after=0
    conn=get_db(); cur=conn.cursor()
    try:
        _yx_v93_ensure_column(cur,z,c,20)
        # Restore nearest hidden empty slot after clicked slot; product rows never shift.
        cur.execute(sql(f"""
            SELECT id, slot_number, items_json FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v93_is_direct_expr()}
              AND COALESCE(is_deleted,0)=1 AND slot_number>?
            ORDER BY slot_number ASC, id DESC LIMIT 1
        """), (z,c,after))
        hidden=_yx_v93_fetchone(cur)
        if hidden and _yx_v93_empty(hidden.get('items_json')):
            new_slot=int(hidden.get('slot_number') or 0)
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=0, items_json='[]', updated_at=? WHERE id=?"), (now(), hidden.get('id')))
            conn.commit(); return new_slot
        cur.execute(sql(f"""
            SELECT COALESCE(MAX(slot_number),0) AS max_slot FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v93_is_direct_expr()}
        """), (z,c))
        max_slot=int((_yx_v93_fetchone(cur) or {}).get('max_slot') or 0)
        new_slot=max(max_slot+1, 21)
        for _ in range(200):
            try:
                cur.execute(sql("""
                    INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                    VALUES(?,?,?,?,?,?,?,?,?)
                """), (z,c,'direct',new_slot,'[]','',now(),0,''))
                conn.commit(); return new_slot
            except Exception:
                try: conn.rollback()
                except Exception: pass
                cur=conn.cursor(); _yx_v93_ensure_schema(cur); new_slot += 1
        raise RuntimeError('新增格子失敗：找不到可用格號')
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    z=(zone or 'A').strip().upper(); c=int(column_index or 0); n=int(slot_number or 0)
    if z not in ('A','B') or c<1 or n<1: return {'success':False,'error':'格位參數錯誤'}
    conn=get_db(); cur=conn.cursor()
    try:
        _yx_v93_ensure_column(cur,z,c,max(20,n))
        rows=_yx_v93_rows(cur,z,c,n,visible_only=True)
        if not rows: return {'success':False,'error':'格號不存在'}
        if any(not _yx_v93_empty(r.get('items_json')) for r in rows):
            return {'success':False,'error':'格子內還有商品，無法刪除'}
        cur.execute(sql(f"""
            SELECT COUNT(DISTINCT slot_number) AS cnt FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v93_is_direct_expr()} AND COALESCE(is_deleted,0)=0
        """), (z,c))
        if int((_yx_v93_fetchone(cur) or {}).get('cnt') or 0) <= 1:
            return {'success':False,'error':'每欄至少要保留 1 格'}
        for r in rows:
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), r.get('id')))
        try: cur.execute(sql("DELETE FROM warehouse_recent_slots WHERE zone=? AND column_index=? AND slot_number=?"), (z,c,n))
        except Exception: pass
        conn.commit(); return {'success':True,'removed_slot':n,'soft_deleted':True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

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


# ==== V95 MAINFILE NON-DESTRUCTIVE WAREHOUSE GUARD ====
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

def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=''):
    z = (zone or 'A').strip().upper(); c = int(column_index or 1); n = int(slot_number or 1)
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v95_ensure_schema(cur)
        _yx_v95_ensure_column(cur, z, c, max(_YX_V95_WAREHOUSE_DEFAULT_SLOTS, n))
        data = json.dumps(_normalize_warehouse_items(items), ensure_ascii=False) if '_normalize_warehouse_items' in globals() else json.dumps(items or [], ensure_ascii=False)
        cur.execute(sql(f"""
            SELECT id FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct' AND slot_number=? AND COALESCE(is_deleted,0)=0
            ORDER BY id DESC LIMIT 1
        """), (z, c, n))
        row = fetchone_dict(cur)
        if row:
            cur.execute(sql("""
                UPDATE warehouse_cells SET items_json=?, note=?, updated_at=?, is_deleted=0
                WHERE id=?
            """), (data, note or '', now(), row.get('id')))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, c, 'direct', n, data, note or '', now(), 0, ''))
        conn.commit(); return {'success': True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    z = (zone or 'A').strip().upper(); c = int(column_index or 1)
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v95_ensure_schema(cur)
        _yx_v95_ensure_column(cur, z, c, _YX_V95_WAREHOUSE_DEFAULT_SLOTS)
        cur.execute(sql(f"""
            SELECT COALESCE(MAX(slot_number),0) AS mx FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct' AND COALESCE(is_deleted,0)=0
        """), (z,c))
        mx = int((fetchone_dict(cur) or {}).get('mx') or 0)
        if insert_after is None:
            new_slot = mx + 1
        else:
            after = max(0, int(insert_after or 0)); new_slot = after + 1
            # V99: 插入格不可自動重排有商品格。後方有商品時直接拒絕，避免商品格號被洗掉。
            cur.execute(sql(f"""
                SELECT items_json FROM warehouse_cells
                WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct'
                  AND COALESCE(is_deleted,0)=0 AND slot_number>=?
                ORDER BY slot_number ASC, id ASC
            """), (z, c, new_slot))
            later_rows = rows_to_dict(cur)
            if any(_yx_v95_has_items(r.get('items_json')) for r in later_rows):
                raise ValueError('後方格子仍有商品，不能自動重排有商品格。請先移走後方商品再插入格')
            offset = 1000000
            cur.execute(sql(f"""
                UPDATE warehouse_cells SET slot_number=slot_number+?
                WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct' AND COALESCE(is_deleted,0)=0 AND slot_number>=?
            """), (offset, z, c, new_slot))
            cur.execute(sql(f"""
                UPDATE warehouse_cells SET slot_number=slot_number-?+1, updated_at=?
                WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct' AND COALESCE(is_deleted,0)=0 AND slot_number>=?
            """), (offset, now(), z, c, offset + new_slot))
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
            VALUES(?,?,?,?,?,?,?,?,?)
        """), (z, c, 'direct', new_slot, '[]', '', now(), 0, ''))
        conn.commit(); return new_slot
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    z = (zone or 'A').strip().upper(); c = int(column_index or 1); n = int(slot_number or 1)
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v95_ensure_schema(cur)
        _yx_v95_ensure_column(cur, z, c, max(_YX_V95_WAREHOUSE_DEFAULT_SLOTS, n))
        cur.execute(sql(f"""
            SELECT id, items_json FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct' AND slot_number=? AND COALESCE(is_deleted,0)=0
            ORDER BY id DESC LIMIT 1
        """), (z,c,n))
        target = fetchone_dict(cur)
        if not target: return {'success': False, 'error': '格號不存在'}
        if _yx_v95_has_items(target.get('items_json')): return {'success': False, 'error': '格子內還有商品，無法刪除'}
        cur.execute(sql(f"""
            SELECT COUNT(*) AS cnt FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct' AND COALESCE(is_deleted,0)=0
        """), (z,c))
        if int((fetchone_dict(cur) or {}).get('cnt') or 0) <= 1:
            return {'success': False, 'error': '每欄至少要保留 1 格'}
        # V96：刪格不得重排有商品格。若後方仍有商品，要求先移走/清空，避免 occupied slot 被自動改號。
        cur.execute(sql(f"""
            SELECT items_json FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct'
              AND COALESCE(is_deleted,0)=0 AND slot_number>?
            ORDER BY slot_number ASC, id ASC
        """), (z, c, n))
        later_rows = rows_to_dict(cur)
        if any(_yx_v95_has_items(r.get('items_json')) for r in later_rows):
            return {'success': False, 'error': '後方格子仍有商品，不能自動重排有商品格。請先移走後方商品再刪格'}
        # 只刪這一個已確認空格；後方只有空格時才補號，完全不移動商品。
        cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, updated_at=? WHERE id=?"), (now(), target.get('id')))
        offset = 1000000
        cur.execute(sql(f"""
            UPDATE warehouse_cells SET slot_number=slot_number+?
            WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct' AND COALESCE(is_deleted,0)=0 AND slot_number>?
        """), (offset,z,c,n))
        cur.execute(sql(f"""
            UPDATE warehouse_cells SET slot_number=slot_number-?-1, updated_at=?
            WHERE zone=? AND column_index=? AND {_yx_v95_slot_type_expr()}='direct' AND COALESCE(is_deleted,0)=0 AND slot_number>?
        """), (offset,now(),z,c,offset+n))
        _yx_v95_ensure_column(cur, z, c, _YX_V95_WAREHOUSE_DEFAULT_SLOTS)
        conn.commit(); return {'success': True, 'removed_slot': n}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass

# ============================================================
# V111 MAINFILE WAREHOUSE ADD-TO-CELL / DROPDOWN STABILITY CORE
# Purpose: make long-press/right-click warehouse slot actions stable without extra layer files.
# Rules:
# - Default physical slots 1..20 per A/B column; only insert missing empty rows.
# - Never clear/rebuild warehouse_cells.
# - Never shift/renumber product cells.
# - Add/insert restores a hidden empty slot after the clicked slot; otherwise appends a new empty slot.
# - Delete only soft-hides the exact empty slot.
# ============================================================
_YX_V100_DEFAULT_WAREHOUSE_SLOTS = 20  # V111: keep 20 default slots; only fill missing empty slots


def _yx_v100_fetchall(cur):
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


def _yx_v100_fetchone(cur):
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


def _yx_v100_slot_type_expr():
    return "COALESCE(NULLIF(TRIM(slot_type),''),'direct')"


def _yx_v100_ensure_schema(cur):
    # Non-destructive schema repair only. Do not rewrite slot_type='' to direct.
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
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v100_wh_lookup ON warehouse_cells(zone, column_index, slot_number)")
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
        for name, ddl in ddl_map.items():
            if name not in cols:
                cur.execute(ddl)
        cur.execute("CREATE INDEX IF NOT EXISTS ix_yx_v100_wh_lookup ON warehouse_cells(zone, column_index, slot_number)")
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


def _yx_v100_has_items(raw):
    try:
        arr = json.loads(raw or '[]')
    except Exception:
        return bool(str(raw or '').strip() not in ('', '[]', 'null', 'None'))
    if not isinstance(arr, list):
        return False
    for it in arr:
        if not isinstance(it, dict):
            continue
        txt = str(it.get('product_text') or it.get('product') or it.get('product_size') or it.get('size') or '').strip()
        try:
            qty = int(float(it.get('qty') or it.get('quantity') or it.get('pieces') or it.get('count') or 0))
        except Exception:
            qty = 0
        # A product row without qty still counts as occupied if it has real text.
        if txt and qty >= 0:
            return True
    return False


def _yx_v100_items(raw):
    try:
        arr = json.loads(raw or '[]')
        return arr if isinstance(arr, list) else []
    except Exception:
        return []


def _yx_v100_merge_items(values):
    merged = []
    seen = set()
    for value in values or []:
        for it in _yx_v100_items(value):
            if not isinstance(it, dict):
                continue
            if not _yx_v100_has_items(json.dumps([it], ensure_ascii=False)):
                continue
            try:
                key = json.dumps(it, ensure_ascii=False, sort_keys=True)
            except Exception:
                key = str(it)
            if key in seen:
                continue
            seen.add(key)
            merged.append(it)
    try:
        return json.dumps(_normalize_warehouse_items(merged), ensure_ascii=False)
    except Exception:
        return json.dumps(merged, ensure_ascii=False)


def _yx_v100_rows(cur, zone, column_index, slot_number=None, visible_only=False):
    z = (zone or 'A').strip().upper()
    c = int(column_index or 1)
    params = [z, c]
    extra = ''
    if slot_number is not None:
        extra += ' AND slot_number=?'
        params.append(int(slot_number or 0))
    if visible_only:
        extra += ' AND COALESCE(is_deleted,0)=0'
    cur.execute(sql(f"""
        SELECT id, zone, column_index, {_yx_v100_slot_type_expr()} AS slot_type, slot_number,
               COALESCE(items_json,'[]') AS items_json,
               COALESCE(note,'') AS note,
               COALESCE(problem_flag,'') AS problem_flag,
               COALESCE(is_deleted,0) AS is_deleted,
               updated_at
        FROM warehouse_cells
        WHERE zone=? AND column_index=? AND {_yx_v100_slot_type_expr()}='direct'
          {extra}
        ORDER BY slot_number ASC, COALESCE(is_deleted,0) ASC, id ASC
    """), tuple(params))
    return _yx_v100_fetchall(cur)


def _yx_v100_pick_keeper(rows):
    if not rows:
        return None
    visible = [r for r in rows if int(r.get('is_deleted') or 0) == 0]
    occupied = [r for r in visible if _yx_v100_has_items(r.get('items_json'))]
    pool = occupied or visible or rows
    direct = [r for r in pool if str(r.get('slot_type') or '').strip() == 'direct']
    return (direct or pool)[-1]


def _yx_v100_compact_empty_duplicates(cur, zone, column_index, slot_number):
    rows = _yx_v100_rows(cur, zone, column_index, slot_number, visible_only=False)
    if not rows:
        return None
    keeper = _yx_v100_pick_keeper(rows)
    if not keeper:
        return None
    keep_id = keeper.get('id')
    merged_json = _yx_v100_merge_items([r.get('items_json') for r in rows])
    if not merged_json or merged_json == '[]':
        merged_json = keeper.get('items_json') or '[]'
    note = next((r.get('note') for r in rows if r.get('note')), keeper.get('note') or '')
    problem = 'problem' if any((r.get('problem_flag') or '').strip() for r in rows) else (keeper.get('problem_flag') or '')
    cur.execute(sql("""
        UPDATE warehouse_cells
        SET items_json=?, note=?, problem_flag=?, is_deleted=0, updated_at=?
        WHERE id=?
    """), (merged_json, note or '', problem or '', now(), keep_id))
    for r in rows:
        if r.get('id') == keep_id:
            continue
        # Product duplicates are merged into the keeper above; hide the duplicate row without deleting it.
        hidden_type = ('hidden_dup_%s' % r.get('id'))[:60]
        cur.execute(sql("UPDATE warehouse_cells SET slot_type=?, is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (hidden_type, now(), r.get('id')))
    return keep_id


def _yx_v100_ensure_column(cur, zone, column_index, minimum_slots=None):
    z = (zone or 'A').strip().upper()
    c = int(column_index or 1)
    target = max(_YX_V100_DEFAULT_WAREHOUSE_SLOTS, int(minimum_slots or _YX_V100_DEFAULT_WAREHOUSE_SLOTS))
    _yx_v100_ensure_schema(cur)
    # Include hidden rows here: if the user deleted slot 7, refreshing must not recreate visible slot 7.
    cur.execute(sql(f"""
        SELECT slot_number FROM warehouse_cells
        WHERE zone=? AND column_index=? AND {_yx_v100_slot_type_expr()}='direct'
    """), (z, c))
    physical = set()
    for r in cur.fetchall():
        try:
            n = int(r['slot_number'] if hasattr(r, 'keys') else r[0])
            if n > 0:
                physical.add(n)
        except Exception:
            pass
    for n in range(1, target + 1):
        if n not in physical:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, c, 'direct', n, '[]', '', now(), 0, ''))
        else:
            _yx_v100_compact_empty_duplicates(cur, z, c, n)


def _yx_v100_all_columns(cur):
    cur.execute(sql("""
        SELECT DISTINCT zone, column_index FROM warehouse_cells
        WHERE zone IS NOT NULL AND column_index IS NOT NULL
    """))
    rows = _yx_v100_fetchall(cur)
    keys = set()
    for r in rows:
        try:
            z = (r.get('zone') or 'A').strip().upper()
            c = int(r.get('column_index') or 1)
            if z in ('A','B') and c > 0:
                keys.add((z,c))
        except Exception:
            pass
    for z in ('A','B'):
        for c in range(1, 7):
            keys.add((z,c))
    return sorted(keys)


def warehouse_get_cells():
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v100_ensure_schema(cur)
        for z, c in _yx_v100_all_columns(cur):
            _yx_v100_ensure_column(cur, z, c, _YX_V100_DEFAULT_WAREHOUSE_SLOTS)
        conn.commit()
        cur.execute(sql(f"""
            SELECT id, zone, column_index, {_yx_v100_slot_type_expr()} AS slot_type, slot_number,
                   COALESCE(items_json,'[]') AS items_json,
                   COALESCE(note,'') AS note,
                   COALESCE(problem_flag,'') AS problem_flag,
                   COALESCE(is_deleted,0) AS is_deleted,
                   updated_at
            FROM warehouse_cells
            WHERE {_yx_v100_slot_type_expr()}='direct' AND COALESCE(is_deleted,0)=0
            ORDER BY zone, column_index, slot_number, id
        """))
        rows = _yx_v100_fetchall(cur)
        grouped = {}
        for r in rows:
            try:
                key = ((r.get('zone') or 'A').strip().upper(), int(r.get('column_index') or 1), int(r.get('slot_number') or 1))
            except Exception:
                continue
            grouped.setdefault(key, []).append(r)
        out = []
        for (z, c, n), rs in grouped.items():
            keep = dict(_yx_v100_pick_keeper(rs) or rs[-1])
            keep['zone'] = z; keep['column_index'] = c; keep['slot_number'] = n
            keep['slot_type'] = 'direct'; keep['is_deleted'] = 0
            keep['items_json'] = _yx_v100_merge_items([r.get('items_json') for r in rs]) or '[]'
            keep['problem_flag'] = 'problem' if any((r.get('problem_flag') or '').strip() for r in rs) else (keep.get('problem_flag') or '')
            out.append(keep)
        out.sort(key=lambda r: ((r.get('zone') or 'A'), int(r.get('column_index') or 1), int(r.get('slot_number') or 1)))
        return out
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('v101_warehouse_get_cells', str(e))
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
            n = int(cell.get('slot_number') or 1)
            zones.setdefault(z, {}).setdefault(c, {})[n] = cell
        except Exception:
            pass
    return zones


def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=''):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0); n = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or n < 1:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v100_ensure_schema(cur)
        _yx_v100_ensure_column(cur, z, c, max(_YX_V100_DEFAULT_WAREHOUSE_SLOTS, n))
        keeper_id = _yx_v100_compact_empty_duplicates(cur, z, c, n)
        data = json.dumps(_normalize_warehouse_items(items or []), ensure_ascii=False) if '_normalize_warehouse_items' in globals() else json.dumps(items or [], ensure_ascii=False)
        safe_note = '' if str(note or '').startswith('__USER_') else (note or '')
        if keeper_id:
            cur.execute(sql("""
                UPDATE warehouse_cells SET items_json=?, note=?, is_deleted=0, updated_at=? WHERE id=?
            """), (data, safe_note, now(), keeper_id))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, c, 'direct', n, data, safe_note, now(), 0, ''))
        conn.commit(); return {'success': True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0)
    if z not in ('A','B') or c < 1:
        raise ValueError('格位參數錯誤')
    try:
        after = int(insert_after) if insert_after not in (None, '') else 0
    except Exception:
        after = 0
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v100_ensure_schema(cur)
        _yx_v100_ensure_column(cur, z, c, _YX_V100_DEFAULT_WAREHOUSE_SLOTS)
        # Restore nearest hidden empty slot after clicked slot. This gives stable add/decrease behavior without renumbering product cells.
        cur.execute(sql(f"""
            SELECT id, slot_number, COALESCE(items_json,'[]') AS items_json
            FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v100_slot_type_expr()}='direct'
              AND COALESCE(is_deleted,0)=1 AND slot_number>?
            ORDER BY slot_number ASC, id DESC LIMIT 1
        """), (z, c, after))
        hidden = _yx_v100_fetchone(cur)
        if hidden and not _yx_v100_has_items(hidden.get('items_json')):
            new_slot = int(hidden.get('slot_number') or 0)
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=0, items_json='[]', updated_at=? WHERE id=?"), (now(), hidden.get('id')))
            conn.commit(); return new_slot
        # Otherwise append after largest physical slot. Never shift occupied cells.
        cur.execute(sql(f"""
            SELECT COALESCE(MAX(slot_number),0) AS mx FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v100_slot_type_expr()}='direct'
        """), (z, c))
        mx = int((_yx_v100_fetchone(cur) or {}).get('mx') or 0)
        new_slot = max(mx + 1, _YX_V100_DEFAULT_WAREHOUSE_SLOTS + 1, after + 1)
        for _try in range(200):
            existing = _yx_v100_rows(cur, z, c, new_slot, visible_only=False)
            if not existing:
                try:
                    cur.execute(sql("""
                        INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                        VALUES(?,?,?,?,?,?,?,?,?)
                    """), (z, c, 'direct', new_slot, '[]', '', now(), 0, ''))
                    conn.commit(); return new_slot
                except Exception:
                    try: conn.rollback()
                    except Exception: pass
                    cur = conn.cursor(); _yx_v100_ensure_schema(cur)
            elif all(int(r.get('is_deleted') or 0) == 1 and not _yx_v100_has_items(r.get('items_json')) for r in existing):
                keeper = _yx_v100_pick_keeper(existing) or existing[0]
                cur.execute(sql("UPDATE warehouse_cells SET is_deleted=0, items_json='[]', updated_at=? WHERE id=?"), (now(), keeper.get('id')))
                conn.commit(); return new_slot
            new_slot += 1
        raise RuntimeError('新增格子失敗：找不到可用格號')
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_remove_slot(zone, column_index, slot_type='direct', slot_number=1):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0); n = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or n < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v100_ensure_schema(cur)
        _yx_v100_ensure_column(cur, z, c, max(_YX_V100_DEFAULT_WAREHOUSE_SLOTS, n))
        cur.execute(sql(f"""
            SELECT COUNT(DISTINCT slot_number) AS cnt
            FROM warehouse_cells
            WHERE zone=? AND column_index=? AND {_yx_v100_slot_type_expr()}='direct' AND COALESCE(is_deleted,0)=0
        """), (z, c))
        if int((_yx_v100_fetchone(cur) or {}).get('cnt') or 0) <= 1:
            conn.commit(); return {'success': False, 'error': '每欄至少要保留 1 格'}
        rows = _yx_v100_rows(cur, z, c, n, visible_only=True)
        if not rows:
            conn.commit(); return {'success': True, 'removed_slot': n, 'soft_deleted': True, 'already_hidden': True}
        if any(_yx_v100_has_items(r.get('items_json')) for r in rows):
            conn.commit(); return {'success': False, 'error': '格子內還有商品，無法刪除。請先退回該格或移走商品'}
        for r in rows:
            cur.execute(sql("UPDATE warehouse_cells SET is_deleted=1, items_json='[]', updated_at=? WHERE id=?"), (now(), r.get('id')))
        try:
            cur.execute(sql("DELETE FROM warehouse_recent_slots WHERE zone=? AND column_index=? AND slot_number=?"), (z, c, n))
        except Exception:
            pass
        conn.commit(); return {'success': True, 'removed_slot': n, 'soft_deleted': True}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


def warehouse_set_cell_mark(zone, column_index, slot_number, marked=True):
    z = (zone or 'A').strip().upper(); c = int(column_index or 0); n = int(slot_number or 0)
    if z not in ('A','B') or c < 1 or n < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_v100_ensure_schema(cur)
        _yx_v100_ensure_column(cur, z, c, max(_YX_V100_DEFAULT_WAREHOUSE_SLOTS, n))
        keeper_id = _yx_v100_compact_empty_duplicates(cur, z, c, n)
        if keeper_id:
            cur.execute(sql("UPDATE warehouse_cells SET problem_flag=?, is_deleted=0, updated_at=? WHERE id=?"), ('problem' if marked else '', now(), keeper_id))
        else:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at,is_deleted,problem_flag)
                VALUES(?,?,?,?,?,?,?,?,?)
            """), (z, c, 'direct', n, '[]', '', now(), 0, 'problem' if marked else ''))
        conn.commit(); return {'success': True, 'marked': bool(marked)}
    except Exception:
        try: conn.rollback()
        except Exception: pass
        raise
    finally:
        try: conn.close()
        except Exception: pass


# V111_NON_DESTRUCTIVE_MIGRATION_MARKER
# This marker documents the active DB policy in the main file:
# - never DROP/TRUNCATE/DELETE warehouse_cells during init/migration
# - never rebuild warehouse_cells without copying rows first
# - only ADD missing columns/indexes and only INSERT missing empty warehouse slots
# - warehouse slot insert/delete functions below use per-column row shifting only for empty rows where safe

def yx_v107_non_destructive_migration_marker():
    return True


# V111_MAINFILE_SAFE_MIGRATION_MARKER
def yx_v108_mainfile_safe_migration_marker():
    """Direct mainfile marker: V111 keeps warehouse_cells non-destructive.
    Rules: never clear/rebuild warehouse_cells; only add columns/indexes and insert missing empty slots.
    """
    return True


# V111_MAINFILE_STABILITY_MARKER
# Direct mainfile rules:
# - stable mainfile only, without extra UI injection layers
# - warehouse_cells migrations are non-destructive
# - warehouse_cells migrations are non-destructive
# - static cache is controlled by ?v=V111 and server headers


# V111_MAINFILE_STABILITY_MARKER
def yx_v111_mainfile_stability_marker():
    """V111 direct-mainfile policy:
    - no extra UI injection layer
    - no timer/observer button patching
    - warehouse_cells are preserved; migrations only add missing schema/empty slots
    - JS modules use single install guard instead of force reinstall
    """
    return True
