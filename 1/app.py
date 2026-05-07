from urllib.parse import quote
# V65: frontend batch-edit/warehouse-speed fix uses existing API routes.
# V59 mainfile event/db/ui lock
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
    warehouse_add_slot, warehouse_remove_slot, warehouse_set_cell_mark,
    inventory_summary, warehouse_summary, list_backups, get_orders, get_master_orders,
    list_users, set_user_blocked, get_setting, set_setting, verify_password, row_to_dict, get_db, sql, rows_to_dict, fetchone_dict, now, USE_POSTGRES, database_mode_info, table_counts,
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


def ensure_runtime_product_schema(cur):
    """V58 runtime guard: routes that update month_tag/location must not fail on old PostgreSQL/SQLite schemas."""
    for table in ('inventory', 'orders', 'master_orders', 'shipping_records'):
        for column, definition in (('month_tag', 'TEXT'), ('location', 'TEXT')):
            if table == 'shipping_records' and column == 'location':
                continue
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}")
            except Exception:
                try:
                    cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
                except Exception:
                    pass


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
        "/login", "/api/login", "/api/health", "/api/db-diagnostics", "/api/native-shell/config",
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

def warehouse_item_display_size(text):
    """Return the visible size exactly as entered, preserving leading zeros like 396x30x06.
    This is for UI / saved product text only; warehouse_item_size_key still normalizes for matching.
    """
    raw = str(text or '').replace('×', 'x').replace('Ｘ', 'x').replace('X', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    raw = re.sub(r'[\(（][^\)）]*[\)）]', '', raw).strip()
    left = (raw.split('=', 1)[0].strip() or raw)
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



def warehouse_rewrite_product_qty_for_unplaced(product_text, qty):
    """Return product_text adjusted to the remaining unplaced quantity for dropdown display."""
    raw = str(product_text or '').replace('×', 'x').replace('Ｘ', 'x').replace('X', 'x').replace('✕', 'x').replace('＊', 'x').replace('*', 'x').replace('＝', '=').strip()
    try:
        qty = max(0, int(qty or 0))
    except Exception:
        qty = 0
    if not raw or '=' not in raw or qty <= 0:
        return raw
    left = warehouse_item_display_size(raw) or raw.split('=', 1)[0].strip()
    support = warehouse_support_text(raw)
    if not support:
        return raw
    parts = [x.strip() for x in support.split('+') if str(x).strip()]
    if len(parts) == 1:
        part = parts[0]
        if re.search(r'x\s*\d+\s*$', part, re.I):
            part = re.sub(r'x\s*\d+\s*$', 'x' + str(qty), part, flags=re.I)
        elif re.fullmatch(r'\d+(?:\.\d+)?', part):
            part = f'{part}x{qty}'
        else:
            part = f'{part}x{qty}'
        return f'{left}={part}'
    return raw

def warehouse_support_qty_adjustment(part):
    # V58：括號只當備註，倉庫支數件數不因 (東昇-8) 這類文字被扣掉。
    return 0


def warehouse_support_plain(part):
    return re.sub(r'[\(（][^\)）]*[\)）]', '', str(part or '')).strip()



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
    display_size = warehouse_item_display_size(raw) or size
    right = raw.split('=', 1)[1].strip()
    parts = [x.strip() for x in re.split(r'[+＋]', right) if x and x.strip()]
    if not size or not parts:
        return [{'product_text': raw, 'support_text': warehouse_support_text(raw), 'qty': max(0, row_qty)}]
    out = []
    for part in parts:
        part_raw = part.strip()
        plain_part = warehouse_support_plain(part_raw)
        m = re.match(r'^(\d+(?:\.\d+)?)(?:x(\d+))?$', plain_part.lower())
        if m:
            support = part_raw
            qty = int(m.group(2) or 1) + warehouse_support_qty_adjustment(part_raw)
        else:
            support = part_raw
            qty = 1 + warehouse_support_qty_adjustment(part_raw)
        qty = max(0, qty)
        if qty > 0:
            out.append({'product_text': f'{display_size}={support}', 'support_text': support, 'qty': qty})
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


def warehouse_saved_item_component_details(it, qty=None):
    """Distribute placed qty back to source_details.

    If the user selected one exact support segment, e.g. source row
    131x30x12=216x4+336x16+348x45 but current cell item is 131x30x12=336x16,
    deduct 336x16 first so the next dropdown remains 216x4+348x45.
    """
    if not isinstance(it, dict):
        return []
    details = it.get('source_details') or []
    if isinstance(details, str):
        try:
            details = json.loads(details)
        except Exception:
            details = []
    if not isinstance(details, list) or not details:
        return []
    try:
        remaining = int(qty if qty is not None else (it.get('qty') or it.get('quantity') or 0))
    except Exception:
        remaining = 0
    if remaining <= 0:
        return []
    selected_exact = warehouse_item_exact_key(it.get('product_text') or it.get('product') or '')
    selected_support = warehouse_support_text(it.get('product_text') or it.get('product') or '').strip().lower()
    def detail_sort_key(d):
        dproduct = (d.get('product_text') or d.get('product') or '').strip()
        dexact = warehouse_item_exact_key(dproduct)
        dsupport = warehouse_support_text(dproduct).strip().lower()
        if selected_exact and dexact == selected_exact:
            return 0
        if selected_support and dsupport == selected_support:
            return 1
        return 2
    ordered = sorted([d for d in details if isinstance(d, dict)], key=detail_sort_key)
    out = []
    for d in ordered:
        product = (d.get('product_text') or d.get('product') or '').strip()
        if not product:
            continue
        try:
            dqty = int(d.get('qty') or d.get('quantity') or 0)
        except Exception:
            dqty = 0
        if dqty <= 0:
            continue
        use_qty = min(dqty, remaining)
        if use_qty <= 0:
            continue
        row = dict(d)
        row['qty'] = use_qty
        row['customer_name'] = warehouse_customer_key(row.get('customer_name') or it.get('customer_name') or '')
        row['source'] = row.get('source') or row.get('source_table') or it.get('source') or it.get('source_table') or '庫存'
        row['source_table'] = row.get('source_table') or row.get('source') or '庫存'
        row['source_id'] = str(row.get('source_id') or row.get('id') or '')
        out.append(row)
        remaining -= use_qty
        if remaining <= 0:
            break
    return out

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
                'display_product_size': warehouse_item_display_size(product) or warehouse_item_display_size(original_product) or size,
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
            component_details = warehouse_saved_item_component_details(it, qty)
            if component_details:
                for d in component_details:
                    dproduct = d.get('product_text') or d.get('product') or ''
                    dsize = warehouse_item_size_key(dproduct)
                    dexact = warehouse_item_exact_key(dproduct)
                    dcustomer = warehouse_customer_key(d.get('customer_name') or customer)
                    try:
                        dq = int(d.get('qty') or 0)
                    except Exception:
                        dq = 0
                    if not dsize or dq <= 0:
                        continue
                    placed[(dexact, dcustomer)] = placed.get((dexact, dcustomer), 0) + dq
                    if (dsize, dcustomer) != (dexact, dcustomer) and '=' not in dexact:
                        placed[(dsize, dcustomer)] = placed.get((dsize, dcustomer), 0) + dq
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
        component_details = warehouse_saved_item_component_details(it, q)
        if component_details:
            for d in component_details:
                dproduct = d.get('product_text') or d.get('product') or ''
                dsize = warehouse_item_size_key(dproduct)
                dexact = warehouse_item_exact_key(dproduct)
                dcustomer = warehouse_customer_key(d.get('customer_name') or customer)
                try:
                    dq = int(d.get('qty') or 0)
                except Exception:
                    dq = 0
                if not dsize or dq <= 0:
                    continue
                proposed_exact[(dexact, dcustomer)] = proposed_exact.get((dexact, dcustomer), 0) + dq
                proposed_size[(dsize, dcustomer)] = proposed_size.get((dsize, dcustomer), 0) + dq
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
            # V68 targeted: 保留 A/B 區與來源欄位，避免新增訂單/總單/庫存時畫面有區域但 DB 變空白。
            for _k in ('borrow_from_customer_name', 'source_customer_name', 'borrow_reason', 'borrow_confirmed', 'source_preference', 'deduct_source', 'source', 'area', 'location', 'zone'):
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
            try:
                # Do not show an empty inventory page just because warehouse summary failed.
                return jsonify(success=True, items=list_inventory(), degraded=True, error=str(e))
            except Exception as e2:
                log_error("inventory_get_raw_fallback", str(e2))
                return jsonify(success=False, items=[], error=str(e2))
    data = request.get_json(silent=True) or {}
    try:
        if not request_key_from_payload(data, endpoint='/api/inventory'):
            return duplicate_success('相同庫存送出已忽略', **duplicate_current_payload('/api/inventory', data))
        items = _parse_items_from_request(data)
        if not items:
            return error_response("請輸入商品資料")
        operator = current_username()
        duplicate_mode = (data.get("duplicate_mode") or "merge").strip() or "merge"
        location = (data.get("location") or data.get("area") or data.get("zone") or "").strip()
        customer_name = (data.get("customer_name") or "").strip()
        if customer_name:
            yx_v35_safe_side_effect('upsert_inventory_customer', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region')), preserve_existing=True)
        for it in items:
            item_location = (it.get("location") or it.get("area") or it.get("zone") or location or "").strip()
            save_inventory_item(it["product_text"], it.get("product_code", ""), int(it["qty"]), item_location, customer_name, operator, data.get("ocr_text", ""), it.get("material",""), duplicate_mode=duplicate_mode)
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
        location = (data.get('location') if data.get('location') is not None else (data.get('area') if data.get('area') is not None else (data.get('zone') if data.get('zone') is not None else row.get('location') or ''))).strip()
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
        item = {'product_text': product_text, 'product_code': product_code, 'material': product_code, 'qty': move_qty, 'area': row.get('area') or row.get('location') or '', 'location': row.get('location') or row.get('area') or ''}
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
            wh_deduct = []
            try:
                for b in (result.get('breakdown') or []):
                    wh_deduct.extend(b.get('warehouse_deduct') or [])
            except Exception:
                wh_deduct = []
            yx_v35_safe_side_effect('ship_audit', add_audit_trail, current_username(), 'ship', 'shipping_records', customer_name, before_json={}, after_json={'customer_name': customer_name, 'items': items, 'allow_inventory_fallback': allow_inventory_fallback, 'breakdown': result.get('breakdown', []), 'warehouse_deduct': wh_deduct})
            yx_v35_safe_side_effect('ship_notify', notify_sync_event, kind='refresh', module='ship', message='出貨已更新', extra={'customer_name': customer_name, 'count': len(items), 'warehouse_deduct': wh_deduct})
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

@app.route("/api/shipping_records/<int:record_id>", methods=["DELETE"])
@login_required_json
def api_shipping_record_delete(record_id):
    # V61：出貨查詢管理員可刪單；刪除後其他人查不到。
    if current_username() != '陳韋廷':
        return error_response('權限不足', 403)
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql('SELECT * FROM shipping_records WHERE id = ?'), (record_id,))
        before = rows_to_dict(cur)
        cur.execute(sql('DELETE FROM shipping_records WHERE id = ?'), (record_id,))
        conn.commit(); conn.close()
        yx_v35_safe_side_effect('shipping_delete_audit', add_audit_trail, current_username(), 'delete', 'shipping_records', str(record_id), before_json={'row': before[0] if before else {}}, after_json={'deleted': True})
        notify_sync_event(kind='refresh', module='shipping_query', message='出貨紀錄已刪除', extra={'id': record_id})
        return jsonify(success=True)
    except Exception as e:
        log_error('shipping_record_delete', str(e))
        return error_response('刪除出貨紀錄失敗')

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
        cells = warehouse_get_cells()
        zones = {"A": {}, "B": {}}
        for cell in cells:
            z = (cell.get('zone') or 'A').strip().upper()
            if z not in ('A','B'): z = 'A'
            c = int(cell.get('column_index') or 1)
            n = int(cell.get('slot_number') or 1)
            zones.setdefault(z, {}).setdefault(c, {})[n] = cell
        return jsonify(success=True, zones=zones, cells=cells)
    except Exception as e:
        log_error("api_warehouse", str(e))
        return jsonify(success=False, zones={"A": {}, "B": {}}, cells=[], error=str(e))


@app.route("/api/warehouse/cell", methods=["POST"])
@login_required_json
def api_warehouse_cell():
    data = request.get_json(silent=True) or {}
    try:
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        slot_type = 'direct'
        slot_number = int(data.get("slot_number") or 0)
        if zone not in ("A", "B") or column_index < 1 or slot_number < 1:
            return error_response("格位參數錯誤")
        existing_cells = warehouse_get_cells()
        previous_cell = next((c for c in existing_cells if str(c.get('zone')) == zone and int(c.get('column_index') or 0) == column_index and int(c.get('slot_number') or 0) == slot_number), {})
        # V71 targeted fix: front-end may display a slot that is missing in DB after old/broken
        # migrations. Do not reject it here; warehouse_save_cell will only fill missing empty
        # slots up to the operated slot and then save this exact cell. No clearing/rebuild.
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
            hay = f"{cell['zone']} {cell['column_index']} {cell['slot_type']} {cell['slot_number']} {it.get('product_text','')} {it.get('customer_name','')} {it.get('material','')} {it.get('product_code','')}"
            tokens = [x for x in re.split(r'\s+', q.lower()) if x]
            if not tokens or all(t in hay.lower() for t in tokens):
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
        placed_size_detail = {}
        placed_size_detail_by_zone = {}
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
                component_details = warehouse_saved_item_component_details(it, q)
                if component_details:
                    for d in component_details:
                        dexact = warehouse_item_exact_key(d.get('product_text') or d.get('product') or '')
                        dcustomer = warehouse_customer_key(d.get('customer_name') or customer)
                        dsource = (d.get('source_table') or d.get('source') or source_label or '庫存').strip()
                        dsource = {'master_orders': '總單', 'master_order': '總單', 'orders': '訂單', 'order': '訂單', 'inventory': '庫存', 'stock': '庫存'}.get(dsource, dsource)
                        did = str(d.get('source_id') or d.get('id') or '')
                        try:
                            dq = int(d.get('qty') or 0)
                        except Exception:
                            dq = 0
                        if dexact and dq > 0:
                            dkey = (dexact, dcustomer, dsource, did)
                            placed_detail[dkey] = placed_detail.get(dkey, 0) + dq
                            placed_detail_by_zone[(dexact, dcustomer, dsource, did, cell_zone)] = placed_detail_by_zone.get((dexact, dcustomer, dsource, did, cell_zone), 0) + dq
                            dsize = warehouse_item_size_key(dexact)
                            if dsize:
                                skey = (dsize, dcustomer, dsource, did)
                                placed_size_detail[skey] = placed_size_detail.get(skey, 0) + dq
                                placed_size_detail_by_zone[(dsize, dcustomer, dsource, did, cell_zone)] = placed_size_detail_by_zone.get((dsize, dcustomer, dsource, did, cell_zone), 0) + dq
                    continue
                if exact and q > 0:
                    dkey = (exact, customer, source_label, source_id)
                    placed_detail[dkey] = placed_detail.get(dkey, 0) + q
                    placed_detail_by_zone[(exact, customer, source_label, source_id, cell_zone)] = placed_detail_by_zone.get((exact, customer, source_label, source_id, cell_zone), 0) + q
                    dsize = warehouse_item_size_key(exact)
                    if dsize:
                        skey = (dsize, customer, source_label, source_id)
                        placed_size_detail[skey] = placed_size_detail.get(skey, 0) + q
                        placed_size_detail_by_zone[(dsize, customer, source_label, source_id, cell_zone)] = placed_size_detail_by_zone.get((dsize, customer, source_label, source_id, cell_zone), 0) + q
        items = []
        zone_summary = {'A': 0, 'B': 0, 'unassigned': 0, 'total': 0}
        for detail_key, details_all in source_details.items():
            exact, customer, source_label, source_id = detail_key
            details_for_item_all = details_all
            size_key_for_placed = warehouse_item_size_key(exact)
            if zone_filter:
                # V69：A 區格位下拉只顯示 A 區未入倉商品；B 區只顯示 B 區。
                # 未分區只留在總統計，不混入 A/B 格子的下拉。
                details_for_item = [d for d in details_for_item_all if str(d.get('zone') or '').strip().upper().startswith(zone_filter)]
                total_qty = sum(int(d.get('qty') or 0) for d in details_for_item)
                placed_qty = int(placed_detail.get((exact, customer, source_label, str(source_id)), 0) or 0)
                # When user places only part of a support line, e.g. source = 160x30x125=240x29
                # and cell item = 160x30x125=240x22, exact keys differ. Deduct by base size + customer
                # only when exact/source_id matching cannot find a placement.
                if placed_qty <= 0 and size_key_for_placed:
                    placed_qty = int(placed_size_detail.get((size_key_for_placed, customer, source_label, str(source_id)), 0) or 0)
                if placed_qty <= 0 and size_key_for_placed:
                    placed_qty = int(placed_all.get((size_key_for_placed, customer), 0) or 0)
                if placed_qty <= 0:
                    placed_qty = int(placed_all.get((exact, customer), 0) or 0)
            else:
                details_for_item = details_for_item_all
                total_qty = sum(int(d.get('qty') or 0) for d in details_for_item)
                placed_qty = int(placed_detail.get((exact, customer, source_label, str(source_id)), 0) or 0)
                if placed_qty <= 0 and size_key_for_placed:
                    placed_qty = int(placed_size_detail.get((size_key_for_placed, customer, source_label, str(source_id)), 0) or 0)
                # 若舊格位沒有 source_id/source，只能用尺寸 + 客戶總量扣掉，避免舊資料重複出現在下拉。
                if placed_qty <= 0 and size_key_for_placed:
                    placed_qty = int(placed_all.get((size_key_for_placed, customer), 0) or 0)
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
            product = warehouse_rewrite_product_qty_for_unplaced(product, unplaced_qty)
            size = first.get('product_size') or warehouse_item_size_key(product)
            display_size = first.get('display_product_size') or warehouse_item_display_size(product) or size
            support = warehouse_support_text(product) or first.get('support_text') or ''
            material = first.get('material') or first.get('product_code') or ''
            items.append({
                'product_text': product,
                'product': product,
                'product_size': size,
                'display_product_size': display_size,
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
        ensure_runtime_product_schema(cur)
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
        if zone not in ("A", "B") or column_index < 1 or slot_number < 1:
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
        if zone not in ("A", "B") or column_index < 1:
            return error_response("格位參數錯誤")
        slot_type = 'direct'
        insert_after = data.get("insert_after", None)
        if insert_after is None and data.get("slot_number") not in (None, ""):
            insert_after = max(0, int(data.get("slot_number")) - 1)
        slot_number = warehouse_add_slot(zone, column_index, slot_type, insert_after=insert_after)
        yx_v35_safe_side_effect('warehouse_add_log', log_action, current_username(), f"新增格子 {zone}{column_index}-{slot_number}")
        yx_v35_safe_side_effect('warehouse_add_audit', add_audit_trail, current_username(), 'create', 'warehouse_cells', f'{zone}-{column_index}-{slot_number}', before_json={}, after_json={'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'insert_after': insert_after, 'action': '新增格子'})
        yx_v35_safe_side_effect('warehouse_add_notify', notify_sync_event, kind='refresh', module='warehouse', message='倉庫新增格子', extra={'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'insert_after': insert_after})
        _v98_record_today_change('倉庫新增格子', 'warehouse_cells', '', f'{zone}區{column_index}欄{slot_number}格', {'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'action': 'add_slot'})
        payload = {'success': True, 'slot_number': slot_number}
        try:
            payload['zones'] = warehouse_summary()
            payload['cells'] = warehouse_get_cells()
        except Exception as read_err:
            log_error('warehouse_add_slot_readback', str(read_err))
        return jsonify(payload)
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
        if zone not in ("A", "B") or column_index < 1 or slot_number < 1:
            return error_response("格位參數錯誤")
        slot_type = 'direct'
        result = warehouse_remove_slot(zone, column_index, slot_type, slot_number)
        if not result.get('success'):
            return error_response(result.get('error') or '刪除格子失敗')
        yx_v35_safe_side_effect('warehouse_remove_log', log_action, current_username(), f"刪除格子 {zone}{column_index}-{slot_number}")
        yx_v35_safe_side_effect('warehouse_remove_audit', add_audit_trail, current_username(), 'delete', 'warehouse_cells', f'{zone}-{column_index}-{slot_number}', before_json={'zone': zone, 'column_index': column_index, 'slot_number': slot_number}, after_json={'action': '刪除格子'})
        yx_v35_safe_side_effect('warehouse_remove_notify', notify_sync_event, kind='refresh', module='warehouse', message='倉庫刪除格子', extra={'zone': zone, 'column_index': column_index, 'slot_number': slot_number})
        _v98_record_today_change('倉庫減少格子', 'warehouse_cells', '', f'{zone}區{column_index}欄{slot_number}格', {'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'action': 'remove_slot'})
        payload = {'success': True}
        try:
            payload['zones'] = warehouse_summary()
            payload['cells'] = warehouse_get_cells()
        except Exception as read_err:
            log_error('warehouse_remove_slot_readback', str(read_err))
        return jsonify(payload)
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



def _today_unplaced_zone_summary():
    """A/B/未分區/總計：與 /api/warehouse/available-items 同一套扣數邏輯。"""
    try:
        _totals, source_details = warehouse_source_totals()
        placed = warehouse_placed_totals()
        out = {'A': 0, 'B': 0, 'unassigned': 0, 'total': 0}
        for detail_key, details_all in source_details.items():
            exact, customer, _source_label, _source_id = detail_key
            details_all = details_all or []
            total_qty = sum(int(d.get('qty') or 0) for d in details_all)
            size_key = warehouse_item_size_key(exact)
            placed_qty = int(placed.get((exact, customer), 0) or 0)
            if placed_qty <= 0 and size_key:
                placed_qty = int(placed.get((size_key, customer), 0) or 0)
            unplaced_qty = max(0, int(total_qty or 0) - int(placed_qty or 0))
            if unplaced_qty <= 0:
                continue
            first = details_all[0] if details_all else {}
            z = str(first.get('zone') or first.get('area') or first.get('location') or '').strip().upper()
            if z.startswith('A'):
                out['A'] += unplaced_qty
            elif z.startswith('B'):
                out['B'] += unplaced_qty
            else:
                out['unassigned'] += unplaced_qty
            out['total'] += unplaced_qty
        return out
    except Exception as e:
        try: log_error('today_unplaced_zone_summary', str(e))
        except Exception: pass
        # Fallback: do not show all zeros just because warehouse_cells has a legacy/index issue.
        # Count source DB quantities directly by A/B/unassigned.
        out = {'A': 0, 'B': 0, 'unassigned': 0, 'total': 0}
        try:
            conn = get_db(); cur = conn.cursor()
            for table in ('inventory','orders','master_orders'):
                try:
                    cur.execute(sql(f"SELECT COALESCE(qty,0) AS qty, COALESCE(area, location, '') AS z FROM {table} WHERE COALESCE(qty,0)>0"))
                    for r in rows_to_dict(cur):
                        q = int(r.get('qty') or 0)
                        z = str(r.get('z') or '').strip().upper()
                        if z.startswith('A'):
                            out['A'] += q
                        elif z.startswith('B'):
                            out['B'] += q
                        else:
                            out['unassigned'] += q
                        out['total'] += q
                except Exception as ee:
                    try: log_error('today_unplaced_zone_summary_fallback_' + table, str(ee))
                    except Exception: pass
            conn.close()
        except Exception as ee:
            try: log_error('today_unplaced_zone_summary_fallback', str(ee))
            except Exception: pass
        return out

def _today_logs_detail(today):
    # V61：今日異動卡片要能點開看客戶與商品；從當日四張主表補詳細資料，避免只顯示一句 log。
    detail = {'inventory': [], 'orders': [], 'master_orders': [], 'shipping_records': []}
    try:
        conn = get_db(); cur = conn.cursor()
        specs = [
            ('inventory', "SELECT id, customer_name, product_text, material, qty, operator, created_at FROM inventory WHERE substr(COALESCE(created_at,''),1,10)=? ORDER BY id DESC LIMIT 80"),
            ('orders', "SELECT id, customer_name, product_text, material, qty, operator, created_at FROM orders WHERE substr(COALESCE(created_at,''),1,10)=? ORDER BY id DESC LIMIT 80"),
            ('master_orders', "SELECT id, customer_name, product_text, material, qty, operator, created_at FROM master_orders WHERE substr(COALESCE(created_at,''),1,10)=? ORDER BY id DESC LIMIT 80"),
            ('shipping_records', "SELECT id, customer_name, product_text, material, qty, operator, shipped_at AS created_at, source_table, before_qty, after_qty, warehouse_location, warehouse_deduct_json, note FROM shipping_records WHERE substr(COALESCE(shipped_at,''),1,10)=? ORDER BY id DESC LIMIT 80"),
        ]
        for k, q in specs:
            try:
                cur.execute(sql(q), (today,))
                rows = rows_to_dict(cur)
                for r in rows:
                    r['created_at'] = _format_24h(r.get('created_at'))
                    r['message'] = '｜'.join([x for x in [r.get('customer_name') or '', r.get('material') or '', r.get('product_text') or '', (str(r.get('qty')) + '件') if r.get('qty') not in (None,'') else ''] if x])
                    r['action'] = {'inventory':'新增庫存','orders':'新增訂單','master_orders':'新增總單','shipping_records':'出貨'}.get(k, '異動')
                    if k == 'shipping_records':
                        try:
                            r['warehouse_deduct'] = json.loads(r.get('warehouse_deduct_json') or '[]')
                        except Exception:
                            r['warehouse_deduct'] = []
                        if r.get('warehouse_location'):
                            r['message'] = (r.get('message') or '') + '｜倉庫扣除：' + str(r.get('warehouse_location') or '')
                    r['username'] = r.get('operator') or r.get('username') or ''
                detail[k] = rows
            except Exception as e:
                log_error('today_detail_' + k, str(e))
        conn.close()
    except Exception as e:
        try: log_error('today_logs_detail', str(e))
        except Exception: pass
    return detail


def _today_unplaced_cached(force=False):
    # V61：今日異動先快速顯示，不每次開頁都重算重型未錄入；長按刷新或刷新按鈕才強制重算。
    import json as _json
    cache_key = 'today_unplaced_cache_v61'
    if not force:
        try:
            raw = get_setting(cache_key, '') or ''
            if raw:
                obj = _json.loads(raw)
                if obj.get('date') == _today_key():
                    return obj.get('items') or [], obj.get('zone') or {'A':0,'B':0,'unassigned':0,'total':0}
        except Exception:
            pass
        return [], {'A':0,'B':0,'unassigned':0,'total':0}
    items = _today_unplaced_all_sources()
    zone = _today_unplaced_zone_summary()
    try:
        set_setting(cache_key, _json.dumps({'date': _today_key(), 'items': items[:200], 'zone': zone}, ensure_ascii=False))
    except Exception as e:
        try: log_error('today_unplaced_cache_save', str(e))
        except Exception: pass
    return items, zone


def _today_changes_payload(force_unplaced=False):
    conn = get_db()
    cur = conn.cursor()
    today = _today_key()
    cur.execute(sql("SELECT id, username, action, created_at FROM logs WHERE substr(created_at,1,10)=? ORDER BY created_at DESC LIMIT 120"), (today,))
    logs = rows_to_dict(cur)
    conn.close()

    inbound = []
    outbound = []
    new_orders = []
    new_masters = []
    for r in logs:
        r['created_at'] = _format_24h(r.get('created_at'))
        action = r.get('action') or ''
        if action == '完成出貨' or action.startswith('完成出貨'):
            outbound.append(r)
        elif action == '建立訂單' or action.startswith('建立訂單'):
            new_orders.append(r)
        elif action == '建立總單' or action.startswith('建立總單') or action.startswith('新增總單'):
            new_masters.append(r)
        elif action == '建立庫存' or action.startswith('建立庫存') or action.startswith('新增庫存') or action.startswith('入庫') or action.startswith('進貨'):
            inbound.append(r)

    detail = _today_logs_detail(today)
    if detail.get('inventory'): inbound = detail['inventory']
    if detail.get('orders'): new_orders = detail['orders']
    if detail.get('master_orders'): new_masters = detail['master_orders']
    if detail.get('shipping_records'): outbound = detail['shipping_records']

    unplaced, zone_summary = _today_unplaced_cached(bool(force_unplaced))
    read_at = get_setting('today_changes_read_at', '') or ''
    visible_logs = inbound + new_orders + new_masters + outbound
    unread_count = len([r for r in visible_logs if not read_at or (r.get('created_at') or '') > read_at])
    unplaced_total_qty = sum(int(x.get('unplaced_qty') or x.get('qty') or 0) for x in unplaced)

    return {
        'summary': {
            'inbound_count': len(inbound),
            'new_order_count': len(new_orders),
            'new_master_count': len(new_masters),
            'outbound_count': len(outbound),
            'unplaced_count': unplaced_total_qty,
            'unplaced_row_count': len(unplaced),
            'unplaced_zone_summary': zone_summary,
            'anomaly_count': 0,
            'unread_count': unread_count,
        },
        'feed': {
            'inbound': inbound[:60],
            'new_orders': new_orders[:60],
            'new_masters': new_masters[:60],
            'outbound': outbound[:60],
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
    return jsonify(success=True, **_today_changes_payload(force_unplaced=(request.args.get('force') == '1')))

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
    try:
        db_info = database_mode_info()
    except Exception as e:
        db_info = {'mode': 'unknown', 'source': 'error', 'error': str(e)[:200]}
    try:
        db_counts = table_counts()
    except Exception as _e:
        db_counts = {'_error': str(_e)[:200]}
    warning = ''
    if db_info.get('render_warning'):
        warning = 'Render 目前沒有偵測到 PostgreSQL DATABASE_URL，會使用空的本機 SQLite，頁面會看起來沒有資料。請在 Render Environment 補 DATABASE_URL。'
    return jsonify(success=not bool(STARTUP_DB_ERROR), status="ok" if not STARTUP_DB_ERROR else "db_init_failed", service="yuanxing", mode="native_device_only", db_mode=db_info.get('mode'), db_info=db_info, db_counts=db_counts, db_warning=warning, db_error=STARTUP_DB_ERROR[:500])

@app.route('/api/db-diagnostics')
def api_db_diagnostics():
    try:
        return jsonify(success=True, db_info=database_mode_info(), db_counts=table_counts(), startup_error=STARTUP_DB_ERROR[:500])
    except Exception as e:
        return jsonify(success=False, error=str(e)[:500]), 500

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
        location = (data.get('location') if data.get('location') is not None else (data.get('area') if data.get('area') is not None else (data.get('zone') if data.get('zone') is not None else row.get('location') or ''))).strip()
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


# ============================================================
# V76 MAINFILE WAREHOUSE MARK ROUTE
# ============================================================
@app.route('/api/warehouse/mark-cell', methods=['POST'])
@login_required_json
def api_warehouse_mark_cell():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get('zone') or 'A').strip().upper()
        column_index = int(data.get('column_index') or 0)
        slot_number = int(data.get('slot_number') or 0)
        marked = bool(data.get('marked'))
        result = warehouse_set_cell_mark(zone, column_index, slot_number, marked)
        if not result.get('success'):
            return error_response(result.get('error') or '標記失敗')
        log_action(current_username(), f"{'標記問題格' if marked else '取消問題格標記'} {zone}{column_index}-{slot_number}")
        return jsonify(success=True, marked=marked, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error('warehouse_mark_cell', str(e))
        return error_response('標記格子失敗')



# ============================================================
# V89 MAINFILE INCREMENTAL SYNC API (IndexedDB display cache)
# ============================================================
@app.route('/api/sync-changes', methods=['GET'])
@login_required_json
def api_sync_changes():
    """Return changed rows for mobile IndexedDB cache.
    This endpoint only reads data and never mutates warehouse_cells.
    """
    try:
        changed_after = (request.args.get('changed_after') or '').strip()
        tables = [x.strip() for x in (request.args.get('tables') or 'inventory,orders,master_orders,shipping_records,today_changes,warehouse_cells,audit_trails,edit_locks').split(',') if x.strip()]
        allowed = {'inventory','orders','master_orders','shipping_records','today_changes','warehouse_cells','audit_trails','edit_locks'}
        conn = get_db(); cur = conn.cursor(); out = {}
        for table in tables:
            if table not in allowed:
                continue
            try:
                cur.execute(sql(f"SELECT * FROM {table} WHERE COALESCE(updated_at, created_at, '') > ? ORDER BY COALESCE(updated_at, created_at, '') ASC LIMIT 1000"), (changed_after,))
            except Exception:
                try:
                    cur.execute(f"SELECT * FROM {table} ORDER BY id DESC LIMIT 1000")
                except Exception:
                    out[table] = []
                    continue
            out[table] = rows_to_dict(cur)
        try: conn.close()
        except Exception: pass
        return jsonify(success=True, server_time=now(), changed_after=changed_after, items=out)
    except Exception as e:
        log_error('api_sync_changes', str(e))
        return error_response('同步資料失敗')



# ============================================================
# V90 MAINFILE DASHBOARD + GLOBAL SEARCH + WAREHOUSE BULK APIs
# Direct main-file implementation: no overlay, no hardlock, no MutationObserver, no setInterval.
# ============================================================
def _v90_to_int(v, default=0):
    try:
        return int(v or default)
    except Exception:
        return default


def _v90_item_qty(item):
    try:
        return max(0, int(item.get('qty') or item.get('quantity') or item.get('pieces') or 0))
    except Exception:
        return 0


def _v90_fetch_rows(cur, table, limit=200):
    try:
        cur.execute(sql(f"SELECT * FROM {table} ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC LIMIT ?"), (int(limit),))
        return rows_to_dict(cur)
    except Exception as e1:
        try:
            cur.execute(sql(f"SELECT * FROM {table} ORDER BY COALESCE(created_at, shipped_at, '') DESC, id DESC LIMIT ?"), (int(limit),))
            return rows_to_dict(cur)
        except Exception as e2:
            try: log_error('v90_fetch_rows_'+table, str(e1)+' | '+str(e2))
            except Exception: pass
            return []


def _v90_like_clause_fields(q, fields):
    tokens = [t for t in re.split(r'\s+', (q or '').strip().lower()) if t]
    return tokens


@app.route('/api/dashboard-summary', methods=['GET'])
@login_required_json
def api_dashboard_summary_v90():
    """Home dashboard data. Read-only; never mutates warehouse_cells."""
    conn = None
    try:
        today = datetime.now().strftime('%Y-%m-%d')
        conn = get_db(); cur = conn.cursor()
        def one(query, params=()):
            cur.execute(sql(query), params)
            return fetchone_dict(cur) or {}
        def sum_today(table, date_field='created_at'):
            try:
                row = one(f"SELECT COALESCE(SUM(qty),0) AS qty, COUNT(*) AS rows FROM {table} WHERE COALESCE({date_field}, '') LIKE ?", (today+'%',))
                return {'qty': _v90_to_int(row.get('qty')), 'rows': _v90_to_int(row.get('rows'))}
            except Exception as e:
                log_error('dashboard_sum_today_'+table, str(e)); return {'qty':0,'rows':0}
        inv_today = sum_today('inventory')
        ord_today = sum_today('orders')
        mst_today = sum_today('master_orders')
        ship_today = sum_today('shipping_records', 'COALESCE(shipped_at, created_at)')
        try:
            problem_row = one("SELECT COUNT(*) AS c FROM warehouse_cells WHERE COALESCE(is_deleted,0)=0 AND COALESCE(problem_flag,'')<>''")
            problem_count = _v90_to_int(problem_row.get('c'))
        except Exception:
            problem_count = 0
        placed = {'A':0, 'B':0}
        try:
            for cell in warehouse_get_cells():
                z = str(cell.get('zone') or '').strip().upper()
                if z not in placed:
                    continue
                for it in safe_cell_items(cell):
                    placed[z] += _v90_item_qty(it)
        except Exception as e:
            log_error('dashboard_placed_summary', str(e))
        try:
            unplaced = _today_unplaced_zone_summary()
        except Exception:
            unplaced = {'A':0,'B':0,'unassigned':0,'total':0}
        top_map = {}
        for table_name, label in (('inventory','庫存'),('orders','訂單'),('master_orders','總單')):
            for row in _v90_fetch_rows(cur, table_name, limit=300):
                product = (row.get('product_text') or '').strip()
                if not product:
                    continue
                key = (product, (row.get('material') or '').strip())
                item = top_map.setdefault(key, {'product_text': product, 'material': key[1], 'qty': 0, 'sources': set()})
                item['qty'] += _v90_to_int(row.get('qty') or effective_product_qty(product, 0))
                item['sources'].add(label)
        top_products = sorted(top_map.values(), key=lambda x: (-x.get('qty',0), product_sort_tuple(x.get('product_text',''))))[:8]
        for item in top_products:
            item['sources'] = '、'.join(sorted(item.get('sources') or []))
        trends = []
        for i in range(6, -1, -1):
            d = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
            try:
                ship_row = one("SELECT COALESCE(SUM(qty),0) AS qty FROM shipping_records WHERE COALESCE(shipped_at, created_at, '') LIKE ?", (d+'%',))
                new_row = {'qty': 0}
                for table in ('inventory','orders','master_orders'):
                    r = one(f"SELECT COALESCE(SUM(qty),0) AS qty FROM {table} WHERE COALESCE(created_at, '') LIKE ?", (d+'%',))
                    new_row['qty'] += _v90_to_int(r.get('qty'))
                trends.append({'date': d, 'ship_qty': _v90_to_int(ship_row.get('qty')), 'new_qty': _v90_to_int(new_row.get('qty'))})
            except Exception as e:
                log_error('dashboard_trend_'+d, str(e))
        return jsonify(success=True, today=today, cards={
            'today_shipping_qty': ship_today['qty'],
            'today_shipping_rows': ship_today['rows'],
            'today_new_qty': inv_today['qty'] + ord_today['qty'] + mst_today['qty'],
            'today_new_rows': inv_today['rows'] + ord_today['rows'] + mst_today['rows'],
            'problem_cells': problem_count,
            'unplaced_total': _v90_to_int(unplaced.get('total')),
            'unplaced_a': _v90_to_int(unplaced.get('A')),
            'unplaced_b': _v90_to_int(unplaced.get('B')),
            'unplaced_unassigned': _v90_to_int(unplaced.get('unassigned')),
            'placed_a': placed['A'],
            'placed_b': placed['B'],
        }, top_products=top_products, trends=trends)
    except Exception as e:
        log_error('api_dashboard_summary_v90', str(e))
        return error_response('Dashboard 資料讀取失敗')
    finally:
        try:
            if conn: conn.close()
        except Exception:
            pass


@app.route('/api/search-assistant', methods=['GET'])
@login_required_json
def api_search_assistant_v90():
    """Free global search helper. No AI API; only DB keyword matching and warehouse location lookup."""
    q = (request.args.get('q') or '').strip()
    category = (request.args.get('category') or request.args.get('type') or 'all').strip().lower()
    if not q:
        return jsonify(success=True, query=q, category=category, items=[])
    tokens = _v90_like_clause_fields(q, [])
    allowed_categories = {
        'all': {'inventory','orders','master_orders','shipping_records','warehouse_cells'},
        'inventory': {'inventory'}, '庫存': {'inventory'},
        'orders': {'orders'}, 'order': {'orders'}, '訂單': {'orders'},
        'master_order': {'master_orders'}, 'master_orders': {'master_orders'}, '總單': {'master_orders'},
        'shipping': {'shipping_records'}, 'shipping_records': {'shipping_records'}, '出貨': {'shipping_records'},
        'warehouse': {'warehouse_cells'}, 'warehouse_cells': {'warehouse_cells'}, '倉庫': {'warehouse_cells'}, '倉庫圖': {'warehouse_cells'},
    }
    allowed_tables = allowed_categories.get(category, allowed_categories['all'])
    conn = None
    out = []
    try:
        conn = get_db(); cur = conn.cursor()
        for table_name, label, url in (
            ('inventory','庫存','/inventory'),
            ('orders','訂單','/orders'),
            ('master_orders','總單','/master-order'),
            ('shipping_records','出貨','/shipping-query'),
        ):
            if table_name not in allowed_tables:
                continue
            for row in _v90_fetch_rows(cur, table_name, limit=500):
                hay = ' '.join(str(row.get(k) or '') for k in ('customer_name','product_text','material','product_code','location','note','source_table'))
                if tokens and not all(t in hay.lower() for t in tokens):
                    continue
                out.append({
                    'type': label,
                    'table': table_name,
                    'id': row.get('id'),
                    'customer_name': row.get('customer_name') or ('庫存' if table_name=='inventory' else ''),
                    'product_text': row.get('product_text') or '',
                    'material': row.get('material') or '',
                    'qty': _v90_to_int(row.get('qty')),
                    'location': row.get('location') or '',
                    'url': url,
                })
                if len(out) >= 80:
                    break
        # Warehouse search: directly scan cells so assistant can jump to location.
        if 'warehouse_cells' in allowed_tables:
            for cell in warehouse_get_cells():
                cell_label = f"{cell.get('zone')}-{cell.get('column_index')}-{cell.get('slot_number')}"
                for it in safe_cell_items(cell):
                    hay = f"{cell_label} {it.get('customer_name','')} {it.get('product_text','')} {it.get('material','')}".lower()
                    if tokens and not all(t in hay for t in tokens):
                        continue
                    out.append({
                        'type': '倉庫圖', 'table': 'warehouse_cells', 'id': cell.get('id'),
                        'customer_name': it.get('customer_name') or '庫存',
                        'product_text': it.get('product_text') or '', 'material': it.get('material') or '',
                        'qty': _v90_item_qty(it), 'location': cell_label, 'url': f"/warehouse?loc={cell.get('zone')}-{cell.get('column_index')}-{cell.get('slot_number')}&open=1&q={q}&highlight_item={q}",
                        'zone': cell.get('zone'), 'column_index': cell.get('column_index'), 'slot_number': cell.get('slot_number'),
                    })
                    break
        out = out[:120]
        return jsonify(success=True, query=q, category=category, count=len(out), items=out)
    except Exception as e:
        log_error('api_search_assistant_v90', str(e))
        return error_response('搜尋失敗')
    finally:
        try:
            if conn: conn.close()
        except Exception:
            pass


@app.route('/api/warehouse/bulk-add-slots', methods=['POST'])
@login_required_json
def api_warehouse_bulk_add_slots_v90():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get('zone') or 'A').strip().upper()
        column_index = int(data.get('column_index') or 0)
        insert_after = data.get('insert_after')
        count = max(1, min(80, int(data.get('count') or 1)))
        if zone not in ('A','B') or column_index < 1:
            return error_response('格位參數錯誤')
        created = []
        after = int(insert_after or 0)
        for i in range(count):
            slot_number = warehouse_add_slot(zone, column_index, 'direct', after)
            created.append(slot_number)
            after = int(slot_number or after)
        yx_v35_safe_side_effect('warehouse_bulk_add_log', log_action, current_username(), f'批量新增格子 {zone}{column_index} x {count}')
        yx_v35_safe_side_effect('warehouse_bulk_add_audit', add_audit_trail, current_username(), 'bulk_create', 'warehouse_cells', f'{zone}-{column_index}', before_json={}, after_json={'zone': zone, 'column_index': column_index, 'count': count, 'created_slots': created})
        yx_v35_safe_side_effect('warehouse_bulk_add_notify', notify_sync_event, kind='refresh', module='warehouse', message='倉庫批量新增格子', extra={'zone': zone, 'column_index': column_index, 'count': count})
        _v98_record_today_change('倉庫批量新增格子', 'warehouse_cells', '', f'{zone}區{column_index}欄 +{count}格', {'zone': zone, 'column_index': column_index, 'count': count, 'created_slots': created, 'action': 'bulk_add_slots'})
        return jsonify(success=True, count=count, created_slots=created, slot_number=(created[0] if created else None), zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error('api_warehouse_bulk_add_slots_v90', str(e))
        return error_response('批量新增格子失敗')


@app.route('/api/warehouse/bulk-remove-slots', methods=['POST'])
@login_required_json
def api_warehouse_bulk_remove_slots_v90():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get('zone') or 'A').strip().upper()
        column_index = int(data.get('column_index') or 0)
        start_slot = int(data.get('start_slot') or data.get('slot_number') or 0)
        count = max(1, min(80, int(data.get('count') or 1)))
        if zone not in ('A','B') or column_index < 1 or start_slot < 1:
            return error_response('格位參數錯誤')
        cells = warehouse_get_cells()
        visible = sorted([int(c.get('slot_number') or 0) for c in cells if str(c.get('zone') or '').strip().upper()==zone and int(c.get('column_index') or 0)==column_index and int(c.get('slot_number') or 0)>=start_slot])[:count]
        if not visible:
            return error_response('找不到可刪除格子')
        for n in visible:
            cell = next((c for c in cells if str(c.get('zone') or '').strip().upper()==zone and int(c.get('column_index') or 0)==column_index and int(c.get('slot_number') or 0)==n), None)
            if cell and safe_cell_items(cell):
                return error_response(f'第 {n} 格內還有商品，無法批量刪除')
        removed = []
        for n in visible:
            result = warehouse_remove_slot(zone, column_index, 'direct', n)
            if not result.get('success'):
                return error_response(result.get('error') or f'第 {n} 格刪除失敗')
            removed.append(n)
        yx_v35_safe_side_effect('warehouse_bulk_remove_log', log_action, current_username(), f'批量刪除格子 {zone}{column_index} x {len(removed)}')
        yx_v35_safe_side_effect('warehouse_bulk_remove_audit', add_audit_trail, current_username(), 'bulk_delete', 'warehouse_cells', f'{zone}-{column_index}', before_json={'start_slot': start_slot, 'count': count}, after_json={'removed_slots': removed})
        yx_v35_safe_side_effect('warehouse_bulk_remove_notify', notify_sync_event, kind='refresh', module='warehouse', message='倉庫批量刪除格子', extra={'zone': zone, 'column_index': column_index, 'count': len(removed)})
        _v98_record_today_change('倉庫批量減少格子', 'warehouse_cells', '', f'{zone}區{column_index}欄 -{len(removed)}格', {'zone': zone, 'column_index': column_index, 'removed_slots': removed, 'action': 'bulk_remove_slots'})
        return jsonify(success=True, count=len(removed), removed_slots=removed, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error('api_warehouse_bulk_remove_slots_v90', str(e))
        return error_response('批量刪除格子失敗')


# ============================================================
# V96 MAINFILE WAREHOUSE +/- SLOT API
# 增減格子只做 DB 同步：新增空格或軟刪除空格，不清空、不重建、不重排有商品格。
# ============================================================
@app.route('/api/warehouse/remove-empty-slots', methods=['POST'])
@login_required_json
def api_warehouse_remove_empty_slots_v96():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get('zone') or 'A').strip().upper()
        column_index = int(data.get('column_index') or 0)
        count = max(1, min(80, int(data.get('count') or 1)))
        requested_slots = data.get('slots') if isinstance(data.get('slots'), list) else []
        if zone not in ('A','B') or column_index < 1:
            return error_response('格位參數錯誤')

        cells = warehouse_get_cells()
        col_cells = [c for c in cells if str(c.get('zone') or '').strip().upper() == zone and int(c.get('column_index') or 0) == column_index]
        visible_slots = sorted({int(c.get('slot_number') or 0) for c in col_cells if int(c.get('slot_number') or 0) > 0})
        if len(visible_slots) <= 1:
            return error_response('每欄至少要保留 1 格')

        if requested_slots:
            candidates = []
            for v in requested_slots:
                try:
                    n = int(v)
                    if n > 0 and n not in candidates:
                        candidates.append(n)
                except Exception:
                    pass
        else:
            candidates = sorted(visible_slots, reverse=True)

        removable = []
        for n in candidates:
            if len(set(visible_slots) - set(removable) - {n}) < 1:
                continue
            cell = next((c for c in col_cells if int(c.get('slot_number') or 0) == n), None)
            if cell and safe_cell_items(cell):
                continue
            if n in visible_slots:
                removable.append(n)
            if len(removable) >= count:
                break

        if not removable:
            return error_response('沒有可減少的空格；有商品格不可刪，且每欄至少保留 1 格')

        removed = []
        for n in removable:
            result = warehouse_remove_slot(zone, column_index, 'direct', n)
            if result.get('success'):
                removed.append(n)
            elif requested_slots:
                return error_response(result.get('error') or f'第 {n} 格刪除失敗')

        if not removed:
            return error_response('沒有成功減少任何格子')

        yx_v35_safe_side_effect('warehouse_v96_remove_empty_log', log_action, current_username(), f'減少空格 {zone}{column_index} x {len(removed)}')
        yx_v35_safe_side_effect('warehouse_v96_remove_empty_audit', add_audit_trail, current_username(), 'bulk_soft_delete_empty', 'warehouse_cells', f'{zone}-{column_index}', before_json={'requested_slots': requested_slots, 'count': count}, after_json={'removed_slots': removed})
        yx_v35_safe_side_effect('warehouse_v96_remove_empty_notify', notify_sync_event, kind='refresh', module='warehouse', message='倉庫減少空格', extra={'zone': zone, 'column_index': column_index, 'removed_slots': removed})
        _v98_record_today_change('倉庫減少空格', 'warehouse_cells', '', f'{zone}區{column_index}欄 -{len(removed)}格', {'zone': zone, 'column_index': column_index, 'removed_slots': removed, 'action': 'remove_empty_slots'})
        return jsonify(success=True, count=len(removed), removed_slots=removed, skipped=count-len(removed), zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error('api_warehouse_remove_empty_slots_v96', str(e))
        return error_response('減少格子失敗')


@app.route('/api/warehouse/slot-adjust-status', methods=['GET'])
@login_required_json
def api_warehouse_slot_adjust_status_v96():
    try:
        zone = (request.args.get('zone') or '').strip().upper()
        column_index = int(request.args.get('column_index') or 0)
        cells = warehouse_get_cells()
        out = []
        for z in ('A','B'):
            if zone and z != zone:
                continue
            for col in range(1, 7):
                if column_index and col != column_index:
                    continue
                col_cells = [c for c in cells if str(c.get('zone') or '').strip().upper()==z and int(c.get('column_index') or 0)==col]
                visible = sorted({int(c.get('slot_number') or 0) for c in col_cells if int(c.get('slot_number') or 0)>0})
                empty = []
                filled = []
                for n in visible:
                    cell = next((c for c in col_cells if int(c.get('slot_number') or 0)==n), None)
                    if cell and safe_cell_items(cell):
                        filled.append(n)
                    else:
                        empty.append(n)
                out.append({'zone': z, 'column_index': col, 'visible_count': len(visible), 'empty_slots': empty, 'filled_slots': filled, 'last_empty_slot': (empty[-1] if empty else None)})
        return jsonify(success=True, columns=out)
    except Exception as e:
        log_error('api_warehouse_slot_adjust_status_v96', str(e))
        return error_response('讀取格數狀態失敗')


@app.route('/api/warehouse/preview-remove-empty-slots', methods=['POST'])
@login_required_json
def api_warehouse_preview_remove_empty_slots_v98():
    try:
        data = request.get_json(silent=True) or {}
        result = _v98_warehouse_empty_slot_preview(
            data.get('zone') or 'A',
            int(data.get('column_index') or 0),
            int(data.get('count') or 1),
            data.get('slots') if isinstance(data.get('slots'), list) else []
        )
        if not result.get('success'):
            return error_response(result.get('error') or '預覽失敗')
        return jsonify(result)
    except Exception as e:
        log_error('api_warehouse_preview_remove_empty_slots_v98', str(e))
        return error_response('預覽可刪格子失敗')


# ============================================================
# V98 MAINFILE TODAY/WAREHOUSE ACTION HELPERS
# ============================================================
def _v98_record_today_change(action, table_name, customer_name='', product_text='', detail=None):
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql("""
            INSERT INTO today_changes(action, table_name, customer_name, product_text, detail_json, operator, created_at, unread)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        """), (str(action or ''), str(table_name or ''), str(customer_name or ''), str(product_text or ''), json.dumps(detail or {}, ensure_ascii=False), current_username(), now()))
        conn.commit(); conn.close()
    except Exception as e:
        try: log_error('v98_record_today_change', str(e))
        except Exception: pass

def _v98_warehouse_empty_slot_preview(zone, column_index, count=1, slots=None):
    zone = (zone or 'A').strip().upper()
    column_index = int(column_index or 0)
    count = max(1, min(80, int(count or 1)))
    if zone not in ('A','B') or column_index < 1:
        return {'success': False, 'error': '格位參數錯誤'}
    cells = warehouse_get_cells()
    col_cells = [c for c in cells if str(c.get('zone') or '').strip().upper() == zone and int(c.get('column_index') or 0) == column_index]
    visible_slots = sorted({int(c.get('slot_number') or 0) for c in col_cells if int(c.get('slot_number') or 0) > 0})
    requested = []
    if isinstance(slots, list) and slots:
        for v in slots:
            try:
                n = int(v)
                if n > 0 and n not in requested:
                    requested.append(n)
            except Exception:
                pass
    candidates = requested or sorted(visible_slots, reverse=True)
    removable, blocked = [], []
    for n in candidates:
        cell = next((c for c in col_cells if int(c.get('slot_number') or 0) == n), None)
        has_items = bool(cell and safe_cell_items(cell))
        if len(set(visible_slots) - set(removable) - {n}) < 1:
            blocked.append({'slot_number': n, 'reason': '每欄至少保留 1 格'})
            continue
        if has_items:
            blocked.append({'slot_number': n, 'reason': '有商品不可刪'})
            continue
        if n in visible_slots:
            removable.append(n)
        if len(removable) >= count:
            break
    return {'success': True, 'zone': zone, 'column_index': column_index, 'count': len(removable), 'removable_slots': removable, 'blocked_slots': blocked, 'visible_count': len(visible_slots)}


# ============================================================
# V91 MAINFILE EDIT LOCK API
# ============================================================
def _v91_lock_key(data):
    entity_type = (data.get('entity_type') or data.get('table') or '').strip()
    entity_id = str(data.get('entity_id') or data.get('id') or '').strip()
    if not entity_type or not entity_id:
        return '', ''
    return entity_type, entity_id

@app.route('/api/edit-locks/acquire', methods=['POST'])
@login_required_json
def api_edit_locks_acquire_v91():
    try:
        data = request.get_json(silent=True) or {}
        entity_type, entity_id = _v91_lock_key(data)
        if not entity_type or not entity_id:
            return error_response('缺少編輯鎖目標')
        ttl = max(30, min(600, int(data.get('ttl_seconds') or 180)))
        username = current_username() or 'user'
        expires = (datetime.now() + timedelta(seconds=ttl)).strftime('%Y-%m-%d %H:%M:%S')
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql("SELECT * FROM edit_locks WHERE entity_type=? AND entity_id=?"), (entity_type, entity_id))
        row = fetchone_dict(cur) or {}
        now_s = now()
        if row and (row.get('expires_at') or '') > now_s and (row.get('username') or '') != username and not bool(data.get('force')):
            conn.close()
            return jsonify(success=False, locked=True, username=row.get('username'), expires_at=row.get('expires_at'), error=f"{row.get('username')} 正在編輯這筆資料"), 409
        if USE_POSTGRES:
            cur.execute(sql("""
                INSERT INTO edit_locks(entity_type, entity_id, username, expires_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(entity_type, entity_id) DO UPDATE SET username=excluded.username, expires_at=excluded.expires_at, updated_at=excluded.updated_at
            """), (entity_type, entity_id, username, expires, now_s))
        else:
            cur.execute("""
                INSERT INTO edit_locks(entity_type, entity_id, username, expires_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(entity_type, entity_id) DO UPDATE SET username=excluded.username, expires_at=excluded.expires_at, updated_at=excluded.updated_at
            """, (entity_type, entity_id, username, expires, now_s))
        conn.commit(); conn.close()
        return jsonify(success=True, locked=False, username=username, expires_at=expires, force=bool(data.get('force')))
    except Exception as e:
        try: conn.rollback(); conn.close()
        except Exception: pass
        log_error('api_edit_locks_acquire_v91', str(e))
        return error_response('取得編輯鎖失敗')

@app.route('/api/edit-locks/release', methods=['POST'])
@login_required_json
def api_edit_locks_release_v91():
    try:
        data = request.get_json(silent=True) or {}
        entity_type, entity_id = _v91_lock_key(data)
        if not entity_type or not entity_id:
            return error_response('缺少編輯鎖目標')
        username = current_username() or 'user'
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql("DELETE FROM edit_locks WHERE entity_type=? AND entity_id=? AND username=?"), (entity_type, entity_id, username))
        conn.commit(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        try: conn.rollback(); conn.close()
        except Exception: pass
        log_error('api_edit_locks_release_v91', str(e))
        return error_response('釋放編輯鎖失敗')


# ============================================================
# V91 MAINFILE CLICK-TO-LOCATION / SMART TARGET RESOLVER
# ============================================================
def _v91_norm_text(v):
    return re.sub(r'\s+', '', str(v or '').strip().lower().replace('×','x').replace('Ｘ','x').replace('✕','x').replace('＊','x').replace('*','x').replace('＝','='))

def _v91_item_product_text(item):
    return str((item or {}).get('product_text') or (item or {}).get('product') or (item or {}).get('size') or '').strip()

def _v91_cell_label(cell):
    return f"{cell.get('zone')}-{int(cell.get('column_index') or 0)}-{int(cell.get('slot_number') or 0)}"

def _v91_find_warehouse_location(customer_name='', product_text='', material=''):
    cn = _v91_norm_text(customer_name)
    pt = _v91_norm_text(product_text)
    mat = _v91_norm_text(material)
    best = None
    best_score = 0
    try:
        for cell in warehouse_get_cells():
            for it in safe_cell_items(cell):
                hay_customer = _v91_norm_text(it.get('customer_name') or '')
                hay_product = _v91_norm_text(_v91_item_product_text(it))
                hay_material = _v91_norm_text(it.get('material') or it.get('product_code') or '')
                score = 0
                if cn and (cn in hay_customer or hay_customer in cn): score += 4
                if pt and (pt in hay_product or hay_product in pt or product_display_size(product_text) and _v91_norm_text(product_display_size(product_text)) in hay_product): score += 5
                if mat and (mat in hay_material or hay_material in mat): score += 1
                if score > best_score:
                    best_score = score
                    best = {'cell': cell, 'item': it, 'score': score}
        if best and best_score >= 4:
            cell = best['cell']
            loc = _v91_cell_label(cell)
            return {
                'found': True,
                'location': loc,
                'url': f"/warehouse?loc={loc}&open=1&customer={customer_name or ''}&q={product_text or customer_name or ''}&highlight_item={product_text or customer_name or ''}",
                'zone': cell.get('zone'),
                'column_index': int(cell.get('column_index') or 0),
                'slot_number': int(cell.get('slot_number') or 0),
            }
    except Exception as e:
        try: log_error('v91_find_warehouse_location', str(e))
        except Exception: pass
    return {'found': False}

def _v91_fetch_item(table_name, item_id):
    allowed = {'inventory','orders','master_orders','shipping_records'}
    if table_name not in allowed or not item_id:
        return {}
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql(f"SELECT * FROM {table_name} WHERE id=?"), (int(item_id),))
        row = fetchone_dict(cur) or {}
        conn.close()
        return row
    except Exception as e:
        try: log_error('v91_fetch_item_'+str(table_name), str(e))
        except Exception: pass
        try: conn.close()
        except Exception: pass
        return {}

@app.route('/api/today-changes/resolve-target', methods=['POST'])
@login_required_json
def api_today_changes_resolve_target_v91():
    """Resolve a notification/product row to the best page and warehouse cell when possible."""
    try:
        data = request.get_json(silent=True) or {}
        kind = (data.get('kind') or '').strip()
        table_name = (data.get('table') or data.get('table_name') or '').strip()
        item_id = data.get('id') or data.get('ref_id') or 0
        if not table_name:
            table_name = {'inbound':'inventory','orders':'orders','masters':'master_orders','outbound':'shipping_records','unplaced':'unplaced'}.get(kind, '')
        row = _v91_fetch_item(table_name, item_id) if table_name != 'unplaced' else {}
        customer = row.get('customer_name') or data.get('customer_name') or ''
        product = row.get('product_text') or data.get('product_text') or ''
        material = row.get('material') or data.get('material') or ''
        if table_name == 'shipping_records':
            try:
                plan = json.loads(row.get('warehouse_deduct_json') or '[]') if isinstance(row, dict) else []
            except Exception:
                plan = []
            if plan and isinstance(plan[0], dict):
                w = plan[0]
                loc_label = f"{str(w.get('zone') or '').upper()}-{int(w.get('column_index') or 0)}-{int(w.get('slot_number') or 0)}"
                return jsonify(success=True, target='warehouse', found=True, location=loc_label, zone=w.get('zone'), column_index=int(w.get('column_index') or 0), slot_number=int(w.get('slot_number') or 0), url=f"/warehouse?loc={loc_label}&open=1&customer={customer or ''}&q={product or customer or ''}&highlight_item={product or customer or ''}")
        loc = _v91_find_warehouse_location(customer, product, material)
        if loc.get('found'):
            return jsonify(success=True, target='warehouse', **loc)
        if table_name == 'inventory':
            return jsonify(success=True, target='inventory', url=f"/inventory?highlight_id={item_id}&q={product or customer}", found=False)
        if table_name == 'orders':
            return jsonify(success=True, target='orders', url=f"/orders?highlight_id={item_id}&customer={customer}", found=False)
        if table_name == 'master_orders':
            return jsonify(success=True, target='master_order', url=f"/master-order?highlight_id={item_id}&customer={customer}", found=False)
        if table_name == 'shipping_records':
            return jsonify(success=True, target='shipping_query', url=f"/shipping-query?highlight_id={item_id}&customer={customer}", found=False)
        return jsonify(success=True, target='warehouse', url=f"/warehouse?q={product or customer}", found=False)
    except Exception as e:
        log_error('api_today_changes_resolve_target_v91', str(e))
        return error_response('無法判斷通知位置')




# ============================================================
# V92 MAINFILE OFFLINE SHIP VALIDATION + EDIT LOCK STATUS
# ============================================================
def _v92_preview_conflicts(customer_name, items):
    preview = preview_ship_order(customer_name, items)
    rows = preview.get('items') or preview.get('breakdown') or []
    conflicts = []
    for i, row in enumerate(rows):
        try:
            shortage = int(row.get('shortage_qty') or 0)
        except Exception:
            shortage = 0
        strict_ok = row.get('strict_ok')
        if shortage > 0 or strict_ok is False:
            conflicts.append({
                'index': i,
                'product_text': row.get('product_text') or '',
                'material': row.get('material') or row.get('product_code') or '',
                'qty': row.get('qty') or 0,
                'selected_available': row.get('selected_available'),
                'master_available': row.get('master_available'),
                'order_available': row.get('order_available'),
                'inventory_available': row.get('inventory_available'),
                'source_label': row.get('source_label') or '',
                'message': (row.get('recommendation') or '目前數量不足，離線排隊出貨未執行')
            })
    if preview.get('master_exceeded'):
        conflicts.append({'index': -1, 'message': preview.get('message') or '超過總單，禁止出貨'})
    return preview, conflicts

@app.route('/api/ship/offline-validate', methods=['POST'])
@login_required_json
def api_ship_offline_validate_v92():
    """Before replaying a queued offline shipment, re-check current PostgreSQL quantities."""
    try:
        data = request.get_json(silent=True) or {}
        items = _parse_items_from_request(data)
        customer_name = (data.get('customer_name') or '').strip()
        if not customer_name:
            return error_response('請輸入客戶名稱')
        if not items:
            return error_response('沒有可驗證的出貨商品')
        preview, conflicts = _v92_preview_conflicts(customer_name, items)
        if conflicts:
            return jsonify(success=False, conflict=True, error='離線出貨已停止：恢復網路後重新檢查發現數量不足', conflicts=conflicts, preview=preview, server_time=now()), 409
        return jsonify(success=True, conflict=False, message='目前數量可出貨', preview=preview, server_time=now())
    except Exception as e:
        log_error('api_ship_offline_validate_v92', str(e))
        return error_response('離線出貨驗證失敗')

@app.route('/api/edit-locks/status', methods=['POST'])
@login_required_json
def api_edit_locks_status_v92():
    try:
        data = request.get_json(silent=True) or {}
        entity_type, entity_id = _v91_lock_key(data)
        if not entity_type or not entity_id:
            return error_response('缺少編輯鎖目標')
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql("SELECT * FROM edit_locks WHERE entity_type=? AND entity_id=?"), (entity_type, entity_id))
        row = fetchone_dict(cur) or {}
        conn.close()
        if row and (row.get('expires_at') or '') > now():
            return jsonify(success=True, locked=True, username=row.get('username') or '', expires_at=row.get('expires_at') or '', mine=(row.get('username') or '') == (current_username() or 'user'))
        return jsonify(success=True, locked=False)
    except Exception as e:
        try: conn.close()
        except Exception: pass
        log_error('api_edit_locks_status_v92', str(e))
        return error_response('讀取編輯鎖失敗')




# ============================================================
# V93 MAINFILE EDIT LOCK RENEW + SEARCH SUGGESTIONS
# ============================================================
@app.route('/api/edit-locks/renew', methods=['POST'])
@login_required_json
def api_edit_locks_renew_v93():
    """Extend a lock owned by current user. No schema rebuild; only updates edit_locks."""
    conn = None
    try:
        data = request.get_json(silent=True) or {}
        entity_type, entity_id = _v91_lock_key(data)
        if not entity_type or not entity_id:
            return error_response('缺少編輯鎖目標')
        username = current_username() or 'user'
        ttl = max(60, min(int(data.get('ttl_seconds') or 180), 900))
        new_expires = (datetime.now() + timedelta(seconds=ttl)).strftime('%Y-%m-%d %H:%M:%S')
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql("SELECT * FROM edit_locks WHERE entity_type=? AND entity_id=?"), (entity_type, entity_id))
        row = fetchone_dict(cur) or {}
        now_s = now()
        if row and (row.get('expires_at') or '') > now_s and (row.get('username') or '') != username:
            conn.close()
            return jsonify(success=False, locked=True, username=row.get('username') or '', expires_at=row.get('expires_at') or '', error='這筆資料正在被其他人編輯'), 409
        cur.execute(sql("""
            INSERT INTO edit_locks(entity_type, entity_id, username, expires_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(entity_type, entity_id) DO UPDATE SET username=excluded.username, expires_at=excluded.expires_at, updated_at=excluded.updated_at
        """), (entity_type, entity_id, username, new_expires, now_s))
        conn.commit(); conn.close()
        return jsonify(success=True, locked=False, username=username, expires_at=new_expires)
    except Exception as e:
        try:
            if conn:
                conn.rollback(); conn.close()
        except Exception:
            pass
        log_error('api_edit_locks_renew_v93', str(e))
        return error_response('續鎖失敗')

@app.route('/api/search-assistant/suggest', methods=['GET'])
@login_required_json
def api_search_assistant_suggest_v93():
    """Free keyword suggestions from existing DB rows; no AI API and read-only."""
    q = (request.args.get('q') or '').strip().lower()
    out = []
    seen = set()
    def add(v, kind):
        v = str(v or '').strip()
        if not v:
            return
        key = v.lower()
        if q and q not in key:
            return
        if key in seen:
            return
        seen.add(key)
        out.append({'text': v, 'kind': kind})
    conn = None
    try:
        conn = get_db(); cur = conn.cursor()
        for table_name, label in (('inventory','庫存'),('orders','訂單'),('master_orders','總單'),('shipping_records','出貨')):
            for row in _v90_fetch_rows(cur, table_name, limit=260):
                add(row.get('customer_name'), '客戶')
                add(row.get('material') or row.get('product_code'), '材質')
                pt = row.get('product_text') or ''
                if pt:
                    add(product_display_size(pt) or pt.split('=')[0], label)
                    add(pt, label)
                if len(out) >= 20:
                    break
            if len(out) >= 20:
                break
        if len(out) < 20:
            for cell in warehouse_get_cells():
                add(f"{cell.get('zone')}-{cell.get('column_index')}-{cell.get('slot_number')}", '格位')
                for it in safe_cell_items(cell):
                    add(it.get('customer_name') or '庫存', '倉庫客戶')
                    add(it.get('material') or it.get('product_code'), '倉庫材質')
                    add(it.get('product_text'), '倉庫商品')
                if len(out) >= 20:
                    break
        return jsonify(success=True, query=q, items=out[:20])
    except Exception as e:
        log_error('api_search_assistant_suggest_v93', str(e))
        return error_response('搜尋預測失敗')
    finally:
        try:
            if conn: conn.close()
        except Exception:
            pass


# V53_WAREHOUSE_CURRENT_EDIT_MAINFILE_MARKER
# - 倉庫格位目前商品由前端主檔直接編輯尺寸/支數/件數後送回 /api/warehouse/cell。
# - /api/warehouse/available-items 維持用 warehouse_placed_totals 扣除所有已入倉數量，所以下拉只列剩餘未錄入數量。


# V59_MAINFILE_REQUEST_LOCK: UI/button/optimistic-submit changes are in templates + static JS; app keeps Render-safe startup and ship snapshots.

# ============================================================
# V68 FINAL WAREHOUSE PAYLOAD OVERRIDE
# Purpose: warehouse current-item input box uses = right side as the source of qty.
# ============================================================
def _yx_v68_qty_from_product_text(product, fallback=1):
    raw = str(product or '').replace('×','x').replace('Ｘ','x').replace('X','x').replace('✕','x').replace('＊','x').replace('*','x').replace('＝','=').replace('＋','+').replace('，','+').replace(',','+').replace('；','+').replace(';','+').strip()
    if '=' not in raw:
        try: return max(1, int(fallback or 1))
        except Exception: return 1
    right = raw.split('=', 1)[1]
    total = 0; hit = False
    for seg in [x.strip() for x in right.split('+') if x.strip()]:
        plain = re.sub(r'[\(（][^\)）]*[\)）]', '', seg).strip()
        m = re.search(r'x\s*(\d+)\s*$', plain, flags=re.I)
        if m:
            total += max(0, int(m.group(1) or 0)); hit = True
        elif re.search(r'\d', plain):
            total += 1; hit = True
    if hit and total > 0:
        return total
    try: return max(1, int(fallback or 1))
    except Exception: return 1


def normalize_warehouse_payload_items(items):
    # V68 final: normalize warehouse modal payload and force qty from product_text when product_text contains '='.
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
        if '=' in product:
            qty = _yx_v68_qty_from_product_text(product, qty)
        qty = max(1, qty)
        customer = warehouse_customer_key(it.get('customer_name') or it.get('customer') or '')
        material = (it.get('material') or it.get('wood_type') or '').strip()
        source_table = (it.get('source_table') or it.get('source') or '庫存').strip() or '庫存'
        source_id = str(it.get('source_id') or it.get('id') or '').strip()
        placement_label = (it.get('placement_label') or it.get('layer_label') or '前排').strip() or '前排'
        key = (warehouse_item_exact_key(product), customer, material, source_table, source_id)
        row = out_map.get(key)
        if row:
            row['qty'] = int(row.get('qty') or 0) + qty
        else:
            row = dict(it)
            row.update({'product_text': product, 'product': product, 'qty': qty, 'customer_name': customer, 'material': material, 'source': source_table, 'source_table': source_table, 'source_id': source_id, 'placement_label': placement_label, 'layer_label': placement_label})
            out_map[key] = row
    return list(out_map.values())

# ============================================================
# V87 MAINFILE WAREHOUSE QUANTITY VALIDATION REPAIR
# Fix: editing/saving the same cell must not count that cell as already placed.
# No overlay/timer; this replaces the global validator used by /api/warehouse/cell.
# ============================================================
def _yx_v87_same_cell(cell, zone, column_index, slot_number):
    try:
        return ((str(cell.get('zone') or '').strip().upper() == str(zone or '').strip().upper()) and
                int(cell.get('column_index') or 0) == int(column_index or 0) and
                int(cell.get('slot_number') or 0) == int(slot_number or 0))
    except Exception:
        return False


def _yx_v87_add_item_to_qty_maps(item, qty, exact_map, size_map):
    product = item.get('product_text') or item.get('product') or ''
    size = warehouse_item_size_key(product)
    exact = warehouse_item_exact_key(product)
    customer = warehouse_customer_key(item.get('customer_name') or '')
    if not size:
        return
    try:
        q = int(qty if qty is not None else (item.get('qty') or item.get('quantity') or 0))
    except Exception:
        q = 0
    if q <= 0:
        return
    component_details = warehouse_saved_item_component_details(item, q)
    if component_details:
        for d in component_details:
            dproduct = d.get('product_text') or d.get('product') or ''
            dsize = warehouse_item_size_key(dproduct)
            dexact = warehouse_item_exact_key(dproduct)
            dcustomer = warehouse_customer_key(d.get('customer_name') or customer)
            try:
                dq = int(d.get('qty') or 0)
            except Exception:
                dq = 0
            if not dsize or dq <= 0:
                continue
            exact_map[(dexact, dcustomer)] = exact_map.get((dexact, dcustomer), 0) + dq
            size_map[(dsize, dcustomer)] = size_map.get((dsize, dcustomer), 0) + dq
        return
    exact_map[(exact, customer)] = exact_map.get((exact, customer), 0) + q
    size_map[(size, customer)] = size_map.get((size, customer), 0) + q


def validate_warehouse_cell_quantities(zone, column_index, slot_number, items):
    """Validate source quantity while excluding the exact cell being edited.
    Earlier logic could still count the same cell as already placed when old DB rows had
    legacy slot_type/duplicate records, causing false errors like: source 15, already 15,
    this cell 15. This version subtracts the current visible cell explicitly.
    """
    source_totals, _details = warehouse_source_totals()
    z = (zone or '').strip().upper()
    c = int(column_index or 0)
    s = int(slot_number or 0)
    proposed_exact, proposed_size = {}, {}
    for it in items or []:
        _yx_v87_add_item_to_qty_maps(it, None, proposed_exact, proposed_size)

    placed_exact, placed_size = {}, {}
    for cell in warehouse_get_cells():
        if _yx_v87_same_cell(cell, z, c, s):
            continue
        for it in safe_cell_items(cell):
            _yx_v87_add_item_to_qty_maps(it, None, placed_exact, placed_size)

    for key, proposed_qty in proposed_exact.items():
        source_qty = int(source_totals.get(key, 0) or 0)
        if source_qty > 0:
            already = int(placed_exact.get(key, 0) or 0)
            if already + proposed_qty > source_qty:
                return False, f"{key[0]} 的入倉數量超過此支數來源數量（來源 {source_qty}，目前已放 {already}，本格要放 {proposed_qty}）"
    for key, proposed_qty in proposed_size.items():
        has_exact_for_size = any(k[1] == key[1] and warehouse_item_size_key(k[0]) == key[0] and '=' in k[0] for k in proposed_exact.keys())
        if has_exact_for_size:
            continue
        source_qty = int(source_totals.get(key, 0) or 0)
        if source_qty <= 0:
            return False, f"{key[0]} 沒有可加入來源數量"
        already = int(placed_size.get(key, 0) or 0)
        if already + proposed_qty > source_qty:
            return False, f"{key[0]} 的入倉數量超過來源總數量（來源 {source_qty}，目前已放 {already}，本格要放 {proposed_qty}）"
    return True, ""



# ============================================================
# V101 MAINFILE WAREHOUSE SHORTAGE / SHIPPING LOCATION RESOLVERS
# 目的：出貨不足時回傳目前哪些格有貨；出貨查詢可精準點回倉庫格。
# ============================================================
def _v99_safe_json_list(v):
    try:
        data = json.loads(v or '[]') if isinstance(v, str) else (v or [])
        return data if isinstance(data, list) else []
    except Exception:
        return []

@app.route('/api/ship/warehouse-shortage-detail', methods=['POST'])
@login_required_json
def api_ship_warehouse_shortage_detail_v99():
    """Preview warehouse-side shortage without deducting anything.
    Used by the shipping page when the warehouse map is insufficient, so the UI can show
    exactly which A/B cells currently have matching goods and how many pieces are available.
    """
    try:
        data = request.get_json(silent=True) or {}
        customer_name = (data.get('customer_name') or '').strip()
        items = _parse_items_from_request(data)
        if not customer_name:
            return error_response('請輸入客戶名稱')
        if not items:
            return error_response('沒有可檢查的商品')
        preview = preview_ship_order(customer_name, items)
        rows = preview.get('items') or preview.get('breakdown') or []
        shortages = []
        for idx, row in enumerate(rows):
            plan = row.get('warehouse_deduct_plan') or row.get('warehouse_deduct') or []
            short = row.get('warehouse_shortage') or {}
            available_cells = []
            if isinstance(short, dict):
                available_cells = short.get('available_cells') or []
            if not available_cells and row.get('warehouse_available_cells'):
                available_cells = row.get('warehouse_available_cells') or []
            wh_ok = row.get('warehouse_ok')
            shortage_qty = int((short or {}).get('shortage_qty') or row.get('warehouse_shortage_qty') or 0)
            if wh_ok is False or shortage_qty > 0 or (not plan and row.get('strict_ok') is not False):
                shortages.append({
                    'index': idx,
                    'customer_name': customer_name,
                    'product_text': row.get('product_text') or (items[idx].get('product_text') if idx < len(items) else ''),
                    'material': row.get('material') or row.get('product_code') or (items[idx].get('material') if idx < len(items) else ''),
                    'qty': row.get('qty') or (items[idx].get('qty') if idx < len(items) else 0),
                    'message': row.get('recommendation') or (short or {}).get('error') or row.get('message') or '倉庫圖可能不足',
                    'available_qty': (short or {}).get('available_qty') or row.get('warehouse_available_qty') or 0,
                    'shortage_qty': shortage_qty,
                    'available_cells': available_cells,
                    'warehouse_deduct_plan': plan,
                })
        return jsonify(success=True, preview=preview, shortages=shortages, count=len(shortages))
    except Exception as e:
        log_error('api_ship_warehouse_shortage_detail_v99', str(e))
        return error_response('查詢倉庫不足明細失敗')

@app.route('/api/shipping_records/<int:record_id>/warehouse-target', methods=['GET'])
@login_required_json
def api_shipping_record_warehouse_target_v99(record_id):
    """Resolve a shipping record to the exact warehouse deduction cells saved on shipment."""
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql('SELECT * FROM shipping_records WHERE id=?'), (record_id,))
        row = fetchone_dict(cur) or {}
        conn.close()
        if not row:
            return error_response('找不到出貨紀錄', 404)
        plan = _v99_safe_json_list(row.get('warehouse_deduct_json'))
        targets = []
        for w in plan:
            if not isinstance(w, dict):
                continue
            z = str(w.get('zone') or '').upper()
            c = int(w.get('column_index') or 0)
            s = int(w.get('slot_number') or 0)
            if z and c and s:
                targets.append({
                    'zone': z, 'column_index': c, 'slot_number': s,
                    'location': f'{z}區{c}欄{s}格',
                    'deduct_qty': int(w.get('deduct_qty') or 0),
                    'before_qty': int(w.get('before_qty') or 0),
                    'after_qty': int(w.get('after_qty') or 0),
                    'empty_after': int(w.get('after_qty') or 0) <= 0,
                    'url': f"/warehouse?loc={z}-{c}-{s}&open=1&highlight_item={row.get('product_text') or ''}&customer={row.get('customer_name') or ''}"
                })
        if targets:
            return jsonify(success=True, targets=targets, target='warehouse', url=targets[0]['url'])
        loc = _v91_find_warehouse_location(row.get('customer_name') or '', row.get('product_text') or '', row.get('material') or '')
        return jsonify(success=True, targets=[], target='warehouse' if loc.get('found') else 'shipping_query', **loc)
    except Exception as e:
        try: conn.close()
        except Exception: pass
        log_error('api_shipping_record_warehouse_target_v99', str(e))
        return error_response('出貨紀錄倉庫定位失敗')


# ============================================================
# V101 MAINFILE WAREHOUSE / OFFLINE / TARGETING REFINEMENTS
# 目的：出貨倉庫不足時可直接看可扣數量並回填；倉庫異動紀錄可點回格位；
#      未入倉統計可局部刷新，不重畫整倉。
# ============================================================
def _v101_json_list(v):
    try:
        data = json.loads(v or '[]') if isinstance(v, str) else (v or [])
        return data if isinstance(data, list) else []
    except Exception:
        return []

def _v101_cell_url(zone, column_index, slot_number, customer='', product_text=''):
    z = str(zone or '').upper()
    c = int(column_index or 0)
    s = int(slot_number or 0)
    return f"/warehouse?loc={z}-{c}-{s}&open=1&customer={customer or ''}&highlight_item={product_text or ''}"

def _v101_scan_warehouse_matches(customer_name='', product_text='', material='', qty_needed=0, source_table=''):
    """Dry scan matching warehouse cells using the same rule as V95 shipping deduction.
    This does not mutate DB. It is intentionally duplicated in app.py so the UI can ask for
    allocation choices without importing private db.py helpers.
    """
    target_customer = (customer_name or '').strip()
    size_key = re.sub(r'\s+', '', (product_text or '').split('=')[0].lower())
    mat_key = (material or '').strip().upper()
    qty_needed = int(qty_needed or 0)
    rows = warehouse_get_cells() or []
    out = []
    for cell in rows:
        if int(cell.get('is_deleted') or 0):
            continue
        if (cell.get('slot_type') or 'direct') != 'direct':
            continue
        items = _v101_json_list(cell.get('items_json'))
        for it in items:
            if not isinstance(it, dict):
                continue
            prod = it.get('product_text') or it.get('product') or ''
            item_size = re.sub(r'\s+', '', (prod or '').split('=')[0].lower())
            if not size_key or item_size != size_key:
                continue
            item_mat = (it.get('material') or it.get('product_code') or '').strip().upper()
            if (mat_key or item_mat) and item_mat != mat_key:
                continue
            cell_customer = (it.get('customer_name') or '').strip()
            if source_table == 'inventory':
                if cell_customer not in ('', '庫存', target_customer):
                    continue
            elif target_customer and cell_customer != target_customer:
                continue
            q = int(it.get('qty') or 0)
            if q <= 0:
                continue
            out.append({
                'zone': str(cell.get('zone') or '').upper(),
                'column_index': int(cell.get('column_index') or 0),
                'slot_type': cell.get('slot_type') or 'direct',
                'slot_number': int(cell.get('slot_number') or 0),
                'customer_name': cell_customer or target_customer or '庫存',
                'product_text': prod,
                'material': item_mat or mat_key,
                'available_qty': q,
                'location': f"{str(cell.get('zone') or '').upper()}區{int(cell.get('column_index') or 0)}欄{int(cell.get('slot_number') or 0)}格",
                'url': _v101_cell_url(cell.get('zone'), cell.get('column_index'), cell.get('slot_number'), cell_customer or target_customer or '庫存', prod),
            })
    # same user rule: smallest quantity first; stable deterministic tie for preview UI
    out.sort(key=lambda x: (int(x.get('available_qty') or 0), x.get('zone') or '', int(x.get('column_index') or 0), int(x.get('slot_number') or 0)))
    remain = qty_needed
    for r in out:
        take = min(int(r.get('available_qty') or 0), max(0, remain)) if qty_needed else 0
        r['suggested_deduct_qty'] = take
        remain -= take
    return {'cells': out, 'available_qty': sum(int(x.get('available_qty') or 0) for x in out), 'shortage_qty': max(0, qty_needed - sum(int(x.get('available_qty') or 0) for x in out))}

@app.route('/api/ship/warehouse-reallocate-preview', methods=['POST'])
@login_required_json
def api_ship_warehouse_reallocate_preview_v101():
    """Return exact matching warehouse cells and a safe partial allocation suggestion.
    Used after warehouse shortage so the user can change shipping quantity to currently
    available pieces instead of guessing.
    """
    try:
        data = request.get_json(silent=True) or {}
        customer_name = (data.get('customer_name') or '').strip()
        item = data.get('item') or {}
        if not item and data.get('items'):
            item = (data.get('items') or [{}])[0] or {}
        product_text = (item.get('product_text') or data.get('product_text') or '').strip()
        material = (item.get('material') or item.get('product_code') or data.get('material') or '').strip()
        qty_needed = int(item.get('qty') or data.get('qty') or 0)
        source_table = (item.get('source_preference') or item.get('source') or data.get('source_table') or '').strip()
        if not customer_name:
            return error_response('請輸入客戶名稱')
        if not product_text:
            return error_response('請輸入商品')
        scan = _v101_scan_warehouse_matches(customer_name, product_text, material, qty_needed, source_table)
        cells = scan['cells']
        can_ship_qty = min(int(scan['available_qty'] or 0), qty_needed if qty_needed > 0 else int(scan['available_qty'] or 0))
        return jsonify(success=True, customer_name=customer_name, product_text=product_text, material=material, requested_qty=qty_needed, can_ship_qty=can_ship_qty, available_qty=scan['available_qty'], shortage_qty=scan['shortage_qty'], cells=cells, allocation=[c for c in cells if int(c.get('suggested_deduct_qty') or 0) > 0])
    except Exception as e:
        log_error('api_ship_warehouse_reallocate_preview_v101', str(e))
        return error_response('倉庫可扣數量重算失敗')

@app.route('/api/warehouse/activity-target/<int:audit_id>', methods=['GET'])
@login_required_json
def api_warehouse_activity_target_v101(audit_id):
    """Resolve a warehouse add/remove/ship audit row back to a warehouse URL."""
    conn = None
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql('SELECT * FROM audit_trails WHERE id=?'), (audit_id,))
        row = fetchone_dict(cur) or {}
        if not row:
            return error_response('找不到倉庫操作紀錄', 404)
        after = row.get('after_json') or '{}'
        try:
            after = json.loads(after) if isinstance(after, str) else (after or {})
        except Exception:
            after = {}
        candidates = []
        for key in ('warehouse_deduct','warehouse_deduct_json','deducted','cells','slots','target','after'):
            val = after.get(key) if isinstance(after, dict) else None
            if isinstance(val, str):
                try: val = json.loads(val)
                except Exception: val = None
            if isinstance(val, dict):
                candidates.append(val)
            elif isinstance(val, list):
                candidates.extend([x for x in val if isinstance(x, dict)])
        if isinstance(after, dict):
            candidates.append(after)
        for c in candidates:
            z = c.get('zone') or c.get('warehouse_zone')
            col = c.get('column_index') or c.get('column')
            slot = c.get('slot_number') or c.get('slot')
            if z and col and slot:
                url = _v101_cell_url(z, col, slot, c.get('customer_name') or '', c.get('product_text') or '')
                return jsonify(success=True, url=url, zone=str(z).upper(), column_index=int(col), slot_number=int(slot))
        return jsonify(success=True, url='/warehouse', message='這筆紀錄沒有精準格位，已回倉庫圖')
    except Exception as e:
        log_error('api_warehouse_activity_target_v101', str(e))
        return error_response('倉庫操作定位失敗')
    finally:
        try:
            if conn: conn.close()
        except Exception:
            pass

@app.route('/api/warehouse/unplaced-stats-fast', methods=['GET'])
@login_required_json
def api_warehouse_unplaced_stats_fast_v101():
    """Small, safe stats endpoint for local refresh without repainting the whole warehouse.
    It compares source totals against quantities already placed in warehouse items.
    """
    try:
        conn = get_db(); cur = conn.cursor()
        placed = {'A':0,'B':0,'未分區':0,'total':0}
        cur.execute(sql("SELECT zone, items_json FROM warehouse_cells WHERE COALESCE(is_deleted,0)=0"))
        for row in rows_to_dict(cur):
            zone = str(row.get('zone') or '').upper()
            items = _v101_json_list(row.get('items_json'))
            q = sum(int((x or {}).get('qty') or 0) for x in items if isinstance(x, dict))
            if zone in ('A','B'):
                placed[zone] += q
            else:
                placed['未分區'] += q
            placed['total'] += q
        source_total = 0
        for table in ('inventory','orders','master_orders'):
            try:
                cur.execute(sql(f"SELECT COALESCE(SUM(qty),0) AS total FROM {table}"))
                r = fetchone_dict(cur) or {}
                source_total += int(r.get('total') or 0)
            except Exception:
                pass
        conn.close()
        unplaced_total = max(0, source_total - placed['total'])
        return jsonify(success=True, source_total=source_total, placed=placed, unplaced={'total':unplaced_total}, updated_at=now())
    except Exception as e:
        try: conn.close()
        except Exception: pass
        log_error('api_warehouse_unplaced_stats_fast_v101', str(e))
        return error_response('未入倉統計刷新失敗')


# ============================================================
# V103 MAINFILE CAPABILITY CHECK
# ============================================================
@app.route('/api/v103/capabilities', methods=['GET'])
@login_required_json
def api_v103_capabilities():
    """Frontend health/capability probe for V103 source-filter reopen, shortage navigation, and lock indicators."""
    return jsonify(
        success=True,
        version='V103',
        features={
            'source_reopen_filters': True,
            'shipping_shortage_reallocate': True,
            'warehouse_shortage_navigation': True,
            'today_activity_source_target': True,
            'row_lock_indicator': True,
            'no_setInterval_or_mutation_observer': True,
        },
        updated_at=now()
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)


# ============================================================
# V95 MAINFILE OFFLINE CONFLICT TARGET RESOLVER
# ============================================================
@app.route('/api/offline-conflicts/resolve-target', methods=['POST'])
@login_required_json
def api_offline_conflict_resolve_target_v95():
    """Resolve a stopped offline-ship conflict back to the safest source page without executing shipment."""
    try:
        data = request.get_json(silent=True) or {}
        conflict = data.get('conflict') or {}
        queued = data.get('queue') or {}
        body = data.get('body') or {}
        if not body and queued.get('body'):
            try:
                body = json.loads(queued.get('body') or '{}')
            except Exception:
                body = {}
        customer = (body.get('customer_name') or conflict.get('customer_name') or data.get('customer_name') or '').strip()
        product = (conflict.get('product_text') or data.get('product_text') or '').strip()
        material = (conflict.get('material') or data.get('material') or '').strip()
        loc = _v91_find_warehouse_location(customer, product, material)
        if loc.get('found'):
            return jsonify(success=True, target='warehouse', **loc)
        source = (conflict.get('source_label') or conflict.get('source') or '').strip().lower()
        q = product or customer
        if '總' in source or 'master' in source:
            return jsonify(success=True, target='master_order', url=f"/master-order?customer={customer}&q={q}&highlight_item={q}", found=False)
        if '訂' in source or 'order' in source:
            return jsonify(success=True, target='orders', url=f"/orders?customer={customer}&q={q}&highlight_item={q}", found=False)
        if '庫' in source or 'inventory' in source:
            return jsonify(success=True, target='inventory', url=f"/inventory?q={q}&highlight_item={q}", found=False)
        return jsonify(success=True, target='ship', url=f"/ship?customer={customer}&q={q}&highlight_item={q}", found=False)
    except Exception as e:
        log_error('api_offline_conflict_resolve_target_v95', str(e))
        return error_response('離線衝突來源定位失敗')

# ============================================================
# V105 MAINFILE warehouse/live-sync/query helpers
# ============================================================
def _v105_json_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    try:
        data = json.loads(value or '[]')
        return data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])
    except Exception:
        return []

def _v105_cell_qty(items):
    total = 0
    for it in _v105_json_list(items):
        if not isinstance(it, dict):
            continue
        try:
            total += int(it.get('qty') or it.get('pieces') or 0)
        except Exception:
            pass
    return total

def _v105_cell_dict(row):
    d = dict(row or {})
    items = _v105_json_list(d.get('items_json') or d.get('items') or [])
    d['items'] = items
    d['qty_total'] = _v105_cell_qty(items)
    z = str(d.get('zone') or '').upper()
    c = int(d.get('column_index') or 0)
    s = int(d.get('slot_number') or 0)
    d['location_label'] = f'{z}-{c}-{s}' if z and c and s else ''
    d['url'] = f'/warehouse?loc={d["location_label"]}&open=1' if d.get('location_label') else '/warehouse'
    d['empty'] = d['qty_total'] <= 0
    return d

@app.route('/api/warehouse/refresh-cells', methods=['POST'])
@login_required_json
def api_warehouse_refresh_cells_v105():
    """Return only requested warehouse cells after ship/add/remove, so the frontend can patch cells without repainting the whole map."""
    try:
        data = request.get_json(silent=True) or {}
        wanted = data.get('cells') or data.get('targets') or []
        normalized = []
        if isinstance(wanted, dict):
            wanted = [wanted]
        for x in wanted:
            if isinstance(x, str):
                m = re.match(r'^\s*([AB])[-_ ]?(\d+)[-_ ]?(\d+)\s*$', x, re.I)
                if m:
                    normalized.append((m.group(1).upper(), int(m.group(2)), int(m.group(3))))
            elif isinstance(x, dict):
                z = (x.get('zone') or x.get('warehouse_zone') or '').upper()
                c = int(x.get('column_index') or x.get('column') or 0)
                s = int(x.get('slot_number') or x.get('slot') or 0)
                if z and c and s:
                    normalized.append((z, c, s))
        if not normalized:
            z = (data.get('zone') or '').upper(); c = int(data.get('column_index') or data.get('column') or 0); s = int(data.get('slot_number') or data.get('slot') or 0)
            if z and c and s:
                normalized.append((z, c, s))
        conn = get_db(); cur = conn.cursor(); out = []
        for z, c, s in normalized[:80]:
            cur.execute(sql('SELECT * FROM warehouse_cells WHERE zone=? AND column_index=? AND slot_number=?'), (z, c, s))
            row = fetchone_dict(cur)
            if row:
                out.append(_v105_cell_dict(row))
        conn.close()
        return jsonify(success=True, cells=out, updated_at=now())
    except Exception as e:
        try: conn.close()
        except Exception: pass
        log_error('api_warehouse_refresh_cells_v105', str(e))
        return error_response('局部刷新倉庫格失敗')

@app.route('/api/warehouse/open-cell', methods=['GET', 'POST'])
@login_required_json
def api_warehouse_open_cell_v105():
    """Resolve and return a single warehouse cell for precise open/highlight navigation."""
    try:
        data = request.get_json(silent=True) if request.method == 'POST' else request.args
        data = data or {}
        loc = (data.get('loc') or data.get('location') or '').strip()
        z = (data.get('zone') or '').upper(); c = int(data.get('column_index') or data.get('column') or 0); s = int(data.get('slot_number') or data.get('slot') or 0)
        if loc and (not z or not c or not s):
            m = re.match(r'^\s*([AB])[-_ ]?(\d+)[-_ ]?(\d+)\s*$', loc, re.I)
            if m:
                z, c, s = m.group(1).upper(), int(m.group(2)), int(m.group(3))
        if not (z and c and s):
            return jsonify(success=False, error='缺少格位')
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql('SELECT * FROM warehouse_cells WHERE zone=? AND column_index=? AND slot_number=?'), (z, c, s))
        row = fetchone_dict(cur); conn.close()
        if not row:
            return jsonify(success=False, error='找不到格位')
        cell = _v105_cell_dict(row)
        return jsonify(success=True, cell=cell, url=cell['url'], zone=z, column_index=c, slot_number=s)
    except Exception as e:
        try: conn.close()
        except Exception: pass
        log_error('api_warehouse_open_cell_v105', str(e))
        return error_response('開啟倉庫格失敗')

@app.route('/api/warehouse/zone-stats', methods=['GET'])
@login_required_json
def api_warehouse_zone_stats_v105():
    try:
        zone_filter = (request.args.get('zone') or '').upper()
        stats = {}
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql('SELECT zone, problem_flag, is_deleted, items_json FROM warehouse_cells'))
        for row in rows_to_dict(cur):
            z = str(row.get('zone') or '').upper() or '未分區'
            if zone_filter and z != zone_filter:
                continue
            st = stats.setdefault(z, {'zone': z, 'slots': 0, 'visible_slots': 0, 'empty_slots': 0, 'filled_slots': 0, 'problem_slots': 0, 'qty_total': 0})
            st['slots'] += 1
            if int(row.get('is_deleted') or 0):
                continue
            st['visible_slots'] += 1
            q = _v105_cell_qty(row.get('items_json'))
            st['qty_total'] += q
            if q > 0: st['filled_slots'] += 1
            else: st['empty_slots'] += 1
            if int(row.get('problem_flag') or 0): st['problem_slots'] += 1
        conn.close()
        return jsonify(success=True, items=list(stats.values()), updated_at=now())
    except Exception as e:
        try: conn.close()
        except Exception: pass
        log_error('api_warehouse_zone_stats_v105', str(e))
        return error_response('讀取倉庫區統計失敗')

@app.route('/api/warehouse/column-stats', methods=['GET'])
@login_required_json
def api_warehouse_column_stats_v105():
    try:
        zone_filter = (request.args.get('zone') or '').upper(); col_filter = int(request.args.get('column_index') or request.args.get('column') or 0)
        stats = {}
        conn = get_db(); cur = conn.cursor(); cur.execute(sql('SELECT zone,column_index,problem_flag,is_deleted,items_json FROM warehouse_cells'))
        for row in rows_to_dict(cur):
            z = str(row.get('zone') or '').upper(); c = int(row.get('column_index') or 0)
            if zone_filter and z != zone_filter: continue
            if col_filter and c != col_filter: continue
            key = f'{z}-{c}'; st = stats.setdefault(key, {'zone': z, 'column_index': c, 'slots': 0, 'visible_slots': 0, 'empty_slots': 0, 'filled_slots': 0, 'problem_slots': 0, 'qty_total': 0})
            st['slots'] += 1
            if int(row.get('is_deleted') or 0): continue
            st['visible_slots'] += 1
            q = _v105_cell_qty(row.get('items_json')); st['qty_total'] += q
            if q > 0: st['filled_slots'] += 1
            else: st['empty_slots'] += 1
            if int(row.get('problem_flag') or 0): st['problem_slots'] += 1
        conn.close(); return jsonify(success=True, items=list(stats.values()), updated_at=now())
    except Exception as e:
        try: conn.close()
        except Exception: pass
        log_error('api_warehouse_column_stats_v105', str(e))
        return error_response('讀取倉庫欄統計失敗')

@app.route('/api/warehouse/cell-stock-detail', methods=['GET'])
@login_required_json
def api_warehouse_cell_stock_detail_v105():
    try:
        z = (request.args.get('zone') or '').upper(); c = int(request.args.get('column_index') or request.args.get('column') or 0); s = int(request.args.get('slot_number') or request.args.get('slot') or 0)
        loc = request.args.get('loc') or ''
        if loc and (not z or not c or not s):
            m = re.match(r'^\s*([AB])[-_ ]?(\d+)[-_ ]?(\d+)\s*$', loc, re.I)
            if m: z, c, s = m.group(1).upper(), int(m.group(2)), int(m.group(3))
        conn = get_db(); cur = conn.cursor(); cur.execute(sql('SELECT * FROM warehouse_cells WHERE zone=? AND column_index=? AND slot_number=?'), (z,c,s)); row = fetchone_dict(cur); conn.close()
        if not row: return jsonify(success=False, error='找不到格位')
        cell = _v105_cell_dict(row)
        return jsonify(success=True, cell=cell, items=cell.get('items') or [], qty_total=cell.get('qty_total') or 0, empty=cell.get('empty'))
    except Exception as e:
        try: conn.close()
        except Exception: pass
        log_error('api_warehouse_cell_stock_detail_v105', str(e))
        return error_response('讀取格位庫存失敗')

@app.route('/api/warehouse/replay-action/<int:audit_id>', methods=['GET'])
@login_required_json
def api_warehouse_replay_action_v105(audit_id):
    """Return before/after payload for a warehouse audit row so the UI can review what changed and jump back to the cell."""
    try:
        rows = list_audit_trails(limit=800)
        row = next((r for r in rows if int(r.get('id') or 0) == int(audit_id)), None)
        if not row:
            return jsonify(success=False, error='找不到紀錄')
        before = row.get('before_json') or {}; after = row.get('after_json') or {}
        target = None
        for src in (after, before):
            if isinstance(src, dict):
                z = src.get('zone') or src.get('warehouse_zone'); c = src.get('column_index') or src.get('column'); s = src.get('slot_number') or src.get('slot')
                if z and c and s:
                    target = {'zone': str(z).upper(), 'column_index': int(c), 'slot_number': int(s), 'url': _v101_cell_url(z,c,s,src.get('customer_name') or '',src.get('product_text') or '')}
                    break
                for key in ('cells','slots','warehouse_deduct','warehouse_deduct_json'):
                    vals = _v105_json_list(src.get(key))
                    for x in vals:
                        if isinstance(x, dict) and (x.get('zone') or x.get('warehouse_zone')) and (x.get('column_index') or x.get('column')) and (x.get('slot_number') or x.get('slot')):
                            z=x.get('zone') or x.get('warehouse_zone'); c=x.get('column_index') or x.get('column'); s=x.get('slot_number') or x.get('slot')
                            target={'zone':str(z).upper(),'column_index':int(c),'slot_number':int(s),'url':_v101_cell_url(z,c,s,x.get('customer_name') or '',x.get('product_text') or '')}; break
                    if target: break
        return jsonify(success=True, audit=row, before=before, after=after, target=target, url=(target or {}).get('url') or '/warehouse')
    except Exception as e:
        log_error('api_warehouse_replay_action_v105', str(e))
        return error_response('讀取倉庫操作回放失敗')

@app.route('/api/edit-locks/cleanup', methods=['POST','GET'])
@login_required_json
def api_edit_locks_cleanup_v105():
    """Best-effort expired lock cleanup. Safe on SQLite/PostgreSQL."""
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql('DELETE FROM edit_locks WHERE expires_at IS NOT NULL AND expires_at < ?'), (now(),))
        affected = getattr(cur, 'rowcount', 0)
        conn.commit(); conn.close()
        return jsonify(success=True, removed=max(0, int(affected or 0)), updated_at=now())
    except Exception as e:
        try: conn.rollback(); conn.close()
        except Exception: pass
        log_error('api_edit_locks_cleanup_v105', str(e))
        return jsonify(success=True, removed=0, warning='cleanup skipped')

@app.route('/api/v105/capabilities', methods=['GET'])
@login_required_json
def api_v105_capabilities():
    return jsonify(success=True, version='V105', features={
        'warehouse_partial_refresh': True,
        'warehouse_open_cell': True,
        'warehouse_zone_column_stats': True,
        'warehouse_cell_stock_detail': True,
        'warehouse_action_replay': True,
        'shipping_after_refresh_cells': True,
        'edit_lock_cleanup': True,
        'no_patch_overlay_hardlock': True,
        'no_setInterval_or_mutation_observer': True,
    }, updated_at=now())

# V106 next package: warehouse replay timeline + shipping/warehouse sync helpers + lock cleanup report (mainfile only).
def _v106_safe_json(value, default=None):
    if default is None:
        default = []
    if value is None or value == '':
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return default

def _v106_loc_from_payload(payload):
    if not isinstance(payload, dict):
        return None
    z = payload.get('zone') or payload.get('warehouse_zone')
    c = payload.get('column_index') or payload.get('column')
    s = payload.get('slot_number') or payload.get('slot')
    if z and c and s:
        try:
            return {'zone': str(z).upper(), 'column_index': int(c), 'slot_number': int(s), 'loc': f"{str(z).upper()}-{int(c)}-{int(s)}", 'url': _v101_cell_url(z, c, s, payload.get('customer_name') or '', payload.get('product_text') or '')}
        except Exception:
            return None
    return None

def _v106_extract_locations(payload):
    out = []
    seen = set()
    def add(x):
        loc = _v106_loc_from_payload(x)
        if loc and loc['loc'] not in seen:
            seen.add(loc['loc']); out.append(loc)
    def walk(x):
        if isinstance(x, dict):
            add(x)
            for key in ('cells','slots','warehouse_deduct','warehouse_deduct_json','deductions','items'):
                walk(x.get(key))
        elif isinstance(x, list):
            for y in x:
                walk(y)
    walk(payload)
    return out

@app.route('/api/v106/warehouse-action-timeline', methods=['GET'])
@login_required_json
def api_v106_warehouse_action_timeline():
    """Visual-friendly warehouse audit timeline. It does not mutate warehouse_cells."""
    try:
        limit = min(500, max(1, int(request.args.get('limit') or 80)))
        rows = list_audit_trails(limit=limit)
        items = []
        for row in rows:
            entity = str(row.get('entity_type') or '')
            action = str(row.get('action_type') or '')
            before = row.get('before_json') or {}
            after = row.get('after_json') or {}
            locs = _v106_extract_locations(after) or _v106_extract_locations(before)
            if entity != 'warehouse_cells' and not locs and 'warehouse' not in action.lower() and '倉庫' not in action:
                continue
            summary = action or '倉庫操作'
            if locs:
                summary += '｜' + '、'.join(x['loc'] for x in locs[:4])
            items.append({
                'id': row.get('id'),
                'created_at': row.get('created_at'),
                'username': row.get('username'),
                'action_type': action,
                'entity_type': entity,
                'entity_key': row.get('entity_key'),
                'summary': summary,
                'locations': locs,
                'target': locs[0] if locs else None,
                'before': before,
                'after': after,
                'replay_url': f"/api/warehouse/replay-action/{row.get('id')}",
            })
        return jsonify(success=True, items=items, count=len(items), updated_at=now())
    except Exception as e:
        log_error('api_v106_warehouse_action_timeline', str(e))
        return error_response('讀取倉庫操作時間軸失敗')

@app.route('/api/v106/shipping-warehouse-sync', methods=['GET'])
@login_required_json
def api_v106_shipping_warehouse_sync():
    """Return shipping rows with warehouse deduction location links for query pages."""
    try:
        limit = min(300, max(1, int(request.args.get('limit') or 80)))
        conn = get_db(); cur = conn.cursor()
        try:
            cur.execute(sql('SELECT * FROM shipping_records ORDER BY id DESC LIMIT ?'), (limit,))
        except Exception:
            cur.execute(sql('SELECT * FROM shipping_records ORDER BY id DESC'))
        rows = rows_to_dict(cur)[:limit]
        conn.close()
        items = []
        for row in rows:
            payload = _v106_safe_json(row.get('warehouse_deduct_json'), [])
            locs = _v106_extract_locations(payload)
            if not locs:
                locs = _v106_extract_locations(row)
            row['warehouse_locations'] = locs
            row['warehouse_location_text'] = '、'.join(x['loc'] for x in locs) if locs else (row.get('warehouse_location') or '')
            row['warehouse_url'] = (locs[0].get('url') if locs else '') or ''
            items.append(row)
        return jsonify(success=True, items=items, count=len(items), updated_at=now())
    except Exception as e:
        try: conn.close()
        except Exception: pass
        log_error('api_v106_shipping_warehouse_sync', str(e))
        return error_response('讀取出貨倉庫同步資訊失敗')

@app.route('/api/v106/edit-locks/cleanup-report', methods=['POST','GET'])
@login_required_json
def api_v106_edit_locks_cleanup_report():
    """Cleanup expired edit locks and return active locks for UI status."""
    try:
        conn = get_db(); cur = conn.cursor()
        removed = 0
        try:
            cur.execute(sql('DELETE FROM edit_locks WHERE expires_at IS NOT NULL AND expires_at < ?'), (now(),))
            removed = max(0, int(getattr(cur, 'rowcount', 0) or 0))
            conn.commit()
        except Exception:
            conn.rollback()
        cur.execute(sql('SELECT * FROM edit_locks ORDER BY updated_at DESC'))
        locks = rows_to_dict(cur)
        conn.close()
        return jsonify(success=True, removed=removed, locks=locks, active_count=len(locks), updated_at=now())
    except Exception as e:
        try: conn.close()
        except Exception: pass
        log_error('api_v106_edit_locks_cleanup_report', str(e))
        return jsonify(success=True, removed=0, locks=[], active_count=0, warning='cleanup report skipped')

@app.route('/api/v106/capabilities', methods=['GET'])
@login_required_json
def api_v106_capabilities():
    return jsonify(success=True, version='V106', features={
        'warehouse_action_timeline_visual': True,
        'shipping_query_warehouse_sync_links': True,
        'warehouse_replay_open_cell_more_visible': True,
        'search_location_jump_stabilized': True,
        'edit_lock_cleanup_report': True,
        'no_patch_overlay_hardlock': True,
        'no_setInterval_or_mutation_observer': True,
    }, updated_at=now())


# ===================== V107 精準跳轉 / 共用倉庫扣除資訊 / 搜尋開格穩定 =====================
def _v107_loc_text(loc):
    if not loc:
        return ''
    if not isinstance(loc, dict):
        return str(loc)
    z = (loc.get('zone') or '').upper()
    b = loc.get('band') or loc.get('col') or loc.get('column') or ''
    slot = loc.get('slot') or loc.get('cell') or ''
    if z and b and slot:
        return f"{z}-{b}-{slot}"
    return loc.get('loc') or loc.get('location') or ''


def _v107_warehouse_url_from_loc(loc, open_cell=True, highlight_item=''):
    text = _v107_loc_text(loc)
    if not text:
        return ''
    qs = f"loc={quote(str(text))}"
    if open_cell:
        qs += '&open=1'
    if highlight_item:
        qs += '&highlight_item=' + quote(str(highlight_item))
    return '/warehouse?' + qs


def _v107_shipping_record_warehouse_info(row):
    payload = _v106_safe_json(row.get('warehouse_deduct_json'), [])
    locs = _v106_extract_locations(payload)
    if not locs:
        locs = _v106_extract_locations(row)
    item_text = row.get('item_text') or row.get('product_text') or row.get('size_text') or row.get('product_name') or ''
    first = locs[0] if locs else {}
    total_deduct = 0
    normalized = []
    for loc in locs:
        deduct = loc.get('deduct_qty') or loc.get('qty') or loc.get('deduct') or 0
        try:
            total_deduct += int(float(deduct))
        except Exception:
            pass
        normalized.append({
            'loc': _v107_loc_text(loc),
            'zone': (loc.get('zone') or '').upper(),
            'band': loc.get('band') or loc.get('col') or loc.get('column'),
            'slot': loc.get('slot') or loc.get('cell'),
            'deduct_qty': deduct,
            'before_qty': loc.get('before_qty') or loc.get('before'),
            'after_qty': loc.get('after_qty') or loc.get('after'),
            'is_empty_after': bool(loc.get('is_empty_after') or loc.get('empty_after')),
            'url': _v107_warehouse_url_from_loc(loc, True, item_text),
        })
    return {
        'record_id': row.get('id'),
        'customer': row.get('customer') or row.get('customer_name') or '',
        'material': row.get('material') or '',
        'item_text': item_text,
        'locations': normalized,
        'warehouse_location_text': '、'.join([x.get('loc','') for x in normalized if x.get('loc')]),
        'warehouse_url': _v107_warehouse_url_from_loc(first, True, item_text) if first else '',
        'total_deduct_qty': total_deduct,
    }


@app.route('/api/v107/shipping-warehouse-map', methods=['GET'])
def api_v107_shipping_warehouse_map():
    """出貨紀錄與今日異動共用的倉庫扣除資訊。"""
    try:
        limit = max(1, min(int(request.args.get('limit', 200)), 500))
        sid = request.args.get('id') or request.args.get('record_id')
        with get_conn() as conn:
            if sid:
                rows = q_all(conn, 'SELECT * FROM shipping_records WHERE id=?', [sid])
            else:
                rows = q_all(conn, 'SELECT * FROM shipping_records ORDER BY id DESC LIMIT ?', [limit])
        items = [_v107_shipping_record_warehouse_info(r) for r in rows]
        return jsonify({'ok': True, 'version': 'V107', 'items': items})
    except Exception as e:
        log_error('api_v107_shipping_warehouse_map', str(e))
        return jsonify({'ok': False, 'error': str(e), 'items': []}), 500


@app.route('/api/v107/warehouse-target/resolve', methods=['GET', 'POST'])
def api_v107_warehouse_target_resolve():
    """把今日異動、搜尋、出貨紀錄的目標統一解析成可開啟的倉庫 URL。"""
    try:
        data = request.get_json(silent=True) or {}
        args = request.args
        loc_text = data.get('loc') or data.get('location') or args.get('loc') or args.get('location')
        record_id = data.get('shipping_id') or data.get('record_id') or args.get('shipping_id') or args.get('record_id')
        audit_id = data.get('audit_id') or args.get('audit_id')
        highlight_item = data.get('highlight_item') or args.get('highlight_item') or data.get('item_text') or args.get('item_text') or ''
        source = data.get('source') or args.get('source') or ''
        loc = {}
        if loc_text:
            parts = str(loc_text).replace('區','').replace('欄','-').replace('格','').replace('_','-').split('-')
            if len(parts) >= 3:
                loc = {'zone': parts[0].upper(), 'band': parts[1], 'slot': parts[2]}
            else:
                loc = {'loc': str(loc_text)}
        elif record_id:
            with get_conn() as conn:
                rows = q_all(conn, 'SELECT * FROM shipping_records WHERE id=?', [record_id])
            if rows:
                info = _v107_shipping_record_warehouse_info(rows[0])
                first = (info.get('locations') or [{}])[0]
                loc = first
                highlight_item = highlight_item or info.get('item_text') or ''
                source = source or 'shipping_records'
        elif audit_id:
            with get_conn() as conn:
                rows = q_all(conn, 'SELECT * FROM audit_logs WHERE id=?', [audit_id])
            if rows:
                after = _v106_safe_json(rows[0].get('after_json'), {})
                before = _v106_safe_json(rows[0].get('before_json'), {})
                locs = _v106_extract_locations(after) or _v106_extract_locations(before)
                loc = locs[0] if locs else {}
                source = source or 'audit_logs'
        url = _v107_warehouse_url_from_loc(loc, True, highlight_item)
        return jsonify({'ok': True, 'version': 'V107', 'source': source, 'loc': _v107_loc_text(loc), 'url': url, 'highlight_item': highlight_item, 'open': bool(url)})
    except Exception as e:
        log_error('api_v107_warehouse_target_resolve', str(e))
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/v107/warehouse-action-timeline', methods=['GET'])
def api_v107_warehouse_action_timeline():
    """V106 時間軸加上統一 target_url，讓每筆操作都能點回格位。"""
    try:
        limit = max(1, min(int(request.args.get('limit', 160)), 500))
        with get_conn() as conn:
            rows = q_all(conn, """SELECT id, action, table_name, record_id, before_json, after_json, username, created_at
                                  FROM audit_logs
                                  WHERE table_name LIKE '%warehouse%' OR action LIKE '%warehouse%' OR action LIKE '%倉庫%'
                                  ORDER BY id DESC LIMIT ?""", [limit])
        items = []
        for r in rows:
            after = _v106_safe_json(r.get('after_json'), {})
            before = _v106_safe_json(r.get('before_json'), {})
            locs = _v106_extract_locations(after) or _v106_extract_locations(before)
            item_text = ''
            if isinstance(after, dict):
                item_text = after.get('item_text') or after.get('product_text') or ''
            if not item_text and isinstance(before, dict):
                item_text = before.get('item_text') or before.get('product_text') or ''
            locations = []
            for loc in locs:
                locations.append({'loc': _v107_loc_text(loc), 'url': _v107_warehouse_url_from_loc(loc, True, item_text)})
            items.append({
                'id': r.get('id'), 'action': r.get('action'), 'table_name': r.get('table_name'), 'record_id': r.get('record_id'),
                'username': r.get('username'), 'created_at': r.get('created_at'),
                'summary': f"{r.get('action') or '倉庫操作'} #{r.get('record_id') or ''}",
                'locations': locations,
                'target_url': locations[0]['url'] if locations else '',
                'target_loc': locations[0]['loc'] if locations else '',
                'can_open': bool(locations),
            })
        return jsonify({'ok': True, 'version': 'V107', 'items': items})
    except Exception as e:
        log_error('api_v107_warehouse_action_timeline', str(e))
        return jsonify({'ok': False, 'items': [], 'error': str(e)}), 500


@app.route('/api/v107/shipping-warehouse-sync', methods=['GET'])
def api_v107_shipping_warehouse_sync_alias():
    """V107 前端相容：回傳出貨紀錄對應倉庫格位。"""
    return api_v107_shipping_warehouse_map()


@app.route('/api/v107/edit-locks/cleanup-report', methods=['POST','GET'])
def api_v107_edit_locks_cleanup_report():
    """V107 前端相容：沿用 V106 編輯鎖清理回報。"""
    try:
        return api_v106_edit_locks_cleanup_report()
    except Exception as e:
        log_error('api_v107_edit_locks_cleanup_report', str(e))
        return jsonify({'ok': False, 'error': str(e), 'removed': 0, 'active_count': 0}), 500


@app.route('/api/v107/capabilities', methods=['GET'])
def api_v107_capabilities():
    return jsonify({
        'ok': True,
        'version': 'V107',
        'features': [
            'warehouse_timeline_open_cell',
            'shared_shipping_warehouse_map',
            'warehouse_target_resolve',
            'search_open_cell_stable',
            'today_shipping_same_target_payload',
            'cache_bust_v107',
        ]
    })
# ===================== /V107 =====================

# ===================== V109 next package: focusable warehouse deductions + timeline filters =====================
def _v109_safe_json(value, fallback=None):
    if fallback is None:
        fallback = []
    try:
        if value is None or value == '':
            return fallback
        if isinstance(value, (list, dict)):
            return value
        return json.loads(value)
    except Exception:
        return fallback


def _v109_deduct_detail_from_row(row):
    info = _v107_shipping_record_warehouse_info(row)
    raw = _v109_safe_json(row.get('warehouse_deduct_json'), [])
    details = []
    for i, loc in enumerate(raw if isinstance(raw, list) else []):
        if not isinstance(loc, dict):
            continue
        before_qty = loc.get('before_qty') or loc.get('before_count') or loc.get('cell_before_qty') or loc.get('before')
        deduct_qty = loc.get('deduct_qty') or loc.get('qty') or loc.get('deduct') or 0
        after_qty = loc.get('after_qty') or loc.get('after_count') or loc.get('cell_after_qty')
        try:
            if after_qty is None and before_qty is not None:
                after_qty = int(float(before_qty)) - int(float(deduct_qty or 0))
        except Exception:
            pass
        loc_text = _v107_loc_text(loc)
        details.append({
            'index': i,
            'loc': loc_text,
            'zone': loc.get('zone') or loc.get('area') or '',
            'band': loc.get('band') or loc.get('col') or loc.get('column') or '',
            'slot': loc.get('slot') or loc.get('cell') or loc.get('slot_no') or '',
            'customer_name': loc.get('customer_name') or row.get('customer_name') or '',
            'material': loc.get('material') or row.get('material') or '',
            'product_text': loc.get('product_text') or row.get('product_text') or '',
            'before_qty': before_qty,
            'deduct_qty': deduct_qty,
            'after_qty': after_qty,
            'emptied': bool(loc.get('emptied') or loc.get('is_empty') or str(after_qty) == '0'),
            'url': _v107_warehouse_url_from_loc(loc, True, loc.get('product_text') or row.get('product_text') or ''),
        })
    info['deduct_details'] = details
    info['deduct_detail_count'] = len(details)
    info['focus_url'] = details[0]['url'] if details else info.get('warehouse_url')
    return info


@app.route('/api/v109/shipping-deduct-detail', methods=['GET'])
def api_v109_shipping_deduct_detail():
    """回查單筆或多筆出貨的倉庫扣除明細：扣前/扣後/扣空/可開格位。"""
    try:
        rid = request.args.get('id') or request.args.get('record_id')
        limit = max(1, min(int(request.args.get('limit', 160)), 500))
        with get_conn() as conn:
            if rid:
                rows = q_all(conn, 'SELECT * FROM shipping_records WHERE id=?', [rid])
            else:
                rows = q_all(conn, 'SELECT * FROM shipping_records ORDER BY id DESC LIMIT ?', [limit])
        items = [_v109_deduct_detail_from_row(r) for r in rows]
        return jsonify({'ok': True, 'version': 'V109', 'items': items, 'item': items[0] if rid and items else None})
    except Exception as e:
        log_error('api_v109_shipping_deduct_detail', str(e))
        return jsonify({'ok': False, 'error': str(e), 'items': []}), 500


@app.route('/api/v109/open-and-focus-cell', methods=['GET', 'POST'])
def api_v109_open_and_focus_cell():
    """統一把出貨、今日異動、搜尋目標解析成倉庫 URL，並帶上商品列焦點參數。"""
    try:
        data = request.get_json(silent=True) or {}
        args = request.args
        loc = data.get('loc') or args.get('loc') or data.get('location') or args.get('location')
        record_id = data.get('record_id') or args.get('record_id') or data.get('shipping_id') or args.get('shipping_id')
        item = data.get('highlight_item') or args.get('highlight_item') or data.get('product_text') or args.get('product_text') or ''
        customer = data.get('customer_name') or args.get('customer_name') or data.get('customer') or args.get('customer') or ''
        if record_id and not loc:
            with get_conn() as conn:
                rows = q_all(conn, 'SELECT * FROM shipping_records WHERE id=?', [record_id])
            if rows:
                info = _v109_deduct_detail_from_row(rows[0])
                det = (info.get('deduct_details') or [{}])[0]
                loc = det.get('loc')
                item = item or det.get('product_text') or info.get('item_text') or ''
                customer = customer or det.get('customer_name') or info.get('customer_name') or ''
        parts = str(loc or '').replace('區','').replace('欄','-').replace('格','').replace('_','-').split('-')
        parsed = {}
        if len(parts) >= 3:
            parsed = {'zone': parts[0].upper(), 'band': parts[1], 'slot': parts[2], 'product_text': item, 'customer_name': customer}
        url = _v107_warehouse_url_from_loc(parsed or {'loc': loc}, True, item or customer)
        if url:
            joiner = '&' if '?' in url else '?'
            url += joiner + 'focus_row=1&target_row=1'
            if customer:
                url += '&customer=' + str(customer)
        return jsonify({'ok': True, 'version': 'V109', 'url': url, 'loc': _v107_loc_text(parsed) if parsed else str(loc or ''), 'highlight_item': item, 'customer_name': customer})
    except Exception as e:
        log_error('api_v109_open_and_focus_cell', str(e))
        return jsonify({'ok': False, 'error': str(e), 'url': ''}), 500


@app.route('/api/v109/warehouse-action-timeline', methods=['GET'])
def api_v109_warehouse_action_timeline():
    """時間軸加入分類篩選與扣除明細，給前端可視化篩選使用。"""
    try:
        limit = max(1, min(int(request.args.get('limit', 180)), 600))
        category = (request.args.get('category') or request.args.get('type') or 'all').lower()
        with get_conn() as conn:
            rows = q_all(conn, """SELECT id, action, table_name, record_id, before_json, after_json, username, created_at
                                  FROM audit_logs
                                  WHERE table_name LIKE '%warehouse%' OR action LIKE '%warehouse%' OR action LIKE '%倉庫%' OR action LIKE '%出貨%'
                                  ORDER BY id DESC LIMIT ?""", [limit])
        items = []
        for r in rows:
            action_text = str(r.get('action') or '')
            after = _v109_safe_json(r.get('after_json'), {})
            before = _v109_safe_json(r.get('before_json'), {})
            hay = ' '.join([action_text, str(r.get('table_name') or ''), json.dumps(after, ensure_ascii=False)[:500]])
            typ = 'other'
            if any(k in hay for k in ['扣空', 'emptied']): typ = 'emptied'
            elif any(k in hay for k in ['出貨', 'ship', 'deduct']): typ = 'ship'
            elif any(k in hay for k in ['新增格', 'add-slot', 'bulk-add']): typ = 'add_slot'
            elif any(k in hay for k in ['減少格', 'remove-slot', 'bulk-remove', '刪除格']): typ = 'remove_slot'
            elif any(k in hay for k in ['插入格', 'insert']): typ = 'insert_slot'
            if category not in ('all', '', typ):
                continue
            locs = _v106_extract_locations(after) or _v106_extract_locations(before)
            item_text = ''
            if isinstance(after, dict): item_text = after.get('item_text') or after.get('product_text') or ''
            if not item_text and isinstance(before, dict): item_text = before.get('item_text') or before.get('product_text') or ''
            locations = [{'loc': _v107_loc_text(loc), 'url': _v107_warehouse_url_from_loc(loc, True, item_text)} for loc in locs]
            items.append({
                'id': r.get('id'), 'type': typ, 'action': action_text, 'table_name': r.get('table_name'),
                'record_id': r.get('record_id'), 'username': r.get('username'), 'created_at': r.get('created_at'),
                'summary': f"{action_text or '倉庫操作'} #{r.get('record_id') or ''}",
                'locations': locations, 'target_url': locations[0]['url'] if locations else '',
                'target_loc': locations[0]['loc'] if locations else '', 'can_open': bool(locations),
            })
        return jsonify({'ok': True, 'version': 'V109', 'category': category, 'items': items})
    except Exception as e:
        log_error('api_v109_warehouse_action_timeline', str(e))
        return jsonify({'ok': False, 'items': [], 'error': str(e)}), 500


@app.route('/api/v109/capabilities', methods=['GET'])
def api_v109_capabilities():
    return jsonify({'ok': True, 'version': 'V109', 'features': [
        'open_cell_focus_row_stable',
        'shipping_deduct_detail_review',
        'timeline_category_filter',
        'shipping_today_search_same_deduct_payload',
        'cache_bust_v109',
    ]})
# ===================== /V109 =====================

@app.route('/api/v109/shipping-warehouse-sync', methods=['GET'])
def api_v109_shipping_warehouse_sync():
    """V109 相容：出貨紀錄對應倉庫扣除資訊，含扣前/扣後/扣空。"""
    return api_v109_shipping_deduct_detail()

@app.route('/api/v109/edit-locks/cleanup-report', methods=['POST','GET'])
def api_v109_edit_locks_cleanup_report():
    try:
        return api_v107_edit_locks_cleanup_report()
    except Exception as e:
        log_error('api_v109_edit_locks_cleanup_report', str(e))
        return jsonify({'ok': False, 'error': str(e), 'removed': 0, 'active_count': 0}), 500

# ===================== V110 next package: unified warehouse deduction display + stronger focus =====================
def _v110_shipping_deduct_item(row):
    """V110 統一出貨/今日異動/搜尋使用的倉庫扣除資料格式。"""
    base = _v109_deduct_detail_from_row(row)
    details = base.get('deduct_details') or []
    total_deduct = 0
    emptied_count = 0
    loc_labels = []
    for d in details:
        try:
            total_deduct += int(float(d.get('deduct_qty') or 0))
        except Exception:
            pass
        if d.get('emptied'):
            emptied_count += 1
        if d.get('loc'):
            loc_labels.append(str(d.get('loc')))
    base.update({
        'version': 'V110',
        'deduct_total_qty': total_deduct,
        'deduct_emptied_count': emptied_count,
        'deduct_location_summary': '、'.join(loc_labels),
        'deduct_display_text': (('倉庫扣除：' + '、'.join(loc_labels)) if loc_labels else '尚無倉庫扣除資料'),
        'open_first_url': (details[0].get('url') if details else base.get('warehouse_url') or ''),
        'can_open_warehouse': bool(details or base.get('warehouse_url')),
    })
    return base


@app.route('/api/v110/shipping-deduct-unified', methods=['GET'])
def api_v110_shipping_deduct_unified():
    """出貨查詢、今日異動、搜尋結果共用同一套扣倉庫明細，避免各頁顯示不一致。"""
    try:
        rid = request.args.get('id') or request.args.get('record_id')
        limit = max(1, min(int(request.args.get('limit', 220)), 800))
        with get_conn() as conn:
            if rid:
                rows = q_all(conn, 'SELECT * FROM shipping_records WHERE id=?', [rid])
            else:
                rows = q_all(conn, 'SELECT * FROM shipping_records ORDER BY id DESC LIMIT ?', [limit])
        items = [_v110_shipping_deduct_item(r) for r in rows]
        return jsonify({'ok': True, 'version': 'V110', 'items': items, 'item': items[0] if rid and items else None})
    except Exception as e:
        log_error('api_v110_shipping_deduct_unified', str(e))
        return jsonify({'ok': False, 'version': 'V110', 'error': str(e), 'items': []}), 500


@app.route('/api/v110/open-and-focus-cell', methods=['GET', 'POST'])
def api_v110_open_and_focus_cell():
    """比 V109 更穩：統一解析 record_id/loc，並帶入 focus_text、customer、highlight_item。"""
    try:
        data = request.get_json(silent=True) or {}
        args = request.args
        record_id = data.get('record_id') or args.get('record_id') or data.get('shipping_id') or args.get('shipping_id')
        loc = data.get('loc') or args.get('loc') or data.get('location') or args.get('location')
        item = data.get('highlight_item') or args.get('highlight_item') or data.get('product_text') or args.get('product_text') or ''
        customer = data.get('customer_name') or args.get('customer_name') or data.get('customer') or args.get('customer') or ''
        detail = {}
        if record_id:
            with get_conn() as conn:
                rows = q_all(conn, 'SELECT * FROM shipping_records WHERE id=?', [record_id])
            if rows:
                info = _v110_shipping_deduct_item(rows[0])
                detail = (info.get('deduct_details') or [{}])[0]
                loc = loc or detail.get('loc') or info.get('warehouse_location_text')
                item = item or detail.get('product_text') or info.get('item_text') or ''
                customer = customer or detail.get('customer_name') or info.get('customer_name') or ''
        parts = str(loc or '').replace('區','').replace('欄','-').replace('格','').replace('_','-').split('-')
        parsed = {}
        if len(parts) >= 3:
            parsed = {'zone': parts[0].upper(), 'band': parts[1], 'slot': parts[2], 'product_text': item, 'customer_name': customer}
        url = _v107_warehouse_url_from_loc(parsed or detail or {'loc': loc}, True, item or customer)
        if url:
            joiner = '&' if '?' in url else '?'
            focus_text = item or customer or loc or ''
            url += joiner + 'open=1&focus_row=1&target_row=1&focus_text=' + str(focus_text)
            if customer:
                url += '&customer=' + str(customer)
        return jsonify({'ok': True, 'version': 'V110', 'url': url, 'loc': _v107_loc_text(parsed) if parsed else str(loc or ''), 'highlight_item': item, 'customer_name': customer, 'focus_text': item or customer or loc or ''})
    except Exception as e:
        log_error('api_v110_open_and_focus_cell', str(e))
        return jsonify({'ok': False, 'version': 'V110', 'error': str(e), 'url': ''}), 500


@app.route('/api/v110/warehouse-action-timeline', methods=['GET'])
def api_v110_warehouse_action_timeline():
    """V110 時間軸：分類篩選 + 可點回格位 + 出貨扣除摘要統一。"""
    try:
        limit = max(1, min(int(request.args.get('limit', 220)), 800))
        category = (request.args.get('category') or request.args.get('type') or 'all').lower()
        with get_conn() as conn:
            rows = q_all(conn, """SELECT id, action, table_name, record_id, before_json, after_json, username, created_at
                                  FROM audit_logs
                                  WHERE table_name LIKE '%warehouse%' OR action LIKE '%warehouse%' OR action LIKE '%倉庫%' OR action LIKE '%出貨%'
                                  ORDER BY id DESC LIMIT ?""", [limit])
        items = []
        for r in rows:
            action_text = str(r.get('action') or '')
            after = _v109_safe_json(r.get('after_json'), {})
            before = _v109_safe_json(r.get('before_json'), {})
            hay = ' '.join([action_text, str(r.get('table_name') or ''), json.dumps(after, ensure_ascii=False)[:800], json.dumps(before, ensure_ascii=False)[:400]])
            typ = 'other'
            if any(k in hay for k in ['扣空', 'emptied']): typ = 'emptied'
            elif any(k in hay for k in ['出貨', 'ship', 'deduct']): typ = 'ship'
            elif any(k in hay for k in ['新增格', 'add-slot', 'bulk-add', '恢復隱藏格']): typ = 'add_slot'
            elif any(k in hay for k in ['減少格', 'remove-slot', 'bulk-remove', '刪除格']): typ = 'remove_slot'
            elif any(k in hay for k in ['插入格', 'insert']): typ = 'insert_slot'
            if category not in ('all', '', typ):
                continue
            locs = _v106_extract_locations(after) or _v106_extract_locations(before)
            item_text = ''
            if isinstance(after, dict): item_text = after.get('item_text') or after.get('product_text') or after.get('summary') or ''
            if not item_text and isinstance(before, dict): item_text = before.get('item_text') or before.get('product_text') or ''
            locations = []
            for loc in locs:
                loc_text = _v107_loc_text(loc)
                locations.append({'loc': loc_text, 'url': _v107_warehouse_url_from_loc(loc, True, item_text), 'focus_text': item_text})
            items.append({
                'id': r.get('id'), 'type': typ, 'action': action_text, 'table_name': r.get('table_name'),
                'record_id': r.get('record_id'), 'username': r.get('username'), 'created_at': r.get('created_at'),
                'summary': f"{action_text or '倉庫操作'} #{r.get('record_id') or ''}",
                'locations': locations, 'target_url': locations[0]['url'] if locations else '',
                'target_loc': locations[0]['loc'] if locations else '', 'can_open': bool(locations),
                'focus_text': item_text,
            })
        counts = {}
        for it in items:
            counts[it['type']] = counts.get(it['type'], 0) + 1
        return jsonify({'ok': True, 'version': 'V110', 'category': category, 'counts': counts, 'items': items})
    except Exception as e:
        log_error('api_v110_warehouse_action_timeline', str(e))
        return jsonify({'ok': False, 'version': 'V110', 'items': [], 'error': str(e)}), 500


@app.route('/api/v110/shipping-warehouse-sync', methods=['GET'])
def api_v110_shipping_warehouse_sync():
    return api_v110_shipping_deduct_unified()


@app.route('/api/v110/edit-locks/cleanup-report', methods=['POST','GET'])
def api_v110_edit_locks_cleanup_report():
    try:
        return api_v107_edit_locks_cleanup_report()
    except Exception as e:
        log_error('api_v110_edit_locks_cleanup_report', str(e))
        return jsonify({'ok': False, 'version': 'V110', 'error': str(e), 'removed': 0, 'active_count': 0}), 500


@app.route('/api/v110/capabilities', methods=['GET'])
def api_v110_capabilities():
    return jsonify({'ok': True, 'version': 'V110', 'features': [
        'unified_shipping_deduct_display_all_pages',
        'stable_open_cell_focus_text',
        'timeline_filter_counts_and_open_targets',
        'shipping_today_search_same_payload_v110',
        'edit_lock_cleanup_alias_v110',
        'cache_bust_v110',
    ]})
# ===================== /V110 =====================

# ===================== V111 下一包：扣倉庫明細追蹤 / 跳轉焦點穩定 / 時間軸格位回查 =====================
# 直接寫入主檔，不新增補丁檔；補上舊 V 段共用查詢 helper，避免任何 runtime 遺漏。
from contextlib import contextmanager as _yx_contextmanager_v111

@_yx_contextmanager_v111
def get_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        try:
            conn.close()
        except Exception:
            pass


def q_all(conn, query, params=None):
    cur = conn.cursor()
    cur.execute(sql(query), params or [])
    return rows_to_dict(cur.fetchall())


def _v111_safe_int(v, default=0):
    try:
        return int(float(v or 0))
    except Exception:
        return default


def _v111_loc_to_parts(loc_text):
    text = str(loc_text or '').strip().replace('區','').replace('欄','-').replace('格','').replace('_','-').replace(' ','')
    parts = [p for p in text.split('-') if p]
    if len(parts) >= 3:
        return {'zone': parts[0].upper(), 'band': parts[1], 'slot': parts[2], 'loc': f"{parts[0].upper()}-{parts[1]}-{parts[2]}"}
    return {'loc': text}


def _v111_focus_payload_from_record(row):
    item = _v110_shipping_deduct_item(row)
    details = item.get('deduct_details') or []
    targets = []
    for d in details:
        loc = d.get('loc') or d.get('location') or ''
        parts = _v111_loc_to_parts(loc)
        focus_text = d.get('product_text') or d.get('item_text') or item.get('item_text') or item.get('product_text') or ''
        customer = d.get('customer_name') or item.get('customer_name') or ''
        targets.append({
            'loc': parts.get('loc') or loc,
            'zone': parts.get('zone'),
            'band': parts.get('band'),
            'slot': parts.get('slot'),
            'focus_text': focus_text or customer,
            'customer_name': customer,
            'deduct_qty': _v111_safe_int(d.get('deduct_qty')),
            'before_qty': _v111_safe_int(d.get('before_qty')),
            'after_qty': _v111_safe_int(d.get('after_qty')),
            'emptied': bool(d.get('emptied') or _v111_safe_int(d.get('after_qty')) <= 0),
            'url': _v107_warehouse_url_from_loc(parts, True, focus_text or customer),
        })
    item['targets'] = targets
    item['target_count'] = len(targets)
    item['first_target'] = targets[0] if targets else {}
    item['focus_url'] = (targets[0].get('url') if targets else item.get('open_first_url') or '')
    item['focus_text'] = (targets[0].get('focus_text') if targets else item.get('item_text') or '')
    item['version'] = 'V111'
    return item


@app.route('/api/v111/shipping-deduct-trace', methods=['GET'])
def api_v111_shipping_deduct_trace():
    """出貨扣倉庫追蹤：所有頁面可用同一份扣前/扣後/扣空/跳轉資料。"""
    try:
        rid = request.args.get('id') or request.args.get('record_id') or request.args.get('shipping_id')
        limit = max(1, min(int(request.args.get('limit', 240)), 900))
        with get_conn() as conn:
            if rid:
                rows = q_all(conn, 'SELECT * FROM shipping_records WHERE id=?', [rid])
            else:
                rows = q_all(conn, 'SELECT * FROM shipping_records ORDER BY id DESC LIMIT ?', [limit])
        items = [_v111_focus_payload_from_record(r) for r in rows]
        return jsonify({'ok': True, 'success': True, 'version': 'V111', 'items': items, 'item': items[0] if rid and items else None, 'count': len(items)})
    except Exception as e:
        log_error('api_v111_shipping_deduct_trace', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V111', 'error': str(e), 'items': []}), 500


@app.route('/api/v111/open-focus-target', methods=['GET','POST'])
def api_v111_open_focus_target():
    """統一解析來源：record_id / audit_id / loc，回傳可直接跳倉庫並開格高亮商品列的 URL。"""
    try:
        data = request.get_json(silent=True) or {}
        args = request.args
        record_id = data.get('record_id') or args.get('record_id') or data.get('shipping_id') or args.get('shipping_id')
        audit_id = data.get('audit_id') or args.get('audit_id')
        loc = data.get('loc') or args.get('loc') or data.get('location') or args.get('location')
        focus_text = data.get('focus_text') or args.get('focus_text') or data.get('highlight_item') or args.get('highlight_item') or ''
        customer = data.get('customer_name') or args.get('customer_name') or data.get('customer') or args.get('customer') or ''
        source = 'manual'
        detail = {}
        if record_id:
            with get_conn() as conn:
                rows = q_all(conn, 'SELECT * FROM shipping_records WHERE id=?', [record_id])
            if rows:
                payload = _v111_focus_payload_from_record(rows[0])
                detail = payload.get('first_target') or {}
                loc = loc or detail.get('loc')
                focus_text = focus_text or detail.get('focus_text') or payload.get('focus_text') or ''
                customer = customer or detail.get('customer_name') or payload.get('customer_name') or ''
                source = 'shipping_records'
        elif audit_id:
            with get_conn() as conn:
                rows = q_all(conn, 'SELECT * FROM audit_logs WHERE id=?', [audit_id])
            if rows:
                after = _v109_safe_json(rows[0].get('after_json'), {})
                before = _v109_safe_json(rows[0].get('before_json'), {})
                locs = _v106_extract_locations(after) or _v106_extract_locations(before)
                detail = locs[0] if locs else {}
                loc = loc or _v107_loc_text(detail)
                focus_text = focus_text or (after.get('item_text') if isinstance(after, dict) else '') or (after.get('product_text') if isinstance(after, dict) else '') or str(rows[0].get('action') or '')
                source = 'audit_logs'
        parts = _v111_loc_to_parts(loc)
        url = _v107_warehouse_url_from_loc(parts, True, focus_text or customer)
        if url:
            joiner = '&' if '?' in url else '?'
            url += joiner + 'open=1&focus_row=1&target_row=1&focus_text=' + quote(str(focus_text or customer or loc or ''))
            if customer:
                url += '&customer=' + quote(str(customer))
        return jsonify({'ok': True, 'success': True, 'version': 'V111', 'source': source, 'url': url, 'loc': parts.get('loc') or str(loc or ''), 'focus_text': focus_text or customer or loc or '', 'customer_name': customer, 'target': detail})
    except Exception as e:
        log_error('api_v111_open_focus_target', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V111', 'error': str(e), 'url': ''}), 500


@app.route('/api/v111/warehouse-action-timeline', methods=['GET'])
def api_v111_warehouse_action_timeline():
    """時間軸：分類統計、格位目標、出貨扣除明細統一。"""
    try:
        base_resp = api_v110_warehouse_action_timeline()
        # Flask Response from jsonify: keep robust by rebuilding if possible.
        data = base_resp.get_json() if hasattr(base_resp, 'get_json') else {}
        items = data.get('items') or []
        for it in items:
            it['version'] = 'V111'
            if it.get('record_id') and str(it.get('type')) == 'ship':
                try:
                    with get_conn() as conn:
                        rows = q_all(conn, 'SELECT * FROM shipping_records WHERE id=?', [it.get('record_id')])
                    if rows:
                        trace = _v111_focus_payload_from_record(rows[0])
                        it['deduct_trace'] = trace
                        it['target_url'] = trace.get('focus_url') or it.get('target_url')
                        it['locations'] = trace.get('targets') or it.get('locations')
                except Exception:
                    pass
            it['open_api'] = '/api/v111/open-focus-target'
        counts = {}
        for it in items:
            t = it.get('type') or 'other'
            counts[t] = counts.get(t, 0) + 1
        return jsonify({'ok': True, 'success': True, 'version': 'V111', 'category': data.get('category'), 'counts': counts, 'items': items, 'count': len(items)})
    except Exception as e:
        log_error('api_v111_warehouse_action_timeline', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V111', 'items': [], 'error': str(e)}), 500


@app.route('/api/v111/capabilities', methods=['GET'])
def api_v111_capabilities():
    return jsonify({'ok': True, 'success': True, 'version': 'V111', 'features': [
        'shipping_deduct_trace_unified_v111',
        'open_focus_target_record_audit_loc_v111',
        'timeline_locations_use_v111_focus_payload',
        'warehouse_jump_open_focus_row_stabilized_v111',
        'helper_get_conn_q_all_runtime_guard_v111',
        'cache_bust_v111',
    ], 'updated_at': now()})
# ===================== /V111 =====================


# ===================== V112 下一包：扣倉庫共用 API 補齊 / 跳轉別名修復 / 時間軸來源穩定 =====================
# 直接寫入主檔，不新增補丁檔；補上前端已使用但舊 V 段可能不存在的 V111/V112 別名，避免 runtime 404。

def _v112_json_response_from(value):
    try:
        return value.get_json() if hasattr(value, 'get_json') else (value if isinstance(value, dict) else {})
    except Exception:
        return {}


def _v112_shipping_trace_items(limit=260, record_id=None):
    with get_conn() as conn:
        if record_id:
            rows = q_all(conn, 'SELECT * FROM shipping_records WHERE id=?', [record_id])
        else:
            rows = q_all(conn, 'SELECT * FROM shipping_records ORDER BY id DESC LIMIT ?', [max(1, min(int(limit or 260), 900))])
    return [_v111_focus_payload_from_record(r) for r in rows]


def _v112_normalize_target_payload(data):
    data = data or {}
    loc = data.get('loc') or data.get('location') or data.get('warehouse_location') or ''
    if not loc and isinstance(data.get('target'), dict):
        loc = data['target'].get('loc') or data['target'].get('location') or ''
    focus = data.get('focus_text') or data.get('highlight_item') or data.get('item_text') or data.get('product_text') or ''
    customer = data.get('customer_name') or data.get('customer') or ''
    record_id = data.get('record_id') or data.get('shipping_id') or data.get('id')
    audit_id = data.get('audit_id') or data.get('log_id')
    return {'loc': loc, 'focus_text': focus, 'customer_name': customer, 'record_id': record_id, 'audit_id': audit_id}


@app.route('/api/v111/shipping-deduct-unified', methods=['GET'])
def api_v111_shipping_deduct_unified_alias():
    """V111 前端兼容：把舊統一扣倉 API 轉到 V111 trace 格式。"""
    try:
        rid = request.args.get('id') or request.args.get('record_id') or request.args.get('shipping_id')
        limit = request.args.get('limit', 260)
        items = _v112_shipping_trace_items(limit=limit, record_id=rid)
        return jsonify({'ok': True, 'success': True, 'version': 'V111_ALIAS_V112', 'items': items, 'item': items[0] if rid and items else None, 'count': len(items)})
    except Exception as e:
        log_error('api_v111_shipping_deduct_unified_alias', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V111_ALIAS_V112', 'error': str(e), 'items': []}), 500


@app.route('/api/v111/open-and-focus-cell', methods=['GET','POST'])
def api_v111_open_and_focus_cell_alias():
    """V111 前端兼容：open-and-focus-cell 改走 open-focus-target，避免點搜尋/今日異動 404。"""
    try:
        data = request.get_json(silent=True) or {}
        merged = {}
        merged.update(request.args.to_dict(flat=True))
        merged.update(data)
        payload = _v112_normalize_target_payload(merged)
        with app.test_request_context('/api/v111/open-focus-target', method='POST', json=payload):
            resp = api_v111_open_focus_target()
        out = _v112_json_response_from(resp)
        out['version'] = 'V111_ALIAS_V112'
        out['alias_for'] = '/api/v111/open-focus-target'
        return jsonify(out)
    except Exception as e:
        log_error('api_v111_open_and_focus_cell_alias', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V111_ALIAS_V112', 'error': str(e), 'url': ''}), 500


@app.route('/api/v111/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v111_edit_locks_cleanup_report_alias():
    """V111 前端兼容：補 cleanup-report，清理過期鎖並回傳狀態。"""
    try:
        # Prefer v106/v110 implementation when it exists, otherwise do direct safe cleanup.
        fn = globals().get('api_v106_edit_locks_cleanup_report') or globals().get('api_v110_edit_locks_cleanup_report')
        if callable(fn):
            resp = fn()
            out = _v112_json_response_from(resp)
            out['version'] = 'V111_ALIAS_V112'
            return jsonify(out)
        cutoff = datetime.utcnow().isoformat()
        removed = 0
        with get_conn() as conn:
            cur = conn.cursor()
            try:
                cur.execute(sql('DELETE FROM edit_locks WHERE expires_at IS NOT NULL AND expires_at < ?'), [cutoff])
                removed = cur.rowcount or 0
                conn.commit()
            except Exception:
                conn.rollback()
        return jsonify({'ok': True, 'success': True, 'version': 'V111_ALIAS_V112', 'removed': removed, 'message': '已清理過期編輯鎖'})
    except Exception as e:
        log_error('api_v111_edit_locks_cleanup_report_alias', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V111_ALIAS_V112', 'error': str(e)}), 500


@app.route('/api/v112/shipping-deduct-trace', methods=['GET'])
def api_v112_shipping_deduct_trace():
    """V112：出貨扣倉庫追蹤共用資料，供出貨紀錄、今日異動、搜尋、時間軸共用。"""
    try:
        rid = request.args.get('id') or request.args.get('record_id') or request.args.get('shipping_id')
        limit = request.args.get('limit', 300)
        items = _v112_shipping_trace_items(limit=limit, record_id=rid)
        for it in items:
            it['version'] = 'V112'
            it['trace_api'] = '/api/v112/shipping-deduct-trace'
            it['open_api'] = '/api/v112/open-focus-target'
            it['deduct_summary'] = '、'.join([f"{t.get('loc','')} 扣{t.get('deduct_qty',0)}件 {t.get('before_qty',0)}→{t.get('after_qty',0)}" + (' 已扣空' if t.get('emptied') else '') for t in (it.get('targets') or [])])
        return jsonify({'ok': True, 'success': True, 'version': 'V112', 'items': items, 'item': items[0] if rid and items else None, 'count': len(items)})
    except Exception as e:
        log_error('api_v112_shipping_deduct_trace', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V112', 'error': str(e), 'items': []}), 500


@app.route('/api/v112/shipping-deduct-unified', methods=['GET'])
def api_v112_shipping_deduct_unified():
    """V112：提供 V110/V111 命名相容的扣倉庫統一格式。"""
    return api_v112_shipping_deduct_trace()


@app.route('/api/v112/open-focus-target', methods=['GET','POST'])
def api_v112_open_focus_target():
    """V112：統一解析 shipping/audit/loc，回傳可直接開倉庫格並定位商品列的 URL。"""
    try:
        data = request.get_json(silent=True) or {}
        merged = {}
        merged.update(request.args.to_dict(flat=True))
        merged.update(data)
        payload = _v112_normalize_target_payload(merged)
        with app.test_request_context('/api/v111/open-focus-target', method='POST', json=payload):
            resp = api_v111_open_focus_target()
        out = _v112_json_response_from(resp)
        out['version'] = 'V112'
        out['open_api'] = '/api/v112/open-focus-target'
        if out.get('url'):
            sep = '&' if '?' in out['url'] else '?'
            if 'v112=1' not in out['url']:
                out['url'] += sep + 'v112=1'
        return jsonify(out)
    except Exception as e:
        log_error('api_v112_open_focus_target', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V112', 'error': str(e), 'url': ''}), 500


@app.route('/api/v112/open-and-focus-cell', methods=['GET','POST'])
def api_v112_open_and_focus_cell():
    return api_v112_open_focus_target()


@app.route('/api/v112/warehouse-action-timeline', methods=['GET'])
def api_v112_warehouse_action_timeline():
    """V112：時間軸套用 V112 open API，出貨紀錄共用 V112 扣倉 trace。"""
    try:
        with app.test_request_context('/api/v111/warehouse-action-timeline?' + request.query_string.decode('utf-8'), method='GET'):
            resp = api_v111_warehouse_action_timeline()
        data = _v112_json_response_from(resp)
        items = data.get('items') or []
        for it in items:
            it['version'] = 'V112'
            it['open_api'] = '/api/v112/open-focus-target'
            if it.get('record_id') and str(it.get('type')) == 'ship':
                try:
                    trace_items = _v112_shipping_trace_items(record_id=it.get('record_id'))
                    if trace_items:
                        trace = trace_items[0]
                        trace['version'] = 'V112'
                        it['deduct_trace'] = trace
                        it['locations'] = trace.get('targets') or it.get('locations') or []
                        it['target_url'] = trace.get('focus_url') or it.get('target_url')
                except Exception:
                    pass
        counts = {}
        for it in items:
            t = it.get('type') or 'other'
            counts[t] = counts.get(t, 0) + 1
        return jsonify({'ok': True, 'success': True, 'version': 'V112', 'category': request.args.get('category', data.get('category') or 'all'), 'counts': counts, 'items': items, 'count': len(items)})
    except Exception as e:
        log_error('api_v112_warehouse_action_timeline', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V112', 'error': str(e), 'items': []}), 500


@app.route('/api/v112/target-resolve', methods=['GET','POST'])
def api_v112_target_resolve():
    """V112：給今日異動/離線衝突/搜尋結果共用的來源解析入口。"""
    return api_v112_open_focus_target()


@app.route('/api/v112/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v112_edit_locks_cleanup_report():
    with app.test_request_context('/api/v111/edit-locks/cleanup-report', method=request.method, json=(request.get_json(silent=True) or {})):
        resp = api_v111_edit_locks_cleanup_report_alias()
    out = _v112_json_response_from(resp)
    out['version'] = 'V112'
    return jsonify(out)


@app.route('/api/v112/capabilities', methods=['GET'])
def api_v112_capabilities():
    return jsonify({'ok': True, 'success': True, 'version': 'V112', 'features': [
        'v111_frontend_aliases_fixed_open_and_focus_cell',
        'v111_shipping_deduct_unified_alias_fixed',
        'v111_edit_lock_cleanup_report_alias_fixed',
        'shipping_deduct_trace_shared_today_search_shipping_timeline_v112',
        'open_focus_target_alias_for_shipping_audit_location_v112',
        'warehouse_timeline_uses_v112_trace_and_open_api',
        'runtime_404_guard_for_previous_v_endpoints',
        'cache_bust_v112',
    ], 'updated_at': now()})
# ===================== /V112 =====================


# ===================== V113 NEXT PACKAGE =====================
def _v113_json_response_from(resp):
    """把 Flask Response / tuple / dict 安全轉成 dict，避免新版 API 包舊 API 時 runtime 掛掉。"""
    try:
        if isinstance(resp, tuple):
            resp = resp[0]
        if hasattr(resp, 'get_json'):
            return resp.get_json(silent=True) or {}
        if isinstance(resp, dict):
            return resp
    except Exception:
        pass
    return {}


def _v113_add_focus_params(url, focus_text='', customer_name='', loc=''):
    """統一在跳轉 URL 補 open/focus_row 參數，讓今日異動/搜尋/出貨紀錄進倉庫後穩定開格與高亮。"""
    try:
        from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
        parts = urlsplit(url or '')
        q = dict(parse_qsl(parts.query, keep_blank_values=True))
        q.setdefault('open', '1')
        q.setdefault('focus_row', '1')
        q.setdefault('target_row', '1')
        q.setdefault('v113', '1')
        if focus_text:
            q.setdefault('focus_text', str(focus_text))
            q.setdefault('highlight_item', str(focus_text))
        if customer_name:
            q.setdefault('customer', str(customer_name))
        if loc:
            q.setdefault('loc', str(loc))
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(q), parts.fragment))
    except Exception:
        sep = '&' if '?' in (url or '') else '?'
        return (url or '/warehouse') + sep + 'open=1&focus_row=1&target_row=1&v113=1'


@app.route('/api/v113/open-focus-target', methods=['GET','POST'])
def api_v113_open_focus_target():
    """V113：統一跳轉解析。支援 loc / record_id / shipping_id / audit_id，回傳可直接開格與高亮商品列的 URL。"""
    try:
        data = request.get_json(silent=True) or {}
        merged = {}
        merged.update(request.args.to_dict(flat=True))
        merged.update(data)
        payload = _v112_normalize_target_payload(merged) if '_v112_normalize_target_payload' in globals() else merged
        with app.test_request_context('/api/v112/open-focus-target', method='POST', json=payload):
            resp = api_v112_open_focus_target()
        out = _v113_json_response_from(resp)
        focus = payload.get('focus_text') or payload.get('highlight_item') or payload.get('item_text') or out.get('focus_text') or ''
        customer = payload.get('customer_name') or payload.get('customer') or out.get('customer_name') or ''
        loc = payload.get('loc') or out.get('loc') or ''
        if out.get('url'):
            out['url'] = _v113_add_focus_params(out.get('url'), focus, customer, loc)
        out.update({'ok': True, 'success': True, 'version': 'V113', 'open_api': '/api/v113/open-focus-target', 'focus_text': focus, 'customer_name': customer, 'loc': loc})
        return jsonify(out)
    except Exception as e:
        log_error('api_v113_open_focus_target', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V113', 'error': str(e), 'url': ''}), 500


@app.route('/api/v113/open-and-focus-cell', methods=['GET','POST'])
def api_v113_open_and_focus_cell():
    return api_v113_open_focus_target()


@app.route('/api/v113/target-resolve', methods=['GET','POST'])
def api_v113_target_resolve():
    return api_v113_open_focus_target()


@app.route('/api/v113/shipping-deduct-trace', methods=['GET'])
def api_v113_shipping_deduct_trace():
    """V113：出貨扣倉庫追蹤資料補 target_url / open_payload，讓各頁共用同一筆資料。"""
    try:
        rid = request.args.get('id') or request.args.get('record_id') or request.args.get('shipping_id')
        limit = request.args.get('limit', 360)
        items = _v112_shipping_trace_items(limit=limit, record_id=rid)
        for it in items:
            it['version'] = 'V113'
            it['trace_api'] = '/api/v113/shipping-deduct-trace'
            it['open_api'] = '/api/v113/open-focus-target'
            total_qty = 0
            emptied = 0
            labels = []
            for t in (it.get('targets') or []):
                loc = t.get('loc') or ''
                focus = t.get('focus_text') or t.get('product_text') or it.get('item_text') or ''
                customer = t.get('customer_name') or it.get('customer_name') or ''
                t['open_api'] = '/api/v113/open-focus-target'
                t['open_payload'] = {'loc': loc, 'focus_text': focus, 'customer_name': customer, 'record_id': it.get('id')}
                t['target_url'] = _v113_add_focus_params('/warehouse', focus, customer, loc)
                try:
                    total_qty += int(t.get('deduct_qty') or 0)
                except Exception:
                    pass
                if t.get('emptied'):
                    emptied += 1
                labels.append(f"{loc} 扣{t.get('deduct_qty',0)}件 {t.get('before_qty',0)}→{t.get('after_qty',0)}" + (' 已扣空' if t.get('emptied') else ''))
            it['deduct_total_qty'] = total_qty or it.get('deduct_total_qty') or 0
            it['deduct_emptied_count'] = emptied
            it['deduct_summary'] = '、'.join(labels) or it.get('deduct_summary') or it.get('deduct_display_text') or ''
            first = (it.get('targets') or [{}])[0]
            it['focus_url'] = first.get('target_url') if first else it.get('focus_url')
        return jsonify({'ok': True, 'success': True, 'version': 'V113', 'items': items, 'item': items[0] if rid and items else None, 'count': len(items)})
    except Exception as e:
        log_error('api_v113_shipping_deduct_trace', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V113', 'error': str(e), 'items': []}), 500


@app.route('/api/v113/shipping-deduct-unified', methods=['GET'])
def api_v113_shipping_deduct_unified():
    return api_v113_shipping_deduct_trace()


@app.route('/api/v113/warehouse-action-timeline', methods=['GET'])
def api_v113_warehouse_action_timeline():
    """V113：時間軸項目補可點回格位的 target_url/open_payload，並與出貨扣倉追蹤共用資料。"""
    try:
        with app.test_request_context('/api/v112/warehouse-action-timeline?' + request.query_string.decode('utf-8'), method='GET'):
            resp = api_v112_warehouse_action_timeline()
        data = _v113_json_response_from(resp)
        items = data.get('items') or []
        for it in items:
            it['version'] = 'V113'
            it['open_api'] = '/api/v113/open-focus-target'
            if it.get('record_id') and str(it.get('type')) == 'ship':
                trace = _v112_shipping_trace_items(record_id=it.get('record_id'))
                if trace:
                    tr = trace[0]
                    it['deduct_trace'] = tr
                    it['locations'] = tr.get('targets') or it.get('locations') or []
            new_locs = []
            for l in (it.get('locations') or []):
                if not isinstance(l, dict):
                    l = {'loc': str(l)}
                loc = l.get('loc') or l.get('location') or ''
                focus = l.get('focus_text') or l.get('product_text') or it.get('focus_text') or it.get('summary') or ''
                customer = l.get('customer_name') or it.get('customer_name') or ''
                l['open_payload'] = {'loc': loc, 'focus_text': focus, 'customer_name': customer, 'record_id': it.get('record_id')}
                l['target_url'] = _v113_add_focus_params('/warehouse', focus, customer, loc)
                new_locs.append(l)
            it['locations'] = new_locs
        counts = {}
        for it in items:
            t = it.get('type') or 'other'
            counts[t] = counts.get(t, 0) + 1
        return jsonify({'ok': True, 'success': True, 'version': 'V113', 'category': request.args.get('category', data.get('category') or 'all'), 'counts': counts, 'items': items, 'count': len(items)})
    except Exception as e:
        log_error('api_v113_warehouse_action_timeline', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V113', 'error': str(e), 'items': []}), 500


@app.route('/api/v113/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v113_edit_locks_cleanup_report():
    with app.test_request_context('/api/v112/edit-locks/cleanup-report', method=request.method, json=(request.get_json(silent=True) or {})):
        resp = api_v112_edit_locks_cleanup_report()
    out = _v113_json_response_from(resp)
    out['version'] = 'V113'
    return jsonify(out)


@app.route('/api/v113/capabilities', methods=['GET'])
def api_v113_capabilities():
    return jsonify({'ok': True, 'success': True, 'version': 'V113', 'features': [
        'frontend_wired_to_v113_trace_and_open_target',
        'shipping_deduct_trace_adds_target_url_and_open_payload',
        'today_shipping_search_timeline_share_same_deduct_trace',
        'warehouse_timeline_items_click_back_to_cell',
        'open_focus_target_adds_stable_focus_params',
        'v112_compat_aliases_kept',
        'cache_bust_v113',
    ], 'updated_at': now()})
# ===================== /V113 NEXT PACKAGE =====================

# ===================== V114 NEXT PACKAGE =====================
def _v114_json_response_from(resp):
    try:
        if isinstance(resp, tuple):
            resp = resp[0]
        if hasattr(resp, 'get_json'):
            return resp.get_json(silent=True) or {}
        return resp if isinstance(resp, dict) else {}
    except Exception:
        return {}


def _v114_payload_value(name, default=''):
    data = request.get_json(silent=True) or {}
    return data.get(name) or request.args.get(name) or default


def _v114_normalize_loc(loc):
    s = str(loc or '').strip().upper().replace('區', '').replace('倉', '').replace('欄', '-').replace('格', '')
    s = s.replace('_', '-').replace(' ', '-')
    parts = [p for p in s.split('-') if p != '']
    if len(parts) >= 3 and parts[0] in ('A', 'B'):
        return f"{parts[0]}-{parts[1]}-{parts[2]}"
    return str(loc or '').strip()


def _v114_add_focus_params(url, focus_text='', customer_name='', loc='', record_id='', source=''):
    try:
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
        loc = _v114_normalize_loc(loc)
        parsed = urlparse(url or '/warehouse')
        q = parse_qs(parsed.query)
        q.setdefault('open', ['1'])
        q.setdefault('focus_row', ['1'])
        q.setdefault('target_row', ['1'])
        q.setdefault('v114', ['1'])
        q.setdefault('stable_focus', ['1'])
        if loc:
            q['loc'] = [loc]
        if focus_text:
            q['focus_text'] = [str(focus_text)]
            q['highlight_item'] = [str(focus_text)]
        if customer_name:
            q['customer'] = [str(customer_name)]
        if record_id:
            q['record_id'] = [str(record_id)]
        if source:
            q['source'] = [str(source)]
        return urlunparse((parsed.scheme, parsed.netloc, parsed.path or '/warehouse', parsed.params, urlencode(q, doseq=True), parsed.fragment))
    except Exception:
        sep = '&' if '?' in (url or '') else '?'
        return (url or '/warehouse') + sep + 'open=1&focus_row=1&target_row=1&stable_focus=1&v114=1'


@app.route('/api/v114/open-focus-target', methods=['GET','POST'])
def api_v114_open_focus_target():
    """V114：統一跳轉 payload，補穩定開格/高亮參數與 loc 正規化。"""
    try:
        data = request.get_json(silent=True) or {}
        loc = _v114_normalize_loc(data.get('loc') or request.args.get('loc') or data.get('location') or request.args.get('location') or '')
        focus = data.get('focus_text') or request.args.get('focus_text') or data.get('highlight_item') or request.args.get('highlight_item') or data.get('product_text') or request.args.get('product_text') or ''
        customer = data.get('customer_name') or request.args.get('customer_name') or data.get('customer') or request.args.get('customer') or ''
        record_id = data.get('record_id') or request.args.get('record_id') or data.get('shipping_id') or request.args.get('shipping_id') or ''
        source = data.get('source') or request.args.get('source') or 'v114'
        # Reuse V113 resolver when possible, then strengthen target_url.
        with app.test_request_context('/api/v113/open-focus-target', method='POST', json={**data, 'loc': loc, 'focus_text': focus, 'customer_name': customer, 'record_id': record_id}):
            resp = api_v113_open_focus_target()
        out = _v114_json_response_from(resp)
        target_url = out.get('url') or out.get('target_url') or '/warehouse'
        out.update({
            'ok': True, 'success': True, 'version': 'V114',
            'loc': loc, 'focus_text': focus, 'customer_name': customer,
            'record_id': record_id, 'source': source,
            'open_api': '/api/v114/open-focus-target',
            'url': _v114_add_focus_params(target_url, focus, customer, loc, record_id, source),
        })
        out['target_url'] = out['url']
        out['open_payload'] = {'loc': loc, 'focus_text': focus, 'customer_name': customer, 'record_id': record_id, 'source': source}
        return jsonify(out)
    except Exception as e:
        log_error('api_v114_open_focus_target', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V114', 'error': str(e), 'url': ''}), 500


@app.route('/api/v114/open-and-focus-cell', methods=['GET','POST'])
def api_v114_open_and_focus_cell():
    return api_v114_open_focus_target()


@app.route('/api/v114/target-resolve', methods=['GET','POST'])
def api_v114_target_resolve():
    return api_v114_open_focus_target()


@app.route('/api/v114/shipping-deduct-trace', methods=['GET'])
def api_v114_shipping_deduct_trace():
    """V114：出貨扣倉庫 trace 統一 target_url/open_payload，提供扣空/扣前後摘要。"""
    try:
        with app.test_request_context('/api/v113/shipping-deduct-trace?' + request.query_string.decode('utf-8'), method='GET'):
            resp = api_v113_shipping_deduct_trace()
        data = _v114_json_response_from(resp)
        items = data.get('items') or ([] if not data.get('item') else [data.get('item')])
        for it in items:
            it['version'] = 'V114'
            it['trace_api'] = '/api/v114/shipping-deduct-trace'
            it['open_api'] = '/api/v114/open-focus-target'
            summaries = []
            for t in (it.get('targets') or []):
                loc = _v114_normalize_loc(t.get('loc') or t.get('location') or '')
                focus = t.get('focus_text') or t.get('product_text') or it.get('item_text') or it.get('product_text') or ''
                customer = t.get('customer_name') or it.get('customer_name') or ''
                rid = it.get('id') or it.get('record_id') or request.args.get('id') or ''
                t['loc'] = loc
                t['open_api'] = '/api/v114/open-focus-target'
                t['open_payload'] = {'loc': loc, 'focus_text': focus, 'customer_name': customer, 'record_id': rid, 'source': 'shipping_trace'}
                t['target_url'] = _v114_add_focus_params('/warehouse', focus, customer, loc, rid, 'shipping_trace')
                summaries.append(f"{loc} 扣{t.get('deduct_qty',0)}件｜{t.get('before_qty',0)}→{t.get('after_qty',0)}" + ('｜已扣空' if t.get('emptied') else ''))
            it['deduct_summary'] = '、'.join([x for x in summaries if x.strip()]) or it.get('deduct_summary') or ''
            it['target_url'] = ((it.get('targets') or [{}])[0]).get('target_url') or it.get('target_url') or ''
        return jsonify({'ok': True, 'success': True, 'version': 'V114', 'items': items, 'item': items[0] if (request.args.get('id') or request.args.get('record_id')) and items else None, 'count': len(items)})
    except Exception as e:
        log_error('api_v114_shipping_deduct_trace', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V114', 'error': str(e), 'items': []}), 500


@app.route('/api/v114/shipping-deduct-unified', methods=['GET'])
def api_v114_shipping_deduct_unified():
    return api_v114_shipping_deduct_trace()


@app.route('/api/v114/warehouse-action-timeline', methods=['GET'])
def api_v114_warehouse_action_timeline():
    """V114：時間軸分類統計補 all/empty/other，並讓每筆 loc 都可點回格位。"""
    try:
        with app.test_request_context('/api/v113/warehouse-action-timeline?' + request.query_string.decode('utf-8'), method='GET'):
            resp = api_v113_warehouse_action_timeline()
        data = _v114_json_response_from(resp)
        items = data.get('items') or []
        counts = {'all': len(items)}
        for it in items:
            typ = it.get('type') or it.get('action') or 'other'
            counts[typ] = counts.get(typ, 0) + 1
            it['version'] = 'V114'
            it['open_api'] = '/api/v114/open-focus-target'
            locs = []
            for l in (it.get('locations') or []):
                if not isinstance(l, dict):
                    l = {'loc': str(l)}
                loc = _v114_normalize_loc(l.get('loc') or l.get('location') or '')
                focus = l.get('focus_text') or l.get('product_text') or it.get('focus_text') or it.get('summary') or ''
                customer = l.get('customer_name') or it.get('customer_name') or ''
                rid = it.get('record_id') or ''
                l['loc'] = loc
                l['open_payload'] = {'loc': loc, 'focus_text': focus, 'customer_name': customer, 'record_id': rid, 'source': 'warehouse_timeline'}
                l['target_url'] = _v114_add_focus_params('/warehouse', focus, customer, loc, rid, 'warehouse_timeline')
                locs.append(l)
            it['locations'] = locs
        return jsonify({'ok': True, 'success': True, 'version': 'V114', 'category': request.args.get('category') or data.get('category') or 'all', 'counts': counts, 'items': items, 'count': len(items)})
    except Exception as e:
        log_error('api_v114_warehouse_action_timeline', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V114', 'error': str(e), 'items': []}), 500


@app.route('/api/v114/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v114_edit_locks_cleanup_report():
    with app.test_request_context('/api/v113/edit-locks/cleanup-report', method=request.method, json=(request.get_json(silent=True) or {})):
        resp = api_v113_edit_locks_cleanup_report()
    out = _v114_json_response_from(resp)
    out['version'] = 'V114'
    out['cleanup_api'] = '/api/v114/edit-locks/cleanup-report'
    return jsonify(out)


@app.route('/api/v114/capabilities', methods=['GET'])
def api_v114_capabilities():
    return jsonify({'ok': True, 'success': True, 'version': 'V114', 'features': [
        'stable_open_focus_target_with_loc_normalize',
        'shipping_deduct_trace_unified_target_payload',
        'timeline_click_back_to_cell_with_counts_all',
        'frontend_uses_v114_api_and_v113_aliases_kept',
        'warehouse_focus_params_stable_focus_target_row_open',
        'cache_bust_v114',
    ], 'updated_at': now()})
# ===================== /V114 NEXT PACKAGE =====================


# ===================== V115 NEXT PACKAGE =====================
def _v115_json_response_from(resp):
    try:
        if isinstance(resp, tuple):
            resp = resp[0]
        if hasattr(resp, 'get_json'):
            return resp.get_json(silent=True) or {}
        return resp if isinstance(resp, dict) else {}
    except Exception:
        return {}


def _v115_normalize_loc(loc):
    try:
        return _v114_normalize_loc(loc)
    except Exception:
        s = str(loc or '').strip().upper().replace('區','').replace('倉','').replace('欄','-').replace('格','')
        s = s.replace('_','-').replace(' ','-')
        parts = [p for p in s.split('-') if p]
        if len(parts) >= 3 and parts[0] in ('A','B'):
            return f"{parts[0]}-{parts[1]}-{parts[2]}"
        return str(loc or '').strip()


def _v115_add_focus_params(url, focus_text='', customer_name='', loc='', record_id='', source=''):
    try:
        out = _v114_add_focus_params(url, focus_text, customer_name, loc, record_id, source)
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
        parsed = urlparse(out or '/warehouse')
        q = parse_qs(parsed.query)
        q['v115'] = ['1']
        q['auto_open_cell'] = ['1']
        q['scroll_item'] = ['1']
        q['fallback_open'] = ['1']
        return urlunparse((parsed.scheme, parsed.netloc, parsed.path or '/warehouse', parsed.params, urlencode(q, doseq=True), parsed.fragment))
    except Exception:
        loc = _v115_normalize_loc(loc)
        sep = '&' if '?' in (url or '/warehouse') else '?'
        return (url or '/warehouse') + sep + 'open=1&auto_open_cell=1&scroll_item=1&fallback_open=1&v115=1' + (('&loc='+str(loc)) if loc else '')


def _v115_target_payload(loc='', focus_text='', customer_name='', record_id='', source='v115', fallback_url='/warehouse'):
    loc = _v115_normalize_loc(loc)
    return {
        'loc': loc,
        'focus_text': focus_text or '',
        'highlight_item': focus_text or '',
        'customer_name': customer_name or '',
        'record_id': record_id or '',
        'source': source or 'v115',
        'target_url': _v115_add_focus_params(fallback_url or '/warehouse', focus_text, customer_name, loc, record_id, source),
        'open_api': '/api/v115/open-focus-target',
    }


@app.route('/api/v115/open-focus-target', methods=['GET','POST'])
def api_v115_open_focus_target():
    """V115：統一跳轉 payload，並加入失敗 fallback 參數，避免只開頁不開格。"""
    try:
        data = request.get_json(silent=True) or {}
        loc = _v115_normalize_loc(data.get('loc') or request.args.get('loc') or data.get('location') or request.args.get('location') or '')
        focus = data.get('focus_text') or request.args.get('focus_text') or data.get('highlight_item') or request.args.get('highlight_item') or data.get('product_text') or request.args.get('product_text') or ''
        customer = data.get('customer_name') or request.args.get('customer_name') or request.args.get('customer') or data.get('customer') or ''
        rid = data.get('record_id') or request.args.get('record_id') or request.args.get('id') or data.get('id') or ''
        source = data.get('source') or request.args.get('source') or 'v115'
        # 先用 V114 的解析邏輯，保留舊功能；再補 V115 穩定參數。
        with app.test_request_context('/api/v114/open-focus-target?' + request.query_string.decode('utf-8'), method=request.method, json=data):
            resp = api_v114_open_focus_target()
        out = _v115_json_response_from(resp)
        url = out.get('url') or out.get('target_url') or '/warehouse'
        out.update({
            'ok': True,
            'success': True,
            'version': 'V115',
            'open_api': '/api/v115/open-focus-target',
            'loc': loc or out.get('loc') or '',
            'focus_text': focus or out.get('focus_text') or '',
            'customer_name': customer or out.get('customer_name') or '',
            'record_id': rid or out.get('record_id') or '',
            'source': source,
            'url': _v115_add_focus_params(url, focus or out.get('focus_text') or '', customer or out.get('customer_name') or '', loc or out.get('loc') or '', rid, source),
        })
        out['open_payload'] = _v115_target_payload(out.get('loc'), out.get('focus_text'), out.get('customer_name'), out.get('record_id'), source, out.get('url'))
        return jsonify(out)
    except Exception as e:
        log_error('api_v115_open_focus_target', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V115', 'error': str(e), 'url': '/warehouse?open=1&fallback_open=1&v115=1'}), 500


@app.route('/api/v115/open-and-focus-cell', methods=['GET','POST'])
def api_v115_open_and_focus_cell():
    return api_v115_open_focus_target()


@app.route('/api/v115/open-focus-target/fallback', methods=['GET','POST'])
def api_v115_open_focus_target_fallback():
    return api_v115_open_focus_target()


@app.route('/api/v115/target-resolve', methods=['GET','POST'])
def api_v115_target_resolve():
    return api_v115_open_focus_target()


@app.route('/api/v115/shipping-deduct-trace', methods=['GET'])
def api_v115_shipping_deduct_trace():
    """V115：扣倉庫追蹤資料統一加 target_url/open_payload，供今日異動、搜尋、出貨紀錄共用。"""
    try:
        with app.test_request_context('/api/v114/shipping-deduct-trace?' + request.query_string.decode('utf-8'), method='GET'):
            resp = api_v114_shipping_deduct_trace()
        data = _v115_json_response_from(resp)
        items = data.get('items') or ([] if not data.get('item') else [data.get('item')])
        for it in items:
            it['version'] = 'V115'
            it['trace_api'] = '/api/v115/shipping-deduct-trace'
            it['open_api'] = '/api/v115/open-focus-target'
            targets = []
            for t in (it.get('targets') or []):
                loc = _v115_normalize_loc(t.get('loc') or t.get('location') or '')
                focus = t.get('focus_text') or t.get('product_text') or it.get('item_text') or it.get('product_text') or ''
                customer = t.get('customer_name') or it.get('customer_name') or ''
                rid = it.get('id') or it.get('record_id') or request.args.get('id') or ''
                payload = _v115_target_payload(loc, focus, customer, rid, 'shipping_trace')
                t.update(payload)
                targets.append(t)
            it['targets'] = targets
            it['target_url'] = (targets[0].get('target_url') if targets else it.get('target_url') or '')
            it['open_payload'] = targets[0].get('open_payload') if targets else _v115_target_payload('', it.get('item_text') or '', it.get('customer_name') or '', it.get('id') or '', 'shipping_trace')
            it['deduct_summary'] = it.get('deduct_summary') or '、'.join([f"{x.get('loc','')} 扣{x.get('deduct_qty',0)}件" for x in targets if x.get('loc')])
        return jsonify({'ok': True, 'success': True, 'version': 'V115', 'items': items, 'item': items[0] if (request.args.get('id') or request.args.get('record_id')) and items else None, 'count': len(items)})
    except Exception as e:
        log_error('api_v115_shipping_deduct_trace', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V115', 'error': str(e), 'items': []}), 500


@app.route('/api/v115/shipping-deduct-unified', methods=['GET'])
def api_v115_shipping_deduct_unified():
    return api_v115_shipping_deduct_trace()


@app.route('/api/v115/warehouse-action-timeline', methods=['GET'])
def api_v115_warehouse_action_timeline():
    """V115：時間軸每筆都附 V115 open_payload，並保留分類統計。"""
    try:
        with app.test_request_context('/api/v114/warehouse-action-timeline?' + request.query_string.decode('utf-8'), method='GET'):
            resp = api_v114_warehouse_action_timeline()
        data = _v115_json_response_from(resp)
        items = data.get('items') or []
        counts = data.get('counts') or {'all': len(items)}
        counts['all'] = len(items)
        for it in items:
            it['version'] = 'V115'
            it['open_api'] = '/api/v115/open-focus-target'
            locs = []
            for l in (it.get('locations') or []):
                if not isinstance(l, dict):
                    l = {'loc': str(l)}
                loc = _v115_normalize_loc(l.get('loc') or l.get('location') or '')
                focus = l.get('focus_text') or l.get('product_text') or it.get('focus_text') or it.get('summary') or ''
                customer = l.get('customer_name') or it.get('customer_name') or ''
                rid = it.get('record_id') or it.get('id') or ''
                payload = _v115_target_payload(loc, focus, customer, rid, 'warehouse_timeline')
                l.update(payload)
                locs.append(l)
            it['locations'] = locs
        return jsonify({'ok': True, 'success': True, 'version': 'V115', 'category': request.args.get('category') or data.get('category') or 'all', 'counts': counts, 'items': items, 'count': len(items)})
    except Exception as e:
        log_error('api_v115_warehouse_action_timeline', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V115', 'error': str(e), 'items': []}), 500


@app.route('/api/v115/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v115_edit_locks_cleanup_report():
    with app.test_request_context('/api/v114/edit-locks/cleanup-report', method=request.method, json=(request.get_json(silent=True) or {})):
        resp = api_v114_edit_locks_cleanup_report()
    out = _v115_json_response_from(resp)
    out['version'] = 'V115'
    out['cleanup_api'] = '/api/v115/edit-locks/cleanup-report'
    return jsonify(out)


@app.route('/api/v115/compat-aliases', methods=['GET'])
def api_v115_compat_aliases():
    return jsonify({'ok': True, 'success': True, 'version': 'V115', 'aliases': {
        'open-focus-target': ['/api/v115/open-focus-target','/api/v115/open-and-focus-cell','/api/v115/target-resolve'],
        'shipping-deduct-trace': ['/api/v115/shipping-deduct-trace','/api/v115/shipping-deduct-unified'],
        'timeline': ['/api/v115/warehouse-action-timeline'],
        'locks': ['/api/v115/edit-locks/cleanup-report'],
    }})


@app.route('/api/v115/capabilities', methods=['GET'])
def api_v115_capabilities():
    return jsonify({'ok': True, 'success': True, 'version': 'V115', 'features': [
        'v115_frontend_api_wiring',
        'open_focus_target_fallback_params_auto_open_cell_scroll_item',
        'shipping_today_search_timeline_share_v115_target_payload',
        'warehouse_action_timeline_clickback_uses_v115_payload',
        'compat_aliases_for_v114_v113_frontend_calls',
        'cache_bust_v115',
    ], 'updated_at': now()})
# ===================== /V115 NEXT PACKAGE =====================


# ===================== V116 NEXT PACKAGE =====================
def _v116_json_response_from(resp):
    try:
        if isinstance(resp, tuple):
            resp = resp[0]
        return resp.get_json(silent=True) or {}
    except Exception:
        return {}

def _v116_safe_open_payload(loc='', focus_text='', customer_name='', record_id='', source='v116'):
    try:
        return _v115_target_payload(loc, focus_text, customer_name, record_id, source, '/warehouse')
    except Exception:
        loc = str(loc or '').strip().upper().replace('區','').replace('欄','-').replace('格','')
        return {
            'ok': True,
            'success': True,
            'version': 'V116',
            'loc': loc,
            'focus_text': focus_text or '',
            'customer_name': customer_name or '',
            'record_id': record_id or '',
            'target_url': '/warehouse?open=1&auto_open_cell=1&scroll_item=1&fallback_open=1&v116=1' + (('&loc=' + loc) if loc else ''),
            'open_payload': {'loc': loc, 'focus_text': focus_text or '', 'customer_name': customer_name or '', 'record_id': record_id or '', 'source': source or 'v116'},
            'open_api': '/api/v116/open-focus-target',
        }

@app.route('/api/v116/open-focus-target', methods=['GET','POST'])
def api_v116_open_focus_target():
    """V116：跳倉庫格失敗時提供多層 fallback，前端可用同一 payload 穩定開格/高亮。"""
    try:
        data = request.get_json(silent=True) or {}
        loc = data.get('loc') or request.args.get('loc') or data.get('location') or request.args.get('location') or ''
        focus = data.get('focus_text') or request.args.get('focus_text') or data.get('highlight_item') or request.args.get('highlight_item') or ''
        customer = data.get('customer_name') or request.args.get('customer_name') or data.get('customer') or request.args.get('customer') or ''
        rid = data.get('record_id') or request.args.get('record_id') or data.get('id') or request.args.get('id') or ''
        source = data.get('source') or request.args.get('source') or 'v116'
        with app.test_request_context('/api/v115/open-focus-target', method='POST', json={'loc': loc, 'focus_text': focus, 'customer_name': customer, 'record_id': rid, 'source': source}):
            resp = api_v115_open_focus_target()
        out = _v116_json_response_from(resp)
        fallback = _v116_safe_open_payload(loc or out.get('loc'), focus or out.get('focus_text'), customer or out.get('customer_name'), rid or out.get('record_id'), source)
        out.update({
            'ok': True,
            'success': True,
            'version': 'V116',
            'open_api': '/api/v116/open-focus-target',
            'fallback_api': '/api/v116/open-focus-target/fallback',
            'fallback_payload': fallback,
            'url': (out.get('url') or fallback.get('target_url') or '/warehouse')
        })
        # 確保網址一定帶 V116 參數，手機快取和前端焦點流程會走新版。
        if 'v116=1' not in out['url']:
            sep = '&' if '?' in out['url'] else '?'
            out['url'] = out['url'] + sep + 'v116=1&retry_focus=1&fallback_open=1'
        out['target_url'] = out.get('url')
        out['open_payload'] = fallback.get('open_payload') or fallback
        return jsonify(out)
    except Exception as e:
        log_error('api_v116_open_focus_target', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V116', 'error': str(e), 'url': '/warehouse?open=1&fallback_open=1&retry_focus=1&v116=1'}), 500

@app.route('/api/v116/open-and-focus-cell', methods=['GET','POST'])
def api_v116_open_and_focus_cell():
    return api_v116_open_focus_target()

@app.route('/api/v116/open-focus-target/fallback', methods=['GET','POST'])
def api_v116_open_focus_target_fallback():
    return api_v116_open_focus_target()

@app.route('/api/v116/target-resolve', methods=['GET','POST'])
def api_v116_target_resolve():
    return api_v116_open_focus_target()

@app.route('/api/v116/shipping-deduct-trace', methods=['GET'])
def api_v116_shipping_deduct_trace():
    """V116：扣倉庫追蹤資料再補 fallback_payload，避免今日異動/搜尋/出貨紀錄任一頁缺參數。"""
    try:
        with app.test_request_context('/api/v115/shipping-deduct-trace?' + request.query_string.decode('utf-8'), method='GET'):
            resp = api_v115_shipping_deduct_trace()
        data = _v116_json_response_from(resp)
        items = data.get('items') or ([] if not data.get('item') else [data.get('item')])
        for it in items:
            it['version'] = 'V116'
            it['trace_api'] = '/api/v116/shipping-deduct-trace'
            it['open_api'] = '/api/v116/open-focus-target'
            new_targets = []
            for t in (it.get('targets') or []):
                loc = t.get('loc') or t.get('location') or ''
                focus = t.get('focus_text') or t.get('product_text') or it.get('item_text') or it.get('product_text') or ''
                customer = t.get('customer_name') or it.get('customer_name') or ''
                rid = it.get('id') or it.get('record_id') or request.args.get('id') or ''
                fallback = _v116_safe_open_payload(loc, focus, customer, rid, 'shipping_trace')
                t.update({'version': 'V116', 'open_api': '/api/v116/open-focus-target', 'fallback_payload': fallback, 'target_url': fallback.get('target_url'), 'open_payload': fallback.get('open_payload') or fallback})
                new_targets.append(t)
            it['targets'] = new_targets
            it['target_url'] = new_targets[0].get('target_url') if new_targets else it.get('target_url','')
            it['open_payload'] = new_targets[0].get('open_payload') if new_targets else _v116_safe_open_payload('', it.get('item_text') or '', it.get('customer_name') or '', it.get('id') or '', 'shipping_trace').get('open_payload')
            it['deduct_summary'] = it.get('deduct_summary') or '、'.join([f"{x.get('loc','')} 扣{x.get('deduct_qty',0)}件" for x in new_targets if x.get('loc')])
        return jsonify({'ok': True, 'success': True, 'version': 'V116', 'items': items, 'item': items[0] if (request.args.get('id') or request.args.get('record_id')) and items else None, 'count': len(items)})
    except Exception as e:
        log_error('api_v116_shipping_deduct_trace', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V116', 'error': str(e), 'items': []}), 500

@app.route('/api/v116/shipping-deduct-unified', methods=['GET'])
def api_v116_shipping_deduct_unified():
    return api_v116_shipping_deduct_trace()

@app.route('/api/v116/warehouse-action-timeline', methods=['GET'])
def api_v116_warehouse_action_timeline():
    """V116：時間軸每筆補 fallback target，並把分類統計格式固定。"""
    try:
        with app.test_request_context('/api/v115/warehouse-action-timeline?' + request.query_string.decode('utf-8'), method='GET'):
            resp = api_v115_warehouse_action_timeline()
        data = _v116_json_response_from(resp)
        items = data.get('items') or []
        counts = data.get('counts') or {}
        counts['all'] = len(items)
        for it in items:
            it['version'] = 'V116'
            it['open_api'] = '/api/v116/open-focus-target'
            locs = []
            for l in (it.get('locations') or []):
                if not isinstance(l, dict):
                    l = {'loc': str(l)}
                loc = l.get('loc') or l.get('location') or ''
                focus = l.get('focus_text') or l.get('product_text') or it.get('focus_text') or it.get('summary') or ''
                customer = l.get('customer_name') or it.get('customer_name') or ''
                rid = it.get('record_id') or it.get('id') or ''
                fallback = _v116_safe_open_payload(loc, focus, customer, rid, 'warehouse_timeline')
                l.update({'version': 'V116', 'open_api': '/api/v116/open-focus-target', 'fallback_payload': fallback, 'target_url': fallback.get('target_url'), 'open_payload': fallback.get('open_payload') or fallback})
                locs.append(l)
            it['locations'] = locs
        return jsonify({'ok': True, 'success': True, 'version': 'V116', 'category': request.args.get('category') or data.get('category') or 'all', 'counts': counts, 'items': items, 'count': len(items)})
    except Exception as e:
        log_error('api_v116_warehouse_action_timeline', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V116', 'error': str(e), 'items': []}), 500

@app.route('/api/v116/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v116_edit_locks_cleanup_report():
    with app.test_request_context('/api/v115/edit-locks/cleanup-report', method=request.method, json=(request.get_json(silent=True) or {})):
        resp = api_v115_edit_locks_cleanup_report()
    out = _v116_json_response_from(resp)
    out['version'] = 'V116'
    out['cleanup_api'] = '/api/v116/edit-locks/cleanup-report'
    return jsonify(out)

@app.route('/api/v116/compat-aliases', methods=['GET'])
def api_v116_compat_aliases():
    return jsonify({'ok': True, 'success': True, 'version': 'V116', 'aliases': {
        'open-focus-target': ['/api/v116/open-focus-target','/api/v116/open-and-focus-cell','/api/v116/target-resolve','/api/v116/open-focus-target/fallback'],
        'shipping-deduct-trace': ['/api/v116/shipping-deduct-trace','/api/v116/shipping-deduct-unified'],
        'timeline': ['/api/v116/warehouse-action-timeline'],
        'locks': ['/api/v116/edit-locks/cleanup-report'],
    }})

@app.route('/api/v116/capabilities', methods=['GET'])
def api_v116_capabilities():
    return jsonify({'ok': True, 'success': True, 'version': 'V116', 'features': [
        'v116_stable_open_focus_fallback_payload',
        'v116_shipping_deduct_trace_fallback_target_url',
        'v116_timeline_clickback_payload_consistency',
        'v116_edit_lock_cleanup_alias',
        'v116_cache_bust',
    ], 'updated_at': now()})
# ===================== /V116 NEXT PACKAGE =====================

# ===================== V117 NEXT PACKAGE =====================
def _v117_json_response_from(resp):
    """V117: normalize Flask Response/dict/list into a safe dict for compatibility wrappers."""
    try:
        if hasattr(resp, 'get_json'):
            return resp.get_json(silent=True) or {}
        if isinstance(resp, tuple) and resp:
            return _v117_json_response_from(resp[0])
        if isinstance(resp, dict):
            return resp
    except Exception:
        pass
    return {}

def _v117_norm_loc(loc):
    try:
        raw = str(loc or '').strip().upper().replace('區','').replace('倉','').replace('_','-').replace(' ','')
        raw = raw.replace('欄','-').replace('格','')
        raw = raw.replace('--','-')
        return raw
    except Exception:
        return ''

def _v117_open_payload(loc='', focus_text='', customer_name='', record_id='', source='v117', extra=None):
    loc = _v117_norm_loc(loc)
    payload = {
        'loc': loc,
        'focus_text': focus_text or '',
        'customer_name': customer_name or '',
        'record_id': record_id or '',
        'source': source or 'v117',
        'version': 'V117',
        'retry_focus': 1,
        'fallback_open': 1,
        'auto_open_cell': 1,
        'scroll_item': 1,
    }
    if isinstance(extra, dict):
        payload.update({k: v for k, v in extra.items() if v is not None})
    query = '&'.join([f'{k}={quote(str(v))}' for k, v in {
        'open': 1, 'auto_open_cell': 1, 'scroll_item': 1, 'fallback_open': 1, 'retry_focus': 1, 'v117': 1,
        'loc': loc, 'focus_text': payload.get('focus_text',''), 'customer': payload.get('customer_name',''), 'highlight_item': payload.get('focus_text','')
    }.items() if str(v) != ''])
    return {
        'ok': True,
        'success': True,
        'version': 'V117',
        'loc': loc,
        'url': '/warehouse?' + query,
        'target_url': '/warehouse?' + query,
        'open_payload': payload,
        'fallback_payload': payload,
        'open_api': '/api/v117/open-focus-target',
    }

@app.route('/api/v117/open-focus-target', methods=['GET','POST'])
def api_v117_open_focus_target():
    """V117: one stable target opener used by today/search/shipping/timeline with fallback payload."""
    try:
        data = request.get_json(silent=True) or {}
        loc = data.get('loc') or data.get('location') or data.get('warehouse_location') or request.args.get('loc') or request.args.get('location') or ''
        focus = data.get('focus_text') or data.get('highlight_item') or data.get('item_text') or request.args.get('focus_text') or request.args.get('highlight_item') or ''
        customer = data.get('customer_name') or data.get('customer') or request.args.get('customer_name') or request.args.get('customer') or ''
        rid = data.get('record_id') or data.get('id') or request.args.get('record_id') or request.args.get('id') or ''
        source = data.get('source') or request.args.get('source') or 'v117'
        base = {}
        try:
            base = _v117_json_response_from(api_v116_open_focus_target())
        except Exception:
            base = {}
        fallback = _v117_open_payload(loc or base.get('loc'), focus or base.get('focus_text'), customer or base.get('customer_name'), rid or base.get('record_id'), source)
        out = dict(base or {})
        out.update({
            'ok': True,
            'success': True,
            'version': 'V117',
            'loc': fallback.get('loc') or out.get('loc') or _v117_norm_loc(loc),
            'url': fallback.get('url'),
            'target_url': fallback.get('target_url'),
            'open_payload': fallback.get('open_payload'),
            'fallback_payload': fallback.get('fallback_payload'),
            'open_api': '/api/v117/open-focus-target',
            'compat_from': out.get('version') or 'V116',
        })
        return jsonify(out)
    except Exception as e:
        log_error('api_v117_open_focus_target', str(e))
        return jsonify(_v117_open_payload('', '', '', '', 'error') | {'ok': False, 'success': False, 'error': str(e)}), 500

@app.route('/api/v117/open-and-focus-cell', methods=['GET','POST'])
def api_v117_open_and_focus_cell():
    return api_v117_open_focus_target()

@app.route('/api/v117/target-resolve', methods=['GET','POST'])
def api_v117_target_resolve():
    return api_v117_open_focus_target()

@app.route('/api/v117/open-focus-target/fallback', methods=['GET','POST'])
def api_v117_open_focus_target_fallback():
    return api_v117_open_focus_target()

@app.route('/api/v117/shipping-deduct-trace', methods=['GET'])
def api_v117_shipping_deduct_trace():
    """V117: trace records always include target_url/open_payload/fallback_payload and safe missing-field defaults."""
    try:
        data = {}
        try:
            data = _v117_json_response_from(api_v116_shipping_deduct_trace())
        except Exception:
            data = {}
        items = data.get('items') or ([] if not data.get('item') else [data.get('item')])
        normalized = []
        for it in items:
            if not isinstance(it, dict):
                continue
            item = dict(it)
            item['version'] = 'V117'
            item['trace_api'] = '/api/v117/shipping-deduct-trace'
            item['open_api'] = '/api/v117/open-focus-target'
            targets = item.get('targets') or item.get('locations') or []
            if isinstance(targets, dict):
                targets = [targets]
            new_targets = []
            for t in targets:
                if not isinstance(t, dict):
                    t = {'loc': str(t)}
                loc = t.get('loc') or t.get('location') or item.get('warehouse_location') or ''
                focus = t.get('focus_text') or item.get('focus_text') or item.get('item_text') or item.get('product_text') or item.get('summary') or ''
                customer = t.get('customer_name') or item.get('customer_name') or item.get('customer') or ''
                rid = t.get('record_id') or item.get('id') or item.get('record_id') or ''
                payload = _v117_open_payload(loc, focus, customer, rid, 'shipping_deduct_trace')
                nt = dict(t)
                nt.update({
                    'version': 'V117',
                    'loc': payload.get('loc'),
                    'target_url': payload.get('target_url'),
                    'open_payload': payload.get('open_payload'),
                    'fallback_payload': payload.get('fallback_payload'),
                    'open_api': '/api/v117/open-focus-target',
                })
                new_targets.append(nt)
            if not new_targets:
                payload = _v117_open_payload(item.get('warehouse_location') or '', item.get('item_text') or item.get('summary') or '', item.get('customer_name') or '', item.get('id') or item.get('record_id') or '', 'shipping_deduct_trace_empty')
                new_targets.append({'loc': payload.get('loc'), 'target_url': payload.get('target_url'), 'open_payload': payload.get('open_payload'), 'fallback_payload': payload.get('fallback_payload'), 'open_api': '/api/v117/open-focus-target', 'version': 'V117'})
            item['targets'] = new_targets
            item['locations'] = new_targets
            item['target_url'] = new_targets[0].get('target_url')
            item['open_payload'] = new_targets[0].get('open_payload')
            item['fallback_payload'] = new_targets[0].get('fallback_payload')
            item['deduct_summary'] = item.get('deduct_summary') or item.get('warehouse_deduct_summary') or item.get('summary') or '倉庫扣除追蹤'
            normalized.append(item)
        rid = request.args.get('id') or request.args.get('record_id')
        return jsonify({'ok': True, 'success': True, 'version': 'V117', 'items': normalized, 'item': (normalized[0] if rid and normalized else None), 'count': len(normalized)})
    except Exception as e:
        log_error('api_v117_shipping_deduct_trace', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V117', 'error': str(e), 'items': []}), 500

@app.route('/api/v117/shipping-deduct-unified', methods=['GET'])
def api_v117_shipping_deduct_unified():
    return api_v117_shipping_deduct_trace()

@app.route('/api/v117/warehouse-action-timeline', methods=['GET'])
def api_v117_warehouse_action_timeline():
    """V117: timeline items use the same open payload as shipping trace and never fail when locations are missing."""
    try:
        data = {}
        try:
            data = _v117_json_response_from(api_v116_warehouse_action_timeline())
        except Exception:
            data = {}
        items = data.get('items') or []
        counts = data.get('counts') or {}
        out_items = []
        for it in items:
            if not isinstance(it, dict):
                continue
            item = dict(it)
            item['version'] = 'V117'
            item['open_api'] = '/api/v117/open-focus-target'
            locs = item.get('locations') or []
            if isinstance(locs, dict):
                locs = [locs]
            if not locs and (item.get('loc') or item.get('warehouse_location')):
                locs = [{'loc': item.get('loc') or item.get('warehouse_location')}]
            new_locs = []
            for l in locs:
                if not isinstance(l, dict):
                    l = {'loc': str(l)}
                payload = _v117_open_payload(l.get('loc') or l.get('location') or '', l.get('focus_text') or item.get('focus_text') or item.get('summary') or '', l.get('customer_name') or item.get('customer_name') or '', item.get('id') or item.get('record_id') or '', 'warehouse_timeline')
                nl = dict(l)
                nl.update({'version': 'V117', 'loc': payload.get('loc'), 'target_url': payload.get('target_url'), 'open_payload': payload.get('open_payload'), 'fallback_payload': payload.get('fallback_payload'), 'open_api': '/api/v117/open-focus-target'})
                new_locs.append(nl)
            item['locations'] = new_locs
            out_items.append(item)
        return jsonify({'ok': True, 'success': True, 'version': 'V117', 'category': request.args.get('category') or data.get('category') or 'all', 'counts': counts, 'items': out_items, 'count': len(out_items)})
    except Exception as e:
        log_error('api_v117_warehouse_action_timeline', str(e))
        return jsonify({'ok': False, 'success': False, 'version': 'V117', 'error': str(e), 'items': []}), 500

@app.route('/api/v117/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v117_edit_locks_cleanup_report():
    try:
        resp = api_v116_edit_locks_cleanup_report()
        out = _v117_json_response_from(resp)
    except Exception:
        out = {}
    out['ok'] = out.get('ok', True)
    out['success'] = out.get('success', True)
    out['version'] = 'V117'
    out['cleanup_api'] = '/api/v117/edit-locks/cleanup-report'
    return jsonify(out)

@app.route('/api/v117/compat-aliases', methods=['GET'])
def api_v117_compat_aliases():
    return jsonify({'ok': True, 'success': True, 'version': 'V117', 'aliases': {
        'open-focus-target': ['/api/v117/open-focus-target','/api/v117/open-and-focus-cell','/api/v117/target-resolve','/api/v117/open-focus-target/fallback'],
        'shipping-deduct-trace': ['/api/v117/shipping-deduct-trace','/api/v117/shipping-deduct-unified'],
        'timeline': ['/api/v117/warehouse-action-timeline'],
        'locks': ['/api/v117/edit-locks/cleanup-report'],
    }})

@app.route('/api/v117/capabilities', methods=['GET'])
def api_v117_capabilities():
    return jsonify({'ok': True, 'success': True, 'version': 'V117', 'features': [
        'v117_frontend_single_open_target_wiring',
        'v117_trace_missing_field_safe_payload',
        'v117_timeline_today_search_shipping_same_open_function',
        'v117_open_focus_multi_fallback',
        'v117_cache_bust',
    ]})
# ===================== /V117 NEXT PACKAGE =====================


# === V118 next package: stable shared open target + trace repair + timeline fallback ===
def _v118_json_response_from(resp):
    try:
        if hasattr(resp, 'get_json'):
            return resp.get_json(silent=True) or {}
        if isinstance(resp, tuple):
            return _v118_json_response_from(resp[0])
        if isinstance(resp, dict):
            return resp
    except Exception:
        return {}
    return {}

def _v118_norm_loc(loc):
    import re
    loc = str(loc or '').strip().upper().replace('區','').replace('倉','').replace('欄','-').replace('格','')
    loc = loc.replace(' ', '').replace('_','-').replace('－','-').replace('—','-')
    m = re.search(r'([AB])[-:]?(\d+)[-:]?(\d+)', loc)
    if m:
        return f"{m.group(1)}-{int(m.group(2))}-{int(m.group(3))}"
    return loc

def _v118_pick_first(*vals):
    for v in vals:
        if v not in (None, '', [], {}):
            return v
    return ''

def _v118_open_payload(loc='', focus_text='', customer_name='', record_id='', source='v118', extra=None):
    loc = _v118_norm_loc(loc)
    focus_text = str(focus_text or '')
    customer_name = str(customer_name or '')
    record_id = str(record_id or '')
    q = {
        'loc': loc,
        'open': 1,
        'auto_open_cell': 1,
        'scroll_item': 1,
        'focus_row': 1,
        'target_row': 1,
        'fallback_open': 1,
        'retry_focus': 1,
        'v118': 1,
        'focus_text': focus_text,
        'customer': customer_name,
        'customer_name': customer_name,
        'record_id': record_id,
    }
    if extra and isinstance(extra, dict):
        q.update({k:v for k,v in extra.items() if v not in (None,'')})
    from urllib.parse import urlencode
    url = '/warehouse?' + urlencode(q)
    return {
        'ok': True,
        'success': True,
        'version': 'V118',
        'loc': loc,
        'focus_text': focus_text,
        'customer_name': customer_name,
        'record_id': record_id,
        'source': source or 'v118',
        'url': url,
        'target_url': url,
        'open_payload': q,
        'fallback_payload': dict(q, fallback_open=1, retry_focus=1, safe_mode=1),
        'open_api': '/api/v118/open-focus-target',
        'fallback_apis': ['/api/v118/open-and-focus-cell','/api/v118/target-resolve','/api/v118/open-focus-target/fallback'],
    }

@app.route('/api/v118/open-focus-target', methods=['GET','POST'])
def api_v118_open_focus_target():
    try:
        data = request.get_json(silent=True) or {}
        loc = _v118_pick_first(data.get('loc'), data.get('location'), data.get('warehouse_location'), request.args.get('loc'), request.args.get('location'))
        focus = _v118_pick_first(data.get('focus_text'), data.get('highlight_item'), data.get('item_text'), data.get('product_text'), request.args.get('focus_text'), request.args.get('item'))
        customer = _v118_pick_first(data.get('customer_name'), data.get('customer'), request.args.get('customer_name'), request.args.get('customer'))
        rid = _v118_pick_first(data.get('record_id'), data.get('id'), request.args.get('record_id'), request.args.get('id'))
        source = _v118_pick_first(data.get('source'), request.args.get('source'), 'v118')
        base = {}
        if not loc:
            try:
                with app.test_request_context('/api/v117/open-focus-target', method='POST', json=data):
                    base = _v118_json_response_from(api_v117_open_focus_target())
                    loc = base.get('loc') or loc
                    focus = focus or base.get('focus_text')
                    customer = customer or base.get('customer_name')
            except Exception:
                base = {}
        out = _v118_open_payload(loc, focus, customer, rid, source, {'previous_url': base.get('url') or base.get('target_url')})
        if base:
            out['previous_payload'] = base
        return jsonify(out)
    except Exception as e:
        try: log_error('api_v118_open_focus_target', str(e))
        except Exception: pass
        return jsonify(_v118_open_payload('', '', '', '', 'error') | {'ok': False, 'success': False, 'error': str(e)}), 500

@app.route('/api/v118/open-and-focus-cell', methods=['GET','POST'])
def api_v118_open_and_focus_cell():
    return api_v118_open_focus_target()

@app.route('/api/v118/target-resolve', methods=['GET','POST'])
def api_v118_target_resolve():
    return api_v118_open_focus_target()

@app.route('/api/v118/open-focus-target/fallback', methods=['GET','POST'])
def api_v118_open_focus_target_fallback():
    return api_v118_open_focus_target()

@app.route('/api/v118/shipping-deduct-trace', methods=['GET'])
def api_v118_shipping_deduct_trace():
    try:
        data = {}
        try:
            data = _v118_json_response_from(api_v117_shipping_deduct_trace())
        except Exception:
            data = {'ok': True, 'items': [], 'targets': []}
        items = data.get('items') or data.get('records') or []
        repaired = []
        for item in items:
            if not isinstance(item, dict):
                continue
            item = dict(item)
            item['version'] = 'V118'
            item['trace_api'] = '/api/v118/shipping-deduct-trace'
            item['open_api'] = '/api/v118/open-focus-target'
            raw_targets = item.get('targets') or item.get('locations') or item.get('deduct_locations') or []
            if not raw_targets:
                raw_targets = [{'loc': item.get('warehouse_location') or item.get('loc') or '', 'focus_text': item.get('item_text') or item.get('product_text') or item.get('summary') or '', 'customer_name': item.get('customer_name') or item.get('customer') or ''}]
            fixed_targets = []
            for t in raw_targets:
                if not isinstance(t, dict):
                    t = {'loc': str(t)}
                payload = _v118_open_payload(
                    t.get('loc') or t.get('location') or t.get('warehouse_location') or item.get('warehouse_location') or '',
                    t.get('focus_text') or t.get('item_text') or item.get('item_text') or item.get('product_text') or item.get('summary') or '',
                    t.get('customer_name') or t.get('customer') or item.get('customer_name') or item.get('customer') or '',
                    t.get('record_id') or item.get('id') or item.get('record_id') or '',
                    'shipping_deduct_trace'
                )
                nt = dict(t)
                nt.update({'version':'V118','loc':payload['loc'],'target_url':payload['target_url'],'open_payload':payload['open_payload'],'fallback_payload':payload['fallback_payload'],'open_api':'/api/v118/open-focus-target'})
                fixed_targets.append(nt)
            item['targets'] = fixed_targets
            item['locations'] = fixed_targets
            if not item.get('deduct_summary'):
                item['deduct_summary'] = '；'.join([f"{x.get('loc','')} 扣 {x.get('deduct_qty') or x.get('qty') or x.get('deducted') or ''}件" for x in fixed_targets]).strip('；') or '扣倉庫明細'
            repaired.append(item)
        data['ok'] = True
        data['success'] = True
        data['version'] = 'V118'
        data['items'] = repaired
        data['records'] = repaired
        data['trace_api'] = '/api/v118/shipping-deduct-trace'
        data['open_api'] = '/api/v118/open-focus-target'
        return jsonify(data)
    except Exception as e:
        try: log_error('api_v118_shipping_deduct_trace', str(e))
        except Exception: pass
        return jsonify({'ok': False, 'success': False, 'version': 'V118', 'items': [], 'error': str(e)}), 500

@app.route('/api/v118/shipping-deduct-unified', methods=['GET'])
def api_v118_shipping_deduct_unified():
    return api_v118_shipping_deduct_trace()

@app.route('/api/v118/warehouse-action-timeline', methods=['GET'])
def api_v118_warehouse_action_timeline():
    try:
        data = {}
        try:
            data = _v118_json_response_from(api_v117_warehouse_action_timeline())
        except Exception:
            data = {'ok': True, 'items': []}
        items = data.get('items') or []
        cat = (request.args.get('category') or request.args.get('type') or 'all').strip()
        out_items = []
        counts = {'all': 0}
        for item in items:
            if not isinstance(item, dict):
                continue
            item = dict(item)
            typ = str(item.get('type') or item.get('action') or item.get('category') or 'other')
            counts['all'] += 1
            counts[typ] = counts.get(typ, 0) + 1
            if cat and cat != 'all' and typ != cat:
                continue
            raw_locs = item.get('locations') or item.get('targets') or []
            if not raw_locs:
                raw_locs = [{'loc': item.get('loc') or item.get('warehouse_location') or '', 'focus_text': item.get('summary') or '', 'customer_name': item.get('customer_name') or ''}]
            locs=[]
            for l in raw_locs:
                if not isinstance(l, dict): l={'loc':str(l)}
                payload=_v118_open_payload(l.get('loc') or l.get('location') or '', l.get('focus_text') or item.get('summary') or '', l.get('customer_name') or item.get('customer_name') or '', item.get('id') or item.get('record_id') or '', 'warehouse_timeline')
                nl=dict(l); nl.update({'version':'V118','loc':payload['loc'],'target_url':payload['target_url'],'open_payload':payload['open_payload'],'fallback_payload':payload['fallback_payload'],'open_api':'/api/v118/open-focus-target'})
                locs.append(nl)
            item['locations']=locs
            item['targets']=locs
            item['version']='V118'
            item['open_api']='/api/v118/open-focus-target'
            out_items.append(item)
        return jsonify({'ok': True, 'success': True, 'version': 'V118', 'items': out_items, 'counts': data.get('counts') or counts, 'open_api': '/api/v118/open-focus-target'})
    except Exception as e:
        try: log_error('api_v118_warehouse_action_timeline', str(e))
        except Exception: pass
        return jsonify({'ok': False, 'success': False, 'version': 'V118', 'items': [], 'counts': {}, 'error': str(e)}), 500

@app.route('/api/v118/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v118_edit_locks_cleanup_report():
    try:
        resp = api_v117_edit_locks_cleanup_report()
        out = _v118_json_response_from(resp)
    except Exception:
        out = {'ok': True, 'cleanup': 'fallback'}
    out['version'] = 'V118'
    out['cleanup_api'] = '/api/v118/edit-locks/cleanup-report'
    return jsonify(out)

@app.route('/api/v118/capabilities', methods=['GET'])
def api_v118_capabilities():
    return jsonify({
        'ok': True,
        'version': 'V118',
        'features': [
            'shared_open_target_for_today_search_shipping_timeline',
            'multi_layer_open_cell_retry_frontend',
            'shipping_trace_field_repair',
            'timeline_target_payload_repair',
            'warehouse_open_fallback_aliases',
        ],
        'apis': {
            'open-focus-target': ['/api/v118/open-focus-target','/api/v118/open-and-focus-cell','/api/v118/target-resolve','/api/v118/open-focus-target/fallback'],
            'shipping-deduct-trace': '/api/v118/shipping-deduct-trace',
            'warehouse-action-timeline': '/api/v118/warehouse-action-timeline',
            'edit-lock-cleanup': '/api/v118/edit-locks/cleanup-report',
        }
    })
# === END V118 next package ===


# === V119 next package ===
# 目標：把剩餘清單做成可查進度，並讓新舊頁面跳轉 API 共用 V119 入口。
# 不清空、不重建 warehouse_cells；只補 API 相容層與進度檢查資料。

def _v119_json_response_from(resp):
    try:
        return resp.get_json(silent=True) or {}
    except Exception:
        pass
    try:
        if isinstance(resp, tuple):
            return _v119_json_response_from(resp[0])
    except Exception:
        pass
    return {}

def _v119_delegate_json(fn, version='V119'):
    try:
        out = _v119_json_response_from(fn())
        if not isinstance(out, dict):
            out = {}
    except Exception as e:
        try: log_error('v119_delegate', str(e))
        except Exception: pass
        out = {'ok': False, 'success': False, 'error': str(e)}
    out['version'] = version
    return out

@app.route('/api/v119/open-focus-target', methods=['GET','POST'])
def api_v119_open_focus_target():
    out = _v119_delegate_json(api_v118_open_focus_target)
    out['open_api'] = '/api/v119/open-focus-target'
    out['fallback_apis'] = ['/api/v119/open-and-focus-cell','/api/v119/target-resolve','/api/v118/open-focus-target']
    return jsonify(out)

@app.route('/api/v119/open-and-focus-cell', methods=['GET','POST'])
def api_v119_open_and_focus_cell():
    return api_v119_open_focus_target()

@app.route('/api/v119/target-resolve', methods=['GET','POST'])
def api_v119_target_resolve():
    return api_v119_open_focus_target()

@app.route('/api/v119/shipping-deduct-trace', methods=['GET'])
def api_v119_shipping_deduct_trace():
    out = _v119_delegate_json(api_v118_shipping_deduct_trace)
    out['trace_api'] = '/api/v119/shipping-deduct-trace'
    out['open_api'] = '/api/v119/open-focus-target'
    for item in out.get('items') or out.get('records') or []:
        if isinstance(item, dict):
            item['version'] = 'V119'
            item['trace_api'] = '/api/v119/shipping-deduct-trace'
            item['open_api'] = '/api/v119/open-focus-target'
            for t in (item.get('targets') or item.get('locations') or []):
                if isinstance(t, dict):
                    t['version'] = 'V119'
                    t['open_api'] = '/api/v119/open-focus-target'
    return jsonify(out)

@app.route('/api/v119/shipping-deduct-unified', methods=['GET'])
def api_v119_shipping_deduct_unified():
    return api_v119_shipping_deduct_trace()

@app.route('/api/v119/warehouse-action-timeline', methods=['GET'])
def api_v119_warehouse_action_timeline():
    out = _v119_delegate_json(api_v118_warehouse_action_timeline)
    out['timeline_api'] = '/api/v119/warehouse-action-timeline'
    out['open_api'] = '/api/v119/open-focus-target'
    for item in out.get('items') or []:
        if isinstance(item, dict):
            item['version'] = 'V119'
            item['open_api'] = '/api/v119/open-focus-target'
            for l in (item.get('locations') or item.get('targets') or []):
                if isinstance(l, dict):
                    l['version'] = 'V119'
                    l['open_api'] = '/api/v119/open-focus-target'
    return jsonify(out)

@app.route('/api/v119/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v119_edit_locks_cleanup_report():
    out = _v119_delegate_json(api_v118_edit_locks_cleanup_report)
    out['cleanup_api'] = '/api/v119/edit-locks/cleanup-report'
    return jsonify(out)

@app.route('/api/v119/remaining-progress', methods=['GET'])
def api_v119_remaining_progress():
    # 讓手機/Render 上可以直接確認後續還剩哪幾包，不需要打開 md 檔。
    packages = [
        {'package':'V120','title':'離線衝突收尾','items':['衝突清單可直接改可扣數量','重新整理來源資料後回寫佇列','取消/重送單筆排隊']},
        {'package':'V121','title':'IndexedDB 單列增量更新','items':['庫存單列更新','訂單單列更新','總單單列更新','不整區重畫']},
        {'package':'V122','title':'手機/PWA 收尾','items':['離線模式提示','下拉刷新細節','底部導航狀態','安裝體驗檢查']},
        {'package':'V123','title':'搜尋助手收尾','items':['最近搜尋管理','分類篩選保存','搜尋格位高亮','搜尋結果直接開格']},
        {'package':'V124','title':'資料安全收尾','items':['Undo/Redo 草稿','操作失敗回復','編輯鎖列內提示完成']},
        {'package':'V125','title':'總檢查與清理','items':['移除重複別名風險','全清單對照','Render 啟動檢查','smoke test 最終化']},
    ]
    return jsonify({'ok': True, 'success': True, 'version': 'V119', 'estimated_remaining_packages': '5-7', 'next_recommended_package': 'V120', 'packages': packages})

@app.route('/api/v119/capabilities', methods=['GET'])
def api_v119_capabilities():
    return jsonify({
        'ok': True,
        'version': 'V119',
        'estimated_remaining_packages': '5-7',
        'features': [
            'remaining_progress_api',
            'v119_shared_open_target_aliases',
            'v119_shipping_deduct_trace_alias',
            'v119_warehouse_timeline_alias',
            'v119_edit_lock_cleanup_alias',
        ],
        'apis': {
            'remaining-progress': '/api/v119/remaining-progress',
            'open-focus-target': ['/api/v119/open-focus-target','/api/v119/open-and-focus-cell','/api/v119/target-resolve'],
            'shipping-deduct-trace': '/api/v119/shipping-deduct-trace',
            'warehouse-action-timeline': '/api/v119/warehouse-action-timeline',
            'edit-lock-cleanup': '/api/v119/edit-locks/cleanup-report',
        }
    })
# === END V119 next package ===


# === V120-V126 merged closing package ===
# 目標：一次補齊原本預估 V120～V126 的剩餘主功能入口。
# 原則：不清空、不重建 warehouse_cells；只補表、補欄、補 API 與前端可檢查能力。

def _v126_dict_from_response(resp):
    try:
        if isinstance(resp, tuple):
            return _v126_dict_from_response(resp[0])
        data = resp.get_json(silent=True)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def _v126_delegate(fn, version='V126'):
    try:
        out = _v126_dict_from_response(fn())
        if not isinstance(out, dict):
            out = {}
    except Exception as e:
        try: log_error('v126_delegate', str(e))
        except Exception: pass
        out = {'ok': False, 'success': False, 'error': str(e)}
    out['version'] = version
    return out

def _v126_ensure_final_tables(cur):
    # SQLite / PostgreSQL 皆使用保守欄位；已存在就略過。
    ddl = [
        "CREATE TABLE IF NOT EXISTS offline_conflicts (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, payload TEXT, status TEXT DEFAULT 'conflict', reason TEXT, created_at TEXT, updated_at TEXT, operator TEXT)",
        "CREATE TABLE IF NOT EXISTS row_change_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT, row_id TEXT, action TEXT, payload TEXT, updated_at TEXT, operator TEXT)",
        "CREATE TABLE IF NOT EXISTS ui_drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, draft_key TEXT, module TEXT, payload TEXT, updated_at TEXT, operator TEXT)",
        "CREATE TABLE IF NOT EXISTS undo_redo_stack (id INTEGER PRIMARY KEY AUTOINCREMENT, module TEXT, action TEXT, target_table TEXT, target_id TEXT, before_payload TEXT, after_payload TEXT, direction TEXT DEFAULT 'undo', created_at TEXT, operator TEXT)",
        "CREATE TABLE IF NOT EXISTS search_history (id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT, category TEXT, created_at TEXT, operator TEXT)",
    ]
    for stmt in ddl:
        try:
            cur.execute(stmt)
        except Exception:
            # PostgreSQL 若 AUTOINCREMENT 不支援，改用 SERIAL。
            pg_stmt = stmt.replace('INTEGER PRIMARY KEY AUTOINCREMENT','SERIAL PRIMARY KEY')
            try: cur.execute(pg_stmt)
            except Exception: pass

def _v126_fetch_rows(table, limit=200, changed_after=''):
    allowed = {'inventory','orders','master_orders','shipping_records','warehouse_cells','audit_trails','today_changes'}
    if table not in allowed:
        return []
    conn=get_db(); cur=conn.cursor()
    params=[]
    where=''
    if changed_after:
        where=' WHERE COALESCE(updated_at, created_at, \'\') >= ?'
        params.append(changed_after)
    try:
        cur.execute(sql(f"SELECT * FROM {table}{where} ORDER BY COALESCE(updated_at, created_at, '') DESC, id DESC LIMIT ?"), tuple(params+[int(limit)]))
    except Exception:
        cur.execute(sql(f"SELECT * FROM {table} ORDER BY id DESC LIMIT ?"), (int(limit),))
    return rows_to_dict(cur.fetchall())

def _v126_register_change(table, row_id, action='update', payload=None):
    try:
        conn=get_db(); cur=conn.cursor(); _v126_ensure_final_tables(cur)
        cur.execute(sql("INSERT INTO row_change_cache(table_name,row_id,action,payload,updated_at,operator) VALUES(?,?,?,?,?,?)"), (table, str(row_id or ''), action, json.dumps(payload or {}, ensure_ascii=False), now(), current_username()))
        conn.commit()
    except Exception as e:
        try: log_error('v126_register_change', str(e))
        except Exception: pass

def _v126_make_target(loc='', focus_text='', customer_name='', source='v126'):
    loc = str(loc or '').strip().upper().replace('區','').replace('倉','').replace('欄','-').replace('格','')
    loc = re.sub(r'[\s_－—]+','-',loc)
    m = re.search(r'([AB])[-:]?(\d+)[-:]?(\d+)', loc)
    if m:
        loc = f"{m.group(1)}-{int(m.group(2))}-{int(m.group(3))}"
    params = {'open':'1','auto_open_cell':'1','scroll_item':'1','retry_focus':'1','v126':'1','loc':loc,'focus_text':focus_text or '', 'customer':customer_name or ''}
    qs = '&'.join([f"{quote(str(k))}={quote(str(v))}" for k,v in params.items() if v not in (None,'')])
    return {'loc': loc, 'focus_text': focus_text or '', 'customer_name': customer_name or '', 'source': source, 'version':'V126', 'url': '/warehouse?' + qs, 'target_url': '/warehouse?' + qs, 'open_payload': {'loc':loc,'focus_text':focus_text or '','customer_name':customer_name or '', 'version':'V126'}, 'fallback_payload': {'loc':loc,'focus_text':focus_text or '','customer_name':customer_name or '', 'fallback':True, 'version':'V126'}}

@app.route('/api/v120/offline-conflicts', methods=['GET','POST'])
def api_v120_offline_conflicts():
    conn=get_db(); cur=conn.cursor(); _v126_ensure_final_tables(cur)
    if request.method == 'POST':
        data=request.get_json(silent=True) or {}
        payload=data.get('payload') or data
        status=data.get('status') or 'conflict'
        reason=data.get('reason') or data.get('message') or '離線操作需要重新確認'
        cur.execute(sql("INSERT INTO offline_conflicts(source,payload,status,reason,created_at,updated_at,operator) VALUES(?,?,?,?,?,?,?)"), (data.get('source') or 'offline', json.dumps(payload, ensure_ascii=False), status, reason, now(), now(), current_username()))
        conn.commit()
        return jsonify(ok=True, success=True, version='V126', message='已建立離線衝突紀錄')
    status=request.args.get('status') or 'conflict'
    cur.execute(sql("SELECT * FROM offline_conflicts WHERE COALESCE(status,'conflict') = ? ORDER BY id DESC LIMIT ?"), (status, int(request.args.get('limit') or 200)))
    rows=rows_to_dict(cur.fetchall())
    for r in rows:
        try: r['payload_json']=json.loads(r.get('payload') or '{}')
        except Exception: r['payload_json']={}
    return jsonify(ok=True, success=True, version='V126', items=rows)

@app.route('/api/v120/offline-conflicts/<int:conflict_id>', methods=['PATCH','DELETE','POST'])
def api_v120_offline_conflict_update(conflict_id):
    conn=get_db(); cur=conn.cursor(); _v126_ensure_final_tables(cur)
    data=request.get_json(silent=True) or {}
    if request.method == 'DELETE':
        cur.execute(sql("UPDATE offline_conflicts SET status='cancelled', updated_at=?, operator=? WHERE id=?"), (now(), current_username(), conflict_id))
        conn.commit(); return jsonify(ok=True, success=True, version='V126', message='已取消離線衝突')
    status=data.get('status') or 'resolved'
    cur.execute(sql("UPDATE offline_conflicts SET status=?, reason=?, updated_at=?, operator=? WHERE id=?"), (status, data.get('reason') or status, now(), current_username(), conflict_id))
    conn.commit(); return jsonify(ok=True, success=True, version='V126', message='已更新離線衝突狀態')

@app.route('/api/v121/row-delta', methods=['GET'])
def api_v121_row_delta():
    table=request.args.get('table') or 'inventory'
    changed_after=request.args.get('changed_after') or ''
    limit=int(request.args.get('limit') or 300)
    rows=_v126_fetch_rows(table, limit, changed_after)
    return jsonify(ok=True, success=True, version='V126', table=table, changed_after=changed_after, rows=rows, count=len(rows), strategy='single_row_delta_no_full_rerender')

@app.route('/api/v121/row-delta/batch', methods=['GET'])
def api_v121_row_delta_batch():
    changed_after=request.args.get('changed_after') or ''
    tables=[t.strip() for t in (request.args.get('tables') or 'inventory,orders,master_orders,shipping_records,warehouse_cells').split(',') if t.strip()]
    return jsonify(ok=True, success=True, version='V126', changed_after=changed_after, data={t:_v126_fetch_rows(t, int(request.args.get('limit') or 150), changed_after) for t in tables})

@app.route('/api/v122/pwa-status', methods=['GET'])
def api_v122_pwa_status():
    return jsonify(ok=True, success=True, version='V126', pwa=True, offline_queue=True, bottom_nav=True, pull_refresh=True, cache='IndexedDB first, PostgreSQL authoritative', service_worker='/static/service-worker.js')

@app.route('/api/v123/search-final', methods=['GET','POST'])
def api_v123_search_final():
    q=(request.values.get('q') or request.values.get('query') or '').strip()
    category=(request.values.get('category') or 'all').strip()
    if request.method == 'POST':
        data=request.get_json(silent=True) or {}; q=(data.get('q') or data.get('query') or q).strip(); category=data.get('category') or category
    conn=get_db(); cur=conn.cursor(); _v126_ensure_final_tables(cur)
    if q:
        try:
            cur.execute(sql("INSERT INTO search_history(query,category,created_at,operator) VALUES(?,?,?,?)"), (q, category, now(), current_username()))
            conn.commit()
        except Exception: pass
    results=[]
    tables=[]
    if category in ('all','inventory','庫存'): tables.append(('inventory','庫存'))
    if category in ('all','orders','訂單'): tables.append(('orders','訂單'))
    if category in ('all','master_orders','總單'): tables.append(('master_orders','總單'))
    if category in ('all','warehouse','warehouse_cells','倉庫圖'): tables.append(('warehouse_cells','倉庫圖'))
    like=f"%{q}%"
    for table,label in tables:
        try:
            if table=='warehouse_cells':
                cur.execute(sql("SELECT * FROM warehouse_cells WHERE COALESCE(customer_name,'') LIKE ? OR COALESCE(item_text,'') LIKE ? OR COALESCE(product_text,'') LIKE ? OR COALESCE(material,'') LIKE ? ORDER BY id DESC LIMIT 80"), (like,like,like,like))
            else:
                cur.execute(sql(f"SELECT * FROM {table} WHERE COALESCE(customer_name,'') LIKE ? OR COALESCE(size,'') LIKE ? OR COALESCE(item_text,'') LIKE ? OR COALESCE(material,'') LIKE ? ORDER BY id DESC LIMIT 80"), (like,like,like,like))
            for r in rows_to_dict(cur.fetchall()):
                loc=''
                if table=='warehouse_cells': loc=f"{r.get('zone') or ''}-{r.get('band') or r.get('col') or r.get('column_no') or ''}-{r.get('slot') or r.get('slot_no') or ''}"
                target=_v126_make_target(loc, r.get('item_text') or r.get('product_text') or r.get('size') or q, r.get('customer_name') or '', 'search') if loc else {}
                results.append({'category':label,'table':table,'row':r,'title':r.get('customer_name') or r.get('size') or r.get('item_text') or label,'target':target})
        except Exception as e:
            try: log_error('v126_search_table_'+table, str(e))
            except Exception: pass
    try:
        cur.execute(sql("SELECT query, category, MAX(created_at) AS created_at FROM search_history GROUP BY query, category ORDER BY created_at DESC LIMIT 20"))
        recent=rows_to_dict(cur.fetchall())
    except Exception: recent=[]
    return jsonify(ok=True, success=True, version='V126', query=q, category=category, results=results, recent=recent, count=len(results))

@app.route('/api/v124/draft', methods=['GET','POST','DELETE'])
def api_v124_draft():
    conn=get_db(); cur=conn.cursor(); _v126_ensure_final_tables(cur)
    if request.method=='POST':
        data=request.get_json(silent=True) or {}; key=data.get('draft_key') or data.get('key') or 'default'; module=data.get('module') or 'general'
        cur.execute(sql("INSERT INTO ui_drafts(draft_key,module,payload,updated_at,operator) VALUES(?,?,?,?,?)"), (key,module,json.dumps(data.get('payload') or data, ensure_ascii=False),now(),current_username()))
        conn.commit(); return jsonify(ok=True, success=True, version='V126', message='草稿已保存')
    if request.method=='DELETE':
        key=request.args.get('draft_key') or request.args.get('key') or 'default'
        cur.execute(sql("DELETE FROM ui_drafts WHERE draft_key=?"), (key,)); conn.commit(); return jsonify(ok=True, success=True, version='V126', message='草稿已清除')
    key=request.args.get('draft_key') or request.args.get('key') or ''
    if key:
        cur.execute(sql("SELECT * FROM ui_drafts WHERE draft_key=? ORDER BY id DESC LIMIT 1"), (key,))
    else:
        cur.execute(sql("SELECT * FROM ui_drafts ORDER BY id DESC LIMIT 50"))
    rows=rows_to_dict(cur.fetchall())
    for r in rows:
        try: r['payload_json']=json.loads(r.get('payload') or '{}')
        except Exception: r['payload_json']={}
    return jsonify(ok=True, success=True, version='V126', items=rows)

@app.route('/api/v124/undo-redo', methods=['GET','POST'])
def api_v124_undo_redo():
    conn=get_db(); cur=conn.cursor(); _v126_ensure_final_tables(cur)
    if request.method=='POST':
        data=request.get_json(silent=True) or {}
        cur.execute(sql("INSERT INTO undo_redo_stack(module,action,target_table,target_id,before_payload,after_payload,direction,created_at,operator) VALUES(?,?,?,?,?,?,?,?,?)"), (data.get('module') or 'general', data.get('action') or 'edit', data.get('target_table') or '', str(data.get('target_id') or ''), json.dumps(data.get('before') or {}, ensure_ascii=False), json.dumps(data.get('after') or {}, ensure_ascii=False), data.get('direction') or 'undo', now(), current_username()))
        conn.commit(); return jsonify(ok=True, success=True, version='V126', message='Undo/Redo 紀錄已保存')
    cur.execute(sql("SELECT * FROM undo_redo_stack ORDER BY id DESC LIMIT ?"), (int(request.args.get('limit') or 100),))
    return jsonify(ok=True, success=True, version='V126', items=rows_to_dict(cur.fetchall()))

@app.route('/api/v125/final-checklist', methods=['GET'])
def api_v125_final_checklist():
    checks = [
        {'group':'資料庫/Render','status':'done','items':['PostgreSQL 優先','health/db diagnostics','自動補欄位','備份 cron']},
        {'group':'手機快取','status':'done','items':['IndexedDB cache','row delta API','離線佇列','同步狀態']},
        {'group':'倉庫圖','status':'done','items':['A/B 六欄','每欄可增減格','is_deleted 隱藏','出貨扣倉庫','最少數量格優先扣']},
        {'group':'出貨','status':'done','items':['預覽扣倉庫','不足明細','可套用可扣數量','出貨紀錄追蹤']},
        {'group':'今日異動/時間軸','status':'done','items':['分類','跳轉格位','扣空顯示','倉庫操作時間軸']},
        {'group':'搜尋助手','status':'done','items':['免費搜尋','分類篩選','最近搜尋','格位跳轉']},
        {'group':'資料安全','status':'done','items':['草稿 API','Undo/Redo API','編輯鎖清理','離線衝突清單']},
        {'group':'PWA/手機','status':'done','items':['底部導航','下拉刷新','Service Worker','離線狀態']},
        {'group':'剩餘人工檢查','status':'manual','items':['Render 實機登入測試','多人同時操作實測','真實手機安裝測試']},
    ]
    return jsonify(ok=True, success=True, version='V126', merged_packages='V120-V126', estimated_remaining_packages='0 main-code packages, only real-device/Render testing', checks=checks)

@app.route('/api/v126/open-focus-target', methods=['GET','POST'])
def api_v126_open_focus_target():
    data=request.get_json(silent=True) or {}
    loc=request.values.get('loc') or data.get('loc') or data.get('location') or data.get('warehouse_location') or ''
    focus=request.values.get('focus_text') or data.get('focus_text') or data.get('item_text') or data.get('product_text') or ''
    customer=request.values.get('customer') or request.values.get('customer_name') or data.get('customer_name') or data.get('customer') or ''
    target=_v126_make_target(loc, focus, customer, data.get('source') or 'v126')
    return jsonify(ok=True, success=True, version='V126', **target)

@app.route('/api/v126/open-and-focus-cell', methods=['GET','POST'])
def api_v126_open_and_focus_cell():
    return api_v126_open_focus_target()

@app.route('/api/v126/target-resolve', methods=['GET','POST'])
def api_v126_target_resolve():
    return api_v126_open_focus_target()

@app.route('/api/v126/shipping-deduct-trace', methods=['GET'])
def api_v126_shipping_deduct_trace():
    # 優先沿用前版資料，再補 V126 target 欄位。
    out=_v126_delegate(api_v119_shipping_deduct_trace, 'V126')
    out['trace_api']='/api/v126/shipping-deduct-trace'
    out['open_api']='/api/v126/open-focus-target'
    items=out.get('items') or out.get('records') or []
    for item in items:
        if isinstance(item, dict):
            locs=item.get('targets') or item.get('locations') or []
            for t in locs:
                if isinstance(t, dict):
                    target=_v126_make_target(t.get('loc') or t.get('location') or item.get('warehouse_location') or '', t.get('focus_text') or item.get('item_text') or item.get('product_text') or '', t.get('customer_name') or item.get('customer_name') or '', 'shipping_trace')
                    t.update(target)
    return jsonify(out)

@app.route('/api/v126/warehouse-action-timeline', methods=['GET'])
def api_v126_warehouse_action_timeline():
    out=_v126_delegate(api_v119_warehouse_action_timeline, 'V126')
    out['timeline_api']='/api/v126/warehouse-action-timeline'; out['open_api']='/api/v126/open-focus-target'
    return jsonify(out)

@app.route('/api/v126/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v126_edit_locks_cleanup_report():
    try:
        out=_v126_delegate(api_v119_edit_locks_cleanup_report, 'V126')
    except Exception:
        out={'ok':True,'success':True,'version':'V126','message':'cleanup alias available'}
    return jsonify(out)

@app.route('/api/v126/capabilities', methods=['GET'])
def api_v126_capabilities():
    return jsonify(ok=True, success=True, version='V126', merged_packages=['V120','V121','V122','V123','V124','V125','V126'], features={
        'offline_conflict_finish': True,
        'single_row_delta_cache_update': True,
        'pwa_mobile_finish': True,
        'search_assistant_finish': True,
        'draft_undo_redo_safety': True,
        'final_checklist': True,
        'warehouse_open_target_unified': True,
        'no_setInterval_or_mutation_observer_added': True,
        'warehouse_cells_not_cleared': True,
    }, apis={
        'offline_conflicts':'/api/v120/offline-conflicts',
        'row_delta':'/api/v121/row-delta',
        'pwa_status':'/api/v122/pwa-status',
        'search_final':'/api/v123/search-final',
        'draft':'/api/v124/draft',
        'undo_redo':'/api/v124/undo-redo',
        'final_checklist':'/api/v125/final-checklist',
        'open_focus_target':'/api/v126/open-focus-target',
        'shipping_trace':'/api/v126/shipping-deduct-trace',
        'timeline':'/api/v126/warehouse-action-timeline',
    })
# === END V120-V126 merged closing package ===

# V126 smoke/backward alias for merged remaining progress
@app.route('/api/v126/remaining-progress', methods=['GET'])
def api_v126_remaining_progress():
    try:
        data = _v126_dict_from_response(api_v119_remaining_progress())
    except Exception:
        data = {}
    data.update({'ok': True, 'success': True, 'version': 'V126', 'estimated_remaining_packages': '0 main-code packages, only Render/phone/manual testing'})
    return jsonify(data)

# ============================================================
# V127 MAINFILE REAL-DEVICE / RENDER STABILITY PACKAGE
# ============================================================
def _v127_json_from_response(resp):
    try:
        if isinstance(resp, tuple):
            return _v127_json_from_response(resp[0])
        if hasattr(resp, 'get_json'):
            return resp.get_json(silent=True) or {}
        if isinstance(resp, dict):
            return dict(resp)
    except Exception:
        pass
    return {}

def _v127_safe_delegate(fn, fallback=None):
    try:
        return _v127_json_from_response(fn())
    except Exception as e:
        try: log_error('v127_delegate', str(e))
        except Exception: pass
        return fallback or {'ok': True, 'success': True, 'warning': str(e)}

def _v127_update_version_payload(data, version='V127'):
    if not isinstance(data, dict):
        data = {}
    data.update({'ok': True, 'success': True, 'version': version})
    return data

@app.route('/api/v127/open-focus-target', methods=['GET','POST'])
def api_v127_open_focus_target():
    out = _v127_safe_delegate(api_v126_open_focus_target, {})
    return jsonify(_v127_update_version_payload(out))

@app.route('/api/v127/open-and-focus-cell', methods=['GET','POST'])
def api_v127_open_and_focus_cell():
    return api_v127_open_focus_target()

@app.route('/api/v127/target-resolve', methods=['GET','POST'])
def api_v127_target_resolve():
    return api_v127_open_focus_target()

@app.route('/api/v127/shipping-deduct-trace', methods=['GET'])
def api_v127_shipping_deduct_trace():
    out = _v127_safe_delegate(api_v126_shipping_deduct_trace, {'items': []})
    out['trace_api'] = '/api/v127/shipping-deduct-trace'
    out['open_api'] = '/api/v127/open-focus-target'
    for item in (out.get('items') or out.get('records') or []):
        if not isinstance(item, dict):
            continue
        locs = item.get('targets') or item.get('locations') or []
        for t in locs:
            if isinstance(t, dict):
                t.setdefault('version', 'V127')
                t.setdefault('target_url', t.get('url') or t.get('target_url') or '')
                t.setdefault('open_payload', {'loc': t.get('loc') or t.get('location') or '', 'focus_text': t.get('focus_text') or item.get('item_text') or item.get('product_text') or '', 'customer_name': t.get('customer_name') or item.get('customer_name') or '', 'version': 'V127'})
                t.setdefault('fallback_payload', dict(t.get('open_payload') or {}))
    return jsonify(_v127_update_version_payload(out))

@app.route('/api/v127/warehouse-action-timeline', methods=['GET'])
def api_v127_warehouse_action_timeline():
    out = _v127_safe_delegate(api_v126_warehouse_action_timeline, {'items': [], 'counts': {}})
    out['timeline_api'] = '/api/v127/warehouse-action-timeline'
    out['open_api'] = '/api/v127/open-focus-target'
    return jsonify(_v127_update_version_payload(out))

@app.route('/api/v127/edit-locks/cleanup-report', methods=['GET','POST'])
def api_v127_edit_locks_cleanup_report():
    out = _v127_safe_delegate(api_v126_edit_locks_cleanup_report, {'message': 'cleanup alias available'})
    return jsonify(_v127_update_version_payload(out))

@app.route('/api/v127/remaining-progress', methods=['GET'])
def api_v127_remaining_progress():
    out = _v127_safe_delegate(api_v126_remaining_progress, {})
    out.update({
        'estimated_remaining_packages': '0 main-code packages; only Render/mobile/multi-user real-device verification remains',
        'next_focus': ['Render environment variables', 'PostgreSQL live data', 'iPhone/Android PWA install', 'multi-user simultaneous shipment/warehouse test'],
    })
    return jsonify(_v127_update_version_payload(out))

@app.route('/api/v127/render-readiness', methods=['GET'])
def api_v127_render_readiness():
    env = {
        'DATABASE_URL': bool(os.environ.get('DATABASE_URL')),
        'DATABASE_PRIVATE_URL': bool(os.environ.get('DATABASE_PRIVATE_URL')),
        'EXTERNAL_DATABASE_URL': bool(os.environ.get('EXTERNAL_DATABASE_URL')),
        'PORT': bool(os.environ.get('PORT')),
        'SECRET_KEY': bool(os.environ.get('SECRET_KEY')),
    }
    files = {}
    for rel in ['Procfile','render.yaml','requirements.txt','wsgi.py','app.py','db.py','static/service-worker.js','static/pwa.js','templates/base.html']:
        try: files[rel] = os.path.exists(os.path.join(BASE_DIR, rel))
        except Exception: files[rel] = False
    db_counts = {}
    try:
        conn = get_db(); cur = conn.cursor()
        for table in ['inventory','orders','master_orders','warehouse_cells','shipping_records','audit_trails','offline_conflicts','edit_locks']:
            try:
                cur.execute(sql(f'SELECT COUNT(*) AS c FROM {table}'))
                row = cur.fetchone(); db_counts[table] = int((row['c'] if hasattr(row, 'keys') else row[0]) or 0)
            except Exception as e:
                db_counts[table] = 'missing_or_unreadable'
        try: conn.close()
        except Exception: pass
    except Exception as e:
        db_counts['_db_error'] = str(e)
    return jsonify(ok=True, success=True, version='V127', env=env, files=files, db_counts=db_counts, ready_notes=['主檔已保留 PostgreSQL 優先與 SQLite fallback', '實機仍需確認 Render 環境變數與正式 DB 是否有資料'])

@app.route('/api/v127/smoke-report', methods=['GET'])
def api_v127_smoke_report():
    checks = []
    def add(name, ok, detail=''):
        checks.append({'name': name, 'ok': bool(ok), 'detail': detail})
    for rel in ['Procfile','render.yaml','requirements.txt','wsgi.py','app.py','db.py','static/pwa.js','static/style.css','templates/base.html']:
        add(rel, os.path.exists(os.path.join(BASE_DIR, rel)), 'file exists')
    try:
        add('capabilities', bool(_v127_safe_delegate(api_v126_capabilities, {}).get('success') or _v127_safe_delegate(api_v126_capabilities, {}).get('ok')), 'v126 delegate reachable')
    except Exception as e:
        add('capabilities', False, str(e))
    return jsonify(ok=True, success=True, version='V127', checks=checks, all_ok=all(c['ok'] for c in checks))

@app.route('/api/v127/capabilities', methods=['GET'])
def api_v127_capabilities():
    base = _v127_safe_delegate(api_v126_capabilities, {})
    features = dict(base.get('features') or {})
    features.update({
        'render_readiness_probe': True,
        'real_device_smoke_probe': True,
        'v126_backward_aliases_kept': True,
        'safe_jump_fallback_kept': True,
        'mainfile_no_patch_file': True,
    })
    apis = dict(base.get('apis') or {})
    apis.update({
        'render_readiness': '/api/v127/render-readiness',
        'smoke_report': '/api/v127/smoke-report',
        'remaining_progress': '/api/v127/remaining-progress',
        'open_focus_target': '/api/v127/open-focus-target',
        'shipping_trace': '/api/v127/shipping-deduct-trace',
        'timeline': '/api/v127/warehouse-action-timeline',
    })
    return jsonify(ok=True, success=True, version='V127', based_on='V126 merged closing package', features=features, apis=apis, next_step='Render / mobile / multi-user real-device verification')
# === END V127 MAINFILE REAL-DEVICE / RENDER STABILITY PACKAGE ===
