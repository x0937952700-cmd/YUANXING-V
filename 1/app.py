# V29 button/month/edit/merge lock: backend routes/migrations retained; inventory duplicate_mode added safely.

from flask import Flask, render_template, request, jsonify, session, redirect, url_for, Response, stream_with_context, send_file, send_from_directory
from datetime import timedelta, datetime
from functools import wraps
import os
import io
import time
import hashlib
import json
import re
from PIL import Image
from werkzeug.utils import secure_filename
from openpyxl import Workbook

from db import (
    init_db, get_user, create_user, update_password, log_action,
    save_inventory_item, list_inventory, save_order, save_master_order,
    ship_order, preview_ship_order, get_shipping_records, save_correction, log_error,
    save_image_hash, image_hash_exists, upsert_customer, get_customers,
    get_customer, warehouse_get_cells, warehouse_save_cell, warehouse_move_item, warehouse_add_column,
    warehouse_add_slot, warehouse_remove_slot,
    inventory_summary, warehouse_summary, list_backups, get_orders, get_master_orders,
    list_users, set_user_blocked, get_setting, set_setting, verify_password, row_to_dict, get_db, sql, rows_to_dict, fetchone_dict, now,
    register_submit_request, list_corrections_rows, delete_correction, save_customer_alias, list_customer_aliases, delete_customer_alias,
    record_recent_slot, get_recent_slots, add_audit_trail, list_audit_trails, get_customer_spec_stats, update_customer_item, update_items_material, delete_customer_item,
    create_todo_item, list_todo_items, get_todo_item, delete_todo_item, complete_todo_item, restore_todo_item, reorder_todo_items,
    delete_customer, get_customer_relation_counts, get_customer_by_uid, restore_customer, effective_product_qty, product_display_size, product_support_text, product_sort_tuple, format_product_text_height2, clean_material_value, product_month_tag, recover_customer_profiles_from_relation_tables, customer_merge_variants
)
from ocr import parse_ocr_text, process_native_ocr_text, clean_ocr_noise
from backup import run_daily_backup

app = Flask(__name__)
# FIX52：優先使用 Render 環境變數 SECRET_KEY。
# 若尚未設定，改用 DATABASE_URL 雜湊產生穩定 fallback，避免每次重啟都登出。
_SECRET_KEY = os.getenv("SECRET_KEY") or ("stable-" + hashlib.sha256((os.getenv("DATABASE_URL", "yuanxing-local") + "|yuanxing-fix53").encode("utf-8")).hexdigest())
app.secret_key = _SECRET_KEY
app.permanent_session_lifetime = timedelta(days=30)

UPLOAD_FOLDER = "uploads"
TODO_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'todo')
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "heic", "gif"}
MAX_UPLOAD_SIZE = 16 * 1024 * 1024
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(TODO_UPLOAD_FOLDER, exist_ok=True)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE

def run_startup_self_check():
    checks = {"uploads": False, "todo_uploads": False, "backups": False, "todos": False}
    try:
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        checks["uploads"] = True
        os.makedirs(TODO_UPLOAD_FOLDER, exist_ok=True)
        checks["todo_uploads"] = True
        os.makedirs("backups", exist_ok=True)
        checks["backups"] = True
    except Exception as e:
        try:
            log_error("startup_self_check_dirs", str(e))
        except Exception:
            pass
    try:
        list_todo_items()
        checks["todos"] = True
    except Exception as e:
        try:
            log_error("startup_self_check_todos", str(e))
        except Exception:
            pass
    return checks

# FIX141: Render 防 502 啟動保護。資料庫暫時連線/初始化失敗時不讓 Gunicorn 直接退出。
STARTUP_DB_ERROR = ''
try:
    init_db()
except Exception as e:
    STARTUP_DB_ERROR = str(e)
    print('[FIX141] init_db failed but app kept alive:', STARTUP_DB_ERROR, flush=True)

STARTUP_CHECKS = run_startup_self_check()

PUBLIC_PATHS = {
    "login", "api_login", "health", "static"
}

def current_username():
    return session.get("user", "")


SYNC_SETTINGS_KEY = 'sync_last_event'
LAST_DAILY_BACKUP_KEY = 'last_daily_backup_date'
PENDING_QUEUE_LIMIT = 50

_db_log_action = log_action

def notify_sync_event(kind='refresh', module='all', message='', extra=None):
    payload = {
        'id': str(int(time.time() * 1000)),
        'kind': kind,
        'module': module or 'all',
        'message': message or '',
        'user': current_username(),
        'at': now(),
        'extra': extra or {},
    }
    try:
        set_setting(SYNC_SETTINGS_KEY, json.dumps(payload, ensure_ascii=False))
    except Exception as e:
        try:
            log_error('notify_sync_event', str(e))
        except Exception:
            pass
    return payload


def log_action(username, action):
    _db_log_action(username, action)
    notify_sync_event(kind='log', module='all', message=action, extra={'username': username})


def ensure_daily_backup():
    try:
        today = datetime.now().strftime('%Y-%m-%d')
        if get_setting(LAST_DAILY_BACKUP_KEY, '') == today:
            return
        result = run_daily_backup()
        if result.get('success'):
            set_setting(LAST_DAILY_BACKUP_KEY, today)
    except Exception as e:
        log_error('ensure_daily_backup', str(e))


def request_key_from_payload(data, endpoint=''):
    key = (request.headers.get('X-Request-Key') or (data or {}).get('request_key') or '').strip()
    # 沒有 request_key 時要照常送出；只有「帶了 request_key 且重複」才擋掉。
    if not key:
        return True
    if register_submit_request(key, endpoint=endpoint):
        return key
    return False

def duplicate_success(message='重複送出已忽略', **extra):
    payload = dict(success=True, duplicate=True, message=message)
    payload.update(extra or {})
    return jsonify(**payload)


def duplicate_current_payload(endpoint='', data=None):
    """Return current DB-backed rows when a repeated request_key is ignored.
    This prevents the frontend from keeping temporary rows that disappear after refresh.
    """
    data = data or {}
    customer_name = (data.get('customer_name') or '').strip()
    try:
        if endpoint == '/api/inventory':
            return dict(items=grouped_inventory(), exact_customer_items=yx_v21_exact_customer_rows('inventory', customer_name), snapshots=yx_v22_product_snapshots(), customers=get_customers())
        if endpoint == '/api/orders':
            return dict(items=get_orders(), exact_customer_items=yx_v21_exact_customer_rows('orders', customer_name), snapshots=yx_v22_product_snapshots(), customers=get_customers())
        if endpoint == '/api/master_orders':
            return dict(items=get_master_orders(), exact_customer_items=yx_v21_exact_customer_rows('master_orders', customer_name), snapshots=yx_v22_product_snapshots(), customers=get_customers())
        if endpoint == '/api/ship':
            return dict(snapshots=yx_v22_product_snapshots(), customers=get_customers())
    except Exception as e:
        log_error('duplicate_current_payload', str(e))
    return {}



def resolve_customer_region(customer_name='', requested_region=''):
    # v11：舊客戶保留原本區域；新客戶才用前端傳入的預設北區。
    requested = (requested_region or '').strip()
    if customer_name:
        row = get_customer(customer_name, include_archived=True)
        if row and (row.get('region') or '').strip() in ['北區', '中區', '南區']:
            return (row.get('region') or '').strip()
    if requested in ['北區', '中區', '南區']:
        return requested
    return '北區' if customer_name else ''


def build_customer_payload_snapshot(customer_name=''):
    customer_name = (customer_name or '').strip()
    customer = get_customer(customer_name, include_archived=True) if customer_name else None
    counts = get_customer_relation_counts(customer_name) if customer_name else {}
    return {'customer': customer, 'relation_counts': counts}


def yx_v21_exact_customer_rows(table_name, customer_name=''):
    """Return latest rows after create/update so frontend never keeps tmp rows."""
    customer_name = (customer_name or '').strip()
    if table_name == 'inventory':
        return grouped_inventory()
    if table_name == 'orders':
        rows = get_orders()
    elif table_name == 'master_orders':
        rows = get_master_orders()
    else:
        return []
    if customer_name:
        rows = [r for r in rows if (r.get('customer_name') or '').strip() == customer_name]
    return rows




def yx_v22_product_snapshots():
    """Latest table snapshots for immediate UI refresh after batch operations."""
    try:
        inventory_rows = grouped_inventory()
    except Exception as e:
        log_error('v22_snapshot_inventory', str(e)); inventory_rows = []
    try:
        order_rows = get_orders()
    except Exception as e:
        log_error('v22_snapshot_orders', str(e)); order_rows = []
    try:
        master_rows = get_master_orders()
    except Exception as e:
        log_error('v22_snapshot_master', str(e)); master_rows = []
    try:
        customer_rows = get_customers()
    except Exception as e:
        log_error('v22_snapshot_customers', str(e)); customer_rows = []
    return {
        'inventory': inventory_rows,
        'orders': order_rows,
        'master_order': master_rows,
        'master_orders': master_rows,
        'customers': customer_rows,
    }

def safe_list_todos(fallback_item=None):
    try:
        return list_todo_items()
    except Exception as e:
        log_error('safe_list_todos', str(e))
        return [fallback_item] if fallback_item else []


def export_rows_to_xlsx(sheet_name, rows, columns):
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name[:31] or 'Sheet1'
    ws.append([header for header, _ in columns])
    for row in rows:
        ws.append([row.get(key, '') if isinstance(row, dict) else '' for _, key in columns])
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(40, max(10, max_len + 2))
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf

def require_login():
    return bool(current_username())

def login_required_json(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not require_login():
            return jsonify(success=False, error="請先登入"), 401
        return f(*args, **kwargs)
    return wrapper

@app.after_request
def add_cache_headers(response):
    # V23：HTML / API 永遠 no-store；靜態檔使用版本 query string 長快取。
    # 這樣重新整理會直接向 DB 抓最新資料，但 JS/CSS 不會每頁重下載造成卡頓。
    path = request.path or ''
    response.headers['Vary'] = 'Cookie'
    if path == '/sw.js' or path.endswith('service-worker.js'):
        response.headers['Cache-Control'] = 'no-store, no-cache, max-age=0, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    if path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, max-age=0, must-revalidate'  # V43 no stale static cache
        response.headers.pop('Pragma', None)
        response.headers.pop('Expires', None)
        return response
    response.headers['Cache-Control'] = 'no-store, no-cache, max-age=0, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.before_request
def protect_pages():
    path = request.path
    # FIX52：不要在每次開頁時同步執行備份，避免當天第一個使用者卡住。
    # 需要自動每日備份時，可在 Render 環境變數設定 YX_AUTO_DAILY_BACKUP=1。
    if os.getenv("YX_AUTO_DAILY_BACKUP", "0") == "1" and require_login() and not path.startswith("/static/") and path not in ("/health", "/api/health"):
        ensure_daily_backup()
    if path.startswith("/static/") or path in ("/health",):
        return None
    public = [
        "/login", "/api/login", "/api/health", "/api/native-shell/config",
        "/sw.js", "/manifest.webmanifest"
    ]
    if path in public:
        return None
    if not require_login() and path not in ("/",):
        # Let / redirect to login
        if path.startswith("/api/"):
            return jsonify(success=False, error="請先登入"), 401
        return redirect(url_for("login_page"))
    return None


@app.route("/sw.js")
def serve_root_service_worker():
    resp = send_from_directory(app.static_folder, "service-worker.js", mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-store, no-cache, max-age=0, must-revalidate"
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def error_response(msg, code=400):
    return jsonify({"success": False, "error": msg}), code

def compress_image(path):
    try:
        img = Image.open(path)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        if img.width > 1800:
            ratio = 1800 / float(img.width)
            img = img.resize((1800, int(img.height * ratio)))
        img.save(path, "JPEG", quality=78, optimize=True)
    except Exception as e:
        log_error("compress_image", str(e))

def parse_lines_to_items(text):
    parsed = parse_ocr_text(text)
    return parsed["items"], parsed["text"]



def normalize_item_quantity(product_text, qty=0):
    return effective_product_qty(product_text, qty)


def normalize_item_for_save(item):
    product_text = format_product_text_height2((item.get('product_text') or item.get('product') or '').strip())
    material = clean_material_value(item.get('material') or item.get('product_code') or '', product_text)
    product_code = material
    qty = normalize_item_quantity(product_text, item.get('qty') or 0)
    return {'product_text': product_text, 'product_code': product_code, 'material': material, 'qty': qty}



def customer_item_deduct_source_label(source=''):
    raw = str(source or '').strip()
    if re.search(r'總單|master_order|master_orders|master', raw, re.I):
        return '該客戶總單'
    if re.search(r'訂單|orders|order', raw, re.I):
        return '該客戶訂單'
    if re.search(r'庫存|inventory|stock', raw, re.I):
        return '庫存'
    return raw or '自動判斷'

def aggregate_customer_items(items):
    """Group customer items by source + size + material, show supports/notes, and sort 高 > 寬 > 長 ascending."""
    buckets = {}
    for row in items or []:
        product_text = format_product_text_height2((row.get('product_text') or '').strip())
        if not product_text:
            continue
        source = row.get('source') or ''
        material = (row.get('material') or ((row.get('product_code') or '') if (row.get('product_code') or '') != product_text else '')).strip()
        size = product_display_size(product_text)
        qty = normalize_item_quantity(product_text, row.get('qty') or 0)
        support = product_support_text(product_text)
        # If the right side is only 支數, append x件數 for display. 括號備註會保留。
        if support and ('+' not in support and '＋' not in support and 'x' not in support.lower()):
            support = f"{support}x{qty}"
        elif not support:
            support = str(qty)
        key = (source, size, material)
        if key not in buckets:
            out = dict(row)
            out['qty'] = qty
            out['product_text'] = f"{size}={support}" if support else size
            out['material'] = material
            out['product_code'] = material
            out['size_text'] = size
            out['support_text'] = support
            buckets[key] = out
        else:
            buckets[key]['qty'] = int(buckets[key].get('qty') or 0) + qty
            old_support = (buckets[key].get('support_text') or '').strip()
            if support:
                supports = [x for x in old_support.split('+') if x] if old_support else []
                if support not in supports:
                    supports.append(support)
                buckets[key]['support_text'] = '+'.join(supports)
                buckets[key]['product_text'] = f"{size}={buckets[key]['support_text']}"
    rows = list(buckets.values())
    rows.sort(key=lambda r: (product_sort_tuple(r.get('product_text') or ''), r.get('source') or '', r.get('id') or 0))
    return rows


def warehouse_item_size_key(text):
    raw = str(text or '').replace('×', 'x').replace('Ｘ', 'x').replace('X', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    left = (raw.split('=', 1)[0].strip() or raw).lower()
    parts = [p for p in left.split('x') if p != '']
    if len(parts) >= 3 and all(part.strip().isdigit() for part in parts[:3]):
        return 'x'.join(str(int(part.strip())) for part in parts[:3])
    return left

def warehouse_customer_key(customer_name):
    customer = (customer_name or '').strip()
    return customer if customer else '庫存'

def warehouse_item_exact_key(text):
    raw = str(text or '').replace('×', 'x').replace('Ｘ', 'x').replace('X', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    try:
        raw = format_product_text_height2(raw)
    except Exception:
        pass
    size = warehouse_item_size_key(raw)
    if '=' not in raw:
        return size
    right = raw.split('=', 1)[1].strip().lower()
    right = re.sub(r'\s+', '', right)
    return f"{size}={right}" if right else size

def warehouse_support_text(text):
    raw = str(text or '').replace('×', 'x').replace('Ｘ', 'x').replace('X', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    if '=' not in raw:
        return ''
    return raw.split('=', 1)[1].strip()



def warehouse_split_support_components(product_text, row_qty):
    """把 61x12x10=750x21+822+610 拆成可獨立入倉的支數項。
    回傳每一支數自己的 product_text / support_text / qty。若沒有 =，維持原商品與資料庫 qty。
    """
    raw = str(product_text or '').replace('×','x').replace('Ｘ','x').replace('X','x').replace('✕','x').replace('＊','x').replace('*','x').replace('＝','=').strip()
    try:
        row_qty = int(row_qty or 0)
    except Exception:
        row_qty = 0
    if not raw or '=' not in raw:
        return [{'product_text': raw, 'support_text': warehouse_support_text(raw), 'qty': max(0, row_qty)}]
    size = warehouse_item_size_key(raw)
    right = raw.split('=', 1)[1].strip()
    parts = [x.strip() for x in re.split(r'[+＋]', right) if x and x.strip()]
    if not size or not parts:
        return [{'product_text': raw, 'support_text': warehouse_support_text(raw), 'qty': max(0, row_qty)}]
    out = []
    for part in parts:
        m = re.match(r'^(\d+(?:\.\d+)?)(?:x(\d+))?$', part.lower())
        if m:
            support = str(int(float(m.group(1)))) if float(m.group(1)).is_integer() else m.group(1)
            qty = int(m.group(2) or 1)
        else:
            support = part
            qty = 1
        if qty > 0:
            out.append({'product_text': f'{size}={support}', 'support_text': support, 'qty': qty})
    if not out:
        return [{'product_text': raw, 'support_text': warehouse_support_text(raw), 'qty': max(0, row_qty)}]
    # 若右側拆出的件數明顯不是 row_qty，而且只有一項，採資料庫 qty；多項維持支數表達本身，避免「可加入 25 件」亂選。
    if len(out) == 1 and row_qty > 0:
        out[0]['qty'] = row_qty
    return out

def safe_cell_items(cell):
    try:
        return json.loads(cell.get('items_json') or '[]')
    except Exception:
        return []

def warehouse_source_totals():
    """Return source quantities for warehouse placement.

    V48 main-file fix:
    - 庫存空客戶統一視為「庫存」，避免前端顯示「庫存」但後端驗證用空字串造成儲存失敗。
    - 同尺寸不同支數 / 不同來源分開列入 source_details，讓下拉可選「這支數 x 件」與「另一支數 x 件」。
    - totals 同時保留 exact key 與 size aggregate，支援舊格位只存尺寸的資料。 
    """
    totals = {}
    details = {}
    source_rows = []
    # V49 mainfile: 倉庫圖下拉要使用資料庫永久數量，不使用列表顯示層的 effective qty。
    # 這樣「80x30x125 / qty=18」會顯示可加入 18 件；
    # 若商品文字本身有 =支數，仍保留該支數文字，讓不同支數分開選。
    try:
        conn = get_db(); cur = conn.cursor()
        for source_label, table in [('庫存','inventory'), ('訂單','orders'), ('總單','master_orders')]:
            try:
                cur.execute(sql(f"SELECT * FROM {table} WHERE COALESCE(qty,0) > 0"))
                for row in rows_to_dict(cur):
                    source_rows.append((source_label, row))
            except Exception as e:
                log_error('warehouse_source_totals_raw_' + table, str(e))
        try: conn.close()
        except Exception: pass
    except Exception as e:
        log_error('warehouse_source_totals_raw', str(e))
        for row in list_inventory():
            source_rows.append(('庫存', row))
        for row in get_orders():
            source_rows.append(('訂單', row))
        for row in get_master_orders():
            source_rows.append(('總單', row))
    for source_label, row in source_rows:
        original_product = (row.get('product_text') or row.get('product') or '').strip()
        customer = warehouse_customer_key(row.get('customer_name') or '')
        try:
            row_qty = int(row.get('qty') or 0)
        except Exception:
            row_qty = 0
        if row_qty <= 0:
            continue
        material = (row.get('material') or row.get('product_code') or '').strip()
        zone_text = (row.get('location') or row.get('zone') or row.get('warehouse_zone') or '').strip().upper()
        components = warehouse_split_support_components(original_product, row_qty)
        for comp_i, comp in enumerate(components):
            product = (comp.get('product_text') or original_product).strip()
            qty = int(comp.get('qty') or 0)
            size = warehouse_item_size_key(product)
            exact = warehouse_item_exact_key(product)
            if not size or qty <= 0:
                continue
            exact_key = (exact, customer)
            totals[exact_key] = totals.get(exact_key, 0) + qty
            # 注意：有支數的商品不再累加 size_key，避免 25 件總數被隨機套到任一支數。
            if '=' not in exact:
                size_key = (size, customer)
                totals[size_key] = totals.get(size_key, 0) + qty
            source_id = f"{row.get('id') or ''}:{comp_i}:{comp.get('support_text') or ''}" if len(components) > 1 else str(row.get('id') or '')
            detail_key = (exact, customer, source_label, source_id)
            details.setdefault(detail_key, []).append({
                'source': source_label,
                'source_table': source_label,
                'source_id': source_id,
                'origin_source_id': row.get('id'),
                'id': source_id,
                'product_text': product,
                'original_product_text': original_product,
                'product_size': size,
                'support_text': comp.get('support_text') or warehouse_support_text(product),
                'exact_key': exact,
                'size_key': size,
                'qty': qty,
                'customer_name': customer,
                'material': material,
                'product_code': material,
                'zone': zone_text,
            })
    return totals, details

def warehouse_placed_totals(exclude_cell=None, proposed_items=None):
    placed = {}
    exclude_cell = exclude_cell or None
    for cell in warehouse_get_cells():
        cell_key = (str(cell.get('zone')), int(cell.get('column_index') or 0), int(cell.get('slot_number') or 0))
        if exclude_cell and cell_key == exclude_cell:
            items = proposed_items or []
        else:
            items = safe_cell_items(cell)
        for it in items:
            product = it.get('product_text') or it.get('product') or ''
            size = warehouse_item_size_key(product)
            exact = warehouse_item_exact_key(product)
            if not size:
                continue
            customer = warehouse_customer_key(it.get('customer_name') or '')
            try:
                qty = int(it.get('qty') or 0)
            except Exception:
                qty = 0
            if qty <= 0:
                continue
            exact_key = (exact, customer)
            size_key = (size, customer)
            placed[exact_key] = placed.get(exact_key, 0) + qty
            if size_key != exact_key:
                placed[size_key] = placed.get(size_key, 0) + qty
    return placed

def normalize_warehouse_payload_items(items):
    # V47: normalize warehouse modal payload and merge exact duplicate rows.
    out_map = {}
    for it in items or []:
        if not isinstance(it, dict):
            continue
        product = (it.get('product_text') or it.get('product') or it.get('product_size') or '').strip()
        if not product:
            continue
        try:
            qty = int(it.get('qty') or it.get('quantity') or it.get('pieces') or 1)
        except Exception:
            qty = 1
        qty = max(1, qty)
        customer = warehouse_customer_key(it.get('customer_name') or it.get('customer') or '')
        material = (it.get('material') or it.get('wood_type') or '').strip()
        source_table = (it.get('source_table') or it.get('source') or '庫存').strip() or '庫存'
        source_id = str(it.get('source_id') or it.get('id') or '').strip()
        placement_label = (it.get('placement_label') or it.get('layer_label') or '前排').strip() or '前排'
        # V50：同一來源同一商品禁止因前/中/後不同列重複放入；合併成同一筆數量。
        key = (warehouse_item_exact_key(product), customer, material, source_table, source_id)
        row = out_map.get(key)
        if row:
            row['qty'] = int(row.get('qty') or 0) + qty
        else:
            row = dict(it)
            row.update({'product_text': product, 'product': product, 'qty': qty, 'customer_name': customer, 'material': material, 'source': source_table, 'source_table': source_table, 'source_id': source_id, 'placement_label': placement_label, 'layer_label': placement_label})
            out_map[key] = row
    return list(out_map.values())

def validate_warehouse_cell_quantities(zone, column_index, slot_number, items):
    # V48: exact 支數 + 尺寸總量雙層驗證，並把空客戶與「庫存」對齊，避免儲存後刷新消失。
    source_totals, _details = warehouse_source_totals()
    exclude_key = ((zone or '').strip().upper(), int(column_index or 0), int(slot_number or 0))
    proposed_exact = {}
    proposed_size = {}
    for it in items or []:
        product = it.get('product_text') or it.get('product') or ''
        size = warehouse_item_size_key(product)
        exact = warehouse_item_exact_key(product)
        customer = warehouse_customer_key(it.get('customer_name') or '')
        if not size:
            continue
        try:
            q = int(it.get('qty') or it.get('quantity') or 0)
        except Exception:
            q = 0
        if q <= 0:
            continue
        proposed_exact[(exact, customer)] = proposed_exact.get((exact, customer), 0) + q
        proposed_size[(size, customer)] = proposed_size.get((size, customer), 0) + q
    placed_other = warehouse_placed_totals(exclude_cell=exclude_key, proposed_items=[])
    for key, proposed_qty in proposed_exact.items():
        source_qty = int(source_totals.get(key, 0) or 0)
        # 舊資料只有尺寸、沒有支數時，允許走尺寸總量驗證。
        if source_qty <= 0 and '=' not in key[0]:
            source_qty = int(source_totals.get(key, 0) or 0)
        if source_qty > 0:
            already = int(placed_other.get(key, 0) or 0)
            if already + proposed_qty > source_qty:
                return False, f"{key[0]} 的入倉數量超過此支數來源數量（來源 {source_qty}，目前已放 {already}，本格要放 {proposed_qty}）"
    for key, proposed_qty in proposed_size.items():
        # V50：若有 exact 支數驗證，尺寸總量只當 fallback；避免同一筆 exact 又被尺寸層重複誤判。
        has_exact_for_size = any(k[1] == key[1] and warehouse_item_size_key(k[0]) == key[0] and '=' in k[0] for k in proposed_exact.keys())
        if has_exact_for_size:
            continue
        source_qty = int(source_totals.get(key, 0) or 0)
        if source_qty <= 0:
            return False, f"{key[0]} 沒有可加入來源數量"
        already = int(placed_other.get(key, 0) or 0)
        if already + proposed_qty > source_qty:
            return False, f"{key[0]} 的入倉數量超過來源總數量（來源 {source_qty}，目前已放 {already}，本格要放 {proposed_qty}）"
    return True, ""

def grouped_inventory():
    return inventory_summary()


def resolve_customer_identity(customer_name='', customer_uid='', include_archived=True):
    uid = (customer_uid or '').strip()
    name = (customer_name or '').strip()
    row = None
    if uid:
        row = get_customer_by_uid(uid, include_archived=include_archived)
    if not row and name:
        row = get_customer(name, include_archived=include_archived)
    resolved_name = (row.get('name') if row else name) or ''
    resolved_uid = (row.get('customer_uid') if row else uid) or ''
    return row, resolved_name, resolved_uid


def customer_groups():
    customers = get_customers()
    groups = {"北區": [], "中區": [], "南區": [], "未分區": []}
    for c in customers:
        region = (c.get("region") or '').strip()
        if region not in groups:
            region = "未分區"
        groups[region].append(c)
    return groups

@app.route("/")
def home():
    if not require_login():
        return redirect(url_for("login_page"))
    return render_template("index.html", username=current_username(), title="沅興木業", today=datetime.now().strftime('%Y-%m-%d'))

@app.route("/login")
def login_page():
    if require_login():
        return redirect(url_for("home"))
    return render_template("login.html", title="登入")

@app.route("/settings")
def settings_page():
    is_admin = current_username() == '陳韋廷'
    return render_template("settings.html", username=current_username(), title="設定", is_admin=is_admin, native_ocr_mode=(str(get_setting('native_ocr_mode', '1')) == '1'))

@app.route("/inventory")
def inventory_page():
    return render_template("module.html", module_key="inventory", title="庫存", username=current_username())

@app.route("/orders")
def orders_page():
    return render_template("module.html", module_key="orders", title="訂單", username=current_username())

@app.route("/master-order")
def master_order_page():
    return render_template("module.html", module_key="master_order", title="總單", username=current_username())

@app.route("/ship")
def ship_page():
    return render_template("module.html", module_key="ship", title="出貨", username=current_username())

@app.route("/shipping-query")
def shipping_query_page():
    return render_template("module.html", module_key="shipping_query", title="出貨查詢", username=current_username())

@app.route("/warehouse")
def warehouse_page():
    return render_template("module.html", module_key="warehouse", title="倉庫圖", username=current_username())

@app.route("/customers")
def customers_page():
    return render_template("module.html", module_key="customers", title="客戶資料", username=current_username())

@app.route("/todos")
def todos_page():
    return render_template("module.html", module_key="todos", title="代辦事項", username=current_username())

@app.route("/today-changes")
def today_changes_page():
    return render_template("today_changes.html", username=current_username(), title="今日異動")

@app.route('/todo-image/<path:filename>')
def todo_image(filename):
    if not require_login():
        return redirect(url_for('login_page'))
    safe_name = os.path.basename(filename)
    return send_from_directory(TODO_UPLOAD_FOLDER, safe_name)



@app.route('/api/todos', methods=['GET', 'POST'])
@login_required_json
def api_todos():
    try:
        if request.method == 'GET':
            return jsonify(success=True, items=safe_list_todos())
        files = []
        for key in ('images', 'image'):
            files.extend([f for f in request.files.getlist(key) if f and (f.filename or '').strip()])
        if not files:
            return error_response('請先選擇照片')
        save_names = []
        for file in files:
            if not allowed_file(file.filename):
                return error_response('圖片格式不支援')
            filename = secure_filename(file.filename or '')
            ext = (filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg') or 'jpg'
            save_name = f"todo_{int(time.time()*1000)}_{hashlib.md5((filename+str(time.time())).encode('utf-8')).hexdigest()[:10]}.{ext}"
            save_path = os.path.join(TODO_UPLOAD_FOLDER, save_name)
            file.save(save_path)
            compress_image(save_path)
            save_names.append(save_name)
        note = (request.form.get('note') or '').strip()
        due_date = (request.form.get('due_date') or '').strip()
        created_by = current_username()
        image_payload = json.dumps(save_names, ensure_ascii=False)
        create_todo_item(note=note, due_date=due_date, image_filename=image_payload, created_by=created_by)
        fallback = {'note': note, 'due_date': due_date, 'image_filename': image_payload, 'created_by': created_by, 'created_at': now()}
        log_action(created_by, f"新增代辦 {note or ','.join(save_names)}")
        add_audit_trail(created_by, 'create', 'todo_items', note or 'todo', before_json={}, after_json={'note': note, 'due_date': due_date, 'images': save_names})
        return jsonify(success=True, items=safe_list_todos(fallback_item=fallback))
    except Exception as e:
        log_error('api_todos', str(e))
        return error_response('代辦事項儲存失敗')


@app.route('/api/todos/<int:todo_id>/complete', methods=['POST'])
@login_required_json
def api_todo_complete(todo_id):
    try:
        item = get_todo_item(todo_id)
        if not item:
            return error_response('找不到代辦事項', 404)
        complete_todo_item(todo_id)
        log_action(current_username(), f"完成代辦 {todo_id}")
        return jsonify(success=True, items=safe_list_todos())
    except Exception as e:
        log_error('api_todo_complete', str(e))
        return error_response('代辦事項完成失敗')

@app.route('/api/todos/<int:todo_id>/restore', methods=['POST'])
@login_required_json
def api_todo_restore(todo_id):
    try:
        item = get_todo_item(todo_id)
        if not item:
            return error_response('找不到代辦事項', 404)
        restore_todo_item(todo_id)
        log_action(current_username(), f"還原代辦 {todo_id}")
        return jsonify(success=True, items=safe_list_todos())
    except Exception as e:
        log_error('api_todo_restore', str(e))
        return error_response('代辦事項還原失敗')

@app.route('/api/todos/reorder', methods=['POST'])
@login_required_json
def api_todo_reorder():
    try:
        data = request.get_json(silent=True) or {}
        reorder_todo_items(data.get('ids') or [], done_flag=int(data.get('done_flag') or 0))
        log_action(current_username(), '拖拉排序代辦')
        return jsonify(success=True, items=safe_list_todos())
    except Exception as e:
        log_error('api_todo_reorder', str(e))
        return error_response('代辦排序失敗')

@app.route('/api/todos/<int:todo_id>', methods=['DELETE'])
@login_required_json
def api_todo_delete(todo_id):
    try:
        item = get_todo_item(todo_id)
        if not item:
            return error_response('找不到代辦事項', 404)
        delete_todo_item(todo_id)
        image_raw = item.get('image_filename') or ''
        try:
            image_names = json.loads(image_raw) if str(image_raw).strip().startswith('[') else [image_raw]
        except Exception:
            image_names = [image_raw]
        for image_filename in [os.path.basename(v or '') for v in image_names if v]:
            if image_filename:
                path = os.path.join(TODO_UPLOAD_FOLDER, image_filename)
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except Exception:
                        pass
        log_action(current_username(), f"刪除代辦 {todo_id}")
        return jsonify(success=True)
    except Exception as e:
        log_error('api_todo_delete', str(e))
        return error_response('代辦事項刪除失敗')

@app.route("/api/login", methods=["POST"])
def api_login():
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get("username") or data.get("name") or "").strip()
        password = (data.get("password") or "").strip()
        if not username or not password:
            return error_response("帳號密碼不可空白")
        user = get_user(username)
        if user and int(user.get('is_blocked') or 0) == 1:
            try:
                log_action(username or 'unknown', '黑名單登入攔截')
            except Exception:
                pass
            return error_response("此帳號已被停用", 403)
        if not user:
            create_user(username, password)
            log_action(username, "建立帳號")
            user = get_user(username) or {}
        else:
            if not verify_password(user.get('password'), password):
                return error_response("密碼錯誤", 403)
            # 舊明碼資料第一次成功登入後自動升級為 hash
            if user.get('password') == password:
                update_password(username, password)
                user = get_user(username) or user
        session.permanent = True
        session["user"] = username
        session["role"] = user.get('role') or ("admin" if username == "陳韋廷" else "user")
        log_action(username, "登入系統")
        return jsonify(success=True, username=username, role=session.get("role"))
    except Exception as e:
        log_error("api_login", str(e))
        return error_response("登入失敗")

@app.route("/api/logout", methods=["POST"])
@login_required_json
def api_logout():
    user = current_username()
    session.clear()
    try:
        log_action(user, "登出系統")
    except Exception:
        pass
    return jsonify(success=True)

@app.route("/api/change_password", methods=["POST"])
@login_required_json
def api_change_password():
    try:
        data = request.get_json(silent=True) or {}
        old_password = (data.get("old_password") or "").strip()
        new_password = (data.get("new_password") or "").strip()
        confirm_password = (data.get("confirm_password") or "").strip()
        user = get_user(current_username())
        if not user or not verify_password(user.get('password'), old_password):
            return error_response("舊密碼錯誤")
        if not new_password or len(new_password) < 4:
            return error_response("新密碼至少 4 碼")
        if new_password != confirm_password:
            return error_response("兩次密碼不一致")
        update_password(current_username(), new_password)
        log_action(current_username(), "修改密碼")
        return jsonify(success=True)
    except Exception as e:
        log_error("change_password", str(e))
        return error_response("修改失敗")

@app.route("/api/native-ocr/parse", methods=["POST"])
@login_required_json
def api_native_ocr_parse():
    try:
        data = request.get_json(silent=True) or {}
        raw_text = (data.get("raw_text") or data.get("text") or "").strip()
        customer_hint = (data.get("customer_hint") or data.get("customer_name") or "").strip()
        native_confidence = int(data.get("confidence") or data.get("ocr_confidence") or 0)
        blocks = data.get("blocks") or data.get("positions") or []
        ocr_mode = (data.get("ocr_mode") or data.get("mode") or 'blue').strip() or 'blue'
        roi = data.get("roi") or None
        if not raw_text and not customer_hint and not blocks:
            return error_response("沒有可解析的辨識文字")
        result = process_native_ocr_text(
            raw_text,
            customer_hint=customer_hint,
            native_confidence=native_confidence,
            blocks=blocks,
            ocr_mode=ocr_mode,
            roi=roi,
        )
        items = result.get('items') or []
        normalized_text = result.get('text') or ''
        customer_guess = result.get('customer_guess') or ''
        partial = bool((normalized_text or raw_text) and (not normalized_text or not customer_guess))
        log_action(current_username(), f"原生OCR辨識[{','.join(result.get('engines', []))}]")
        return jsonify(
            success=True,
            text=normalized_text or raw_text,
            raw_text=result.get('raw_text') or raw_text,
            items=items,
            confidence=int(result.get('confidence') or 0),
            ocr_confidence=int(result.get('ocr_confidence') or native_confidence or 0),
            parse_confidence=int(result.get('parse_confidence') or 0),
            warning=result.get('warning') or '',
            engines=result.get('engines', []),
            customer_guess=customer_guess,
            cleaned_text=result.get('cleaned_text') or '',
            suggested_roi=result.get('suggested_roi'),
            partial=partial,
            line_map=result.get('line_map', []),
            ocr_mode=ocr_mode,
        )
    except Exception as e:
        log_error("native_ocr_parse", str(e))
        return error_response("原生 OCR 文字解析失敗")

@app.route("/api/save_correction", methods=["POST"])
@login_required_json
def api_save_correction():
    try:
        data = request.get_json(silent=True) or {}
        wrong = (data.get("wrong_text") or "").strip()
        correct = (data.get("correct_text") or "").strip()
        if wrong and correct and wrong != correct:
            save_correction(wrong, correct)
            log_action(current_username(), f"修正OCR {wrong}->{correct}")
            add_audit_trail(current_username(), 'upsert', 'corrections', wrong, before_json={}, after_json={'wrong_text': wrong, 'correct_text': correct})
            notify_sync_event(kind='refresh', module='settings', message='OCR 修正詞庫已更新', extra={'wrong_text': wrong})
        return jsonify(success=True)
    except Exception as e:
        log_error("save_correction", str(e))
        return error_response("儲存失敗")

def _parse_items_from_request(data):
    items = data.get("items") or []
    payload_material = (data.get("material") or "").strip().upper()
    if items:
        cleaned = []
        for it in items:
            if payload_material and not (it.get("material") or "").strip():
                it = {**it, "material": payload_material, "product_code": payload_material}
            fixed = normalize_item_for_save(it)
            # FIX90：保留出貨來源 / 借貨資訊，避免 normalize 後被吃掉。
            for _k in ('borrow_from_customer_name', 'source_customer_name', 'borrow_reason', 'borrow_confirmed', 'source_preference', 'deduct_source', 'source'):
                if isinstance(it, dict) and it.get(_k) not in (None, ''):
                    fixed[_k] = it.get(_k)
            if int(fixed.get("qty") or 0) <= 0 or not fixed.get("product_text"):
                continue
            cleaned.append(fixed)
        return cleaned
    text = data.get("ocr_text") or data.get("text") or ""
    parsed_items, _ = parse_lines_to_items(text)
    cleaned = []
    for it in parsed_items:
        if payload_material:
            it = {**it, "material": payload_material, "product_code": payload_material}
        fixed = normalize_item_for_save(it)
        if fixed.get("product_text") and int(fixed.get("qty") or 0) > 0:
            cleaned.append(fixed)
    return cleaned


# FIX76：送出前檢查相同「尺寸 + 材質」並列出將被合併的資料。
def _dup_size_key(product_text):
    return product_display_size(format_product_text_height2(product_text or '')).replace(' ', '').lower()


def _dup_material_key(material='', product_text=''):
    return clean_material_value(material or '', product_text or '').replace(' ', '').upper()


def _duplicate_check_table(module):
    mod = (module or '').strip()
    if mod == 'inventory':
        return 'inventory', '庫存'
    if mod == 'orders':
        return 'orders', '訂單'
    if mod in ('master_order', 'master_orders'):
        return 'master_orders', '總單'
    return '', ''


@app.route('/api/duplicate-check', methods=['POST'])
@login_required_json
def api_duplicate_check():
    try:
        data = request.get_json(silent=True) or {}
        module = (data.get('module') or data.get('source') or '').strip()
        table, label = _duplicate_check_table(module)
        if not table:
            return jsonify(success=True, has_duplicates=False, duplicates=[])
        customer_name = (data.get('customer_name') or '').strip()
        items = _parse_items_from_request(data)
        if not items:
            return jsonify(success=True, has_duplicates=False, duplicates=[])

        incoming = {}
        order = []
        for it in items:
            product_text = format_product_text_height2(it.get('product_text') or '')
            material = clean_material_value(it.get('material') or it.get('product_code') or '', product_text)
            key = (_dup_size_key(product_text), _dup_material_key(material, product_text))
            if not key[0]:
                continue
            if key not in incoming:
                incoming[key] = {'size': product_display_size(product_text), 'material': material, 'new_qty': 0, 'incoming_count': 0, 'new_items': []}
                order.append(key)
            incoming[key]['new_qty'] += int(it.get('qty') or 0)
            incoming[key]['incoming_count'] += 1
            incoming[key]['new_items'].append({'product_text': product_text, 'qty': int(it.get('qty') or 0), 'material': material})

        conn = get_db(); cur = conn.cursor()
        try:
            params = []
            query = f"SELECT id, customer_name, product_text, product_code, material, qty FROM {table} WHERE qty > 0"
            if table in ('orders', 'master_orders'):
                query += " AND customer_name = ?"
                params.append(customer_name)
            cur.execute(sql(query), tuple(params))
            rows = rows_to_dict(cur)
        finally:
            conn.close()

        existing_by_key = {}
        for r in rows:
            product_text = format_product_text_height2(r.get('product_text') or '')
            material = clean_material_value(r.get('material') or r.get('product_code') or '', product_text)
            key = (_dup_size_key(product_text), _dup_material_key(material, product_text))
            if key not in existing_by_key:
                existing_by_key[key] = []
            existing_by_key[key].append({
                'id': r.get('id'),
                'customer_name': r.get('customer_name') or '',
                'product_text': product_text,
                'material': material,
                'qty': int(r.get('qty') or 0),
                'source': label,
            })

        duplicates = []
        for key in order:
            inc = incoming[key]
            exists = existing_by_key.get(key, [])
            is_dup_inside = inc.get('incoming_count', 0) > 1
            if exists or is_dup_inside:
                duplicates.append({
                    'source': label,
                    'customer_name': customer_name,
                    'size': inc.get('size') or key[0],
                    'material': inc.get('material') or '未填材質',
                    'new_qty': inc.get('new_qty') or 0,
                    'incoming_count': inc.get('incoming_count') or 0,
                    'existing_qty': sum(int(x.get('qty') or 0) for x in exists),
                    'existing_rows': exists,
                    'new_items': inc.get('new_items') or [],
                })
        return jsonify(success=True, has_duplicates=bool(duplicates), duplicates=duplicates)
    except Exception as e:
        log_error('duplicate_check', str(e))
        return error_response('合併檢查失敗')



def yx_v35_safe_side_effect(label, fn, *args, **kwargs):
    """Run logs/audit/notify/snapshot safely so product creation never fails because of side effects."""
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        try:
            log_error('v35_safe_side_effect_' + str(label), str(e))
        except Exception:
            pass
        return None

def yx_v35_safe_response_payload(customer_name=''):
    payload = {}
    try:
        if customer_name:
            snap = build_customer_payload_snapshot(customer_name)
            if isinstance(snap, dict):
                payload.update(snap)
    except Exception as e:
        yx_v35_safe_side_effect('snapshot', lambda: (_ for _ in ()).throw(e))
    try:
        payload['snapshots'] = yx_v22_product_snapshots()
    except Exception:
        payload['snapshots'] = {}
    try:
        payload['customers'] = get_customers()
    except Exception:
        payload['customers'] = []
    return payload

@app.route("/api/inventory", methods=["GET", "POST"])
@login_required_json
def api_inventory():
    if request.method == "GET":
        try:
            return jsonify(success=True, items=grouped_inventory())
        except Exception as e:
            log_error("inventory_get", str(e))
            return jsonify(success=True, items=[])
    data = request.get_json(silent=True) or {}
    try:
        if not request_key_from_payload(data, endpoint='/api/inventory'):
            return duplicate_success('相同庫存送出已忽略', **duplicate_current_payload('/api/inventory', data))
        items = _parse_items_from_request(data)
        if not items:
            return error_response("請輸入商品資料")
        operator = current_username()
        duplicate_mode = (data.get("duplicate_mode") or "merge").strip() or "merge"
        location = (data.get("location") or "").strip()
        customer_name = (data.get("customer_name") or "").strip()
        if customer_name:
            yx_v35_safe_side_effect('upsert_inventory_customer', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region')), preserve_existing=True)
        for it in items:
            save_inventory_item(it["product_text"], it.get("product_code", ""), int(it["qty"]), location, customer_name, operator, data.get("ocr_text", ""), it.get("material",""), duplicate_mode=duplicate_mode)
    except Exception as e:
        log_error("inventory_main_save_v40", str(e))
        return error_response("建立失敗")
    yx_v35_safe_side_effect('log_inventory', log_action, current_username(), "建立庫存")
    yx_v35_safe_side_effect('audit_inventory', add_audit_trail, current_username(), 'create', 'inventory', customer_name or 'inventory', before_json={}, after_json={'customer_name': customer_name, 'location': location, 'items': items})
    yx_v35_safe_side_effect('notify_inventory', notify_sync_event, kind='refresh', module='inventory', message='庫存已更新', extra={'customer_name': customer_name, 'count': len(items)})
    payload = yx_v35_safe_response_payload(customer_name)
    exact = yx_v35_safe_side_effect('exact_inventory', yx_v21_exact_customer_rows, 'inventory', customer_name) or []
    try:
        rows = grouped_inventory()
    except Exception:
        rows = []
    return jsonify(success=True, items=rows, exact_customer_items=exact, **payload)

@app.route("/api/inventory/<int:item_id>", methods=["GET", "PUT", "DELETE"])
@login_required_json
def api_inventory_item(item_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(sql("SELECT * FROM inventory WHERE id = ?"), (item_id,))
        row = fetchone_dict(cur)
        if not row:
            conn.close()
            return error_response("找不到庫存商品", 404)
        if request.method == "GET":
            conn.close()
            return jsonify(success=True, item=row)
        if request.method == "DELETE":
            before = dict(row)
            cur.execute(sql("DELETE FROM inventory WHERE id = ?"), (item_id,))
            conn.commit()
            conn.close()
            log_action(current_username(), f"刪除庫存商品 #{item_id}")
            add_audit_trail(current_username(), 'delete', 'inventory', str(item_id), before_json=before, after_json={})
            notify_sync_event(kind='refresh', module='inventory', message='庫存商品已刪除', extra={'id': item_id})
            return jsonify(success=True, items=grouped_inventory())
        data = request.get_json(silent=True) or {}
        product_text = format_product_text_height2((data.get('product_text') or row.get('product_text') or '').strip())
        material = clean_material_value(data.get('material') if data.get('material') is not None else (data.get('product_code') if data.get('product_code') is not None else row.get('material') or row.get('product_code') or ''), product_text)
        month_tag = product_month_tag(product_text)
        product_code = material
        qty = normalize_item_quantity(product_text, 1)
        location = (data.get('location') if data.get('location') is not None else row.get('location') or '').strip()
        customer_name = (data.get('customer_name') if data.get('customer_name') is not None else row.get('customer_name') or '').strip()
        if not product_text:
            conn.close()
            return error_response('請輸入商品資料')
        if qty < 0:
            qty = 0
        before = dict(row)
        cur.execute(sql("""
            UPDATE inventory
            SET product_text = ?, product_code = ?, material = ?, month_tag = ?, qty = ?, location = ?, customer_name = ?, operator = ?, updated_at = ?
            WHERE id = ?
        """), (product_text, product_code, material, month_tag, qty, location, customer_name, current_username(), now(), item_id))
        conn.commit()
        conn.close()
        log_action(current_username(), f"編輯庫存商品 #{item_id}")
        add_audit_trail(current_username(), 'update', 'inventory', str(item_id), before_json=before, after_json={'product_text': product_text, 'qty': qty, 'location': location, 'customer_name': customer_name})
        notify_sync_event(kind='refresh', module='inventory', message='庫存商品已更新', extra={'id': item_id})
        return jsonify(success=True, items=grouped_inventory())
    except Exception as e:
        log_error('inventory_item', str(e))
        return error_response('庫存商品操作失敗')

@app.route("/api/inventory/<int:item_id>/move", methods=["POST"])
@login_required_json
def api_inventory_item_move(item_id):
    try:
        data = request.get_json(silent=True) or {}
        target = (data.get('target') or '').strip()
        customer_name = (data.get('customer_name') or '').strip()
        if target not in ('orders', 'master_order', 'master_orders'):
            return error_response('請選擇要移到訂單或總單')
        if not customer_name:
            return error_response('請選擇客戶')
        conn = get_db()
        cur = conn.cursor()
        cur.execute(sql("SELECT * FROM inventory WHERE id = ?"), (item_id,))
        row = fetchone_dict(cur)
        if not row:
            conn.close()
            return error_response('找不到庫存商品', 404)
        current_qty = int(row.get('qty') or 0)
        move_qty = int(data.get('qty') or current_qty or 0)
        if move_qty <= 0:
            conn.close()
            return error_response('移動數量必須大於 0')
        if move_qty > current_qty:
            move_qty = current_qty
        product_text = format_product_text_height2((row.get('product_text') or '').strip())
        product_code = clean_material_value(row.get('material') or row.get('product_code') or '', product_text)
        conn.close()
        upsert_customer(customer_name, region=resolve_customer_region(customer_name, data.get('region')))
        item = {'product_text': product_text, 'product_code': product_code, 'qty': move_qty}
        if target == 'orders':
            save_order(customer_name, [item], current_username(), (data.get('duplicate_mode') or 'merge').strip() or 'merge')
            target_label = '訂單'
            module = 'orders'
        else:
            save_master_order(customer_name, [item], current_username(), (data.get('duplicate_mode') or 'merge').strip() or 'merge')
            target_label = '總單'
            module = 'master_order'
        conn = get_db()
        cur = conn.cursor()
        if move_qty >= current_qty:
            cur.execute(sql("DELETE FROM inventory WHERE id = ?"), (item_id,))
        else:
            cur.execute(sql("UPDATE inventory SET qty = qty - ?, operator = ?, updated_at = ? WHERE id = ?"), (move_qty, current_username(), now(), item_id))
        conn.commit()
        conn.close()
        log_action(current_username(), f"庫存移到{target_label}：{customer_name}")
        add_audit_trail(current_username(), 'move', 'inventory', str(item_id), before_json={'id': item_id, 'qty': current_qty, 'product_text': product_text}, after_json={'target': target_label, 'customer_name': customer_name, 'qty': move_qty, 'product_text': product_text})
        notify_sync_event(kind='refresh', module='inventory', message=f'庫存已移到{target_label}', extra={'id': item_id, 'customer_name': customer_name, 'qty': move_qty})
        notify_sync_event(kind='refresh', module=module, message=f'{target_label}已更新', extra={'customer_name': customer_name, 'qty': move_qty})
        snap = build_customer_payload_snapshot(customer_name)
        return jsonify(success=True, items=grouped_inventory(), customer_name=customer_name, target=target_label, **snap)
    except Exception as e:
        log_error('inventory_item_move', str(e))
        return error_response('庫存移動失敗')
@app.route("/api/orders", methods=["GET", "POST"])
@login_required_json
def api_orders():
    if request.method == "GET":
        try:
            return jsonify(success=True, items=get_orders())
        except Exception as e:
            log_error("orders_get", str(e))
            return jsonify(success=True, items=[])
    data = request.get_json(silent=True) or {}
    try:
        if not request_key_from_payload(data, endpoint='/api/orders'):
            return duplicate_success('相同訂單送出已忽略', **duplicate_current_payload('/api/orders', data))
        items = _parse_items_from_request(data)
        if not items:
            return error_response("請輸入商品資料")
        customer_name = (data.get("customer_name") or "").strip()
        if not customer_name:
            return error_response("請輸入客戶名稱")
        yx_v35_safe_side_effect('upsert_orders_customer_before', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region') or '北區'), preserve_existing=True)
        save_order(customer_name, items, current_username(), (data.get("duplicate_mode") or "merge").strip() or "merge")
        yx_v35_safe_side_effect('upsert_orders_customer_after', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region') or '北區'), preserve_existing=True)
    except Exception as e:
        log_error("orders_main_save_v40", str(e))
        return error_response("訂單建立失敗")
    yx_v35_safe_side_effect('log_orders', log_action, current_username(), "建立訂單")
    yx_v35_safe_side_effect('audit_orders', add_audit_trail, current_username(), 'create', 'orders', customer_name, before_json={}, after_json={'customer_name': customer_name, 'items': items})
    yx_v35_safe_side_effect('notify_orders', notify_sync_event, kind='refresh', module='orders', message='訂單已更新', extra={'customer_name': customer_name, 'count': len(items)})
    payload = yx_v35_safe_response_payload(customer_name)
    exact = yx_v35_safe_side_effect('exact_orders', yx_v21_exact_customer_rows, 'orders', customer_name) or []
    try:
        rows = get_orders()
    except Exception:
        rows = []
    return jsonify(success=True, items=rows, exact_customer_items=exact, **payload)

@app.route("/api/master_orders", methods=["GET", "POST"])
@login_required_json
def api_master_orders():
    if request.method == "GET":
        try:
            return jsonify(success=True, items=get_master_orders())
        except Exception as e:
            log_error("master_orders_get", str(e))
            return jsonify(success=True, items=[])
    data = request.get_json(silent=True) or {}
    try:
        if not request_key_from_payload(data, endpoint='/api/master_orders'):
            return duplicate_success('相同總單送出已忽略', **duplicate_current_payload('/api/master_orders', data))
        items = _parse_items_from_request(data)
        if not items:
            return error_response("請輸入商品資料")
        customer_name = (data.get("customer_name") or "").strip()
        if not customer_name:
            return error_response("請輸入客戶名稱")
        yx_v35_safe_side_effect('upsert_master_customer_before', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region') or '北區'), preserve_existing=True)
        save_master_order(customer_name, items, current_username(), (data.get("duplicate_mode") or "merge").strip() or "merge")
        yx_v35_safe_side_effect('upsert_master_customer_after', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region') or '北區'), preserve_existing=True)
    except Exception as e:
        log_error("master_orders_main_save_v40", str(e))
        return error_response("總單失敗")
    yx_v35_safe_side_effect('log_master_orders', log_action, current_username(), "更新總單")
    yx_v35_safe_side_effect('audit_master_orders', add_audit_trail, current_username(), 'create', 'master_orders', customer_name, before_json={}, after_json={'customer_name': customer_name, 'items': items})
    yx_v35_safe_side_effect('notify_master_orders', notify_sync_event, kind='refresh', module='master_order', message='總單已更新', extra={'customer_name': customer_name, 'count': len(items)})
    payload = yx_v35_safe_response_payload(customer_name)
    exact = yx_v35_safe_side_effect('exact_master_orders', yx_v21_exact_customer_rows, 'master_orders', customer_name) or []
    try:
        rows = get_master_orders()
    except Exception:
        rows = []
    return jsonify(success=True, items=rows, exact_customer_items=exact, **payload)

@app.route("/api/ship", methods=["POST"])
@login_required_json
def api_ship():
    try:
        data = request.get_json(silent=True) or {}
        if not request_key_from_payload(data, endpoint='/api/ship'):
            return duplicate_success('相同出貨送出已忽略', **duplicate_current_payload('/api/ship', data))
        items = _parse_items_from_request(data)
        if not items:
            return error_response("請輸入商品資料")
        customer_name = (data.get("customer_name") or "").strip()
        if not customer_name:
            return error_response("請輸入客戶名稱")
        yx_v35_safe_side_effect('ship_upsert_customer', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region')))
        allow_inventory_fallback = bool(data.get("allow_inventory_fallback"))
        result = ship_order(customer_name, items, current_username(), allow_inventory_fallback=allow_inventory_fallback)
        if result.get("success"):
            yx_v35_safe_side_effect('ship_log', log_action, current_username(), "完成出貨")
            yx_v35_safe_side_effect('ship_audit', add_audit_trail, current_username(), 'ship', 'shipping_records', customer_name, before_json={}, after_json={'customer_name': customer_name, 'items': items, 'allow_inventory_fallback': allow_inventory_fallback, 'breakdown': result.get('breakdown', [])})
            yx_v35_safe_side_effect('ship_notify', notify_sync_event, kind='refresh', module='ship', message='出貨已更新', extra={'customer_name': customer_name, 'count': len(items)})
        if isinstance(result, dict) and customer_name and not data.get('skip_snapshot'):
            result.update(yx_v35_safe_response_payload(customer_name))
        return jsonify(result)
    except Exception as e:
        log_error("ship", str(e))
        return error_response("出貨失敗")

@app.route("/api/shipping_records", methods=["GET"])
@login_required_json
def api_shipping_records():
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    q = (request.args.get("q") or '').strip()
    rows = get_shipping_records(start_date=start_date, end_date=end_date, q=q)
    return jsonify(success=True, items=rows, records=rows)

@app.route("/api/ship-preview", methods=["POST"])
@login_required_json
def api_ship_preview():
    try:
        data = request.get_json(silent=True) or {}
        items = _parse_items_from_request(data)
        customer_name = (data.get("customer_name") or "").strip()
        if not customer_name:
            return error_response("請輸入客戶名稱")
        if not items:
            return error_response("沒有可預覽的商品")
        preview = preview_ship_order(customer_name, items)
        if preview.get('master_exceeded'):
            return error_response(preview.get('message') or '超過總單，禁止出貨')
        return jsonify(preview)
    except Exception as e:
        log_error("ship_preview", str(e))
        return error_response("出貨預覽失敗")

@app.route("/api/customers", methods=["GET", "POST"])
@login_required_json
def api_customers():
    try:
        if request.method == "GET":
            return jsonify(success=True, items=get_customers())
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        row, resolved_name, _resolved_uid = resolve_customer_identity(name, (data.get('customer_uid') or '').strip(), include_archived=True)
        name = name or resolved_name
        if resolved_name and resolved_name != name and not (data.get('force_new') or False):
            name = resolved_name
        if not name:
            return error_response("請輸入客戶名稱")
        item = upsert_customer(
            name,
            phone=(data.get("phone") or "").strip(),
            address=(data.get("address") or "").strip(),
            notes=(data.get("notes") or "").strip(),
            common_materials=(data.get("common_materials") or "").strip(),
            common_sizes=(data.get("common_sizes") or "").strip(),
            region=resolve_customer_region(name, data.get("region")),
            preserve_existing=bool(data.get('preserve_existing', True))
        )
        log_action(current_username(), f"儲存客戶 {name}")
        add_audit_trail(current_username(), 'upsert', 'customer_profiles', name, before_json=row or {}, after_json=data)
        notify_sync_event(kind='refresh', module='customers', message=f'客戶已更新：{name}', extra={'customer_name': name})
        return jsonify(success=True, items=get_customers(), item=item)
    except Exception as e:
        log_error("customers", str(e))
        return error_response("客戶儲存失敗")


@app.route("/api/customers/ensure", methods=["POST"])
@login_required_json
def api_customers_ensure():
    try:
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or data.get('customer_name') or '').strip()
        region = resolve_customer_region(name, data.get('region') or '北區')
        if not name:
            return error_response('請輸入客戶名稱')
        item = upsert_customer(name, region=region, preserve_existing=bool(data.get('preserve_existing', True)))
        notify_sync_event(kind='refresh', module='customers', message=f'客戶已確實寫入：{name}', extra={'customer_name': name, 'region': item.get('region') if isinstance(item, dict) else region})
        return jsonify(success=True, item=item, items=get_customers())
    except Exception as e:
        log_error('customers_ensure', str(e))
        return error_response('客戶確實寫入失敗')


@app.route("/api/recover/customers-from-relations", methods=["POST", "GET"])
@login_required_json
def api_recover_customers_from_relations():
    """FIX122：手動救援入口。從目前資料庫的商品/出貨紀錄補回缺少的客戶檔與 UID。"""
    result = recover_customer_profiles_from_relation_tables()
    if not result.get('success'):
        return error_response(result.get('error') or '客戶救援失敗')
    log_action(current_username(), f"FIX122 客戶救援：補回 {result.get('recovered_count', 0)} 位客戶，對齊 {result.get('synced_rows', 0)} 筆")
    notify_sync_event(kind='refresh', module='all', message='客戶資料已救援並重新整理', extra=result)
    return jsonify(result)


@app.route("/api/customers/archived", methods=["GET"])
@login_required_json
def api_customers_archived():
    try:
        items = [c for c in get_customers(active_only=False) if int(c.get('is_archived') or 0) == 1]
        return jsonify(success=True, items=items)
    except Exception as e:
        log_error("customers_archived", str(e))
        return error_response("封存客戶讀取失敗")

@app.route("/api/customers/<name>/restore", methods=["POST"])
@login_required_json
def api_customer_restore(name):
    try:
        data = request.get_json(silent=True) or {}
        row, resolved_name, _resolved_uid = resolve_customer_identity(name, data.get('customer_uid') or request.args.get('customer_uid') or '', include_archived=True)
        target_name = resolved_name or name
        item = restore_customer(target_name)
        log_action(current_username(), f"復原客戶 {target_name}")
        add_audit_trail(current_username(), 'restore', 'customer_profiles', target_name, before_json={'name': target_name}, after_json={'name': target_name, 'restored': True})
        notify_sync_event(kind='refresh', module='customers', message=f'客戶已復原：{target_name}', extra={'customer_name': target_name})
        return jsonify(success=True, item=item, items=get_customers())
    except Exception as e:
        log_error("restore_customer", str(e))
        return error_response(f"客戶復原失敗：{str(e)}")

@app.route("/api/customers/move", methods=["POST"])
@login_required_json
def api_customers_move():
    try:
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        region = (data.get("region") or "").strip()
        if region not in ["北區", "中區", "南區"]:
            return error_response("缺少客戶或區域")
        row, resolved_name, _resolved_uid = resolve_customer_identity(name, data.get('customer_uid') or '', include_archived=True)
        name = resolved_name or name
        if not name:
            return error_response("缺少客戶名稱")
        # v18：客戶可能是從訂單/總單關聯表產生的 virtual customer，customer_profiles 尚未有實體列。
        # 移動區域時必須先把它確實寫入 customer_profiles，不能只做前端暫存。
        if not row:
            item = upsert_customer(name, region=region, preserve_existing=True)
            before_region = ''
        else:
            before_region = (row.get("region") or "").strip()
            item = upsert_customer(name, phone=(row.get("phone") or "").strip(), address=(row.get("address") or "").strip(), notes=(row.get("notes") or "").strip(), common_materials=(row.get("common_materials") or "").strip(), common_sizes=(row.get("common_sizes") or "").strip(), region=region, preserve_existing=False)
        yx_v35_safe_side_effect('customer_move_log', log_action, current_username(), f"移動客戶 {name} 到 {region}")
        yx_v35_safe_side_effect('customer_move_audit', add_audit_trail, current_username(), 'move', 'customer_profiles', name, before_json=(row or {'name': name, 'region': before_region}), after_json={'name': name, 'region': region})
        yx_v35_safe_side_effect('customer_move_notify', notify_sync_event, kind="refresh", module="customers", message=f"客戶已移動：{name} -> {region}", extra={"customer_name": name, "region": region})
        return jsonify(success=True, items=get_customers(), item=item)
    except Exception as e:
        log_error("move_customer", str(e))
        return error_response("移動客戶失敗")


@app.route("/api/customers/<name>", methods=["GET", "DELETE", "PUT"])
@login_required_json
def api_customer_detail(name):
    if request.method == "PUT":
        try:
            data = request.get_json(silent=True) or {}
            new_name = (data.get("new_name") or "").strip()
            if not new_name:
                return error_response("請輸入新的客戶名稱")
            source, resolved_name, _resolved_uid = resolve_customer_identity(name, (data.get('customer_uid') or '').strip(), include_archived=True)
            name = resolved_name or name
            if not source:
                return error_response("找不到原客戶資料")
            if new_name == name:
                return jsonify(success=True, item=source, counts=get_customer_relation_counts(name))
            existed = get_customer(new_name, include_archived=True)
            if existed:
                return error_response("新的客戶名稱已存在，請換一個名稱")
            conn = get_db()
            cur = conn.cursor()
            try:
                cur.execute(sql("UPDATE customer_profiles SET name = ?, updated_at = ? WHERE name = ?"), (new_name, now(), name))
                cur.execute(sql("UPDATE inventory SET customer_name = ?, customer_uid = ?, updated_at = ? WHERE customer_name = ?"), (new_name, source.get('customer_uid') or '', now(), name))
                cur.execute(sql("UPDATE orders SET customer_name = ?, customer_uid = ?, updated_at = ? WHERE customer_name = ?"), (new_name, source.get('customer_uid') or '', now(), name))
                cur.execute(sql("UPDATE master_orders SET customer_name = ?, customer_uid = ?, updated_at = ? WHERE customer_name = ?"), (new_name, source.get('customer_uid') or '', now(), name))
                cur.execute(sql("UPDATE shipping_records SET customer_name = ?, customer_uid = ? WHERE customer_name = ?"), (new_name, source.get('customer_uid') or '', name))
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()
            item = get_customer(new_name, include_archived=True)
            log_action(current_username(), f"修改客戶名稱 {name} -> {new_name}")
            add_audit_trail(current_username(), 'rename', 'customer_profiles', name, before_json={'name': name}, after_json={'name': new_name})
            notify_sync_event(kind="refresh", module="customers", message=f"客戶已改名：{name} -> {new_name}", extra={"customer_name": new_name})
            return jsonify(success=True, item=item, counts=get_customer_relation_counts(new_name))
        except Exception as e:
            log_error("rename_customer", str(e))
            return error_response(f"客戶名稱更新失敗：{str(e)}")
    if request.method == "DELETE":
        try:
            data = request.get_json(silent=True) or {}
            _row, resolved_name, _resolved_uid = resolve_customer_identity(name, data.get('customer_uid') or request.args.get('customer_uid') or '', include_archived=True)
            name = resolved_name or name
            result = delete_customer(name)
            mode = result.get('mode') or 'deleted'
            counts = result.get('counts') or {}
            log_action(current_username(), f"{'封存' if mode == 'archived' else '刪除'}客戶 {name}")
            add_audit_trail(current_username(), 'delete' if mode == 'deleted' else 'archive', 'customer_profiles', name, before_json=result.get('item') or {}, after_json={'mode': mode, 'counts': counts})
            notify_sync_event(kind='refresh', module='customers', message=f"客戶已{'封存' if mode == 'archived' else '刪除'}：{name}", extra={'customer_name': name, 'mode': mode})
            message = '客戶已刪除' if mode == 'deleted' else '客戶已有關聯資料，已改為封存保留歷史資料'
            return jsonify(success=True, mode=mode, counts=counts, message=message)
        except Exception as e:
            log_error("delete_customer", str(e))
            return error_response(f"客戶刪除失敗：{str(e)}")
    row, resolved_name, _resolved_uid = resolve_customer_identity(name, request.args.get('customer_uid') or '', include_archived=True)
    name = resolved_name or name
    if not row:
        return error_response("找不到客戶", 404)
    return jsonify(success=True, item=row, counts=get_customer_relation_counts(name))

@app.route("/api/warehouse", methods=["GET"])
@login_required_json
def api_warehouse():
    try:
        return jsonify(success=True, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error("api_warehouse", str(e))
        return jsonify(success=True, zones={"A": {}, "B": {}}, cells=[])


@app.route("/api/warehouse/cell", methods=["POST"])
@login_required_json
def api_warehouse_cell():
    data = request.get_json(silent=True) or {}
    try:
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        slot_type = 'direct'
        slot_number = int(data.get("slot_number") or 0)
        if zone not in ("A", "B") or column_index < 1 or column_index > 6 or slot_number < 1:
            return error_response("格位參數錯誤")
        existing_cells = warehouse_get_cells()
        previous_cell = next((c for c in existing_cells if str(c.get('zone')) == zone and int(c.get('column_index') or 0) == column_index and int(c.get('slot_number') or 0) == slot_number), {})
        if not previous_cell:
            same_col = [c for c in existing_cells if str(c.get('zone')) == zone and int(c.get('column_index') or 0) == column_index]
            max_slot = max([int(c.get('slot_number') or 0) for c in same_col] or [0])
            if max_slot and slot_number > max_slot + 1:
                return error_response("格位不存在，請先在格子內點「插入格子」")
        items = normalize_warehouse_payload_items(data.get("items") or [])
        ok, msg = validate_warehouse_cell_quantities(zone, column_index, slot_number, items)
        if not ok:
            return error_response(msg)
        note = data.get("note") or ""
        warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note)
        saved_after = next((c for c in warehouse_get_cells() if str(c.get('zone')) == zone and int(c.get('column_index') or 0) == column_index and int(c.get('slot_number') or 0) == slot_number), None)
        if not saved_after:
            return error_response("格位沒有確實寫入資料庫")
        try:
            saved_items = json.loads(saved_after.get('items_json') or '[]')
        except Exception:
            saved_items = []
        if len(saved_items or []) != len(items or []):
            return error_response("格位寫入後讀回數量不一致，請再儲存一次")
    except Exception as e:
        log_error("warehouse_cell_main_save_v40", str(e))
        return error_response("格位更新失敗")
    # Side effects must not make saved cell look failed.
    if items:
        top_customer = next((it.get('customer_name') for it in items if it.get('customer_name')), '')
        yx_v35_safe_side_effect('warehouse_recent_slot', record_recent_slot, current_username(), top_customer, zone, column_index, slot_number)
    yx_v35_safe_side_effect('warehouse_log', log_action, current_username(), f"更新倉庫格位 {zone}{column_index}-{slot_type}-{slot_number}")
    yx_v35_safe_side_effect('warehouse_audit', add_audit_trail, current_username(), 'upsert', 'warehouse_cells', f'{zone}-{column_index}-{slot_number}', before_json={'items_json': previous_cell.get('items_json'), 'note': previous_cell.get('note')}, after_json={'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'items': items, 'note': note})
    yx_v35_safe_side_effect('warehouse_notify', notify_sync_event, kind='refresh', module='warehouse', message='倉庫格位已更新', extra={'zone': zone, 'column_index': column_index, 'slot_number': slot_number})
    try:
        return jsonify(success=True, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error('warehouse_cell_response_v40', str(e))
        return jsonify(success=True, zones={"A": {}, "B": {}}, cells=[])

@app.route("/api/warehouse/move", methods=["POST"])
@login_required_json
def api_warehouse_move():
    try:
        data = request.get_json(silent=True) or {}
        from_key = data.get("from_key")
        to_key = data.get("to_key")
        product_text = format_product_text_height2(data.get("product_text"))
        customer_name = (data.get("customer_name") or "").strip()
        placement_label = (data.get("placement_label") or data.get("layer_label") or "前排").strip() or "前排"
        qty = int(data.get("qty", 1))
        if not (from_key and to_key and product_text):
            return error_response("缺少參數")
        result = warehouse_move_item(tuple(from_key), tuple(to_key), product_text, qty, customer_name=customer_name, placement_label=placement_label)
        if result.get("success"):
            log_action(current_username(), f"拖曳商品 {product_text}")
            try:
                to_slot = int(to_key[3] if len(to_key) >= 4 else to_key[2])
                record_recent_slot(current_username(), customer_name, to_key[0], int(to_key[1]), to_slot)
            except Exception:
                pass
            add_audit_trail(current_username(), 'move', 'warehouse_cells', product_text, before_json={'from_key': from_key, 'customer_name': customer_name}, after_json={'to_key': to_key, 'qty': qty, 'product_text': product_text, 'customer_name': customer_name, 'placement_label': placement_label})
            notify_sync_event(kind='refresh', module='warehouse', message='倉庫位置已移動', extra={'product_text': product_text, 'qty': qty, 'customer_name': customer_name})
        return jsonify(result)
    except Exception as e:
        log_error("warehouse_move", str(e))
        return error_response("拖曳失敗")

@app.route("/api/warehouse/add-column", methods=["POST"])
@login_required_json
def api_warehouse_add_column():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get("zone") or "A").strip().upper()
        if zone not in ("A", "B"):
            return error_response("區域錯誤")
        column_index = warehouse_add_column(zone)
        log_action(current_username(), f"新增格子欄 {zone}{column_index}")
        add_audit_trail(current_username(), 'create', 'warehouse_cells', f'{zone}-{column_index}', before_json={}, after_json={'zone': zone, 'column_index': column_index, 'action': '新增欄位'})
        notify_sync_event(kind='refresh', module='warehouse', message='倉庫新增欄位', extra={'zone': zone, 'column_index': column_index})
        return jsonify(success=True, column_index=column_index, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error("warehouse_add_column", str(e))
        return error_response("新增格子失敗")

@app.route("/api/warehouse/search")
@login_required_json
def api_warehouse_search():
    q = (request.args.get("q") or "").strip()
    cells = warehouse_get_cells()
    matched = []
    for cell in cells:
        try:
            items = json.loads(cell.get("items_json") or "[]")
        except Exception:
            items = []
        for it in items:
            hay = f"{cell['zone']} {cell['column_index']} {cell['slot_type']} {cell['slot_number']} {it.get('product_text','')} {it.get('customer_name','')}"
            if not q or q.lower() in hay.lower():
                matched.append({"cell": cell, "item": it})
                break
    return jsonify(success=True, items=matched)

@app.route("/api/warehouse/available-items", methods=["GET"])
@login_required_json
def api_warehouse_available_items():
    """列出尚未放入倉庫圖的商品；V48 支援 A/B/未分區統計、來源與支數分開。"""
    try:
        zone_filter = (request.args.get("zone") or "").strip().upper()
        if zone_filter not in ("A", "B"):
            zone_filter = ""
        source_totals, source_details = warehouse_source_totals()
        placed_all = warehouse_placed_totals()
        placed_detail = {}
        placed_detail_by_zone = {}
        for cell in warehouse_get_cells():
            cell_zone = str(cell.get('zone') or '').strip().upper()
            try:
                items_in_cell = json.loads(cell.get("items_json") or "[]")
            except Exception:
                items_in_cell = []
            for it in items_in_cell:
                product = it.get('product_text') or it.get('product') or ''
                exact = warehouse_item_exact_key(product)
                customer = warehouse_customer_key(it.get('customer_name') or '')
                source_label = (it.get('source_table') or it.get('source') or '').strip()
                source_label = {'master_orders': '總單', 'master_order': '總單', 'orders': '訂單', 'order': '訂單', 'inventory': '庫存', 'stock': '庫存'}.get(source_label, source_label)
                if not source_label:
                    source_label = '庫存'
                source_id = str(it.get('source_id') or it.get('id') or '').strip()
                try:
                    q = int(it.get('qty') or 0)
                except Exception:
                    q = 0
                if exact and q > 0:
                    dkey = (exact, customer, source_label, source_id)
                    placed_detail[dkey] = placed_detail.get(dkey, 0) + q
                    placed_detail_by_zone[(exact, customer, source_label, source_id, cell_zone)] = placed_detail_by_zone.get((exact, customer, source_label, source_id, cell_zone), 0) + q
        items = []
        zone_summary = {'A': 0, 'B': 0, 'unassigned': 0, 'total': 0}
        for detail_key, details_all in source_details.items():
            exact, customer, source_label, source_id = detail_key
            details_for_item_all = details_all
            if zone_filter:
                # V49 mainfile: A/B 格位的下拉選單要同時顯示該區商品 + 尚未分 A/B 區商品；
                # 已放入任一格的數量仍用全倉扣除，避免別的格子又看得到同一筆。
                details_for_item = [d for d in details_for_item_all if (str(d.get('zone') or '').strip().upper().startswith(zone_filter) or not str(d.get('zone') or '').strip())]
                total_qty = sum(int(d.get('qty') or 0) for d in details_for_item)
                placed_qty = int(placed_detail.get((exact, customer, source_label, str(source_id)), 0) or 0)
                if placed_qty <= 0:
                    placed_qty = int(placed_all.get((exact, customer), 0) or 0)
            else:
                details_for_item = details_for_item_all
                total_qty = sum(int(d.get('qty') or 0) for d in details_for_item)
                placed_qty = int(placed_detail.get((exact, customer, source_label, str(source_id)), 0) or 0)
                # 若舊格位沒有 source_id/source，只能用 exact 總量扣掉，避免舊資料重複出現在下拉。
                if placed_qty <= 0:
                    placed_qty = int(placed_all.get((exact, customer), 0) or 0)
            unplaced_qty = max(0, int(total_qty or 0) - placed_qty)
            if not zone_filter:
                row_zone = (details_for_item_all[0].get('zone') if details_for_item_all else '') or ''
                z = str(row_zone).strip().upper()
                if z.startswith('A'):
                    zone_summary['A'] += unplaced_qty
                elif z.startswith('B'):
                    zone_summary['B'] += unplaced_qty
                else:
                    zone_summary['unassigned'] += unplaced_qty
                zone_summary['total'] += unplaced_qty
            if unplaced_qty <= 0:
                continue
            first = details_for_item[0] if details_for_item else (details_for_item_all[0] if details_for_item_all else {})
            product = first.get('product_text') or exact
            size = first.get('product_size') or warehouse_item_size_key(product)
            support = first.get('support_text') or warehouse_support_text(product)
            material = first.get('material') or first.get('product_code') or ''
            items.append({
                'product_text': product,
                'product': product,
                'product_size': size,
                'support_text': support,
                'exact_key': exact,
                'customer_name': customer,
                'material': material,
                'product_code': material,
                'total_qty': int(total_qty or 0),
                'placed_qty': placed_qty,
                'unplaced_qty': unplaced_qty,
                'qty': unplaced_qty,
                'zone': zone_filter or (first.get('zone') or ''),
                'source': source_label,
                'source_table': source_label,
                'source_id': str(source_id),
                'source_qty': {source_label: int(total_qty or 0)},
                'sources': [{'source': source_label, 'qty': int(total_qty or 0)}],
                'source_details': details_for_item,
                'source_summary': f"{source_label}{int(total_qty or 0)}",
                'needs_red': True,
            })
        items.sort(key=lambda r: (r.get('zone') or '', r.get('customer_name') or '庫存', r.get('material') or '', product_sort_tuple(r.get('product_text') or '')))
        return jsonify(success=True, items=items, zone=zone_filter, zone_summary=zone_summary)
    except Exception as e:
        log_error("api_warehouse_available_items", str(e))
        return jsonify(success=True, items=[], zone_summary={'A': 0, 'B': 0, 'unassigned': 0, 'total': 0})


@app.route("/api/customer-items", methods=["GET"])
@login_required_json
def api_customer_items():
    """FIX53：客戶商品直接用 SQL 篩選，不再整表載入後 Python 過濾。"""
    name = (request.args.get("name") or "").strip()
    uid = (request.args.get("customer_uid") or "").strip()
    row, resolved_name, resolved_uid = resolve_customer_identity(name, uid, include_archived=True)
    name = resolved_name or name
    uid = resolved_uid or uid or ((row or {}).get('customer_uid') or '')
    items = []
    if not name and not uid:
        return jsonify(success=True, items=[])

    conn = get_db()
    cur = conn.cursor()
    try:
        # FIX142：點客戶必須即時顯示。前端若已從客戶母版拿到 merge_names，
        # 直接帶 variants 避免每次點擊又掃四張資料表找同名變體。
        raw_variants = (request.args.get('variants') or '').strip()
        variants = []
        if raw_variants:
            try:
                decoded = json.loads(raw_variants)
                if isinstance(decoded, list):
                    variants = [(x or '').strip() for x in decoded if (x or '').strip()]
            except Exception:
                variants = [(x or '').strip() for x in re.split(r'[|,\n]+', raw_variants) if (x or '').strip()]
            if name and name not in variants:
                variants.insert(0, name)
        elif (request.args.get('fast') or '') == '1':
            variants = [name] if name else []
        else:
            variants = customer_merge_variants(cur, name) if name else []
        def pull(table, source_label):
            where_parts = []
            params = []
            if uid:
                where_parts.append("customer_uid = ?")
                params.append(uid)
            if variants:
                where_parts.append("customer_name IN (" + ",".join(["?"] * len(variants)) + ")")
                params.extend(variants)
            elif name:
                where_parts.append("customer_name = ?")
                params.append(name)
            if not where_parts:
                return
            cur.execute(sql(f"SELECT * FROM {table} WHERE " + " OR ".join(where_parts) + " ORDER BY id DESC"), tuple(params))
            for r in rows_to_dict(cur):
                r['source'] = source_label
                items.append(r)
        pull('orders', '訂單')
        pull('master_orders', '總單')
        pull('inventory', '庫存')
    finally:
        conn.close()
    aggregated = aggregate_customer_items(items)
    for _it in aggregated:
        _it['deduct_source_label'] = customer_item_deduct_source_label(_it.get('source') or _it.get('source_label') or _it.get('source_preference'))
    return jsonify(success=True, items=aggregated)


@app.route("/api/customer-item", methods=["POST", "DELETE"])
@login_required_json
def api_customer_item_modify():
    try:
        data = request.get_json(silent=True) or {}
        source = (data.get("source") or "").strip()
        item_id = int(data.get("id") or 0)
        if not source or not item_id:
            return error_response("缺少商品參數")
        if request.method == "DELETE":
            delete_customer_item(source, item_id)
            log_action(current_username(), f"刪除客戶商品 {source}#{item_id}")
            notify_sync_event(kind='refresh', module='customers', message='客戶商品已刪除', extra={'source': source, 'id': item_id})
            return jsonify(success=True)
        product_text = format_product_text_height2((data.get("product_text") or "").strip())
        qty = normalize_item_quantity(product_text, 1)
        if not product_text:
            return error_response("請輸入商品資料")
        material = data.get("material") if "material" in data else None
        update_customer_item(source, item_id, product_text, qty, current_username(), material=material)
        log_action(current_username(), f"更新客戶商品 {source}#{item_id}")
        notify_sync_event(kind='refresh', module='customers', message='客戶商品已更新', extra={'source': source, 'id': item_id})
        return jsonify(success=True)
    except Exception as e:
        log_error("customer_item_modify", str(e))
        return error_response("客戶商品修改失敗")


@app.route("/api/customer-items/batch-material", methods=["POST"])
@login_required_json
def api_customer_items_batch_material():
    try:
        data = request.get_json(silent=True) or {}
        material = (data.get("material") or "").strip().upper()
        items = data.get("items") or []
        if not material:
            return error_response("請選擇材質")
        if not items:
            return error_response("請先勾選要套用材質的商品")
        # FIX137：批量材質要先記錄每筆變更前資料，才可以「還原上一步」。
        source_map = {'inventory':'inventory', '庫存':'inventory', 'orders':'orders', '訂單':'orders', 'master_order':'master_orders', 'master_orders':'master_orders', '總單':'master_orders'}
        before_by_entity = {}
        try:
            conn0 = get_db(); cur0 = conn0.cursor()
            for it in items:
                entity = source_map.get((it.get('source') or '').strip())
                item_id = int(it.get('id') or 0)
                if not entity or item_id <= 0:
                    continue
                cur0.execute(sql(f"SELECT * FROM {entity} WHERE id = ?"), (item_id,))
                row0 = fetchone_dict(cur0)
                if row0:
                    before_by_entity.setdefault(entity, []).append({'source': it.get('source') or entity, 'table': entity, 'id': item_id, 'row': row0})
            conn0.close()
        except Exception as e:
            try: conn0.close()
            except Exception: pass
            log_error('batch_material_snapshot_fix137', str(e))
        count = update_items_material(items, material, current_username())
        # FIX113/FIX137：批量材質屬於庫存 / 訂單 / 總單實際變更，並保留 before_json 供還原。
        grouped_sources = {}
        for it in items:
            entity = source_map.get((it.get('source') or '').strip())
            if entity:
                grouped_sources.setdefault(entity, []).append(it)
        for entity, source_items in grouped_sources.items():
            add_audit_trail(current_username(), 'update', entity, 'batch_material', before_json=before_by_entity.get(entity, []), after_json={'material': material, 'count': len(source_items), 'items': source_items})
        if not grouped_sources:
            add_audit_trail(current_username(), 'update', 'customer_items', 'batch_material', before_json=before_by_entity, after_json={'material': material, 'count': count, 'items': items})
        log_action(current_username(), f"批量套用材質 {material}，共 {count} 筆")
        notify_sync_event(kind='refresh', module='all', message='材質已批量更新', extra={'material': material, 'count': count})
        return jsonify(success=True, count=count, material=material, snapshots=yx_v22_product_snapshots(), customers=get_customers())
    except Exception as e:
        log_error("customer_items_batch_material", str(e))
        return error_response(str(e) or "批量材質更新失敗")



@app.route("/api/customer-items/batch-zone", methods=["POST"])
@login_required_json
def api_customer_items_batch_zone():
    """FIX132：庫存 / 訂單 / 總單共用 A/B 區批量標記。
    只更新商品列的 location 欄位，不會刪除或搬動數量；實際倉庫格位仍由倉庫圖管理。
    """
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get("zone") or "").strip().upper()
        if zone not in ("A", "B"):
            return error_response("請選擇 A 區或 B 區")
        items = data.get("items") or []
        if not items:
            return error_response("請先勾選要移動的商品")
        table_map = {
            "庫存": "inventory", "inventory": "inventory",
            "訂單": "orders", "orders": "orders",
            "總單": "master_orders", "master_order": "master_orders", "master_orders": "master_orders",
        }
        conn = get_db(); cur = conn.cursor()
        count = 0; touched = []
        try:
            for it in items:
                source = (it.get("source") or "").strip()
                table = table_map.get(source)
                item_id = int(it.get("id") or 0)
                if not table or item_id <= 0:
                    continue
                cur.execute(sql(f"SELECT * FROM {table} WHERE id = ?"), (item_id,))
                row_before = fetchone_dict(cur)
                if row_before:
                    touched.append({'source': source, 'table': table, 'id': item_id, 'row': row_before})
                try:
                    cur.execute(sql(f"UPDATE {table} SET location = ?, operator = ?, updated_at = ? WHERE id = ?"), (zone, current_username(), now(), item_id))
                except Exception:
                    # 舊資料表尚未補 location 欄位時，補完再重試。
                    try:
                        cur.execute(f"ALTER TABLE {table} ADD COLUMN location TEXT")
                        cur.execute(sql(f"UPDATE {table} SET location = ?, operator = ?, updated_at = ? WHERE id = ?"), (zone, current_username(), now(), item_id))
                    except Exception:
                        cur.execute(sql(f"UPDATE {table} SET updated_at = ? WHERE id = ?"), (now(), item_id))
                if cur.rowcount:
                    count += 1
            conn.commit()
        except Exception:
            conn.rollback(); raise
        finally:
            conn.close()
        yx_v35_safe_side_effect('batch_zone_audit', add_audit_trail, current_username(), "move", "customer_items", "batch_zone", before_json=touched, after_json={"zone": zone, "count": count, "items": [{"source": x.get("source"), "id": x.get("id"), "zone": zone} for x in touched]})
        yx_v35_safe_side_effect('batch_zone_log', log_action, current_username(), f"批量移到 {zone} 區，共 {count} 筆")
        yx_v35_safe_side_effect('batch_zone_notify', notify_sync_event, kind="refresh", module="all", message=f"商品已批量移到 {zone} 區", extra={"zone": zone, "count": count})
        return jsonify(success=True, count=count, zone=zone, snapshots=yx_v22_product_snapshots(), customers=get_customers())
    except Exception as e:
        log_error("customer_items_batch_zone", str(e))
        return error_response(str(e) or "批量移動 A/B 區失敗")


@app.route("/api/customer-items/batch-delete", methods=["POST"])
@login_required_json
def api_customer_items_batch_delete():
    """FIX56：庫存 / 訂單 / 總單共用批量刪除。"""
    try:
        data = request.get_json(silent=True) or {}
        items = data.get("items") or []
        if not items:
            return error_response("請先勾選要刪除的商品")
        table_map = {
            "庫存": "inventory", "inventory": "inventory",
            "訂單": "orders", "orders": "orders",
            "總單": "master_orders", "master_order": "master_orders", "master_orders": "master_orders",
        }
        conn = get_db()
        cur = conn.cursor()
        deleted = 0
        before_items = []
        try:
            for it in items:
                source = (it.get("source") or "").strip()
                table = table_map.get(source)
                item_id = int(it.get("id") or 0)
                if not table or item_id <= 0:
                    continue
                cur.execute(sql(f"SELECT * FROM {table} WHERE id = ?"), (item_id,))
                row = fetchone_dict(cur)
                if not row:
                    continue
                before_items.append({"source": source, "table": table, "id": item_id, "row": row})
                cur.execute(sql(f"DELETE FROM {table} WHERE id = ?"), (item_id,))
                deleted += cur.rowcount or 0
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        # FIX113：批量刪除依實際資料表寫入差異紀錄，避免顯示 customer_items。
        grouped_sources = {}
        for before in before_items:
            entity = before.get('table')
            if entity in ('inventory', 'orders', 'master_orders'):
                grouped_sources.setdefault(entity, []).append(before)
        for entity, rows in grouped_sources.items():
            add_audit_trail(current_username(), "delete", entity, "batch_delete", before_json=rows, after_json={"count": len(rows)})
        if not grouped_sources:
            add_audit_trail(current_username(), "delete", "customer_items", "batch_delete", before_json=before_items, after_json={"count": deleted})
        log_action(current_username(), f"批量刪除商品，共 {deleted} 筆")
        notify_sync_event(kind="refresh", module="all", message="商品已批量刪除", extra={"count": deleted})
        return jsonify(success=True, count=deleted, snapshots=yx_v22_product_snapshots(), customers=get_customers())
    except Exception as e:
        log_error("customer_items_batch_delete", str(e))
        return error_response(str(e) or "批量刪除失敗")


@app.route("/api/customer-items/batch-update", methods=["POST"])
@login_required_json
def api_customer_items_batch_update():
    """v15：庫存 / 訂單 / 總單批量編輯單次 API。
    前端一次送出多筆 rows，後端在同一個 transaction 內更新，避免逐筆等待 HTTP API。
    """
    try:
        data = request.get_json(silent=True) or {}
        rows = data.get("items") or data.get("rows") or []
        if not rows:
            return error_response("沒有可儲存的批量編輯資料")
        table_map = {
            "庫存": "inventory", "inventory": "inventory",
            "訂單": "orders", "orders": "orders",
            "總單": "master_orders", "master_order": "master_orders", "master_orders": "master_orders",
        }
        conn = get_db(); cur = conn.cursor()
        before_items = []
        updated = 0
        changed = []
        ts = now()
        try:
            for it in rows:
                source = (it.get("source") or "").strip()
                table = table_map.get(source)
                item_id = int(it.get("id") or 0)
                if not table or item_id <= 0:
                    continue
                cur.execute(sql(f"SELECT * FROM {table} WHERE id = ?"), (item_id,))
                before = fetchone_dict(cur)
                if not before:
                    continue
                before_items.append({"source": source, "table": table, "id": item_id, "row": before})
                product_text = format_product_text_height2((it.get("product_text") or before.get("product_text") or "").strip())
                if not product_text:
                    continue
                qty = int(it.get("qty") if it.get("qty") is not None else before.get("qty") or 0)
                if qty < 0:
                    qty = 0
                material = clean_material_value(it.get("material") if it.get("material") is not None else (before.get("material") or before.get("product_code") or ""), product_text)
                month_tag = product_month_tag(product_text)
                product_code = material or product_text
                customer_name = (it.get("customer_name") if it.get("customer_name") is not None else before.get("customer_name") or "").strip()
                location = (it.get("location") if it.get("location") is not None else before.get("location") or "").strip()
                if table == "inventory":
                    cur.execute(sql("""
                        UPDATE inventory
                        SET product_text = ?, product_code = ?, material = ?, month_tag = ?, qty = ?, location = ?, customer_name = ?, operator = ?, updated_at = ?
                        WHERE id = ?
                    """), (product_text, product_code, material, month_tag, qty, location, customer_name, current_username(), ts, item_id))
                else:
                    # orders/master_orders 舊表若還沒 location 欄位，先補欄位後再更新，讓 A/B 區也能單次批量儲存。
                    try:
                        cur.execute(sql(f"""
                            UPDATE {table}
                            SET product_text = ?, product_code = ?, material = ?, month_tag = ?, qty = ?, customer_name = ?, location = ?, operator = ?, updated_at = ?
                            WHERE id = ?
                        """), (product_text, product_code, material, month_tag, qty, customer_name, location, current_username(), ts, item_id))
                    except Exception:
                        try:
                            cur.execute(f"ALTER TABLE {table} ADD COLUMN location TEXT")
                        except Exception:
                            pass
                        try:
                            cur.execute(f"ALTER TABLE {table} ADD COLUMN month_tag TEXT")
                        except Exception:
                            pass
                        cur.execute(sql(f"""
                            UPDATE {table}
                            SET product_text = ?, product_code = ?, material = ?, month_tag = ?, qty = ?, customer_name = ?, location = ?, operator = ?, updated_at = ?
                            WHERE id = ?
                        """), (product_text, product_code, material, month_tag, qty, customer_name, location, current_username(), ts, item_id))
                if cur.rowcount:
                    updated += cur.rowcount or 0
                    changed.append({"source": source, "id": item_id, "product_text": product_text, "material": material, "qty": qty, "customer_name": customer_name, "location": location})
            conn.commit()
        except Exception:
            conn.rollback(); raise
        finally:
            conn.close()
        grouped = {}
        for x in before_items:
            grouped.setdefault(x.get("table") or "customer_items", []).append(x)
        for entity, rows_before in grouped.items():
            add_audit_trail(current_username(), "update", entity, "batch_update", before_json=rows_before, after_json={"count": updated, "items": changed})
        log_action(current_username(), f"批量編輯商品，共 {updated} 筆")
        notify_sync_event(kind="refresh", module="all", message="商品已批量編輯", extra={"count": updated})
        return jsonify(success=True, count=updated, items=changed, snapshots=yx_v22_product_snapshots(), customers=get_customers())
    except Exception as e:
        log_error("customer_items_batch_update", str(e))
        return error_response(str(e) or "批量編輯失敗")

@app.route("/api/backup", methods=["POST", "GET"])
@login_required_json
def api_backup():
    return jsonify(run_daily_backup())

@app.route("/api/backups", methods=["GET"])
@login_required_json
def api_backups():
    return jsonify(list_backups())


@app.route("/api/admin/users", methods=["GET"])
@login_required_json
def api_admin_users():
    """FIX113：管理員名單相容讀取。
    舊資料庫若缺少 is_blocked/role 欄位，不再回 500，先補 schema 再用安全 SQL 讀取。"""
    if current_username() != '陳韋廷':
        return error_response("權限不足", 403)
    try:
        try:
            init_db()
        except Exception as e:
            log_error('admin_users_init_db', str(e))
        return jsonify(success=True, items=list_users())
    except Exception as e:
        log_error('admin_users_list_users', str(e))
        try:
            conn = get_db(); cur = conn.cursor()
            cur.execute(sql("SELECT * FROM users ORDER BY username ASC"))
            raw_rows = rows_to_dict(cur)
            conn.close()
            rows = []
            for r in raw_rows:
                rows.append({
                    'username': r.get('username') or '',
                    'role': r.get('role') or 'user',
                    'is_blocked': int(r.get('is_blocked') or 0),
                    'created_at': r.get('created_at') or '',
                    'updated_at': r.get('updated_at') or '',
                })
            return jsonify(success=True, items=rows, warning='已用相容模式讀取管理員名單')
        except Exception as e2:
            log_error('admin_users_fallback', str(e2))
            return jsonify(success=True, items=[], warning='管理員名單讀取失敗，請重新整理或稍後再試')

@app.route("/api/admin/block", methods=["POST"])
@login_required_json
def api_admin_block():
    if current_username() != '陳韋廷':
        return error_response("權限不足", 403)
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    blocked = bool(data.get('blocked'))
    if not username or username == '陳韋廷':
        return error_response("不可操作此帳號")
    try:
        try:
            init_db()
        except Exception as e:
            log_error('admin_block_init_db', str(e))
        set_user_blocked(username, blocked)
        log_action(current_username(), f"{'封鎖' if blocked else '解除封鎖'}帳號 {username}")
        notify_sync_event(kind='refresh', module='settings', message='帳號黑名單已更新', extra={'username': username, 'blocked': blocked})
        try:
            items = list_users()
        except Exception as e:
            log_error('admin_block_list_users', str(e))
            items = []
        return jsonify(success=True, items=items)
    except Exception as e:
        log_error('admin_block', str(e))
        return error_response('帳號黑名單更新失敗')



@app.route("/api/warehouse/return-unplaced", methods=["POST"])
@login_required_json
def api_warehouse_return_unplaced():
    """FIX75：把某格已放入的商品清回未錄入倉庫圖狀態。

    倉庫圖的「未錄入」是由來源總量 - 已放入格位數量即時計算，
    所以這裡只要清空該格商品，商品就會自動回到尚未添加倉庫圖清單。
    """
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        slot_number = int(data.get("slot_number") or 0)
        if zone not in ("A", "B") or column_index < 1 or column_index > 6 or slot_number < 1:
            return error_response("格位參數錯誤")
        cells = warehouse_get_cells()
        cell = next((c for c in cells if str(c.get('zone')) == zone and int(c.get('column_index') or 0) == column_index and int(c.get('slot_number') or 0) == slot_number), None)
        if not cell:
            return error_response("找不到格位")
        items = safe_cell_items(cell)
        note = cell.get('note') or ''
        warehouse_save_cell(zone, column_index, 'direct', slot_number, [], note)
        log_action(current_username(), f"倉庫格位退回該格 {zone}{column_index}-{slot_number}")
        yx_v35_safe_side_effect('warehouse_return_audit', add_audit_trail, current_username(), 'undo', 'warehouse_cells', f'{zone}-{column_index}-{slot_number}', before_json={'items': items, 'note': note}, after_json={'items': [], 'note': note, 'returned_to_unplaced': True})
        yx_v35_safe_side_effect('warehouse_return_notify', notify_sync_event, kind='refresh', module='warehouse', message='格位商品已回到未錄入倉庫圖', extra={'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'count': len(items)})
        return jsonify(success=True, returned_items=items, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error("warehouse_return_unplaced", str(e))
        return error_response("退回該格失敗")

@app.route("/api/warehouse/add-slot", methods=["POST"])
@login_required_json
def api_warehouse_add_slot():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        if zone not in ("A", "B") or column_index < 1 or column_index > 6:
            return error_response("格位參數錯誤")
        slot_type = 'direct'
        insert_after = data.get("insert_after", None)
        if insert_after is None and data.get("slot_number") not in (None, ""):
            insert_after = max(0, int(data.get("slot_number")) - 1)
        slot_number = warehouse_add_slot(zone, column_index, slot_type, insert_after=insert_after)
        log_action(current_username(), f"新增格子 {zone}{column_index}-{slot_number}")
        add_audit_trail(current_username(), 'create', 'warehouse_cells', f'{zone}-{column_index}-{slot_number}', before_json={}, after_json={'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'insert_after': insert_after, 'action': '新增格子'})
        notify_sync_event(kind='refresh', module='warehouse', message='倉庫新增格子', extra={'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'insert_after': insert_after})
        return jsonify(success=True, slot_number=slot_number, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error("warehouse_add_slot", str(e))
        return error_response("新增格子失敗")

@app.route("/api/warehouse/remove-slot", methods=["POST"])
@login_required_json
def api_warehouse_remove_slot():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        slot_number = int(data.get("slot_number") or 0)
        if zone not in ("A", "B") or column_index < 1 or column_index > 6 or slot_number < 1:
            return error_response("格位參數錯誤")
        slot_type = 'direct'
        result = warehouse_remove_slot(zone, column_index, slot_type, slot_number)
        if not result.get('success'):
            return error_response(result.get('error') or '刪除格子失敗')
        log_action(current_username(), f"刪除格子 {zone}{column_index}-{slot_number}")
        add_audit_trail(current_username(), 'delete', 'warehouse_cells', f'{zone}-{column_index}-{slot_number}', before_json={'zone': zone, 'column_index': column_index, 'slot_number': slot_number}, after_json={'action': '刪除格子'})
        notify_sync_event(kind='refresh', module='warehouse', message='倉庫刪除格子', extra={'zone': zone, 'column_index': column_index, 'slot_number': slot_number})
        return jsonify(success=True, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error("warehouse_remove_slot", str(e))
        return error_response("刪除格子失敗")


@app.route("/api/orders/to-master", methods=["POST"])
@login_required_json
def api_orders_to_master():
    try:
        data = request.get_json(silent=True) or {}
        customer_name = (data.get("customer_name") or "").strip()
        product_text = format_product_text_height2((data.get("product_text") or "").strip())
        product_code = (data.get("product_code") or "").strip()
        qty = int(data.get("qty") or 0)
        if not customer_name or not product_text or qty <= 0:
            return error_response("參數不足")
        upsert_customer(customer_name, region=resolve_customer_region(customer_name, data.get('region')))
        save_master_order(customer_name, [{"product_text": product_text, "product_code": product_code, "qty": qty}], current_username())
        log_action(current_username(), f"訂單加入總單 {customer_name} {product_text}x{qty}")
        notify_sync_event(kind='refresh', module='master_order', message='訂單已加入總單', extra={'customer_name': customer_name, 'product_text': product_text, 'qty': qty})
        return jsonify(success=True, items=get_master_orders())
    except Exception as e:
        log_error("orders_to_master", str(e))
        return error_response("加入總單失敗")


def _today_key():
    return datetime.now().strftime('%Y-%m-%d')

def _aggregate_customer_products(rows):
    out = {}
    for r in rows:
        key = ((r.get('customer_name') or '').strip(), (r.get('product_text') or '').strip())
        out[key] = out.get(key, 0) + int(r.get('qty') or 0)
    return out

def _aggregate_inventory_products(rows):
    out = {}
    for r in rows:
        key = (r.get('product_text') or '').strip()
        out[key] = out.get(key, 0) + int(r.get('qty') or 0)
    return out


def _build_anomalies(inv_rows, order_rows, master_rows):
    anomalies = {
        'negative_inventory': [],
        'orders_over_master': [],
        'master_over_inventory': [],
        'unplaced': [],
        'duplicate_products': [],
        'shipping_deduction': [],
        'ocr_errors': [],
        'blocked_logins': [],
    }
    inv_by_product = _aggregate_inventory_products(inv_rows)
    ord_by_cp = _aggregate_customer_products(order_rows)
    mst_by_cp = _aggregate_customer_products(master_rows)

    for r in inv_rows:
        if int(r.get('qty') or 0) < 0:
            anomalies['negative_inventory'].append({'type':'negative_inventory','message':f"庫存負數：{r.get('product_text')} ({r.get('qty')})",'product_text':r.get('product_text') or ''})
        if int(r.get('unplaced_qty') or 0) > 0:
            anomalies['unplaced'].append({'type':'unplaced','message':f"未錄入倉庫圖：{r.get('product_text')} ({r.get('unplaced_qty')})",'product_text':r.get('product_text') or '', 'qty':int(r.get('unplaced_qty') or 0)})

    for key, oq in ord_by_cp.items():
        mq = int(mst_by_cp.get(key) or 0)
        if oq > mq:
            customer_name, product_text = key
            anomalies['orders_over_master'].append({'type':'orders_over_master','message':f"{customer_name}｜訂單大於總單：{product_text} ({oq}>{mq})",'customer_name':customer_name,'product_text':product_text,'order_qty':oq,'master_qty':mq})

    product_master_total = {}
    for (_, product_text), qty in mst_by_cp.items():
        product_master_total[product_text] = product_master_total.get(product_text, 0) + int(qty or 0)
    for product_text, mq in product_master_total.items():
        iq = int(inv_by_product.get(product_text) or 0)
        if mq > iq:
            anomalies['master_over_inventory'].append({'type':'master_over_inventory','message':f"總單大於庫存：{product_text} ({mq}>{iq})",'product_text':product_text,'master_qty':mq,'inventory_qty':iq})

    def _dups(rows, source_name):
        seen = {}
        for r in rows:
            key = ((r.get('customer_name') or '').strip(), (r.get('product_text') or '').strip())
            if not all(key):
                continue
            seen.setdefault(key, []).append(r)
        for key, vals in seen.items():
            if len(vals) > 1:
                anomalies['duplicate_products'].append({'type':'duplicate_products','message':f"{source_name}重複商品：{key[0]}｜{key[1]}（{len(vals)}筆）",'customer_name':key[0],'product_text':key[1],'source':source_name})
    _dups(order_rows, '訂單')
    _dups(master_rows, '總單')

    try:
        conn = get_db(); cur = conn.cursor(); today = _today_key()
        cur.execute(sql("SELECT customer_name, product_text, note, shipped_at FROM shipping_records WHERE substr(shipped_at,1,10)=? ORDER BY shipped_at DESC"), (today,))
        for r in rows_to_dict(cur):
            note = r.get('note') or ''
            if '補扣' in note:
                anomalies['shipping_deduction'].append({'type':'shipping_deduction','message':f"出貨補扣：{r.get('customer_name')}｜{r.get('product_text')}｜{note}"})
        cur.execute(sql("SELECT source, message, created_at FROM errors WHERE substr(created_at,1,10)=? ORDER BY created_at DESC LIMIT 50"), (today,))
        for r in rows_to_dict(cur):
            src = (r.get('source') or '')
            if 'ocr' in src.lower():
                anomalies['ocr_errors'].append({'type':'ocr_errors','message':f"OCR異常：{src}｜{r.get('message') or ''}"})
        cur.execute(sql("SELECT username, action, created_at FROM logs WHERE substr(created_at,1,10)=? AND action LIKE ? ORDER BY created_at DESC LIMIT 50"), (today, '%黑名單登入攔截%'))
        for r in rows_to_dict(cur):
            anomalies['blocked_logins'].append({'type':'blocked_logins','message':f"黑名單登入異常：{r.get('username') or ''}"})
        conn.close()
    except Exception:
        pass

    return anomalies


def _format_24h(ts):
    """固定回傳 24 小時制 YYYY-MM-DD HH:MM:SS，避免前端或瀏覽器轉成 AM/PM。"""
    raw = str(ts or '').strip()
    if not raw:
        return ''
    try:
        return datetime.fromisoformat(raw.replace('T', ' ')[:19]).strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return raw[:19]


def _today_unplaced_all_sources():
    """FIX80：未錄入倉庫圖要統計 訂單 + 總單 + 庫存 的所有尚未加入數量。"""
    try:
        source_totals, source_details = warehouse_source_totals()
        placed = warehouse_placed_totals()
    except Exception as e:
        log_error('today_unplaced_all_sources', str(e))
        return []
    out = []
    for key, total_qty in source_totals.items():
        size, customer = key
        total_qty = int(total_qty or 0)
        placed_qty = int(placed.get(key, 0) or 0)
        unplaced_qty = max(0, total_qty - placed_qty)
        if unplaced_qty <= 0:
            continue
        source_qty = {}
        product_text = size
        for detail in source_details.get(key, []):
            src = detail.get('source') or '來源'
            source_qty[src] = int(source_qty.get(src, 0) or 0) + int(detail.get('qty') or 0)
            product_text = detail.get('product_text') or product_text
        source_summary = '、'.join(f'{k}{v}' for k, v in source_qty.items())
        label = f"尚未加入倉庫圖：{customer + '｜' if customer else ''}{product_text}｜未錄入 {unplaced_qty} 件"
        if source_summary:
            label += f"｜來源：{source_summary}"
        out.append({
            'type': 'unplaced',
            'message': label,
            'customer_name': customer,
            'product_text': product_text,
            'qty': unplaced_qty,
            'unplaced_qty': unplaced_qty,
            'total_qty': total_qty,
            'placed_qty': placed_qty,
            'source_qty': source_qty,
            'source_summary': source_summary,
        })
    out.sort(key=lambda r: (r.get('customer_name') or '', product_sort_tuple(r.get('product_text') or '')))
    return out


def _today_changes_payload():
    conn = get_db()
    cur = conn.cursor()
    today = _today_key()
    cur.execute(sql("SELECT id, username, action, created_at FROM logs WHERE substr(created_at,1,10)=? ORDER BY created_at DESC LIMIT 200"), (today,))
    logs = rows_to_dict(cur)
    conn.close()

    inbound = []
    outbound = []
    new_orders = []
    for r in logs:
        r['created_at'] = _format_24h(r.get('created_at'))
        action = r.get('action') or ''
        # FIX80：今日異動只顯示「當天進貨 / 出貨 / 新增訂單」。編輯、刪除、客戶、倉庫、OCR、修正不混進來。
        if action == '完成出貨' or action.startswith('完成出貨'):
            outbound.append(r)
        elif action == '建立訂單' or action.startswith('建立訂單'):
            new_orders.append(r)
        elif action == '建立庫存' or action.startswith('建立庫存') or action.startswith('入庫') or action.startswith('進貨'):
            inbound.append(r)

    unplaced = _today_unplaced_all_sources()
    read_at = get_setting('today_changes_read_at', '') or ''
    visible_logs = inbound + outbound + new_orders
    unread_count = len([r for r in visible_logs if not read_at or (r.get('created_at') or '') > read_at])
    unplaced_total_qty = sum(int(x.get('unplaced_qty') or x.get('qty') or 0) for x in unplaced)

    return {
        'summary': {
            'inbound_count': len(inbound),
            'outbound_count': len(outbound),
            'new_order_count': len(new_orders),
            'unplaced_count': unplaced_total_qty,
            'unplaced_row_count': len(unplaced),
            'anomaly_count': 0,
            'unread_count': unread_count,
        },
        'feed': {
            'inbound': inbound[:60],
            'outbound': outbound[:60],
            'new_orders': new_orders[:60],
            'others': [],
        },
        'unplaced_items': unplaced[:200],
        'anomalies': [],
        'anomaly_groups': {'unplaced': unplaced},
        'read_at': read_at,
    }

@app.route('/api/today-changes', methods=['GET'])
@login_required_json
def api_today_changes():
    return jsonify(success=True, **_today_changes_payload())

@app.route('/api/today-changes/read', methods=['POST'])
@login_required_json
def api_today_changes_mark_read():
    try:
        set_setting('today_changes_read_at', now())
        notify_sync_event(kind='refresh', module='today_changes', message='今日異動已讀已更新')
        return jsonify(success=True)
    except Exception as e:
        log_error('today_changes_mark_read', str(e))
        return error_response('清除已讀失敗')

@app.route('/api/today-changes/<int:log_id>', methods=['DELETE'])
@login_required_json
def api_today_change_delete(log_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(sql('DELETE FROM logs WHERE id = ?'), (log_id,))
        conn.commit()
        conn.close()
        notify_sync_event(kind='refresh', module='today_changes', message='今日異動已刪除', extra={'log_id': log_id})
        return jsonify(success=True, **_today_changes_payload())
    except Exception as e:
        log_error('today_change_delete', str(e))
        return error_response('刪除異動失敗')

@app.route('/api/anomalies', methods=['GET'])
@login_required_json
def api_anomalies():
    payload = _today_changes_payload()
    return jsonify(success=True, groups=payload.get('anomaly_groups', {}), items=payload.get('anomalies', []), unplaced_items=payload.get('unplaced_items', []))


@app.route('/api/sync/stream')
@login_required_json
def api_sync_stream():
    def generate():
        last_seen = ''
        while True:
            payload = get_setting(SYNC_SETTINGS_KEY, '') or ''
            if payload and payload != last_seen:
                last_seen = payload
                yield f"data: {payload}\n\n"
            else:
                yield ': keepalive\n\n'
            time.sleep(1.5)
    return Response(stream_with_context(generate()), mimetype='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

@app.route('/api/corrections', methods=['GET', 'POST', 'DELETE'])
@login_required_json
def api_corrections_manage():
    try:
        if request.method == 'GET':
            return jsonify(success=True, items=list_corrections_rows())
        data = request.get_json(silent=True) or {}
        wrong_text = (data.get('wrong_text') or '').strip()
        if request.method == 'DELETE':
            delete_correction(wrong_text)
            notify_sync_event(kind='refresh', module='settings', message='OCR 修正詞已刪除', extra={'wrong_text': wrong_text})
            return jsonify(success=True, items=list_corrections_rows())
        correct_text = (data.get('correct_text') or '').strip()
        if not wrong_text or not correct_text:
            return error_response('請輸入錯字與正確字')
        save_correction(wrong_text, correct_text)
        add_audit_trail(current_username(), 'upsert', 'corrections', wrong_text, before_json={}, after_json={'wrong_text': wrong_text, 'correct_text': correct_text})
        notify_sync_event(kind='refresh', module='settings', message='OCR 修正詞已更新', extra={'wrong_text': wrong_text})
        return jsonify(success=True, items=list_corrections_rows())
    except Exception as e:
        log_error('api_corrections_manage', str(e))
        return error_response('修正詞管理失敗')

@app.route('/api/customer-aliases', methods=['GET', 'POST', 'DELETE'])
@login_required_json
def api_customer_aliases_manage():
    try:
        if request.method == 'GET':
            return jsonify(success=True, items=list_customer_aliases())
        data = request.get_json(silent=True) or {}
        alias = (data.get('alias') or '').strip()
        if request.method == 'DELETE':
            delete_customer_alias(alias)
            notify_sync_event(kind='refresh', module='settings', message='客戶別名已刪除', extra={'alias': alias})
            return jsonify(success=True, items=list_customer_aliases())
        target_name = (data.get('target_name') or '').strip()
        if not alias or not target_name:
            return error_response('請輸入別名與正式客戶名稱')
        save_customer_alias(alias, target_name)
        add_audit_trail(current_username(), 'upsert', 'customer_aliases', alias, before_json={}, after_json={'alias': alias, 'target_name': target_name})
        notify_sync_event(kind='refresh', module='settings', message='客戶別名已更新', extra={'alias': alias})
        return jsonify(success=True, items=list_customer_aliases())
    except Exception as e:
        log_error('api_customer_aliases_manage', str(e))
        return error_response('客戶別名管理失敗')

@app.route('/api/recent-slots', methods=['GET'])
@login_required_json
def api_recent_slots():
    customer_name = (request.args.get('customer_name') or '').strip()
    return jsonify(success=True, items=get_recent_slots(current_username(), customer_name=customer_name, limit=8))


# ==== FIX30：操作紀錄中文化 / 陳韋廷權限 / 批量刪除 ====
def _is_admin_user():
    return current_username() == '陳韋廷'

def _parse_maybe_json(value):
    if isinstance(value, (dict, list)):
        return value
    if not value:
        return {}
    try:
        return json.loads(value)
    except Exception:
        return value

def _audit_action_label(action_type=''):
    action_type = (action_type or '').strip()
    return {
        'create': '新增', 'update': '修改', 'delete': '刪除', 'move': '搬移',
        'ship': '出貨', 'transfer': '互通移動', 'upsert': '儲存 / 更新',
        'undo': '還原', 'restore': '還原', 'archive': '封存'
    }.get(action_type, action_type or '操作')

def _audit_entity_label(entity_type=''):
    entity_type = (entity_type or '').strip()
    return {
        'inventory': '庫存 / 進貨', 'orders': '訂單', 'master_orders': '總單',
        'shipping_records': '出貨', 'warehouse_cells': '倉庫圖',
        'customer_profiles': '客戶資料', 'customer_items': '客戶商品 / A/B區', 'customer_aliases': '客戶別名',
        'corrections': 'OCR修正詞', 'todo_items': '代辦事項', 'undo': '還原紀錄'
    }.get(entity_type, entity_type or '資料')

def _audit_field_label(key=''):
    return {
        'customer_name': '客戶', 'name': '客戶名稱', 'new_name': '新客戶名稱',
        'product_text': '商品資料', 'product_code': '材質 / 代碼', 'qty': '數量',
        'quantity': '數量', 'location': '倉庫位置', 'operator': '操作人',
        'target': '目標', 'source': '來源', 'source_label': '來源', 'target_label': '目標',
        'zone': '區域', 'column_index': '欄位', 'slot_number': '格號',
        'from_key': '原格位', 'to_key': '新格位', 'batch_zone': '批量移動 A/B 區', 'note': '備註',
        'items': '商品', 'breakdown': '出貨扣除明細', 'message': '訊息',
        'region': '區域', 'phone': '電話', 'address': '地址', 'notes': '特殊要求',
        'wrong_text': '錯誤字', 'correct_text': '正確字', 'alias': '別名', 'target_name': '正式客戶'
    }.get(key, key)

def _fmt_audit_value(value):
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, dict):
                parts.append(_audit_dict_to_text(item).replace('\n', '，'))
            else:
                parts.append(str(item))
        return '；'.join([p for p in parts if p]) or '無'
    if isinstance(value, dict):
        return _audit_dict_to_text(value).replace('\n', '，') or '無'
    if value is None or value == '':
        return '無'
    return str(value)

def _audit_dict_to_text(data):
    data = _parse_maybe_json(data)
    if not data:
        return '無資料'
    if isinstance(data, list):
        return _fmt_audit_value(data)
    if not isinstance(data, dict):
        return str(data)
    preferred = ['source', 'target', 'customer_name', 'name', 'product_text', 'qty', 'location', 'zone', 'column_index', 'slot_number', 'from_key', 'to_key', 'message', 'note']
    lines = []
    used = set()
    for key in preferred:
        if key in data:
            lines.append(f"{_audit_field_label(key)}：{_fmt_audit_value(data.get(key))}")
            used.add(key)
    for key, value in data.items():
        if key in used or key in ('id', 'created_at', 'updated_at', 'customer_uid'):
            continue
        lines.append(f"{_audit_field_label(key)}：{_fmt_audit_value(value)}")
    return '\n'.join(lines) if lines else '無資料'

def _audit_summary_text(item):
    action_type = (item.get('action_type') or '').strip()
    entity_type = (item.get('entity_type') or '').strip()
    action = _audit_action_label(action_type)
    entity = _audit_entity_label(entity_type)
    after = _parse_maybe_json(item.get('after_json'))
    before = _parse_maybe_json(item.get('before_json'))
    data = after if isinstance(after, dict) and after else before if isinstance(before, dict) else {}
    if action_type == 'move' and entity_type == 'customer_items':
        customer = (data.get('customer_name') or data.get('name') or data.get('customer') or '') if isinstance(data, dict) else ''
        target_zone = (data.get('target') or data.get('to_zone') or data.get('zone') or data.get('batch_zone') or '') if isinstance(data, dict) else ''
        parts = ['移動客戶商品 A/B 區']
        if customer:
            parts.append(f'客戶：{customer}')
        if target_zone:
            parts.append(f'目標：{target_zone}')
        return '｜'.join(parts)
    if action_type == 'upsert' and entity_type == 'warehouse_cells' and isinstance(data, dict):
        z = data.get('zone') or ''
        col = data.get('column_index') or ''
        slot = data.get('slot_number') or ''
        count = len(data.get('items') or []) if isinstance(data.get('items'), list) else ''
        bits = ['儲存倉庫格位']
        if z and col and slot:
            bits.append(f'位置：{z}區第{col}欄第{slot}格')
        if count != '':
            bits.append(f'商品：{count}筆')
        return '｜'.join(bits)
    customer = (data.get('customer_name') or data.get('name') or '') if isinstance(data, dict) else ''
    product = (data.get('product_text') or '') if isinstance(data, dict) else ''
    qty = (data.get('qty') or data.get('quantity') or '') if isinstance(data, dict) else ''
    target = (data.get('target') or '') if isinstance(data, dict) else ''
    bits = [f"{action}{entity}"]
    if target:
        bits.append(f"目標：{target}")
    if customer:
        bits.append(f"客戶：{customer}")
    if product:
        bits.append(f"商品：{product}")
    if qty != '':
        bits.append(f"數量：{qty}")
    if len(bits) == 1 and item.get('entity_key'):
        bits.append(f"編號：{item.get('entity_key')}")
    return '｜'.join(bits)

def _decorate_audit_item(item):
    before = _parse_maybe_json(item.get('before_json'))
    after = _parse_maybe_json(item.get('after_json'))
    out = dict(item)
    out['action_label'] = _audit_action_label(item.get('action_type'))
    out['entity_label'] = _audit_entity_label(item.get('entity_type'))
    out['summary_text'] = _audit_summary_text(item)
    out['before_text'] = _audit_dict_to_text(before)
    out['after_text'] = _audit_dict_to_text(after)
    return out

def _delete_rows_by_ids(table, ids):
    ids = [int(x) for x in (ids or []) if str(x).isdigit()]
    if not ids:
        return 0
    conn = get_db(); cur = conn.cursor()
    holders = ','.join(['?'] * len(ids))
    cur.execute(sql(f'DELETE FROM {table} WHERE id IN ({holders})'), tuple(ids))
    count = cur.rowcount if cur.rowcount is not None else len(ids)
    conn.commit(); conn.close()
    return count

AUDIT_VISIBLE_ENTITY_TYPES_FIX113 = {'inventory', 'orders', 'master_orders', 'shipping_records', 'warehouse_cells', 'customer_profiles', 'customer_items'}
AUDIT_VISIBLE_ACTION_TYPES_FIX113 = {'create', 'update', 'delete', 'move', 'ship', 'transfer', 'upsert'}

@app.route('/api/audit-trails', methods=['GET'])
@login_required_json
def api_audit_trails():
    """FIX113：差異紀錄只顯示當天：訂單 / 總單 / 庫存進貨 / 出貨 / 倉庫圖。
    客戶資料、OCR 修正、登入、代辦、customer_items 等舊雜訊一律不顯示。"""
    undo_mode = (request.args.get('undo') or '').strip() in ('1','true','yes')
    if not _is_admin_user() and not undo_mode:
        return error_response('操作紀錄中心僅陳韋廷可以查看', 403)
    limit = int(request.args.get('limit') or 200)
    username = (request.args.get('username') or '').strip()
    entity_type = (request.args.get('entity_type') or '').strip()
    keyword = (request.args.get('q') or '').strip().lower()
    today = _today_key()
    start_date = (request.args.get('start_date') or ('' if undo_mode else today)).strip()
    end_date = (request.args.get('end_date') or ('' if undo_mode else today)).strip()
    items = list_audit_trails(limit=max(limit * 6, 500))
    filtered = []
    for item in items:
        raw_entity = (item.get('entity_type') or '').strip()
        raw_action = (item.get('action_type') or '').strip()
        if raw_entity not in AUDIT_VISIBLE_ENTITY_TYPES_FIX113:
            continue
        if raw_action and raw_action not in AUDIT_VISIBLE_ACTION_TYPES_FIX113:
            continue
        item = _decorate_audit_item(item)
        item['created_at'] = _format_24h(item.get('created_at'))
        if undo_mode and (item.get('username') or '') != current_username() and not _is_admin_user():
            continue
        if username and username not in (item.get('username') or ''):
            continue
        if entity_type and entity_type not in (item.get('entity_type') or '') and entity_type not in (item.get('entity_label') or ''):
            continue
        created = (item.get('created_at') or '')[:10]
        if start_date and created and created < start_date:
            continue
        if end_date and created and created > end_date:
            continue
        hay = json.dumps(item, ensure_ascii=False).lower()
        if keyword and keyword not in hay:
            continue
        filtered.append(item)
        if len(filtered) >= limit:
            break
    return jsonify(success=True, items=filtered, scope='today_orders_master_inventory_inbound_outbound_warehouse_fix115', start_date=start_date, end_date=end_date)

@app.route('/api/audit-trails/bulk-delete', methods=['POST'])
@login_required_json
def api_audit_trails_bulk_delete():
    if not _is_admin_user():
        return error_response('只有陳韋廷可以批量刪除操作紀錄', 403)
    data = request.get_json(silent=True) or {}
    ids = data.get('ids') or []
    count = _delete_rows_by_ids('audit_trails', ids)
    notify_sync_event(kind='refresh', module='today_changes', message='操作紀錄已批量刪除', extra={'count': count})
    return jsonify(success=True, deleted=count)

@app.route('/api/today-changes/bulk-delete', methods=['POST'])
@login_required_json
def api_today_changes_bulk_delete():
    if not _is_admin_user():
        return error_response('只有陳韋廷可以批量刪除今日異動', 403)
    data = request.get_json(silent=True) or {}
    ids = data.get('ids') or []
    count = _delete_rows_by_ids('logs', ids)
    notify_sync_event(kind='refresh', module='today_changes', message='今日異動已批量刪除', extra={'count': count})
    return jsonify(success=True, deleted=count, **_today_changes_payload())

@app.route('/api/customer-specs', methods=['GET'])
@login_required_json
def api_customer_specs():
    name = (request.args.get('name') or '').strip()
    return jsonify(success=True, items=get_customer_spec_stats(name, limit=int(request.args.get('limit') or 20)))

@app.route('/api/reports/export', methods=['GET'])
@login_required_json
def api_reports_export():
    report_type = (request.args.get('type') or 'inventory').strip()
    start_date = (request.args.get('start_date') or '').strip()
    end_date = (request.args.get('end_date') or '').strip()
    q = (request.args.get('q') or '').strip()

    if report_type == 'inventory':
        rows = inventory_summary()
        columns = [('客戶', 'customer_name'), ('商品', 'product_text'), ('總數量', 'qty'), ('已放倉庫', 'placed_qty'), ('未放倉庫', 'unplaced_qty'), ('位置', 'location'), ('操作人員', 'operator'), ('更新時間', 'updated_at')]
        name = '庫存總表.xlsx'
    elif report_type == 'orders':
        rows = get_orders()
        columns = [('客戶', 'customer_name'), ('商品', 'product_text'), ('數量', 'qty'), ('狀態', 'status'), ('操作人員', 'operator'), ('建立時間', 'created_at'), ('更新時間', 'updated_at')]
        name = '訂單總表.xlsx'
    elif report_type == 'shipping':
        rows = get_shipping_records(start_date or None, end_date or None, q)
        columns = [('客戶', 'customer_name'), ('商品', 'product_text'), ('數量', 'qty'), ('操作人員', 'operator'), ('出貨時間', 'shipped_at'), ('備註', 'note')]
        name = '出貨紀錄.xlsx'
    elif report_type == 'master_orders':
        rows = get_master_orders()
        columns = [('客戶', 'customer_name'), ('商品', 'product_text'), ('數量', 'qty'), ('操作人員', 'operator'), ('建立時間', 'created_at'), ('更新時間', 'updated_at')]
        name = '客戶總單.xlsx'
    elif report_type == 'unplaced':
        rows = [r for r in inventory_summary() if int(r.get('unplaced_qty') or 0) > 0]
        columns = [('客戶', 'customer_name'), ('商品', 'product_text'), ('未放倉庫數量', 'unplaced_qty'), ('總數量', 'qty'), ('位置', 'location'), ('更新時間', 'updated_at')]
        name = '未入倉商品.xlsx'
    elif report_type == 'warehouse':
        rows = []
        for cell in warehouse_get_cells():
            try:
                items = json.loads(cell.get('items_json') or '[]')
            except Exception:
                items = []
            if not items:
                rows.append({**cell, 'location': f"{cell.get('zone')}-{cell.get('column_index')}-{str(cell.get('slot_number')).zfill(2)}", 'customer_name': '', 'product_text': '', 'qty': 0})
            else:
                for it in items:
                    rows.append({**cell, 'location': f"{cell.get('zone')}-{cell.get('column_index')}-{str(cell.get('slot_number')).zfill(2)}", 'customer_name': it.get('customer_name') or '', 'product_text': it.get('product_text') or it.get('product') or '', 'qty': it.get('qty') or 0})
        columns = [('格位', 'location'), ('區域', 'zone'), ('欄', 'column_index'), ('格號', 'slot_number'), ('客戶', 'customer_name'), ('商品', 'product_text'), ('數量', 'qty'), ('備註', 'note'), ('更新時間', 'updated_at')]
        name = '倉庫位置表.xlsx'
    elif report_type == 'audit_trails':
        if current_username() != '陳韋廷':
            return error_response('操作紀錄僅陳韋廷可以匯出', 403)
        rows = []
        today = _today_key()
        for item in list_audit_trails(limit=5000):
            if (item.get('entity_type') or '').strip() not in AUDIT_VISIBLE_ENTITY_TYPES_FIX113:
                continue
            if (item.get('action_type') or '').strip() and (item.get('action_type') or '').strip() not in AUDIT_VISIBLE_ACTION_TYPES_FIX113:
                continue
            decorated = _decorate_audit_item(item)
            decorated['created_at'] = _format_24h(decorated.get('created_at'))
            created = (decorated.get('created_at') or '')[:10]
            if start_date or end_date:
                if start_date and created and created < start_date:
                    continue
                if end_date and created and created > end_date:
                    continue
            elif created != today:
                continue
            rows.append(decorated)
        columns = [('時間', 'created_at'), ('操作者', 'username'), ('操作', 'action_label'), ('資料類型', 'entity_label'), ('資料鍵值', 'entity_key'), ('摘要', 'summary_text'), ('變更前', 'before_text'), ('變更後', 'after_text')]
        name = '操作紀錄.xlsx'
    elif report_type == 'customers':
        rows = get_customers(active_only=False)
        columns = [('客戶UID', 'customer_uid'), ('客戶名稱', 'name'), ('電話', 'phone'), ('地址', 'address'), ('區域', 'region'), ('特殊要求', 'notes'), ('封存', 'is_archived'), ('更新時間', 'updated_at')]
        name = '客戶資料.xlsx'
    else:
        return error_response('報表類型不存在')

    buf = export_rows_to_xlsx(report_type, rows, columns)
    return send_file(buf, as_attachment=True, download_name=name, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')



@app.route('/api/backups/download/<path:filename>', methods=['GET'])
@login_required_json
def api_backup_download(filename):
    safe_name = os.path.basename(filename)
    path = os.path.join('backups', safe_name)
    if not os.path.isfile(path):
        return error_response('找不到備份檔', 404)
    return send_file(path, as_attachment=True, download_name=safe_name)

@app.route('/api/backups/restore', methods=['POST'])
@login_required_json
def api_backup_restore():
    if current_username() != '陳韋廷':
        return error_response('權限不足', 403)
    data = request.get_json(silent=True) or {}
    filename = os.path.basename((data.get('filename') or '').strip())
    if not filename:
        return error_response('請選擇備份檔')
    path = os.path.join('backups', filename)
    if not os.path.isfile(path):
        return error_response('找不到備份檔', 404)
    if filename.endswith('.json'):
        payload = json.load(open(path, 'r', encoding='utf-8'))
        conn = get_db(); cur = conn.cursor()
        tables = ['users','inventory','orders','master_orders','shipping_records','corrections','image_hashes','logs','errors','warehouse_cells','customer_profiles','app_settings','customer_aliases','warehouse_recent_slots','audit_trails','todo_items']
        try:
            for table in tables:
                if table not in payload:
                    continue
                cur.execute(sql(f'DELETE FROM {table}'))
                rows = payload.get(table) or []
                for row in rows:
                    keys = list(row.keys())
                    if not keys:
                        continue
                    cols = ','.join(keys)
                    holders = ','.join(['?'] * len(keys))
                    cur.execute(sql(f'INSERT INTO {table}({cols}) VALUES ({holders})'), tuple(row[k] for k in keys))
            conn.commit()
        except Exception as e:
            conn.rollback()
            log_error('backup_restore', str(e))
            return error_response('還原失敗')
        finally:
            conn.close()
        notify_sync_event(kind='refresh', module='all', message='已還原備份')
        return jsonify(success=True)
    return error_response('目前只支援 JSON 備份還原')



def _fix137_audit_table(entity_type=''):
    raw = (entity_type or '').strip()
    return {
        '庫存': 'inventory', 'inventory': 'inventory',
        '訂單': 'orders', 'orders': 'orders',
        '總單': 'master_orders', 'master_order': 'master_orders', 'master_orders': 'master_orders',
        'shipping': 'shipping_records', 'shipping_records': 'shipping_records',
    }.get(raw, raw if raw in ('inventory', 'orders', 'master_orders', 'shipping_records') else '')


def _fix137_restore_row(cur, table, row):
    row = dict(row or {})
    if not table or not row:
        return 0
    row.pop('source', None); row.pop('table', None)
    # 只保留一般資料欄位，避免 connector 補上的 row/table/source 造成 SQL 失敗。
    bad = {'before_text', 'after_text', 'summary_text', 'action_label', 'entity_label'}
    row = {k: v for k, v in row.items() if k and k not in bad}
    if not row:
        return 0
    item_id = row.get('id')
    keys = list(row.keys())
    def _insert(keys2):
        cols = ','.join(keys2)
        holders = ','.join(['?'] * len(keys2))
        cur.execute(sql(f"INSERT INTO {table}({cols}) VALUES ({holders})"), tuple(row.get(k) for k in keys2))
    if item_id not in (None, ''):
        cur.execute(sql(f"SELECT id FROM {table} WHERE id = ?"), (int(item_id),))
        exists = fetchone_dict(cur)
        if exists:
            update_keys = [k for k in keys if k != 'id']
            if update_keys:
                sets = ', '.join([f"{k} = ?" for k in update_keys])
                cur.execute(sql(f"UPDATE {table} SET {sets} WHERE id = ?"), tuple(row.get(k) for k in update_keys) + (int(item_id),))
            return 1
    try:
        _insert(keys)
    except Exception:
        common = [k for k in keys if k in ('id','customer_uid','customer_name','product_text','product_code','material','qty','location','operator','ocr_text','status','created_at','updated_at','shipped_at')]
        if common:
            _insert(common)
        else:
            raise
    return 1


def _fix137_restore_before_payload(cur, default_table, before_json):
    count = 0
    payload = before_json or {}
    if isinstance(payload, list):
        for item in payload:
            table = _fix137_audit_table(item.get('table') or item.get('entity_type') or item.get('source') or default_table)
            row = item.get('row') if isinstance(item, dict) and isinstance(item.get('row'), dict) else item
            if table and isinstance(row, dict):
                count += _fix137_restore_row(cur, table, row)
        return count
    if isinstance(payload, dict) and any(isinstance(v, list) for v in payload.values()):
        for table, rows in payload.items():
            table = _fix137_audit_table(table) or default_table
            for item in rows or []:
                row = item.get('row') if isinstance(item, dict) and isinstance(item.get('row'), dict) else item
                if table and isinstance(row, dict):
                    count += _fix137_restore_row(cur, table, row)
        return count
    if isinstance(payload, dict):
        table = _fix137_audit_table(payload.get('table') or payload.get('entity_type') or default_table)
        row = payload.get('row') if isinstance(payload.get('row'), dict) else payload
        if table:
            count += _fix137_restore_row(cur, table, row)
    return count


def _fix137_delete_recent_matching(cur, table, customer_name='', product_text='', qty=None):
    table = _fix137_audit_table(table)
    if not table or not product_text:
        return 0
    params = []
    where = ['product_text = ?']; params.append((product_text or '').strip())
    if table != 'inventory' and customer_name:
        where.append('customer_name = ?'); params.append((customer_name or '').strip())
    elif table == 'inventory' and customer_name:
        where.append("COALESCE(customer_name, '') = ?"); params.append((customer_name or '').strip())
    cur.execute(sql(f"SELECT * FROM {table} WHERE " + ' AND '.join(where) + " ORDER BY id DESC"), tuple(params))
    row = fetchone_dict(cur)
    if not row:
        return 0
    row_qty = int(row.get('qty') or 0)
    q = int(qty or row_qty or 0)
    if q > 0 and row_qty > q:
        cur.execute(sql(f"UPDATE {table} SET qty = qty - ?, updated_at = ? WHERE id = ?"), (q, now(), int(row.get('id'))))
    else:
        cur.execute(sql(f"DELETE FROM {table} WHERE id = ?"), (int(row.get('id')),))
    return 1


def _fix137_undo_ship_breakdown(cur, after_json):
    count = 0
    customer_name = (after_json.get('customer_name') or '').strip()
    for item in after_json.get('breakdown') or []:
        for d in item.get('master_details') or []:
            cur.execute(sql('UPDATE master_orders SET qty = qty + ?, updated_at = ? WHERE id = ?'), (int(d.get('qty') or 0), now(), int(d.get('id')))); count += 1
        for d in item.get('order_details') or []:
            cur.execute(sql('UPDATE orders SET qty = qty + ?, updated_at = ? WHERE id = ?'), (int(d.get('qty') or 0), now(), int(d.get('id')))); count += 1
        for d in item.get('inventory_details') or []:
            cur.execute(sql('UPDATE inventory SET qty = qty + ?, updated_at = ? WHERE id = ?'), (int(d.get('qty') or 0), now(), int(d.get('id')))); count += 1
        product_text = (item.get('product_text') or after_json.get('product_text') or '').strip()
        if customer_name and product_text:
            cur.execute(sql('SELECT id FROM shipping_records WHERE customer_name = ? AND product_text = ? ORDER BY id DESC'), (customer_name, product_text))
            ship_row = fetchone_dict(cur)
            if ship_row:
                cur.execute(sql('DELETE FROM shipping_records WHERE id = ?'), (int(ship_row.get('id')),)); count += 1
    return count


@app.route('/api/undo-last', methods=['POST'])
@login_required_json
def api_undo_last():
    conn = None
    try:
        data = request.get_json(silent=True) or {}
        audit_id = int(data.get('id') or data.get('audit_id') or 0)
        trails = list_audit_trails(limit=300)
        target = None
        for item in trails:
            if audit_id and int(item.get('id') or 0) != audit_id:
                continue
            if not audit_id and (item.get('username') or '') != current_username():
                continue
            if item.get('entity_type') == 'undo' or item.get('action_type') == 'undo':
                continue
            if item.get('action_type') not in ('create','update','delete','ship','move','transfer','upsert','archive','rename','restore'):
                continue
            target = item
            break
        if not target:
            return error_response('目前沒有可還原的最近操作')
        conn = get_db(); cur = conn.cursor()
        action_type = (target.get('action_type') or '').strip()
        entity_type = (target.get('entity_type') or '').strip()
        table = _fix137_audit_table(entity_type)
        before_json = target.get('before_json') or {}
        after_json = target.get('after_json') or {}
        summary = ''

        if action_type == 'create' and table in ('inventory','orders','master_orders'):
            customer_name = (after_json.get('customer_name') or '').strip()
            for it in after_json.get('items') or []:
                _fix137_delete_recent_matching(cur, table, customer_name, (it.get('product_text') or '').strip(), it.get('qty'))
            summary = '已還原最近一次新增資料'
        elif action_type == 'update' and table in ('inventory','orders','master_orders'):
            restored = _fix137_restore_before_payload(cur, table, before_json)
            summary = f'已還原最近一次編輯，共 {restored} 筆'
        elif action_type == 'delete' and table in ('inventory','orders','master_orders'):
            restored = _fix137_restore_before_payload(cur, table, before_json)
            summary = f'已還原最近一次刪除，共 {restored} 筆'
        elif action_type == 'ship':
            n = _fix137_undo_ship_breakdown(cur, after_json)
            summary = f'已還原最近一次出貨，共 {n} 筆異動'
        elif action_type == 'transfer':
            source_table = _fix137_audit_table(before_json.get('table') or entity_type)
            _fix137_restore_before_payload(cur, source_table, before_json)
            target_label = (after_json.get('target') or '').strip()
            target_table = {'庫存':'inventory','訂單':'orders','總單':'master_orders'}.get(target_label, '')
            if target_label == '出貨':
                _fix137_undo_ship_breakdown(cur, after_json if after_json.get('breakdown') else (after_json.get('result') or {}))
            elif target_table:
                _fix137_delete_recent_matching(cur, target_table, after_json.get('customer_name') or before_json.get('customer_name') or '', after_json.get('product_text') or before_json.get('product_text') or '', after_json.get('qty'))
            summary = '已還原最近一次移動 / 直接出貨'
        elif action_type == 'move' and entity_type == 'warehouse_cells':
            before_key = tuple((before_json or {}).get('from_key') or [])
            to_key = tuple((after_json or {}).get('to_key') or [])
            product_text = (after_json or {}).get('product_text') or target.get('entity_key') or ''
            qty = int((after_json or {}).get('qty') or 1)
            customer_name = (after_json or {}).get('customer_name') or ''
            conn.commit(); conn.close(); conn = None
            result = warehouse_move_item(to_key, before_key, product_text, qty, customer_name=customer_name, placement_label='前排')
            if not result.get('success'):
                return error_response(result.get('error') or '還原倉庫移動失敗')
            summary = '已還原最近一次倉庫搬移'
        elif action_type == 'move' and entity_type == 'customer_items':
            restored = _fix137_restore_before_payload(cur, '', before_json)
            summary = f'已還原最近一次 A/B 區移動，共 {restored} 筆'
        elif action_type == 'move' and table == 'inventory':
            # 舊版庫存移到訂單/總單的紀錄 before_json 較少，盡量用原 id / 數量補回庫存。
            row = {'id': before_json.get('id'), 'product_text': before_json.get('product_text'), 'qty': before_json.get('qty'), 'customer_name': before_json.get('customer_name') or '', 'product_code': before_json.get('product_code') or '', 'material': before_json.get('material') or '', 'location': before_json.get('location') or '', 'operator': current_username(), 'updated_at': now()}
            _fix137_restore_row(cur, 'inventory', row)
            target = (after_json.get('target') or '').strip()
            target_table = 'orders' if target == '訂單' else ('master_orders' if target == '總單' else '')
            if target_table:
                _fix137_delete_recent_matching(cur, target_table, after_json.get('customer_name') or '', before_json.get('product_text') or '', after_json.get('qty'))
            summary = '已還原最近一次庫存移動'
        elif action_type == 'upsert' and entity_type == 'warehouse_cells':
            zone = (after_json.get('zone') or '').strip().upper()
            col = int(after_json.get('column_index') or 0)
            slot = int(after_json.get('slot_number') or 0)
            note = before_json.get('note') or ''
            raw_items = before_json.get('items_json') or before_json.get('items') or []
            try:
                items = json.loads(raw_items) if isinstance(raw_items, str) else raw_items
            except Exception:
                items = []
            conn.commit(); conn.close(); conn = None
            warehouse_save_cell(zone, col, 'direct', slot, items or [], note)
            summary = '已還原最近一次倉庫格位編輯'
        elif action_type in ('archive','rename','restore','upsert') and entity_type == 'customer_profiles':
            # 客戶資料以 before_json 回寫。若 before_json 只有 name，也至少恢復可登入資料關聯。
            row = before_json if isinstance(before_json, dict) else {}
            old_name = row.get('name') or target.get('entity_key') or ''
            if old_name:
                upsert_customer(old_name, phone=row.get('phone') or '', address=row.get('address') or '', notes=row.get('notes') or '', common_materials=row.get('common_materials') or '', common_sizes=row.get('common_sizes') or '', region=row.get('region') or '北區', preserve_existing=False)
            summary = '已還原最近一次客戶資料操作'
        else:
            return error_response('這筆操作暫不支援還原')

        if conn:
            conn.commit(); conn.close(); conn = None
        add_audit_trail(current_username(), 'undo', 'undo', entity_type, before_json=target, after_json={'message': summary})
        notify_sync_event(kind='refresh', module='all', message=summary)
        log_action(current_username(), summary)
        return jsonify(success=True, message=summary)
    except Exception as e:
        try:
            if conn:
                conn.rollback(); conn.close()
        except Exception:
            pass
        log_error('undo_last_fix137', str(e))
        return error_response('還原上一筆失敗')


@app.route('/api/session/config', methods=['GET'])
@login_required_json
def api_session_config():
    return jsonify(success=True, idle_timeout_seconds=1800, startup_checks=STARTUP_CHECKS)

@app.route("/health")
@app.route("/api/health")
def health():
    return jsonify(success=not bool(STARTUP_DB_ERROR), status="ok" if not STARTUP_DB_ERROR else "db_init_failed", service="yuanxing", mode="native_device_only", db_error=STARTUP_DB_ERROR[:500])

@app.route("/api/native-shell/config", methods=["GET"])
def api_native_shell_config():
    return jsonify(success=True, backend_url=request.host_url.rstrip("/"), allowed_origins=["capacitor://localhost", "http://localhost", "https://localhost", "ionic://localhost", "app://localhost", "null"], app_name="沅興木業")


# ==== FIX28：庫存 / 訂單 / 總單 / 出貨互通 API ====
def _fix28_table_for_source(source):
    s = (source or '').strip()
    mapping = {
        'inventory': ('inventory', '庫存'), '庫存': ('inventory', '庫存'),
        'orders': ('orders', '訂單'), 'order': ('orders', '訂單'), '訂單': ('orders', '訂單'),
        'master_order': ('master_orders', '總單'), 'master_orders': ('master_orders', '總單'), '總單': ('master_orders', '總單'),
    }
    return mapping.get(s)

def _fix28_get_row(table, item_id):
    conn = get_db(); cur = conn.cursor()
    cur.execute(sql(f"SELECT * FROM {table} WHERE id = ?"), (int(item_id),))
    row = fetchone_dict(cur)
    conn.close()
    return row

def _fix28_update_or_delete_source(table, item_id, move_qty):
    row = _fix28_get_row(table, item_id)
    if not row:
        return False, '找不到來源資料'
    current_qty = int(row.get('qty') or 0)
    move_qty = max(1, min(int(move_qty or current_qty), current_qty))
    conn = get_db(); cur = conn.cursor()
    if move_qty >= current_qty:
        cur.execute(sql(f"DELETE FROM {table} WHERE id = ?"), (int(item_id),))
    else:
        cur.execute(sql(f"UPDATE {table} SET qty = qty - ?, updated_at = ? WHERE id = ?"), (move_qty, now(), int(item_id)))
    conn.commit(); conn.close()
    return True, move_qty

def _fix28_update_item_api(table, item_id):
    try:
        row = _fix28_get_row(table, item_id)
        if not row:
            return error_response('找不到資料', 404)
        if request.method == 'GET':
            return jsonify(success=True, item=row)
        if request.method == 'DELETE':
            conn = get_db(); cur = conn.cursor()
            cur.execute(sql(f"DELETE FROM {table} WHERE id = ?"), (int(item_id),))
            conn.commit(); conn.close()
            add_audit_trail(current_username(), 'delete', table, str(item_id), before_json=row, after_json={})
            log_action(current_username(), f"刪除{('訂單' if table=='orders' else '總單')}商品 #{item_id}")
            notify_sync_event(kind='refresh', module=('orders' if table=='orders' else 'master_order'), message='商品已刪除', extra={'id': item_id})
            return jsonify(success=True, items=(get_orders() if table=='orders' else get_master_orders()))
        data = request.get_json(silent=True) or {}
        product_text = format_product_text_height2((data.get('product_text') or row.get('product_text') or '').strip())
        material = (data.get('material') if data.get('material') is not None else row.get('material') or '').strip().upper()
        product_code = clean_material_value(data.get('product_code') or material or '', product_text)
        customer_name = (data.get('customer_name') or row.get('customer_name') or '').strip()
        location = (data.get('location') if data.get('location') is not None else row.get('location') or '').strip()
        qty = normalize_item_quantity(product_text, 1)
        if not product_text or not customer_name:
            return error_response('請輸入客戶與商品資料')
        if qty < 0:
            qty = 0
        conn = get_db(); cur = conn.cursor()
        try:
            cur.execute(sql(f"UPDATE {table} SET customer_name = ?, product_text = ?, product_code = ?, material = ?, qty = ?, location = ?, operator = ?, updated_at = ? WHERE id = ?"), (customer_name, product_text, product_code, material, qty, location, current_username(), now(), int(item_id)))
        except Exception:
            # FIX134：舊 PostgreSQL / SQLite 若 orders 或 master_orders 尚未有 location 欄位，
            # 先補欄位再重試，避免 A/B 區在「編輯全部」後沒有存進去。
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN location TEXT")
                cur.execute(sql(f"UPDATE {table} SET customer_name = ?, product_text = ?, product_code = ?, material = ?, qty = ?, location = ?, operator = ?, updated_at = ? WHERE id = ?"), (customer_name, product_text, product_code, material, qty, location, current_username(), now(), int(item_id)))
            except Exception:
                cur.execute(sql(f"UPDATE {table} SET customer_name = ?, product_text = ?, product_code = ?, material = ?, qty = ?, operator = ?, updated_at = ? WHERE id = ?"), (customer_name, product_text, product_code, material, qty, current_username(), now(), int(item_id)))
        conn.commit(); conn.close()
        upsert_customer(customer_name, region=resolve_customer_region(customer_name, data.get('region')))
        add_audit_trail(current_username(), 'update', table, str(item_id), before_json=row, after_json={'customer_name': customer_name, 'product_text': product_text, 'material': material, 'qty': qty, 'location': location})
        log_action(current_username(), f"修改{('訂單' if table=='orders' else '總單')}商品 #{item_id}")
        notify_sync_event(kind='refresh', module=('orders' if table=='orders' else 'master_order'), message='商品已更新', extra={'id': item_id})
        return jsonify(success=True, items=(get_orders() if table=='orders' else get_master_orders()))
    except Exception as e:
        log_error('fix28_update_item_api', str(e))
        return error_response('商品操作失敗')

@app.route('/api/orders/<int:item_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required_json
def api_fix28_order_item(item_id):
    return _fix28_update_item_api('orders', item_id)

@app.route('/api/master_orders/<int:item_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required_json
def api_fix28_master_item(item_id):
    return _fix28_update_item_api('master_orders', item_id)

@app.route('/api/items/transfer', methods=['POST'])
@login_required_json
def api_fix28_items_transfer():
    try:
        data = request.get_json(silent=True) or {}
        source_info = _fix28_table_for_source(data.get('source'))
        if not source_info:
            return error_response('來源類型錯誤')
        source_table, source_label = source_info
        item_id = int(data.get('id') or 0)
        row = _fix28_get_row(source_table, item_id)
        if not row:
            return error_response('找不到來源商品', 404)
        current_qty = int(row.get('qty') or 0)
        qty = int(data.get('qty') or current_qty or 0)
        if qty <= 0:
            return error_response('數量必須大於 0')
        qty = min(qty, current_qty)
        target = (data.get('target') or '').strip()
        product_text = format_product_text_height2((row.get('product_text') or '').strip())
        material = (row.get('material') or ((row.get('product_code') or '') if (row.get('product_code') or '') != product_text else '')).strip()
        product_code = clean_material_value(row.get('product_code') or material or '', product_text)
        customer_name = (data.get('customer_name') or row.get('customer_name') or '').strip()
        item = {'product_text': product_text, 'product_code': product_code, 'material': material, 'qty': qty}
        target_label = ''
        result_payload = {}
        if target == 'inventory':
            save_inventory_item(product_text, product_code, qty, (data.get('location') or row.get('location') or '').strip(), customer_name, current_username(), f'from {source_table}', material)
            target_label = '庫存'
            ok, moved = _fix28_update_or_delete_source(source_table, item_id, qty)
            if not ok: return error_response(moved)
            result_payload['items'] = grouped_inventory()
        elif target == 'orders':
            if not customer_name: return error_response('請選擇客戶')
            upsert_customer(customer_name, region=resolve_customer_region(customer_name, data.get('region')))
            save_order(customer_name, [item], current_username(), (data.get('duplicate_mode') or 'merge').strip() or 'merge')
            target_label = '訂單'
            ok, moved = _fix28_update_or_delete_source(source_table, item_id, qty)
            if not ok: return error_response(moved)
            result_payload['items'] = get_orders()
        elif target in ('master_order', 'master_orders'):
            if not customer_name: return error_response('請選擇客戶')
            upsert_customer(customer_name, region=resolve_customer_region(customer_name, data.get('region')))
            save_master_order(customer_name, [item], current_username(), (data.get('duplicate_mode') or 'merge').strip() or 'merge')
            target_label = '總單'
            ok, moved = _fix28_update_or_delete_source(source_table, item_id, qty)
            if not ok: return error_response(moved)
            result_payload['items'] = get_master_orders()
        elif target == 'ship':
            if not customer_name: return error_response('請選擇客戶')
            upsert_customer(customer_name, region=resolve_customer_region(customer_name, data.get('region')))
            # FIX134：表格列上的「直接出貨」要扣該列原本來源，避免訂單列被自動改扣總單、
            # 或庫存列被改扣客戶總單。
            if source_table == 'master_orders':
                item['source_preference'] = 'master_orders'
                item['source_customer_name'] = customer_name
            elif source_table == 'orders':
                item['source_preference'] = 'orders'
                item['source_customer_name'] = customer_name
            elif source_table == 'inventory':
                item['source_preference'] = 'inventory'
            ship_result = ship_order(customer_name, [item], current_username(), allow_inventory_fallback=bool(data.get('allow_inventory_fallback')))
            if not ship_result.get('success'):
                return jsonify(ship_result), 400
            target_label = '出貨'
            result_payload.update(ship_result)
        else:
            return error_response('目標類型錯誤')
        add_audit_trail(current_username(), 'transfer', source_table, str(item_id), before_json={'source': source_label, 'table': source_table, **row}, after_json={'target': target_label, 'customer_name': customer_name, 'product_text': product_text, 'qty': qty, 'result': result_payload, 'breakdown': result_payload.get('breakdown') if isinstance(result_payload, dict) else []})
        log_action(current_username(), f"{source_label}移到{target_label}：{customer_name} {product_text}x{qty}")
        notify_sync_event(kind='refresh', module='all', message=f'{source_label}已移到{target_label}', extra={'source': source_label, 'target': target_label, 'customer_name': customer_name, 'product_text': product_text, 'qty': qty})
        return jsonify(success=True, message=f'已從{source_label}移到{target_label}', customer_name=customer_name, target=target_label, **result_payload)
    except Exception as e:
        log_error('fix28_items_transfer', str(e))
        return error_response('互通操作失敗')


@app.route('/api/items/batch-transfer', methods=['POST'])
@login_required_json
def api_v17_items_batch_transfer():
    """v17 clean master：加到訂單 / 加到總單使用單次 API。
    前端一次送出多筆來源商品，後端逐筆轉入目標並回傳最新清單，避免多個按鈕逐筆等待 HTTP。
    """
    try:
        data = request.get_json(silent=True) or {}
        items = data.get('items') or []
        target = (data.get('target') or '').strip()
        customer_name = (data.get('customer_name') or '').strip()
        if target in ('master_orders',):
            target = 'master_order'
        if target not in ('inventory', 'orders', 'master_order'):
            return error_response('目標類型錯誤')
        if target != 'inventory' and not customer_name:
            return error_response('請選擇客戶')
        if not items:
            return error_response('請先勾選要轉入的商品')
        if customer_name:
            yx_v35_safe_side_effect('upsert_inventory_customer', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region')))
        moved_rows = []
        errors = []
        for it in items:
            try:
                source_info = _fix28_table_for_source(it.get('source'))
                if not source_info:
                    errors.append({'item': it, 'error': '來源類型錯誤'})
                    continue
                source_table, source_label = source_info
                item_id = int(it.get('id') or 0)
                row = _fix28_get_row(source_table, item_id)
                if not row:
                    errors.append({'item': it, 'error': '找不到來源商品'})
                    continue
                current_qty = int(row.get('qty') or 0)
                qty = int(it.get('qty') or current_qty or 0)
                if qty <= 0:
                    errors.append({'item': it, 'error': '數量必須大於 0'})
                    continue
                qty = min(qty, current_qty)
                product_text = format_product_text_height2((row.get('product_text') or '').strip())
                material = (row.get('material') or ((row.get('product_code') or '') if (row.get('product_code') or '') != product_text else '')).strip()
                product_code = clean_material_value(row.get('product_code') or material or '', product_text)
                final_customer = customer_name or (row.get('customer_name') or '').strip()
                item_payload = {'product_text': product_text, 'product_code': product_code, 'material': material, 'qty': qty}
                if target == 'inventory':
                    save_inventory_item(product_text, product_code, qty, (row.get('location') or '').strip(), final_customer, current_username(), f'batch from {source_table}', material)
                    target_label = '庫存'
                elif target == 'orders':
                    save_order(final_customer, [item_payload], current_username(), (data.get('duplicate_mode') or 'merge').strip() or 'merge')
                    target_label = '訂單'
                else:
                    save_master_order(final_customer, [item_payload], current_username(), (data.get('duplicate_mode') or 'merge').strip() or 'merge')
                    target_label = '總單'
                ok, moved_qty = _fix28_update_or_delete_source(source_table, item_id, qty)
                if not ok:
                    errors.append({'item': it, 'error': moved_qty})
                    continue
                moved_rows.append({'source': source_label, 'target': target_label, 'id': item_id, 'product_text': product_text, 'qty': moved_qty, 'customer_name': final_customer})
                add_audit_trail(current_username(), 'transfer', source_table, str(item_id), before_json={'source': source_label, 'table': source_table, **row}, after_json={'target': target_label, 'customer_name': final_customer, 'product_text': product_text, 'qty': moved_qty})
            except Exception as row_error:
                errors.append({'item': it, 'error': str(row_error)})
        if not moved_rows and errors:
            return error_response(errors[0].get('error') or '批量轉入失敗')
        target_label = {'inventory':'庫存','orders':'訂單','master_order':'總單'}[target]
        log_action(current_username(), f'批量轉入{target_label}，共 {len(moved_rows)} 筆')
        notify_sync_event(kind='refresh', module='all', message=f'商品已批量轉入{target_label}', extra={'count': len(moved_rows), 'target': target_label})
        payload = {'success': True, 'count': len(moved_rows), 'moved': moved_rows, 'errors': errors, 'snapshots': yx_v22_product_snapshots(), 'customers': get_customers()}
        if target == 'inventory':
            payload['items'] = grouped_inventory()
        elif target == 'orders':
            payload['items'] = get_orders()
        else:
            payload['items'] = get_master_orders()
        return jsonify(payload)
    except Exception as e:
        log_error('v17_items_batch_transfer', str(e))
        return error_response('批量轉入失敗')


# V12_NO_STORE_STATIC: deploy must always load the real current HTML/JS/CSS, not old v2/v9 cache.
@app.after_request
def yx_v12_no_store_static(resp):
    try:
        p = request.path or ''
        if p.startswith('/static/') or p.endswith('.html'):
            resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            resp.headers['Pragma'] = 'no-cache'
            resp.headers['Expires'] = '0'
    except Exception:
        pass
    return resp



# ============================================================
# V37 FINAL SAFE SIDE EFFECT OVERRIDE
# Primary DB writes for create / edit / move / ship must never fail just because
# logs, audit trails, notification snapshots, or sync events fail on old schemas.
# Route functions resolve globals at runtime, so these wrappers protect all existing
# endpoints without changing their button/events/UI flow.
# ============================================================
_yx_v37_raw_log_action = log_action
_yx_v37_raw_add_audit_trail = add_audit_trail
_yx_v37_raw_notify_sync_event = notify_sync_event

def _yx_v37_silent_side_effect(label, fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        try:
            _db_log_action(current_username() or 'system', f'V37 side-effect skipped: {label}')
        except Exception:
            pass
        try:
            print(f'[V37_SAFE_SIDE_EFFECT] {label}: {e}', flush=True)
        except Exception:
            pass
        return None

def log_action(username, action):
    return _yx_v37_silent_side_effect('log_action', _yx_v37_raw_log_action, username, action)

def add_audit_trail(*args, **kwargs):
    return _yx_v37_silent_side_effect('add_audit_trail', _yx_v37_raw_add_audit_trail, *args, **kwargs)

def notify_sync_event(*args, **kwargs):
    return _yx_v37_silent_side_effect('notify_sync_event', _yx_v37_raw_notify_sync_event, *args, **kwargs)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
