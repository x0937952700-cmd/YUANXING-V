# service-line retained: mainfile behavior consolidated into formal services.

from flask import Flask, render_template, request, jsonify, session, redirect, url_for, Response, stream_with_context, send_file, send_from_directory
from datetime import timedelta, datetime
from functools import wraps
import os
from datetime import datetime, timedelta
import io
import time
import hashlib
import json
import re
import threading
import uuid
import gzip
from PIL import Image
from werkzeug.utils import secure_filename
from werkzeug.exceptions import HTTPException
from openpyxl import Workbook

from db import (
    init_db, get_user, create_user, update_password, log_action,
    save_inventory_item, list_inventory, save_order, save_master_order,
    ship_order, preview_ship_order, get_shipping_records, save_correction, log_error,
    save_image_hash, image_hash_exists, upsert_customer, get_customers,
    get_customer, warehouse_get_cells, warehouse_save_cell, warehouse_move_item, warehouse_add_column,
    warehouse_add_slot, warehouse_remove_slot, warehouse_set_cell_mark, warehouse_move_cell_contents, warehouse_get_column_cells, warehouse_batch_add_slots, warehouse_batch_remove_empty_slots,
    inventory_summary, warehouse_summary, list_backups, get_orders, get_master_orders,
    list_users, set_user_blocked, get_setting, set_setting, verify_password, row_to_dict, get_db, sql, rows_to_dict, fetchone_dict, now, USE_POSTGRES, database_mode_info, table_counts,
    register_submit_request, list_corrections_rows, delete_correction, save_customer_alias, list_customer_aliases, delete_customer_alias,
    record_recent_slot, get_recent_slots, add_audit_trail, list_audit_trails, get_customer_spec_stats, update_customer_item, update_items_material, delete_customer_item,
    create_todo_item, list_todo_items, get_todo_item, delete_todo_item, complete_todo_item, restore_todo_item, reorder_todo_items,
    delete_customer, sync_customer_name_in_warehouse, get_customer_relation_counts, get_customer_by_uid, restore_customer, effective_product_qty, product_display_size, product_support_text, product_sort_tuple, format_product_text_height2, clean_material_value, product_month_tag, recover_customer_profiles_from_relation_tables, customer_merge_variants
)
from ocr import parse_ocr_text, process_native_ocr_text, clean_ocr_noise
from backup import run_daily_backup, verify_backup_file

app = Flask(__name__)
APP_VERSION = 'V119-V453-SYNC-TODAY-SHIP-WAREHOUSE-FIX'
STATIC_VERSION = '119-v453_sync_today_ship_warehouse_fix'
API_SCHEMA_VERSION = 'v453-sync_today_ship_warehouse_fix'
# service-line retained: mainfile behavior consolidated into formal services.
# 若尚未設定，改用 DATABASE_URL 雜湊產生穩定 fallback，避免每次重啟都登出。
_SECRET_KEY = os.getenv("SECRET_KEY") or ("stable-" + hashlib.sha256((os.getenv("DATABASE_URL", "yuanxing-local") + "|yuanxing-fix53").encode("utf-8")).hexdigest())
app.secret_key = _SECRET_KEY
app.permanent_session_lifetime = timedelta(days=30)
# V130 marker: warehouse long-press/right-click actions use canonical DB coordinate sync.
try:
    import db as _yx_db_module
    app.config['YX_WAREHOUSE_LONGPRESS_DB_FIX'] = getattr(_yx_db_module, 'warehouse_longpress_db_fix_version', lambda: 'v130')()
except Exception:
    app.config['YX_WAREHOUSE_LONGPRESS_DB_FIX'] = 'v130'

UPLOAD_FOLDER = "uploads"
TODO_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'todo')
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "heic", "gif"}
MAX_UPLOAD_SIZE = 16 * 1024 * 1024
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(TODO_UPLOAD_FOLDER, exist_ok=True)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE

@app.context_processor
def yx_static_version_context():
    return {"static_version": STATIC_VERSION, "app_version": APP_VERSION}


def yx_api_align_payload(payload=None, *, success=None, cache_label=None, extra=None):
    """V379: keep API response fields aligned for orders/master/shipping/warehouse without touching frontend cache core."""
    out = dict(payload or {})
    if success is not None:
        out['success'] = bool(success)
    else:
        out.setdefault('success', True)
    out.setdefault('version', APP_VERSION)
    out.setdefault('app_version', APP_VERSION)
    out.setdefault('static_version', STATIC_VERSION)
    out.setdefault('sync_version', API_SCHEMA_VERSION)
    out.setdefault('cache_bust', API_SCHEMA_VERSION)
    out.setdefault('schema_version', API_SCHEMA_VERSION)
    if cache_label:
        out.setdefault('server_cache', cache_label)
        out.setdefault('cache_version', cache_label)
    if isinstance(extra, dict):
        out.update(extra)
    return out


# ============================================================
# V135 lightweight API cache: faster page opens without blocking DB scans.
# Writes clear related buckets so DB remains source of truth.
# ============================================================
_FAST_API_CACHE = {}
_FAST_API_LOCK = threading.Lock()

# V149: prewarm/load-shed guard. Prewarm must never compete with real user actions.
_PREWARM_GUARD = {
    'lock': threading.Lock(),
    'running': 0,
    'last_by_user_module': {},
    'slow': [],
    'max_running': int(os.getenv('YX_PREWARM_MAX_RUNNING', '1') or '1'),
    'min_gap_sec': float(os.getenv('YX_PREWARM_MIN_GAP_SEC', '18') or '18'),
}

def _v149_record_slow_page(name, elapsed_ms, detail=None):
    try:
        with _PREWARM_GUARD['lock']:
            rows = _PREWARM_GUARD.setdefault('slow', [])
            rows.append({'name': name, 'elapsed_ms': round(float(elapsed_ms or 0), 2), 'detail': detail or '', 'at': time.time()})
            del rows[:-80]
    except Exception:
        pass

def _v149_prewarm_begin(user, module):
    try:
        now_ts = time.time()
        key = f'{user}|{module}'
        with _PREWARM_GUARD['lock']:
            if _PREWARM_GUARD.get('running', 0) >= _PREWARM_GUARD.get('max_running', 1):
                return False, 'busy'
            last = float(_PREWARM_GUARD.get('last_by_user_module', {}).get(key) or 0)
            if now_ts - last < _PREWARM_GUARD.get('min_gap_sec', 18):
                return False, 'recent'
            _PREWARM_GUARD['running'] = int(_PREWARM_GUARD.get('running', 0)) + 1
            _PREWARM_GUARD.setdefault('last_by_user_module', {})[key] = now_ts
            return True, 'ok'
    except Exception:
        return True, 'guard_error'

def _v149_prewarm_end():
    try:
        with _PREWARM_GUARD['lock']:
            _PREWARM_GUARD['running'] = max(0, int(_PREWARM_GUARD.get('running', 0)) - 1)
    except Exception:
        pass

def _fast_cache_key(name, **parts):
    try:
        clean_parts = '|'.join(f'{k}={parts[k]}' for k in sorted(parts))
    except Exception:
        clean_parts = ''
    return f'{name}|{clean_parts}'

def _fast_cache_get(key, max_age=30.0):
    try:
        with _FAST_API_LOCK:
            row = _FAST_API_CACHE.get(key)
            if not row:
                return None
            if time.time() - float(row.get('at') or 0) > float(max_age or 0):
                _FAST_API_CACHE.pop(key, None)
                return None
            return json.loads(json.dumps(row.get('data'), ensure_ascii=False))
    except Exception:
        return None

def _fast_cache_set(key, data):
    try:
        with _FAST_API_LOCK:
            _FAST_API_CACHE[key] = {'at': time.time(), 'data': json.loads(json.dumps(data, ensure_ascii=False))}
            if len(_FAST_API_CACHE) > 900:
                oldest = sorted(_FAST_API_CACHE.items(), key=lambda kv: kv[1].get('at') or 0)[:180]
                for k, _v in oldest:
                    _FAST_API_CACHE.pop(k, None)
    except Exception:
        pass

def _fast_cache_clear(prefix=None):
    try:
        with _FAST_API_LOCK:
            if not prefix:
                _FAST_API_CACHE.clear(); return
            for k in list(_FAST_API_CACHE.keys()):
                if str(k).startswith(str(prefix)):
                    _FAST_API_CACHE.pop(k, None)
    except Exception:
        pass


def _v211_clear_cross_function_cache(customer_name=''):
    # V214 keeps this existing helper name for compatibility; it now also clears V214 keys.
    """Clear order/master/shipping/warehouse/today fast caches after product writes. Safe, no renderer or polling."""
    try:
        _clear_product_fast_cache()
        _fast_cache_clear('ship_customers|')
        _fast_cache_clear('ship_items|')
        _fast_cache_clear('warehouse_available|')
        _fast_cache_clear('warehouse_source_qty_map|')
        _fast_cache_clear('today_changes|')
        _fast_cache_clear('customers|')
        _fast_cache_clear('customer_items|')
    except Exception:
        pass
    try:
        set_setting('today_unplaced_cache_v211', ''); set_setting('today_unplaced_cache_v214', ''); set_setting('today_unplaced_cache_v212', '')
    except Exception:
        pass

def _clear_product_fast_cache():
    try:
        set_setting('today_unplaced_cache_' + API_SCHEMA_VERSION, '')
    except Exception:
        pass
    # V386: product/order/master/shipping writes can change warehouse dropdowns and
    # sometimes warehouse cell readbacks. Clear only the in-memory warehouse payload;
    # keep the existing fast cache architecture and do not add polling/renderers.
    try:
        if '_WAREHOUSE_API_CACHE' in globals():
            _WAREHOUSE_API_CACHE['payload'] = None
            _WAREHOUSE_API_CACHE['at'] = 0.0
    except Exception:
        pass
    _fast_cache_clear('inventory|')
    _fast_cache_clear('orders|')
    _fast_cache_clear('master_orders|')
    _fast_cache_clear('customers|')
    _fast_cache_clear('customer_items|')
    _fast_cache_clear('ship_customers|')
    _fast_cache_clear('ship_items|')
    _fast_cache_clear('warehouse_available|')
    _fast_cache_clear('warehouse_source_qty_map|')
    _fast_cache_clear('today_changes|')
    _fast_cache_clear('today_unplaced|')
    try:
        set_setting('today_unplaced_cache_v392', ''); set_setting('today_unplaced_cache_v391', ''); set_setting('today_unplaced_cache_v390', ''); set_setting('today_unplaced_cache_v389', ''); set_setting('today_unplaced_cache_v388', ''); set_setting('today_unplaced_cache_v387', ''); set_setting('today_unplaced_cache_v386', ''); set_setting('today_unplaced_cache_v385', ''); set_setting('today_unplaced_cache_v384', ''); set_setting('today_unplaced_cache_v383', ''); set_setting('today_unplaced_cache_v382', ''); set_setting('today_unplaced_cache_v381', ''); set_setting('today_unplaced_cache_v287', ''); set_setting('today_unplaced_cache_v282', ''); set_setting('today_unplaced_cache_v267', ''); set_setting('today_unplaced_cache_v262', ''); set_setting('today_unplaced_cache_v252', ''); set_setting('today_unplaced_cache_v207', ''); set_setting('today_unplaced_cache_v211', ''); set_setting('today_unplaced_cache_v214', ''); set_setting('today_unplaced_cache_v212', ''); set_setting('today_unplaced_cache_v208', ''); set_setting('today_unplaced_cache_v209', '')
        set_setting('today_unplaced_cache_v198', '')
        set_setting('today_unplaced_cache_v197', '')
        set_setting('today_unplaced_cache_v196', '')
        set_setting('today_unplaced_cache_v192', '')
        set_setting('today_unplaced_cache_v191', '')
    except Exception:
        pass
    try:
        _warehouse_cache_clear()
    except Exception:
        pass


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

# service-line retained: mainfile behavior consolidated into formal services.
# Render must see the HTTP port quickly; migrations run in releaseCommand and lazily before real pages/API.
STARTUP_DB_ERROR = ''
STARTUP_CHECKS = {'uploads': True, 'todo_uploads': True, 'backups': True, 'todos': True, 'deferred_db_init': True}
_RUNTIME_INIT_DONE = False
_RUNTIME_INIT_LOCK = threading.Lock()
_RUNTIME_INIT_LAST_TRY = 0.0
_RUNTIME_INIT_RETRY_SECONDS = 30

def ensure_runtime_initialized():
    global STARTUP_DB_ERROR, STARTUP_CHECKS, _RUNTIME_INIT_DONE, _RUNTIME_INIT_LAST_TRY
    if _RUNTIME_INIT_DONE:
        return True
    current = time.time()
    if STARTUP_DB_ERROR and (current - float(_RUNTIME_INIT_LAST_TRY or 0)) < _RUNTIME_INIT_RETRY_SECONDS:
        return False
    with _RUNTIME_INIT_LOCK:
        if _RUNTIME_INIT_DONE:
            return True
        current = time.time()
        if STARTUP_DB_ERROR and (current - float(_RUNTIME_INIT_LAST_TRY or 0)) < _RUNTIME_INIT_RETRY_SECONDS:
            return False
        _RUNTIME_INIT_LAST_TRY = current
        try:
            init_db()
            STARTUP_CHECKS = run_startup_self_check()
            STARTUP_CHECKS['deferred_db_init'] = False
            STARTUP_DB_ERROR = ''
            _RUNTIME_INIT_DONE = True
            return True
        except Exception as e:
            STARTUP_DB_ERROR = str(e)
            print('[119] deferred init_db failed but app kept alive:', STARTUP_DB_ERROR, flush=True)
            return False


_RUNTIME_INIT_STARTED = False

def kick_runtime_init_background():
    """Formal service helper retained for stable mainfile behavior."""
    global _RUNTIME_INIT_STARTED
    if _RUNTIME_INIT_DONE or _RUNTIME_INIT_STARTED:
        return
    with _RUNTIME_INIT_LOCK:
        if _RUNTIME_INIT_DONE or _RUNTIME_INIT_STARTED:
            return
        _RUNTIME_INIT_STARTED = True
    def _runner():
        global _RUNTIME_INIT_STARTED
        try:
            ensure_runtime_initialized()
        finally:
            # keep started=true after success/failure to avoid spawning a thread per page refresh
            pass
    try:
        threading.Thread(target=_runner, name='yx-runtime-init', daemon=True).start()
    except Exception as e:
        try:
            print('[119] background init start failed:', e, flush=True)
        except Exception:
            pass

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
            return dict(items=grouped_inventory(), exact_customer_items=product_service_exact_customer_rows('inventory', customer_name), snapshots=product_service_snapshots(), customers=get_customers())
        if endpoint == '/api/orders':
            return dict(items=get_orders(), exact_customer_items=product_service_exact_customer_rows('orders', customer_name), snapshots=product_service_snapshots(), customers=get_customers())
        if endpoint == '/api/master_orders':
            return dict(items=get_master_orders(), exact_customer_items=product_service_exact_customer_rows('master_orders', customer_name), snapshots=product_service_snapshots(), customers=get_customers())
        if endpoint == '/api/ship':
            return dict(snapshots=product_service_snapshots(), customers=get_customers())
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



def _yx416_source_key_from_table(table_name=''):
    table_name = (table_name or '').strip()
    if table_name == 'master_orders':
        return 'master_order'
    if table_name == 'orders':
        return 'orders'
    if table_name == 'inventory':
        return 'inventory'
    return table_name or ''


def _yx416_transfer_refresh_payload(source_table='', target_source='', customer_names=None, moved_rows=None, extra=None):
    """Unified transfer/move response: clear derived caches and return aligned snapshots.

    This is intentionally a small response helper only. It does not add renderers,
    polling, intervals, or mutate yx_cache/yx_core. It makes inventory->orders,
    inventory->master, orders->master, and direct transfers return the same
    snapshot contract so the existing single renderer can refresh without stale cache.
    """
    customers = []
    for n in (customer_names or []):
        n = (n or '').strip()
        if n and n not in customers:
            customers.append(n)
    source_key = _yx416_source_key_from_table(source_table)
    target_key = 'master_order' if target_source in ('master_orders', 'master_order', '總單') else ('orders' if target_source in ('orders', '訂單') else ('inventory' if target_source in ('inventory', '庫存') else (target_source or '')))
    affected_sources = []
    for src in (source_key, target_key):
        if src and src not in affected_sources:
            affected_sources.append(src)
    try:
        _clear_product_fast_cache()
        for n in customers:
            try:
                _v211_clear_cross_function_cache(n)
            except Exception:
                pass
    except Exception as e:
        try: log_error('yx416_transfer_cache_clear', str(e))
        except Exception: pass
    payload = {
        'success': True,
        'cache_bust': API_SCHEMA_VERSION,
        'sync_version': API_SCHEMA_VERSION,
        'source': source_key,
        'source_table': source_table,
        'target_source': target_key,
        'affected_sources': affected_sources,
        'affected_customer_names': customers,
        'customer_names': customers,
        'moved': moved_rows or [],
        'snapshots': product_service_snapshots(),
        'customers': get_customers(),
    }
    if customers:
        payload.update(build_customer_payload_snapshot(customers[0]))
    if isinstance(extra, dict):
        payload.update(extra)
    return payload


def customer_name_variants_safe(customer_name=''):
    """Return canonical customer name + aliases without letting old DBs break product views."""
    customer_name = (customer_name or '').strip()
    if not customer_name:
        return []
    variants = [customer_name]
    try:
        conn = get_db(); cur = conn.cursor()
        try:
            for v in (customer_merge_variants(cur, customer_name) or []):
                v = (v or '').strip()
                if v and v not in variants:
                    variants.append(v)
        finally:
            try: conn.close()
            except Exception: pass
    except Exception as e:
        try: log_error('customer_name_variants_safe_v196', str(e))
        except Exception: pass
    return variants

def product_service_exact_customer_rows(table_name, customer_name=''):
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
        variants = set(customer_name_variants_safe(customer_name) or [customer_name])
        rows = [r for r in rows if (r.get('customer_name') or '').strip() in variants]
    # V414: 訂單/總單讀回給前端時，只回傳仍有有效件數的列。
    # 出貨扣到 0 的列若仍留在資料表，不能再撐住客戶卡件數或下方明細。
    active = []
    for r in rows or []:
        try:
            q = int(effective_product_qty(r.get('product_text') or '', r.get('qty') or 0) or 0)
        except Exception:
            try:
                q = int(float(r.get('qty') or 0))
            except Exception:
                q = 0
        if q > 0:
            active.append(r)
    return active




def product_service_snapshots():
    """Latest table snapshots for immediate UI refresh after batch operations."""
    try:
        inventory_rows = grouped_inventory()
    except Exception as e:
        log_error('main_snapshot_inventory', str(e)); inventory_rows = []
    try:
        order_rows = get_orders()
    except Exception as e:
        log_error('main_snapshot_orders', str(e)); order_rows = []
    try:
        master_rows = get_master_orders()
    except Exception as e:
        log_error('main_snapshot_master', str(e)); master_rows = []
    try:
        customer_rows = get_customers()
    except Exception as e:
        log_error('main_snapshot_customers', str(e)); customer_rows = []
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


# ============================================================
# V153 network payload guard: gzip large JSON/text responses so
# slow mobile networks do not wait on oversized API payloads.
# No renderer, no polling, no service-worker API cache.
# ============================================================
def _v153_merge_vary(response, value):
    try:
        current = response.headers.get('Vary', '')
        parts = [p.strip() for p in current.split(',') if p.strip()]
        if value not in parts:
            parts.append(value)
        response.headers['Vary'] = ', '.join(parts)
    except Exception:
        response.headers['Vary'] = value

def _v153_maybe_gzip_response(response):
    try:
        if request.method == 'HEAD':
            return response
        if 'gzip' not in (request.headers.get('Accept-Encoding') or '').lower():
            return response
        if response.status_code < 200 or response.status_code >= 300:
            return response
        if response.direct_passthrough or response.headers.get('Content-Encoding'):
            return response
        if request.headers.get('Range'):
            return response
        mimetype = (response.mimetype or '').lower()
        compressible = (
            mimetype.startswith('text/') or
            mimetype in ('application/json', 'application/javascript', 'application/xml', 'image/svg+xml')
        )
        if not compressible:
            return response
        raw = response.get_data()
        if not raw or len(raw) < int(os.getenv('YX_GZIP_MIN_BYTES', '2048') or '2048'):
            return response
        gz = gzip.compress(raw, compresslevel=int(os.getenv('YX_GZIP_LEVEL', '5') or '5'))
        if len(gz) >= len(raw):
            return response
        response.set_data(gz)
        response.headers['Content-Encoding'] = 'gzip'
        response.headers['Content-Length'] = str(len(gz))
        response.headers['X-Yuanxing-Compressed'] = f'gzip; before={len(raw)}; after={len(gz)}'
        _v153_merge_vary(response, 'Accept-Encoding')
        return response
    except Exception:
        return response

@app.after_request
def add_cache_headers(response):
    # service-line retained: mainfile behavior consolidated into formal services.
    # 頁面資料直接向 DB/API 抓最新狀態，JS/CSS 依 ?v=119 控制更新，避免舊快取干擾。
    path = request.path or ''
    response.headers['Vary'] = 'Cookie'
    _v153_merge_vary(response, 'Accept-Encoding')
    response.headers['X-Yuanxing-Version'] = APP_VERSION
    response.headers['X-Yuanxing-Mainfile'] = '119-v411-mainfile-stable'
    if path == '/sw.js' or path.endswith('service-worker.js') or path.endswith('manifest.webmanifest'):
        response.headers['Cache-Control'] = 'no-store, no-cache, max-age=0, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return _v153_maybe_gzip_response(response)
    if path.startswith('/static/'):
        # service-line retained: mainfile behavior consolidated into formal services.
        # If a browser asks an old/unversioned static URL, force revalidation so stale JS/CSS cannot keep old event bindings.
        if request.args.get('v') == STATIC_VERSION:
            response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
            response.headers.pop('Pragma', None)
            response.headers.pop('Expires', None)
        else:
            response.headers['Cache-Control'] = 'no-store, no-cache, max-age=0, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return _v153_maybe_gzip_response(response)
    response.headers['Cache-Control'] = 'no-store, no-cache, max-age=0, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return _v153_maybe_gzip_response(response)

@app.before_request
def protect_pages():
    path = request.path or ''
    public = [
        "/login", "/api/login", "/api/health", "/api/db-diagnostics", "/api/health/db-init", "/api/native-shell/config",
        "/sw.js", "/manifest.webmanifest"
    ]
    if path.startswith("/static/") or path in ("/health",) or path in public:
        return None

    if not require_login() and path not in ("/",):
        if path.startswith("/api/"):
            return jsonify(success=False, error="請先登入", version=APP_VERSION), 401
        return redirect(url_for("login_page"))

    # V350: real APIs must not run against a half-initialized DB.
    # GET pages remain fast, but API calls receive a clear 503 instead of a Flask white 500.
    should_guard_db = path.startswith('/api/') or request.method in ('POST', 'PUT', 'PATCH', 'DELETE') or request.args.get('force') in ('1', 'true', 'yes')
    if should_guard_db:
        ready = ensure_runtime_initialized()
        if not ready and path.startswith('/api/'):
            return jsonify(success=False, error='資料庫初始化尚未完成或失敗，請先查看健康檢查', db_error=(STARTUP_DB_ERROR or '')[:500], version=APP_VERSION), 503

    # service-line retained: mainfile behavior consolidated into formal services.
    # 需要自動每日備份時，可在 Render 環境變數設定 YX_AUTO_DAILY_BACKUP=1。
    if os.getenv("YX_AUTO_DAILY_BACKUP", "0") == "1" and require_login() and not path.startswith("/static/") and path not in ("/health", "/api/health"):
        ensure_daily_backup()

    return None


@app.route("/sw.js")
def serve_root_service_worker():
    resp = send_from_directory(app.static_folder, "service-worker.js", mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-store, no-cache, max-age=0, must-revalidate"
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["X-Yuanxing-SW"] = "static-css-icons-only-no-api-cache"
    return resp

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def error_response(msg, code=400):
    return jsonify({"success": False, "error": msg}), code


@app.errorhandler(Exception)
def yx_v349_runtime_exception_guard(e):
    """V349: Render runtime guard. API returns JSON; page GETs never fall back to Flask white 500."""
    path = request.path or ''
    if isinstance(e, HTTPException):
        if path.startswith('/api/'):
            return jsonify(success=False, error=e.description or e.name or '請求失敗'), int(e.code or 500)
        return e
    err_text = str(e)[:500]
    try:
        log_error('unhandled_exception_v349', f"{request.method} {path}: {err_text}")
    except Exception:
        pass
    try:
        print('[v349] runtime page/api error:', request.method, path, err_text, flush=True)
    except Exception:
        pass
    if path.startswith('/api/'):
        return jsonify(success=False, error='系統暫時忙碌，請重試', detail=err_text[:180], version=APP_VERSION), 500
    safe_next = '/login' if not require_login() else '/'
    html = f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>沅興木業｜頁面暫時錯誤</title>
<style>body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f3ed;margin:0;padding:24px;color:#2f2118}}.card{{max-width:720px;margin:48px auto;background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(0,0,0,.08);padding:22px}}.t{{font-size:22px;font-weight:800;margin-bottom:8px}}.m{{line-height:1.7;color:#5b4a3f}}.btn{{display:inline-block;margin:12px 8px 0 0;padding:10px 14px;border-radius:12px;background:#2f2118;color:white;text-decoration:none;font-weight:700}}.btn2{{background:#eee;color:#2f2118}}code{{background:#f3eee8;border-radius:8px;padding:2px 6px}}</style></head>
<body><div class="card"><div class="t">頁面暫時無法載入</div>
<div class="m">系統已記錄錯誤，請先回登入頁或健康檢查。<br>版本：<code>{APP_VERSION}</code><br>路徑：<code>{path}</code></div>
<a class="btn" href="{safe_next}">重新進入</a><a class="btn btn2" href="/api/health?force=1">健康檢查</a>
</div></body></html>'''
    return html, 200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}



# ============================================================
# V386 batch2 formal operation guard: idempotent background saves
# ============================================================
def _yx_operation_id(data, action):
    op = str((data or {}).get('operation_id') or '').strip()
    if not op:
        op = f"{action}-{uuid.uuid4().hex}"
    return op[:120]

def _yx_parse_operation_ts(value):
    try:
        raw = str(value or '').strip().replace('T', ' ')[:19]
        if not raw:
            return 0.0
        return datetime.strptime(raw, '%Y-%m-%d %H:%M:%S').timestamp()
    except Exception:
        try:
            return float(value or 0)
        except Exception:
            return 0.0

def _yx_operation_running_payload(operation_id, action, row=None):
    return {
        'success': True,
        'duplicate': True,
        'duplicate_running': True,
        'queued': True,
        'operation_id': operation_id,
        'operation_action': action,
        'message': '相同操作正在背景儲存中，已避免重複寫入',
        'version': API_SCHEMA_VERSION,
        'cache_bust': API_SCHEMA_VERSION,
    }

def _yx_operation_error_response(operation_id, action, message, code=400, **extra):
    payload = {
        'success': False,
        'error': message,
        'operation_id': operation_id,
        'operation_action': action,
        'version': API_SCHEMA_VERSION,
        'cache_bust': API_SCHEMA_VERSION,
    }
    payload.update(extra or {})
    try:
        _yx_operation_finish(operation_id, action, payload, error=message)
    except Exception:
        pass
    return jsonify(payload), code

def _yx_operation_table_ready(cur):
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

def _yx_operation_begin(operation_id, action, payload):
    if not operation_id:
        return None
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_operation_table_ready(cur)
        cur.execute(sql("SELECT * FROM operation_log WHERE operation_id=?"), (operation_id,))
        row = fetchone_dict(cur)
        if row and row.get('status') == 'done':
            try:
                cached = json.loads(row.get('response_json') or '{}')
            except Exception:
                cached = {}
            return cached or {'success': True, 'duplicate': True, 'operation_id': operation_id, 'version': API_SCHEMA_VERSION}
        if row and row.get('status') == 'running':
            age = time.time() - _yx_parse_operation_ts(row.get('updated_at') or row.get('created_at'))
            # V386: the same background operation may be retried by queue/network while the first write is still running.
            # Do not run the same DB rewrite twice unless the previous row is stale.
            if 0 <= age < 90:
                return _yx_operation_running_payload(operation_id, action, row)
        if row:
            cur.execute(sql("UPDATE operation_log SET status=?, action=?, request_json=?, updated_at=? WHERE operation_id=?"), ('running', action, json.dumps(payload or {}, ensure_ascii=False), now(), operation_id))
        else:
            cur.execute(sql("INSERT INTO operation_log(operation_id, action, status, request_json, created_at, updated_at) VALUES(?,?,?,?,?,?)"), (operation_id, action, 'running', json.dumps(payload or {}, ensure_ascii=False), now(), now()))
        conn.commit()
        return None
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('operation_begin', str(e))
        return None
    finally:
        try: conn.close()
        except Exception: pass

def _yx_operation_finish(operation_id, action, response_payload, error=None):
    if not operation_id:
        return
    conn = get_db(); cur = conn.cursor()
    try:
        _yx_operation_table_ready(cur)
        status = 'error' if error else 'done'
        cur.execute(sql("SELECT operation_id FROM operation_log WHERE operation_id=?"), (operation_id,))
        row = fetchone_dict(cur)
        if row:
            cur.execute(sql("UPDATE operation_log SET status=?, response_json=?, error=?, updated_at=? WHERE operation_id=?"), (status, json.dumps(response_payload or {}, ensure_ascii=False), str(error or ''), now(), operation_id))
        else:
            cur.execute(sql("INSERT INTO operation_log(operation_id, action, status, response_json, error, created_at, updated_at) VALUES(?,?,?,?,?,?,?)"), (operation_id, action, status, json.dumps(response_payload or {}, ensure_ascii=False), str(error or ''), now(), now()))
        conn.commit()
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        log_error('operation_finish', str(e))
    finally:
        try: conn.close()
        except Exception: pass

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



def _ship_source_label_for_ui(source=''):
    raw = str(source or '').strip()
    if re.search(r'總單|master_order|master_orders|master', raw, re.I):
        return '總單'
    if re.search(r'訂單|orders|order', raw, re.I):
        return '訂單'
    if re.search(r'庫存|inventory|stock', raw, re.I):
        return '庫存'
    return raw or '自動判斷'

def _enrich_shipping_record_for_ui(row):
    r = dict(row or {})
    source = r.get('source_table') or r.get('source') or ''
    label = r.get('source_label') or _ship_source_label_for_ui(source)
    try:
        before = int(r.get('before_qty') or 0)
    except Exception:
        before = 0
    try:
        after = int(r.get('after_qty') or 0)
    except Exception:
        after = 0
    try:
        qty = int(r.get('qty') or 0)
    except Exception:
        qty = 0
    detail = {}
    raw_detail = r.get('source_detail_json') or ''
    if raw_detail:
        try:
            detail = json.loads(raw_detail) if isinstance(raw_detail, str) else (raw_detail or {})
        except Exception:
            detail = {}
    source_plan = []
    raw_plan = r.get('source_plan_json') or ''
    if raw_plan:
        try:
            source_plan = json.loads(raw_plan) if isinstance(raw_plan, str) else (raw_plan or [])
        except Exception:
            source_plan = []
    if not source_plan and isinstance(detail, dict):
        source_plan = detail.get('source_plan') or []
    r['source_label'] = label
    r['source_summary'] = f'{label} 扣前{before}→扣後{after}' if (before or after or source) else label
    r['source_before_after'] = {'before': before, 'after': after, 'qty': qty}
    r['source_detail'] = detail if isinstance(detail, dict) else {}
    r['source_plan'] = source_plan if isinstance(source_plan, list) else []
    r['message'] = '｜'.join([x for x in [r.get('customer_name') or '', r.get('material') or '', r.get('product_text') or '', f'{qty}件' if qty else '', r.get('source_summary') or ''] if x])
    return r

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
        # V414: 客戶商品明細 / 出貨下拉都不能顯示已扣到 0 的殘留列。
        if int(qty or 0) <= 0:
            continue
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
    # V133: CNF / FOB / FOB代 are display tags, not part of the canonical customer key.
    customer = re.sub(r'(?:FOB\s*代付|FOB\s*代|FOB|CNF)', '', customer, flags=re.I)
    customer = re.sub(r'(?:^|\s)代(?:$|\s)', ' ', customer)
    customer = re.sub(r'\s+', ' ', customer).strip()
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
    # service-line retained: mainfile behavior consolidated into formal services.
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


def warehouse_source_id_aliases(source_id):
    """Return safe aliases for warehouse source IDs.

    Split-support warehouse rows use IDs like "123:1:336x16" while older saved
    cells may only have "123".  Available-items and return/unplaced logic must
    treat both as the same source when the exact support text matches.
    """
    aliases = set()
    raw = str(source_id or '').strip()
    if raw:
        aliases.add(raw)
        if ':' in raw:
            base = raw.split(':', 1)[0].strip()
            if base:
                aliases.add(base)
    return aliases


def warehouse_build_source_id_resolver(source_details):
    resolver = {}
    try:
        for detail_key, rows in (source_details or {}).items():
            if not isinstance(detail_key, tuple) or len(detail_key) < 4:
                continue
            exact, customer, source_label, source_id = detail_key
            aliases = set(warehouse_source_id_aliases(source_id))
            for row in (rows or []):
                if not isinstance(row, dict):
                    continue
                for field in ('source_id', 'id', 'origin_source_id', 'row_id'):
                    aliases.update(warehouse_source_id_aliases(row.get(field)))
            for alias in aliases:
                if alias:
                    resolver[(exact, customer, source_label, str(alias))] = str(source_id or '')
    except Exception:
        return {}
    return resolver


def warehouse_resolved_placed_source_ids(exact, customer, source_label, raw_source_id, resolver):
    ids = set(warehouse_source_id_aliases(raw_source_id))
    out = set(ids)
    try:
        for alias in list(ids):
            mapped = (resolver or {}).get((exact, customer, source_label, str(alias)))
            if mapped:
                out.update(warehouse_source_id_aliases(mapped))
    except Exception:
        pass
    return [x for x in out if x] or ['']


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
    # service-line retained: mainfile behavior consolidated into formal services.
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
        # V133: quantity must follow product text when it contains 支數x件數, e.g. 63x30x125=240x49 => 49.
        try:
            row_qty = int(effective_product_qty(original_product, row_qty))
        except Exception:
            pass
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
    # V435: save-boundary normalization must never drop visible legacy warehouse items.
    # It accepts arrays, dict wrappers, plain strings and every product text alias used by old packages.
    try:
        if '_warehouse_v432_parse_items' in globals():
            parsed = _warehouse_v432_parse_items(items)
            if parsed:
                items = parsed
    except Exception:
        pass
    out_map = {}
    for raw in items or []:
        if isinstance(raw, str):
            it = {'product_text': raw, 'product': raw, 'raw_text': raw, 'qty': 1, 'customer_name': '庫存'}
        elif isinstance(raw, dict):
            it = dict(raw)
        else:
            continue
        product = str(it.get('product_text') or it.get('product') or it.get('product_size') or it.get('display_product_size') or it.get('base_product_size') or it.get('size') or it.get('size_text') or it.get('dimension') or it.get('dimensions') or it.get('product_label') or it.get('raw_text') or it.get('label') or it.get('title') or it.get('detail') or it.get('description') or it.get('goods_text') or it.get('item_text') or it.get('content') or it.get('memo') or it.get('remark') or it.get('desc') or it.get('name') or it.get('text') or it.get('value') or '').strip()
        if not product:
            continue
        try:
            qty = int(float(it.get('qty') or it.get('quantity') or it.get('pieces') or it.get('count') or it.get('piece_count') or it.get('total_qty') or it.get('件數') or 0))
        except Exception:
            qty = 0
        if qty <= 0:
            try:
                qty = int(effective_product_qty(product, 1))
            except Exception:
                qty = 1
        qty = max(1, qty)
        customer = warehouse_customer_key(it.get('customer_name') or it.get('customer') or it.get('client_name') or '')
        material = str(it.get('material') or it.get('wood_type') or it.get('product_code') or '').strip()
        source_table = str(it.get('source_table') or it.get('source') or '庫存').strip() or '庫存'
        source_id = str(it.get('source_id') or it.get('id') or it.get('row_id') or '').strip()
        placement_label = str(it.get('placement_label') or it.get('layer_label') or '前排').strip() or '前排'
        key = (warehouse_item_exact_key(product) or product, customer, material, source_table, source_id, placement_label)
        row = out_map.get(key)
        if row:
            row['qty'] = int(row.get('qty') or 0) + qty
        else:
            row = dict(it)
            row.update({'product_text': product, 'product': product, 'raw_text': row.get('raw_text') or product, 'qty': qty, 'customer_name': customer, 'material': material, 'source': source_table, 'source_table': source_table, 'source_id': source_id, 'placement_label': placement_label, 'layer_label': placement_label, '__warehouseCellItem': True})
            out_map[key] = row
    return list(out_map.values())

def validate_warehouse_cell_quantities(zone, column_index, slot_number, items):
    # service-line retained: mainfile behavior consolidated into formal services.
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
        # service-line retained: mainfile behavior consolidated into formal services.
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
    # service-line retained: mainfile behavior consolidated into formal services.
    # Do not block a GET page render on DB initialization; the setting API can refresh later.
    native_mode = True
    if _RUNTIME_INIT_DONE:
        try:
            native_mode = (str(get_setting('native_ocr_mode', '1')) == '1')
        except Exception:
            native_mode = True
    return render_template("settings.html", username=current_username(), title="設定", is_admin=is_admin, native_ocr_mode=native_mode)

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
@app.route("/shipping")
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
        ready = ensure_runtime_initialized()
    except Exception as _yx_init_err:
        ready = False
        try: log_error('runtime_init_login_v351', str(_yx_init_err))
        except Exception: pass
    if not ready:
        return jsonify(success=False, error='資料庫初始化失敗，登入暫時不可用', db_error=(STARTUP_DB_ERROR or '')[:500], version=APP_VERSION), 503
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
            # service-line retained: mainfile behavior consolidated into formal services.
            # service-line retained: mainfile behavior consolidated into formal services.
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


# ============================================================
# V452 max repair: exact DB readback + fallback insert for product creation.
# This does not change yx_cache/yx_core/fast-cache architecture; it only prevents
# successful-looking submits from disappearing after refresh when legacy merge/upsert paths miss a row.
# ============================================================
def _v452_table_columns(cur, table_name):
    try:
        if USE_POSTGRES:
            cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s", (table_name,))
        else:
            cur.execute(f"PRAGMA table_info({table_name})")
            return [r[1] for r in cur.fetchall()]
        return [r[0] for r in cur.fetchall()]
    except Exception:
        return []

def _v452_item_exists(cur, table_name, customer_name, product_text, material, location=''):
    clauses = ["product_text = ?"]
    vals = [product_text]
    if customer_name:
        clauses.append("customer_name = ?")
        vals.append(customer_name)
    if material:
        clauses.append("COALESCE(material, product_code, '') = ?")
        vals.append(material)
    if location:
        clauses.append("COALESCE(location, area, zone, '') = ?")
        vals.append(location)
    try:
        cur.execute(sql(f"SELECT id FROM {table_name} WHERE " + " AND ".join(clauses) + " LIMIT 1"), tuple(vals))
        return bool(fetchone_dict(cur))
    except Exception:
        try:
            cur.execute(sql(f"SELECT id FROM {table_name} WHERE product_text = ? LIMIT 1"), (product_text,))
            return bool(fetchone_dict(cur))
        except Exception:
            return False

def _v452_force_persist_items(table_name, customer_name, items, operator='', location='', region=''):
    inserted = 0
    verified = 0
    conn = get_db()
    cur = conn.cursor()
    try:
        cols = set(_v452_table_columns(cur, table_name))
        if not cols:
            return {'inserted':0, 'verified':0, 'error':'no_columns'}
        for it in (items or []):
            product_text = format_product_text_height2((it.get('product_text') or '').strip())
            if not product_text:
                continue
            material = clean_material_value(it.get('material') or it.get('product_code') or '', product_text)
            qty = int(effective_product_qty(product_text, it.get('qty') or 1) or it.get('qty') or 1)
            if qty <= 0:
                qty = 1
            loc = (it.get('location') or it.get('area') or it.get('zone') or location or '').strip()
            if _v452_item_exists(cur, table_name, customer_name, product_text, material, loc):
                verified += 1
                continue
            row = {}
            def put(k,v):
                if k in cols: row[k]=v
            put('customer_name', customer_name or '')
            put('product_text', product_text)
            put('product_code', material)
            put('material', material)
            put('month_tag', product_month_tag(product_text))
            put('qty', qty)
            put('quantity', qty)
            put('area', loc)
            put('location', loc)
            put('zone', loc)
            put('region', region or resolve_customer_region(customer_name, region or '北區') if customer_name else (region or ''))
            put('status', 'pending')
            put('operator', operator or current_username())
            put('source_text', it.get('source_text') or '')
            put('created_at', now())
            put('updated_at', now())
            if not row:
                continue
            placeholders = ','.join(['?'] * len(row))
            cur.execute(sql(f"INSERT INTO {table_name} (" + ','.join(row.keys()) + f") VALUES ({placeholders})"), tuple(row.values()))
            inserted += 1
        conn.commit()
        return {'inserted':inserted, 'verified':verified}
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        try: log_error('v452_force_persist_' + table_name, str(e))
        except Exception: pass
        return {'inserted':inserted, 'verified':verified, 'error':str(e)}
    finally:
        try: conn.close()
        except Exception: pass


# service-line retained: mainfile behavior consolidated into formal services.
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



def audit_service_safe_side_effect(label, fn, *args, **kwargs):
    """Run logs/audit/notify/snapshot safely so product creation never fails because of side effects."""
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        try:
            log_error('v35_safe_side_effect_' + str(label), str(e))
        except Exception:
            pass
        return None

def product_service_response_payload(customer_name=''):
    payload = {}
    try:
        if customer_name:
            snap = build_customer_payload_snapshot(customer_name)
            if isinstance(snap, dict):
                payload.update(snap)
    except Exception as e:
        audit_service_safe_side_effect('snapshot', lambda: (_ for _ in ()).throw(e))
    try:
        payload['snapshots'] = product_service_snapshots()
    except Exception:
        payload['snapshots'] = {}
    try:
        payload['customers'] = get_customers()
    except Exception:
        payload['customers'] = []
    return payload


def customer_profile_write_payload(customer_name='', *, old_customer_name='', item=None, mode='', extra=None):
    """V396: shared customer-write response after rename/move/archive/delete/restore/upsert.
    Keeps customer cards, product tables, shipping dropdown, warehouse unplaced and Today Changes aligned.
    """
    customer_name = (customer_name or '').strip()
    old_customer_name = (old_customer_name or '').strip()
    try:
        _clear_product_fast_cache()
    except Exception as e:
        try: log_error('customer_profile_write_clear_cache_v396', str(e))
        except Exception: pass
    payload = dict(success=True, item=item or {}, mode=mode or '', customer_name=customer_name, old_customer_name=old_customer_name, new_customer_name=customer_name, sync_version=API_SCHEMA_VERSION, cache_bust=API_SCHEMA_VERSION)
    try:
        payload['items'] = get_customers()
        payload['customers'] = payload['items']
    except Exception as e:
        try: log_error('customer_profile_write_customers_v396', str(e))
        except Exception: pass
        payload['items'] = []
        payload['customers'] = []
    try:
        payload['snapshots'] = product_service_snapshots()
    except Exception as e:
        try: log_error('customer_profile_write_snapshots_v396', str(e))
        except Exception: pass
    try:
        if customer_name:
            payload.update(build_customer_payload_snapshot(customer_name))
    except Exception as e:
        try: log_error('customer_profile_write_snapshot_customer_v396', str(e))
        except Exception: pass
    if isinstance(extra, dict):
        payload.update(extra)
    return yx_api_align_payload(payload, cache_label=API_SCHEMA_VERSION)


# V137 second speed pack: light list pagination helpers.  These helpers keep
# first paint fast on mobile: product pages can request an initial window,
# while manual refresh / customer drill-down can still request the full list.


def _yx145_fast_write_requested(data=None):
    """V146: product write endpoints can return a tiny payload so saving never freezes pages."""
    try:
        data = data or {}
        v = data.get('fast_response') if isinstance(data, dict) else None
        q = request.args.get('fast_response') or request.args.get('fast') or request.args.get('light')
        return str(v).lower() in ('1','true','yes','on') or str(q).lower() in ('1','true','yes','on')
    except Exception:
        return False


def _yx145_write_payload(module='', customer_name='', item=None, extra=None):
    payload = yx_api_align_payload(dict(fast_response=True, module=module or '', customer_name=(customer_name or '').strip(), item=item or {}), cache_label=API_SCHEMA_VERSION)
    try:
        if customer_name:
            payload.update(build_customer_payload_snapshot(customer_name))
    except Exception as e:
        log_error('v146_fast_write_customer_snapshot', str(e))
    try:
        table = {'orders': 'orders', 'master_order': 'master_orders', 'master_orders': 'master_orders'}.get(str(module or '').strip())
        if table and customer_name:
            payload['exact_customer_items'] = product_service_exact_customer_rows(table, customer_name)
            customers_payload = get_customers()
            payload['customers'] = customers_payload
            # V192: fast_response stays small but carries a DB-confirmed snapshot so
            # 訂單/總單新增後，北中南客戶卡片與商品清單不會只停在前端暫存。
            try:
                snap = {'customers': customers_payload}
                if table == 'orders':
                    snap['orders'] = get_orders()
                elif table == 'master_orders':
                    master_rows = get_master_orders()
                    snap['master_order'] = master_rows
                    snap['master_orders'] = master_rows
                payload['snapshots'] = snap
            except Exception as e:
                try: log_error('yx145_fast_snapshot_v196', str(e))
                except Exception: pass
    except Exception as e:
        log_error('v196_fast_write_exact_customer', str(e))
    if isinstance(extra, dict):
        payload.update(extra)
    return payload

def _yx137_list_window(items, default_limit=320):
    try:
        total = len(items or [])
    except Exception:
        total = 0
    try:
        limit = int(request.args.get('limit') or request.args.get('page_size') or default_limit)
    except Exception:
        limit = default_limit
    try:
        offset = int(request.args.get('offset') or 0)
    except Exception:
        offset = 0
    if limit <= 0 or str(request.args.get('all') or '').lower() in ('1','true','yes'):
        return list(items or []), {'total': total, 'limit': 0, 'offset': 0, 'has_more': False}
    limit = max(20, min(limit, 800))
    offset = max(0, offset)
    sliced = list(items or [])[offset:offset+limit]
    return sliced, {'total': total, 'limit': limit, 'offset': offset, 'has_more': (offset + limit) < total}

def _yx137_product_payload(rows, cache_label):
    sliced, meta = _yx137_list_window(rows)
    payload = yx_api_align_payload(dict(items=sliced, rows=sliced, **meta), cache_label=API_SCHEMA_VERSION, extra={'legacy_server_cache': cache_label})
    return payload

@app.route("/api/inventory", methods=["GET", "POST"])
@login_required_json
def api_inventory():
    if request.method == "GET":
        try:
            cache_key = _fast_cache_key('inventory', version=API_SCHEMA_VERSION, user=current_username(), limit=request.args.get('limit') or '', offset=request.args.get('offset') or '', all=request.args.get('all') or '', qv=request.args.get('v') or request.args.get('v287') or request.args.get('v282') or request.args.get('v262') or request.args.get('v257') or request.args.get('v252') or request.args.get('v249') or request.args.get('v244') or request.args.get('v228') or request.args.get('v227') or request.args.get('v226') or request.args.get('v225') or request.args.get('v224') or request.args.get('v223') or request.args.get('v222') or request.args.get('v221') or request.args.get('v214') or request.args.get('v212') or request.args.get('v211') or request.args.get('v208') or request.args.get('v207') or request.args.get('v201') or request.args.get('v199') or request.args.get('v198') or request.args.get('v197') or request.args.get('v196') or request.args.get('v195') or request.args.get('v193') or request.args.get('v192') or '')
            use_fast_cache = (request.args.get('force') != '1' and (request.args.get('fast') == '1' or request.args.get('light') == '1'))
            cached = _fast_cache_get(cache_key, 900.0) if use_fast_cache else None
            if cached:
                return jsonify(cached)
            payload = _yx137_product_payload(grouped_inventory(), 'v139-fourth-pack-inventory-window-cache')
            if use_fast_cache:
                _fast_cache_set(cache_key, payload)
            return jsonify(payload)
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
            audit_service_safe_side_effect('upsert_inventory_customer', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region')), preserve_existing=True)
        for it in items:
            item_location = (it.get("location") or it.get("area") or it.get("zone") or location or "").strip()
            save_inventory_item(it["product_text"], it.get("product_code", ""), int(it["qty"]), item_location, customer_name, operator, data.get("ocr_text", ""), it.get("material",""), duplicate_mode=duplicate_mode)
        v452_persist = _v452_force_persist_items('inventory', customer_name, items, operator=operator, location=location, region=data.get('region') or '')
    except Exception as e:
        log_error("inventory_main_save_v40", str(e))
        return error_response("建立失敗")
    audit_service_safe_side_effect('log_inventory', log_action, current_username(), "建立庫存")
    audit_service_safe_side_effect('audit_inventory', add_audit_trail, current_username(), 'create', 'inventory', customer_name or 'inventory', before_json={}, after_json={'customer_name': customer_name, 'location': location, 'items': items})
    audit_service_safe_side_effect('notify_inventory', notify_sync_event, kind='refresh', module='inventory', message='庫存已更新', extra={'customer_name': customer_name, 'count': len(items)})
    _clear_product_fast_cache()
    if _yx145_fast_write_requested(data):
        return jsonify(_yx145_write_payload('inventory', customer_name, extra={'count': len(items), 'v452_persist': locals().get('v452_persist')}))
    payload = product_service_response_payload(customer_name)
    exact = audit_service_safe_side_effect('exact_inventory', product_service_exact_customer_rows, 'inventory', customer_name) or []
    try:
        rows = grouped_inventory()
    except Exception:
        rows = []
    return jsonify(success=True, items=rows, exact_customer_items=exact, v452_persist=locals().get('v452_persist'), **payload)

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
            _clear_product_fast_cache()
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
        _clear_product_fast_cache()
        _v211_clear_cross_function_cache(customer_name)
        if _yx145_fast_write_requested(data):
            return jsonify(_yx145_write_payload('inventory', customer_name, item={'id': item_id, 'product_text': product_text, 'qty': qty, 'material': material, 'location': location}))
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
        sync_extra = {'id': item_id, 'customer_name': customer_name, 'qty': move_qty, 'source': 'inventory', 'target_source': module, 'cache_bust': API_SCHEMA_VERSION, 'sync_version': API_SCHEMA_VERSION}
        for _m in ('inventory', module, 'ship', 'warehouse', 'today_changes'):
            notify_sync_event(kind='refresh', module=_m, message=f'庫存已移到{target_label}', extra=sync_extra)
        moved_row = {'source': '庫存', 'target': target_label, 'id': item_id, 'product_text': product_text, 'qty': move_qty, 'customer_name': customer_name}
        payload = _yx416_transfer_refresh_payload('inventory', module, [customer_name], [moved_row], extra={'items': grouped_inventory(), 'customer_name': customer_name, 'target': target_label, 'target_label': target_label, 'moved_qty': move_qty})
        return jsonify(payload)
    except Exception as e:
        log_error('inventory_item_move', str(e))
        return error_response('庫存移動失敗')
@app.route("/api/orders", methods=["GET", "POST"])
@login_required_json
def api_orders():
    try:
        ensure_runtime_initialized()
    except Exception as _yx_init_err:
        try: log_error('runtime_init_orders_v196', str(_yx_init_err))
        except Exception: pass
    if request.method == "GET":
        try:
            cache_key = _fast_cache_key('orders', version=API_SCHEMA_VERSION, user=current_username(), limit=request.args.get('limit') or '', offset=request.args.get('offset') or '', all=request.args.get('all') or '', qv=request.args.get('v') or request.args.get('v287') or request.args.get('v282') or request.args.get('v262') or request.args.get('v257') or request.args.get('v252') or request.args.get('v249') or request.args.get('v244') or request.args.get('v228') or request.args.get('v227') or request.args.get('v226') or request.args.get('v225') or request.args.get('v224') or request.args.get('v223') or request.args.get('v222') or request.args.get('v221') or request.args.get('v214') or request.args.get('v212') or request.args.get('v211') or request.args.get('v208') or request.args.get('v207') or request.args.get('v201') or request.args.get('v199') or request.args.get('v198') or request.args.get('v197') or request.args.get('v196') or request.args.get('v195') or request.args.get('v193') or request.args.get('v192') or '')
            use_fast_cache = (request.args.get('force') != '1' and (request.args.get('fast') == '1' or request.args.get('light') == '1'))
            cached = _fast_cache_get(cache_key, 900.0) if use_fast_cache else None
            if cached:
                return jsonify(cached)
            payload = _yx137_product_payload(get_orders(), 'v137-second-pack-orders')
            if use_fast_cache:
                _fast_cache_set(cache_key, payload)
            return jsonify(payload)
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
        audit_service_safe_side_effect('upsert_orders_customer_before', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region') or '北區'), preserve_existing=True)
        save_order(customer_name, items, current_username(), (data.get("duplicate_mode") or "merge").strip() or "merge")
        v452_persist = _v452_force_persist_items('orders', customer_name, items, operator=current_username(), location=data.get('location') or data.get('zone') or '', region=data.get('region') or '北區')
        audit_service_safe_side_effect('upsert_orders_customer_after', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region') or '北區'), preserve_existing=True)
    except Exception as e:
        log_error("orders_main_save_v40", str(e))
        return error_response("訂單建立失敗")
    audit_service_safe_side_effect('log_orders', log_action, current_username(), "建立訂單")
    audit_service_safe_side_effect('audit_orders', add_audit_trail, current_username(), 'create', 'orders', customer_name, before_json={}, after_json={'customer_name': customer_name, 'items': items})
    audit_service_safe_side_effect('notify_orders', notify_sync_event, kind='refresh', module='orders', message='訂單已更新', extra={'customer_name': customer_name, 'count': len(items)})
    _clear_product_fast_cache()
    _v211_clear_cross_function_cache(customer_name)
    try:
        _fast_cache_clear('customers|')
        _fast_cache_clear('customer_items|')
        _fast_cache_clear('today_changes|')
    except Exception:
        pass
    if _yx145_fast_write_requested(data):
        return jsonify(_yx145_write_payload('orders', customer_name, extra={'count': len(items), 'cache_bust': API_SCHEMA_VERSION, 'v452_persist': locals().get('v452_persist')}))
    payload = product_service_response_payload(customer_name)
    exact = audit_service_safe_side_effect('exact_orders', product_service_exact_customer_rows, 'orders', customer_name) or []
    try:
        rows = get_orders()
    except Exception:
        rows = []
    return jsonify(success=True, items=rows, exact_customer_items=exact, v452_persist=locals().get('v452_persist'), **payload)

@app.route("/api/master_orders", methods=["GET", "POST"])
@login_required_json
def api_master_orders():
    try:
        ensure_runtime_initialized()
    except Exception as _yx_init_err:
        try: log_error('runtime_init_master_orders_v196', str(_yx_init_err))
        except Exception: pass
    if request.method == "GET":
        try:
            cache_key = _fast_cache_key('master_orders', version=API_SCHEMA_VERSION, user=current_username(), limit=request.args.get('limit') or '', offset=request.args.get('offset') or '', all=request.args.get('all') or '', qv=request.args.get('v') or request.args.get('v287') or request.args.get('v282') or request.args.get('v262') or request.args.get('v257') or request.args.get('v252') or request.args.get('v249') or request.args.get('v244') or request.args.get('v228') or request.args.get('v227') or request.args.get('v226') or request.args.get('v225') or request.args.get('v224') or request.args.get('v223') or request.args.get('v222') or request.args.get('v221') or request.args.get('v214') or request.args.get('v212') or request.args.get('v211') or request.args.get('v208') or request.args.get('v207') or request.args.get('v201') or request.args.get('v199') or request.args.get('v198') or request.args.get('v197') or request.args.get('v196') or request.args.get('v195') or request.args.get('v193') or request.args.get('v192') or '')
            use_fast_cache = (request.args.get('force') != '1' and (request.args.get('fast') == '1' or request.args.get('light') == '1'))
            cached = _fast_cache_get(cache_key, 900.0) if use_fast_cache else None
            if cached:
                return jsonify(cached)
            payload = _yx137_product_payload(get_master_orders(), 'v137-second-pack-master-orders')
            if use_fast_cache:
                _fast_cache_set(cache_key, payload)
            return jsonify(payload)
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
        audit_service_safe_side_effect('upsert_master_customer_before', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region') or '北區'), preserve_existing=True)
        save_master_order(customer_name, items, current_username(), (data.get("duplicate_mode") or "merge").strip() or "merge")
        v452_persist = _v452_force_persist_items('master_orders', customer_name, items, operator=current_username(), location=data.get('location') or data.get('zone') or '', region=data.get('region') or '北區')
        audit_service_safe_side_effect('upsert_master_customer_after', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region') or '北區'), preserve_existing=True)
    except Exception as e:
        log_error("master_orders_main_save_v40", str(e))
        return error_response("總單失敗")
    audit_service_safe_side_effect('log_master_orders', log_action, current_username(), "更新總單")
    audit_service_safe_side_effect('audit_master_orders', add_audit_trail, current_username(), 'create', 'master_orders', customer_name, before_json={}, after_json={'customer_name': customer_name, 'items': items})
    audit_service_safe_side_effect('notify_master_orders', notify_sync_event, kind='refresh', module='master_order', message='總單已更新', extra={'customer_name': customer_name, 'count': len(items)})
    _clear_product_fast_cache()
    _v211_clear_cross_function_cache(customer_name)
    try:
        _fast_cache_clear('customers|')
        _fast_cache_clear('customer_items|')
        _fast_cache_clear('today_changes|')
    except Exception:
        pass
    if _yx145_fast_write_requested(data):
        return jsonify(_yx145_write_payload('master_order', customer_name, extra={'count': len(items), 'cache_bust': API_SCHEMA_VERSION, 'v452_persist': locals().get('v452_persist')}))
    payload = product_service_response_payload(customer_name)
    exact = audit_service_safe_side_effect('exact_master_orders', product_service_exact_customer_rows, 'master_orders', customer_name) or []
    try:
        rows = get_master_orders()
    except Exception:
        rows = []
    return jsonify(success=True, items=rows, exact_customer_items=exact, v452_persist=locals().get('v452_persist'), **payload)




def shipping_service_warehouse_snapshot_payload(result):
    """V396: after shipping succeeds, return DB-readback warehouse columns touched by warehouse_deduct.
    This lets the warehouse page apply the server-confirmed cells immediately instead of first
    painting an optimistic local deduction and waiting for a later consistency check.
    """
    touched = set()
    def scan(obj):
        if not obj:
            return
        if isinstance(obj, list):
            for x in obj:
                scan(x)
            return
        if not isinstance(obj, dict):
            return
        for ch in obj.get('warehouse_deduct') or []:
            try:
                z = str((ch or {}).get('zone') or '').strip().upper()
                c = int((ch or {}).get('column_index') or (ch or {}).get('col') or 0)
                if z in ('A', 'B') and c > 0:
                    touched.add((z, c))
            except Exception:
                continue
        for key in ('breakdown', 'items', 'result', 'source_consistency'):
            val = obj.get(key)
            if val is not obj:
                scan(val)
    try:
        scan(result or {})
    except Exception as e:
        try: log_error('ship_warehouse_snapshot_collect_v396', str(e))
        except Exception: pass
    columns = []
    flat_cells = []
    for z, c in sorted(touched):
        try:
            cells = warehouse_get_column_cells(z, c)
            enriched = []
            for cell in cells or []:
                try:
                    if '_warehouse_enrich_cell_client_meta' in globals():
                        row = _warehouse_enrich_cell_client_meta(cell)
                    else:
                        row = dict(cell or {})
                    try:
                        if not isinstance(row.get('items'), list):
                            row['items'] = json.loads(row.get('items_json') or '[]')
                    except Exception:
                        row['items'] = []
                    row['items_json'] = json.dumps(row.get('items') or [], ensure_ascii=False)
                    enriched.append(row)
                except Exception:
                    enriched.append(dict(cell or {}))
            columns.append({
                'zone': z,
                'column_index': c,
                'column_cells': enriched,
                'readback_count': len(enriched),
                'column_revision': int(time.time() * 1000),
                'db_readback': True,
                'reason': 'ship-completed-v413',
            })
            flat_cells.extend(enriched)
        except Exception as e:
            try: log_error('ship_warehouse_snapshot_column_v396', f'{z}-{c}: {e}')
            except Exception: pass
    return {
        'warehouse_column_snapshots': columns,
        'warehouse_columns': columns,
        'warehouse_cells_snapshot': flat_cells,
        'warehouse_snapshot_version': API_SCHEMA_VERSION,
    }


def shipping_service_affected_customers(customer_name, result):
    """V412: collect every customer whose visible counts can change after shipping.
    Normal shipping affects the ship customer; borrowed/source-customer shipping also affects
    the source customer, so front-end customer cards and product lists must refresh both.
    """
    names = []
    def add(v):
        v = (v or '').strip()
        if v and v not in names:
            names.append(v)
    add(customer_name)
    try:
        for b in (result or {}).get('breakdown') or []:
            add(b.get('ship_customer_name') or b.get('customer_name') or customer_name)
            src_table = str(b.get('source_table') or '').strip()
            src_customer = (b.get('source_customer_name') or '').strip()
            if src_table != 'inventory':
                add(src_customer)
            if b.get('is_borrowed'):
                add(src_customer)
    except Exception as e:
        try: log_error('ship_affected_customers_v412', str(e))
        except Exception: pass
    return names


def shipping_service_affected_customer_payloads(names):
    """V412: compact per-customer readback for order/master/customer-card refresh."""
    out = {}
    for name in names or []:
        name = (name or '').strip()
        if not name:
            continue
        try:
            payload = build_customer_payload_snapshot(name)
            payload['orders'] = product_service_exact_customer_rows('orders', name)
            payload['master_order'] = product_service_exact_customer_rows('master_orders', name)
            payload['master_orders'] = payload['master_order']
            out[name] = payload
        except Exception as e:
            try: log_error('ship_affected_customer_payload_v412', f'{name}: {e}')
            except Exception: pass
    return out

def shipping_service_snapshot_key(token):
    return 'ship_preview_snapshot_' + str(token or '').strip()

def shipping_service_source_plan_signature(row):
    """Compact signature of preview source rows for confirm-time verification.

    V413: source_plan already contains the exact row ids; this signature makes
    the preview token reject if the selected source row id/qty/before_qty/source
    table/customer changes before final confirm.
    """
    try:
        plan = []
        for p in ((row or {}).get('source_plan') or []):
            if not isinstance(p, dict):
                continue
            plan.append({
                'id': int(p.get('id') or 0),
                'qty': int(p.get('qty') or 0),
                'before_qty': int(p.get('before_qty') or 0),
                'source_table': str(p.get('source_table') or (row or {}).get('source_preference') or (row or {}).get('source_table') or '').strip(),
                'source_customer_name': str(p.get('source_customer_name') or (row or {}).get('source_customer_name') or '').strip(),
                'row_lock_key': str(p.get('row_lock_key') or '').strip(),
            })
        return json.dumps(plan, ensure_ascii=False, sort_keys=True)
    except Exception:
        return ''


def shipping_service_preview_source_lock_summary(preview):
    rows = []
    try:
        for idx, row in enumerate((preview or {}).get('items') or []):
            if not isinstance(row, dict):
                continue
            rows.append({
                'index': idx,
                'product_text': row.get('product_text') or '',
                'material': row.get('material') or row.get('product_code') or '',
                'qty': int(row.get('qty') or 0),
                'source_table': row.get('source_preference') or row.get('source_table') or '',
                'source_label': row.get('source_label') or '',
                'source_customer_name': row.get('source_customer_name') or '',
                'source_plan_ids': [p.get('id') for p in (row.get('source_plan') or []) if isinstance(p, dict)],
                'source_plan_signature': shipping_service_source_plan_signature(row),
            })
    except Exception as e:
        try: log_error('ship_preview_source_lock_summary_v413', str(e))
        except Exception: pass
    return rows


def shipping_service_make_preview_token(customer_name, items, preview):
    token = uuid.uuid4().hex
    payload = {
        'token': token,
        'customer_name': customer_name,
        'items': items,
        'preview': preview,
        'preview_source_lock_summary': shipping_service_preview_source_lock_summary(preview),
        'created_at': now(),
        'operator': current_username(),
        'source_lock_version': API_SCHEMA_VERSION,
        'consumed_at': '',
        'consumed_by_operation_id': '',
    }
    try:
        set_setting(shipping_service_snapshot_key(token), json.dumps(payload, ensure_ascii=False, sort_keys=True))
    except Exception as e:
        log_error('ship_preview_snapshot_save', str(e))
    return token


def shipping_service_read_preview_snapshot(token):
    token = str(token or '').strip()
    if not token:
        return None, '出貨缺少預覽鎖定，請重新預覽'
    raw = get_setting(shipping_service_snapshot_key(token), '') or ''
    if not raw:
        return None, '出貨預覽已過期，請重新預覽'
    try:
        saved = json.loads(raw)
    except Exception:
        return None, '出貨預覽資料損壞，請重新預覽'
    if saved.get('consumed_at'):
        return None, '這次出貨預覽已完成扣除，請重新預覽後再送出'
    if (saved.get('source_lock_version') or '') != API_SCHEMA_VERSION:
        return None, '出貨預覽鎖定版本已更新，請重新預覽'
    try:
        created = datetime.strptime(str(saved.get('created_at') or ''), '%Y-%m-%d %H:%M:%S')
        if (datetime.now() - created).total_seconds() > 1800:
            return None, '出貨預覽超過 30 分鐘，請重新預覽'
    except Exception:
        pass
    return saved, ''


def shipping_service_consume_preview_token(token, operation_id=''):
    token = str(token or '').strip()
    if not token:
        return
    saved, err = shipping_service_read_preview_snapshot(token)
    if not saved:
        return
    try:
        saved['consumed_at'] = now()
        saved['consumed_by_operation_id'] = str(operation_id or '')
        saved['source_lock_version'] = API_SCHEMA_VERSION
        set_setting(shipping_service_snapshot_key(token), json.dumps(saved, ensure_ascii=False, sort_keys=True))
    except Exception as e:
        log_error('ship_preview_snapshot_consume', str(e))


def shipping_service_preview_locked_items(token, customer_name, items):
    """Return confirm items locked to the exact source chosen by /api/ship-preview.

    V225: the preview table and the real deduction must use the same source.
    We do not change the fast cache / queue architecture; this only enriches the
    already submitted items with the saved preview source before final deduction.
    """
    token = str(token or '').strip()
    if not token:
        return items
    saved, _err = shipping_service_read_preview_snapshot(token)
    if not saved:
        return items
    if (saved.get('customer_name') or '').strip() != (customer_name or '').strip():
        return items
    preview_rows = (saved.get('preview') or {}).get('items') or []
    if not isinstance(preview_rows, list) or not preview_rows:
        return items
    locked = []
    for idx, item in enumerate(items or []):
        row = preview_rows[idx] if idx < len(preview_rows) and isinstance(preview_rows[idx], dict) else {}
        enriched = dict(item or {})
        # Only lock when the saved preview row matches this product/material/qty enough to be safe.
        try:
            item_product = format_product_text_height2(enriched.get('product_text') or '')
            row_product = format_product_text_height2(row.get('product_text') or row.get('product') or '')
            item_material = clean_material_value(enriched.get('material') or enriched.get('product_code') or '', item_product)
            row_material = clean_material_value(row.get('material') or row.get('product_code') or '', row_product)
            item_qty = int(enriched.get('qty') or 0)
            row_qty = int(row.get('qty') or row.get('need_qty') or item_qty or 0)
            matched = (not row_product or row_product == item_product) and (not row_material or row_material == item_material) and (not row_qty or row_qty == item_qty)
        except Exception:
            matched = True
        if matched:
            src = row.get('source_preference') or row.get('deduct_source') or row.get('source_table') or row.get('source_label')
            if src:
                enriched['source_preference'] = src
                enriched['deduct_source'] = src
                enriched['source'] = src
            source_customer = row.get('source_customer_name') or row.get('borrow_from_customer_name')
            if source_customer:
                enriched['source_customer_name'] = source_customer
                if row.get('borrow_from_customer_name'):
                    enriched['borrow_from_customer_name'] = row.get('borrow_from_customer_name')
            # V234: preview locks the exact same-size row plan, not only the source table.
            # This prevents confirm from deducting a different order/master/inventory row
            # when the same customer has multiple identical dimensions.
            if isinstance(row.get('source_plan'), list):
                enriched['source_plan'] = row.get('source_plan')
                enriched['deduct_plan'] = row.get('source_plan')
        locked.append(enriched)
    return locked

def shipping_service_validate_preview_token(token, customer_name, items):
    token = str(token or '').strip()
    if not token:
        return True, ''
    saved, snapshot_error = shipping_service_read_preview_snapshot(token)
    if not saved:
        return False, snapshot_error or '出貨預覽已過期，請重新預覽'
    if (saved.get('customer_name') or '').strip() != (customer_name or '').strip():
        return False, '出貨客戶已變更，請重新預覽'
    saved_items = saved.get('items') or []
    try:
        a = json.dumps(saved_items, ensure_ascii=False, sort_keys=True)
        b = json.dumps(items, ensure_ascii=False, sort_keys=True)
        if a != b:
            return False, '出貨商品已變更，請重新預覽'
    except Exception:
        return False, '出貨商品已變更，請重新預覽'
    # V225: Re-preview with the source selected by the saved preview.
    # This prevents preview showing 總單/訂單/庫存 but final confirm auto-deducting another source.
    locked_items = shipping_service_preview_locked_items(token, customer_name, items)
    fresh = preview_ship_order(customer_name, locked_items)
    if fresh.get('master_exceeded') or fresh.get('success') is False:
        return False, fresh.get('message') or fresh.get('error') or '目前數量已變更，請重新預覽'
    bad = [x for x in (fresh.get('items') or []) if not x.get('strict_ok')]
    if bad:
        first = bad[0]
        return False, first.get('recommendation') or '目前數量不足，請重新預覽'
    # V413: even when the source still has enough total qty, the exact rows shown
    # in preview must remain the same. This prevents same-size rows from silently
    # shifting between preview and confirm.
    try:
        saved_rows = ((saved.get('preview') or {}).get('items') or [])
        fresh_rows = fresh.get('items') or []
        if len(saved_rows) != len(fresh_rows):
            return False, '出貨來源明細已變更，請重新預覽'
        for idx, saved_row in enumerate(saved_rows):
            fresh_row = fresh_rows[idx] if idx < len(fresh_rows) else {}
            if shipping_service_source_plan_signature(saved_row) != shipping_service_source_plan_signature(fresh_row):
                return False, '出貨來源資料已變更，請重新預覽'
            if (saved_row.get('source_preference') or saved_row.get('source_table') or '') != (fresh_row.get('source_preference') or fresh_row.get('source_table') or ''):
                return False, '出貨扣除來源已變更，請重新預覽'
            if (saved_row.get('source_customer_name') or '') != (fresh_row.get('source_customer_name') or ''):
                return False, '出貨來源客戶已變更，請重新預覽'
    except Exception as e:
        try: log_error('ship_preview_source_signature_v413', str(e))
        except Exception: pass
        return False, '出貨來源鎖定檢查失敗，請重新預覽'
    return True, ''

def shipping_service_preview_error_code(message):
    """V396: classify preview lock failures so the front end preserves the preview
    and shows the correct next action instead of treating the request as a completed shipment.
    """
    msg = str(message or '')
    if '過期' in msg or '重新預覽' in msg:
        return 'preview_expired'
    if '客戶已變更' in msg:
        return 'preview_customer_changed'
    if '商品已變更' in msg:
        return 'preview_items_changed'
    if '來源' in msg or '鎖定' in msg:
        return 'preview_source_changed'
    if '數量不足' in msg or '不可扣' in msg or '數量已變更' in msg:
        return 'preview_qty_changed'
    return 'preview_changed'

@app.route("/api/ship", methods=["POST"])
@app.route("/api/ship/confirm", methods=["POST"])
@login_required_json
def api_ship():
    try:
        data = request.get_json(silent=True) or {}
        operation_id = _yx_operation_id(data, 'ship_confirm') if '_yx_operation_id' in globals() else (data.get('operation_id') or data.get('request_key') or uuid.uuid4().hex)
        def _ship_fail(msg, code=400, **extra):
            payload = {'success': False, 'error': msg, 'operation_id': operation_id, 'preserve_preview': True, 'preview_required': True, 'deduct_committed': False, 'shipping_state': 'preview_preserved', 'retry_action': 'repreview', 'version': API_SCHEMA_VERSION, 'sync_version': API_SCHEMA_VERSION, 'cache_bust': API_SCHEMA_VERSION}
            payload.update(extra or {})
            if '_yx_operation_finish' in globals():
                try: _yx_operation_finish(operation_id, 'ship_confirm', payload, error=msg)
                except Exception: pass
            return jsonify(payload), code
        if '_yx_operation_begin' in globals():
            cached = _yx_operation_begin(operation_id, 'ship_confirm', data)
            if cached:
                # V396: a duplicate while the first shipment is still running must not look like success.
                # Otherwise the front end may clear the preview even though the DB transaction is not finished.
                if cached.get('duplicate_running') or cached.get('queued'):
                    cached.update({'success': False, 'error': '出貨正在處理中，已保留預覽，請稍後再確認。', 'preserve_preview': True, 'preview_required': True, 'deduct_committed': False, 'shipping_state': 'processing', 'retry_action': 'wait', 'error_code': 'ship_confirm_running', 'cache_bust': API_SCHEMA_VERSION, 'sync_version': API_SCHEMA_VERSION})
                    return jsonify(cached), 409
                cached.setdefault('duplicate_done', True)
                cached.setdefault('deduct_committed', bool(cached.get('success')))
                return jsonify(cached)
        if not request_key_from_payload(data, endpoint='/api/ship'):
            payload = duplicate_current_payload('/api/ship', data)
            payload.update({'success': False, 'duplicate': True, 'error': '相同出貨送出已收到，已保留預覽，請勿連點。', 'operation_id': operation_id, 'preserve_preview': True, 'preview_required': True, 'deduct_committed': False, 'shipping_state': 'duplicate_preserved', 'retry_action': 'wait', 'error_code': 'duplicate_ship_request', 'cache_bust': API_SCHEMA_VERSION, 'sync_version': API_SCHEMA_VERSION})
            return jsonify(payload), 409
        items = _parse_items_from_request(data)
        if not items:
            return _ship_fail("請輸入商品資料")
        customer_name = (data.get("customer_name") or "").strip()
        if not customer_name:
            return _ship_fail("請輸入客戶名稱")
        audit_service_safe_side_effect('ship_upsert_customer', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region')))
        # V396: every formal shipment must be confirmed against a preview token.
        # This closes the old direct-submit path that could bypass source locking.
        if not bool(data.get('preview_required')):
            return _ship_fail('出貨必須先預覽並鎖定來源，請重新預覽', error_code='preview_required')
        if not str(data.get('preview_token') or '').strip():
            return _ship_fail('出貨缺少預覽鎖定，請重新預覽', error_code='preview_token_required')
        ok_snapshot, snapshot_error = shipping_service_validate_preview_token(data.get('preview_token'), customer_name, items)
        if not ok_snapshot:
            return _ship_fail(snapshot_error, error_code=shipping_service_preview_error_code(snapshot_error), retry_action='repreview', shipping_state='preview_invalid')
        # V225: lock the confirm payload to the exact sources shown by /api/ship-preview.
        # If those sources no longer have enough quantity, validation above rejects and asks for a new preview.
        items = shipping_service_preview_locked_items(data.get('preview_token'), customer_name, items)
        allow_inventory_fallback = bool(data.get("allow_inventory_fallback"))
        result = ship_order(customer_name, items, current_username(), allow_inventory_fallback=allow_inventory_fallback)
        _preview_snapshot_for_result = None
        try:
            _preview_snapshot_for_result, _ = shipping_service_read_preview_snapshot(data.get('preview_token'))
        except Exception:
            _preview_snapshot_for_result = None
        affected_customer_names = []
        if isinstance(result, dict):
            try:
                affected_customer_names = shipping_service_affected_customers(customer_name, result)
                result['affected_customer_names'] = affected_customer_names
                result['customer_names'] = affected_customer_names
                result['affected_customer_payloads'] = shipping_service_affected_customer_payloads(affected_customer_names)
            except Exception as _affected_err:
                try: log_error('ship_v413_affected_customer_payloads', str(_affected_err))
                except Exception: pass
        if result.get("success"):
            shipping_service_consume_preview_token(data.get('preview_token'), operation_id)
            _clear_product_fast_cache()
            try:
                _warehouse_cache_clear()
            except Exception:
                pass
            audit_service_safe_side_effect('ship_log', log_action, current_username(), "完成出貨")
            audit_service_safe_side_effect('ship_audit', add_audit_trail, current_username(), 'ship', 'shipping_records', customer_name, before_json={}, after_json={'customer_name': customer_name, 'items': items, 'allow_inventory_fallback': allow_inventory_fallback, 'breakdown': result.get('breakdown', [])})
            # V196: 出貨扣除後同時刷新出貨、訂單、總單、倉庫圖、今日異動；避免只修出貨卻讓其他頁仍吃舊資料。
            for _m in ('ship', 'orders', 'master_order', 'warehouse', 'today_changes', 'customers'):
                audit_service_safe_side_effect('ship_notify_' + _m, notify_sync_event, kind='refresh', module=_m, message='出貨已更新', extra={'customer_name': customer_name, 'customer_names': affected_customer_names or [customer_name], 'count': len(items), 'operation_id': operation_id, 'cache_bust': API_SCHEMA_VERSION, 'sync_version': API_SCHEMA_VERSION})
        # V196: 前端送 skip_snapshot 也仍要帶回客戶真實商品與 counts，讓出貨後訂單/總單/客戶卡立即同步。
        if isinstance(result, dict) and customer_name:
            try:
                result.update(product_service_response_payload(customer_name))
            except Exception as _payload_err:
                try: log_error('ship_v214_response_payload', str(_payload_err))
                except Exception: pass
            # V201: tell the front end exactly which lists were deducted so
            # orders / master_order / inventory / customer cards / today can refresh together.
            try:
                affected_sources = set()
                for _b in (result.get('breakdown') or []):
                    if int(_b.get('master_deduct') or 0) > 0:
                        affected_sources.add('master_order')
                    if int(_b.get('order_deduct') or 0) > 0:
                        affected_sources.add('orders')
                    if int(_b.get('inventory_deduct') or 0) > 0:
                        affected_sources.add('inventory')
                result['affected_sources'] = sorted(affected_sources)
                if affected_customer_names:
                    result['affected_customer_names'] = affected_customer_names
                    result['customer_names'] = affected_customer_names
                result['sync_version'] = API_SCHEMA_VERSION
                result['source_consistency'] = [{'product_text': b.get('product_text'), 'source_table': b.get('source_table'), 'source_label': b.get('source_label'), 'source_customer_name': b.get('source_customer_name'), 'source_plan': b.get('source_plan') or [], 'warehouse_deduct': b.get('warehouse_deduct') or []} for b in (result.get('breakdown') or [])]
                # V214: frontend uses these server-confirmed values to override stale cross-page caches after shipping.
                result['server_confirmed_customer_name'] = customer_name
                result['server_confirmed_at'] = int(time.time())
                result['cache_bust'] = API_SCHEMA_VERSION
                result['preview_source_locked'] = True
                result['preview_token_consumed'] = bool(data.get('preview_token')) and bool(result.get('success'))
                result['source_lock_version'] = API_SCHEMA_VERSION
                try:
                    if _preview_snapshot_for_result:
                        result['preview_source_lock_summary'] = _preview_snapshot_for_result.get('preview_source_lock_summary') or shipping_service_preview_source_lock_summary(_preview_snapshot_for_result.get('preview') or {})
                except Exception:
                    pass
                # V396: include server-confirmed warehouse columns touched by this shipment,
                # so warehouse page can apply DB readback immediately without waiting for a full reload.
                try:
                    result.update(shipping_service_warehouse_snapshot_payload(result))
                except Exception as _wh_snap_err:
                    try: log_error('ship_v396_warehouse_snapshot_payload', str(_wh_snap_err))
                    except Exception: pass
            except Exception as _sync_err:
                try: log_error('ship_v214_sync_payload', str(_sync_err))
                except Exception: pass
        if isinstance(result, dict):
            result['operation_id'] = operation_id
            if not result.get('success'):
                result.setdefault('preserve_preview', True)
                result.setdefault('retry_action', 'repreview')
                result.setdefault('version', API_SCHEMA_VERSION)
                if '_yx_operation_finish' in globals():
                    _yx_operation_finish(operation_id, 'ship_confirm', result, error=result.get('error') or '出貨失敗')
                return jsonify(result), 400
            if '_yx_operation_finish' in globals():
                _yx_operation_finish(operation_id, 'ship_confirm', result)
        return jsonify(result)
    except Exception as e:
        log_error("ship", str(e))
        try:
            return _ship_fail("出貨失敗", 500, detail=str(e)[:180])
        except Exception:
            return error_response("出貨失敗")

@app.route("/api/shipping_records", methods=["GET"])
@login_required_json
def api_shipping_records():
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    q = (request.args.get("q") or '').strip()
    rows = [_enrich_shipping_record_for_ui(r) for r in get_shipping_records(start_date=start_date, end_date=end_date, q=q)]
    return jsonify(success=True, items=rows, records=rows, version=API_SCHEMA_VERSION)

@app.route("/api/shipping_records/<int:record_id>", methods=["DELETE"])
@login_required_json
def api_shipping_record_delete(record_id):
    # service-line retained: mainfile behavior consolidated into formal services.
    if current_username() != '陳韋廷':
        return error_response('權限不足', 403)
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql('SELECT * FROM shipping_records WHERE id = ?'), (record_id,))
        before = rows_to_dict(cur)
        cur.execute(sql('DELETE FROM shipping_records WHERE id = ?'), (record_id,))
        conn.commit(); conn.close()
        audit_service_safe_side_effect('shipping_delete_audit', add_audit_trail, current_username(), 'delete', 'shipping_records', str(record_id), before_json={'row': before[0] if before else {}}, after_json={'deleted': True})
        notify_sync_event(kind='refresh', module='shipping_query', message='出貨紀錄已刪除', extra={'id': record_id})
        return jsonify(success=True)
    except Exception as e:
        log_error('shipping_record_delete', str(e))
        return error_response('刪除出貨紀錄失敗')

@app.route("/api/ship-preview", methods=["POST"])
@app.route("/api/ship/preview", methods=["POST"])
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
        preview['success'] = True
        preview['preview_source_lock_summary'] = shipping_service_preview_source_lock_summary(preview)
        preview['preview_token'] = shipping_service_make_preview_token(customer_name, items, preview)
        preview['operation_id'] = data.get('operation_id') or data.get('request_key') or uuid.uuid4().hex
        preview['preview_required'] = True
        preview['preview_source_locked'] = True
        preview['source_lock_version'] = API_SCHEMA_VERSION
        preview['cache_bust'] = API_SCHEMA_VERSION
        preview['shipping_state'] = 'preview_ready'
        preview['deduct_committed'] = False
        preview['retry_action'] = 'confirm'
        return jsonify(preview)
    except Exception as e:
        log_error("ship_preview", str(e))
        return error_response("出貨預覽失敗")

@app.route("/api/customers", methods=["GET", "POST"])
@login_required_json
def api_customers():
    try:
        ensure_runtime_initialized()
    except Exception as _yx_init_err:
        try: log_error('runtime_init_customers_v196', str(_yx_init_err))
        except Exception: pass
    try:
        if request.method == "GET":
            source_filter = (request.args.get('source') or request.args.get('module') or '').strip()
            cache_key = _fast_cache_key('customers', version=API_SCHEMA_VERSION, user=current_username(), source=source_filter, light=request.args.get('light') or '', ship=request.args.get('ship_single') or '', qv=request.args.get('v') or request.args.get('v406') or request.args.get('v287') or request.args.get('v282') or request.args.get('v262') or '')
            use_fast_cache = (request.args.get('force') != '1' and (request.args.get('fast') == '1' or request.args.get('light') == '1'))
            cached = _fast_cache_get(cache_key, 900.0) if use_fast_cache else None
            if cached:
                return jsonify(cached)
            items = get_customers()
            def _yx_count_num(v):
                try: return int(float(v or 0))
                except Exception: return 0
            def _yx_source_counts_from_rows(source):
                counts = {}
                try:
                    rows = get_orders() if source == 'orders' else get_master_orders()
                    for r in rows or []:
                        name = (r.get('customer_name') or '').strip()
                        if not name:
                            continue
                        q = 0
                        try:
                            q = int(effective_product_qty(r.get('product_text') or '', r.get('qty') or 0) or 0)
                        except Exception:
                            q = _yx_count_num(r.get('qty'))
                        # V414: 只統計仍有有效件數的商品列。
                        # 出貨扣到 0 但尚未實體刪除的 row 不可以讓北/中/南客戶卡繼續顯示。
                        if q <= 0:
                            continue
                        d = counts.setdefault(name, {'rows': 0, 'qty': 0, 'region': ''})
                        d['rows'] += 1
                        d['qty'] += max(0, q)
                        if not d.get('region'):
                            d['region'] = (r.get('region') or r.get('customer_region') or r.get('zone') or '').strip()
                except Exception as e:
                    try: log_error('api_customers_source_counts_v408_' + source, str(e))
                    except Exception: pass
                return counts
            def _yx_apply_exact_source_counts(items, source):
                # V407: 訂單/總單客戶列表以實際商品列為準。
                # 如果商品列有客戶，但 customer_profiles 尚未建立，也要回傳；避免北/中/南只靠舊客戶表而漏客戶。
                exact = _yx_source_counts_from_rows(source)
                out = []
                used = set()
                def _fill_source_counts(c, name, ct):
                    rc = dict((c or {}).get('relation_counts') or {})
                    cnt = dict((c or {}).get('counts') or {})
                    if source == 'orders':
                        rc['order_rows'] = ct['rows']; rc['order_qty'] = ct['qty']; cnt['orders'] = {'rows': ct['rows'], 'qty': ct['qty']}
                    else:
                        rc['master_rows'] = ct['rows']; rc['master_qty'] = ct['qty']; cnt['master_order'] = {'rows': ct['rows'], 'qty': ct['qty']}
                    row = dict(c or {})
                    row['name'] = row.get('name') or name
                    row['customer_name'] = row.get('customer_name') or name
                    row['region'] = resolve_customer_region(name, row.get('region') or ct.get('region') or '北區')
                    row['relation_counts'] = rc
                    row['counts'] = cnt
                    row['row_count'] = ct['rows']
                    row['item_count'] = ct['rows']
                    row['total_qty'] = ct['qty']
                    return row
                for c in items or []:
                    name = (c.get('name') or c.get('customer_name') or '').strip()
                    ct = exact.get(name)
                    if not ct:
                        continue
                    used.add(name)
                    out.append(_fill_source_counts(c, name, ct))
                for name, ct in exact.items():
                    if name in used:
                        continue
                    out.append(_fill_source_counts({'name': name, 'customer_name': name}, name, ct))
                return out
            # V452: 客戶資料直接從 customer_profiles + 訂單 + 總單合併。
            # 訂單/總單頁仍只顯示該來源有商品的客戶；客戶資料頁則保留已建立客戶，
            # 並補上訂單/總單的件數與筆數，不會因商品出完就刪掉 customer_profiles。
            if source_filter in ('orders', 'order'):
                items = _yx_apply_exact_source_counts(items, 'orders')
            elif source_filter in ('master_order', 'master_orders', 'master'):
                items = _yx_apply_exact_source_counts(items, 'master_order')
            elif not source_filter:
                try:
                    oc = _yx_source_counts_from_rows('orders')
                    mc = _yx_source_counts_from_rows('master_order')
                    by_name = {}
                    for c in items or []:
                        name = (c.get('name') or c.get('customer_name') or '').strip()
                        if name: by_name[name] = dict(c)
                    for name, ct in list(oc.items()) + list(mc.items()):
                        row = by_name.setdefault(name, {'name': name, 'customer_name': name, 'region': resolve_customer_region(name, ct.get('region') or '北區')})
                        rc = dict(row.get('relation_counts') or {})
                        cnt = dict(row.get('counts') or {})
                        if name in oc:
                            rc['order_rows'] = oc[name]['rows']; rc['order_qty'] = oc[name]['qty']; cnt['orders'] = {'rows': oc[name]['rows'], 'qty': oc[name]['qty']}
                        if name in mc:
                            rc['master_rows'] = mc[name]['rows']; rc['master_qty'] = mc[name]['qty']; cnt['master_order'] = {'rows': mc[name]['rows'], 'qty': mc[name]['qty']}
                        row['relation_counts'] = rc; row['counts'] = cnt
                        row['row_count'] = int(rc.get('order_rows') or 0) + int(rc.get('master_rows') or 0)
                        row['item_count'] = row['row_count']
                        row['total_qty'] = int(rc.get('order_qty') or 0) + int(rc.get('master_qty') or 0)
                    items = list(by_name.values())
                    items.sort(key=lambda c: ({'北區':1,'中區':2,'南區':3}.get(c.get('region'),9), c.get('name') or c.get('customer_name') or ''))
                except Exception as e:
                    try: log_error('v452_customers_relation_merge', str(e))
                    except Exception: pass
            payload = dict(success=True, items=items, source_filter=source_filter, server_cache=API_SCHEMA_VERSION)
            if (request.args.get('fast') == '1' or request.args.get('light') == '1'):
                _fast_cache_set(cache_key, payload)
            return jsonify(payload)
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        row, resolved_name, _resolved_uid = resolve_customer_identity(name, (data.get('customer_uid') or '').strip(), include_archived=True)
        name = name or resolved_name
        if resolved_name and resolved_name != name and not (data.get('force_new') or False):
            name = resolved_name
        if not name:
            return error_response("請輸入客戶名稱")
        preserve_existing = bool(data.get('preserve_existing', True))
        requested_region = (data.get("region") or "").strip()
        effective_region = requested_region if (not preserve_existing and requested_region in ["北區", "中區", "南區"]) else resolve_customer_region(name, requested_region)
        item = upsert_customer(
            name,
            phone=(data.get("phone") or "").strip(),
            address=(data.get("address") or "").strip(),
            notes=(data.get("notes") or "").strip(),
            common_materials=(data.get("common_materials") or "").strip(),
            common_sizes=(data.get("common_sizes") or "").strip(),
            region=effective_region,
            preserve_existing=preserve_existing
        )
        log_action(current_username(), f"儲存客戶 {name}")
        add_audit_trail(current_username(), 'upsert', 'customer_profiles', name, before_json=row or {}, after_json=dict(data, effective_region=effective_region))
        notify_sync_event(kind='refresh', module='all', message=f'客戶已更新：{name}', extra={'customer_name': name, 'region': effective_region, 'sync_version': API_SCHEMA_VERSION, 'cache_bust': API_SCHEMA_VERSION})
        return jsonify(customer_profile_write_payload(name, item=item, mode='upsert', extra={'region': effective_region}))
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
        notify_sync_event(kind='refresh', module='all', message=f'客戶已確實寫入：{name}', extra={'customer_name': name, 'region': item.get('region') if isinstance(item, dict) else region, 'sync_version': API_SCHEMA_VERSION, 'cache_bust': API_SCHEMA_VERSION})
        return jsonify(customer_profile_write_payload(name, item=item, mode='ensure', extra={'region': item.get('region') if isinstance(item, dict) else region}))
    except Exception as e:
        log_error('customers_ensure', str(e))
        return error_response('客戶確實寫入失敗')


@app.route("/api/recover/customers-from-relations", methods=["POST", "GET"])
@login_required_json
def api_recover_customers_from_relations():
    """Formal service helper retained for stable mainfile behavior."""
    result = recover_customer_profiles_from_relation_tables()
    if not result.get('success'):
        return error_response(result.get('error') or '客戶救援失敗')
    log_action(current_username(), f"customer recovery 客戶救援：補回 {result.get('recovered_count', 0)} 位客戶，對齊 {result.get('synced_rows', 0)} 筆")
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
        notify_sync_event(kind='refresh', module='all', message=f'客戶已復原：{target_name}', extra={'customer_name': target_name, 'sync_version': API_SCHEMA_VERSION, 'cache_bust': API_SCHEMA_VERSION})
        return jsonify(customer_profile_write_payload(target_name, item=item, mode='restore'))
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
        audit_service_safe_side_effect('customer_move_log', log_action, current_username(), f"移動客戶 {name} 到 {region}")
        audit_service_safe_side_effect('customer_move_audit', add_audit_trail, current_username(), 'move', 'customer_profiles', name, before_json=(row or {'name': name, 'region': before_region}), after_json={'name': name, 'region': region})
        audit_service_safe_side_effect('customer_move_notify', notify_sync_event, kind="refresh", module="all", message=f"客戶已移動：{name} -> {region}", extra={"customer_name": name, "region": region, "sync_version": API_SCHEMA_VERSION, "cache_bust": API_SCHEMA_VERSION})
        return jsonify(customer_profile_write_payload(name, item=item, mode='move', extra={'region': region, 'before_region': before_region}))
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
                requested_region = (data.get('region') or '').strip()
                if requested_region in ['北區', '中區', '南區']:
                    cur.execute(sql("UPDATE customer_profiles SET name = ?, region = ?, updated_at = ? WHERE name = ?"), (new_name, requested_region, now(), name))
                else:
                    cur.execute(sql("UPDATE customer_profiles SET name = ?, updated_at = ? WHERE name = ?"), (new_name, now(), name))
                cur.execute(sql("UPDATE inventory SET customer_name = ?, customer_uid = ?, updated_at = ? WHERE customer_name = ?"), (new_name, source.get('customer_uid') or '', now(), name))
                cur.execute(sql("UPDATE orders SET customer_name = ?, customer_uid = ?, updated_at = ? WHERE customer_name = ?"), (new_name, source.get('customer_uid') or '', now(), name))
                cur.execute(sql("UPDATE master_orders SET customer_name = ?, customer_uid = ?, updated_at = ? WHERE customer_name = ?"), (new_name, source.get('customer_uid') or '', now(), name))
                cur.execute(sql("UPDATE shipping_records SET customer_name = ?, customer_uid = ? WHERE customer_name = ?"), (new_name, source.get('customer_uid') or '', name))
                conn.commit()
                try:
                    sync_customer_name_in_warehouse(name, new_name)
                except Exception as wh_sync_err:
                    try: log_error('rename_customer_warehouse_sync_v228', str(wh_sync_err))
                    except Exception: pass
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()
            item = get_customer(new_name, include_archived=True)
            log_action(current_username(), f"修改客戶名稱 {name} -> {new_name}")
            add_audit_trail(current_username(), 'rename', 'customer_profiles', name, before_json={'name': name}, after_json={'name': new_name})
            notify_sync_event(kind="refresh", module="all", message=f"客戶已改名：{name} -> {new_name}", extra={"customer_name": new_name, "old_customer_name": name, "new_customer_name": new_name, "region": (data.get('region') or ''), "sync_version": API_SCHEMA_VERSION, "cache_bust": API_SCHEMA_VERSION})
            return jsonify(customer_profile_write_payload(new_name, old_customer_name=name, item=item, mode='rename', extra={'counts': get_customer_relation_counts(new_name), 'region': (item or {}).get('region') or (data.get('region') or '')}))
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
            notify_sync_event(kind='refresh', module='all', message=f"客戶已{'封存' if mode == 'archived' else '刪除'}：{name}", extra={'customer_name': name, 'mode': mode, 'sync_version': API_SCHEMA_VERSION, 'cache_bust': API_SCHEMA_VERSION})
            message = '客戶已刪除' if mode == 'deleted' else '客戶已有關聯資料，已改為封存保留歷史資料'
            return jsonify(customer_profile_write_payload(name, item=result.get('item') or {}, mode=mode, extra={'counts': counts, 'message': message, 'archived_customer_name': name}))
        except Exception as e:
            log_error("delete_customer", str(e))
            return error_response(f"客戶刪除失敗：{str(e)}")
    row, resolved_name, _resolved_uid = resolve_customer_identity(name, request.args.get('customer_uid') or '', include_archived=True)
    name = resolved_name or name
    if not row:
        return error_response("找不到客戶", 404)
    return jsonify(success=True, item=row, counts=get_customer_relation_counts(name))


# ============================================================
# V131 warehouse lightweight server cache / column response helpers
# - Browser still uses no-store for API.  This is only a very short in-memory
#   cache to avoid rebuilding the whole warehouse on repeated page opens.
# - Any warehouse write invalidates the cache immediately.
# ============================================================
_WAREHOUSE_API_CACHE = {"at": 0.0, "payload": None}

def _warehouse_cache_get(max_age=120.0):
    try:
        payload = _WAREHOUSE_API_CACHE.get('payload')
        if payload and (time.time() - float(_WAREHOUSE_API_CACHE.get('at') or 0)) <= max_age:
            return json.loads(json.dumps(payload, ensure_ascii=False))
    except Exception:
        pass
    return None

def _warehouse_cache_set(payload):
    try:
        # V426: keep the server in-memory cache, but never replace a non-empty
        # warehouse cache with an empty readback.  This prevents a transient DB/read
        # issue from making every cell look empty for the next 120 seconds.
        old = _WAREHOUSE_API_CACHE.get('payload')
        old_total = _warehouse_payload_item_total((old or {}).get('cells') or [])[0] if isinstance(old, dict) else 0
        next_total = _warehouse_payload_item_total((payload or {}).get('cells') or [])[0] if isinstance(payload, dict) else 0
        if int(next_total or 0) <= 0 and int(old_total or 0) > 0:
            return
        _WAREHOUSE_API_CACHE['payload'] = json.loads(json.dumps(payload, ensure_ascii=False))
        _WAREHOUSE_API_CACHE['at'] = time.time()
    except Exception:
        pass

def _warehouse_cache_clear():
    try:
        _WAREHOUSE_API_CACHE['payload'] = None
        _WAREHOUSE_API_CACHE['at'] = 0.0
    except Exception:
        pass
    # V197: any warehouse write changes the unplaced list and may affect the shipping dropdown / today panel.
    # Keep the existing fast-cache architecture, but clear only derived buckets so no stale A/B/unplaced counts survive.
    try:
        _fast_cache_clear('warehouse_available|')
        _fast_cache_clear('warehouse_source_qty_map|')
        _fast_cache_clear('customer_items|')
        _fast_cache_clear('customers|')
        _fast_cache_clear('ship_customers|')
        _fast_cache_clear('ship_items|')
        _fast_cache_clear('today_changes|')
        _fast_cache_clear('today_unplaced|')
        set_setting('today_unplaced_cache_' + API_SCHEMA_VERSION, '')
        set_setting('today_unplaced_cache_v197', '')
        set_setting('today_unplaced_cache_v196', '')
    except Exception:
        pass

def _warehouse_source_qty_map_for_client():
    """Frontend overstock/deduct map: key = product_exact_or_size::customer, value = source qty.
    This comes from inventory + orders + master_orders using the same quantity parser as warehouse validation.
    """
    try:
        totals, _details = warehouse_source_totals()
        out = {}
        for key, qty in (totals or {}).items():
            try:
                product, customer = key
                out[f"{product}::{warehouse_customer_key(customer)}"] = int(qty or 0)
            except Exception:
                continue
        return out
    except Exception as e:
        try: log_error('warehouse_source_qty_map_for_client', str(e))
        except Exception: pass
        return {}



def _warehouse_cell_items_for_count(cell):
    try:
        raw = []
        if isinstance(cell, dict):
            if isinstance(cell.get('items'), list):
                raw = cell.get('items') or []
            else:
                txt = cell.get('items_json') or '[]'
                raw = json.loads(txt) if isinstance(txt, str) else (txt or [])
        if not isinstance(raw, list):
            return []
        out = []
        for it in raw:
            if not isinstance(it, dict):
                continue
            product = str(it.get('product_text') or it.get('product') or it.get('product_size') or it.get('display_product_size') or it.get('base_product_size') or it.get('size') or it.get('size_text') or it.get('dimension') or it.get('dimensions') or it.get('raw_text') or it.get('label') or it.get('title') or it.get('detail') or it.get('description') or it.get('goods_text') or it.get('item_text') or it.get('content') or '').strip()
            if not product:
                continue
            try:
                q = int(it.get('qty') or it.get('quantity') or it.get('pieces') or it.get('count') or it.get('piece_count') or effective_product_qty(product, 1) or 1)
            except Exception:
                q = 1
            if q > 0:
                out.append(it)
        return out
    except Exception:
        return []

def _warehouse_payload_item_total(cells):
    total = 0
    nonempty = 0
    for cell in cells or []:
        arr = _warehouse_cell_items_for_count(cell)
        if arr:
            nonempty += 1
            for it in arr:
                product = str(it.get('product_text') or it.get('product') or it.get('product_size') or it.get('display_product_size') or it.get('base_product_size') or it.get('size') or it.get('size_text') or it.get('dimension') or it.get('dimensions') or it.get('raw_text') or it.get('label') or it.get('title') or it.get('detail') or it.get('description') or it.get('goods_text') or it.get('item_text') or it.get('content') or '').strip()
                try:
                    total += max(1, int(it.get('qty') or it.get('quantity') or it.get('pieces') or effective_product_qty(product, 1) or 1))
                except Exception:
                    total += 1
    return int(total), int(nonempty)

def _warehouse_payload_from_cells(cells, include_source_qty=False):
    zones = {"A": {}, "B": {}}
    safe_cells = []
    for cell in cells or []:
        try:
            row = dict(cell or {})
            # V425: API display safety. If DB row has legacy items_json, always expose parsed items.
            parsed_items = _warehouse_cell_items_for_count(row)
            if parsed_items and not isinstance(row.get('items'), list):
                try:
                    raw_items = json.loads(row.get('items_json') or '[]')
                    row['items'] = raw_items if isinstance(raw_items, list) else parsed_items
                except Exception:
                    row['items'] = parsed_items
            z = (row.get('zone') or 'A').strip().upper()
            if z not in ('A','B'):
                z = 'A'
            row['zone'] = z
            c = int(row.get('column_index') or 1)
            n = int(row.get('slot_number') or 1)
            row['column_index'] = c
            row['slot_number'] = n
            safe_cells.append(row)
            zones.setdefault(z, {}).setdefault(c, {})[n] = row
        except Exception:
            pass
    item_total, nonempty_count = _warehouse_payload_item_total(safe_cells)
    payload = dict(success=True, zones=zones, cells=safe_cells, cache_version=API_SCHEMA_VERSION, cache_policy=API_SCHEMA_VERSION,
                   warehouse_item_total=item_total, warehouse_nonempty_cell_count=nonempty_count,
                   warehouse_confirmed_empty=(item_total == 0 and nonempty_count == 0))
    if include_source_qty:
        payload['source_qty_map'] = _warehouse_source_qty_map_for_client()
    return payload

def _warehouse_client_item_key(item):
    try:
        it = item or {}
        src = str(it.get('source_id') or it.get('id') or it.get('row_id') or '').strip()
        customer = str(it.get('customer_name') or it.get('customer') or '').strip()
        product = format_product_text_height2(str(it.get('product_text') or it.get('product') or it.get('product_size') or it.get('display_product_size') or it.get('base_product_size') or it.get('size') or it.get('size_text') or it.get('dimension') or it.get('dimensions') or it.get('raw_text') or it.get('label') or it.get('title') or it.get('detail') or it.get('description') or it.get('goods_text') or it.get('item_text') or it.get('content') or it.get('memo') or it.get('remark') or it.get('desc') or it.get('name') or it.get('text') or it.get('value') or '')).strip()
        material = str(it.get('material') or it.get('product_code') or '').strip()
        return '|'.join([src, customer, material, product])
    except Exception:
        return ''

def _warehouse_client_cell_signature(cell):
    try:
        raw = cell.get('items') if isinstance(cell, dict) else None
        if raw is None:
            raw = json.loads((cell or {}).get('items_json') or '[]')
        if not isinstance(raw, list):
            raw = []
        keys = [_warehouse_client_item_key(x) for x in raw if isinstance(x, dict)]
        keys = [x for x in keys if x]
        base = '|'.join([str((cell or {}).get('id') or ''), str((cell or {}).get('zone') or ''), str((cell or {}).get('column_index') or ''), str((cell or {}).get('slot_number') or ''), '||'.join(sorted(keys))])
        return hashlib.sha1(base.encode('utf-8')).hexdigest()[:16]
    except Exception:
        return ''


def _warehouse_consistency_item_compare_key(item):
    """Lightweight client/server compare key for warehouse final consistency checks.
    It is intentionally tolerant: it compares the fields that affect counts/display, not every UI-only field.
    """
    try:
        it = item or {}
        customer = warehouse_customer_key(str(it.get('customer_name') or it.get('customer') or '庫存'))
        material = str(it.get('material') or it.get('product_code') or '').strip().upper()
        product = format_product_text_height2(str(it.get('product_text') or it.get('product') or it.get('product_size') or it.get('display_product_size') or it.get('base_product_size') or it.get('size') or it.get('size_text') or it.get('dimension') or it.get('dimensions') or it.get('raw_text') or it.get('label') or it.get('title') or it.get('detail') or it.get('description') or it.get('goods_text') or it.get('item_text') or it.get('content') or it.get('memo') or it.get('remark') or it.get('desc') or it.get('name') or it.get('text') or it.get('value') or '')).strip()
        exact = warehouse_item_exact_key(product) or warehouse_item_display_size(product)
        source = str(it.get('source') or it.get('source_table') or '').strip()
        source_id = str(it.get('source_id') or it.get('id') or it.get('row_id') or '').strip()
        qty = int(float(it.get('qty') or it.get('unplaced_qty') or it.get('available_qty') or it.get('remaining_qty') or effective_product_qty(product, 1) or 0))
        return '|'.join([customer, material, exact, source, source_id, str(max(qty, 0))])
    except Exception:
        return ''

def _warehouse_cell_compare_signature(cell):
    try:
        raw = []
        if isinstance(cell, dict):
            if isinstance(cell.get('items'), list):
                raw = cell.get('items') or []
            else:
                raw = json.loads(cell.get('items_json') or '[]')
        if not isinstance(raw, list):
            raw = []
        keys = sorted([k for k in (_warehouse_consistency_item_compare_key(x) for x in raw if isinstance(x, dict)) if k])
        note = str((cell or {}).get('note') or '').strip()
        return hashlib.sha1(json.dumps({'items': keys, 'note': note}, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()[:20]
    except Exception:
        return ''

def _warehouse_available_light_summary():
    """Cheap final-check totals. Full available item rendering stays in /api/warehouse/available-items."""
    try:
        source_totals, _details = warehouse_source_totals()
        placed_all = warehouse_placed_totals()
        source_total = int(sum(int(v or 0) for v in (source_totals or {}).values()))
        placed_total = int(sum(int(v or 0) for v in (placed_all or {}).values()))
        return {'source_total': source_total, 'placed_total': placed_total, 'unplaced_total': max(0, source_total - placed_total)}
    except Exception as e:
        try: log_error('warehouse_available_light_summary_v282', str(e))
        except Exception: pass
        return {'source_total': 0, 'placed_total': 0, 'unplaced_total': 0, 'degraded': True}

def _warehouse_enrich_cell_client_meta(cell):
    row = dict(cell or {})
    try:
        row['cell_id'] = row.get('id') or row.get('cell_id') or ''
        row['client_signature'] = _warehouse_client_cell_signature(row)
    except Exception:
        pass
    return row

def _warehouse_column_payload(zone, column_index, operation_id=None, **extra):
    z = (zone or 'A').strip().upper()
    c = int(column_index or 1)
    col_cells = [_warehouse_enrich_cell_client_meta(x) for x in warehouse_get_column_cells(z, c)]
    slot_identity_map = {}
    try:
        for cell in col_cells:
            slot_identity_map[str(int(cell.get('slot_number') or 0))] = {
                'cell_id': cell.get('cell_id') or cell.get('id') or '',
                'client_signature': cell.get('client_signature') or '',
                'slot_number': int(cell.get('slot_number') or 0),
            }
    except Exception:
        slot_identity_map = {}
    try:
        column_signature = hashlib.sha1(json.dumps([
            {
                'slot_number': int((cell or {}).get('slot_number') or 0),
                'cell_id': (cell or {}).get('cell_id') or (cell or {}).get('id') or '',
                'client_signature': (cell or {}).get('client_signature') or _warehouse_client_cell_signature(cell),
            }
            for cell in col_cells
        ], ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()[:20]
    except Exception:
        column_signature = ''
    # V272: every warehouse structure write returns DB readback metadata and stable slot identities.
    # Frontend uses this to resolve old slot numbers after insert/delete compaction without a full renderer.
    payload = dict(
        success=True, operation_id=operation_id, partial=True, zone=z, column_index=c,
        column_cells=col_cells, db_readback=True, readback_count=len(col_cells),
        slot_identity_map=slot_identity_map, column_revision=int(time.time()*1000), column_signature=column_signature,
        warehouse_stability=API_SCHEMA_VERSION, cache_bust=API_SCHEMA_VERSION, sync_version=API_SCHEMA_VERSION
    )
    try:
        payload['available_summary'] = _warehouse_available_light_summary()
    except Exception:
        pass
    payload.update(extra or {})
    return payload



# ============================================================
# V432 warehouse max repair API readback guard
# - Does not change yx_cache.js / yx_core.js / service worker / background queue.
# - API display/count parser becomes tolerant to legacy item fields and Python-ish JSON.
# - Empty server cache cannot hide DB readback; force=1 always returns direct DB-readback payload.
# ============================================================
def _warehouse_v432_text(v):
    return str(v or '').strip()

def _warehouse_v432_item_product(it):
    if not isinstance(it, dict):
        return ''
    return _warehouse_v432_text(
        it.get('product_text') or it.get('product') or it.get('product_size') or
        it.get('display_product_size') or it.get('base_product_size') or it.get('size') or
        it.get('size_text') or it.get('dimension') or it.get('dimensions') or
        it.get('raw_text') or it.get('label') or it.get('title') or it.get('detail') or
        it.get('description') or it.get('goods_text') or it.get('item_text') or
        it.get('content') or it.get('memo') or it.get('remark') or it.get('desc') or it.get('name')
    )

def _warehouse_v432_int(v, default=0):
    try:
        if isinstance(v, str):
            m = re.search(r'-?\d+', v)
            if m: return int(m.group(0))
        return int(float(v))
    except Exception:
        return default

def _warehouse_v432_qty(product, fallback=1):
    try:
        return max(1, int(effective_product_qty(product, fallback or 1)))
    except Exception:
        return max(1, _warehouse_v432_int(fallback, 1))

def _warehouse_v432_normalize_items(items):
    out=[]
    for raw in items or []:
        if isinstance(raw, (str,int,float)):
            raw={'product_text':str(raw), 'product':str(raw), 'raw_text':str(raw), 'qty':1}
        if not isinstance(raw, dict):
            continue
        product=_warehouse_v432_item_product(raw)
        if not product:
            continue
        qty=_warehouse_v432_int(raw.get('qty') or raw.get('quantity') or raw.get('pieces') or raw.get('count') or raw.get('piece_count') or raw.get('total_qty') or raw.get('件數'), 0)
        if qty<=0:
            qty=_warehouse_v432_qty(product, 1)
        row=dict(raw)
        row['product_text']=_warehouse_v432_text(row.get('product_text') or product)
        row['product']=_warehouse_v432_text(row.get('product') or product)
        row['raw_text']=_warehouse_v432_text(row.get('raw_text') or product)
        row['customer_name']=warehouse_customer_key(row.get('customer_name') or row.get('customer') or row.get('client_name') or '庫存')
        row['material']=_warehouse_v432_text(row.get('material') or row.get('product_code') or row.get('wood_type') or '')
        row['qty']=max(1, qty)
        if not row.get('placement_label') and row.get('layer_label'):
            row['placement_label']=row.get('layer_label')
        if not row.get('layer_label') and row.get('placement_label'):
            row['layer_label']=row.get('placement_label')
        out.append(row)
    try:
        return normalize_warehouse_payload_items(out)
    except Exception:
        return out

def _warehouse_v432_parse_items(raw):
    if raw in (None, ''):
        return []
    obj=raw
    if isinstance(raw, str):
        s=raw.strip()
        if not s or s.lower() in ('[]','null','none','undefined'):
            return []
        try:
            obj=json.loads(s)
        except Exception:
            try:
                obj=json.loads(s.replace("'", '"').replace('None','null').replace('True','true').replace('False','false'))
            except Exception:
                return _warehouse_v432_normalize_items([{'product_text':s,'product':s,'raw_text':s,'qty':1}])
    if isinstance(obj, dict):
        for k in ('items','products','goods','rows','data','cell_items'):
            if isinstance(obj.get(k), list):
                return _warehouse_v432_normalize_items(obj.get(k))
        return _warehouse_v432_normalize_items([obj])
    if isinstance(obj, list):
        return _warehouse_v432_normalize_items(obj)
    return []

def _warehouse_cell_items_for_count(cell):
    try:
        if not isinstance(cell, dict):
            return []
        from_items=_warehouse_v432_parse_items(cell.get('items') if isinstance(cell.get('items'), list) else [])
        from_json=_warehouse_v432_parse_items(cell.get('items_json') or [])
        combined=[]; seen=set()
        for it in (from_json + from_items):
            product=_warehouse_v432_item_product(it)
            if not product:
                continue
            k='|'.join([
                _warehouse_v432_text(it.get('source_table') or it.get('source') or ''),
                _warehouse_v432_text(it.get('source_id') or it.get('id') or it.get('row_id') or ''),
                warehouse_customer_key(it.get('customer_name') or it.get('customer') or ''),
                _warehouse_v432_text(it.get('material') or it.get('product_code') or ''),
                product,
                _warehouse_v432_text(it.get('placement_label') or it.get('layer_label') or '')
            ])
            if k in seen:
                continue
            seen.add(k); combined.append(it)
        return _warehouse_v432_normalize_items(combined)
    except Exception:
        return []

def warehouse_v432_api_display_parser_lock_version():
    return 'v453-sync_today_ship_warehouse_fix'

@app.route("/api/warehouse", methods=["GET"])
@app.route("/api/warehouse/cells", methods=["GET"])
@login_required_json
def api_warehouse():
    try:
        include_source = request.args.get('include_source_qty') == '1'
        force_fresh = str(request.args.get('force') or request.args.get('no_cache') or request.args.get('refresh') or '').strip() == '1'
        if not include_source and not force_fresh:
            cached = _warehouse_cache_get()
            if cached:
                try:
                    cached_total = int(cached.get('warehouse_item_total') or _warehouse_payload_item_total(cached.get('cells') or [])[0] or 0)
                except Exception:
                    cached_total = 0
                # V425: keep server cache, but never serve a cached empty warehouse if a readback is needed.
                # This prevents an old empty payload from hiding real DB items for 120 seconds.
                if cached_total > 0:
                    cached['server_cache'] = True
                    cached['cache_bust'] = API_SCHEMA_VERSION
                    cached['sync_version'] = API_SCHEMA_VERSION
                    return jsonify(cached)
        cells = [_warehouse_enrich_cell_client_meta(x) for x in warehouse_get_cells()]
        payload = _warehouse_payload_from_cells(cells, include_source_qty=include_source)
        payload['force_fresh'] = bool(force_fresh)
        payload['cache_bust'] = API_SCHEMA_VERSION
        payload['sync_version'] = API_SCHEMA_VERSION
        if not include_source and not force_fresh:
            # V432: keep server fast cache, but never write an empty warehouse payload over a potentially valid DB/client view.
            try:
                if int(payload.get('warehouse_item_total') or 0) > 0:
                    _warehouse_cache_set(payload)
            except Exception:
                pass
        return jsonify(payload)
    except Exception as e:
        log_error("api_warehouse", str(e))
        return jsonify(success=False, zones={"A": {}, "B": {}}, cells=[], preserve_client_cache=True, error=str(e), cache_bust=API_SCHEMA_VERSION)




@app.route("/api/warehouse/readback-diagnose", methods=["GET"])
@login_required_json
def api_warehouse_readback_diagnose():
    """V431 one-shot readback diagnosis. No polling, no cache mutation.
    Shows whether DB/API currently sees warehouse items so frontend cache is not blamed blindly.
    """
    try:
        cells = [_warehouse_enrich_cell_client_meta(x) for x in warehouse_get_cells()]
        total, nonempty = _warehouse_payload_item_total(cells)
        sample = []
        for cell in cells:
            arr = _warehouse_cell_items_for_count(cell)
            if arr:
                sample.append({
                    'zone': cell.get('zone'), 'column_index': cell.get('column_index'),
                    'slot_number': cell.get('slot_number'), 'items': arr[:3],
                    'items_json_len': len(str(cell.get('items_json') or ''))
                })
            if len(sample) >= 12:
                break
        diag_extra = {}
        try:
            diag_extra['db_mode'] = database_mode_info()
        except Exception:
            pass
        try:
            conn = get_db(); cur = conn.cursor()
            cur.execute(sql("SELECT COUNT(*) AS c FROM warehouse_cell_items"))
            diag_extra['warehouse_cell_items_count'] = int((fetchone_dict(cur) or {}).get('c') or 0)
            conn.close()
        except Exception:
            try: conn.close()
            except Exception: pass
        return jsonify(success=True, version=APP_VERSION, static_version=STATIC_VERSION, sync_version=API_SCHEMA_VERSION,
                       warehouse_item_total=total, warehouse_nonempty_cell_count=nonempty,
                       cell_count=len(cells), sample_nonempty_cells=sample, cache_mutated=False, **diag_extra)
    except Exception as e:
        log_error('warehouse_readback_diagnose_v431', str(e))
        return jsonify(success=False, error=str(e), cache_mutated=False, sync_version=API_SCHEMA_VERSION), 500

@app.route("/api/warehouse/consistency-check", methods=["POST"])
@login_required_json
def api_warehouse_consistency_check():
    """V277 one-shot final consistency check for slow network/offline recovery.
    Called only after user actions or retries; no polling/interval is introduced.
    """
    data = request.get_json(silent=True) or {}
    operation_id = str(data.get('operation_id') or '').strip()
    zone = (data.get('zone') or data.get('cell', {}).get('zone') or '').strip().upper()
    try:
        column_index = int(data.get('column_index') or data.get('col') or data.get('cell', {}).get('column_index') or 0)
    except Exception:
        column_index = 0
    try:
        slot_number = int(data.get('slot_number') or data.get('slot') or data.get('cell', {}).get('slot_number') or 0)
    except Exception:
        slot_number = 0
    client_sig = str(data.get('client_cell_signature') or '').strip()
    payload = {
        'success': True,
        'operation_id': operation_id,
        'version': API_SCHEMA_VERSION,
        'checked_at': datetime.now().isoformat(timespec='seconds'),
        'zone': zone,
        'column_index': column_index,
        'slot_number': slot_number,
    }
    try:
        cell = None
        if zone in ('A','B') and column_index > 0 and slot_number > 0:
            for row in warehouse_get_column_cells(zone, column_index):
                try:
                    if int(row.get('slot_number') or 0) == slot_number:
                        cell = row
                        break
                except Exception:
                    continue
        if cell:
            # V433: consistency-check uses the same tolerant warehouse parser as the main API.
            # A raw json.loads('[]') must not hide valid cell.items or legacy fields.
            try:
                items = _warehouse_cell_items_for_count(cell)
            except Exception:
                items = []
            server_sig = _warehouse_cell_compare_signature(cell)
            enriched = _warehouse_enrich_cell_client_meta(cell)
            enriched['items'] = items if isinstance(items, list) else []
            enriched['items_json'] = json.dumps(enriched['items'], ensure_ascii=False)
            enriched['compare_signature'] = server_sig
            enriched['explicit_empty_saved'] = bool((not enriched['items']) and str((cell or {}).get('note') or '').startswith('__YX_EMPTY_SAVED__'))
            payload.update({
                'cell_found': True,
                'cell_signature': server_sig,
                'client_cell_signature': client_sig,
                'cell_consistent': (not client_sig or client_sig == server_sig),
                'server_cell': enriched,
                'server_item_count': len(enriched['items']),
            })
        else:
            payload.update({
                'cell_found': False,
                'cell_signature': '',
                'client_cell_signature': client_sig,
                'cell_consistent': (not client_sig),
                'server_cell': None,
            })
        payload['available_summary'] = _warehouse_available_light_summary()
        payload['warehouse_stability'] = API_SCHEMA_VERSION
        return jsonify(payload)
    except Exception as e:
        log_error('api_warehouse_consistency_check_v282', str(e))
        return jsonify(success=False, error='倉庫一致性檢查失敗：' + str(e)[:180], operation_id=operation_id, version=API_SCHEMA_VERSION)

@app.route("/api/warehouse/source-qty-map", methods=["GET"])
@login_required_json
def api_warehouse_source_qty_map():
    try:
        cache_key = _fast_cache_key('warehouse_source_qty_map', version=API_SCHEMA_VERSION, user=current_username())
        cached = _fast_cache_get(cache_key, 120.0) if request.args.get('fast') == '1' else None
        if cached:
            return jsonify(cached)
        payload = dict(success=True, source_qty_map=_warehouse_source_qty_map_for_client(), cache_version=API_SCHEMA_VERSION)
        if request.args.get('fast') == '1':
            _fast_cache_set(cache_key, payload)
        return jsonify(payload)
    except Exception as e:
        log_error('api_warehouse_source_qty_map', str(e))
        return jsonify(success=True, source_qty_map={}, degraded=True, error=str(e))


@app.route("/api/warehouse/cell", methods=["POST"])
@login_required_json
def api_warehouse_cell():
    data = request.get_json(silent=True) or {}
    operation_id = _yx_operation_id(data, 'warehouse_cell_save')
    cached = _yx_operation_begin(operation_id, 'warehouse_cell_save', data)
    if cached:
        return jsonify(cached)
    try:
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        slot_type = 'direct'
        slot_number = int(data.get("slot_number") or 0)
        if zone not in ("A", "B") or column_index < 1 or slot_number < 1:
            return _yx_operation_error_response(operation_id, 'warehouse_cell_save', "格位參數錯誤")
        existing_cells = warehouse_get_column_cells(zone, column_index)
        previous_cell = next((c for c in existing_cells if str(c.get('zone')) == zone and int(c.get('column_index') or 0) == column_index and int(c.get('slot_number') or 0) == slot_number), {})
        # service-line retained: mainfile behavior consolidated into formal services.
        # migrations. Do not reject it here; warehouse_save_cell will only fill missing empty
        # slots up to the operated slot and then save this exact cell. No clearing/rebuild.
        items = normalize_warehouse_payload_items(data.get("items") or [])
        validation_warning = ''
        if data.get('strict_validate') == 1 or data.get('strict_validate') == '1':
            ok, msg = validate_warehouse_cell_quantities(zone, column_index, slot_number, items)
            if not ok:
                return _yx_operation_error_response(operation_id, 'warehouse_cell_save', msg)
        note = data.get("note") or ""
        warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note)
        _warehouse_cache_clear()
        column_after = [_warehouse_enrich_cell_client_meta(x) for x in warehouse_get_column_cells(zone, column_index)]
        saved_after = next((c for c in column_after if str(c.get('zone')) == zone and int(c.get('column_index') or 0) == column_index and int(c.get('slot_number') or 0) == slot_number), None)
        if not saved_after:
            return _yx_operation_error_response(operation_id, 'warehouse_cell_save', "格位沒有確實寫入資料庫")
        try:
            saved_items = _warehouse_cell_items_for_count(saved_after)
        except Exception:
            try:
                saved_items = json.loads(saved_after.get('items_json') or '[]')
            except Exception:
                saved_items = []
        if items and not saved_items:
            # V435: DB write succeeded but immediate readback can be stale.
            # Keep the exact normalized payload in the response so the frontend never washes the visible cell empty.
            saved_items = normalize_warehouse_payload_items(items)
            saved_after = dict(saved_after or {})
            saved_after.update({'zone': zone, 'column_index': column_index, 'slot_type': 'direct', 'slot_number': slot_number, 'items': saved_items, 'items_json': json.dumps(saved_items, ensure_ascii=False), 'readback_degraded': True, 'preserve_client_cache': True})
        # service-line retained: mainfile behavior consolidated into formal services.
        # The important check is that the exact cell can be read back from DB and the saved payload is returned.
        saved_cell_payload = dict(saved_after or {})
        saved_cell_payload['items'] = saved_items
        saved_cell_payload['items_json'] = json.dumps(saved_items, ensure_ascii=False)
        saved_cell_payload['operation_id'] = operation_id
        # V431: response carries explicit saved counts so the frontend can reject
        # accidental empty readback without touching yx_cache/background queue.
        try:
            saved_cell_payload['saved_item_count'] = len(saved_items or [])
            saved_cell_payload['saved_item_total'] = int(sum(max(1, int((x or {}).get('qty') or 1)) for x in (saved_items or []) if isinstance(x, dict)))
        except Exception:
            saved_cell_payload['saved_item_count'] = len(saved_items or []) if isinstance(saved_items, list) else 0
    except Exception as e:
        log_error("warehouse_cell_main_save_v40", str(e))
        _yx_operation_finish(operation_id, 'warehouse_cell_save', {'success': False, 'error': '格位更新失敗：' + str(e)[:180], 'operation_id': operation_id, 'version': API_SCHEMA_VERSION}, error=e)
        return error_response("格位更新失敗：" + str(e)[:180])
    # Side effects must not make saved cell look failed.
    if items:
        top_customer = next((it.get('customer_name') for it in items if it.get('customer_name')), '')
        audit_service_safe_side_effect('warehouse_recent_slot', record_recent_slot, current_username(), top_customer, zone, column_index, slot_number)
    audit_service_safe_side_effect('warehouse_log', log_action, current_username(), f"更新倉庫格位 {zone}{column_index}-{slot_type}-{slot_number}")
    audit_service_safe_side_effect('warehouse_audit', add_audit_trail, current_username(), 'upsert', 'warehouse_cells', f'{zone}-{column_index}-{slot_number}', before_json={'items_json': previous_cell.get('items_json'), 'note': previous_cell.get('note')}, after_json={'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'items': items, 'note': note})
    audit_service_safe_side_effect('warehouse_notify', notify_sync_event, kind='refresh', module='warehouse', message='倉庫格位已更新', extra={'zone': zone, 'column_index': column_index, 'slot_number': slot_number})
    try:
        # service-line retained: mainfile behavior consolidated into formal services.
        payload = _warehouse_column_payload(zone, column_index, operation_id, saved_cell=saved_cell_payload, cache_bust=API_SCHEMA_VERSION, sync_version=API_SCHEMA_VERSION)
        _yx_operation_finish(operation_id, 'warehouse_cell_save', payload)
        return jsonify(payload)
    except Exception as e:
        log_error('warehouse_cell_response_v40', str(e))
        payload = _warehouse_column_payload(zone, column_index, operation_id, saved_cell=saved_cell_payload, cache_bust=API_SCHEMA_VERSION, sync_version=API_SCHEMA_VERSION)
        _yx_operation_finish(operation_id, 'warehouse_cell_save', payload)
        return jsonify(payload)

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


@app.route("/api/warehouse/move-cell", methods=["POST"])
@login_required_json
def api_warehouse_move_cell():
    """Formal service helper retained for stable mainfile behavior."""
    try:
        data = request.get_json(silent=True) or {}
        operation_id = _yx_operation_id(data, 'warehouse_move_cell')
        cached = _yx_operation_begin(operation_id, 'warehouse_move_cell', data)
        if cached:
            return jsonify(cached)
        from_cell = data.get('from') or {}
        to_cell = data.get('to') or {}
        items = normalize_warehouse_payload_items(data.get('items') or [])
        tz = (to_cell.get('zone') or '').strip().upper()
        tc = int(to_cell.get('column_index') or to_cell.get('col') or 0)
        ts = int(to_cell.get('slot_number') or to_cell.get('slot') or 0)
        if data.get('strict_validate') == 1 or data.get('strict_validate') == '1':
            ok, msg = validate_warehouse_cell_quantities(tz, tc, ts, items)
            if not ok:
                _yx_operation_finish(operation_id, 'warehouse_move_cell', {'success': False, 'error': msg}, error=msg)
                return error_response(msg)
        result = warehouse_move_cell_contents(from_cell, to_cell, items, from_cell.get('note') or '', to_cell.get('note') or '')
        if result and result.get('success') is False:
            msg = result.get('error') or '拖拉移動失敗'
            _yx_operation_finish(operation_id, 'warehouse_move_cell', {'success': False, 'error': msg, 'operation_id': operation_id, 'version': API_SCHEMA_VERSION}, error=msg)
            return error_response(msg)
        # V408: drag/move is a real warehouse write. Clear derived caches immediately,
        # otherwise the next page open/refresh may read the old 120s warehouse or unplaced cache
        # and look like the drag was not permanently saved.
        _warehouse_cache_clear()
        try:
            _fast_cache_clear('warehouse_available|'); _fast_cache_clear('warehouse_source_qty_map|')
            _fast_cache_clear('customer_items|'); _fast_cache_clear('customers|'); _fast_cache_clear('ship_items|')
            _fast_cache_clear('today_changes|'); _fast_cache_clear('today_unplaced|')
        except Exception:
            pass
        try:
            log_action(current_username(), f"倉庫整格拖拉 {from_cell.get('zone')}{from_cell.get('column_index') or from_cell.get('col')}-{from_cell.get('slot_number') or from_cell.get('slot')} → {to_cell.get('zone')}{to_cell.get('column_index') or to_cell.get('col')}-{to_cell.get('slot_number') or to_cell.get('slot')}")
        except Exception:
            pass
        moved_customers = []
        try:
            seen = set()
            for it in (data.get('source_cell_items') or []) + (items or []):
                name = str((it or {}).get('customer_name') or (it or {}).get('customer') or '').strip()
                if name and name not in seen:
                    seen.add(name); moved_customers.append(name)
        except Exception:
            moved_customers = []
        audit_service_safe_side_effect('warehouse_move_audit', add_audit_trail, current_username(), 'move', 'warehouse_cells', operation_id, before_json={'from': from_cell, 'source_items': data.get('source_cell_items') or []}, after_json={'to': to_cell, 'items': items})
        sync_extra = {'from': from_cell, 'to': to_cell, 'customers': moved_customers, 'count': len(items or []), 'operation_id': operation_id, 'cache_bust': API_SCHEMA_VERSION, 'sync_version': API_SCHEMA_VERSION}
        for _m in ('warehouse','ship','orders','master_order','today_changes'):
            audit_service_safe_side_effect('warehouse_move_notify_' + _m, notify_sync_event, kind='refresh', module=_m, message='倉庫拖拉移動已更新', extra=sync_extra)
        payload = {
            'success': True,
            'operation_id': operation_id,
            'partial': True,
            'from': from_cell,
            'to': to_cell,
            'from_column_cells': [_warehouse_enrich_cell_client_meta(x) for x in warehouse_get_column_cells(from_cell.get('zone'), from_cell.get('column_index') or from_cell.get('col'))],
            'to_column_cells': [_warehouse_enrich_cell_client_meta(x) for x in warehouse_get_column_cells(to_cell.get('zone'), to_cell.get('column_index') or to_cell.get('col'))],
            'moved_customers': moved_customers,
            'cache_bust': API_SCHEMA_VERSION,
            'sync_version': API_SCHEMA_VERSION,
            'warehouse_stability': API_SCHEMA_VERSION,
        }
        _yx_operation_finish(operation_id, 'warehouse_move_cell', payload)
        return jsonify(payload)
    except Exception as e:
        log_error('warehouse_move_cell_117', str(e))
        try: _yx_operation_finish(operation_id, 'warehouse_move_cell', {'success': False, 'error': str(e) or '拖拉移動失敗'}, error=e)
        except Exception: pass
        return error_response(str(e) or '拖拉移動失敗')

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
        return error_response("新增格子失敗：" + str(e)[:180])

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
            hay = f"{cell.get('zone','')} {cell.get('column_index','')} {cell.get('slot_type','')} {cell.get('slot_number','')} {it.get('product_text','')} {it.get('customer_name','')} {it.get('material','')} {it.get('product_code','')}"
            tokens = [x for x in re.split(r'\s+', q.lower()) if x]
            if not tokens or all(t in hay.lower() for t in tokens):
                cell_meta = _warehouse_enrich_cell_client_meta(cell)
                item_meta = dict(it or {})
                item_meta['client_item_key'] = _warehouse_client_item_key(item_meta)
                matched.append({
                    "cell": cell_meta, "item": item_meta,
                    "cell_id": cell_meta.get('cell_id') or cell_meta.get('id') or '',
                    "client_signature": cell_meta.get('client_signature') or '',
                    "slot_number": cell_meta.get('slot_number'), "column_index": cell_meta.get('column_index'), "zone": cell_meta.get('zone'),
                    # V386: keep nested item for warehouse, but also expose top-level fields for shipping/location buttons.
                    "customer_name": item_meta.get('customer_name') or item_meta.get('customer') or '庫存',
                    "product_text": item_meta.get('product_text') or item_meta.get('product') or '',
                    "material": item_meta.get('material') or item_meta.get('product_code') or '',
                    "qty": item_meta.get('qty') or effective_product_qty(item_meta.get('product_text') or item_meta.get('product') or '', 1),
                })
                break
    return jsonify(success=True, items=matched, cache_version=API_SCHEMA_VERSION)


def _warehouse_unplaced_snapshot(zone_filter=''):
    """V396: single source-aware unplaced calculator used by warehouse dropdown and Today Changes.

    Keep the existing warehouse source/placed helpers, but make 今日異動, A/B counts,
    出貨下拉清除, and 倉庫未入倉下拉 all read the same source_id-aware result.
    """
    zone_filter = str(zone_filter or '').strip().upper()
    if zone_filter not in ('A', 'B'):
        zone_filter = ''
    source_totals, source_details = warehouse_source_totals()
    source_id_resolver = warehouse_build_source_id_resolver(source_details)
    placed_all = warehouse_placed_totals()
    placed_detail = {}
    placed_detail_by_zone = {}
    placed_size_detail = {}
    placed_size_detail_by_zone = {}
    for cell in warehouse_get_cells():
        cell_zone = str(cell.get('zone') or '').strip().upper()
        try:
            items_in_cell = json.loads(cell.get('items_json') or '[]')
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
                        dsize = warehouse_item_size_key(dexact)
                        for placed_source_id in warehouse_resolved_placed_source_ids(dexact, dcustomer, dsource, did, source_id_resolver):
                            dkey = (dexact, dcustomer, dsource, placed_source_id)
                            placed_detail[dkey] = placed_detail.get(dkey, 0) + dq
                            placed_detail_by_zone[(dexact, dcustomer, dsource, placed_source_id, cell_zone)] = placed_detail_by_zone.get((dexact, dcustomer, dsource, placed_source_id, cell_zone), 0) + dq
                            if dsize:
                                skey = (dsize, dcustomer, dsource, placed_source_id)
                                placed_size_detail[skey] = placed_size_detail.get(skey, 0) + dq
                                placed_size_detail_by_zone[(dsize, dcustomer, dsource, placed_source_id, cell_zone)] = placed_size_detail_by_zone.get((dsize, dcustomer, dsource, placed_source_id, cell_zone), 0) + dq
                continue
            if exact and q > 0:
                dsize = warehouse_item_size_key(exact)
                for placed_source_id in warehouse_resolved_placed_source_ids(exact, customer, source_label, source_id, source_id_resolver):
                    dkey = (exact, customer, source_label, placed_source_id)
                    placed_detail[dkey] = placed_detail.get(dkey, 0) + q
                    placed_detail_by_zone[(exact, customer, source_label, placed_source_id, cell_zone)] = placed_detail_by_zone.get((exact, customer, source_label, placed_source_id, cell_zone), 0) + q
                    if dsize:
                        skey = (dsize, customer, source_label, placed_source_id)
                        placed_size_detail[skey] = placed_size_detail.get(skey, 0) + q
                        placed_size_detail_by_zone[(dsize, customer, source_label, placed_source_id, cell_zone)] = placed_size_detail_by_zone.get((dsize, customer, source_label, placed_source_id, cell_zone), 0) + q
    items = []
    zone_summary = {'A': 0, 'B': 0, 'unassigned': 0, 'total': 0}
    for detail_key, details_all in source_details.items():
        exact, customer, source_label, source_id = detail_key
        details_all = details_all or []
        size_key_for_placed = warehouse_item_size_key(exact)
        if zone_filter:
            details_for_item = [d for d in details_all if str(d.get('zone') or '').strip().upper().startswith(zone_filter)]
            total_qty = sum(int(d.get('qty') or 0) for d in details_for_item)
            # V409: A/B dropdown shows the source rows that belong to that zone,
            # but a source row is considered "already placed" once it exists in ANY warehouse zone.
            # Previous zone-only subtraction made an A-zone item reappear in A dropdown after it was
            # placed or dragged to B, which caused stale unplaced counts and duplicate selection.
            placed_qty = int(placed_detail.get((exact, customer, source_label, str(source_id)), 0) or 0)
            if placed_qty <= 0 and size_key_for_placed:
                placed_qty = int(placed_size_detail.get((size_key_for_placed, customer, source_label, str(source_id)), 0) or 0)
            if placed_qty <= 0 and size_key_for_placed:
                placed_qty = int(placed_all.get((size_key_for_placed, customer), 0) or 0)
            if placed_qty <= 0:
                placed_qty = int(placed_all.get((exact, customer), 0) or 0)
        else:
            details_for_item = details_all
            total_qty = sum(int(d.get('qty') or 0) for d in details_for_item)
            placed_qty = int(placed_detail.get((exact, customer, source_label, str(source_id)), 0) or 0)
            if placed_qty <= 0 and size_key_for_placed:
                placed_qty = int(placed_size_detail.get((size_key_for_placed, customer, source_label, str(source_id)), 0) or 0)
            if placed_qty <= 0 and size_key_for_placed:
                placed_qty = int(placed_all.get((size_key_for_placed, customer), 0) or 0)
            if placed_qty <= 0:
                placed_qty = int(placed_all.get((exact, customer), 0) or 0)
        try:
            placed_qty = min(max(0, int(placed_qty or 0)), max(0, int(total_qty or 0)))
        except Exception:
            placed_qty = 0
        unplaced_qty = max(0, int(total_qty or 0) - placed_qty)
        # Always compute global A/B/unassigned summary from the same per-source rows.
        if not zone_filter:
            row_zone = (details_all[0].get('zone') if details_all else '') or ''
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
        first = details_for_item[0] if details_for_item else (details_all[0] if details_all else {})
        product = first.get('product_text') or exact
        product = warehouse_rewrite_product_qty_for_unplaced(product, unplaced_qty)
        size = first.get('product_size') or warehouse_item_size_key(product)
        display_size = first.get('display_product_size') or warehouse_item_display_size(product) or size
        support = warehouse_support_text(product) or first.get('support_text') or ''
        material = first.get('material') or first.get('product_code') or ''
        source_qty = {source_label: int(total_qty or 0)}
        items.append({
            'type': 'unplaced',
            'action': '未錄入倉庫圖',
            'message': f"尚未加入倉庫圖：{(customer + '｜') if customer else ''}{product}｜未錄入 {unplaced_qty} 件｜來源：{source_label}{int(total_qty or 0)}",
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
            'source_qty': source_qty,
            'sources': [{'source': source_label, 'qty': int(total_qty or 0)}],
            'source_details': details_for_item,
            'source_summary': f"{source_label}{int(total_qty or 0)}",
            'needs_red': True,
        })
    items.sort(key=lambda r: (r.get('zone') or '', r.get('customer_name') or '庫存', r.get('material') or '', product_sort_tuple(r.get('product_text') or '')))
    return items, zone_summary


@app.route("/api/warehouse/available-items", methods=["GET"])
@login_required_json
def api_warehouse_available_items():
    """列出尚未放入倉庫圖的商品；V423 force=1 bypasses server fast cache for manual reload/readback checks."""
    try:
        zone_filter = (request.args.get("zone") or "").strip().upper()
        if zone_filter not in ("A", "B"):
            zone_filter = ""
        force_fresh = str(request.args.get('force') or request.args.get('no_cache') or request.args.get('refresh') or '').strip() == '1'
        cache_key = _fast_cache_key('warehouse_available', version=API_SCHEMA_VERSION, zone=zone_filter or 'ALL', user=current_username())
        if request.args.get('fast') == '1' and not force_fresh:
            cached = _fast_cache_get(cache_key, 120.0)
            if cached:
                cached['server_cache'] = True
                cached['cache_bust'] = API_SCHEMA_VERSION
                cached['sync_version'] = API_SCHEMA_VERSION
                return jsonify(cached)
        items, zone_summary = _warehouse_unplaced_snapshot(zone_filter)
        # If a caller asks for only A/B rows, still return the full A/B/unassigned summary
        # so the pill and 今日異動 use the same total numbers after a reload.
        if zone_filter:
            try:
                _all_items, full_summary = _warehouse_unplaced_snapshot('')
                if isinstance(full_summary, dict) and full_summary.get('total') is not None:
                    zone_summary = full_summary
            except Exception as _summary_err:
                try: log_error('warehouse_available_full_summary_v423', str(_summary_err))
                except Exception: pass
        payload = dict(success=True, items=items, zone=zone_filter, zone_summary=zone_summary, cache_version=API_SCHEMA_VERSION, sync_version=API_SCHEMA_VERSION, cache_bust=API_SCHEMA_VERSION, force_fresh=bool(force_fresh))
        if request.args.get('fast') == '1' and not force_fresh:
            _fast_cache_set(cache_key, payload)
        return jsonify(payload)
    except Exception as e:
        log_error("api_warehouse_available_items", str(e))
        return jsonify(success=True, items=[], zone_summary={'A': 0, 'B': 0, 'unassigned': 0, 'total': 0}, cache_version=API_SCHEMA_VERSION)


@app.route("/api/customer-items", methods=["GET"])
@login_required_json
def api_customer_items():
    try:
        ensure_runtime_initialized()
    except Exception as _yx_init_err:
        try: log_error('runtime_init_customer_items_v196', str(_yx_init_err))
        except Exception: pass
    """Customer item list used by 出貨. Keep it JSON-safe even when older DBs miss optional uid columns."""
    name = (request.args.get("name") or "").strip()
    uid = (request.args.get("customer_uid") or "").strip()
    try:
        row, resolved_name, resolved_uid = resolve_customer_identity(name, uid, include_archived=True)
        name = resolved_name or name
        uid = resolved_uid or uid or ((row or {}).get('customer_uid') or '')
    except Exception as e:
        # Do not let customer lookup failure render Flask HTML 500 into the 出貨 page.
        log_error('customer_items_resolve_identity_v189', str(e))
        row = {}
    try:
        use_customer_items_cache = (request.args.get('fast') == '1' and request.args.get('force') != '1')
        cache_key = _fast_cache_key('customer_items', version=API_SCHEMA_VERSION, customer=name, uid=uid, variants=request.args.get('variants') or '', ship_single=request.args.get('ship_single') or '', user=current_username(), qv=request.args.get('v') or request.args.get('v287') or request.args.get('v282') or request.args.get('v262') or request.args.get('v257') or request.args.get('v252') or request.args.get('v249') or request.args.get('v244') or request.args.get('v228') or request.args.get('v227') or request.args.get('v226') or request.args.get('v225') or request.args.get('v224') or request.args.get('v223') or request.args.get('v222') or request.args.get('v221') or request.args.get('v214') or request.args.get('v212') or request.args.get('v211') or request.args.get('v208') or request.args.get('v207') or request.args.get('v201') or request.args.get('v199') or request.args.get('v198') or request.args.get('v197') or request.args.get('v196') or request.args.get('v195') or request.args.get('v193') or request.args.get('v192') or '')
        if use_customer_items_cache:
            cached = _fast_cache_get(cache_key, 120.0)
            if cached:
                return jsonify(cached)
        if not name and not uid:
            return jsonify(success=True, items=[])

        conn = get_db()
        cur = conn.cursor()
        items = []

        def table_columns(table):
            try:
                if USE_POSTGRES:
                    cur.execute(sql("SELECT column_name FROM information_schema.columns WHERE table_name = ?"), (table,))
                    return {str((r.get('column_name') if isinstance(r, dict) else r[0]) or '') for r in rows_to_dict(cur)}
                cur.execute(f"PRAGMA table_info({table})")
                return {str((r.get('name') if isinstance(r, dict) else r[1]) or '') for r in rows_to_dict(cur)}
            except Exception as e:
                log_error('customer_items_table_columns_' + table, str(e))
                return set()

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
        else:
            try:
                # V195: 出貨/訂單/總單都用同一套客戶合併名稱。
                # 以前 fast=1 只查精準名稱，客戶卡顯示有筆數但點進去可能抓不到商品。
                variants = customer_merge_variants(cur, name) if name else []
            except Exception as e:
                log_error('customer_items_merge_variants_v196', str(e))
                variants = [name] if name else []

        def pull(table, source_label):
            cols = table_columns(table)
            where_parts = []
            params = []
            if uid and 'customer_uid' in cols:
                where_parts.append("customer_uid = ?")
                params.append(uid)
            if 'customer_name' in cols:
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

        try:
            source_filter = (request.args.get('source') or request.args.get('module') or '').strip()
            # V406: 訂單頁/總單頁點客戶時，明細與件數只能使用目前來源；出貨頁未帶 source 才合併三來源。
            if source_filter in ('orders', 'order'):
                pull('orders', '訂單')
            elif source_filter in ('master_order', 'master_orders', 'master'):
                pull('master_orders', '總單')
            elif source_filter in ('inventory', 'stock'):
                pull('inventory', '庫存')
            else:
                pull('orders', '訂單')
                pull('master_orders', '總單')
                pull('inventory', '庫存')
        finally:
            try: conn.close()
            except Exception: pass

        aggregated = aggregate_customer_items(items)
        for _it in aggregated:
            _it['deduct_source_label'] = customer_item_deduct_source_label(_it.get('source') or _it.get('source_label') or _it.get('source_preference'))
        payload = dict(success=True, items=aggregated, server_cache=API_SCHEMA_VERSION)
        if use_customer_items_cache:
            _fast_cache_set(cache_key, payload)
        return jsonify(payload)
    except Exception as e:
        log_error('customer_items_v189_json_safe', str(e))
        return jsonify(success=False, items=[], degraded=True, error='客戶商品讀取失敗，請重新點一次客戶或刷新頁面')


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
            notify_sync_event(kind='refresh', module='all', message='客戶商品已刪除', extra={'source': source, 'id': item_id, 'cache_bust': API_SCHEMA_VERSION})
            _clear_product_fast_cache()
            return jsonify(success=True, cache_bust=API_SCHEMA_VERSION, snapshots=product_service_snapshots(), customers=get_customers())
        product_text = format_product_text_height2((data.get("product_text") or "").strip())
        qty = normalize_item_quantity(product_text, 1)
        if not product_text:
            return error_response("請輸入商品資料")
        material = data.get("material") if "material" in data else None
        update_customer_item(source, item_id, product_text, qty, current_username(), material=material)
        log_action(current_username(), f"更新客戶商品 {source}#{item_id}")
        notify_sync_event(kind='refresh', module='all', message='客戶商品已更新', extra={'source': source, 'id': item_id, 'cache_bust': API_SCHEMA_VERSION})
        _clear_product_fast_cache()
        return jsonify(success=True, cache_bust=API_SCHEMA_VERSION, snapshots=product_service_snapshots(), customers=get_customers())
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
        # service-line retained: mainfile behavior consolidated into formal services.
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
        # service-line retained: mainfile behavior consolidated into formal services.
        grouped_sources = {}
        for it in items:
            entity = source_map.get((it.get('source') or '').strip())
            if entity:
                grouped_sources.setdefault(entity, []).append(it)
        affected_customers = sorted({str((b.get('row') or {}).get('customer_name') or '').strip() for rows0 in before_by_entity.values() for b in rows0 if str((b.get('row') or {}).get('customer_name') or '').strip()})
        affected_sources = sorted({({'inventory':'inventory','orders':'orders','master_orders':'master_order'}.get(entity, entity)) for entity in grouped_sources.keys()})
        for entity, source_items in grouped_sources.items():
            add_audit_trail(current_username(), 'update', entity, 'batch_material', before_json=before_by_entity.get(entity, []), after_json={'material': material, 'count': len(source_items), 'items': source_items})
        if not grouped_sources:
            add_audit_trail(current_username(), 'update', 'customer_items', 'batch_material', before_json=before_by_entity, after_json={'material': material, 'count': count, 'items': items})
        log_action(current_username(), f"批量套用材質 {material}，共 {count} 筆")
        notify_sync_event(kind='refresh', module='all', message='材質已批量更新', extra={'material': material, 'count': count, 'cache_bust': API_SCHEMA_VERSION, 'source':'batch_material', 'affected_customer_names': affected_customers, 'affected_sources': affected_sources})
        _clear_product_fast_cache()
        return jsonify(success=True, count=count, material=material, cache_bust=API_SCHEMA_VERSION, sync_version=API_SCHEMA_VERSION, snapshots=product_service_snapshots(), customers=get_customers(), affected_customer_names=affected_customers, affected_customers=affected_customers, affected_sources=affected_sources)
    except Exception as e:
        log_error("customer_items_batch_material", str(e))
        return error_response(str(e) or "批量材質更新失敗")



@app.route("/api/customer-items/batch-zone", methods=["POST"])
@login_required_json
def api_customer_items_batch_zone():
    """Formal service helper retained for stable mainfile behavior."""
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
        audit_service_safe_side_effect('batch_zone_audit', add_audit_trail, current_username(), "move", "customer_items", "batch_zone", before_json=touched, after_json={"zone": zone, "count": count, "items": [{"source": x.get("source"), "id": x.get("id"), "zone": zone} for x in touched]})
        audit_service_safe_side_effect('batch_zone_log', log_action, current_username(), f"批量移到 {zone} 區，共 {count} 筆")
        audit_service_safe_side_effect('batch_zone_notify', notify_sync_event, kind="refresh", module="all", message=f"商品已批量移到 {zone} 區", extra={"zone": zone, "count": count, "cache_bust": API_SCHEMA_VERSION, "source":"batch_zone"})
        _clear_product_fast_cache()
        return jsonify(success=True, count=count, zone=zone, cache_bust=API_SCHEMA_VERSION, snapshots=product_service_snapshots(), customers=get_customers())
    except Exception as e:
        log_error("customer_items_batch_zone", str(e))
        return error_response(str(e) or "批量移動 A/B 區失敗")


@app.route("/api/customer-items/batch-delete", methods=["POST"])
@login_required_json
def api_customer_items_batch_delete():
    """Formal service helper retained for stable mainfile behavior."""
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
        # service-line retained: mainfile behavior consolidated into formal services.
        grouped_sources = {}
        for before in before_items:
            entity = before.get('table')
            if entity in ('inventory', 'orders', 'master_orders'):
                grouped_sources.setdefault(entity, []).append(before)
        affected_customers = sorted({((x.get('row') or {}).get('customer_name') or '').strip() for x in before_items if ((x.get('row') or {}).get('customer_name') or '').strip()})
        affected_sources = sorted({({'inventory':'inventory','orders':'orders','master_orders':'master_order'}.get(x.get('table') or '', x.get('table') or '')) for x in before_items if x.get('table')})
        for entity, rows in grouped_sources.items():
            add_audit_trail(current_username(), "delete", entity, "batch_delete", before_json=rows, after_json={"count": len(rows)})
        if not grouped_sources:
            add_audit_trail(current_username(), "delete", "customer_items", "batch_delete", before_json=before_items, after_json={"count": deleted})
        log_action(current_username(), f"批量刪除商品，共 {deleted} 筆")
        notify_sync_event(kind="refresh", module="all", message="商品已批量刪除", extra={"count": deleted, "cache_bust": API_SCHEMA_VERSION, "source":"batch_delete", "affected_customer_names": affected_customers, "affected_sources": affected_sources})
        _clear_product_fast_cache()
        return jsonify(success=True, count=deleted, cache_bust=API_SCHEMA_VERSION, sync_version=API_SCHEMA_VERSION, snapshots=product_service_snapshots(), customers=get_customers(), affected_customer_names=affected_customers, affected_customers=affected_customers, affected_sources=affected_sources)
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
        affected_customers = sorted({(x.get('customer_name') or '').strip() for x in changed if (x.get('customer_name') or '').strip()})
        affected_sources = sorted({(x.get('source') or '').strip() for x in changed if (x.get('source') or '').strip()})
        notify_sync_event(kind="refresh", module="all", message="商品已批量編輯", extra={"count": updated, "customers": affected_customers, "affected_customer_names": affected_customers, "sources": affected_sources, "affected_sources": affected_sources, "cache_bust": API_SCHEMA_VERSION})
        _clear_product_fast_cache()
        snaps = product_service_snapshots()
        return jsonify(success=True, count=updated, items=changed, changed_items=changed, items_are_delta=True, cache_bust=API_SCHEMA_VERSION, sync_version=API_SCHEMA_VERSION, snapshots=snaps, customers=get_customers(), affected_customer_names=affected_customers, affected_customers=affected_customers, affected_sources=affected_sources)
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
    """Formal service helper retained for stable mainfile behavior."""
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
    """Formal service helper retained for stable mainfile behavior."""
    try:
        data = request.get_json(silent=True) or {}
        operation_id = _yx_operation_id(data, 'warehouse_return_unplaced')
        cached = _yx_operation_begin(operation_id, 'warehouse_return_unplaced', data)
        if cached:
            return jsonify(cached)
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        slot_number = int(data.get("slot_number") or 0)
        if zone not in ("A", "B") or column_index < 1 or slot_number < 1:
            return _yx_operation_error_response(operation_id, 'warehouse_return_unplaced', "格位參數錯誤")
        cells = warehouse_get_column_cells(zone, column_index)
        cell = next((c for c in cells if str(c.get('zone')) == zone and int(c.get('column_index') or 0) == column_index and int(c.get('slot_number') or 0) == slot_number), None)
        if not cell:
            return _yx_operation_error_response(operation_id, 'warehouse_return_unplaced', "找不到格位")
        items = safe_cell_items(cell)
        note = cell.get('note') or ''
        warehouse_save_cell(zone, column_index, 'direct', slot_number, [], note)
        _warehouse_cache_clear()
        try:
            _fast_cache_clear('orders|'); _fast_cache_clear('master_orders|'); _fast_cache_clear('customer_items|'); _fast_cache_clear('customers|'); _fast_cache_clear('warehouse_available|'); _fast_cache_clear('today_changes|'); _fast_cache_clear('today_unplaced|')
            set_setting('today_unplaced_cache_' + API_SCHEMA_VERSION, '')
            set_setting('today_unplaced_cache_v287', ''); set_setting('today_unplaced_cache_v282', ''); set_setting('today_unplaced_cache_v267', ''); set_setting('today_unplaced_cache_v262', ''); set_setting('today_unplaced_cache_v252', ''); set_setting('today_unplaced_cache_v207', ''); set_setting('today_unplaced_cache_v211', ''); set_setting('today_unplaced_cache_v214', ''); set_setting('today_unplaced_cache_v212', ''); set_setting('today_unplaced_cache_v208', ''); set_setting('today_unplaced_cache_v209', '')
        except Exception:
            pass
        log_action(current_username(), f"倉庫格位退回該格 {zone}{column_index}-{slot_number}")
        returned_customers = sorted({str((it or {}).get('customer_name') or (it or {}).get('customer') or '').strip() for it in (items or []) if str((it or {}).get('customer_name') or (it or {}).get('customer') or '').strip()})
        audit_service_safe_side_effect('warehouse_return_audit', add_audit_trail, current_username(), 'undo', 'warehouse_cells', f'{zone}-{column_index}-{slot_number}', before_json={'items': items, 'note': note}, after_json={'items': [], 'note': note, 'returned_to_unplaced': True})
        sync_extra={'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'count': len(items), 'returned_items': items, 'customers': returned_customers, 'cache_bust': API_SCHEMA_VERSION}
        for _m in ('warehouse','ship','orders','master_order','today_changes'):
            audit_service_safe_side_effect('warehouse_return_notify_' + _m, notify_sync_event, kind='refresh', module=_m, message='格位商品已回到未錄入倉庫圖', extra=sync_extra)
        payload = _warehouse_column_payload(zone, column_index, operation_id, returned_items=items)
        payload['cache_bust'] = API_SCHEMA_VERSION
        payload['returned_customers'] = returned_customers if 'returned_customers' in locals() else []
        _yx_operation_finish(operation_id, 'warehouse_return_unplaced', payload)
        return jsonify(payload)
    except Exception as e:
        log_error("warehouse_return_unplaced", str(e))
        try:
            _yx_operation_finish(operation_id, 'warehouse_return_unplaced', {'success': False, 'error': "退回該格失敗：" + str(e)[:180], 'operation_id': operation_id, 'version': API_SCHEMA_VERSION}, error=e)
        except Exception:
            pass
        return error_response("退回該格失敗：" + str(e)[:180])

@app.route("/api/warehouse/add-slot", methods=["POST"])
@login_required_json
def api_warehouse_add_slot():
    try:
        data = request.get_json(silent=True) or {}
        operation_id = _yx_operation_id(data, 'warehouse_add_slot')
        cached = _yx_operation_begin(operation_id, 'warehouse_add_slot', data)
        if cached:
            return jsonify(cached)
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        if zone not in ("A", "B") or column_index < 1:
            return _yx_operation_error_response(operation_id, 'warehouse_add_slot', "格位參數錯誤")
        slot_type = 'direct'
        insert_after = data.get("insert_after", None)
        if insert_after is None and data.get("slot_number") not in (None, ""):
            insert_after = max(0, int(data.get("slot_number")) - 1)
        slot_number = warehouse_add_slot(zone, column_index, slot_type, insert_after=insert_after)
        _warehouse_cache_clear()
        audit_service_safe_side_effect('warehouse_add_log', log_action, current_username(), f"新增格子 {zone}{column_index}-{slot_number}")
        audit_service_safe_side_effect('warehouse_add_audit', add_audit_trail, current_username(), 'create', 'warehouse_cells', f'{zone}-{column_index}-{slot_number}', before_json={}, after_json={'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'insert_after': insert_after, 'action': '新增格子'})
        audit_service_safe_side_effect('warehouse_add_notify', notify_sync_event, kind='refresh', module='warehouse', message='倉庫新增格子', extra={'zone': zone, 'column_index': column_index, 'slot_number': slot_number, 'insert_after': insert_after})
        payload = _warehouse_column_payload(zone, column_index, operation_id, slot_number=slot_number)
        _yx_operation_finish(operation_id, 'warehouse_add_slot', payload)
        return jsonify(payload)
    except Exception as e:
        log_error("warehouse_add_slot", str(e))
        try:
            _yx_operation_finish(operation_id, 'warehouse_add_slot', {'success': False, 'error': "新增格子失敗：" + str(e)[:180], 'operation_id': operation_id, 'version': API_SCHEMA_VERSION}, error=e)
        except Exception:
            pass
        return error_response("新增格子失敗：" + str(e)[:180])

@app.route("/api/warehouse/remove-slot", methods=["POST"])
@login_required_json
def api_warehouse_remove_slot():
    try:
        data = request.get_json(silent=True) or {}
        operation_id = _yx_operation_id(data, 'warehouse_remove_slot')
        cached = _yx_operation_begin(operation_id, 'warehouse_remove_slot', data)
        if cached:
            return jsonify(cached)
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        slot_number = int(data.get("slot_number") or 0)
        if zone not in ("A", "B") or column_index < 1 or slot_number < 1:
            return _yx_operation_error_response(operation_id, 'warehouse_remove_slot', "格位參數錯誤")
        slot_type = 'direct'
        result = warehouse_remove_slot(zone, column_index, slot_type, slot_number)
        if not result.get('success'):
            return _yx_operation_error_response(operation_id, 'warehouse_remove_slot', result.get('error') or '刪除格子失敗')
        _warehouse_cache_clear()
        audit_service_safe_side_effect('warehouse_remove_log', log_action, current_username(), f"刪除格子 {zone}{column_index}-{slot_number}")
        audit_service_safe_side_effect('warehouse_remove_audit', add_audit_trail, current_username(), 'delete', 'warehouse_cells', f'{zone}-{column_index}-{slot_number}', before_json={'zone': zone, 'column_index': column_index, 'slot_number': slot_number}, after_json={'action': '刪除格子'})
        audit_service_safe_side_effect('warehouse_remove_notify', notify_sync_event, kind='refresh', module='warehouse', message='倉庫刪除格子', extra={'zone': zone, 'column_index': column_index, 'slot_number': slot_number})
        payload = _warehouse_column_payload(zone, column_index, operation_id, removed_slot=slot_number)
        _yx_operation_finish(operation_id, 'warehouse_remove_slot', payload)
        return jsonify(payload)
    except Exception as e:
        log_error("warehouse_remove_slot", str(e))
        try:
            _yx_operation_finish(operation_id, 'warehouse_remove_slot', {'success': False, 'error': "刪除格子失敗：" + str(e)[:180], 'operation_id': operation_id, 'version': API_SCHEMA_VERSION}, error=e)
        except Exception:
            pass
        return error_response("刪除格子失敗：" + str(e)[:180])


@app.route("/api/warehouse/batch-add-slots", methods=["POST"])
@login_required_json
def api_warehouse_batch_add_slots():
    """Formal service helper retained for stable mainfile behavior."""
    try:
        data = request.get_json(silent=True) or {}
        operation_id = _yx_operation_id(data, 'warehouse_batch_add_slots')
        cached = _yx_operation_begin(operation_id, 'warehouse_batch_add_slots', data)
        if cached:
            return jsonify(cached)
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        count = max(1, min(80, int(data.get("count") or 1)))
        insert_after = int(data.get("insert_after") or 0)
        if zone not in ("A", "B") or column_index < 1:
            return _yx_operation_error_response(operation_id, 'warehouse_batch_add_slots', "格位參數錯誤")
        result = warehouse_batch_add_slots(zone, column_index, insert_after=insert_after, count=count)
        if not result.get('success'):
            return _yx_operation_error_response(operation_id, 'warehouse_batch_add_slots', result.get('error') or '批量新增格子失敗')
        _warehouse_cache_clear()
        first_slot = result.get('first_slot')
        last_slot = result.get('last_slot')
        audit_service_safe_side_effect('warehouse_batch_add_log', log_action, current_username(), f"批量新增格子 {zone}{column_index} x{count}")
        payload = _warehouse_column_payload(zone, column_index, operation_id, count=count, first_slot=first_slot, last_slot=last_slot, insert_after=int(data.get('insert_after') or 0), visible_count=result.get('visible_count'))
        _yx_operation_finish(operation_id, 'warehouse_batch_add_slots', payload)
        return jsonify(payload)
    except Exception as e:
        log_error("warehouse_batch_add_slots_119", str(e))
        try:
            _yx_operation_finish(operation_id, 'warehouse_batch_add_slots', {'success': False, 'error': "批量新增格子失敗：" + str(e)[:180], 'operation_id': operation_id, 'version': API_SCHEMA_VERSION}, error=e)
        except Exception:
            pass
        return error_response("批量新增格子失敗：" + str(e)[:180])

@app.route("/api/warehouse/batch-remove-slots", methods=["POST"])
@login_required_json
def api_warehouse_batch_remove_slots():
    """Formal service helper retained for stable mainfile behavior."""
    try:
        data = request.get_json(silent=True) or {}
        operation_id = _yx_operation_id(data, 'warehouse_batch_remove_slots')
        cached = _yx_operation_begin(operation_id, 'warehouse_batch_remove_slots', data)
        if cached:
            return jsonify(cached)
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index") or 0)
        slot_number = int(data.get("slot_number") or 0)
        count = max(1, min(80, int(data.get("count") or 1)))
        requested_slots = data.get("slots") or []
        if zone not in ("A", "B") or column_index < 1 or slot_number < 1:
            return _yx_operation_error_response(operation_id, 'warehouse_batch_remove_slots', "格位參數錯誤")
        # V135：批量刪除改成單次 DB rewrite；不再每刪一格重寫整欄，避免慢和重新整理卡住。
        result = warehouse_batch_remove_empty_slots(zone, column_index, slot_number=slot_number, count=count, requested_slots=requested_slots)
        if not result.get('success'):
            return _yx_operation_error_response(operation_id, 'warehouse_batch_remove_slots', result.get('error') or '批量刪除空格失敗')
        removed = int(result.get('removed') or 0)
        empty_slots = result.get('removed_slots') or []
        _warehouse_cache_clear()
        audit_service_safe_side_effect('warehouse_batch_remove_log', log_action, current_username(), f"批量刪除空格 {zone}{column_index}-{slot_number} x{removed}")
        payload = _warehouse_column_payload(zone, column_index, operation_id, requested=count, removed=removed, removed_slots=empty_slots, visible_count=result.get('visible_count'))
        _yx_operation_finish(operation_id, 'warehouse_batch_remove_slots', payload)
        return jsonify(payload)
    except Exception as e:
        log_error("warehouse_batch_remove_slots_119", str(e))
        try:
            _yx_operation_finish(operation_id, 'warehouse_batch_remove_slots', {'success': False, 'error': "批量刪除空格失敗：" + str(e)[:180], 'operation_id': operation_id, 'version': API_SCHEMA_VERSION}, error=e)
        except Exception:
            pass
        return error_response("批量刪除空格失敗：" + str(e)[:180])


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
        _clear_product_fast_cache()
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
    """V396: Today Changes reads exactly the same source-aware unplaced list as warehouse dropdown."""
    try:
        items, _zone = _warehouse_unplaced_snapshot('')
        return items
    except Exception as e:
        try: log_error('today_unplaced_all_sources_v396', str(e))
        except Exception: pass
        return []


def _today_unplaced_zone_summary():
    """V396: A/B/未分區/總計與 /api/warehouse/available-items 的 zone_summary 完全一致。"""
    try:
        _items, zone = _warehouse_unplaced_snapshot('')
        out = {'A': 0, 'B': 0, 'unassigned': 0, 'total': 0}
        if isinstance(zone, dict):
            for k in out:
                try: out[k] = max(0, int(zone.get(k) or 0))
                except Exception: out[k] = 0
        out['total'] = max(out.get('total', 0), out.get('A', 0) + out.get('B', 0) + out.get('unassigned', 0))
        return out
    except Exception as e:
        try: log_error('today_unplaced_zone_summary_v396', str(e))
        except Exception: pass
        return {'A': 0, 'B': 0, 'unassigned': 0, 'total': 0}

def _today_logs_detail(today):
    # service-line retained: mainfile behavior consolidated into formal services.
    detail = {'inventory': [], 'orders': [], 'master_orders': [], 'shipping_records': []}
    try:
        conn = get_db(); cur = conn.cursor()
        specs = [
            ('inventory', "SELECT id, customer_name, product_text, material, qty, operator, created_at FROM inventory WHERE substr(COALESCE(created_at,''),1,10)=? ORDER BY id DESC LIMIT 80"),
            ('orders', "SELECT id, customer_name, product_text, material, qty, operator, created_at FROM orders WHERE substr(COALESCE(created_at,''),1,10)=? ORDER BY id DESC LIMIT 80"),
            ('master_orders', "SELECT id, customer_name, product_text, material, qty, operator, created_at FROM master_orders WHERE substr(COALESCE(created_at,''),1,10)=? ORDER BY id DESC LIMIT 80"),
            ('shipping_records', "SELECT * FROM shipping_records WHERE substr(COALESCE(shipped_at,''),1,10)=? ORDER BY id DESC LIMIT 80"),
        ]
        for k, q in specs:
            try:
                cur.execute(sql(q), (today,))
                rows = rows_to_dict(cur)
                fixed_rows = []
                for r in rows:
                    if k == 'shipping_records':
                        r = _enrich_shipping_record_for_ui(r)
                    r['created_at'] = _format_24h(r.get('created_at') or r.get('shipped_at'))
                    if not r.get('message'):
                        r['message'] = '｜'.join([x for x in [r.get('customer_name') or '', r.get('material') or '', r.get('product_text') or '', (str(r.get('qty')) + '件') if r.get('qty') not in (None,'') else '', r.get('source_summary') or ''] if x])
                    r['action'] = {'inventory':'新增庫存','orders':'新增訂單','master_orders':'新增總單','shipping_records':'出貨'}.get(k, '異動')
                    r['username'] = r.get('operator') or r.get('username') or ''
                    fixed_rows.append(r)
                detail[k] = fixed_rows
            except Exception as e:
                log_error('today_detail_' + k, str(e))
        conn.close()
    except Exception as e:
        try: log_error('today_logs_detail', str(e))
        except Exception: pass
    return detail


def _today_unplaced_cached(force=False):
    # V192: normal 今日異動開啟時如果沒有當日快取，必須計算一次；
    # 不能直接回 0，否則圖二的 A/B/未分區/總計會永遠空白。
    import json as _json
    cache_key = 'today_unplaced_cache_' + API_SCHEMA_VERSION
    if not force:
        try:
            raw = get_setting(cache_key, '') or ''
            if raw:
                obj = _json.loads(raw)
                if obj.get('date') == _today_key():
                    return obj.get('items') or [], obj.get('zone') or {'A':0,'B':0,'unassigned':0,'total':0}
        except Exception as e:
            try: log_error('today_unplaced_cache_read_v217', str(e))
            except Exception: pass
    try:
        # V396: compute once so list and A/B totals cannot disagree.
        items, zone = _warehouse_unplaced_snapshot('')
    except Exception as e:
        try: log_error('today_unplaced_compute_v396', str(e))
        except Exception: pass
        items, zone = [], {'A':0,'B':0,'unassigned':0,'total':0}
    try:
        zone_for_cache = dict(zone or {})
        zone_for_cache['_row_count'] = len(items or [])
        set_setting(cache_key, _json.dumps({'date': _today_key(), 'items': items[:200], 'zone': zone_for_cache}, ensure_ascii=False))
    except Exception as e:
        try: log_error('today_unplaced_cache_save_v217', str(e))
        except Exception: pass
    return items, zone


def _today_changes_payload(force_unplaced=False):
    conn = get_db()
    cur = conn.cursor()
    today = _today_key()
    cur.execute(sql("SELECT id, username, action, created_at FROM logs WHERE substr(created_at,1,10)=? ORDER BY created_at DESC LIMIT 80"), (today,))
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
    try:
        unplaced_total_qty = int((zone_summary or {}).get('total') or 0)
    except Exception:
        unplaced_total_qty = 0
    if unplaced_total_qty <= 0:
        unplaced_total_qty = sum(int(x.get('unplaced_qty') or x.get('qty') or 0) for x in unplaced)

    return {
        'summary': {
            'inbound_count': len(inbound),
            'new_order_count': len(new_orders),
            'new_master_count': len(new_masters),
            'outbound_count': len(outbound),
            'unplaced_count': unplaced_total_qty,
            'unplaced_row_count': int((zone_summary or {}).get('_row_count') or len(unplaced)),
            'unplaced_zone_summary': {k: v for k, v in (zone_summary or {}).items() if not str(k).startswith('_')},
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


@app.route('/api/today-changes/count', methods=['GET'])
@app.route('/api/today-changes/badge', methods=['GET'])
@login_required_json
def api_today_changes_count():
    """Lightweight badge endpoint. V396 can optionally include warehouse-unplaced totals using the same cached source-aware summary as Today/warehouse."""
    try:
        today = _today_key()
        conn = get_db(); cur = conn.cursor()
        cur.execute(sql("SELECT COUNT(*) AS c FROM logs WHERE substr(created_at,1,10)=?"), (today,))
        row = cur.fetchone()
        try:
            total = int(row['c'] if not USE_POSTGRES else row[0])
        except Exception:
            total = int(row[0] or 0)
        read_at = get_setting('today_changes_read_at', '') or ''
        unread = total
        if read_at and str(read_at).startswith(today):
            try:
                cur.execute(sql("SELECT COUNT(*) AS c FROM logs WHERE substr(created_at,1,10)=? AND created_at > ?"), (today, read_at))
                row2 = cur.fetchone()
                unread = int(row2['c'] if not USE_POSTGRES else row2[0])
            except Exception:
                unread = 0
        conn.close()
        payload = dict(success=True, total=total, unread=unread, today=today, read_at=read_at, version=API_SCHEMA_VERSION, cache_bust=API_SCHEMA_VERSION)
        if str(request.args.get('include_unplaced') or '').lower() in ('1','true','yes'):
            try:
                _items, zone = _today_unplaced_cached(False)
                zone = zone or {'A':0,'B':0,'unassigned':0,'total':0}
                payload['unplaced_count'] = int(zone.get('total') or 0)
                payload['unplaced_row_count'] = int(zone.get('_row_count') or len(_items or []))
                payload['unplaced_zone_summary'] = {k:v for k,v in zone.items() if not str(k).startswith('_')}
            except Exception as e:
                try: log_error('today_changes_count_unplaced_v396', str(e))
                except Exception: pass
                payload['unplaced_count'] = 0
                payload['unplaced_row_count'] = 0
                payload['unplaced_zone_summary'] = {'A':0,'B':0,'unassigned':0,'total':0}
        return jsonify(payload)
    except Exception as e:
        log_error('today_changes_count', str(e))
        return jsonify(success=True, total=0, unread=0, today=_today_key(), version=API_SCHEMA_VERSION, cache_bust=API_SCHEMA_VERSION)

@app.route('/api/today-changes', methods=['GET'])
@login_required_json
def api_today_changes():
    try:
        ensure_runtime_initialized()
    except Exception as _yx_init_err:
        try: log_error('runtime_init_today_changes_v249', str(_yx_init_err))
        except Exception: pass
    # V139: normal open uses short server fast-cache and never recomputes warehouse-unplaced unless force=1.
    force = (request.args.get('force') == '1')
    cache_key = _fast_cache_key('today_changes', version=API_SCHEMA_VERSION, user=current_username(), force='1' if force else '0')
    if not force:
        cached = _fast_cache_get(cache_key, 90.0)
        if cached:
            return jsonify(cached)
    payload = dict(success=True, version=API_SCHEMA_VERSION, **_today_changes_payload(force_unplaced=force))
    if not force:
        _fast_cache_set(cache_key, payload)
    return jsonify(payload)

@app.route('/api/today-changes/read', methods=['POST'])
@login_required_json
def api_today_changes_mark_read():
    try:
        set_setting('today_changes_read_at', now())
        _fast_cache_clear('today_changes|')
        _fast_cache_clear('today_unplaced|')
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
        _fast_cache_clear('today_changes|')
        _fast_cache_clear('today_unplaced|')
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
    # V135: streaming sync is opt-in only. Older auto-SSE clients must not occupy
    # Render workers/threads and make normal page/API requests appear stuck.
    if request.args.get('enable') != '1':
        return jsonify(success=True, disabled=True, reason='sse_opt_in_v135')
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


# service-line retained: mainfile behavior consolidated into formal services.
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

AUDIT_VISIBLE_ENTITY_TYPES = {'inventory', 'orders', 'master_orders', 'shipping_records', 'warehouse_cells', 'customer_profiles', 'customer_items'}
AUDIT_VISIBLE_ACTION_TYPES = {'create', 'update', 'delete', 'move', 'ship', 'transfer', 'upsert'}

@app.route('/api/audit-trails', methods=['GET'])
@login_required_json
def api_audit_trails():
    """Formal service helper retained for stable mainfile behavior."""
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
        if raw_entity not in AUDIT_VISIBLE_ENTITY_TYPES:
            continue
        if raw_action and raw_action not in AUDIT_VISIBLE_ACTION_TYPES:
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
@app.route('/api/report', methods=['GET'])
@login_required_json
def api_reports_export():
    report_type = (request.args.get('type') or 'inventory').strip()
    start_date = (request.args.get('start_date') or request.args.get('start') or '').strip()
    end_date = (request.args.get('end_date') or request.args.get('end') or '').strip()
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
            if (item.get('entity_type') or '').strip() not in AUDIT_VISIBLE_ENTITY_TYPES:
                continue
            if (item.get('action_type') or '').strip() and (item.get('action_type') or '').strip() not in AUDIT_VISIBLE_ACTION_TYPES:
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
@app.route('/api/undo', methods=['POST'])
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
    force = str(request.args.get('force') or '').lower() in ('1', 'true', 'yes')
    if force:
        ensure_runtime_initialized()
    try:
        db_info = database_mode_info() if force else {'mode': 'deferred', 'source': 'health_fast'}
    except Exception as e:
        db_info = {'mode': 'unknown', 'source': 'error', 'error': str(e)[:200]}
    try:
        db_counts = table_counts() if force else {}
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

@app.route('/api/health/db-init')
def api_health_db_init():
    # V350: explicit DB init diagnostic that never hides the real startup error.
    try:
        ok = ensure_runtime_initialized()
    except Exception as e:
        ok = False
        try: log_error('health_db_init_v351', str(e))
        except Exception: pass
    try:
        info = database_mode_info()
    except Exception as e:
        info = {'mode': 'unknown', 'error': str(e)[:300]}
    try:
        counts = table_counts() if ok else {}
    except Exception as e:
        counts = {'_error': str(e)[:300]}
    return jsonify(success=bool(ok), ready=bool(ok), version=APP_VERSION, static_version=STATIC_VERSION, db_info=info, db_counts=counts, startup_error=(STARTUP_DB_ERROR or '')[:800])


@app.route("/api/native-shell/config", methods=["GET"])
def api_native_shell_config():
    return jsonify(success=True, backend_url=request.host_url.rstrip("/"), allowed_origins=["capacitor://localhost", "http://localhost", "https://localhost", "ionic://localhost", "app://localhost", "null"], app_name="沅興木業")


# service-line retained: mainfile behavior consolidated into formal services.
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
            _clear_product_fast_cache()
            _v211_clear_cross_function_cache(row.get('customer_name') or '')
            if _yx145_fast_write_requested({}):
                return jsonify(_yx145_write_payload(('orders' if table=='orders' else 'master_order'), row.get('customer_name') or '', item={'id': item_id, 'deleted': True}))
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
            # service-line retained: mainfile behavior consolidated into formal services.
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
        _clear_product_fast_cache()
        _v211_clear_cross_function_cache(customer_name)
        if _yx145_fast_write_requested(data):
            return jsonify(_yx145_write_payload(('orders' if table=='orders' else 'master_order'), customer_name, item={'id': item_id, 'product_text': product_text, 'qty': qty, 'material': material, 'location': location}))
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
            # service-line retained: mainfile behavior consolidated into formal services.
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
        target_source = 'master_order' if target in ('master_order', 'master_orders') else ('orders' if target == 'orders' else ('inventory' if target == 'inventory' else 'ship'))
        affected_names = []
        if customer_name:
            affected_names.append(customer_name)
        try:
            affected_names.extend([n for n in (result_payload.get('affected_customer_names') or result_payload.get('customer_names') or []) if n and n not in affected_names])
        except Exception:
            pass
        moved_row = {'source': source_label, 'target': target_label, 'id': item_id, 'product_text': product_text, 'qty': qty, 'customer_name': customer_name}
        sync_extra = {'source': source_label, 'source_table': source_table, 'target': target_label, 'target_source': target_source, 'customer_name': customer_name, 'customer_names': affected_names, 'product_text': product_text, 'qty': qty, 'cache_bust': API_SCHEMA_VERSION, 'sync_version': API_SCHEMA_VERSION}
        for _m in ('inventory', 'orders', 'master_order', 'ship', 'warehouse', 'today_changes'):
            notify_sync_event(kind='refresh', module=_m, message=f'{source_label}已移到{target_label}', extra=sync_extra)
        transfer_extra = dict(result_payload or {})
        transfer_extra.update({'message': f'已從{source_label}移到{target_label}', 'customer_name': customer_name, 'target': target_label, 'target_label': target_label})
        payload = _yx416_transfer_refresh_payload(source_table, target_source, affected_names, [moved_row], extra=transfer_extra)
        return jsonify(payload)
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
            audit_service_safe_side_effect('upsert_inventory_customer', upsert_customer, customer_name, region=resolve_customer_region(customer_name, data.get('region')))
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
        affected_names = []
        for r in moved_rows:
            n = (r.get('customer_name') or '').strip()
            if n and n not in affected_names:
                affected_names.append(n)
        affected_tables = []
        for it in items:
            src_info = _fix28_table_for_source(it.get('source'))
            if src_info and src_info[0] not in affected_tables:
                affected_tables.append(src_info[0])
        affected_tables.append('master_orders' if target == 'master_order' else target)
        affected_sources = []
        for t in affected_tables:
            k = _yx416_source_key_from_table(t)
            if k and k not in affected_sources:
                affected_sources.append(k)
        sync_extra = {'count': len(moved_rows), 'target': target_label, 'target_source': target, 'affected_customer_names': affected_names, 'customer_names': affected_names, 'affected_sources': affected_sources, 'cache_bust': API_SCHEMA_VERSION, 'sync_version': API_SCHEMA_VERSION}
        for _m in ('inventory', 'orders', 'master_order', 'ship', 'warehouse', 'today_changes'):
            notify_sync_event(kind='refresh', module=_m, message=f'商品已批量轉入{target_label}', extra=sync_extra)
        payload = _yx416_transfer_refresh_payload(affected_tables[0] if affected_tables else '', target, affected_names, moved_rows, extra={'count': len(moved_rows), 'errors': errors, 'affected_sources': affected_sources, 'target': target_label, 'target_label': target_label})
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


# service-line retained: mainfile behavior consolidated into formal services.
# Static files are versioned with ?v=119 and controlled only by add_cache_headers().
def sync_service_static_cache_headers_disabled(resp):
    return resp



# ============================================================
# service-line retained: mainfile behavior consolidated into formal services.
# Primary DB writes for create / edit / move / ship must never fail just because
# logs, audit trails, notification snapshots, or sync events fail on old schemas.
# Route functions resolve globals at runtime, so these wrappers protect all existing
# endpoints without changing their button/events/UI flow.
# ============================================================
audit_service_raw_log_action = log_action
audit_service_raw_add_audit_trail = add_audit_trail
sync_service_raw_notify_sync_event = notify_sync_event

def audit_service_silent_side_effect(label, fn, *args, **kwargs):
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
    return audit_service_silent_side_effect('log_action', audit_service_raw_log_action, username, action)

def add_audit_trail(*args, **kwargs):
    return audit_service_silent_side_effect('add_audit_trail', audit_service_raw_add_audit_trail, *args, **kwargs)

def notify_sync_event(*args, **kwargs):
    return audit_service_silent_side_effect('notify_sync_event', sync_service_raw_notify_sync_event, *args, **kwargs)


# ============================================================
# service-line retained: mainfile behavior consolidated into formal services.
# ============================================================
@app.route('/api/warehouse/mark-cell', methods=['POST'])
@login_required_json
def api_warehouse_mark_cell():
    try:
        data = request.get_json(silent=True) or {}
        operation_id = _yx_operation_id(data, 'warehouse_mark_cell')
        cached = _yx_operation_begin(operation_id, 'warehouse_mark_cell', data)
        if cached:
            return jsonify(cached)
        zone = (data.get('zone') or 'A').strip().upper()
        column_index = int(data.get('column_index') or 0)
        slot_number = int(data.get('slot_number') or 0)
        marked = bool(data.get('marked'))
        result = warehouse_set_cell_mark(zone, column_index, slot_number, marked)
        if not result.get('success'):
            return _yx_operation_error_response(operation_id, 'warehouse_mark_cell', result.get('error') or '標記失敗')
        _warehouse_cache_clear()
        log_action(current_username(), f"{'標記問題格' if marked else '取消問題格標記'} {zone}{column_index}-{slot_number}")
        payload = _warehouse_column_payload(zone, column_index, operation_id, marked=marked)
        _yx_operation_finish(operation_id, 'warehouse_mark_cell', payload)
        return jsonify(payload)
    except Exception as e:
        log_error('warehouse_mark_cell', str(e))
        try:
            _yx_operation_finish(operation_id, 'warehouse_mark_cell', {'success': False, 'error': '標記格子失敗', 'operation_id': operation_id, 'version': API_SCHEMA_VERSION}, error=e)
        except Exception:
            pass
        return error_response('標記格子失敗')



# ============================================================
# service-line retained: mainfile behavior consolidated into formal services.
# ============================================================
@app.route('/api/sync-changes', methods=['GET'])
@login_required_json
def api_sync_changes():
    """Return changed rows for mobile IndexedDB cache.
    This endpoint only reads data and never mutates warehouse_cells.
    """
    try:
        changed_after = (request.args.get('changed_after') or '').strip()
        tables = [x.strip() for x in (request.args.get('tables') or 'inventory,orders,master_orders,shipping_records,today_changes').split(',') if x.strip()]
        allowed = {'inventory','orders','master_orders','shipping_records','today_changes'}
        conn = get_db(); cur = conn.cursor(); out = {}
        for table in tables:
            if table not in allowed:
                continue
            try:
                cur.execute(f"SELECT * FROM {table} WHERE COALESCE(updated_at, created_at, '') > ? ORDER BY COALESCE(updated_at, created_at, '') ASC LIMIT 1000", (changed_after,))
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

# service-line retained: mainfile behavior consolidated into formal services.
# - 倉庫格位目前商品由前端主檔直接編輯尺寸/支數/件數後送回 /api/warehouse/cell。
# - /api/warehouse/available-items 維持用 warehouse_placed_totals 扣除所有已入倉數量，所以下拉只列剩餘未錄入數量。


# service-line retained: mainfile behavior consolidated into formal services.

# ============================================================
# service-line retained: mainfile behavior consolidated into formal services.
# Purpose: warehouse current-item input box uses = right side as the source of qty.
# ============================================================
def warehouse_service_qty_from_product_text(product, fallback=1):
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
    # service-line retained: mainfile behavior consolidated into formal services.
    out_map = {}
    for it in items or []:
        if not isinstance(it, dict):
            continue
        product = (it.get('product_text') or it.get('product') or it.get('product_size') or it.get('display_product_size') or it.get('base_product_size') or it.get('size') or it.get('size_text') or it.get('dimension') or it.get('dimensions') or it.get('raw_text') or it.get('label') or it.get('title') or it.get('detail') or it.get('description') or it.get('goods_text') or it.get('item_text') or it.get('content') or '').strip()
        if not product:
            continue
        try:
            qty = int(it.get('qty') or it.get('quantity') or it.get('pieces') or it.get('count') or it.get('piece_count') or 1)
        except Exception:
            qty = 1
        try:
            if '=' in product:
                qty = int(effective_product_qty(product, qty))
        except Exception:
            pass
        if '=' in product:
            qty = warehouse_service_qty_from_product_text(product, qty)
        qty = max(1, qty)
        customer = warehouse_customer_key(it.get('customer_name') or it.get('customer') or '')
        material = (it.get('material') or it.get('wood_type') or '').strip()
        source_table = (it.get('source_table') or it.get('source') or '庫存').strip() or '庫存'
        source_id = str(it.get('source_id') or it.get('id') or '').strip()
        placement_label = (it.get('placement_label') or it.get('layer_label') or '前排').strip() or '前排'
        key = (warehouse_item_exact_key(product), customer, material, source_table, source_id, placement_label)
        row = out_map.get(key)
        if row:
            row['qty'] = int(row.get('qty') or 0) + qty
        else:
            row = dict(it)
            row.update({'product_text': product, 'product': product, 'qty': qty, 'customer_name': customer, 'material': material, 'source': source_table, 'source_table': source_table, 'source_id': source_id, 'placement_label': placement_label, 'layer_label': placement_label})
            out_map[key] = row
    return list(out_map.values())

# ============================================================
# service-line retained: mainfile behavior consolidated into formal services.
# Fix: editing/saving the same cell must not count that cell as already placed.
# No extra layer/timer; this replaces the global validator used by /api/warehouse/cell.
# ============================================================
def warehouse_service_same_cell(cell, zone, column_index, slot_number):
    try:
        return ((str(cell.get('zone') or '').strip().upper() == str(zone or '').strip().upper()) and
                int(cell.get('column_index') or 0) == int(column_index or 0) and
                int(cell.get('slot_number') or 0) == int(slot_number or 0))
    except Exception:
        return False


def warehouse_service_add_item_to_qty_maps(item, qty, exact_map, size_map):
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
        warehouse_service_add_item_to_qty_maps(it, None, proposed_exact, proposed_size)

    placed_exact, placed_size = {}, {}
    for cell in warehouse_get_cells():
        if warehouse_service_same_cell(cell, z, c, s):
            continue
        for it in safe_cell_items(cell):
            warehouse_service_add_item_to_qty_maps(it, None, placed_exact, placed_size)

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




# ===============================
# V119 batch4 commercial finalization: backup verify, route audit, stale operation cleanup, smoke check
# ===============================
def _yx_table_count(cur, table):
    try:
        cur.execute(sql(f"SELECT COUNT(*) AS c FROM {table}"))
        row = cur.fetchone()
        return {"ok": True, "count": int(row[0] if USE_POSTGRES else row['c'])}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.route('/api/health/smoke', methods=['GET'])
@login_required_json
def api_health_smoke():
    """Fast deploy smoke check. Read-only and safe for Render/manual verification."""
    checks = {
        'version': APP_VERSION,
        'routes': {},
        'tables': {},
        'files': {},
        'warnings': []
    }
    try:
        route_rules = sorted(str(r.rule) for r in app.url_map.iter_rules())
        required_routes = [
            '/health', '/api/health/extended', '/api/health/smoke', '/api/warehouse', '/api/warehouse/cells',
            '/api/warehouse/move-cell', '/api/ship', '/api/ship-preview', '/api/ship/preview', '/api/ship/confirm',
            '/api/today-changes/count', '/api/today-changes/badge', '/api/sync/stream', '/api/backups', '/api/backup/verify',
            '/api/report', '/api/reports/export', '/api/undo', '/api/undo-last', '/api/shipping', '/api/today', '/api/health/api-schema', '/api/health/event-flow'
        ]
        for rr in required_routes:
            checks['routes'][rr] = rr in route_rules
        conn = get_db(); cur = conn.cursor()
        for table in [
            'inventory','orders','master_orders','warehouse_cells','warehouse_cell_items',
            'operation_log','audit_trails','shipping_records','shipping_preview_snapshots',
            'sync_events','app_settings'
        ]:
            checks['tables'][table] = _yx_table_count(cur, table)
        try: conn.close()
        except Exception: pass
        for rel in ['static/yx_cache.js','static/yx_core.js','static/yx_pages/product_page_core.js','static/css/base.css','static/service-worker.js','static/manifest.webmanifest','wsgi.py','render.yaml','Procfile']:
            checks['files'][rel] = os.path.exists(rel)
        if not all(checks['routes'].values()): checks['warnings'].append('有必要 route 尚未掛上')
        if not all(v.get('ok') for v in checks['tables'].values()): checks['warnings'].append('有必要 table 尚未建立，請重新部署或執行 init_db/migration')
        if not all(checks['files'].values()): checks['warnings'].append('有必要主檔缺失')
        return jsonify(success=True, checks=checks)
    except Exception as e:
        log_error('health_smoke', str(e))
        return jsonify(success=False, error=str(e), checks=checks), 500

@app.route('/api/backup/verify', methods=['GET','POST'])
@login_required_json
def api_backup_verify():
    """Verify backup integrity without restore. Admin-only for POST/manual file verification."""
    try:
        filename = (request.args.get('filename') or '').strip()
        if request.method == 'POST':
            data = request.get_json(silent=True) or {}
            filename = (data.get('filename') or filename).strip()
        if not filename:
            latest = list_backups().get('files') or []
            filename = (latest[0].get('filename') if latest else '')
        if not filename:
            return jsonify(success=False, error='尚無備份檔可驗證')
        return jsonify(verify_backup_file(filename))
    except Exception as e:
        log_error('backup_verify', str(e))
        return jsonify(success=False, error=str(e)), 500

@app.route('/api/admin/operation-log', methods=['GET'])
@login_required_json
def api_admin_operation_log():
    if not _is_admin_user():
        return error_response('僅管理員可查看 operation_log', 403)
    limit = max(1, min(500, int(request.args.get('limit') or 120)))
    status = (request.args.get('status') or '').strip()
    try:
        conn = get_db(); cur = conn.cursor()
        if status:
            cur.execute(sql('SELECT * FROM operation_log WHERE status=? ORDER BY updated_at DESC LIMIT ?'), (status, limit))
        else:
            cur.execute(sql('SELECT * FROM operation_log ORDER BY updated_at DESC LIMIT ?'), (limit,))
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        conn.close()
        return jsonify(success=True, items=rows)
    except Exception as e:
        log_error('admin_operation_log', str(e))
        return jsonify(success=False, error=str(e)), 500

@app.route('/api/admin/operation-log/mark-stale', methods=['POST'])
@login_required_json
def api_admin_mark_stale_operations():
    if not _is_admin_user():
        return error_response('僅管理員可整理 operation_log', 403)
    data = request.get_json(silent=True) or {}
    minutes = max(5, min(1440, int(data.get('minutes') or 60)))
    try:
        conn = get_db(); cur = conn.cursor()
        # SQLite and Postgres compatible enough because updated_at is stored as yyyy-mm-dd hh:mm:ss.
        cutoff = (datetime.now() - timedelta(minutes=minutes)).strftime('%Y-%m-%d %H:%M:%S')
        cur.execute(sql("UPDATE operation_log SET status=?, error=?, updated_at=? WHERE status IN ('running','pending') AND updated_at < ?"), ('stale', 'marked stale by admin smoke cleanup', now(), cutoff))
        count = cur.rowcount if cur.rowcount is not None else 0
        conn.commit(); conn.close()
        return jsonify(success=True, marked=count, cutoff=cutoff)
    except Exception as e:
        log_error('admin_mark_stale_operations', str(e))
        return jsonify(success=False, error=str(e)), 500


# service-line retained: mainfile behavior consolidated into formal services.
def sync_service_app_marker():
    return True


@app.route('/api/health/extended', methods=['GET'])
@login_required_json
def api_health_extended():
    """Deployment smoke-test endpoint for batch3: verifies new tables/columns without mutating data."""
    out = {'success': True, 'version': APP_VERSION, 'checks': {}}
    conn = None
    try:
        conn = get_db(); cur = conn.cursor()
        checks = out['checks']
        for table in ['operation_log', 'warehouse_cell_items', 'app_settings', 'shipping_records', 'warehouse_cells']:
            try:
                cur.execute(sql(f"SELECT COUNT(*) AS c FROM {table}"))
                row = cur.fetchone(); checks[table] = {'ok': True, 'count': int(row[0] if USE_POSTGRES else row['c'])}
            except Exception as e:
                checks[table] = {'ok': False, 'error': str(e)}
        try:
            cur.execute(sql("SELECT COUNT(*) AS c FROM operation_log WHERE status NOT IN ('done','duplicate')"))
            row = cur.fetchone(); checks['pending_operations'] = int(row[0] if USE_POSTGRES else row['c'])
        except Exception as e:
            checks['pending_operations_error'] = str(e)
        try:
            cur.execute(sql("SELECT COUNT(*) AS c FROM warehouse_cells WHERE COALESCE(version,0) <= 0"))
            row = cur.fetchone(); checks['warehouse_bad_versions'] = int(row[0] if USE_POSTGRES else row['c'])
        except Exception as e:
            checks['warehouse_bad_versions_error'] = str(e)
        return jsonify(out)
    except Exception as e:
        log_error('health_extended', str(e)); return jsonify(success=False, error=str(e), version=APP_VERSION), 500
    finally:
        try:
            if conn: conn.close()
        except Exception: pass


@app.route('/api/ui/mobile-zoom-config', methods=['GET'])
@login_required_json
def api_mobile_zoom_config():
    """V125 mobile table/warehouse zoom configuration. Read-only; no renderer or polling."""
    return jsonify(success=True, version='v125-mobile-zoom', modules=['inventory','orders','master_order','warehouse'], min_scale=0.42, max_scale=1.35, default_mode='fit')


@app.route('/api/performance/status', methods=['GET'])
@login_required_json
def api_performance_status():
    """V144 lightweight performance/DB alignment diagnostic. Read-only, fast, no table scans except small counts."""
    out = {
        'success': True,
        'version': APP_VERSION,
        'static_version': STATIC_VERSION,
        'fast_cache_items': 0,
        'warehouse_cache_age_sec': None,
        'warehouse_cache_ready': False,
        'pending_operations': None,
        'db': {},
    }
    try:
        with _FAST_API_LOCK:
            out['fast_cache_items'] = len(_FAST_API_CACHE)
    except Exception:
        pass
    try:
        payload = _WAREHOUSE_API_CACHE.get('payload') if isinstance(_WAREHOUSE_API_CACHE, dict) else None
        at = float(_WAREHOUSE_API_CACHE.get('at') or 0) if isinstance(_WAREHOUSE_API_CACHE, dict) else 0
        out['warehouse_cache_ready'] = bool(payload)
        out['warehouse_cache_age_sec'] = round(time.time() - at, 2) if at else None
    except Exception:
        pass
    conn = None
    try:
        conn = get_db(); cur = conn.cursor()
        try:
            cur.execute(sql("SELECT COUNT(*) AS c FROM operation_log WHERE status IN ('queued','pending','running','retry')"))
            row = cur.fetchone(); out['pending_operations'] = int(row[0] if USE_POSTGRES else row['c'])
        except Exception as e:
            out['pending_operations_error'] = str(e)
        for table in ['inventory','orders','master_orders','warehouse_cells','warehouse_cell_items','shipping_records','today_changes']:
            try:
                cur.execute(sql(f"SELECT COUNT(*) AS c FROM {table}"))
                row = cur.fetchone(); out['db'][table] = int(row[0] if USE_POSTGRES else row['c'])
            except Exception as e:
                out['db'][table] = {'error': str(e)}
        return jsonify(out)
    except Exception as e:
        log_error('performance_status', str(e))
        return jsonify(success=False, error=str(e), version=APP_VERSION), 500
    finally:
        try:
            if conn: conn.close()
        except Exception:
            pass

@app.route('/api/performance/cache-clear-soft', methods=['POST'])
@login_required_json
def api_performance_cache_clear_soft():
    """V144 admin/manual soft cache clear. Clears server fast cache only; DB remains unchanged."""
    try:
        prefix = (request.get_json(silent=True) or {}).get('prefix')
        _fast_cache_clear(prefix or None)
        try:
            _warehouse_cache_clear()
        except Exception:
            pass
        return jsonify(success=True, cleared=True, prefix=prefix or 'all')
    except Exception as e:
        log_error('performance_cache_clear_soft', str(e))
        return jsonify(success=False, error=str(e)), 500


@app.route('/api/performance/fast-write-status', methods=['GET'])
@login_required_json
def api_performance_fast_write_status():
    """V146 read-only check for front-end fast write mode and cache queue size."""
    return jsonify(success=True, version=APP_VERSION, static_version=STATIC_VERSION, fast_write=True, write_payload='tiny', full_snapshot_after_write=False)


@app.route('/api/performance/readiness', methods=['GET'])
@login_required_json
def api_performance_readiness():
    """V146 fast readiness diagnostic: no heavy scans; tells whether slow page loads are DB, cache, or client queue related."""
    started = time.time()
    out = {
        'success': True,
        'version': APP_VERSION,
        'static_version': STATIC_VERSION,
        'checks': {},
        'cache': {},
        'recommendations': [],
    }
    try:
        with _FAST_API_LOCK:
            out['cache']['fast_api_items'] = len(_FAST_API_CACHE)
    except Exception as e:
        out['cache']['fast_api_error'] = str(e)
    try:
        payload = _WAREHOUSE_API_CACHE.get('payload') if isinstance(_WAREHOUSE_API_CACHE, dict) else None
        at = float(_WAREHOUSE_API_CACHE.get('at') or 0) if isinstance(_WAREHOUSE_API_CACHE, dict) else 0
        out['cache']['warehouse_ready'] = bool(payload)
        out['cache']['warehouse_age_sec'] = round(time.time() - at, 2) if at else None
    except Exception as e:
        out['cache']['warehouse_error'] = str(e)
    conn = None
    try:
        t0 = time.time(); conn = get_db(); out['checks']['connect_ms'] = round((time.time()-t0)*1000, 2)
        cur = conn.cursor()
        t0 = time.time(); cur.execute(sql('SELECT 1')); cur.fetchone(); out['checks']['select1_ms'] = round((time.time()-t0)*1000, 2)
        # Approximate/limited health only; avoid COUNT(*) on huge tables during normal page load.
        for table in ['inventory','orders','master_orders','warehouse_cells','warehouse_cell_items','shipping_records','today_changes','operation_log']:
            try:
                t0 = time.time()
                cur.execute(sql(f'SELECT 1 FROM {table} LIMIT 1'))
                cur.fetchone()
                out['checks'][table] = {'ok': True, 'sample_ms': round((time.time()-t0)*1000, 2)}
            except Exception as e:
                out['checks'][table] = {'ok': False, 'error': str(e)}
        try:
            t0 = time.time()
            cur.execute(sql("SELECT COUNT(*) AS c FROM operation_log WHERE status IN ('queued','pending','running','retry')"))
            row = cur.fetchone(); pending = int(row[0] if USE_POSTGRES else row['c'])
            out['checks']['pending_operations'] = pending
            out['checks']['pending_operations_ms'] = round((time.time()-t0)*1000, 2)
            if pending > 25:
                out['recommendations'].append('背景保存佇列偏多，可先開 /api/admin/operation-log 檢查卡住項目')
        except Exception as e:
            out['checks']['pending_operations_error'] = str(e)
        out['elapsed_ms'] = round((time.time()-started)*1000, 2)
        if out['checks'].get('connect_ms', 0) > 600:
            out['recommendations'].append('DB 連線偏慢，Render/資料庫可能冷啟動或連線池不足')
        if out['checks'].get('select1_ms', 0) > 300:
            out['recommendations'].append('DB 基礎查詢偏慢，先避免開頁重查全表')
        return jsonify(out)
    except Exception as e:
        log_error('performance_readiness', str(e))
        return jsonify(success=False, error=str(e), version=APP_VERSION), 500
    finally:
        try:
            if conn: conn.close()
        except Exception:
            pass

@app.route('/api/performance/prewarm-light', methods=['POST','GET'])
@login_required_json
def api_performance_prewarm_light():
    """V146 light cache prewarm. It warms only safe fast-cache endpoints and never blocks page rendering."""
    warmed = []
    errors = []
    try:
        # Do not scan all product data. Only clear stale oversized cache buckets and touch small diagnostic caches.
        _fast_cache_clear(None)
        try:
            _warehouse_cache_clear()
        except Exception:
            pass
        warmed.append('server_fast_cache_cleared')
        warmed.append('warehouse_cache_marked_stale')
        return jsonify(success=True, version=APP_VERSION, warmed=warmed, errors=errors)
    except Exception as e:
        log_error('performance_prewarm_light', str(e))
        return jsonify(success=False, error=str(e), warmed=warmed, errors=errors), 500


@app.route('/api/performance/cache-summary', methods=['GET'])
@login_required_json
def api_performance_cache_summary():
    """V147 ultra-light cache/DB pressure summary. No full table scans; used by UI diagnostics only."""
    started = time.time()
    out = {
        'success': True,
        'version': APP_VERSION,
        'static_version': STATIC_VERSION,
        'fast_cache_items': 0,
        'warehouse_cache_ready': False,
        'warehouse_cache_age_sec': None,
        'warehouse_cache_cells': 0,
        'pending_operations': None,
        'in_degraded_mode': False,
        'recommendations': [],
    }
    try:
        with _FAST_API_LOCK:
            out['fast_cache_items'] = len(_FAST_API_CACHE)
    except Exception as e:
        out['fast_cache_error'] = str(e)
    try:
        payload = _WAREHOUSE_API_CACHE.get('payload') if isinstance(_WAREHOUSE_API_CACHE, dict) else None
        at = float(_WAREHOUSE_API_CACHE.get('at') or 0) if isinstance(_WAREHOUSE_API_CACHE, dict) else 0
        out['warehouse_cache_ready'] = bool(payload)
        out['warehouse_cache_age_sec'] = round(time.time() - at, 2) if at else None
        out['warehouse_cache_cells'] = len((payload or {}).get('cells') or []) if isinstance(payload, dict) else 0
        if not payload:
            out['recommendations'].append('倉庫圖伺服器快取尚未建立；第一次開啟會較慢，之後會走 local-first 快取')
    except Exception as e:
        out['warehouse_cache_error'] = str(e)
    conn = None
    try:
        conn = get_db(); cur = conn.cursor()
        t0 = time.time(); cur.execute(sql('SELECT 1')); cur.fetchone()
        out['db_select1_ms'] = round((time.time() - t0) * 1000, 2)
        try:
            t0 = time.time()
            cur.execute(sql("SELECT COUNT(*) AS c FROM operation_log WHERE status IN ('queued','pending','running','retry')"))
            row = cur.fetchone(); out['pending_operations'] = int(row[0] if USE_POSTGRES else row['c'])
            out['operation_check_ms'] = round((time.time() - t0) * 1000, 2)
            if out['pending_operations'] and out['pending_operations'] > 20:
                out['in_degraded_mode'] = True
                out['recommendations'].append('背景保存佇列偏多，頁面會優先顯示快取並延後重資料刷新')
        except Exception as e:
            out['pending_operations_error'] = str(e)
        if out.get('db_select1_ms', 0) > 500:
            out['in_degraded_mode'] = True
            out['recommendations'].append('DB 回應偏慢，前端會用 soft-cache 先顯示資料')
    except Exception as e:
        out['db_error'] = str(e)
        out['in_degraded_mode'] = True
    finally:
        try:
            if conn: conn.close()
        except Exception:
            pass
    out['elapsed_ms'] = round((time.time() - started) * 1000, 2)
    return jsonify(out)



@app.route('/api/performance/route-prewarm', methods=['GET'])
@login_required_json
def api_performance_route_prewarm():
    """V149 guarded route prewarm: warms only one lightweight target and backs off when DB/server is busy."""
    started = time.time()
    module = (request.args.get('module') or '').strip()
    warmed = []
    errors = []
    skipped = None
    user = current_username()
    allowed, reason = _v149_prewarm_begin(user, module)
    if not allowed:
        return jsonify(success=True, version=APP_VERSION, module=module, warmed=[], skipped=reason, elapsed_ms=round((time.time()-started)*1000,2))
    try:
        # Never prewarm if the server already has plenty of hot entries; avoid cache work becoming the slowdown.
        try:
            with _FAST_API_LOCK:
                fast_items = len(_FAST_API_CACHE)
            if fast_items > 760:
                skipped = 'fast-cache-pressure'
                return jsonify(success=True, version=APP_VERSION, module=module, warmed=[], skipped=skipped, fast_api_items=fast_items, elapsed_ms=round((time.time()-started)*1000,2))
        except Exception:
            pass
        if module in ('inventory', 'products'):
            key = _fast_cache_key('inventory', user=user, limit='120', offset='0', all='')
            if not _fast_cache_get(key, 900.0):
                t0=time.time(); _fast_cache_set(key, _yx137_product_payload(grouped_inventory(), 'v149-guarded-prewarm-inventory'))
                elapsed=(time.time()-t0)*1000
                if elapsed > 900: _v149_record_slow_page('prewarm:inventory', elapsed)
            warmed.append('inventory:first120')
        elif module == 'orders':
            key = _fast_cache_key('orders', user=user, limit='120', offset='0', all='')
            if not _fast_cache_get(key, 900.0):
                t0=time.time(); _fast_cache_set(key, _yx137_product_payload(get_orders(), 'v149-guarded-prewarm-orders'))
                elapsed=(time.time()-t0)*1000
                if elapsed > 900: _v149_record_slow_page('prewarm:orders', elapsed)
            warmed.append('orders:first120')
        elif module in ('master_order', 'master_orders'):
            key = _fast_cache_key('master_orders', user=user, limit='120', offset='0', all='')
            if not _fast_cache_get(key, 900.0):
                t0=time.time(); _fast_cache_set(key, _yx137_product_payload(get_master_orders(), 'v149-guarded-prewarm-master-orders'))
                elapsed=(time.time()-t0)*1000
                if elapsed > 900: _v149_record_slow_page('prewarm:master_orders', elapsed)
            warmed.append('master_orders:first120')
        elif module in ('warehouse', 'warehouse_map'):
            if not _warehouse_cache_get():
                t0=time.time(); _warehouse_cache_set(_warehouse_payload_from_cells(warehouse_get_cells(), include_source_qty=False))
                elapsed=(time.time()-t0)*1000
                if elapsed > 900: _v149_record_slow_page('prewarm:warehouse', elapsed)
            warmed.append('warehouse:cells')
        elif module in ('today_changes', 'today'):
            warmed.append('today_changes:light-only')
        elif module in ('ship', 'shipping'):
            cache_key = _fast_cache_key('customers', user=user)
            if not _fast_cache_get(cache_key, 600.0):
                t0=time.time(); _fast_cache_set(cache_key, dict(success=True, customers=get_customers(), server_cache='v149-guarded-prewarm-customers'))
                elapsed=(time.time()-t0)*1000
                if elapsed > 900: _v149_record_slow_page('prewarm:shipping_customers', elapsed)
            warmed.append('shipping:customers')
        else:
            warmed.append('noop')
        return jsonify(success=True, version=APP_VERSION, module=module, warmed=warmed, skipped=skipped, errors=errors, elapsed_ms=round((time.time()-started)*1000,2))
    except Exception as e:
        log_error('performance_route_prewarm_v149', str(e))
        return jsonify(success=False, module=module, warmed=warmed, errors=errors, skipped=skipped, error=str(e), elapsed_ms=round((time.time()-started)*1000,2)), 500
    finally:
        _v149_prewarm_end()

@app.route('/api/performance/slow-pages', methods=['GET'])
@login_required_json
def api_performance_slow_pages():
    """V149 lightweight diagnostic: reports recent slow prewarm/page-cache work without scanning business tables."""
    try:
        with _PREWARM_GUARD['lock']:
            slow = list(_PREWARM_GUARD.get('slow') or [])[-40:]
            running = int(_PREWARM_GUARD.get('running', 0))
        with _FAST_API_LOCK:
            fast_items = len(_FAST_API_CACHE)
        return jsonify(success=True, version=APP_VERSION, static_version=STATIC_VERSION, running_prewarm=running, fast_api_items=fast_items, slow=slow)
    except Exception as e:
        log_error('performance_slow_pages', str(e))
        return jsonify(success=False, error=str(e), version=APP_VERSION), 500

@app.route('/api/performance/load-shed-status', methods=['GET'])
@login_required_json
def api_performance_load_shed_status():
    """V149 tells the client whether to avoid automatic prewarm/heavy refresh for the moment."""
    try:
        with _PREWARM_GUARD['lock']:
            running = int(_PREWARM_GUARD.get('running', 0))
            slow_count = len([r for r in (_PREWARM_GUARD.get('slow') or []) if time.time() - float(r.get('at') or 0) < 600])
        with _FAST_API_LOCK:
            fast_items = len(_FAST_API_CACHE)
        degraded = running >= 1 or fast_items > 760 or slow_count >= 4
        return jsonify(success=True, version=APP_VERSION, degraded=degraded, running_prewarm=running, fast_api_items=fast_items, recent_slow_count=slow_count)
    except Exception as e:
        log_error('performance_load_shed_status', str(e))
        return jsonify(success=False, error=str(e), version=APP_VERSION), 500


@app.route('/api/performance/network-status', methods=['GET'])
def api_performance_network_status():
    """V153 read-only network payload diagnostic for mobile speed."""
    try:
        sample = {'success': True, 'version': APP_VERSION, 'gzip_enabled': True, 'min_bytes': int(os.getenv('YX_GZIP_MIN_BYTES', '2048') or '2048'), 'level': int(os.getenv('YX_GZIP_LEVEL', '5') or '5'), 'static_version': STATIC_VERSION, 'api_cache_items': len(_FAST_API_CACHE)}
        return jsonify(sample)
    except Exception as e:
        return jsonify(success=False, error=str(e), version=APP_VERSION), 500


@app.route('/api/performance/frontload-status', methods=['GET'])
def api_performance_frontload_status():
    """V153 front-end resource loading diagnostic: confirms page-specific CSS and delayed PWA strategy."""
    try:
        return jsonify(success=True, version=APP_VERSION, static_version=STATIC_VERSION, strategy='page-specific-css+pwa-after-load', css_scope='base+page+mobile-media', api_cache_items=len(_FAST_API_CACHE))
    except Exception as e:
        return jsonify(success=False, error=str(e), version=APP_VERSION), 500


@app.route('/api/performance/boot-status', methods=['GET'])
def api_performance_boot_status():
    """V153 lightweight boot diagnostic: checks cache pressure without scanning business tables."""
    try:
        with _FAST_API_LOCK:
            fast_items = len(_FAST_API_CACHE)
        payload = {
            'success': True,
            'version': APP_VERSION,
            'static_version': STATIC_VERSION,
            'strategy': 'first-screen-boot-guard+page-specific-css+deferred-heavy-work',
            'api_cache_items': fast_items,
            'gzip_enabled': True,
            'slow_guard': True,
        }
        try:
            with _PREWARM_GUARD['lock']:
                payload['running_prewarm'] = int(_PREWARM_GUARD.get('running', 0))
                payload['recent_slow_count'] = len([r for r in (_PREWARM_GUARD.get('slow') or []) if time.time() - float(r.get('at') or 0) < 600])
        except Exception:
            payload['running_prewarm'] = None
        return jsonify(payload)
    except Exception as e:
        return jsonify(success=False, error=str(e), version=APP_VERSION), 500


@app.route('/api/performance/degrade-status', methods=['GET'])
def api_performance_degrade_status():
    """V153 lightweight diagnostic for adaptive front-end degrade mode; does not scan business tables."""
    try:
        with _FAST_API_LOCK:
            fast_items = len(_FAST_API_CACHE)
        payload = {
            'success': True,
            'version': APP_VERSION,
            'static_version': STATIC_VERSION,
            'strategy': 'adaptive-degrade-mode+slow-api-guard+no-polling',
            'api_cache_items': fast_items,
            'server_suggest_degrade': fast_items > 820,
            'notes': ['client records slow API samples locally', 'degrade mode reduces animation/shadow cost only', 'no renderer or click binding changes'],
        }
        try:
            with _PREWARM_GUARD['lock']:
                payload['running_prewarm'] = int(_PREWARM_GUARD.get('running', 0))
                payload['recent_slow_count'] = len([r for r in (_PREWARM_GUARD.get('slow') or []) if time.time() - float(r.get('at') or 0) < 600])
        except Exception:
            payload['running_prewarm'] = None
        return jsonify(payload)
    except Exception as e:
        return jsonify(success=False, error=str(e), version=APP_VERSION), 500


@app.route('/api/performance/db-request-guard-status', methods=['GET'])
def api_performance_db_request_guard_status():
    """V154 lightweight status: DB/query guard + request-timeout guard; no business-table scan."""
    try:
        payload = {
            'success': True,
            'version': APP_VERSION,
            'static_version': STATIC_VERSION,
            'strategy': 'client-request-timeout+postgres-statement-timeout+sqlite-busy-timeout',
            'db_statement_timeout_ms': int(os.getenv('DB_STATEMENT_TIMEOUT_MS', '12000') or '12000'),
            'db_idle_tx_timeout_ms': int(os.getenv('DB_IDLE_TX_TIMEOUT_MS', '15000') or '15000'),
            'client_get_timeout_ms': 9000,
            'client_write_timeout_ms': 18000,
            'notes': ['prevents slow DB queries from holding pages indefinitely', 'does not add renderer/click bindings/polling']
        }
        try:
            payload['database'] = database_mode_info()
        except Exception:
            payload['database'] = {'mode': 'unknown'}
        return jsonify(payload)
    except Exception as e:
        return jsonify(success=False, error=str(e), version=APP_VERSION), 500



@app.route('/api/performance/asset-cache-alignment-status')
def performance_asset_cache_alignment_status():
    """V155: lightweight status for HTML asset version alignment and stale-cache prevention."""
    try:
        return jsonify(success=True, version=APP_VERSION, static_version=STATIC_VERSION,
                       html_uses_context_version=True,
                       stale_asset_fix='templates use static_version instead of hardcoded v153/v154',
                       service_worker='static CSS/icons only; API no-store')
    except Exception as e:
        return jsonify(success=False, error=str(e), version=APP_VERSION), 500


@app.route('/api/warehouse/action-status', methods=['GET'])
@login_required_json
def api_warehouse_action_status():
    """V156: lightweight warehouse stability status without touching cache / speed guards."""
    try:
        return jsonify(success=True, version=APP_VERSION, static_version=STATIC_VERSION,
                       warehouse_stability='v188-delayed-save-key-guard-stability',
                       guarantees=['single-renderer','column-queued-actions','stale-response-guard','db-readback','menu-action-dedupe','column-rollback','no-api-cache-in-service-worker'])
    except Exception as e:
        log_error('warehouse_action_status_v165', str(e))
        return jsonify(success=False, error=str(e))


# V379 compatibility aliases used by older lightweight front-end helpers. Read-only, no cache-core changes.

# ============================================================
# V379 API field schema alignment guard
# Aligns JSON payload fields that the front-end already reads.
# This does not touch cache core, service worker, renderers, or polling.
# ============================================================
def _yx_v379_first_list(payload):
    try:
        for key in ('items', 'records', 'rows', 'cells', 'feed', 'logs', 'changes', 'customers', 'unplaced_items'):
            val = payload.get(key)
            if isinstance(val, list):
                return key, val
    except Exception:
        pass
    return '', None


def _yx_v379_align_api_payload(payload, status_code=200):
    if not isinstance(payload, dict):
        return payload
    out = dict(payload)
    out = yx_api_align_payload(out, success=out.get('success', int(status_code or 200) < 400))

    list_key, list_val = _yx_v379_first_list(out)
    if list_val is not None:
        # Product/order/shipping pages use different historical names.
        # Fill aliases only when absent so existing API semantics remain intact.
        out.setdefault('items', list_val)
        out.setdefault('records', list_val)
        out.setdefault('rows', list_val)
        if list_key == 'cells':
            out.setdefault('cells', list_val)

    # Keep warehouse-specific data explicit while also giving generic front-end aliases.
    if isinstance(out.get('zones'), dict):
        out.setdefault('zone_map', out.get('zones'))
    if isinstance(out.get('zone_summary'), dict):
        out.setdefault('counts', out.get('zone_summary'))
        out.setdefault('summary', out.get('zone_summary'))

    if 'counts' not in out or not isinstance(out.get('counts'), dict):
        if isinstance(out.get('summary'), dict):
            out['counts'] = dict(out.get('summary') or {})
        elif list_val is not None:
            out['counts'] = {'total': len(list_val)}
        elif 'total' in out:
            out['counts'] = {'total': out.get('total')}
        else:
            out['counts'] = {}
    if 'summary' not in out or not isinstance(out.get('summary'), dict):
        out['summary'] = dict(out.get('counts') or {})

    # Lightweight nested data wrapper for older/newer page helpers.
    if 'data' not in out or out.get('data') is None:
        data = {
            'items': out.get('items') if isinstance(out.get('items'), list) else [],
            'records': out.get('records') if isinstance(out.get('records'), list) else [],
            'rows': out.get('rows') if isinstance(out.get('rows'), list) else [],
            'cells': out.get('cells') if isinstance(out.get('cells'), list) else [],
            'counts': out.get('counts') if isinstance(out.get('counts'), dict) else {},
            'summary': out.get('summary') if isinstance(out.get('summary'), dict) else {},
            'version': APP_VERSION,
            'sync_version': API_SCHEMA_VERSION,
            'cache_bust': API_SCHEMA_VERSION,
        }
        if isinstance(out.get('zones'), dict):
            data['zones'] = out.get('zones')
        out['data'] = data
    elif isinstance(out.get('data'), dict):
        d = dict(out.get('data') or {})
        d.setdefault('version', APP_VERSION)
        d.setdefault('sync_version', API_SCHEMA_VERSION)
        d.setdefault('cache_bust', API_SCHEMA_VERSION)
        if list_val is not None:
            d.setdefault('items', out.get('items') if isinstance(out.get('items'), list) else list_val)
            d.setdefault('records', out.get('records') if isinstance(out.get('records'), list) else list_val)
            d.setdefault('rows', out.get('rows') if isinstance(out.get('rows'), list) else list_val)
        d.setdefault('counts', out.get('counts') if isinstance(out.get('counts'), dict) else {})
        d.setdefault('summary', out.get('summary') if isinstance(out.get('summary'), dict) else {})
        out['data'] = d

    return out


@app.after_request
def yx_v379_api_field_schema_alignment(response):
    """Normalize API JSON field names before cache/gzip headers are applied."""
    try:
        path = request.path or ''
        if not path.startswith('/api/'):
            return response
        # Keep this lightweight: only align the data APIs that front-end pages read directly.
        schema_paths = (
            '/api/inventory', '/api/orders', '/api/master_orders', '/api/customer-items', '/api/customer-item',
            '/api/customers', '/api/warehouse', '/api/ship', '/api/ship-preview', '/api/shipping_records',
            '/api/shipping', '/api/today-changes', '/api/today', '/api/sync-changes', '/api/health'
        )
        if not any(path.startswith(x) for x in schema_paths):
            return response
        if response.direct_passthrough or not response.is_json:
            return response
        payload = response.get_json(silent=True)
        if not isinstance(payload, dict):
            return response
        aligned = _yx_v379_align_api_payload(payload, response.status_code)
        raw = json.dumps(aligned, ensure_ascii=False, separators=(',', ':'))
        response.set_data(raw)
        response.mimetype = 'application/json'
        response.headers['Content-Length'] = str(len(raw.encode('utf-8')))
        response.headers['X-Yuanxing-Api-Schema'] = API_SCHEMA_VERSION
    except Exception as e:
        try:
            response.headers['X-Yuanxing-Api-Schema-Align-Error'] = str(e)[:120]
        except Exception:
            pass
    return response


@app.route('/api/health/api-schema', methods=['GET'])
@login_required_json
def api_health_api_schema_v386():
    """V386: lightweight API schema audit without touching cache core."""
    checks = []
    sample = {
        'success': True,
        'items': [],
        'version': APP_VERSION,
        'sync_version': API_SCHEMA_VERSION,
    }
    aligned = _yx_v379_align_api_payload(sample)
    for key in ('success','items','records','rows','data','counts','summary','version','app_version','static_version','sync_version','cache_bust','schema_version'):
        checks.append({'key': key, 'ok': key in aligned})
    return jsonify(success=all(x.get('ok') for x in checks), checks=checks, version=APP_VERSION, static_version=STATIC_VERSION, schema_version=API_SCHEMA_VERSION)

@app.route('/api/shipping', methods=['GET'])
@login_required_json
def api_shipping_alias_v386():
    return api_shipping_records()

@app.route('/api/today', methods=['GET'])
@login_required_json
def api_today_alias_v386():
    return api_today_changes()


# ============================================================
# V386 front-end event/API flow audit
# Read-only deploy check: button/event -> API -> cache clear -> sync event alignment.
# Does not touch cache core, renderers, polling, or service worker.
# ============================================================
def _yx_v386_route_exists(rule):
    try:
        rules = {str(r.rule) for r in app.url_map.iter_rules()}
        if rule in rules:
            return True
        # allow prefix forms such as /api/shipping_records/<id> for /api/shipping_records/
        if rule.endswith('/'):
            return any(str(r).startswith(rule) for r in rules)
        return False
    except Exception:
        return False


def _yx_v386_file_exists(path):
    try:
        return os.path.exists(path)
    except Exception:
        return False


@app.route('/api/health/event-flow', methods=['GET'])
@login_required_json
def api_health_event_flow_v386():
    """V386: check that major page data flows have routes/files/cache/event contracts aligned."""
    flows = [
        {
            'name': 'inventory_products',
            'page': '庫存',
            'file': 'static/yx_pages/inventory_page.js',
            'apis': ['/api/inventory', '/api/customer-items/batch-material', '/api/customer-items/batch-update', '/api/items/transfer'],
            'events': ['yx:product-data-changed', 'yx:customer-selected'],
            'cache_groups': ['products_inventory', 'customer_blocks_', 'ship_items_', 'warehouse_available_'],
        },
        {
            'name': 'orders_products',
            'page': '訂單',
            'file': 'static/yx_pages/product_page_core.js',
            'apis': ['/api/orders', '/api/customer-items', '/api/customer-items/batch-material', '/api/customer-items/batch-update', '/api/customer-items/batch-delete'],
            'events': ['yx:product-data-changed', 'yx:order-master-changed', 'yx:customer-selected'],
            'cache_groups': ['products_orders', 'customer_blocks_', 'ship_items_', 'today_changes_'],
        },
        {
            'name': 'master_order_products',
            'page': '總單',
            'file': 'static/yx_pages/product_page_core.js',
            'apis': ['/api/master_orders', '/api/customer-items', '/api/customer-items/batch-material', '/api/customer-items/batch-update', '/api/customer-items/batch-delete'],
            'events': ['yx:product-data-changed', 'yx:order-master-changed', 'yx:customer-selected'],
            'cache_groups': ['products_master_order', 'customer_blocks_', 'ship_items_', 'today_changes_'],
        },
        {
            'name': 'shipping_confirm',
            'page': '出貨',
            'file': 'static/yx_pages/shipping_page.js',
            'apis': ['/api/ship-preview', '/api/ship', '/api/customer-items', '/api/customers', '/api/warehouse/search'],
            'events': ['yx:ship-completed', 'yx:product-data-changed', 'yx:warehouse-changed', 'yx:today-changes-refresh'],
            'cache_groups': ['ship_items_', 'ship_customers_', 'customer_blocks_', 'warehouse_available_', 'today_changes_'],
        },
        {
            'name': 'warehouse_cell_ops',
            'page': '倉庫圖',
            'file': 'static/yx_pages/warehouse_page.js',
            'apis': ['/api/warehouse', '/api/warehouse/cell', '/api/warehouse/add-slot', '/api/warehouse/remove-slot', '/api/warehouse/available-items', '/api/warehouse/source-qty-map'],
            'events': ['yx:warehouse-changed', 'yx:product-data-changed', 'yx:customer-selected', 'yx:today-changes-refresh'],
            'cache_groups': ['warehouse_available_', 'warehouse_source_qty_map_', 'customer_blocks_', 'ship_items_'],
        },
    ]
    route_rules = sorted(str(r.rule) for r in app.url_map.iter_rules())
    results = []
    ok = True
    for f in flows:
        file_path = f.get('file') or ''
        file_ok = _yx_v386_file_exists(file_path)
        source_text = ''
        try:
            if file_ok:
                source_text = open(file_path, 'r', encoding='utf-8', errors='ignore').read()
        except Exception:
            source_text = ''
        # product_page_core is shared by inventory/orders/master_order, so allow shared-core evidence.
        shared_text = source_text
        if file_path != 'static/yx_pages/product_page_core.js':
            try:
                shared_text += '\n' + open('static/yx_pages/product_page_core.js', 'r', encoding='utf-8', errors='ignore').read()
            except Exception:
                pass
        api_checks = [{'route': a, 'ok': _yx_v386_route_exists(a), 'referenced_in_js': (a in shared_text)} for a in f.get('apis', [])]
        event_checks = [{'event': ev, 'referenced_in_js': (ev in shared_text)} for ev in f.get('events', [])]
        cache_checks = [{'group': cg, 'referenced_in_js': (cg in shared_text)} for cg in f.get('cache_groups', [])]
        missing = [x['route'] for x in api_checks if not x['ok']]
        flow_ok = bool(file_ok) and not missing
        ok = ok and flow_ok
        results.append({
            'name': f.get('name'),
            'page': f.get('page'),
            'file': file_path,
            'file_ok': file_ok,
            'apis': api_checks,
            'missing_apis': missing,
            'events': event_checks,
            'cache_groups': cache_checks,
            'ok': flow_ok,
        })
    return jsonify(success=ok, flows=results, route_count=len(route_rules), version=APP_VERSION, static_version=STATIC_VERSION, sync_version=API_SCHEMA_VERSION, cache_bust=API_SCHEMA_VERSION)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)

# V423: warehouse force reload/available-items force=1 bypass server fast cache for manual refresh/readback checks; column payload carries cache_bust/sync_version and light available summary. No renderer/setInterval/MutationObserver added.

# ============================================================
# V428 warehouse API display parser lock
# - No frontend cache / service-worker / queue changes.
# - API counting and readback now use the same tolerant legacy item fields as DB rescue.
# ============================================================

def _warehouse_v428_text(v):
    return str(v or '').strip()


def _warehouse_v428_product_from_item(it):
    if not isinstance(it, dict):
        return ''
    return _warehouse_v428_text(
        it.get('product_text') or it.get('product') or it.get('product_size') or
        it.get('display_product_size') or it.get('base_product_size') or it.get('size') or
        it.get('size_text') or it.get('dimension') or it.get('dimensions') or
        it.get('raw_text') or it.get('label') or it.get('title') or it.get('detail') or
        it.get('description') or it.get('goods_text') or it.get('item_text') or it.get('content')
    )


def _warehouse_v428_int(v, default=0):
    try:
        if isinstance(v, str):
            m = re.search(r'-?\d+', v)
            if m:
                return int(m.group(0))
        return int(float(v))
    except Exception:
        return default


def _warehouse_v428_qty(product, fallback=1):
    try:
        return max(1, int(effective_product_qty(product, fallback or 1)))
    except Exception:
        return max(1, _warehouse_v428_int(fallback, 1))


def _warehouse_v428_normalize_items(items):
    out = []
    for raw in items or []:
        if isinstance(raw, str):
            raw = {'product_text': raw, 'product': raw, 'raw_text': raw}
        if not isinstance(raw, dict):
            continue
        product = _warehouse_v428_product_from_item(raw)
        if not product:
            continue
        qty = _warehouse_v428_int(raw.get('qty') or raw.get('quantity') or raw.get('pieces') or raw.get('count') or raw.get('piece_count') or raw.get('total_qty'), 0)
        if qty <= 0:
            qty = _warehouse_v428_qty(product, 1)
        row = dict(raw)
        row['product_text'] = _warehouse_v428_text(row.get('product_text') or product)
        row['product'] = _warehouse_v428_text(row.get('product') or product)
        row['raw_text'] = _warehouse_v428_text(row.get('raw_text') or product)
        row['customer_name'] = _warehouse_v428_text(row.get('customer_name') or row.get('customer') or row.get('client_name') or '庫存')
        row['qty'] = max(1, qty)
        if not row.get('placement_label') and row.get('layer_label'):
            row['placement_label'] = row.get('layer_label')
        if not row.get('layer_label') and row.get('placement_label'):
            row['layer_label'] = row.get('placement_label')
        out.append(row)
    return out


def _warehouse_v428_parse_items(raw):
    if raw in (None, ''):
        return []
    obj = raw
    if isinstance(raw, str):
        s = raw.strip()
        if not s or s.lower() in ('[]','null','none','undefined'):
            return []
        try:
            obj = json.loads(s)
        except Exception:
            try:
                obj = json.loads(s.replace("'", '"').replace('None','null').replace('True','true').replace('False','false'))
            except Exception:
                return _warehouse_v428_normalize_items([{'product_text': s, 'product': s, 'raw_text': s, 'qty': 1}])
    if isinstance(obj, dict):
        for key in ('items','products','goods','rows','data'):
            if isinstance(obj.get(key), list):
                return _warehouse_v428_normalize_items(obj.get(key))
        return _warehouse_v428_normalize_items([obj])
    if isinstance(obj, list):
        return _warehouse_v428_normalize_items(obj)
    return []


def _warehouse_cell_items_for_count(cell):
    try:
        if not isinstance(cell, dict):
            return []
        from_items = _warehouse_v428_parse_items(cell.get('items') if isinstance(cell.get('items'), list) else [])
        from_json = _warehouse_v428_parse_items(cell.get('items_json') or [])
        if from_items and not from_json:
            return from_items
        if from_json and not from_items:
            return from_json
        if not from_items and not from_json:
            return []
        out = []
        seen = set()
        for it in (from_json + from_items):
            k = '|'.join([
                _warehouse_v428_text(it.get('source_table') or it.get('source') or ''),
                _warehouse_v428_text(it.get('source_id') or it.get('id') or ''),
                _warehouse_v428_text(it.get('customer_name') or ''),
                _warehouse_v428_text(it.get('material') or it.get('product_code') or ''),
                _warehouse_v428_product_from_item(it),
                _warehouse_v428_text(it.get('placement_label') or it.get('layer_label') or '')
            ])
            if k in seen:
                continue
            seen.add(k)
            out.append(it)
        return _warehouse_v428_normalize_items(out)
    except Exception:
        return []


def warehouse_v429_api_display_parser_lock_version():
    return 'v453-sync_today_ship_warehouse_fix'
