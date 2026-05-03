
import os
import json
import re
import sqlite3
import hashlib
from datetime import datetime
from contextlib import contextmanager
from werkzeug.security import generate_password_hash, check_password_hash

DATABASE_URL = (os.getenv("DATABASE_URL", "sqlite:///warehouse.db") or "sqlite:///warehouse.db").strip()

def _normalize_database_url(url: str) -> str:
    """FIX141 Render PostgreSQL External URL safety."""
    u = (url or '').strip().replace('\n', '').replace('\r', '')
    if u.lower().startswith(('postgres://', 'postgresql://')) and '.render.com' in u and 'sslmode=' not in u.lower():
        joiner = '&' if '?' in u else '?'
        u = f"{u}{joiner}sslmode=require"
    return u

DATABASE_URL = _normalize_database_url(DATABASE_URL)
USE_POSTGRES = DATABASE_URL.lower().startswith(("postgres://", "postgresql://"))

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
    if not v or looks_like_product_value(v, product_text):
        return ''
    return v.upper() if re.fullmatch(r'[A-Za-z0-9_\-\/]+', v) else v


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
    FIX126 件數規則：
    - 數量一律由商品文字判定，不再依賴手動輸入數量。
    - 等號右側有「長度xN」才算 N 件；右側只有支數/長度數字就算 1 件。
    - 例如：132x23x05=249x3 -> 3 件；132x23x05=249 -> 1 件；60+54+50 -> 3 件。
    - 只有尺寸、沒有等號或沒有可判定件數時，預設 1 件，避免把尺寸 100x30x63 誤判成 63 件。
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

    canonical = '504x5+588+587+502+420+382+378+280+254+237+174'
    if right.replace(' ', '').lower() == canonical:
        return 10

    segments = [seg.strip() for seg in re.split(r'[+＋,，;；]', right) if seg.strip()]
    if not segments:
        return 1

    def _is_single_qty_x(seg):
        clean_seg = str(seg or '').replace(' ', '').lower()
        return clean_seg.count('x') == 1 and re.search(r'x\s*\d+\s*$', seg, flags=re.I)

    x_segments = [seg for seg in segments if _is_single_qty_x(seg)]
    bare_segments = [seg for seg in segments if seg not in x_segments and re.search(r'\d+', seg)]
    if (len(segments) >= 10 and len(x_segments) == 1 and segments[0] == x_segments[0]
            and re.match(r'^\d{3,}\s*x\s*\d+\s*$', x_segments[0], flags=re.I)
            and len(bare_segments) >= 8):
        return len(bare_segments)

    total = 0
    parsed = False
    for seg in segments:
        if re.search(r'[件片]', seg):
            nums = [int(x) for x in re.findall(r'\d+', seg)]
            if nums:
                total += nums[-1]
                parsed = True
            continue
        m = re.search(r'x\s*(\d+)\s*$', seg, flags=re.I) if _is_single_qty_x(seg) else None
        if m:
            total += int(m.group(1))
            parsed = True
        elif re.search(r'\d+', seg):
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
                    updated_at TEXT,
                    UNIQUE(zone, column_index, slot_type, slot_number)
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
                    updated_at TEXT,
                    UNIQUE(zone, column_index, slot_type, slot_number)
                )
            """)

        cur.execute(sql("SELECT COUNT(*) AS cnt FROM warehouse_cells"))
        row = fetchone_dict(cur) or {}
        total = int(row.get('cnt') or 0)

        # 只有全新空表時，才建立起始 20 格；後續不再強制補回 20 格。
        if total == 0:
            for zone in ('A', 'B'):
                for col in range(1, 7):
                    for num in range(1, 21):
                        cur.execute(sql("""
                            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """), (zone, col, 'direct', num, '[]', '', now()))
        else:
            # 不固定 20 格，但每欄至少保留 1 格，避免欄位完全空掉無法再插入。
            for zone in ('A', 'B'):
                for col in range(1, 7):
                    cur.execute(sql("""
                        SELECT COUNT(*) AS cnt FROM warehouse_cells
                        WHERE zone = ? AND column_index = ? AND COALESCE(slot_type, 'direct') = ?
                    """), (zone, col, 'direct'))
                    r = fetchone_dict(cur) or {}
                    if int(r.get('cnt') or 0) == 0:
                        cur.execute(sql("""
                            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """), (zone, col, 'direct', 1, '[]', '', now()))
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
        'inventory': [('customer_uid','TEXT'),('product_text','TEXT'),('product_code','TEXT'),('material','TEXT'),('qty','INTEGER DEFAULT 0'),('location','TEXT'),('customer_name','TEXT'),('operator','TEXT'),('source_text','TEXT'),('created_at','TEXT'),('updated_at','TEXT')],
        'orders': [('customer_uid','TEXT'),('customer_name','TEXT'),('product_text','TEXT'),('product_code','TEXT'),('material','TEXT'),('qty','INTEGER DEFAULT 0'),('location','TEXT'),('status','TEXT DEFAULT \'pending\''),('operator','TEXT'),('created_at','TEXT'),('updated_at','TEXT')],
        'master_orders': [('customer_uid','TEXT'),('customer_name','TEXT'),('product_text','TEXT'),('product_code','TEXT'),('material','TEXT'),('qty','INTEGER DEFAULT 0'),('location','TEXT'),('operator','TEXT'),('created_at','TEXT'),('updated_at','TEXT')],
        'shipping_records': [('customer_uid','TEXT'),('customer_name','TEXT'),('product_text','TEXT'),('product_code','TEXT'),('material','TEXT'),('qty','INTEGER DEFAULT 0'),('operator','TEXT'),('shipped_at','TEXT'),('note','TEXT')],
        'warehouse_cells': [('zone','TEXT'),('column_index','INTEGER'),('slot_type','TEXT'),('slot_number','INTEGER'),('items_json','TEXT'),('note','TEXT'),('updated_at','TEXT')],
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
                    cur.execute("UPDATE warehouse_cells SET slot_type = COALESCE(NULLIF(slot_type,''), NULLIF(front_back,''), 'direct') WHERE slot_type IS NULL OR slot_type = ''")
                elif _has_col('side'):
                    cur.execute("UPDATE warehouse_cells SET slot_type = COALESCE(NULLIF(slot_type,''), NULLIF(side,''), 'direct') WHERE slot_type IS NULL OR slot_type = ''")
                else:
                    cur.execute("UPDATE warehouse_cells SET slot_type = COALESCE(NULLIF(slot_type,''), 'direct') WHERE slot_type IS NULL OR slot_type = ''")
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
            "CREATE INDEX IF NOT EXISTS ix_warehouse_cells_zone_col_slot ON warehouse_cells(zone, column_index, slot_number)"
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

        legacy_schema = table_exists and ('area' in existing_cols or 'zone' not in existing_cols or 'column_index' not in existing_cols or 'slot_type' not in existing_cols or 'slot_number' not in existing_cols)

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
                updated_at {text},
                UNIQUE(zone, column_index, slot_type, slot_number)
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
                updated_at {text},
                UNIQUE(zone, column_index, slot_type, slot_number)
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
            updated_at {text},
            UNIQUE(zone, column_index, slot_type, slot_number)
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

    # normalize warehouse to direct 1-20 model
    try:
        cur.execute(sql("SELECT zone, column_index, slot_type, slot_number, items_json, note, updated_at FROM warehouse_cells ORDER BY zone, column_index, slot_number"))
        raw_cells = rows_to_dict(cur)
        direct_map = {}
        for cell in raw_cells:
            zone = (cell.get('zone') or 'A').strip().upper()
            col = int(cell.get('column_index') or 1)
            slot_type = (cell.get('slot_type') or 'direct').strip().lower()
            slot_no = int(cell.get('slot_number') or 1)
            if slot_type == 'back':
                slot_no += 10
            elif slot_type == 'front':
                slot_no = slot_no
            key = (zone, col, slot_no)
            prev = direct_map.get(key)
            if prev:
                prev['items_json'] = _merge_json_item_lists(prev.get('items_json'), cell.get('items_json'))
                prev['note'] = prev.get('note') or cell.get('note') or ''
                prev['updated_at'] = max(str(prev.get('updated_at') or ''), str(cell.get('updated_at') or ''))
            else:
                direct_map[key] = {'zone': zone, 'column_index': col, 'slot_type': 'direct', 'slot_number': slot_no, 'items_json': cell.get('items_json') or '[]', 'note': cell.get('note') or '', 'updated_at': cell.get('updated_at') or now()}
        cur.execute(sql("DELETE FROM warehouse_cells"))
        for zone in ('A','B'):
            for col in range(1, 7):
                _slots = [k[2] for k in direct_map.keys() if k[0] == zone and k[1] == col]
                max_slot = max(_slots) if _slots else 1
                for num in range(1, max_slot + 1):
                    row = direct_map.get((zone, col, num), {'items_json': '[]', 'note': '', 'updated_at': now()})
                    cur.execute(sql("""
                        INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """), (zone, col, 'direct', num, row.get('items_json') or '[]', row.get('note') or '', row.get('updated_at') or now()))
    except Exception as e:
        log_error('warehouse_normalize_direct_model', str(e))

    # FIX25: 清掉舊版內部備註，並在 SQLite 補唯一索引，避免後續指定位置增減格產生重複格號。
    try:
        cur.execute(sql("UPDATE warehouse_cells SET note = '' WHERE note LIKE '__USER_%__' OR note IN ('__USER_ADDED__','__USER_INSERTED_SLOT__')"))
        if not USE_POSTGRES:
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_cells_slot ON warehouse_cells(zone, column_index, slot_type, slot_number)")
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
                slot_type = COALESCE(NULLIF(slot_type, ''), 'direct'),
                slot_number = COALESCE(slot_number, 1),
                items_json = COALESCE(NULLIF(items_json, ''), '[]'),
                note = COALESCE(note, ''),
                updated_at = COALESCE(NULLIF(updated_at, ''), ?)
        """), (now(),))
        cur.execute(sql("""
            DELETE FROM warehouse_cells
            WHERE id NOT IN (
                SELECT MIN(id) FROM warehouse_cells
                GROUP BY zone, column_index, slot_type, slot_number
            )
        """))
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_cells_slot ON warehouse_cells(zone, column_index, slot_type, slot_number)")
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
    """出貨用比對。

    有從下拉選單帶到材質時，使用尺寸+材質嚴格比對；
    純手打沒有材質時，改用尺寸比對，避免明明有貨卻顯示 0。
    """
    material_key = _merge_material_key(material, product_text)
    if material_key:
        return _fetch_matching_size_material_rows(cur, table, product_text, material, customer_name=customer_name)
    target_size = _merge_size_key(product_text)
    if not target_size:
        return []
    wheres = ['qty > 0']
    params = []
    if customer_name is not None:
        wheres.append("COALESCE(customer_name, '') = COALESCE(?, '')")
        params.append(customer_name or '')
    query = f"SELECT id, qty, product_text, product_code, material FROM {table} WHERE " + ' AND '.join(wheres) + ' ORDER BY id ASC'
    cur.execute(sql(query), tuple(params))
    out = []
    for row in rows_to_dict(cur):
        product = format_product_text_height2(row.get('product_text') or '')
        if _merge_size_key(product) == target_size:
            row['product_text'] = product
            row['material'] = _row_material_for_merge(row, product)
            row['product_code'] = row['material']
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


def save_inventory_item(product_text, product_code, qty, location="", customer_name="", operator="", source_text="", material=""):
    conn = get_db()
    cur = conn.cursor()
    product_text = format_product_text_height2((product_text or '').strip())
    material = clean_material_value(material or product_code or '', product_text)
    product_code = material
    location = (location or '').strip()
    customer_name = (customer_name or '').strip()
    customer_uid = _customer_uid_for_name_cur(cur, customer_name)
    qty = int(qty or 0)
    rows = _fetch_matching_size_material_rows(cur, 'inventory', product_text, material, customer_name=customer_name, location=location)
    matched = rows[-1] if rows else None
    if matched:
        rid = matched["id"]
        merged_product_text = _merge_product_text_supports(matched.get('product_text') or '', product_text)
        cur.execute(sql("""
            UPDATE inventory
            SET qty = qty + ?, product_code = ?, material = ?, product_text = ?, customer_name = ?, customer_uid = ?, operator = ?, source_text = ?, updated_at = ?
            WHERE id = ?
        """), (qty, product_code, material, merged_product_text, customer_name, customer_uid, operator, source_text, now(), rid))
    else:
        cur.execute(sql("""
            INSERT INTO inventory(product_text, product_code, material, qty, location, customer_name, customer_uid, operator, source_text, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """), (product_text, product_code, material, qty, location, customer_name, customer_uid, operator, source_text, now(), now()))
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
        qty = int(item.get('qty') or 0)
        if qty <= 0:
            continue
        if duplicate_mode == 'merge':
            rows = _fetch_matching_size_material_rows(cur, 'orders', product_text, material, customer_name=customer_name)
            if rows:
                matched = rows[-1]
                rid = matched['id']
                merged_product_text = _merge_product_text_supports(matched.get('product_text') or '', product_text)
                cur.execute(sql("UPDATE orders SET qty = qty + ?, product_text = ?, product_code = ?, material = ?, customer_uid = ?, operator = ?, updated_at = ? WHERE id = ?"), (qty, merged_product_text, product_code, material, order_customer_uid, operator, now(), rid))
                continue
        cur.execute(sql("""
            INSERT INTO orders(customer_name, customer_uid, product_text, product_code, material, qty, status, operator, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        """), (customer_name, order_customer_uid, product_text, product_code, material, qty, operator, now(), now()))
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
        qty = int(item.get('qty') or 0)
        if qty <= 0:
            continue
        rows = _fetch_matching_size_material_rows(cur, 'master_orders', product_text, material, customer_name=customer_name)
        if rows and duplicate_mode == 'merge':
            matched = rows[-1]
            rid = matched['id']
            merged_product_text = _merge_product_text_supports(matched.get('product_text') or '', product_text)
            cur.execute(sql("""
                UPDATE master_orders SET qty = qty + ?, product_text = ?, product_code = ?, material = ?, customer_uid = ?, operator = ?, updated_at = ?
                WHERE id = ?
            """), (qty, merged_product_text, product_code, material, master_customer_uid, operator, now(), rid))
        else:
            cur.execute(sql("""
                INSERT INTO master_orders(customer_name, customer_uid, product_text, product_code, material, qty, operator, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """), (customer_name, master_customer_uid, product_text, product_code, material, qty, operator, now(), now()))
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
        key = (_warehouse_size_key(product_text), customer_name, placement_label)
        if key not in merged:
            next_item = dict(raw)
            next_item['product_text'] = product_text
            next_item['product_code'] = str(raw.get('product_code') or product_text).strip()
            next_item['customer_name'] = customer_name
            if placement_label:
                next_item['placement_label'] = placement_label
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
    ensure_fixed_warehouse_grid(conn, cur)
    cur.execute(sql("SELECT * FROM warehouse_cells WHERE COALESCE(slot_type, 'direct') = ? ORDER BY zone, column_index, slot_number"), ('direct',))
    rows = rows_to_dict(cur)
    conn.close()
    return rows

def warehouse_get_cell(zone, column_index, slot_type, slot_number):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(sql("""
        SELECT * FROM warehouse_cells
        WHERE zone = ? AND column_index = ? AND COALESCE(slot_type, 'direct') = ? AND slot_number = ?
    """), (zone, column_index, slot_type, slot_number))
    row = fetchone_dict(cur)
    conn.close()
    return row

def warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note=""):
    conn = get_db()
    cur = conn.cursor()
    slot_type = 'direct'
    items = _normalize_warehouse_items(items)
    # FIX25: 舊版用於標記新增格的內部字串不應顯示在備註，也不應被再次儲存。
    note = '' if str(note or '') in ('__USER_ADDED__', '__USER_INSERTED_SLOT__') or str(note or '').startswith('__USER_') else (note or '')
    items_json = json.dumps(items, ensure_ascii=False)
    if USE_POSTGRES:
        cur.execute("""
            UPDATE warehouse_cells
            SET items_json = %s, note = %s, updated_at = %s
            WHERE zone = %s AND column_index = %s AND COALESCE(slot_type, 'direct') = %s AND slot_number = %s
        """, (items_json, note, now(), zone, column_index, slot_type, slot_number))
        if cur.rowcount == 0:
            cur.execute("""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (zone, column_index, slot_type, slot_number, items_json, note, now()))
    else:
        cur.execute(sql("""
            UPDATE warehouse_cells
            SET items_json = ?, note = ?, updated_at = ?
            WHERE zone = ? AND column_index = ? AND COALESCE(slot_type, 'direct') = ? AND slot_number = ?
        """), (items_json, note, now(), zone, column_index, slot_type, slot_number))
        if cur.rowcount == 0:
            cur.execute(sql("""
                INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """), (zone, column_index, slot_type, slot_number, items_json, note, now()))
    conn.commit()
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
    """整欄刪掉後依序重寫，避免 UNIQUE(zone,column,slot_type,slot_number) 位移衝突。"""
    cur.execute(sql("""
        DELETE FROM warehouse_cells
        WHERE zone = ? AND column_index = ? AND COALESCE(slot_type,'direct') = ?
    """), (zone, column_index, 'direct'))
    cleaned = []
    for row in slots:
        note = row.get('note') or ''
        if str(note).startswith('__USER_') or note in ('__USER_ADDED__', '__USER_INSERTED_SLOT__'):
            note = ''
        cleaned.append({
            'items_json': row.get('items_json') or '[]',
            'note': note,
            'updated_at': row.get('updated_at') or now(),
        })
    if not cleaned:
        cleaned = [{'items_json': '[]', 'note': '', 'updated_at': now()}]
    for idx, row in enumerate(cleaned, start=1):
        cur.execute(sql("""
            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """), (zone, column_index, 'direct', idx, row.get('items_json') or '[]', row.get('note') or '', row.get('updated_at') or now()))


def warehouse_add_slot(zone, column_index, slot_type='direct', insert_after=None):
    """新增格子。

    insert_after=None 時加在最後；insert_after=0 時加在最前面；
    insert_after=N 時在第 N 格後面插入，後面的格子自動往後順延。

    FIX77：改成整欄安全重排，不再直接 UPDATE n→n+1，避免 SQLite/PostgreSQL 唯一索引衝突。
    """
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index)
    if zone not in ('A', 'B') or column_index < 1 or column_index > 6:
        raise ValueError('格位參數錯誤')
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
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
    if zone not in ('A', 'B') or column_index < 1 or column_index > 6:
        return {'success': False, 'error': '格位參數錯誤'}
    conn = get_db(); cur = conn.cursor()
    try:
        ensure_fixed_warehouse_grid(conn, cur)
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
    placement = inventory_placements()
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
    if material is None:
        cur.execute(sql(f"UPDATE {table} SET product_text = ?, product_code = ?, qty = ?, updated_at = ? WHERE id = ?"), (product_text, row.get('product_code') or product_text, qty, now(), item_id))
    else:
        material = (material or '').strip().upper()
        cur.execute(sql(f"UPDATE {table} SET product_text = ?, product_code = ?, material = ?, qty = ?, updated_at = ? WHERE id = ?"), (product_text, material or product_text, material, qty, now(), item_id))
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


def save_inventory_item(product_text, product_code, qty, location="", customer_name="", operator="", source_text="", material=""):
    conn = get_db()
    cur = conn.cursor()
    try:
        product_text = format_product_text_height2((product_text or '').strip())
        material = clean_material_value(material or product_code or '', product_text)
        product_code = material
        location = (location or '').strip()
        customer_name = (customer_name or '').strip()
        customer_uid = _customer_uid_for_name_cur(cur, customer_name)
        qty = int(qty or 0)
        rows = _fetch_matching_size_material_rows(cur, 'inventory', product_text, material, customer_name=customer_name, location=location)
        matched = rows[-1] if rows else None
        if matched:
            rid = matched["id"]
            merged_product_text = _merge_product_text_supports(matched.get('product_text') or '', product_text)
            cur.execute(sql("""
                UPDATE inventory
                SET qty = qty + ?, product_code = ?, material = ?, product_text = ?, customer_name = ?, customer_uid = ?, operator = ?, source_text = ?, updated_at = ?
                WHERE id = ?
            """), (qty, product_code, material, merged_product_text, customer_name, customer_uid, operator, source_text, now(), rid))
        else:
            cur.execute(sql("""
                INSERT INTO inventory(product_text, product_code, material, qty, location, customer_name, customer_uid, operator, source_text, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """), (product_text, product_code, material, qty, location, customer_name, customer_uid, operator, source_text, now(), now()))
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
                    cur.execute(sql("UPDATE orders SET qty = qty + ?, product_text = ?, product_code = ?, material = ?, customer_uid = ?, operator = ?, updated_at = ? WHERE id = ?"), (qty, merged_product_text, product_code, material, order_customer_uid, operator, now(), rid))
                    continue
            cur.execute(sql("""
                INSERT INTO orders(customer_name, customer_uid, product_text, product_code, material, qty, status, operator, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
            """), (customer_name, order_customer_uid, product_text, product_code, material, qty, operator, now(), now()))
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
                    UPDATE master_orders SET qty = qty + ?, product_text = ?, product_code = ?, material = ?, customer_uid = ?, operator = ?, updated_at = ?
                    WHERE id = ?
                """), (qty, merged_product_text, product_code, material, master_customer_uid, operator, now(), rid))
            else:
                cur.execute(sql("""
                    INSERT INTO master_orders(customer_name, customer_uid, product_text, product_code, material, qty, operator, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """), (customer_name, master_customer_uid, product_text, product_code, material, qty, operator, now(), now()))
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()
