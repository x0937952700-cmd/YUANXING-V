import os
import shutil
from functools import wraps
from datetime import datetime, timedelta
from pathlib import Path
from werkzeug.utils import secure_filename
from werkzeug.exceptions import HTTPException
from flask import Flask, jsonify, render_template, request, session, send_file
ENABLE_SOCKETIO = os.environ.get('ENABLE_SOCKETIO', '0') == '1'
if ENABLE_SOCKETIO:
    try:
        from flask_socketio import SocketIO
    except Exception:
        SocketIO = None
else:
    SocketIO = None
from werkzeug.security import generate_password_hash, check_password_hash

import db as db_module
from db import init_db, fetch_all, fetch_one, execute, now_iso, json_dumps, ADMIN_NAME, DB_PATH, DATABASE_URL
from services.products import parse_product_text, normalize_product_text, total_qty_from_text
from services.customers import ensure_customer, customer_suggestions, find_customer_by_uid_or_name, VALID_REGIONS
from services.items import create_item, list_items, get_item, update_item, delete_item, normalize_table, find_duplicate_items, merge_item_qty
from services.shipping import build_preview, confirm_shipping
from services.warehouse import list_cells, update_cell, add_slot, remove_slot, placed_qty_map, available_items_from_rows, move_front, get_cell, save_undo, undo_last, find_locations
from services.audit import audit, today
from services.reports import query_rows, summary as report_summary, workbook_for
from services.maintenance import integrity_report, repair_integrity
from services.importer import parse_import_workbook, import_template_workbook

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
app.config['JSON_AS_ASCII'] = False
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_UPLOAD_SIZE', 16 * 1024 * 1024))
socketio = SocketIO(app, cors_allowed_origins='*', async_mode=os.environ.get('SOCKETIO_ASYNC_MODE', 'threading')) if SocketIO else None
STARTUP_DB_ERROR = None
# Ensure local folders exist before backup/upload endpoints use them.
(Path(app.root_path) / 'uploads').mkdir(parents=True, exist_ok=True)
(Path(app.root_path) / 'backups').mkdir(parents=True, exist_ok=True)

try:
    init_db()
except Exception as exc:
    # Render 啟動時絕對不要因資料庫舊欄位 / 暫時連線問題直接 Exit 1。
    # 首頁可先打開，/api/health 會顯示實際錯誤，登入或操作時也會回傳錯誤卡片。
    STARTUP_DB_ERROR = str(exc)
    print('YUANXING_DB_INIT_ERROR:', STARTUP_DB_ERROR, flush=True)

def emit_update(scope='all', payload=None):
    if socketio:
        socketio.emit('update', {'scope': scope, 'payload': payload or {}, 'at': now_iso()})


def ensure_db_ready():
    global STARTUP_DB_ERROR
    if STARTUP_DB_ERROR:
        try:
            init_db()
            STARTUP_DB_ERROR = None
        except Exception as exc:
            STARTUP_DB_ERROR = str(exc)
            raise RuntimeError(f'資料庫初始化失敗：{STARTUP_DB_ERROR}')


@app.before_request
def _ensure_db_before_api():
    if request.path.startswith('/api/') and request.path != '/api/health':
        ensure_db_ready()


def using_postgres():
    return bool(db_module.USE_POSTGRES)


def ok(**payload):
    out = {'success': True, 'message': payload.pop('message', '')}
    out.update(payload)
    return jsonify(out)


def fail(message, status=400):
    return jsonify({'success': False, 'error': str(message)}), status


@app.errorhandler(Exception)
def handle_error(exc):
    if isinstance(exc, HTTPException):
        return fail(exc.description or exc.name, exc.code or 500)
    try:
        execute('INSERT INTO errors(source,message,created_at) VALUES(?,?,?)', ('flask', str(exc), now_iso()))
    except Exception:
        pass
    return fail(str(exc), 500)


def current_user():
    username = session.get('username')
    if not username:
        return None
    return fetch_one('SELECT id, username, is_admin, is_blocked, created_at FROM users WHERE username=?', (username,))


def require_login(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return fail('尚未登入', 401)
        if int(user.get('is_blocked') or 0):
            session.clear()
            return fail('帳號已被封鎖', 403)
        return fn(*args, **kwargs)
    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return fail('尚未登入', 401)
        if not int(user.get('is_admin') or 0):
            return fail('需要管理員權限', 403)
        return fn(*args, **kwargs)
    return wrapper


def body():
    return request.get_json(silent=True) or request.form.to_dict() or {}


def username():
    return session.get('username', '')



@app.get('/uploads/<path:filename>')
def uploaded_file(filename):
    base = (Path(app.root_path) / 'uploads').resolve()
    safe_path = (base / filename).resolve()
    try:
        safe_path.relative_to(base)
    except Exception:
        return fail('不允許的檔案路徑', 403)
    if safe_path.exists() and safe_path.is_file():
        return send_file(safe_path)
    return fail('找不到檔案', 404)

@app.route('/')
def index():
    return render_template('app.html')


@app.post('/api/login')
def api_login():
    data = body()
    name = (data.get('username') or data.get('name') or '').strip()
    password = (data.get('password') or '').strip()
    if not name or not password:
        return fail('請輸入姓名與密碼')
    user = fetch_one('SELECT * FROM users WHERE username=?', (name,))
    if user:
        if int(user.get('is_blocked') or 0):
            return fail('帳號已被封鎖', 403)
        if not check_password_hash(user['password_hash'], password):
            return fail('密碼錯誤', 401)
    else:
        execute('INSERT INTO users(username,password_hash,is_admin,is_blocked,created_at) VALUES(?,?,?,?,?)',
                (name, generate_password_hash(password), 1 if name == ADMIN_NAME else 0, 0, now_iso()))
        user = fetch_one('SELECT * FROM users WHERE username=?', (name,))
        audit(name, 'register', 'users', name, after={'username': name})
    session['username'] = name
    return ok(user={'username': name, 'is_admin': int(user.get('is_admin') or 0)}, message='登入成功')


@app.post('/api/logout')
def api_logout():
    session.clear()
    return ok(message='已登出')


@app.get('/api/session/config')
def api_session():
    user = current_user()
    return ok(user=user, app_name='沅興木業', clean_version='full_fixed_qty15_v4_no_md')


@app.post('/api/change_password')
@require_login
def api_change_password():
    data = body()
    old = data.get('old_password') or ''
    new = data.get('new_password') or ''
    user_full = fetch_one('SELECT * FROM users WHERE username=?', (username(),))
    if not check_password_hash(user_full['password_hash'], old):
        return fail('舊密碼錯誤')
    if len(new) < 3:
        return fail('新密碼至少 3 個字')
    execute('UPDATE users SET password_hash=? WHERE username=?', (generate_password_hash(new), username()))
    audit(username(), 'change_password', 'users', username())
    return ok(message='密碼已更新')


@app.get('/api/admin/users')
@require_admin
def api_admin_users():
    return ok(items=fetch_all('SELECT id, username, is_admin, is_blocked, created_at FROM users ORDER BY id'))


@app.post('/api/admin/block')
@require_admin
def api_admin_block():
    data = body()
    target = (data.get('username') or '').strip()
    blocked = 1 if data.get('is_blocked') in (1, '1', True, 'true') else 0
    if target == ADMIN_NAME and blocked:
        return fail('不能封鎖固定管理員')
    execute('UPDATE users SET is_blocked=? WHERE username=?', (blocked, target))
    audit(username(), 'block_user' if blocked else 'unblock_user', 'users', target, after={'is_blocked': blocked})
    return ok(message='已更新使用者狀態')


@app.get('/api/product/parse')
def api_parse_product_get():
    text = request.args.get('text', '')
    return ok(items=parse_product_text(text), normalized_text=normalize_product_text(text), qty=total_qty_from_text(text))


@app.post('/api/product/parse')
def api_parse_product_post():
    text = body().get('text', '')
    return ok(items=parse_product_text(text), normalized_text=normalize_product_text(text), qty=total_qty_from_text(text))


def _attach_customer_counts(rows):
    """Attach order/master totals. 件數直接用 product_text 重算，避免舊 DB 仍存 15 件。"""
    for row in rows:
        uid = row.get('uid') or ''
        name = row.get('name') or ''
        total_qty = 0
        total_rows = 0
        for table in ('orders', 'master_orders'):
            items = fetch_all(f"""SELECT product_text, qty FROM {table}
                                WHERE (customer_uid=? AND customer_uid!='') OR customer_name=?""", (uid, name))
            total_rows += len(items)
            for item in items:
                total_qty += total_qty_from_text(item.get('product_text') or '') or int(item.get('qty') or 0)
        row['total_qty'] = total_qty
        row['total_rows'] = total_rows
    return rows


@app.get('/api/customers')
@require_login
def api_customers():
    archived = request.args.get('archived') == '1'
    rows = fetch_all('SELECT * FROM customer_profiles WHERE is_archived=? ORDER BY region, name', (1 if archived else 0,))
    return ok(items=_attach_customer_counts(rows))


@app.get('/api/customers/archived')
@require_login
def api_customers_archived():
    rows = fetch_all('SELECT * FROM customer_profiles WHERE is_archived=1 ORDER BY region, name')
    return ok(items=_attach_customer_counts(rows))


@app.post('/api/customers')
@require_login
def api_create_customer():
    data = body()
    name = (data.get('name') or '').strip()
    if not name:
        return fail('客戶名稱不可空白')
    region = data.get('region') if data.get('region') in VALID_REGIONS else '北區'
    existing = find_customer_by_uid_or_name(name=name)
    if existing:
        return ok(item=existing, message='客戶已存在')
    t = now_iso()
    created = ensure_customer(name, region=region, trade_type=data.get('trade_type') or '')
    uid = created['uid']
    fields = ['phone','address','special_notes','common_materials','common_sizes','trade_type']
    for f in fields:
        if f in data:
            execute(f'UPDATE customer_profiles SET {f}=?, updated_at=? WHERE uid=?', (data.get(f) or '', t, uid))
    item = fetch_one('SELECT * FROM customer_profiles WHERE uid=?', (uid,))
    audit(username(), 'create', 'customer_profiles', uid, after=item)
    return ok(item=item, message='客戶已建立')



@app.get('/api/customers/<path:key>')
@require_login
def api_get_customer(key):
    row = find_customer_by_uid_or_name(uid=key) or find_customer_by_uid_or_name(name=key)
    if not row:
        return fail('找不到客戶', 404)
    return ok(item=row)

@app.put('/api/customers/<uid>')
@require_login
def api_update_customer(uid):
    data = body()
    before = find_customer_by_uid_or_name(uid=uid) or find_customer_by_uid_or_name(name=uid)
    if not before:
        return fail('找不到客戶', 404)
    new_name = (data.get('name') or '').strip() if 'name' in data else ''
    if new_name:
        exists = find_customer_by_uid_or_name(name=new_name)
        if exists and exists.get('uid') != before.get('uid'):
            return fail('客戶名稱已存在，請改用不同名稱或先合併客戶資料')
        data['name'] = new_name
    allowed = {'name','phone','address','special_notes','common_materials','common_sizes','region','trade_type','is_archived'}
    sets, params = [], []
    for k, v in data.items():
        if k in allowed:
            if k == 'region' and v not in VALID_REGIONS:
                continue
            sets.append(f'{k}=?')
            params.append(v)
    sets.append('updated_at=?')
    params.append(now_iso())
    params.append(before['uid'])
    execute(f'UPDATE customer_profiles SET {",".join(sets)} WHERE uid=?', params)
    after = fetch_one('SELECT * FROM customer_profiles WHERE uid=?', (before['uid'],))
    # Sync display names to item tables when renamed.
    if data.get('name') and data.get('name') != before.get('name'):
        for table in ('inventory','orders','master_orders','shipping_records'):
            execute(f'UPDATE {table} SET customer_name=? WHERE customer_uid=?', (data.get('name'), before['uid']))
    audit(username(), 'update', 'customer_profiles', before['uid'], before=before, after=after)
    return ok(item=after, message='客戶已更新')


@app.delete('/api/customers/<uid>')
@require_login
def api_delete_customer(uid):
    row = find_customer_by_uid_or_name(uid=uid) or find_customer_by_uid_or_name(name=uid)
    if not row:
        return fail('找不到客戶')
    execute('UPDATE customer_profiles SET is_archived=1, updated_at=? WHERE uid=?', (now_iso(), row['uid']))
    audit(username(), 'archive', 'customer_profiles', row['uid'], before=row, after={'is_archived': 1})
    return ok(message='客戶已封存')


@app.post('/api/customers/<uid>/restore')
@require_login
def api_restore_customer(uid):
    row = find_customer_by_uid_or_name(uid=uid) or find_customer_by_uid_or_name(name=uid)
    if not row:
        return fail('找不到客戶')
    execute('UPDATE customer_profiles SET is_archived=0, updated_at=? WHERE uid=?', (now_iso(), row['uid']))
    return ok(message='客戶已還原')


@app.post('/api/customers/move')
@require_login
def api_customer_move():
    data = body()
    uid = data.get('customer_uid') or data.get('uid') or ''
    name = data.get('customer_name') or data.get('name') or ''
    region = data.get('region') if data.get('region') in VALID_REGIONS else ''
    if not region:
        return fail('區域必須是北區 / 中區 / 南區')
    row = find_customer_by_uid_or_name(uid=uid, name=name)
    if not row:
        return fail('找不到客戶')
    before = dict(row)
    execute('UPDATE customer_profiles SET region=?, updated_at=? WHERE uid=?', (region, now_iso(), row['uid']))
    after = fetch_one('SELECT * FROM customer_profiles WHERE uid=?', (row['uid'],))
    audit(username(), 'move_customer', 'customer_profiles', row['uid'], before=before, after=after)
    return ok(item=after, message='客戶已移區')


@app.get('/api/customer-suggestions')
@require_login
def api_customer_suggestions():
    return ok(items=customer_suggestions(request.args.get('q', '')))


def register_item_routes(prefix, table_name):
    @app.get(prefix, endpoint=f'{table_name}_list')
    @require_login
    def list_route(table=table_name):
        return ok(items=list_items(table, request.args.get('customer_uid',''), request.args.get('customer_name',''), request.args.get('zone',''), request.args.get('search','')))

    @app.get(prefix + '/<int:item_id>', endpoint=f'{table_name}_get')
    @require_login
    def get_route(item_id, table=table_name):
        item = get_item(table, item_id)
        if not item:
            return fail('找不到商品', 404)
        return ok(item=item)

    @app.post(prefix, endpoint=f'{table_name}_create')
    @require_login
    def create_route(table=table_name):
        data = body()
        customer = None
        cname = (data.get('customer_name') or '').strip()
        cuid = data.get('customer_uid') or ''
        if table != 'inventory' or cname:
            customer = find_customer_by_uid_or_name(cuid, cname) or ensure_customer(cname or data.get('name') or '未指定客戶', data.get('region') or '北區')
        if customer:
            cuid, cname = customer['uid'], customer['name']
        ids = []
        for line in normalize_product_text(data.get('product_text') or '').splitlines():
            if line:
                ids.append(create_item(table, cuid, cname, line, data.get('material') or '', data.get('zone') or '', username(), data.get('note') or ''))
        if not ids:
            return fail('商品資料不可空白')
        items = [get_item(table, i) for i in ids]
        today('進貨' if table == 'inventory' else '新增訂單' if table == 'orders' else '新增總單', '新增商品', cname, '\n'.join([x['product_text'] for x in items]), sum(x['qty'] for x in items), data.get('zone') or '', table, username())
        audit(username(), 'create', table, ','.join(map(str, ids)), after=items)
        return ok(items=items, message='已新增')

    @app.put(prefix + '/<int:item_id>', endpoint=f'{table_name}_update')
    @require_login
    def update_route(item_id, table=table_name):
        before = get_item(table, item_id)
        if not before:
            return fail('找不到商品', 404)
        after = update_item(table, item_id, **body(), operator=username())
        audit(username(), 'update', table, item_id, before=before, after=after)
        return ok(item=after, message='已更新')

    @app.delete(prefix + '/<int:item_id>', endpoint=f'{table_name}_delete')
    @require_login
    def delete_route(item_id, table=table_name):
        before = get_item(table, item_id)
        if not before:
            return fail('找不到商品', 404)
        delete_item(table, item_id)
        audit(username(), 'delete', table, item_id, before=before)
        return ok(message='已刪除')


register_item_routes('/api/inventory', 'inventory')
register_item_routes('/api/orders', 'orders')
register_item_routes('/api/master_orders', 'master_orders')


# Legacy compatibility aliases for older frontend snippets / bookmarks.
@app.get('/api/order')
@require_login
def api_order_list_compat():
    return ok(items=list_items('orders', request.args.get('customer_uid',''), request.args.get('customer_name',''), request.args.get('zone',''), request.args.get('search','')))


@app.post('/api/order')
@require_login
def api_order_create_compat():
    data = body()
    customer = find_customer_by_uid_or_name(data.get('customer_uid',''), (data.get('customer_name') or '').strip()) or ensure_customer((data.get('customer_name') or '未指定客戶').strip(), data.get('region') or '北區')
    ids = []
    for line in normalize_product_text(data.get('product_text') or '').splitlines():
        if line:
            ids.append(create_item('orders', customer['uid'], customer['name'], line, data.get('material') or '', data.get('zone') or '', username(), data.get('note') or ''))
    if not ids:
        return fail('商品資料不可空白')
    return ok(items=[get_item('orders', i) for i in ids], message='已新增')


@app.get('/api/order/<int:item_id>')
@require_login
def api_order_get_compat(item_id):
    item = get_item('orders', item_id)
    if not item:
        return fail('找不到商品', 404)
    return ok(item=item)


@app.put('/api/order/<int:item_id>')
@require_login
def api_order_update_compat(item_id):
    before = get_item('orders', item_id)
    if not before:
        return fail('找不到商品', 404)
    after = update_item('orders', item_id, **body(), operator=username())
    audit(username(), 'update', 'orders', item_id, before=before, after=after)
    return ok(item=after, message='已更新')


@app.delete('/api/order/<int:item_id>')
@require_login
def api_order_delete_compat(item_id):
    before = get_item('orders', item_id)
    if not before:
        return fail('找不到商品', 404)
    delete_item('orders', item_id)
    audit(username(), 'delete', 'orders', item_id, before=before)
    return ok(message='已刪除')


@app.get('/api/master_order')
@require_login
def api_master_order_list_compat():
    return ok(items=list_items('master_orders', request.args.get('customer_uid',''), request.args.get('customer_name',''), request.args.get('zone',''), request.args.get('search','')))


@app.post('/api/master_order')
@require_login
def api_master_order_create_compat():
    data = body()
    customer = find_customer_by_uid_or_name(data.get('customer_uid',''), (data.get('customer_name') or '').strip()) or ensure_customer((data.get('customer_name') or '未指定客戶').strip(), data.get('region') or '北區')
    ids = []
    for line in normalize_product_text(data.get('product_text') or '').splitlines():
        if line:
            ids.append(create_item('master_orders', customer['uid'], customer['name'], line, data.get('material') or '', data.get('zone') or '', username(), data.get('note') or ''))
    if not ids:
        return fail('商品資料不可空白')
    return ok(items=[get_item('master_orders', i) for i in ids], message='已新增')


@app.get('/api/master_order/<int:item_id>')
@require_login
def api_master_order_get_compat(item_id):
    item = get_item('master_orders', item_id)
    if not item:
        return fail('找不到商品', 404)
    return ok(item=item)


@app.put('/api/master_order/<int:item_id>')
@require_login
def api_master_order_update_compat(item_id):
    before = get_item('master_orders', item_id)
    if not before:
        return fail('找不到商品', 404)
    after = update_item('master_orders', item_id, **body(), operator=username())
    audit(username(), 'update', 'master_orders', item_id, before=before, after=after)
    return ok(item=after, message='已更新')


@app.delete('/api/master_order/<int:item_id>')
@require_login
def api_master_order_delete_compat(item_id):
    before = get_item('master_orders', item_id)
    if not before:
        return fail('找不到商品', 404)
    delete_item('master_orders', item_id)
    audit(username(), 'delete', 'master_orders', item_id, before=before)
    return ok(message='已刪除')



@app.get('/api/items/<source>/<int:item_id>')
@require_login
def api_get_item_compat(source, item_id):
    table = normalize_table(source)
    item = get_item(table, item_id)
    if not item:
        return fail('找不到商品', 404)
    item['source'] = table
    return ok(item=item)


@app.post('/api/items/bulk-update')
@require_login
def api_items_bulk_update():
    data = body()
    table = normalize_table(data.get('table') or 'inventory')
    ids = [int(x) for x in (data.get('ids') or []) if str(x).isdigit()]
    if not ids:
        return fail('請先勾選商品')
    updates = {}
    for key in ('material', 'zone', 'product_text'):
        if key in data and str(data.get(key) or '').strip() != '':
            updates[key] = data.get(key)
    if not updates:
        return fail('請輸入要修改的內容')
    before = [get_item(table, item_id) for item_id in ids]
    after = []
    for item_id in ids:
        after.append(update_item(table, item_id, **updates, operator=username()))
    audit(username(), 'bulk_update', table, ','.join(map(str, ids)), before=before, after=after)
    return ok(items=after, message='已批量更新')



@app.post('/api/<table>/<int:item_id>/move')
@require_login
def api_item_move_compat(table, item_id):
    table = normalize_table(table)
    data = body()
    row = get_item(table, item_id)
    if not row:
        return fail('找不到商品', 404)
    updates = {}
    if 'zone' in data:
        if data.get('zone') not in ('A', 'B', ''):
            return fail('區域只能是 A / B')
        updates['zone'] = data.get('zone') or ''
    if 'location' in data:
        updates['location'] = data.get('location') or ''
    if not updates:
        return fail('請指定要移動的 A/B 區或位置')
    after = update_item(table, item_id, **updates, operator=username())
    audit(username(), 'move_item', table, item_id, before=row, after=after)
    emit_update(table, {'id': item_id})
    return ok(item=after, message='已移動')


@app.post('/api/customer-items/batch-material')
@require_login
def api_batch_material():
    data = body()
    table = normalize_table(data.get('table') or 'inventory')
    ids = [int(x) for x in (data.get('ids') or []) if str(x).isdigit()]
    material = data.get('material') or data.get('value') or ''
    if not ids:
        return fail('請先勾選商品')
    before = [get_item(table, i) for i in ids]
    after = [update_item(table, i, material=material, operator=username()) for i in ids]
    audit(username(), 'batch_material', table, ','.join(map(str, ids)), before=before, after=after)
    emit_update(table, {'ids': ids})
    return ok(items=after, message='已套用材質')


@app.post('/api/customer-items/batch-zone')
@require_login
def api_batch_zone():
    data = body()
    table = normalize_table(data.get('table') or 'inventory')
    ids = [int(x) for x in (data.get('ids') or []) if str(x).isdigit()]
    zone = data.get('zone') or data.get('value') or ''
    if zone not in ('A', 'B', ''):
        return fail('區域只能是 A / B')
    if not ids:
        return fail('請先勾選商品')
    before = [get_item(table, i) for i in ids]
    after = [update_item(table, i, zone=zone, operator=username()) for i in ids]
    audit(username(), 'batch_zone', table, ','.join(map(str, ids)), before=before, after=after)
    emit_update(table, {'ids': ids})
    return ok(items=after, message='已移動區域')


@app.post('/api/customer-items/batch-delete')
@require_login
def api_batch_delete():
    data = body()
    table = normalize_table(data.get('table') or 'inventory')
    ids = [int(x) for x in (data.get('ids') or []) if str(x).isdigit()]
    if not ids:
        return fail('請先勾選商品')
    before = [get_item(table, i) for i in ids]
    for i in ids:
        delete_item(table, i)
    audit(username(), 'batch_delete', table, ','.join(map(str, ids)), before=before)
    emit_update(table, {'ids': ids})
    return ok(message='已批量刪除')

@app.post('/api/items/transfer')
@require_login
def api_transfer_item():
    data = body()
    source = normalize_table(data.get('source') or 'inventory')
    target = normalize_table(data.get('target') or 'orders')
    item_id = int(data.get('id') or 0)
    row = get_item(source, item_id)
    if not row:
        return fail('找不到來源商品')
    customer = find_customer_by_uid_or_name(data.get('customer_uid') or row.get('customer_uid'), data.get('customer_name') or row.get('customer_name'))
    if not customer:
        customer = ensure_customer(data.get('customer_name') or '未指定客戶', data.get('region') or '北區')
    new_id = create_item(target, customer['uid'], customer['name'], row['product_text'], row.get('material') or '', row.get('zone') or '', username(), f'由 {source} 轉入')
    audit(username(), 'transfer', f'{source}->{target}', str(item_id), before=row, after=get_item(target, new_id))
    return ok(item=get_item(target, new_id), message='已加入')


@app.post('/api/duplicate-check')
@require_login
def api_duplicate_check():
    data = body()
    table = normalize_table(data.get('target') or data.get('table') or 'orders')
    customer = find_customer_by_uid_or_name(data.get('customer_uid',''), data.get('customer_name',''))
    rows = find_duplicate_items(
        table,
        customer_uid=(customer or {}).get('uid','') or data.get('customer_uid',''),
        customer_name=(customer or {}).get('name','') or data.get('customer_name',''),
        product_text=data.get('product_text') or '',
        material=data.get('material') or ''
    )
    return ok(items=rows, has_duplicate=bool(rows), normalized_text=normalize_product_text(data.get('product_text') or ''), qty=total_qty_from_text(data.get('product_text') or ''))


@app.post('/api/items/merge')
@require_login
def api_items_merge():
    data = body()
    table = normalize_table(data.get('target') or data.get('table') or 'orders')
    item_id = int(data.get('duplicate_id') or data.get('id') or 0)
    before = get_item(table, item_id)
    if not before:
        return fail('找不到要合併的商品')
    after = merge_item_qty(table, item_id, data.get('product_text') or before.get('product_text') or '', data.get('qty'), username())
    audit(username(), 'merge', table, item_id, before=before, after=after)
    today('合併商品', '合併商品', after.get('customer_name') or '', after.get('product_text') or '', after.get('qty') or 0, after.get('zone') or '', table, username(), {'before': before, 'after': after})
    return ok(item=after, message='已合併商品')


@app.get('/api/customer-items')
@require_login
def api_customer_items():
    cuid = request.args.get('customer_uid','')
    cname = request.args.get('customer_name','')
    zone = request.args.get('zone','')
    search = request.args.get('search','')
    out = []
    # 客戶頁/出貨頁：總單、訂單只抓該客戶；庫存作為備援來源，顯示全部未指定客戶庫存，
    # 避免「客戶沒有總單/訂單時，出貨頁完全沒有商品可選」。
    for src, label in [('master_orders','總單'), ('orders','訂單')]:
        rows = list_items(src, cuid, cname, zone, search)
        for row in rows:
            row['source'] = src
            row['source_label'] = label
            out.append(row)
    inventory_rows = list_items('inventory', '', '', zone, search)
    for row in inventory_rows:
        if row.get('customer_name') and cname and row.get('customer_name') != cname:
            continue
        row['source'] = 'inventory'
        row['source_label'] = '庫存'
        out.append(row)
    return ok(items=out)


@app.post('/api/ship-preview')
@require_login
def api_ship_preview():
    data = body()
    customer = find_customer_by_uid_or_name(data.get('customer_uid',''), data.get('customer_name',''))
    return ok(preview=build_preview(customer['uid'] if customer else data.get('customer_uid',''), customer['name'] if customer else data.get('customer_name',''), data.get('items') or [], data.get('weight_input') or 0))


@app.post('/api/ship')
@require_login
def api_ship():
    data = body()
    customer = find_customer_by_uid_or_name(data.get('customer_uid',''), data.get('customer_name',''))
    result = confirm_shipping(username(), customer['uid'] if customer else data.get('customer_uid',''), customer['name'] if customer else data.get('customer_name',''), data.get('items') or [], data.get('weight_input') or 0, data.get('note') or '')
    emit_update('shipping', result)
    return ok(result=result, message='出貨完成')


@app.get('/api/shipping_records')
@require_login
def api_shipping_records():
    search = request.args.get('search','').strip()
    days = request.args.get('days','').strip()
    date_from = request.args.get('date_from','').strip()
    date_to = request.args.get('date_to','').strip()
    clauses = []
    params = []
    if search:
        like = f'%{search}%'
        clauses.append('(customer_name LIKE ? OR product_text LIKE ? OR material LIKE ? OR operator LIKE ? OR borrowed_from LIKE ?)')
        params.extend([like, like, like, like, like])
    if days in {'3','7','10','15'}:
        cutoff = (datetime.now() - timedelta(days=int(days))).strftime('%Y-%m-%d 00:00:00')
        clauses.append('shipped_at >= ?')
        params.append(cutoff)
    if date_from:
        clauses.append('shipped_at >= ?')
        params.append(f'{date_from} 00:00:00')
    if date_to:
        clauses.append('shipped_at <= ?')
        params.append(f'{date_to} 23:59:59')
    where = ('WHERE ' + ' AND '.join(clauses)) if clauses else ''
    return ok(items=fetch_all(f'SELECT * FROM shipping_records {where} ORDER BY shipped_at DESC, id DESC', params))


@app.get('/api/warehouse')
@require_login
def api_warehouse():
    return ok(items=list_cells(request.args.get('zone','')))


@app.post('/api/warehouse/cell')
@require_login
def api_warehouse_cell():
    data = body()
    zone = data.get('zone','A')
    col = int(data.get('column_index') or 1)
    slot = int(data.get('slot_number') or 1)
    before = get_cell(zone, col, slot)
    item = update_cell(zone, col, slot, data.get('items') or [], data.get('note') or '')
    if before:
        save_undo(username(), 'warehouse_cell', 'warehouse_cells', f"{zone}-{col}-{slot}", {'cells': [before]})
    audit(username(), 'update_cell', 'warehouse_cells', f"{item['zone']}-{item['column_index']}-{item['slot_number']}", before=before, after=item)
    return ok(item=item, message='格位已儲存')


@app.post('/api/warehouse/add-slot')
@require_login
def api_add_slot():
    data = body()
    zone = data.get('zone','A')
    col = int(data.get('column_index') or 1)
    before_cells = [c for c in list_cells(zone) if int(c.get('column_index') or 0) == col]
    add_slot(zone, col, int(data['after_slot']) if data.get('after_slot') else None)
    save_undo(username(), 'warehouse_add_slot', 'warehouse_cells', f"{zone}-{col}", {'cells': before_cells})
    return ok(message='已插入格子')


@app.post('/api/warehouse/remove-slot')
@require_login
def api_remove_slot():
    data = body()
    zone = data.get('zone','A')
    col = int(data.get('column_index') or 1)
    before_cells = [c for c in list_cells(zone) if int(c.get('column_index') or 0) == col]
    remove_slot(zone, col, int(data.get('slot_number') or 1))
    save_undo(username(), 'warehouse_remove_slot', 'warehouse_cells', f"{zone}-{col}", {'cells': before_cells})
    return ok(message='已刪除格子')


@app.get('/api/warehouse/locations')
@require_login
def api_warehouse_locations():
    return ok(items=find_locations(request.args.get('source',''), int(request.args.get('id') or request.args.get('source_id') or 0), request.args.get('customer_name',''), request.args.get('product_text','')))


@app.get('/api/find_locations')
@require_login
def api_find_locations_compat():
    return api_warehouse_locations()



@app.get('/api/warehouse/search')
@require_login
def api_warehouse_search():
    q = (request.args.get('q') or request.args.get('search') or '').strip()
    results = []
    for cell in list_cells(request.args.get('zone','')):
        hay = ' '.join([str(cell.get('zone','')), str(cell.get('column_index','')), str(cell.get('slot_number','')), cell.get('items_json','')])
        if (not q) or q in hay:
            results.append(cell)
    return ok(items=results[:100])


@app.get('/api/recent-slots')
@require_login
def api_recent_slots():
    rows = fetch_all('SELECT * FROM warehouse_recent_slots ORDER BY used_at DESC, id DESC LIMIT 30')
    return ok(items=rows)

@app.get('/api/warehouse/available-items')
@require_login
def api_available_items():
    zone = request.args.get('zone','')
    search = request.args.get('search','')
    placed = placed_qty_map(zone)
    out = []
    for src, label in [('inventory','庫存'), ('orders','訂單'), ('master_orders','總單')]:
        rows = list_items(src, zone=zone, search=search)
        out.extend(available_items_from_rows(rows, src, label, placed))
    return ok(items=out, total_qty=sum(int(x.get('qty') or 0) for x in out))


@app.get('/api/warehouse/available_items')
@require_login
def api_available_items_compat():
    return api_available_items()


@app.post('/api/warehouse/move')
@require_login
def api_warehouse_move():
    data = body()
    src = data.get('from') or {}
    dst = data.get('to') or {}
    before_cells = []
    for cell in (src, dst):
        snap = get_cell(cell.get('zone','A'), int(cell.get('column_index') or 1), int(cell.get('slot_number') or 1))
        if snap:
            before_cells.append(snap)
    moved = move_front(src, dst, int(data.get('item_index') or 0))
    save_undo(username(), 'warehouse_move', 'warehouse_cells', f"{src.get('zone')}-{src.get('column_index')}-{src.get('slot_number')}->{dst.get('zone')}-{dst.get('column_index')}-{dst.get('slot_number')}", {'cells': before_cells})
    audit(username(), 'warehouse_move', 'warehouse_cells', '', before=before_cells, after=moved)
    today('倉庫', '移動格位商品', (moved.get('moved_item') or {}).get('customer_name',''), (moved.get('moved_item') or {}).get('product_text',''), (moved.get('moved_item') or {}).get('qty',0), f"{dst.get('zone')}-{dst.get('column_index')}-{dst.get('slot_number')}", 'warehouse', username(), moved)
    execute('INSERT INTO warehouse_recent_slots(zone,column_index,slot_number,used_at) VALUES(?,?,?,?)', (dst.get('zone','A'), int(dst.get('column_index') or 1), int(dst.get('slot_number') or 1), now_iso()))
    emit_update('warehouse', moved)
    return ok(item=moved, message='已移到前排')


@app.post('/api/undo-last')
@require_login
def api_undo_last():
    result = undo_last(username())
    audit(username(), 'undo', 'undo_events', result['event']['id'], after=result)
    return ok(item=result, message='已還原上一步')


@app.get('/api/today-changes')
@require_login
def api_today_changes():
    return ok(items=fetch_all('SELECT * FROM today_changes ORDER BY created_at DESC, id DESC LIMIT 200'), unread_count=fetch_one('SELECT COUNT(*) AS c FROM today_changes WHERE is_read=0')['c'])


@app.post('/api/today-changes/read')
@require_login
def api_today_read():
    execute('UPDATE today_changes SET is_read=1')
    return ok(message='已讀')


@app.delete('/api/today-changes/<int:change_id>')
@require_login
def api_today_delete(change_id):
    execute('DELETE FROM today_changes WHERE id=?', (change_id,))
    return ok(message='已刪除')


@app.post('/api/today-changes/bulk-delete')
@require_admin
def api_today_bulk_delete():
    ids = [int(x) for x in (body().get('ids') or []) if str(x).isdigit()]
    if not ids:
        return fail('請先勾選要刪除的今日異動')
    placeholders = ','.join(['?'] * len(ids))
    execute(f'DELETE FROM today_changes WHERE id IN ({placeholders})', ids)
    audit(username(), 'bulk_delete', 'today_changes', ','.join(map(str, ids)), after={'ids': ids})
    return ok(message='已批量刪除今日異動')


@app.get('/api/audit-trails')
@require_login
def api_audit_list():
    return ok(items=fetch_all('SELECT * FROM audit_trails ORDER BY created_at DESC, id DESC LIMIT 200'))


@app.post('/api/audit-trails/bulk-delete')
@require_admin
def api_audit_bulk_delete():
    ids = [int(x) for x in (body().get('ids') or []) if str(x).isdigit()]
    if not ids:
        return fail('請先勾選要刪除的操作紀錄')
    placeholders = ','.join(['?'] * len(ids))
    execute(f'DELETE FROM audit_trails WHERE id IN ({placeholders})', ids)
    return ok(message='已批量刪除操作紀錄')


@app.get('/api/corrections')
@require_login
def api_corrections():
    return ok(items=fetch_all('SELECT * FROM corrections ORDER BY wrong_text'))


@app.post('/api/corrections')
@require_admin
def api_correction_create():
    data = body()
    wrong = (data.get('wrong_text') or '').strip()
    correct = (data.get('correct_text') or '').strip()
    if not wrong or not correct:
        return fail('請輸入錯字與修正文字')
    existing = fetch_one('SELECT id FROM corrections WHERE wrong_text=?', (wrong,))
    if existing:
        execute('UPDATE corrections SET correct_text=?, created_at=? WHERE id=?', (correct, now_iso(), existing['id']))
    else:
        execute('INSERT INTO corrections(wrong_text, correct_text, created_at) VALUES(?,?,?)', (wrong, correct, now_iso()))
    audit(username(), 'upsert', 'corrections', wrong, after={'wrong_text': wrong, 'correct_text': correct})
    return ok(message='已儲存修正詞')


@app.delete('/api/corrections/<int:correction_id>')
@require_admin
def api_correction_delete(correction_id):
    execute('DELETE FROM corrections WHERE id=?', (correction_id,))
    return ok(message='已刪除修正詞')


@app.get('/api/customer-aliases')
@require_login
def api_customer_aliases():
    return ok(items=fetch_all('''SELECT a.*, c.name AS customer_name
                                 FROM customer_aliases a
                                 LEFT JOIN customer_profiles c ON c.uid=a.customer_uid
                                 ORDER BY a.alias'''))


@app.post('/api/customer-aliases')
@require_admin
def api_customer_alias_create():
    data = body()
    alias = (data.get('alias') or '').strip()
    cname = (data.get('customer_name') or '').strip()
    customer = find_customer_by_uid_or_name(data.get('customer_uid',''), cname) or (ensure_customer(cname) if cname else None)
    if not alias or not customer:
        return fail('請輸入別名與對應客戶')
    existing = fetch_one('SELECT id FROM customer_aliases WHERE alias=?', (alias,))
    if existing:
        execute('UPDATE customer_aliases SET customer_uid=?, created_at=? WHERE id=?', (customer['uid'], now_iso(), existing['id']))
    else:
        execute('INSERT INTO customer_aliases(customer_uid, alias, created_at) VALUES(?,?,?)', (customer['uid'], alias, now_iso()))
    audit(username(), 'upsert', 'customer_aliases', alias, after={'alias': alias, 'customer_uid': customer['uid']})
    return ok(message='已儲存客戶別名')


@app.delete('/api/customer-aliases/<int:alias_id>')
@require_admin
def api_customer_alias_delete(alias_id):
    execute('DELETE FROM customer_aliases WHERE id=?', (alias_id,))
    return ok(message='已刪除客戶別名')


@app.get('/api/todos')
@require_login
def api_todos():
    return ok(items=fetch_all('SELECT * FROM todo_items ORDER BY is_done, sort_order, due_date, id DESC'))


@app.post('/api/todos')
@require_login
def api_todo_create():
    data = body()
    title = (data.get('title') or '').strip()
    if not title:
        return fail('代辦標題不可空白')
    t = now_iso()
    image_path = ''
    upload = request.files.get('image')
    if upload and upload.filename:
        upload_dir = Path(app.root_path) / 'uploads' / 'todos'
        upload_dir.mkdir(parents=True, exist_ok=True)
        filename = now_iso().replace(':','').replace(' ','_') + '_' + secure_filename(upload.filename)
        upload.save(upload_dir / filename)
        image_path = f'/uploads/todos/{filename}'
    tid = execute('INSERT INTO todo_items(title,due_date,image_path,is_done,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
                  (title, data.get('due_date') or '', image_path, 0, int(data.get('sort_order') or 0), t, t))
    return ok(item=fetch_one('SELECT * FROM todo_items WHERE id=?', (tid,)), message='已新增代辦')


@app.put('/api/todos/<int:todo_id>')
@require_login
def api_todo_update(todo_id):
    data = body()
    allowed = {'title','due_date','is_done','sort_order'}
    sets, params = [], []
    for k, v in data.items():
        if k in allowed:
            sets.append(f'{k}=?')
            params.append(v)
    sets.append('updated_at=?')
    params.append(now_iso())
    params.append(todo_id)
    execute(f'UPDATE todo_items SET {",".join(sets)} WHERE id=?', params)
    return ok(item=fetch_one('SELECT * FROM todo_items WHERE id=?', (todo_id,)), message='已更新')


@app.delete('/api/todos/<int:todo_id>')
@require_login
def api_todo_delete(todo_id):
    execute('DELETE FROM todo_items WHERE id=?', (todo_id,))
    return ok(message='已刪除')



@app.get('/api/reports/summary')
@require_login
def api_reports_summary():
    kind = request.args.get('kind') or 'shipping'
    if kind not in ('inventory', 'orders', 'master_orders', 'shipping'):
        return fail('不支援的報表類型')
    days = request.args.get('days')
    days = int(days) if str(days).isdigit() else None
    rows = query_rows(kind, days=days, start=request.args.get('start',''), end=request.args.get('end',''))
    return ok(kind=kind, summary=report_summary(rows), items=rows[:200])


@app.get('/api/reports/export/<kind>')
@require_login
def api_reports_export(kind):
    if kind not in ('inventory', 'orders', 'master_orders', 'shipping'):
        return fail('不支援的報表類型')
    days = request.args.get('days')
    days = int(days) if str(days).isdigit() else None
    rows = query_rows(kind, days=days, start=request.args.get('start',''), end=request.args.get('end',''))
    bio = workbook_for(kind, rows)
    filename = f'yuanxing_{kind}_report_{now_iso().split()[0]}.xlsx'
    return send_file(bio, as_attachment=True, download_name=filename, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@app.get('/api/export/<kind>')
@require_login
def api_export_compat(kind):
    if kind not in ('inventory', 'orders', 'master_orders', 'shipping'):
        return fail('不支援的匯出類型')
    rows = query_rows(kind, days=int(request.args.get('days') or 0) or None, start=request.args.get('start',''), end=request.args.get('end',''))
    bio = workbook_for(kind, rows)
    filename = f'yuanxing_{kind}_{now_iso().split()[0]}.xlsx'
    return send_file(bio, as_attachment=True, download_name=filename, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@app.get('/api/maintenance/integrity')
@require_admin
def api_maintenance_integrity():
    return ok(report=integrity_report())


@app.post('/api/maintenance/repair')
@require_admin
def api_maintenance_repair():
    data = body()
    result = repair_integrity(
        operator=username(),
        fix_qty=data.get('fix_qty', True) not in (False, 'false', '0', 0),
        fix_customers=data.get('fix_customers', True) not in (False, 'false', '0', 0),
        remove_stale_warehouse=data.get('remove_stale_warehouse', True) not in (False, 'false', '0', 0),
    )
    audit(username(), 'maintenance_repair', 'system', 'integrity', before=result.get('before'), after=result.get('after'))
    return ok(result=result, message='資料檢查與修復已完成')


@app.get('/api/import/template')
@require_login
def api_import_template():
    return send_file(import_template_workbook(), as_attachment=True, download_name='沅興木業_匯入範本.xlsx', mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@app.post('/api/import/items')
@require_login
def api_import_items():
    upload = request.files.get('file')
    if not upload:
        return fail('請選擇 Excel 檔案')
    if not upload.filename.lower().endswith(('.xlsx', '.xlsm')):
        return fail('目前只支援 .xlsx / .xlsm')
    result = parse_import_workbook(upload.read(), default_table=request.form.get('default_table') or 'inventory', operator=username())
    audit(username(), 'import_items', 'excel', upload.filename, after={'created_count': result.get('created_count'), 'errors': result.get('errors')})
    today('進貨', 'Excel 匯入商品', '', upload.filename, result.get('created_count') or 0, '', 'import', username(), result)
    return ok(result=result, message=f"已匯入 {result.get('created_count', 0)} 筆")


def _backup_dir():
    path = Path(app.root_path) / 'backups'
    path.mkdir(parents=True, exist_ok=True)
    return path


def _backup_name(ext='db'):
    return 'backup_' + now_iso().replace(':','').replace(' ','_') + f'.{ext}'


def _create_sqlite_backup(target: Path):
    shutil.copyfile(DB_PATH, target)


def _create_postgres_backup(target: Path):
    # Use pg_dump when available. If not, create a portable marker file so the backup list
    # still records the event and Render logs show what needs to be configured.
    import subprocess
    try:
        with target.open('wb') as fh:
            subprocess.run(['pg_dump', DATABASE_URL], stdout=fh, stderr=subprocess.PIPE, check=True, timeout=120)
    except Exception as exc:
        target.write_text('PostgreSQL backup placeholder. Install pg_dump in the runtime or use Render managed database backups.\n' + str(exc), encoding='utf-8')


@app.get('/api/backup')
@require_login
def api_backup():
    if using_postgres():
        target = _backup_dir() / _backup_name('sql')
        _create_postgres_backup(target)
        execute('INSERT INTO backups(filename, created_at) VALUES(?,?)', (target.name, now_iso()))
        return send_file(target, as_attachment=True, download_name=target.name)
    return send_file(DB_PATH, as_attachment=True, download_name='yuanxing_warehouse_backup.db')


@app.post('/api/backup')
@require_login
def api_backup_create():
    backup_dir = _backup_dir()
    filename = _backup_name('sql' if using_postgres() else 'db')
    target = backup_dir / filename
    if using_postgres():
        _create_postgres_backup(target)
    else:
        _create_sqlite_backup(target)
    execute('INSERT INTO backups(filename, created_at) VALUES(?,?)', (filename, now_iso()))
    audit(username(), 'create_backup', 'backups', filename)
    return ok(filename=filename, message='已建立備份')


@app.post('/api/backups/restore')
@require_admin
def api_backup_restore():
    upload = request.files.get('backup')
    if not upload:
        return fail('請選擇備份檔')
    if using_postgres():
        return fail('PostgreSQL 還原請使用 Render PostgreSQL Restore 或 psql 指令，避免覆蓋線上資料')
    if not upload.filename.endswith('.db'):
        return fail('只允許還原 .db 備份檔')
    backup_copy = Path(str(DB_PATH) + '.before_restore_' + now_iso().replace(':','').replace(' ','_'))
    if Path(DB_PATH).exists():
        backup_copy.write_bytes(Path(DB_PATH).read_bytes())
    upload.save(DB_PATH)
    init_db()
    audit(username(), 'restore_backup', 'backups', upload.filename, after={'before_copy': str(backup_copy)})
    return ok(message='備份已還原，請重新整理頁面')


@app.get('/api/backups/download/<path:filename>')
@require_admin
def api_backups_download(filename):
    safe = secure_filename(filename)
    candidates = [_backup_dir() / safe, Path(DB_PATH).resolve().parent / safe]
    for path in candidates:
        if path.exists() and path.is_file():
            return send_file(path, as_attachment=True, download_name=path.name)
    return fail('找不到備份檔', 404)


@app.get('/api/backups')
@require_admin
def api_backups_list():
    files = {}
    for folder in [_backup_dir(), Path(DB_PATH).resolve().parent]:
        if folder.exists():
            for pattern in ('*.db', '*.db-*', '*.db.*', '*.sql', '*.dump'):
                for f in folder.glob(pattern):
                    files[f.name] = {'filename': f.name, 'size': f.stat().st_size, 'updated_at': f.stat().st_mtime, 'path': str(f.parent)}
    for row in fetch_all('SELECT * FROM backups ORDER BY created_at DESC'):
        files.setdefault(row['filename'], {'filename': row['filename'], 'size': 0, 'updated_at': row.get('created_at'), 'path': 'database'})
    return ok(items=sorted(files.values(), key=lambda x: str(x.get('updated_at','')), reverse=True))

@app.get('/health')
def health_page():
    return ok(status='ok' if not STARTUP_DB_ERROR else 'degraded', db_path=str(DB_PATH), db_error=STARTUP_DB_ERROR or '', use_postgres=using_postgres(), socketio_enabled=bool(socketio))


@app.get('/api/health')
def api_health():
    return ok(status='ok' if not STARTUP_DB_ERROR else 'degraded', db_path=str(DB_PATH), db_error=STARTUP_DB_ERROR or '', use_postgres=using_postgres(), socketio_enabled=bool(socketio))


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    if socketio:
        socketio.run(app, host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG')=='1', allow_unsafe_werkzeug=True)
    else:
        app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG')=='1')
