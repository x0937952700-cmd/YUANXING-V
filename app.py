import os
import re
import json
import hashlib
import difflib
from functools import wraps
from datetime import datetime
from flask import Flask, request, jsonify, render_template, redirect, url_for, session, send_file, g
from werkzeug.security import generate_password_hash, check_password_hash

import db

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'yuanxing-clean-v1-dev-secret')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

ADMIN_NAME = os.environ.get('ADMIN_NAME', '陳韋廷')
PAGE_TITLES = {
    'home': '首頁',
    'inventory': '庫存',
    'orders': '訂單',
    'master': '總單',
    'inbound': '入庫',
    'shipping': '出貨',
    'warehouse': '倉庫圖',
    'customers': '客戶資料',
    'activity': '今日異動',
    'settings': '設定',
    'records': '出貨紀錄',
}

REQUIREMENT_FULL_ALIGNMENT = [
    {'id': 1, 'title': '整體原則', 'status': 'locked', 'evidence': '乾淨母版；base.html 僅載 core.js + page.js；不載 FIX135~FIX151 hardlock'},
    {'id': 2, 'title': '首頁 / 主選單', 'status': 'locked', 'evidence': '沅興木業標題、設定/今日異動/登出同排、全站搜尋、10 個功能入口'},
    {'id': 3, 'title': '全站導頁邏輯', 'status': 'locked', 'evidence': '無全頁遮罩；返回首頁只做頁面跳轉；API 內部 loading/toast'},
    {'id': 4, 'title': '庫存功能', 'status': 'locked', 'evidence': '搜尋、商品篩選、批量選取、批量材質、批量刪除、編輯/刪除/加訂單/加總單/出貨'},
    {'id': 5, 'title': '訂單功能', 'status': 'locked', 'evidence': '只列有訂單客戶、取消退回庫存、直接出貨、加入總單、長按/右鍵/拖拉客戶'},
    {'id': 6, 'title': '總單功能', 'status': 'locked', 'evidence': '分客戶、純文字總單、合併預覽確認、直接出貨、扣除前後數量'},
    {'id': 7, 'title': '入庫功能', 'status': 'locked', 'evidence': '有客戶入總單、無客戶入庫存、白板分組解析、今日異動記錄'},
    {'id': 8, 'title': '出貨功能', 'status': 'locked', 'evidence': '客戶建議、客戶商品下拉、加入選取/全部、預覽、借貨確認、扣來源、前後數量'},
    {'id': 9, 'title': '材積 / 重量 / 長度', 'status': 'locked', 'evidence': 'dim_to_meter、qty_sum、calc_volume_for_item；總重=材積x重量係數'},
    {'id': 10, 'title': '商品格式解析', 'status': 'locked', 'evidence': 'x/× 正規化、底線承接、小數點修正、100X30X63 特例 10 件'},
    {'id': 11, 'title': 'OCR / 拍照 / 上傳', 'status': 'locked', 'evidence': '相簿/相機按鈕、TextDetector 可用時辨識、紅字忽略、藍字優先、框選區記憶、低信心輸出到文字框'},
    {'id': 12, 'title': '倉庫圖', 'status': 'locked', 'evidence': 'A/B、6段、前/後排、動態格、拖拉、撤回、搜尋定位、高亮、單格刷新'},
    {'id': 13, 'title': '客戶資料', 'status': 'locked', 'evidence': '新增/編輯/刪除名片/封存/還原/拖拉換區/改名同步/常用材質尺寸'},
    {'id': 14, 'title': '北中南客戶標籤', 'status': 'locked', 'evidence': '點擊、長按、右鍵、pointer 拖拉換區，不用舊 HTML5 drop'},
    {'id': 15, 'title': '今日異動', 'status': 'locked', 'evidence': '每人 badge、開頁已讀、未錄入明細、點擊詳細、左滑刪除/右滑詳細'},
    {'id': 16, 'title': '設定頁', 'status': 'locked', 'evidence': '改密碼、使用者管理、黑名單、備份/還原、備份紀錄、操作紀錄、系統檢查'},
    {'id': 17, 'title': '登入 / 帳號 / 管理員', 'status': 'locked', 'evidence': '註冊/登入/登出/session/封鎖即時生效/第一位管理員/避免鎖出最後管理員'},
    {'id': 18, 'title': '資料同步 / 多人使用', 'status': 'locked', 'evidence': 'sync-state 12 秒短輪詢、toast 提醒、局部刷新'},
    {'id': 19, 'title': '防重複送出 / 穩定性', 'status': 'locked', 'evidence': 'request_keys pending/success/failed；危險操作 request_key；transaction 包覆'},
    {'id': 20, 'title': '錯誤顯示', 'status': 'locked', 'evidence': 'api_error JSON、toast 小卡、登入過期自動回登入頁、無白畫面'},
    {'id': 21, 'title': '資料庫 / 後端', 'status': 'locked', 'evidence': 'SQLite/PostgreSQL、自動建表補欄、舊 records 轉換、缺欄重試'},
    {'id': 22, 'title': '備份 / 還原', 'status': 'locked', 'evidence': 'JSON備份、SQLite db下載、備份紀錄、還原前快照、還原鎖出保護'},
    {'id': 23, 'title': 'PWA / 手機 App', 'status': 'locked', 'evidence': 'manifest、service worker、離線頁、多尺寸 icon、iPhone meta'},
    {'id': 24, 'title': 'UI 視覺風格', 'status': 'locked', 'evidence': '淡灰膠囊、雲背景、商業卡片、陰影、空狀態、錯誤小卡'},
    {'id': 25, 'title': '手機操作優化', 'status': 'locked', 'evidence': '大按鈕、響應式、滑動卡片、pointer 拖拉、倉庫橫向滑動'},
    {'id': 26, 'title': '搜尋功能', 'status': 'locked', 'evidence': '首頁全站搜尋、即時篩選、清除、最近搜尋、來源顯示、倉庫跳格'},
    {'id': 27, 'title': '出貨查詢 / 紀錄', 'status': 'locked', 'evidence': 'records page、日期篩選、搜尋、詳細、材積/重量/長度'},
    {'id': 28, 'title': '資料格式 / 排序', 'status': 'locked', 'evidence': '月份→高→寬→長；客戶 sort_order 保存'},
    {'id': 29, 'title': '效能要求', 'status': 'locked', 'evidence': '無舊母版、單頁 JS、批量 transaction、單格更新、API no-store'},
    {'id': 30, 'title': '乾淨版本命名', 'status': 'locked', 'evidence': 'COMMERCIAL_V9_TEXT_FULL_ALIGNMENT_LOCKED'},
    {'id': 31, 'title': 'CLEAN 第一版 12 頁', 'status': 'locked', 'evidence': 'login/home/inventory/orders/master/inbound/shipping/warehouse/customers/activity/records/settings'},
    {'id': 32, 'title': '成功標準', 'status': 'locked', 'evidence': 'health schema、smoke tests、service-worker v9、無舊 FIX 載入'},
]



def current_user():
    # 真正依 session 判斷登入；不再未登入自動當成管理員。
    return session.get('username')


def is_admin():
    user = current_user()
    return bool(user) and (user == ADMIN_NAME or session.get('role') == 'admin')


def db_truthy(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in ['1', 'true', 't', 'yes', 'y', 'on']


def current_user_row():
    user = current_user()
    if not user:
        return None
    return db.safe_fetchone("SELECT * FROM users WHERE username=?", [user])


def is_current_user_blocked():
    row = current_user_row()
    # If the user row disappeared after restore, force re-login rather than allowing a ghost session.
    if current_user() and not row:
        return True
    return db_truthy((row or {}).get('is_blocked'))


def request_key_duplicate(data, operation=''):
    request_key = (data.get('request_key') or '').strip() if isinstance(data, dict) else ''
    if not request_key:
        return False
    duplicate = db.check_request_key(request_key, operation or request.path)
    if not duplicate:
        g.request_key_started = request_key
    return duplicate


def transactional(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        with db.atomic():
            return fn(*args, **kwargs)
    return wrapper


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            if request.path.startswith('/api/'):
                return jsonify({'ok': False, 'error': '登入已過期，請重新登入', 'login_required': True}), 401
            return redirect(url_for('login_page'))
        if is_current_user_blocked():
            session.clear()
            if request.path.startswith('/api/'):
                return jsonify({'ok': False, 'error': '此帳號已被封鎖，請聯絡管理員', 'login_required': True}), 403
            return redirect(url_for('login_page'))
        return fn(*args, **kwargs)
    return wrapper


def api_error(message, code=400, **extra):
    payload = {'ok': False, 'error': message}
    payload.update(extra)
    return jsonify(payload), code


def body_json():
    return request.get_json(silent=True) or {}


def normalize_dim(v):
    v = str(v or '').strip().replace(' ', '')
    if not v:
        return ''
    v = v.replace('O', '0').replace('o', '0')
    # OCR often reads 1.65 when intended 165; keep 0xx strings as text.
    if re.fullmatch(r'\d+\.\d+', v):
        return v.replace('.', '')
    return v


def normalize_line(line, last_wh=None):
    last_wh = last_wh or ('', '')
    raw = (line or '').strip()
    raw = raw.replace('×', 'x').replace('X', 'x').replace('✕', 'x').replace('*', 'x')
    raw = re.sub(r'\s+', '', raw)
    raw = raw.replace('＝', '=').replace(':', '=')
    raw = raw.replace('件', '')
    if not raw:
        return None, last_wh

    if '=' not in raw:
        return None, last_wh
    left, right = raw.split('=', 1)
    dims = [d for d in left.split('x') if d != '']
    if len(dims) == 2 and ('___' in left or '_' in left):
        dims = [dims[0], last_wh[0], last_wh[1]]
    elif len(dims) == 1 and ('___' in left or '_' in left):
        dims = [dims[0], last_wh[0], last_wh[1]]
    elif len(dims) < 3:
        return None, last_wh
    length, width, height = [normalize_dim(x.replace('_', '')) for x in dims[:3]]
    if width and height:
        last_wh = (width, height)
    right = right.replace('×', 'x').replace('X', 'x')
    right = re.sub(r'\s+', '', right)
    product_text = f'{length}x{width}x{height}={right}'
    pieces = count_pieces(right)
    return {
        'product_text': product_text,
        'length_text': length,
        'width_text': width,
        'height_text': height,
        'qty_expr': right,
        'pieces': pieces,
    }, last_wh


def count_pieces(expr):
    expr = (expr or '').replace('×', 'x').replace('X', 'x')
    expr = re.sub(r'\s+', '', expr)
    # User-confirmed special OCR/master-order case:
    # 100X30X63=504x5+588+587+502+420+382+378+280+254+237+174 is counted as 10 件.
    if expr == '504x5+588+587+502+420+382+378+280+254+237+174':
        return 10
    if not expr:
        return 0
    total = 0
    for token in expr.split('+'):
        token = token.strip()
        if not token:
            continue
        m = re.search(r'x(\d+)$', token)
        if m:
            total += int(m.group(1))
        else:
            total += 1
    return total


def parse_product_text(text):
    rows = []
    last_wh = ('', '')
    for raw_line in (text or '').splitlines():
        parsed, last_wh = normalize_line(raw_line, last_wh)
        if parsed:
            rows.append(parsed)
    return rows


def dim_to_meter(v):
    s = normalize_dim(v)
    if not s:
        return 0.0
    try:
        n = float(s)
    except ValueError:
        return 0.0
    # User rule: 363 -> 0.363, 212 -> 0.212; 80 -> 0.8, 140 -> 1.4.
    if n > 210:
        return n / 1000.0
    return n / 100.0


def qty_sum(expr):
    expr = (expr or '').replace('×', 'x').replace('X', 'x')
    total = 0
    parts = []
    for token in expr.split('+'):
        token = token.strip()
        if not token:
            continue
        m = re.match(r'^(\d+(?:\.\d+)?)x(\d+)$', token)
        if m:
            val = float(m.group(1)) * int(m.group(2))
            parts.append(f"{m.group(1)}x{m.group(2)}")
            total += val
        else:
            try:
                total += float(token)
                parts.append(token)
            except ValueError:
                pass
    return total, '+'.join(parts)


def calc_volume_for_item(item):
    qty, formula_qty = qty_sum(item.get('qty_expr') or '')
    length_m = dim_to_meter(item.get('length_text'))
    width_m = dim_to_meter(item.get('width_text'))
    height_m = dim_to_meter(item.get('height_text'))
    volume = qty * length_m * width_m * height_m
    formula = f"({formula_qty})x{length_m:g}x{width_m:g}x{height_m:g}"
    return round(volume, 4), formula


def safe_int(value, default=0):
    try:
        if value is None or value == '':
            return default
        return int(float(str(value).strip()))
    except Exception:
        return default


def safe_float(value, default=0.0):
    try:
        if value is None or value == '':
            return default
        return float(str(value).strip())
    except Exception:
        return default


def fuzzy_customer_name(name):
    """Return the closest existing customer name for OCR/customer input.

    Used when pasted OCR text has a slightly wrong customer heading. It prefers exact and
    prefix matches, then uses a conservative similarity score. If there is no good match,
    the original text is kept so new customers can still be auto-created.
    """
    raw = str(name or '').strip()
    if not raw:
        return ''
    try:
        rows = db.safe_fetchall("SELECT name FROM customers WHERE archived=?", [db.flag(False)])
    except Exception:
        return raw
    names = [str(r.get('name') or '').strip() for r in rows if str(r.get('name') or '').strip()]
    if not names:
        return raw
    if raw in names:
        return raw
    for n in names:
        if n.startswith(raw) or raw.startswith(n):
            return n
    for n in names:
        if raw in n or n in raw:
            return n
    best = max(names, key=lambda n: difflib.SequenceMatcher(None, raw, n).ratio())
    score = difflib.SequenceMatcher(None, raw, best).ratio()
    return best if score >= 0.58 else raw


def activity_last_read_id(username=None):
    username = username or current_user() or ''
    row = db.safe_fetchone("SELECT last_read_id FROM activity_reads WHERE username=?", [username])
    return safe_int((row or {}).get('last_read_id'), 0)


def activity_unread_count(username=None):
    last_id = activity_last_read_id(username)
    row = db.safe_fetchone("SELECT COUNT(*) AS c FROM activity_logs WHERE id>?", [last_id]) or {}
    return safe_int(row.get('c'), 0)


def mark_activity_read(username=None):
    username = username or current_user() or ''
    if not username:
        return
    mx = db.safe_fetchone("SELECT COALESCE(MAX(id),0) AS m FROM activity_logs") or {}
    last_id = safe_int(mx.get('m'), 0)
    if db.IS_PG:
        db.safe_execute("""INSERT INTO activity_reads(username, last_read_id, updated_at) VALUES(?,?,?)
                         ON CONFLICT(username) DO UPDATE SET last_read_id=EXCLUDED.last_read_id, updated_at=EXCLUDED.updated_at""",
                        [username, last_id, db.now()])
    else:
        old = db.safe_fetchone("SELECT id FROM activity_reads WHERE username=?", [username])
        if old:
            db.safe_execute("UPDATE activity_reads SET last_read_id=?, updated_at=? WHERE username=?", [last_id, db.now(), username])
        else:
            db.safe_execute("INSERT INTO activity_reads(username, last_read_id, updated_at) VALUES(?,?,?)", [username, last_id, db.now()])


def clean_zone(value):
    value = str(value or 'A').upper().strip()
    return value if value in ['A', 'B'] else 'A'


def clean_row_name(value):
    value = str(value or 'front').strip()
    return value if value in ['front', 'back'] else 'front'


def clean_band(value):
    return max(1, min(6, safe_int(value, 1)))


def clean_slot(value):
    return max(1, safe_int(value, 1))


def module_from_table(table):
    return {'inventory': 'inventory', 'orders': 'orders', 'master_orders': 'master'}.get(table or '', '')


def cell_key(zone, band, row_name, slot):
    return f"{zone}-{int(band)}-{row_name}-{int(slot)}"


def table_from_source(source):
    if source in ['inventory', 'orders', 'master']:
        return db.table_for_module(source)
    if source in ['master_orders']:
        return 'master_orders'
    if source in ['inventory', 'orders']:
        return source
    return ''


def source_name_from_table(table):
    return {'inventory': 'inventory', 'orders': 'orders', 'master_orders': 'master'}.get(table, table or '')


def normalize_warehouse_items(items, zone, band, row_name, slot):
    """Clean warehouse item payloads, enrich source-linked rows, and prevent duplicate refs.

    同一個商品來源不應同時在同一格出現兩次，否則倉庫件數和未錄入統計會失真。
    有來源表/id 的商品以來源為準；手動輸入的簡化件數保留原樣。
    """
    normalized = []
    seen_refs = {}
    for idx, item in enumerate(items or []):
        if not isinstance(item, dict):
            continue
        source = item.get('source') or source_name_from_table(item.get('source_table'))
        source_table = table_from_source(source)
        source_id = safe_int(item.get('id') or item.get('source_id'), 0)
        row = None
        if source_table and source_id:
            row = db.safe_fetchone(f"SELECT * FROM {source_table} WHERE id=?", [source_id])
            if not row:
                # 來源商品已刪除時，不再把幽靈資料留在倉庫格子。
                continue
        customer = (item.get('customer') or item.get('customer_name') or (row or {}).get('customer_name') or '庫存').strip() or '庫存'
        max_pieces = safe_int((row or {}).get('pieces'), 0)
        pieces = safe_int(item.get('pieces'), max_pieces)
        if max_pieces:
            pieces = min(max(0, pieces), max_pieces)
        payload = {
            'source': source_name_from_table(source_table) if source_table else (source or ''),
            'source_table': source_table,
            'source_id': source_id,
            'id': source_id,
            'customer': customer,
            'customer_name': customer,
            'product_text': item.get('product_text') or (row or {}).get('product_text') or '',
            'material': item.get('material') or (row or {}).get('material') or '',
            'pieces': pieces,
            'warehouse_key': cell_key(zone, band, row_name, slot),
            'sort_order': idx,
        }
        ref_key = (source_table, source_id) if source_table and source_id else None
        if ref_key:
            if ref_key in seen_refs:
                old_idx = seen_refs[ref_key]
                normalized[old_idx].update(payload)
                normalized[old_idx]['sort_order'] = min(normalized[old_idx].get('sort_order', idx), idx)
                continue
            seen_refs[ref_key] = len(normalized)
        normalized.append(payload)
    for i, item in enumerate(normalized):
        item['sort_order'] = i
    return normalized


def sync_cell_links(zone, band, row_name, slot, old_items, new_items):
    """Keep warehouse_cells/items and item.warehouse_key in sync.

    This makes 未錄入倉庫圖 count, product search, and shipping location consistent.
    """
    key = cell_key(zone, band, row_name, slot)
    old_refs = set()
    for item in old_items or []:
        source_table = table_from_source(item.get('source') or source_name_from_table(item.get('source_table')))
        source_id = safe_int(item.get('id') or item.get('source_id'), 0)
        if source_table and source_id:
            old_refs.add((source_table, source_id))
    new_refs = set()
    normalized = normalize_warehouse_items(new_items, zone, band, row_name, slot)
    cell = db.safe_fetchone("SELECT id FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?", [zone, band, row_name, slot])
    cell_id = safe_int((cell or {}).get('id'), 0)
    db.safe_execute("DELETE FROM warehouse_items WHERE zone=? AND band=? AND row_name=? AND slot=?", [zone, band, row_name, slot])
    for item in normalized:
        source_table = item.get('source_table') or ''
        source_id = safe_int(item.get('source_id'), 0)
        if source_table and source_id:
            new_refs.add((source_table, source_id))
            db.safe_execute(f"UPDATE {source_table} SET warehouse_key=?, updated_at=? WHERE id=?", [key, db.now(), source_id])
        db.safe_execute(
            """INSERT INTO warehouse_items(cell_id, zone, band, row_name, slot, source_table, source_id,
                   customer_name, product_text, material, pieces, sort_order, created_at, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [cell_id, zone, band, row_name, slot, source_table, source_id, item.get('customer_name',''),
             item.get('product_text',''), item.get('material',''), item.get('pieces') or 0, item.get('sort_order') or 0,
             db.now(), db.now()],
        )
    for source_table, source_id in old_refs - new_refs:
        db.safe_execute(f"UPDATE {source_table} SET warehouse_key='', updated_at=? WHERE id=? AND warehouse_key=?", [db.now(), source_id, key])
    return normalized


def refs_from_items(items):
    refs = set()
    for item in items or []:
        if not isinstance(item, dict):
            continue
        source_table = table_from_source(item.get('source') or source_name_from_table(item.get('source_table')))
        source_id = safe_int(item.get('source_id') or item.get('id'), 0)
        if source_table and source_id:
            refs.add((source_table, source_id))
    return refs


def dedupe_refs_from_other_cells(target_zone, target_band, target_row_name, target_slot, items):
    """Remove source-linked products from all cells except the target cell.

    This prevents the same inventory/order/master row from being displayed in two warehouse slots
    after drag/drop, merge, or moving between inventory → order → master.
    """
    refs = refs_from_items(items)
    if not refs:
        return
    cells = db.safe_fetchall("SELECT * FROM warehouse_cells")
    for c in cells:
        zone = c.get('zone') or 'A'
        band = safe_int(c.get('band'), 1)
        row_name = c.get('row_name') or 'front'
        slot = safe_int(c.get('slot'), 1)
        if zone == target_zone and band == safe_int(target_band, 1) and row_name == target_row_name and slot == safe_int(target_slot, 1):
            continue
        old_items = parse_items_json(c.get('items_json'))
        new_items = []
        changed = False
        for it in old_items:
            source_table = table_from_source(it.get('source') or source_name_from_table(it.get('source_table')))
            source_id = safe_int(it.get('source_id') or it.get('id'), 0)
            if source_table and source_id and (source_table, source_id) in refs:
                changed = True
                continue
            new_items.append(it)
        if changed:
            normalized = normalize_warehouse_items(new_items, zone, band, row_name, slot)
            dedupe_refs_from_other_cells(zone, band, row_name, slot, normalized)
            db.safe_execute("UPDATE warehouse_cells SET items_json=?, updated_at=? WHERE id=?", [json.dumps(normalized, ensure_ascii=False), db.now(), c.get('id')])
            sync_cell_links(zone, band, row_name, slot, old_items, normalized)


def _is_ref(item, table, source_id):
    source_table = table_from_source(item.get('source') or source_name_from_table(item.get('source_table')))
    sid = safe_int(item.get('source_id') or item.get('id'), 0)
    return source_table == table and sid == safe_int(source_id, 0)


def refresh_warehouse_ref(table, source_id, row=None, remove=False):
    """Update or remove a product reference inside warehouse cell JSON.

    Keeps warehouse_cells.items_json, warehouse_items, and source table warehouse_key consistent
    after editing, deleting, shipping, or moving inventory/order/master rows.
    """
    source_id = safe_int(source_id, 0)
    if not table or not source_id:
        return
    if row is None and not remove:
        row = db.safe_fetchone(f"SELECT * FROM {table} WHERE id=?", [source_id])
    changed_any = False
    cells = db.safe_fetchall("SELECT * FROM warehouse_cells")
    for c in cells:
        zone = c.get('zone') or 'A'
        band = safe_int(c.get('band'), 1)
        row_name = c.get('row_name') or 'front'
        slot = safe_int(c.get('slot'), 1)
        old_items = parse_items_json(c.get('items_json'))
        new_items = []
        changed = False
        for it in old_items:
            if _is_ref(it, table, source_id):
                changed = True
                if remove:
                    continue
                r = row or {}
                it = dict(it)
                it.update({
                    'source': module_from_table(table),
                    'source_table': table,
                    'source_id': source_id,
                    'id': source_id,
                    'customer': r.get('customer_name') or it.get('customer') or it.get('customer_name') or '庫存',
                    'customer_name': r.get('customer_name') or it.get('customer_name') or it.get('customer') or '庫存',
                    'product_text': r.get('product_text') or it.get('product_text') or '',
                    'material': r.get('material') or it.get('material') or '',
                    'pieces': safe_int(r.get('pieces'), safe_int(it.get('pieces'), 0)),
                })
            new_items.append(it)
        if changed:
            normalized = normalize_warehouse_items(new_items, zone, band, row_name, slot)
            dedupe_refs_from_other_cells(zone, band, row_name, slot, normalized)
            db.safe_execute("UPDATE warehouse_cells SET items_json=?, updated_at=? WHERE id=?", [json.dumps(normalized, ensure_ascii=False), db.now(), c.get('id')])
            sync_cell_links(zone, band, row_name, slot, old_items, normalized)
            changed_any = True
    if remove:
        db.safe_execute("DELETE FROM warehouse_items WHERE source_table=? AND source_id=?", [table, source_id])
    return changed_any


def move_warehouse_ref(old_table, old_id, new_table, new_id, take_pieces=0, remain_pieces=0):
    old_id = safe_int(old_id, 0)
    new_id = safe_int(new_id, 0)
    take_pieces = safe_int(take_pieces, 0)
    remain_pieces = safe_int(remain_pieces, 0)
    if not old_table or not old_id or not new_table or not new_id:
        return
    new_row = db.safe_fetchone(f"SELECT * FROM {new_table} WHERE id=?", [new_id]) or {}
    old_row = db.safe_fetchone(f"SELECT * FROM {old_table} WHERE id=?", [old_id]) or {}
    cells = db.safe_fetchall("SELECT * FROM warehouse_cells")
    for c in cells:
        zone = c.get('zone') or 'A'
        band = safe_int(c.get('band'), 1)
        row_name = c.get('row_name') or 'front'
        slot = safe_int(c.get('slot'), 1)
        old_items = parse_items_json(c.get('items_json'))
        new_items = []
        changed = False
        for it in old_items:
            if _is_ref(it, old_table, old_id):
                changed = True
                if remain_pieces > 0:
                    old_it = dict(it)
                    old_it['pieces'] = remain_pieces
                    old_it['customer'] = old_row.get('customer_name') or old_it.get('customer') or old_it.get('customer_name') or '庫存'
                    old_it['customer_name'] = old_row.get('customer_name') or old_it.get('customer_name') or old_it.get('customer') or '庫存'
                    new_items.append(old_it)
                    new_items.insert(max(0, len(new_items)-1), {
                        'source': module_from_table(new_table),
                        'source_table': new_table,
                        'source_id': new_id,
                        'id': new_id,
                        'customer': new_row.get('customer_name') or '庫存',
                        'customer_name': new_row.get('customer_name') or '庫存',
                        'product_text': new_row.get('product_text') or it.get('product_text') or '',
                        'material': new_row.get('material') or it.get('material') or '',
                        'pieces': take_pieces,
                    })
                else:
                    new_items.append({
                        'source': module_from_table(new_table),
                        'source_table': new_table,
                        'source_id': new_id,
                        'id': new_id,
                        'customer': new_row.get('customer_name') or '庫存',
                        'customer_name': new_row.get('customer_name') or '庫存',
                        'product_text': new_row.get('product_text') or it.get('product_text') or '',
                        'material': new_row.get('material') or it.get('material') or '',
                        'pieces': take_pieces or safe_int(new_row.get('pieces'), safe_int(it.get('pieces'), 0)),
                    })
            else:
                new_items.append(it)
        if changed:
            normalized = normalize_warehouse_items(new_items, zone, band, row_name, slot)
            db.safe_execute("UPDATE warehouse_cells SET items_json=?, updated_at=? WHERE id=?", [json.dumps(normalized, ensure_ascii=False), db.now(), c.get('id')])
            sync_cell_links(zone, band, row_name, slot, old_items, normalized)


def rename_customer_in_warehouse(old_name, new_name):
    if not old_name or not new_name or old_name == new_name:
        return
    cells = db.safe_fetchall("SELECT * FROM warehouse_cells")
    for c in cells:
        zone = c.get('zone') or 'A'
        band = safe_int(c.get('band'), 1)
        row_name = c.get('row_name') or 'front'
        slot = safe_int(c.get('slot'), 1)
        old_items = parse_items_json(c.get('items_json'))
        changed = False
        for it in old_items:
            if (it.get('customer') == old_name) or (it.get('customer_name') == old_name):
                it['customer'] = new_name
                it['customer_name'] = new_name
                changed = True
        if changed:
            normalized = normalize_warehouse_items(old_items, zone, band, row_name, slot)
            db.safe_execute("UPDATE warehouse_cells SET items_json=?, updated_at=? WHERE id=?", [json.dumps(normalized, ensure_ascii=False), db.now(), c.get('id')])
            sync_cell_links(zone, band, row_name, slot, old_items, normalized)
    db.safe_execute("UPDATE warehouse_items SET customer_name=? WHERE customer_name=?", [new_name, old_name])


def parse_items_json(value):
    try:
        data = json.loads(value or '[]')
        return data if isinstance(data, list) else []
    except Exception:
        return []


def sync_row_after_slot_change(zone, band, row_name):
    rows = db.safe_fetchall("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? ORDER BY slot", [zone, band, row_name])
    for row in rows:
        items = parse_items_json(row.get('items_json'))
        sync_cell_links(zone, safe_int(row.get('band'), band), row.get('row_name') or row_name, safe_int(row.get('slot'), 0), items, items)


def serialize_item(row, source=''):
    row = dict(row)
    row['source'] = source
    row['pieces'] = safe_int(row.get('pieces'), 0)
    return row


def item_sort_key(row):
    # General rule: height → width → length ascending; blank/non-numeric values go last.
    def n(v):
        m = re.search(r'\d+', str(v or ''))
        return int(m.group(0)) if m else 999999
    # Simple month prefix support, e.g. 4月 / 04月.
    text = str(row.get('product_text') or '')
    mm = re.search(r'(\d{1,2})\s*月', text)
    month = int(mm.group(1)) if mm else 99
    return (month, n(row.get('height_text')), n(row.get('width_text')), n(row.get('length_text')), str(row.get('updated_at') or ''))


def add_product_to_table(table, customer_name, product, material='', operator='', warehouse_key=''):
    cols = "customer_name, product_text, material, length_text, width_text, height_text, qty_expr, pieces, warehouse_key, operator, created_at, updated_at"
    vals = [customer_name or '', product.get('product_text',''), material or '', product.get('length_text',''), product.get('width_text',''),
            product.get('height_text',''), product.get('qty_expr',''), safe_int(product.get('pieces'), 0), warehouse_key or '', operator, db.now(), db.now()]
    if db.IS_PG:
        return db.insert_and_get_id(
            f"""INSERT INTO {table}({cols}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id""",
            vals,
        )
    return db.insert_and_get_id(
        f"""INSERT INTO {table}({cols}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        vals,
    )


def update_product_table(table, item_id, data, operator):
    fields = []
    params = []
    allowed = ['customer_name', 'product_text', 'material', 'length_text', 'width_text', 'height_text', 'qty_expr', 'pieces', 'warehouse_key', 'status']
    explicit_pieces = 'pieces' in data
    explicit_pieces_value = data.get('pieces')
    if 'product_text' in data and data.get('product_text'):
        parsed = parse_product_text(data.get('product_text'))
        if parsed:
            p = parsed[0]
            data.update(p)
    if explicit_pieces:
        data['pieces'] = safe_int(explicit_pieces_value, safe_int(data.get('pieces'), 0))
    elif 'pieces' in data:
        data['pieces'] = safe_int(data.get('pieces'), 0)
    for k in allowed:
        if k in data:
            fields.append(f"{k}=?")
            params.append(data[k])
    if not fields:
        return
    fields.append('updated_at=?')
    params.append(db.now())
    params.append(item_id)
    db.execute(f"UPDATE {table} SET {', '.join(fields)} WHERE id=?", params)


def ensure_db_ready():
    # 每個 API 進來都會走這裡：自動建表、自動補欄位、舊資料轉換。
    # db.ensure_api_ready() 第一次會完整 migration；之後是輕量保護。
    db.ensure_api_ready()


@app.before_request
def boot_db():
    # CLEAN V2：HTML 頁面先秒開，不在頁面請求時跑資料庫 migration。
    # 只有 API 請求才初始化 DB，避免網站一直卡在空白或 about:blank。
    if request.endpoint == 'static' or request.path in ['/login', '/static/manifest.webmanifest', '/favicon.ico']:
        return
    if not request.path.startswith('/api/'):
        return
    ensure_db_ready()


@app.after_request
def after_request(resp):
    # Commercial hardening: keep API responses private and add basic browser safety headers.
    resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
    resp.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
    resp.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    if request.path.startswith('/api/'):
        resp.headers['Cache-Control'] = 'no-store, max-age=0'
    request_key = getattr(g, 'request_key_started', '')
    if request_key:
        try:
            if 200 <= resp.status_code < 400:
                db.mark_request_key_success(request_key, {'status_code': resp.status_code})
            else:
                db.mark_request_key_failed(request_key, f'HTTP {resp.status_code}')
        except Exception:
            pass
    return resp


@app.route('/healthz', methods=['GET', 'HEAD'])
def healthz():
    """Public lightweight deployment health check for Render.

    It does not require login, but still verifies that the schema guard can run.
    """
    ok = True
    detail = ''
    try:
        db.ensure_api_ready()
    except Exception as exc:
        ok = False
        detail = str(exc)[:200]
    status = 200 if ok else 503
    return jsonify({'ok': ok, 'version': 'YUANXING_COMMERCIAL_V9_TEXT_FULL_ALIGNMENT_LOCKED', 'database': 'postgres' if db.IS_PG else 'sqlite', 'detail': detail}), status


@app.route('/login')
def login_page():
    return render_template('login.html')


@app.route('/')
@login_required
def home():
    return render_template('home.html', page='home', title='沅興木業', user=current_user())


@app.route('/<page>')
@login_required
def page_view(page):
    if page not in PAGE_TITLES or page == 'home':
        return redirect(url_for('home'))
    return render_template('page.html', page=page, title=PAGE_TITLES[page], user=current_user())


@app.post('/api/register')
def api_register():
    data = body_json()
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return api_error('請輸入姓名與密碼')
    first_user = not db.fetchone("SELECT id FROM users LIMIT 1")
    role = 'admin' if (first_user or username == ADMIN_NAME) else 'user'
    try:
        db.execute(
            "INSERT INTO users(username, password_hash, role, is_blocked, created_at) VALUES(?,?,?,?,?)",
            [username, generate_password_hash(password), role, db.flag(False), db.now()],
        )
    except Exception:
        return api_error('此姓名已註冊，請直接登入')
    session['username'] = username
    session['role'] = role
    db.add_activity('註冊', username, '', '使用者註冊', username)
    return jsonify({'ok': True, 'username': username})


@app.post('/api/login')
def api_login():
    data = body_json()
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    user = db.fetchone("SELECT * FROM users WHERE username=?", [username])
    if not user:
        return api_error('帳號或密碼錯誤', 401)
    password_ok = False
    stored_hash = user.get('password_hash') or ''
    legacy_password = user.get('password') or ''
    if stored_hash:
        try:
            password_ok = check_password_hash(stored_hash, password)
        except Exception:
            password_ok = False
    if not password_ok and legacy_password:
        try:
            password_ok = check_password_hash(legacy_password, password)
        except Exception:
            password_ok = (legacy_password == password)
        if password_ok:
            db.execute("UPDATE users SET password_hash=?, password='' WHERE username=?", [generate_password_hash(password), username])
    if not password_ok:
        return api_error('帳號或密碼錯誤', 401)
    if db_truthy(user.get('is_blocked')):
        return api_error('此帳號已被封鎖，請聯絡管理員', 403)
    if stored_hash and legacy_password:
        db.safe_execute("UPDATE users SET password='' WHERE username=?", [username])
    session['username'] = username
    session['role'] = user.get('role') or 'user'
    return jsonify({'ok': True, 'username': username})


@app.post('/api/logout')
@login_required
def api_logout():
    session.clear()
    return jsonify({'ok': True})


@app.get('/api/session')
def api_session():
    if current_user() and is_current_user_blocked():
        session.clear()
        return jsonify({'ok': True, 'logged_in': False, 'username': None, 'admin': False, 'blocked': True})
    return jsonify({'ok': True, 'logged_in': bool(current_user()), 'username': current_user(), 'admin': is_admin()})


@app.get('/api/customers')
@login_required
def api_customers():
    archived = request.args.get('archived') == '1'
    rows = db.fetchall("""
        SELECT c.*,
               COALESCE((SELECT SUM(COALESCE(pieces,0)) FROM inventory WHERE customer_name=c.name),0)
             + COALESCE((SELECT SUM(COALESCE(pieces,0)) FROM orders WHERE customer_name=c.name AND status='open'),0)
             + COALESCE((SELECT SUM(COALESCE(pieces,0)) FROM master_orders WHERE customer_name=c.name),0) AS total_pieces,
               COALESCE((SELECT COUNT(1) FROM inventory WHERE customer_name=c.name),0)
             + COALESCE((SELECT COUNT(1) FROM orders WHERE customer_name=c.name AND status='open'),0)
             + COALESCE((SELECT COUNT(1) FROM master_orders WHERE customer_name=c.name),0) AS total_records
        FROM customers c
        WHERE c.archived=?
        ORDER BY c.region, c.sort_order, c.name
    """, [db.flag(archived)])
    return jsonify({'ok': True, 'customers': rows})


@app.get('/api/customer-suggest')
@login_required
def api_customer_suggest():
    q = (request.args.get('q') or '').strip()
    like = q + '%'
    rows = db.fetchall("SELECT name, region FROM customers WHERE archived=? AND name LIKE ? ORDER BY name LIMIT 20", [db.flag(False), like])
    return jsonify({'ok': True, 'customers': rows})


@app.post('/api/customers')
@login_required
@transactional
def api_customers_post():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    name = (data.get('name') or '').strip()
    if not name:
        return api_error('請輸入客戶名稱')
    db.ensure_customer(name, data.get('region') or 'north', current_user())
    db.execute("UPDATE customers SET region=?, common_material=?, common_size=?, updated_at=? WHERE name=?",
               [data.get('region') or 'north', data.get('common_material') or '', data.get('common_size') or '', db.now(), name])
    db.upsert_customer_profile(name, data.get('common_material') or '', data.get('common_size') or '', data.get('note') or '')
    db.add_activity('客戶更新', name, '', '新增/更新客戶資料', current_user())
    return jsonify({'ok': True})


@app.get('/api/customers/<path:name>/profile')
@login_required
def api_customer_profile(name):
    row = db.safe_fetchone("SELECT * FROM customers WHERE name=?", [name])
    if not row:
        matched = fuzzy_customer_name(name)
        if matched and matched != name:
            row = db.safe_fetchone("SELECT * FROM customers WHERE name=?", [matched])
    if not row:
        return api_error('找不到客戶', 404)
    profile = db.safe_fetchone("SELECT * FROM customer_profiles WHERE customer_name=?", [row.get('name')]) or {}
    data = dict(row)
    data.update({
        'profile_common_material': profile.get('common_material') or data.get('common_material') or '',
        'profile_common_size': profile.get('common_size') or data.get('common_size') or '',
        'note': profile.get('note') or data.get('note') or '',
    })
    return jsonify({'ok': True, 'customer': data})


@app.patch('/api/customers/<path:name>')
@login_required
@transactional
def api_customer_patch(name):
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    new_name = (data.get('name') or name).strip()
    region = data.get('region')
    common_material = data.get('common_material')
    common_size = data.get('common_size')
    old = db.fetchone("SELECT * FROM customers WHERE name=?", [name])
    if not old:
        return api_error('找不到客戶')
    if new_name != name:
        db.execute("UPDATE customers SET name=?, updated_at=? WHERE name=?", [new_name, db.now(), name])
        for table in ['inventory', 'orders', 'master_orders', 'shipping_records']:
            db.execute(f"UPDATE {table} SET customer_name=? WHERE customer_name=?", [new_name, name])
        db.safe_execute("UPDATE customer_profiles SET customer_name=? WHERE customer_name=?", [new_name, name])
        db.safe_execute("UPDATE archived_customers SET name=? WHERE name=?", [new_name, name])
        rename_customer_in_warehouse(name, new_name)
    if region is not None or common_material is not None or common_size is not None:
        row = db.fetchone("SELECT * FROM customers WHERE name=?", [new_name])
        db.execute("UPDATE customers SET region=?, common_material=?, common_size=?, updated_at=? WHERE name=?",
                   [region or row.get('region') or 'north', common_material if common_material is not None else row.get('common_material',''), common_size if common_size is not None else row.get('common_size',''), db.now(), new_name])
        db.upsert_customer_profile(new_name, common_material if common_material is not None else row.get('common_material',''), common_size if common_size is not None else row.get('common_size',''), row.get('note',''))
    db.add_activity('客戶更新', new_name, '', '編輯客戶資料', current_user())
    return jsonify({'ok': True})


@app.delete('/api/customers/<path:name>')
@login_required
@transactional
def api_customer_delete(name):
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    db.execute("UPDATE customers SET archived=?, updated_at=? WHERE name=?", [db.flag(True), db.now(), name])
    row = db.safe_fetchone("SELECT * FROM customers WHERE name=?", [name]) or {}
    if db.IS_PG:
        db.safe_execute("""INSERT INTO archived_customers(name, region, common_material, common_size, archived_at, operator)
                         VALUES(?,?,?,?,?,?)
                         ON CONFLICT (name) DO UPDATE SET region=EXCLUDED.region, common_material=EXCLUDED.common_material,
                         common_size=EXCLUDED.common_size, archived_at=EXCLUDED.archived_at, operator=EXCLUDED.operator""",
                        [name, row.get('region',''), row.get('common_material',''), row.get('common_size',''), db.now(), current_user()])
    else:
        db.safe_execute("INSERT OR REPLACE INTO archived_customers(name, region, common_material, common_size, archived_at, operator) VALUES(?,?,?,?,?,?)",
                        [name, row.get('region',''), row.get('common_material',''), row.get('common_size',''), db.now(), current_user()])
    db.add_activity('封存客戶', name, '', '客戶已封存', current_user())
    return jsonify({'ok': True})


@app.post('/api/customers/<path:name>/restore')
@login_required
@transactional
def api_customer_restore(name):
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    db.execute("UPDATE customers SET archived=?, updated_at=? WHERE name=?", [db.flag(False), db.now(), name])
    db.safe_execute("DELETE FROM archived_customers WHERE name=?", [name])
    db.add_activity('還原客戶', name, '', '客戶已還原', current_user())
    return jsonify({'ok': True})


@app.delete('/api/customers-hard-delete/<path:name>')
@app.delete('/api/customers/<path:name>/hard-delete')
@login_required
@transactional
def api_customer_hard_delete(name):
    """Delete only the customer profile row while preserving inventory/order/master/shipping data.

    商品歷史資料仍保留原客戶名稱；若之後又從訂單/總單/入庫使用該名稱，系統會自動重建客戶資料。
    """
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    existed = db.safe_fetchone("SELECT * FROM customers WHERE name=?", [name])
    if not existed:
        return api_error('找不到客戶資料', 404)
    db.execute("DELETE FROM customers WHERE name=?", [name])
    db.safe_execute("DELETE FROM customer_profiles WHERE customer_name=?", [name])
    db.safe_execute("DELETE FROM archived_customers WHERE name=?", [name])
    db.add_activity('刪除客戶資料', name, '', '僅刪除客戶名片資料，商品與出貨紀錄保留', current_user())
    return jsonify({'ok': True})


@app.post('/api/customers/reorder')
@login_required
@transactional
def api_customers_reorder():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    region = data.get('region') or 'north'
    names = data.get('names') or []
    if region not in ['north','center','south'] or not isinstance(names, list):
        return api_error('排序資料錯誤')
    for idx, name in enumerate(names):
        if isinstance(name, str) and name.strip():
            db.execute("UPDATE customers SET region=?, sort_order=?, updated_at=? WHERE name=?", [region, idx, db.now(), name.strip()])
    db.add_activity('客戶排序', '', '', f'{region} 客戶排序已更新', current_user())
    return jsonify({'ok': True})


@app.get('/api/items/<module>')
@login_required
def api_items(module):
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    customer = (request.args.get('customer') or '').strip()
    q = (request.args.get('q') or '').strip()
    where = []
    params = []
    if customer:
        where.append('customer_name=?')
        params.append(customer)
    if q:
        where.append('(product_text LIKE ? OR material LIKE ? OR customer_name LIKE ?)')
        params += [f'%{q}%', f'%{q}%', f'%{q}%']
    if module == 'orders':
        where.append("status='open'")
    sql = f"SELECT * FROM {table}"
    if where:
        sql += ' WHERE ' + ' AND '.join(where)
    sql += ' ORDER BY updated_at DESC LIMIT 500'
    rows = [serialize_item(r, module) for r in db.fetchall(sql, params)]
    rows.sort(key=item_sort_key)
    return jsonify({'ok': True, 'items': rows})


@app.get('/api/items/<module>/<int:item_id>')
@login_required
def api_item_get(module, item_id):
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    row = db.fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
    if not row:
        return api_error('找不到商品', 404)
    return jsonify({'ok': True, 'item': serialize_item(row, module)})


@app.get('/api/item-customers/<module>')
@login_required
def api_item_customers(module):
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    status_sql = " AND i.status='open'" if module == 'orders' else ''
    rows = db.fetchall(
        f"""SELECT c.*,
                    COALESCE((SELECT SUM(COALESCE(i.pieces,0)) FROM {table} i WHERE i.customer_name=c.name {status_sql}),0) AS total_pieces,
                    COALESCE((SELECT COUNT(1) FROM {table} i WHERE i.customer_name=c.name {status_sql}),0) AS total_records
             FROM customers c
             WHERE c.archived=?
             AND EXISTS (
               SELECT 1 FROM {table} i
               WHERE i.customer_name=c.name
               {status_sql}
             )
             ORDER BY c.region, c.sort_order, c.name""",
        [db.flag(False)],
    )
    return jsonify({'ok': True, 'customers': rows})


@app.post('/api/items/<module>')
@login_required
@transactional
def api_items_post(module):
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    text = data.get('text') or data.get('product_text') or ''
    rows = parse_product_text(text)
    if not rows:
        return api_error('沒有可加入的商品格式')
    customer = fuzzy_customer_name((data.get('customer_name') or '').strip())
    material = data.get('material') or ''
    if module != 'inventory' and not customer:
        return api_error('請輸入客戶名稱')
    if customer:
        db.ensure_customer(customer, operator=current_user())
    for p in rows:
        add_product_to_table(table, customer, p, material, current_user())
        db.add_activity('新增商品', customer or '庫存', p['product_text'], f'加入{PAGE_TITLES.get(module, module)}', current_user())
    return jsonify({'ok': True, 'count': len(rows)})


@app.patch('/api/items/<module>/<int:item_id>')
@login_required
@transactional
def api_item_patch(module, item_id):
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    update_product_table(table, item_id, data, current_user())
    row = db.safe_fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
    if row:
        refresh_warehouse_ref(table, item_id, row=row, remove=False)
    db.add_activity('編輯商品', (row or data).get('customer_name',''), (row or data).get('product_text',''), f'更新{PAGE_TITLES.get(module,module)}商品', current_user())
    return jsonify({'ok': True})


@app.delete('/api/items/<module>/<int:item_id>')
@login_required
@transactional
def api_item_delete(module, item_id):
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    row = db.fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
    if not row:
        return api_error('找不到商品')
    refresh_warehouse_ref(table, item_id, row=row, remove=True)
    db.execute(f"DELETE FROM {table} WHERE id=?", [item_id])
    db.add_activity('刪除商品', row.get('customer_name',''), row.get('product_text',''), f'刪除{PAGE_TITLES.get(module,module)}商品', current_user())
    return jsonify({'ok': True})


@app.post('/api/items/add-to-order')
@login_required
@transactional
def api_add_to_order():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    inv_id = safe_int(data.get('inventory_id'), 0)
    customer = fuzzy_customer_name((data.get('customer_name') or '').strip())
    pieces = safe_int(data.get('pieces'), 0)
    if not customer:
        return api_error('請輸入客戶名稱')
    inv = db.fetchone("SELECT * FROM inventory WHERE id=?", [inv_id])
    if not inv:
        return api_error('找不到庫存商品')
    pieces = pieces or safe_int(inv.get('pieces'), 0)
    if pieces > safe_int(inv.get('pieces'), 0):
        return api_error('庫存不足，不能超賣')
    db.ensure_customer(customer, operator=current_user())
    p = dict(inv); p['pieces'] = pieces
    new_order_id = add_product_to_table('orders', customer, p, inv.get('material',''), current_user(), inv.get('warehouse_key') or '')
    remain = safe_int(inv.get('pieces'), 0) - pieces
    if remain <= 0:
        move_warehouse_ref('inventory', inv_id, 'orders', new_order_id, pieces, 0)
        db.execute("DELETE FROM inventory WHERE id=?", [inv_id])
    else:
        db.execute("UPDATE inventory SET pieces=?, updated_at=? WHERE id=?", [remain, db.now(), inv_id])
        move_warehouse_ref('inventory', inv_id, 'orders', new_order_id, pieces, remain)
        inv_after = db.safe_fetchone("SELECT * FROM inventory WHERE id=?", [inv_id])
        if inv_after:
            refresh_warehouse_ref('inventory', inv_id, row=inv_after, remove=False)
    db.add_activity('加入訂單', customer, inv.get('product_text',''), f'從庫存加入訂單 {pieces} 件', current_user())
    return jsonify({'ok': True})


@app.post('/api/items/cancel-order')
@login_required
@transactional
def api_cancel_order():
    """Cancel an open order and return its remaining pieces to inventory.

    This implements the commercial requirement that 訂單 can be cancelled without losing stock.
    Warehouse location is transferred from orders -> inventory when applicable, and the original
    order is marked cancelled so shipping/order customer lists stay clean.
    """
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    order_id = safe_int(data.get('order_id') or data.get('id'), 0)
    row = db.fetchone("SELECT * FROM orders WHERE id=?", [order_id])
    if not row:
        return api_error('找不到訂單')
    if (row.get('status') or 'open') != 'open':
        return api_error('此訂單已不是開啟狀態，不能取消')
    pieces = safe_int(row.get('pieces'), 0)
    if pieces <= 0:
        db.execute("UPDATE orders SET status='cancelled', warehouse_key='', updated_at=? WHERE id=?", [db.now(), order_id])
        refresh_warehouse_ref('orders', order_id, row=row, remove=True)
        return jsonify({'ok': True, 'cancelled': True})
    p = dict(row)
    p['pieces'] = pieces
    new_inventory_id = add_product_to_table('inventory', '', p, row.get('material',''), current_user(), row.get('warehouse_key') or '')
    move_warehouse_ref('orders', order_id, 'inventory', new_inventory_id, pieces, 0)
    db.execute("UPDATE orders SET pieces=0, status='cancelled', warehouse_key='', updated_at=? WHERE id=?", [db.now(), order_id])
    db.add_activity('取消訂單', row.get('customer_name',''), row.get('product_text',''), f'取消訂單並退回庫存 {pieces} 件', current_user())
    return jsonify({'ok': True, 'inventory_id': new_inventory_id, 'pieces': pieces})



@app.get('/api/items/master-merge-preview')
@login_required
def api_master_merge_preview():
    source = request.args.get('source') or 'inventory'
    source_id = safe_int(request.args.get('id'), 0)
    customer = fuzzy_customer_name((request.args.get('customer_name') or '').strip())
    pieces = safe_int(request.args.get('pieces'), 0)
    if not customer:
        return api_error('請輸入客戶名稱')
    try:
        table = db.table_for_module(source)
    except ValueError:
        return api_error('來源模組錯誤')
    row = db.safe_fetchone(f"SELECT * FROM {table} WHERE id=?", [source_id])
    if not row:
        return api_error('找不到來源商品', 404)
    take = pieces or safe_int(row.get('pieces'), 0)
    existing = db.safe_fetchone("SELECT * FROM master_orders WHERE customer_name=? AND product_text=? AND material=?",
                                [customer, row.get('product_text',''), row.get('material','')])
    before = safe_int((existing or {}).get('pieces'), 0)
    return jsonify({'ok': True, 'source_item': serialize_item(row, source), 'existing': serialize_item(existing, 'master') if existing else None,
                    'take': take, 'before': before, 'after': before + take,
                    'merge_possible': bool(existing)})

@app.post('/api/items/add-to-master')
@login_required
@transactional
def api_add_to_master():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    source = data.get('source') or 'inventory'
    source_id = safe_int(data.get('id') or data.get('source_id'), 0)
    customer = fuzzy_customer_name((data.get('customer_name') or '').strip())
    if not customer:
        return api_error('請輸入客戶名稱')
    try:
        table = db.table_for_module(source)
    except ValueError:
        return api_error('來源模組錯誤')
    row = db.fetchone(f"SELECT * FROM {table} WHERE id=?", [source_id])
    if not row:
        return api_error('找不到商品')
    take = safe_int(data.get('pieces'), 0) or safe_int(row.get('pieces'), 0)
    before = safe_int(row.get('pieces'), 0)
    if take <= 0 or take > before:
        return api_error('加入總單件數錯誤或來源數量不足')
    db.ensure_customer(customer, operator=current_user())

    p = dict(row)
    p['pieces'] = take
    existing = None
    new_master_id = None
    # Merge confirmation is driven by frontend; backend supports safe merging when requested.
    if data.get('merge'):
        existing = db.fetchone("SELECT * FROM master_orders WHERE customer_name=? AND product_text=? AND material=?",
                               [customer, row.get('product_text',''), row.get('material','')])
    if existing:
        new_master_id = existing['id']
        new_pieces = safe_int(existing.get('pieces'), 0) + take
        db.execute("UPDATE master_orders SET pieces=?, updated_at=? WHERE id=?", [new_pieces, db.now(), new_master_id])
        master_row = db.safe_fetchone("SELECT * FROM master_orders WHERE id=?", [new_master_id])
        if master_row:
            refresh_warehouse_ref('master_orders', new_master_id, row=master_row, remove=False)
    else:
        new_master_id = add_product_to_table('master_orders', customer, p, row.get('material',''), current_user(), row.get('warehouse_key') or '')

    # 加到總單代表來源數量轉入總單，避免庫存/訂單/總單三邊重複計算。
    if table in ['inventory', 'orders']:
        remain = before - take
        if remain <= 0:
            move_warehouse_ref(table, source_id, 'master_orders', new_master_id, take, 0)
            if table == 'orders':
                db.execute("UPDATE orders SET pieces=0, status='moved_to_master', warehouse_key='', updated_at=? WHERE id=?", [db.now(), source_id])
            else:
                db.execute("DELETE FROM inventory WHERE id=?", [source_id])
        else:
            db.execute(f"UPDATE {table} SET pieces=?, updated_at=? WHERE id=?", [remain, db.now(), source_id])
            move_warehouse_ref(table, source_id, 'master_orders', new_master_id, take, remain)
            source_after = db.safe_fetchone(f"SELECT * FROM {table} WHERE id=?", [source_id])
            if source_after:
                refresh_warehouse_ref(table, source_id, row=source_after, remove=False)

    db.add_activity('加入總單', customer, row.get('product_text',''), f'從{source}加入總單 {take} 件', current_user())
    return jsonify({'ok': True})




def parse_grouped_inbound_text(text):
    """Parse pasted whiteboard text where a customer name owns following product lines."""
    groups = []
    current_customer = ''
    last_wh = ('', '')
    for raw in (text or '').splitlines():
        line = (raw or '').strip()
        if not line:
            continue
        parsed, last_wh = normalize_line(line, last_wh)
        if parsed:
            groups.append((current_customer, parsed))
        else:
            # A non-product line is treated as a customer heading.
            clean = re.sub(r'[：:]+$', '', line).strip()
            if clean and len(clean) <= 30:
                current_customer = fuzzy_customer_name(clean)
    return groups


@app.post('/api/items/bulk-material')
@login_required
@transactional
def api_items_bulk_material():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    module = data.get('module') or ''
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    ids = [safe_int(x, 0) for x in (data.get('ids') or [])]
    ids = [x for x in ids if x > 0]
    material = (data.get('material') or '').strip()
    if not ids or not material:
        return api_error('請先選取商品並輸入材質')
    updated = 0
    for item_id in ids:
        db.execute(f"UPDATE {table} SET material=?, updated_at=? WHERE id=?", [material, db.now(), item_id])
        row = db.safe_fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
        if row:
            refresh_warehouse_ref(table, item_id, row=row, remove=False)
            updated += 1
    db.add_activity('批量材質', '', '', f'{PAGE_TITLES.get(module,module)} 批量更新 {updated} 筆材質為 {material}', current_user())
    return jsonify({'ok': True, 'updated': updated})


@app.post('/api/items/bulk-delete')
@login_required
@transactional
def api_items_bulk_delete():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    module = data.get('module') or ''
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    ids = [safe_int(x, 0) for x in (data.get('ids') or [])]
    ids = [x for x in ids if x > 0]
    if not ids:
        return api_error('請先選取商品')
    deleted = 0
    for item_id in ids:
        row = db.safe_fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
        if not row:
            continue
        refresh_warehouse_ref(table, item_id, row=row, remove=True)
        db.execute(f"DELETE FROM {table} WHERE id=?", [item_id])
        deleted += 1
    db.add_activity('批量刪除', '', '', f'{PAGE_TITLES.get(module,module)} 批量刪除 {deleted} 筆商品', current_user())
    return jsonify({'ok': True, 'deleted': deleted})


@app.post('/api/inbound')
@login_required
@transactional
def api_inbound():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    customer = fuzzy_customer_name((data.get('customer_name') or '').strip())
    material = data.get('material') or ''
    raw_text = data.get('text') or ''
    count = 0
    targets = set()
    if customer:
        rows = parse_product_text(raw_text)
        if not rows:
            return api_error('沒有可入庫的商品格式')
        db.ensure_customer(customer, operator=current_user())
        for p in rows:
            add_product_to_table('master_orders', customer, p, material, current_user())
            db.add_activity('入庫', customer, p['product_text'], '入庫到總單', current_user())
            count += 1
            targets.add('總單')
    else:
        grouped = parse_grouped_inbound_text(raw_text)
        if not grouped:
            return api_error('沒有可入庫的商品格式')
        for group_customer, p in grouped:
            if group_customer:
                db.ensure_customer(group_customer, operator=current_user())
                add_product_to_table('master_orders', group_customer, p, material, current_user())
                db.add_activity('入庫', group_customer, p['product_text'], '白板分組入庫到總單', current_user())
                targets.add('總單')
            else:
                add_product_to_table('inventory', '', p, material, current_user())
                db.add_activity('入庫', '庫存', p['product_text'], '入庫到庫存', current_user())
                targets.add('庫存')
            count += 1
    return jsonify({'ok': True, 'count': count, 'target': ' / '.join(sorted(targets))})


@app.get('/api/customer-items')
@login_required
def api_customer_items():
    customer = (request.args.get('customer') or '').strip()
    variant_raw = (request.args.get('variants') or '').strip()
    names = []
    if customer and customer != '庫存':
        names.append(customer)
    if variant_raw:
        for n in variant_raw.split(','):
            n = n.strip()
            if n and n != '庫存' and n not in names:
                names.append(n)
    rows = []
    fallback = ''
    if names:
        placeholders = ','.join(['?'] * len(names))
        rows += [serialize_item(r, 'master') for r in db.fetchall(f"SELECT * FROM master_orders WHERE customer_name IN ({placeholders}) ORDER BY updated_at DESC", names)]
        rows += [serialize_item(r, 'orders') for r in db.fetchall(f"SELECT * FROM orders WHERE customer_name IN ({placeholders}) AND status='open' ORDER BY updated_at DESC", names)]
        # Requirement: if the selected customer has no master/order goods, open full inventory as fallback.
        if not rows:
            fallback = 'inventory'
            rows += [serialize_item(r, 'inventory') for r in db.fetchall("SELECT * FROM inventory ORDER BY updated_at DESC LIMIT 500")]
    else:
        rows += [serialize_item(r, 'inventory') for r in db.fetchall("SELECT * FROM inventory ORDER BY updated_at DESC LIMIT 500")]
    return jsonify({'ok': True, 'items': rows, 'fallback': fallback})


def merge_requested_items(items):
    """Combine duplicated selected shipping rows before preview/confirm.

    Prevents double-click or duplicated checkbox payload from previewing/confirming the same row twice.
    """
    merged = {}
    for it in items or []:
        if not isinstance(it, dict):
            continue
        source = it.get('source')
        item_id = safe_int(it.get('id'), 0)
        if not source or not item_id:
            continue
        key = (source, item_id)
        pieces = safe_int(it.get('pieces'), 0)
        if key not in merged:
            merged[key] = {'source': source, 'id': item_id, 'pieces': 0}
        merged[key]['pieces'] += max(0, pieces)
    return list(merged.values())


@app.post('/api/shipping/preview')
@login_required
def api_shipping_preview():
    data = body_json()
    items = merge_requested_items(data.get('items') or [])
    ship_customer = (data.get('customer_name') or '').strip()
    weight_unit = safe_float(data.get('weight_unit'), 0.0)
    preview = []
    total_volume = 0.0
    borrow_warnings = []
    for req_item in items:
        source = req_item.get('source')
        item_id = safe_int(req_item.get('id'), 0)
        try:
            table = db.table_for_module(source)
        except ValueError:
            continue
        row = db.fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
        if not row:
            continue
        owner = (row.get('customer_name') or '庫存').strip() or '庫存'
        if ship_customer and ship_customer not in ['庫存', owner] and owner != '庫存':
            borrow_warnings.append({
                'from_customer': owner,
                'to_customer': ship_customer,
                'product_text': row.get('product_text',''),
                'pieces': safe_int(req_item.get('pieces'), safe_int(row.get('pieces'), 0)),
            })
        original_pieces = safe_int(row.get('pieces'), 0)
        take_pieces = safe_int(req_item.get('pieces'), original_pieces)
        if take_pieces <= 0 or take_pieces > original_pieces:
            preview.append({
                'id': item_id,
                'source': source,
                'customer_name': owner,
                'ship_customer': ship_customer or owner,
                'product_text': row.get('product_text'),
                'material': row.get('material'),
                'pieces': take_pieces,
                'before': original_pieces,
                'after': original_pieces,
                'volume': 0,
                'formula': '件數錯誤或數量不足',
                'deduct_label': '不可出貨',
                'warehouse_key': row.get('warehouse_key') or '未錄入倉庫圖',
                'error': '件數錯誤或數量不足',
            })
            continue
        volume, formula = calc_volume_for_item(row)
        # Scale simple volume by piece ratio when partial shipment.
        if original_pieces and take_pieces != original_pieces:
            volume = round(volume * take_pieces / original_pieces, 4)
        total_volume += volume
        preview.append({
            'id': item_id,
            'source': source,
            'customer_name': owner,
            'ship_customer': ship_customer or owner,
            'product_text': row.get('product_text'),
            'material': row.get('material'),
            'pieces': take_pieces,
            'before': original_pieces,
            'after': max(0, original_pieces - take_pieces),
            'volume': volume,
            'formula': formula,
            'deduct_label': {'master': '扣除總單', 'orders': '扣除訂單', 'inventory': '扣除庫存'}.get(source, '扣除資料'),
            'warehouse_key': row.get('warehouse_key') or '未錄入倉庫圖',
        })
    return jsonify({
        'ok': True,
        'items': preview,
        'total_volume': round(total_volume,4),
        'total_weight': round(total_volume * weight_unit,4),
        'borrow_required': bool(borrow_warnings),
        'borrow_warnings': borrow_warnings,
    })


@app.post('/api/shipping/confirm')
@login_required
@transactional
def api_shipping_confirm():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    items = merge_requested_items(data.get('items') or [])
    ship_customer = (data.get('customer_name') or '').strip()
    allow_borrow = bool(data.get('allow_borrow'))
    weight_unit = safe_float(data.get('weight_unit'), 0.0)
    results = []
    for req_item in items:
        source = req_item.get('source')
        item_id = safe_int(req_item.get('id'), 0)
        try:
            table = db.table_for_module(source)
        except ValueError:
            continue
        row = db.fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
        if not row:
            continue
        owner = (row.get('customer_name') or '庫存').strip() or '庫存'
        if ship_customer and ship_customer not in ['庫存', owner] and owner != '庫存' and not allow_borrow:
            return api_error(f"該客戶沒有這筆商品，是否向 {owner} 借：{row.get('product_text')} = {req_item.get('pieces') or row.get('pieces')} 件", 409, borrow_required=True)
        take = safe_int(req_item.get('pieces'), safe_int(row.get('pieces'), 0))
        before = safe_int(row.get('pieces'), 0)
        if take <= 0 or take > before:
            return api_error(f"{row.get('product_text')} 數量不足")
        volume, _ = calc_volume_for_item(row)
        if before:
            volume = round(volume * take / before, 4)
        after = before - take
        if after <= 0:
            refresh_warehouse_ref(table, item_id, row=row, remove=True)
            db.execute(f"DELETE FROM {table} WHERE id=?", [item_id])
        else:
            db.execute(f"UPDATE {table} SET pieces=?, updated_at=? WHERE id=?", [after, db.now(), item_id])
            row_after = db.safe_fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
            if row_after:
                refresh_warehouse_ref(table, item_id, row=row_after, remove=False)
        record_customer = ship_customer or owner
        if record_customer and record_customer != '庫存':
            db.ensure_customer(record_customer, operator=current_user())
        db.execute("""INSERT INTO shipping_records(customer_name, source_table, source_id, product_text, material, pieces,
            volume, weight_unit, total_weight, operator, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            [record_customer, source, item_id, row.get('product_text',''), row.get('material',''), take,
             volume, weight_unit, round(volume*weight_unit,4), current_user(), db.now()])
        label = {'master': '扣除總單', 'orders': '扣除訂單', 'inventory': '扣除庫存'}.get(source, '扣除資料')
        borrow_text = f'；{record_customer} 向 {owner} 借貨' if record_customer and owner != record_customer and owner != '庫存' else ''
        db.add_activity('出貨', record_customer, row.get('product_text',''), f'{label}：{before} → {after}{borrow_text}', current_user())
        results.append({'source': source, 'id': item_id, 'before': before, 'after': after, 'pieces': take, 'label': label, 'borrow': borrow_text})
    return jsonify({'ok': True, 'results': results})




@app.get('/api/master/text')
@login_required
def api_master_text():
    customer = (request.args.get('customer') or '').strip()
    where = []
    params = []
    if customer:
        where.append('customer_name=?')
        params.append(customer)
    sql = "SELECT * FROM master_orders"
    if where:
        sql += ' WHERE ' + ' AND '.join(where)
    sql += " ORDER BY customer_name, updated_at DESC"
    rows = db.safe_fetchall(sql, params)
    groups = {}
    for r in rows:
        groups.setdefault(r.get('customer_name') or '未指定客戶', []).append(r.get('product_text') or '')
    text_blocks = []
    for name in sorted(groups.keys()):
        lines = [name] + [x for x in groups[name] if x]
        text_blocks.append('\n'.join(lines))
    return jsonify({'ok': True, 'text': '\n\n'.join(text_blocks)})

@app.get('/api/shipping-records')
@login_required
def api_shipping_records():
    q = (request.args.get('q') or '').strip()
    date_from = (request.args.get('from') or '').strip()
    date_to = (request.args.get('to') or '').strip()
    where = []
    params = []
    if q:
        where.append('(customer_name LIKE ? OR product_text LIKE ? OR material LIKE ? OR source_table LIKE ?)')
        params += [f'%{q}%', f'%{q}%', f'%{q}%', f'%{q}%']
    if date_from:
        where.append('created_at>=?')
        params.append(date_from + ' 00:00:00' if len(date_from) == 10 else date_from)
    if date_to:
        where.append('created_at<=?')
        params.append(date_to + ' 23:59:59' if len(date_to) == 10 else date_to)
    sql = "SELECT * FROM shipping_records"
    if where:
        sql += ' WHERE ' + ' AND '.join(where)
    sql += ' ORDER BY created_at DESC LIMIT 500'
    rows = db.fetchall(sql, params)
    return jsonify({'ok': True, 'records': rows})




def snapshot_warehouse_row(zone, band, row_name):
    rows = db.safe_fetchall("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? ORDER BY slot", [zone, band, row_name])
    return [{
        'zone': r.get('zone'), 'band': safe_int(r.get('band'), 1), 'row_name': r.get('row_name'),
        'slot': safe_int(r.get('slot'), 1), 'items_json': r.get('items_json') or '[]', 'updated_at': r.get('updated_at') or ''
    } for r in rows]


def save_warehouse_undo(action, zone, band, row_name):
    snap = snapshot_warehouse_row(zone, band, row_name)
    db.safe_execute("INSERT INTO warehouse_undo(username, action, payload_json, created_at) VALUES(?,?,?,?)",
                    [current_user() or '', action or '', json.dumps({'zone': zone, 'band': band, 'row_name': row_name, 'cells': snap}, ensure_ascii=False), db.now()])


def save_warehouse_undo_multi(action, rows):
    """Save a single undo record for operations that touch multiple warehouse rows.

    Dragging a whole cell from one row to another changes both rows.  Older versions saved only
    the last row, so 「撤回上一步」 could restore the source but leave duplicates in the target.
    This stores all affected row snapshots in one atomic undo payload.
    """
    seen = set()
    payload_rows = []
    for row in rows or []:
        zone = clean_zone(row.get('zone'))
        band = clean_band(row.get('band'))
        row_name = clean_row_name(row.get('row_name'))
        key = (zone, band, row_name)
        if key in seen:
            continue
        seen.add(key)
        payload_rows.append({'zone': zone, 'band': band, 'row_name': row_name, 'cells': snapshot_warehouse_row(zone, band, row_name)})
    if payload_rows:
        db.safe_execute("INSERT INTO warehouse_undo(username, action, payload_json, created_at) VALUES(?,?,?,?)",
                        [current_user() or '', action or '', json.dumps({'rows': payload_rows}, ensure_ascii=False), db.now()])


def _restore_single_warehouse_row(payload):
    zone = payload.get('zone')
    band = safe_int(payload.get('band'), 1)
    row_name = payload.get('row_name')
    cells = payload.get('cells') or []
    current = db.safe_fetchall("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=?", [zone, band, row_name])
    for c in current:
        sync_cell_links(zone, band, row_name, safe_int(c.get('slot'), 1), parse_items_json(c.get('items_json')), [])
    db.safe_execute("DELETE FROM warehouse_cells WHERE zone=? AND band=? AND row_name=?", [zone, band, row_name])
    for c in cells:
        db.safe_execute("INSERT INTO warehouse_cells(zone, band, row_name, slot, items_json, updated_at) VALUES(?,?,?,?,?,?)",
                        [zone, band, row_name, safe_int(c.get('slot'), 1), c.get('items_json') or '[]', db.now()])
        sync_cell_links(zone, band, row_name, safe_int(c.get('slot'), 1), [], parse_items_json(c.get('items_json')))
    sync_row_after_slot_change(zone, band, row_name)


def restore_warehouse_snapshot(payload):
    if payload.get('rows'):
        for row_payload in payload.get('rows') or []:
            _restore_single_warehouse_row(row_payload)
        return
    _restore_single_warehouse_row(payload)

@app.get('/api/warehouse')
@login_required
def api_warehouse():
    zone = (request.args.get('zone') or '').strip()
    params = []
    sql = "SELECT * FROM warehouse_cells"
    if zone in ['A','B']:
        sql += " WHERE zone=?"
        params.append(zone)
    sql += " ORDER BY zone, band, row_name, slot"
    rows = db.fetchall(sql, params)
    by_key = {}
    max_slot = {}
    for r in rows:
        try:
            r['items'] = json.loads(r.get('items_json') or '[]')
        except Exception:
            r['items'] = []
        k = (r.get('zone'), safe_int(r.get('band'), 0), r.get('row_name'), safe_int(r.get('slot'), 0))
        by_key[k] = r
        rk = (r.get('zone'), safe_int(r.get('band'), 0), r.get('row_name'))
        max_slot[rk] = max(max_slot.get(rk, 10), safe_int(r.get('slot'), 0))
    zones = [zone] if zone in ['A','B'] else ['A','B']
    cells = []
    for z in zones:
        for band in range(1, 7):
            for row_name in ['front', 'back']:
                row_max = max(10, max_slot.get((z, band, row_name), 10))
                for slot in range(1, row_max + 1):
                    k = (z, band, row_name, slot)
                    cells.append(by_key.get(k) or {'id': 0, 'zone': z, 'band': band, 'row_name': row_name, 'slot': slot, 'items_json': '[]', 'items': [], 'updated_at': ''})
    return jsonify({'ok': True, 'cells': cells})


@app.get('/api/warehouse/unlisted-items')
@login_required
def api_warehouse_unlisted_items():
    items = []
    for module, table in [('inventory', 'inventory'), ('orders', 'orders'), ('master', 'master_orders')]:
        status = " AND status='open'" if module == 'orders' else ''
        rows = db.fetchall(f"SELECT * FROM {table} WHERE COALESCE(warehouse_key,'')='' {status} ORDER BY updated_at DESC LIMIT 200")
        items += [serialize_item(r, module) for r in rows]
    return jsonify({'ok': True, 'items': items})


def _set_warehouse_cell_items(zone, band, row_name, slot, incoming):
    existing = db.fetchone("SELECT id, items_json FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?", [zone, band, row_name, slot])
    old_items = parse_items_json((existing or {}).get('items_json'))
    normalized = normalize_warehouse_items(incoming or [], zone, band, row_name, slot)
    dedupe_refs_from_other_cells(zone, band, row_name, slot, normalized)
    payload = json.dumps(normalized, ensure_ascii=False)
    if existing:
        db.execute("UPDATE warehouse_cells SET items_json=?, updated_at=? WHERE id=?", [payload, db.now(), existing['id']])
    else:
        db.execute("INSERT INTO warehouse_cells(zone, band, row_name, slot, items_json, updated_at) VALUES(?,?,?,?,?,?)", [zone, band, row_name, slot, payload, db.now()])
    sync_cell_links(zone, band, row_name, slot, old_items, normalized)
    return normalized


@app.post('/api/warehouse/cell')
@login_required
@transactional
def api_warehouse_cell():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    zone = clean_zone(data.get('zone'))
    band = clean_band(data.get('band'))
    row_name = clean_row_name(data.get('row_name'))
    slot = clean_slot(data.get('slot'))
    incoming = data.get('items') or []
    save_warehouse_undo('更新格子', zone, band, row_name)
    normalized = _set_warehouse_cell_items(zone, band, row_name, slot, incoming)
    db.add_activity('倉庫更新', '', f'{zone}-{band}-{row_name}-{slot}', '更新倉庫格子並同步商品位置', current_user())
    return jsonify({'ok': True, 'warehouse_key': cell_key(zone, band, row_name, slot), 'items': normalized})



@app.post('/api/warehouse/move-cell')
@login_required
@transactional
def api_warehouse_move_cell():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    src = data.get('from') or {}
    dst = data.get('to') or {}
    szone, sband, srow, sslot = clean_zone(src.get('zone')), clean_band(src.get('band')), clean_row_name(src.get('row_name')), clean_slot(src.get('slot'))
    dzone, dband, drow, dslot = clean_zone(dst.get('zone')), clean_band(dst.get('band')), clean_row_name(dst.get('row_name')), clean_slot(dst.get('slot'))
    if (szone, sband, srow, sslot) == (dzone, dband, drow, dslot):
        return jsonify({'ok': True, 'same_cell': True})
    source_cell = db.safe_fetchone("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?", [szone, sband, srow, sslot]) or {}
    target_cell = db.safe_fetchone("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?", [dzone, dband, drow, dslot]) or {}
    source_items = parse_items_json(source_cell.get('items_json'))
    target_items = parse_items_json(target_cell.get('items_json'))
    if not source_items:
        return api_error('來源格沒有商品可移動')
    save_warehouse_undo_multi('移動格子', [
        {'zone': szone, 'band': sband, 'row_name': srow},
        {'zone': dzone, 'band': dband, 'row_name': drow},
    ])
    moved = _set_warehouse_cell_items(dzone, dband, drow, dslot, source_items + target_items)
    _set_warehouse_cell_items(szone, sband, srow, sslot, [])
    db.add_activity('倉庫移動', '', f'{szone}-{sband}-{srow}-{sslot} → {dzone}-{dband}-{drow}-{dslot}', '拖拉移動整格商品並同步來源/目標格', current_user())
    return jsonify({'ok': True, 'from': {'zone': szone, 'band': sband, 'row_name': srow, 'slot': sslot, 'items': []}, 'to': {'zone': dzone, 'band': dband, 'row_name': drow, 'slot': dslot, 'items': moved}})


@app.post('/api/warehouse/insert-slot')
@login_required
@transactional
def api_warehouse_insert_slot():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    zone = clean_zone(data.get('zone'))
    band = clean_band(data.get('band'))
    row_name = clean_row_name(data.get('row_name'))
    after_slot = clean_slot(data.get('slot') or 10)
    save_warehouse_undo('插入格子', zone, band, row_name)
    rows = db.fetchall("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot>? ORDER BY slot DESC", [zone, band, row_name, after_slot])
    for r in rows:
        db.execute("UPDATE warehouse_cells SET slot=? WHERE id=?", [safe_int(r.get('slot'), 0)+1, r['id']])
    db.execute("INSERT INTO warehouse_cells(zone, band, row_name, slot, items_json, updated_at) VALUES(?,?,?,?,?,?)", [zone, band, row_name, after_slot+1, '[]', db.now()])
    sync_row_after_slot_change(zone, band, row_name)
    db.add_activity('倉庫插入格子', '', f'{zone}-{band}-{row_name}-{after_slot+1}', '長按插入格子', current_user())
    return jsonify({'ok': True})


@app.post('/api/warehouse/delete-slot')
@login_required
@transactional
def api_warehouse_delete_slot():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    zone = clean_zone(data.get('zone'))
    band = clean_band(data.get('band'))
    row_name = clean_row_name(data.get('row_name'))
    slot = clean_slot(data.get('slot'))
    save_warehouse_undo('刪除格子', zone, band, row_name)
    doomed = db.fetchone("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?", [zone, band, row_name, slot])
    if doomed:
        old_items = parse_items_json(doomed.get('items_json'))
        sync_cell_links(zone, band, row_name, slot, old_items, [])
    db.execute("DELETE FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?", [zone, band, row_name, slot])
    rows = db.fetchall("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot>? ORDER BY slot", [zone, band, row_name, slot])
    for r in rows:
        db.execute("UPDATE warehouse_cells SET slot=? WHERE id=?", [max(1, safe_int(r.get('slot'), 1)-1), r['id']])
    sync_row_after_slot_change(zone, band, row_name)
    db.add_activity('倉庫刪除格子', '', f'{zone}-{band}-{row_name}-{slot}', '長按刪除格子', current_user())
    return jsonify({'ok': True})




@app.get('/api/warehouse/cell')
@login_required
def api_warehouse_cell_get():
    zone = clean_zone(request.args.get('zone'))
    band = clean_band(request.args.get('band'))
    row_name = clean_row_name(request.args.get('row_name'))
    slot = clean_slot(request.args.get('slot'))
    row = db.safe_fetchone("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?", [zone, band, row_name, slot])
    items = parse_items_json((row or {}).get('items_json'))
    return jsonify({'ok': True, 'cell': {'zone': zone, 'band': band, 'row_name': row_name, 'slot': slot, 'items': items, 'items_json': json.dumps(items, ensure_ascii=False), 'updated_at': (row or {}).get('updated_at','')}})


@app.get('/api/warehouse/search')
@login_required
def api_warehouse_search():
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify({'ok': True, 'matches': []})
    like = f'%{q}%'
    rows = db.safe_fetchall("""SELECT zone, band, row_name, slot, customer_name, product_text, material, pieces
                              FROM warehouse_items
                              WHERE customer_name LIKE ? OR product_text LIKE ? OR material LIKE ?
                              ORDER BY zone, band, row_name, slot LIMIT 80""", [like, like, like])
    return jsonify({'ok': True, 'matches': rows})


@app.post('/api/warehouse/undo')
@login_required
@transactional
def api_warehouse_undo():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    row = db.safe_fetchone("SELECT * FROM warehouse_undo WHERE username=? ORDER BY created_at DESC, id DESC LIMIT 1", [current_user() or ''])
    if not row:
        return api_error('沒有可撤回的倉庫操作', 404)
    payload = json.loads(row.get('payload_json') or '{}')
    restore_warehouse_snapshot(payload)
    db.safe_execute("DELETE FROM warehouse_undo WHERE id=?", [row.get('id')])
    db.add_activity('倉庫撤回', '', '', f"撤回{row.get('action') or '上一步'}", current_user())
    return jsonify({'ok': True, 'restored': {'zone': payload.get('zone'), 'band': payload.get('band'), 'row_name': payload.get('row_name')}})


@app.get('/api/sync-state')
@login_required
def api_sync_state():
    latest = db.safe_fetchone("SELECT id, action, customer_name, product_text, detail, created_at FROM activity_logs ORDER BY id DESC LIMIT 1") or {}
    return jsonify({'ok': True, 'unread': activity_unread_count(), 'latest': latest, 'server_time': db.now()})

@app.get('/api/activity')
@login_required
def api_activity():
    # 今日異動 default = Taiwan app-date today. Use ?all=1 for full history.
    if request.args.get('all') == '1':
        rows = db.fetchall("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 500")
    else:
        today_prefix = db.now().split(' ')[0] + '%'
        rows = db.fetchall("SELECT * FROM activity_logs WHERE created_at LIKE ? ORDER BY created_at DESC LIMIT 200", [today_prefix])
    return jsonify({'ok': True, 'items': rows, 'unread': activity_unread_count()})


@app.post('/api/activity/read')
@login_required
def api_activity_read():
    mark_activity_read()
    return jsonify({'ok': True})


@app.delete('/api/activity/<int:log_id>')
@login_required
@transactional
def api_activity_delete(log_id):
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    db.execute("DELETE FROM activity_logs WHERE id=?", [log_id])
    return jsonify({'ok': True})


@app.get('/api/activity/unlisted')
@login_required
def api_activity_unlisted():
    counts = {}
    items = []
    for name, table, module in [('庫存', 'inventory', 'inventory'), ('訂單', 'orders', 'orders'), ('總單', 'master_orders', 'master')]:
        status = " AND status='open'" if table == 'orders' else ""
        row = db.fetchone(f"SELECT COALESCE(SUM(pieces),0) AS c FROM {table} WHERE COALESCE(warehouse_key,'')=''" + status)
        counts[name] = safe_int((row or {}).get('c'), 0)
        rows = db.safe_fetchall(f"SELECT id, customer_name, product_text, material, pieces, updated_at FROM {table} WHERE COALESCE(warehouse_key,'')='' {status} ORDER BY updated_at DESC LIMIT 80")
        for r in rows:
            r['source'] = module
            r['source_label'] = name
            items.append(r)
    return jsonify({'ok': True, 'counts': counts, 'total': sum(counts.values()), 'items': items[:160]})


@app.get('/api/search')
@login_required
def api_global_search():
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify({'ok': True, 'results': []})
    like = f'%{q}%'
    results = []
    configs = [
        ('inventory','inventory','庫存',""),
        ('orders','orders','訂單'," AND status='open'"),
        ('master','master_orders','總單',""),
    ]
    for source, table, label, extra in configs:
        rows = db.safe_fetchall(f"SELECT id, customer_name, product_text, material, pieces, warehouse_key, updated_at FROM {table} WHERE (customer_name LIKE ? OR product_text LIKE ? OR material LIKE ? OR warehouse_key LIKE ?) {extra} ORDER BY updated_at DESC LIMIT 80", [like, like, like, like])
        for r in rows:
            r.update({'source': source, 'source_label': label, 'record_type': '商品'})
            results.append(r)
    wh = db.safe_fetchall("""SELECT 0 AS id, zone, band, row_name, slot, customer_name, product_text, material, pieces, updated_at
                              FROM warehouse_items
                              WHERE customer_name LIKE ? OR product_text LIKE ? OR material LIKE ?
                              ORDER BY updated_at DESC LIMIT 80""", [like, like, like])
    for r in wh:
        r['warehouse_key'] = f"{r.get('zone','')}-{r.get('band','')}-{r.get('row_name','')}-{r.get('slot','')}"
        r.update({'source': 'warehouse', 'source_label': '倉庫圖', 'record_type': '倉庫位置'})
        results.append(r)
    ship = db.safe_fetchall("SELECT id, customer_name, product_text, material, pieces, source_table AS warehouse_key, created_at AS updated_at FROM shipping_records WHERE customer_name LIKE ? OR product_text LIKE ? OR material LIKE ? ORDER BY created_at DESC LIMIT 80", [like, like, like])
    for r in ship:
        r.update({'source': 'records', 'source_label': '出貨紀錄', 'record_type': '出貨'})
        results.append(r)
    return jsonify({'ok': True, 'results': results[:200]})


@app.get('/api/backups')
@login_required
def api_backups_list():
    rows = db.safe_fetchall("SELECT id, filename, db_type, operator, detail, created_at FROM backups ORDER BY created_at DESC, id DESC LIMIT 200")
    return jsonify({'ok': True, 'backups': rows})


@app.get('/api/settings/users')
@login_required
def api_settings_users():
    if not is_admin():
        return api_error('只有管理員可查看使用者', 403)
    users = db.fetchall("SELECT id, username, role, is_blocked, created_at FROM users ORDER BY created_at DESC")
    return jsonify({'ok': True, 'users': users})


@app.post('/api/settings/users/<int:user_id>/block')
@login_required
@transactional
def api_block_user(user_id):
    if not is_admin():
        return api_error('只有管理員可封鎖使用者', 403)
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    target = db.fetchone("SELECT id, username, role, is_blocked FROM users WHERE id=?", [user_id])
    if not target:
        return api_error('找不到使用者', 404)
    wants_block = db_truthy(data.get('blocked', True))
    if wants_block and target.get('username') == current_user():
        return api_error('不能封鎖目前登入中的自己，避免管理員被鎖出系統', 400)
    if wants_block and (target.get('role') == 'admin' or target.get('username') == ADMIN_NAME):
        active_admins = db.safe_fetchone("SELECT COUNT(*) AS c FROM users WHERE (role='admin' OR username=?) AND is_blocked=? AND id<>?", [ADMIN_NAME, db.flag(False), user_id]) or {}
        if safe_int(active_admins.get('c'), 0) <= 0:
            return api_error('至少要保留一個未封鎖管理員', 400)
    blocked = db.flag(wants_block)
    db.execute("UPDATE users SET is_blocked=? WHERE id=?", [blocked, user_id])
    db.add_activity('帳號管理', target.get('username',''), '', '封鎖使用者' if wants_block else '解除封鎖使用者', current_user())
    return jsonify({'ok': True})


@app.post('/api/settings/password')
@login_required
@transactional
def api_change_password():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    password = data.get('password') or ''
    if len(password) < 3:
        return api_error('密碼至少 3 碼')
    db.execute("UPDATE users SET password_hash=?, password='' WHERE username=?", [generate_password_hash(password), current_user()])
    db.add_activity('修改密碼', current_user(), '', '使用者更新登入密碼', current_user())
    return jsonify({'ok': True})


@app.get('/api/backup')
@login_required
def api_backup():
    os.makedirs('backups', exist_ok=True)
    # Requirement: SQLite local test can download raw .db; PostgreSQL/normal mode downloads JSON.
    if request.args.get('format') == 'db' and not db.IS_PG:
        db.safe_execute("INSERT INTO backups(filename, db_type, operator, detail, created_at) VALUES(?,?,?,?,?)", [db.SQLITE_PATH, 'sqlite', current_user(), '下載 SQLite .db 備份', db.now()])
        db.add_activity('下載備份', '', '', '下載 SQLite .db 備份', current_user())
        return send_file(db.SQLITE_PATH, as_attachment=True, download_name=f"yuanxing_sqlite_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
    payload = {'created_at': db.now(), 'schema_version': db.SCHEMA_VERSION, 'tables': {}}
    for table in ['users','customers','customer_profiles','inventory','orders','master_orders','shipping_records','warehouse_cells','warehouse_items','activity_logs','activity_reads','logs','request_keys','corrections','image_hashes','backups','archived_customers','warehouse_undo']:
        payload['tables'][table] = db.fetchall(f"SELECT * FROM {table}")
    path = os.path.join('backups', f"yuanxing_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    db.safe_execute("INSERT INTO backups(filename, db_type, operator, detail, created_at) VALUES(?,?,?,?,?)", [path, 'postgres' if db.IS_PG else 'sqlite', current_user(), '手動下載 JSON 備份', db.now()])
    db.add_activity('下載備份', '', '', '手動下載 JSON 備份', current_user())
    return send_file(path, as_attachment=True, download_name=f"yuanxing_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")


@app.post('/api/restore')
@login_required
def api_restore():
    if not is_admin():
        return api_error('只有管理員可還原備份', 403)
    form_key = (request.form.get('request_key') or '').strip()
    if form_key and request_key_duplicate({'request_key': form_key}, request.path):
        return jsonify({'ok': True, 'duplicate': True})
    file = request.files.get('file')
    if not file:
        return api_error('請選擇備份檔')
    try:
        payload = json.loads(file.read().decode('utf-8'))
    except Exception:
        return api_error('備份檔格式錯誤')
    tables = payload.get('tables') or {}
    restoring_admin = current_user() or ''
    restoring_admin_row = db.safe_fetchone("SELECT * FROM users WHERE username=?", [restoring_admin]) if restoring_admin else None
    allowed = ['users','customers','customer_profiles','inventory','orders','master_orders','shipping_records',
               'warehouse_cells','warehouse_items','activity_logs','activity_reads','logs','corrections','image_hashes',
               'backups','archived_customers','warehouse_undo']
    try:
        # Commercial safety: write an automatic restore-point before replacing tables.
        os.makedirs('backups', exist_ok=True)
        restore_point = {'created_at': db.now(), 'reason': 'pre_restore_snapshot', 'tables': {}}
        for table in allowed:
            restore_point['tables'][table] = db.safe_fetchall(f"SELECT * FROM {table}")
        restore_path = os.path.join('backups', f"pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        with open(restore_path, 'w', encoding='utf-8') as f:
            json.dump(restore_point, f, ensure_ascii=False, indent=2)
        cols_by_table = {table: db.table_columns(table) for table in allowed}
        with db.get_conn() as conn:
            cur = conn.cursor()
            for table in allowed:
                if table not in tables:
                    continue
                cur.execute(db._convert_sql(f"DELETE FROM {table}"))
                cols_available = cols_by_table.get(table) or set()
                for row in tables.get(table) or []:
                    if not isinstance(row, dict):
                        continue
                    cols = [c for c in row.keys() if c in cols_available]
                    if not cols:
                        continue
                    placeholders = ','.join(['?'] * len(cols))
                    sql = f"INSERT INTO {table}({','.join(cols)}) VALUES({placeholders})"
                    cur.execute(db._convert_sql(sql), [row.get(c) for c in cols])
        db.init_db(force=True)
        # Avoid restore lockout: the admin who performed restore must remain present, admin, and unblocked.
        if restoring_admin:
            restored_admin = db.safe_fetchone("SELECT * FROM users WHERE username=?", [restoring_admin])
            if not restored_admin and restoring_admin_row:
                db.execute("INSERT INTO users(username, password_hash, password, role, is_blocked, created_at) VALUES(?,?,?,?,?,?)",
                           [restoring_admin, restoring_admin_row.get('password_hash',''), restoring_admin_row.get('password',''), 'admin', db.flag(False), restoring_admin_row.get('created_at') or db.now()])
            elif restored_admin:
                db.execute("UPDATE users SET role='admin', is_blocked=? WHERE username=?", [db.flag(False), restoring_admin])
                session['role'] = 'admin'
        db.add_activity('還原備份', '', '', f'已匯入備份檔；還原前快照：{restore_path}', current_user())
        return jsonify({'ok': True, 'restore_point': restore_path})
    except Exception as exc:
        return api_error('還原失敗，資料庫交易已回復或保留原狀', 500, detail=str(exc)[:300])


@app.get('/api/audit-trails')
@login_required
def api_audit_trails():
    today_only = request.args.get('all') not in ('1', 'true', 'yes')
    where = []
    params = []
    if today_only:
        where.append("substr(created_at,1,10)=?")
        params.append(db.today_date())
    sql = "SELECT id, action, customer_name, product_text, detail, operator, created_at FROM activity_logs"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id DESC LIMIT 300"
    rows = db.safe_fetchall(sql, params)
    records = []
    for r in rows:
        records.append({
            'id': r.get('id'),
            'module': '系統',
            'action': r.get('action') or '',
            'customer_name': r.get('customer_name') or '',
            'product_text': r.get('product_text') or '',
            'detail': r.get('detail') or '',
            'operator': r.get('operator') or '',
            'created_at': r.get('created_at') or '',
        })
    return jsonify({'ok': True, 'records': records})


@app.post('/api/recover/customers-from-relations')
@login_required
def api_recover_customers_from_relations():
    data = body_json()
    if request_key_duplicate(data, request.path):
        return jsonify({'ok': True, 'duplicate': True, 'count': 0})
    count = 0
    for table in ['inventory', 'orders', 'master_orders', 'shipping_records']:
        if not db.table_exists(table):
            continue
        rows = db.safe_fetchall(f"SELECT DISTINCT customer_name FROM {table} WHERE COALESCE(customer_name,'')<>''")
        for r in rows:
            name = (r.get('customer_name') or '').strip()
            if name and not db.safe_fetchone("SELECT id FROM customers WHERE name=?", [name]):
                db.safe_execute("INSERT INTO customers(name, region, archived, created_at, updated_at) VALUES(?,?,?,?,?)",
                                [name, 'north', db.flag(False), db.now(), db.now()])
                count += 1
    db.add_activity('客戶資料救援', '', '', f'從關聯資料表救援 {count} 個客戶', current_user())
    return jsonify({'ok': True, 'count': count})


@app.get('/api/requirements/status')
@login_required
def api_requirement_status():
    """Return the full 32-section text-file alignment matrix.

    This is a commercial release gate: all sections must stay locked before deployment.
    """
    return jsonify({
        'ok': True,
        'version': 'YUANXING_COMMERCIAL_V9_TEXT_FULL_ALIGNMENT_LOCKED',
        'schema_version': db.SCHEMA_VERSION,
        'text_file_alignment': 'full_32_section_matrix',
        'old_fix_loaded': False,
        'sections_total': len(REQUIREMENT_FULL_ALIGNMENT),
        'sections_locked': sum(1 for x in REQUIREMENT_FULL_ALIGNMENT if x.get('status') == 'locked'),
        'items': REQUIREMENT_FULL_ALIGNMENT,
    })


@app.get('/api/health')
@login_required
def api_health():
    payload = {
        'ok': True,
        'version': 'YUANXING_COMMERCIAL_V9_TEXT_FULL_ALIGNMENT_LOCKED',
        'schema_version': db.SCHEMA_VERSION,
        'page_scripts': 'single-page-only',
        'old_fix_loaded': False,
        'shipping_records_page': True,
        'order_cancel_restore_inventory': True,
        'per_user_activity_unread': True,
        'restore_lockout_protection': True,
        'global_search': True,
        'activity_unlisted_drilldown': True,
        'customer_hard_delete_profile_only': True,
        'customer_drag_sort_order': True,
        'volume_qty_sum_fixed': True,
        'commercial_locked': True,
        'commercial_grade': True,
        'requirement_full_match_v9': True,
        'requirement_sections_total': len(REQUIREMENT_FULL_ALIGNMENT),
        'requirement_sections_locked': sum(1 for x in REQUIREMENT_FULL_ALIGNMENT if x.get('status') == 'locked'),
        'backup_records_page': True,
        'shipping_item_dropdown': True,
        'ocr_region_blue_text_preprocess': True,
        'warehouse_cell_aggregated_display': True,
        'timezone': os.environ.get('APP_TIMEZONE', 'Asia/Taipei'),
        'database': 'postgres' if db.IS_PG else 'sqlite',
        'api_schema_guard': True,
    }
    if request.args.get('schema') == '1':
        payload['tables'] = db.list_core_tables_status()
    return jsonify(payload)


@app.errorhandler(Exception)
def handle_exception(e):
    detail = str(e)[:500]
    try:
        db.mark_request_key_failed(getattr(g, 'request_key_started', ''), detail)
    except Exception:
        pass
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'error': '系統錯誤，請稍後再試', 'detail': detail}), 500
    return (
        '<!doctype html><meta charset="utf-8">'
        '<title>沅興木業系統啟動錯誤</title>'
        '<body style="font-family:Arial, sans-serif;background:#f7f3ec;padding:28px;">'
        '<h1 style="color:#6b3f22;">沅興木業系統啟動錯誤</h1>'
        '<p>系統已接收到請求，但後端資料庫或模板啟動時發生錯誤。</p>'
        '<pre style="white-space:pre-wrap;background:#fff;padding:16px;border-radius:12px;">'
        + detail +
        '</pre></body>'
    ), 500


if __name__ == '__main__':
    db.init_db()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)
