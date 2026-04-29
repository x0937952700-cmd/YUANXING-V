import os
import re
import json
import hashlib
from functools import wraps
from datetime import datetime
from flask import Flask, request, jsonify, render_template, redirect, url_for, session, send_file
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
}


def current_user():
    return session.get('username', '')


def is_admin():
    return current_user() == ADMIN_NAME or session.get('role') == 'admin'


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            if request.path.startswith('/api/'):
                return jsonify({'ok': False, 'error': '登入已過期，請重新登入', 'login_required': True}), 401
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


def serialize_item(row, source=''):
    row = dict(row)
    row['source'] = source
    row['pieces'] = int(row.get('pieces') or 0)
    return row


def add_product_to_table(table, customer_name, product, material='', operator=''):
    db.execute(
        f"""INSERT INTO {table}(customer_name, product_text, material, length_text, width_text, height_text,
            qty_expr, pieces, operator, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        [customer_name or '', product['product_text'], material or '', product['length_text'], product['width_text'],
         product['height_text'], product['qty_expr'], product['pieces'], operator, db.now(), db.now()],
    )


def update_product_table(table, item_id, data, operator):
    fields = []
    params = []
    allowed = ['customer_name', 'product_text', 'material', 'length_text', 'width_text', 'height_text', 'qty_expr', 'pieces', 'warehouse_key', 'status']
    if 'product_text' in data and data.get('product_text'):
        parsed = parse_product_text(data.get('product_text'))
        if parsed:
            p = parsed[0]
            data.update(p)
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
    if not getattr(app, '_yx_db_ready', False):
        db.init_db()
        app._yx_db_ready = True


@app.before_request
def boot_db():
    # 首頁 / 登入頁 / 靜態檔不需要先跑資料庫初始化。
    # 舊版會在第一個瀏覽器請求就跑完整 migration + 120 格倉庫 seed，
    # Render PostgreSQL 第一次連線時容易讓頁面卡在 about:blank。
    if request.endpoint == 'static' or request.path in ['/login', '/static/manifest.webmanifest', '/favicon.ico']:
        return
    if request.path == '/' and not current_user():
        return
    ensure_db_ready()


@app.route('/login')
def login_page():
    if current_user():
        return redirect(url_for('home'))
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
    # No standalone shipping_records page by request; shipping records remain data-only.
    return render_template('page.html', page=page, title=PAGE_TITLES[page], user=current_user())


@app.post('/api/register')
def api_register():
    data = body_json()
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return api_error('請輸入姓名與密碼')
    role = 'admin' if username == ADMIN_NAME else 'user'
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
        if password_ok and not stored_hash:
            db.execute("UPDATE users SET password_hash=? WHERE username=?", [generate_password_hash(password), username])
    if not password_ok:
        return api_error('帳號或密碼錯誤', 401)
    if int(user.get('is_blocked') or 0):
        return api_error('此帳號已被封鎖，請聯絡管理員', 403)
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
    return jsonify({'ok': True, 'logged_in': bool(current_user()), 'username': current_user(), 'admin': is_admin()})


@app.get('/api/customers')
@login_required
def api_customers():
    archived = request.args.get('archived') == '1'
    rows = db.fetchall(
        "SELECT * FROM customers WHERE archived=? ORDER BY region, sort_order, name",
        [db.flag(archived)],
    )
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
def api_customers_post():
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    name = (data.get('name') or '').strip()
    if not name:
        return api_error('請輸入客戶名稱')
    db.ensure_customer(name, data.get('region') or 'north', current_user())
    db.execute("UPDATE customers SET region=?, common_material=?, common_size=?, updated_at=? WHERE name=?",
               [data.get('region') or 'north', data.get('common_material') or '', data.get('common_size') or '', db.now(), name])
    db.add_activity('客戶更新', name, '', '新增/更新客戶資料', current_user())
    return jsonify({'ok': True})


@app.patch('/api/customers/<path:name>')
@login_required
def api_customer_patch(name):
    data = body_json()
    if db.check_request_key(data.get('request_key')):
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
    if region is not None or common_material is not None or common_size is not None:
        row = db.fetchone("SELECT * FROM customers WHERE name=?", [new_name])
        db.execute("UPDATE customers SET region=?, common_material=?, common_size=?, updated_at=? WHERE name=?",
                   [region or row.get('region') or 'north', common_material if common_material is not None else row.get('common_material',''), common_size if common_size is not None else row.get('common_size',''), db.now(), new_name])
    db.add_activity('客戶更新', new_name, '', '編輯客戶資料', current_user())
    return jsonify({'ok': True})


@app.delete('/api/customers/<path:name>')
@login_required
def api_customer_delete(name):
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    db.execute("UPDATE customers SET archived=?, updated_at=? WHERE name=?", [db.flag(True), db.now(), name])
    db.add_activity('封存客戶', name, '', '客戶已封存', current_user())
    return jsonify({'ok': True})


@app.post('/api/customers/<path:name>/restore')
@login_required
def api_customer_restore(name):
    db.execute("UPDATE customers SET archived=?, updated_at=? WHERE name=?", [db.flag(False), db.now(), name])
    db.add_activity('還原客戶', name, '', '客戶已還原', current_user())
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
    sql += ' ORDER BY height_text, width_text, length_text, updated_at DESC LIMIT 500'
    rows = [serialize_item(r, module) for r in db.fetchall(sql, params)]
    return jsonify({'ok': True, 'items': rows})


@app.post('/api/items/<module>')
@login_required
def api_items_post(module):
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    text = data.get('text') or data.get('product_text') or ''
    rows = parse_product_text(text)
    if not rows:
        return api_error('沒有可加入的商品格式')
    customer = (data.get('customer_name') or '').strip()
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
def api_item_patch(module, item_id):
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    update_product_table(table, item_id, data, current_user())
    db.add_activity('編輯商品', data.get('customer_name',''), data.get('product_text',''), f'更新{PAGE_TITLES.get(module,module)}商品', current_user())
    return jsonify({'ok': True})


@app.delete('/api/items/<module>/<int:item_id>')
@login_required
def api_item_delete(module, item_id):
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    try:
        table = db.table_for_module(module)
    except ValueError:
        return api_error('模組錯誤')
    row = db.fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
    if not row:
        return api_error('找不到商品')
    db.execute(f"DELETE FROM {table} WHERE id=?", [item_id])
    db.add_activity('刪除商品', row.get('customer_name',''), row.get('product_text',''), f'刪除{PAGE_TITLES.get(module,module)}商品', current_user())
    return jsonify({'ok': True})


@app.post('/api/items/add-to-order')
@login_required
def api_add_to_order():
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    inv_id = int(data.get('inventory_id') or 0)
    customer = (data.get('customer_name') or '').strip()
    pieces = int(data.get('pieces') or 0)
    if not customer:
        return api_error('請輸入客戶名稱')
    inv = db.fetchone("SELECT * FROM inventory WHERE id=?", [inv_id])
    if not inv:
        return api_error('找不到庫存商品')
    pieces = pieces or int(inv.get('pieces') or 0)
    if pieces > int(inv.get('pieces') or 0):
        return api_error('庫存不足，不能超賣')
    db.ensure_customer(customer, operator=current_user())
    p = dict(inv); p['pieces'] = pieces
    add_product_to_table('orders', customer, p, inv.get('material',''), current_user())
    remain = int(inv.get('pieces') or 0) - pieces
    if remain <= 0:
        db.execute("DELETE FROM inventory WHERE id=?", [inv_id])
    else:
        db.execute("UPDATE inventory SET pieces=?, updated_at=? WHERE id=?", [remain, db.now(), inv_id])
    db.add_activity('加入訂單', customer, inv.get('product_text',''), f'從庫存加入訂單 {pieces} 件', current_user())
    return jsonify({'ok': True})


@app.post('/api/items/add-to-master')
@login_required
def api_add_to_master():
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    source = data.get('source') or 'inventory'
    source_id = int(data.get('id') or data.get('source_id') or 0)
    customer = (data.get('customer_name') or '').strip()
    if not customer:
        return api_error('請輸入客戶名稱')
    table = db.table_for_module(source)
    row = db.fetchone(f"SELECT * FROM {table} WHERE id=?", [source_id])
    if not row:
        return api_error('找不到商品')
    db.ensure_customer(customer, operator=current_user())
    # Merge confirmation is driven by frontend; backend still supports merging when requested.
    if data.get('merge'):
        existing = db.fetchone("SELECT * FROM master_orders WHERE customer_name=? AND product_text=? AND material=?",
                               [customer, row.get('product_text',''), row.get('material','')])
        if existing:
            new_pieces = int(existing.get('pieces') or 0) + int(row.get('pieces') or 0)
            db.execute("UPDATE master_orders SET pieces=?, updated_at=? WHERE id=?", [new_pieces, db.now(), existing['id']])
        else:
            add_product_to_table('master_orders', customer, row, row.get('material',''), current_user())
    else:
        add_product_to_table('master_orders', customer, row, row.get('material',''), current_user())
    db.add_activity('加入總單', customer, row.get('product_text',''), f'從{source}加入總單', current_user())
    return jsonify({'ok': True})


@app.post('/api/inbound')
@login_required
def api_inbound():
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    customer = (data.get('customer_name') or '').strip()
    material = data.get('material') or ''
    rows = parse_product_text(data.get('text') or '')
    if not rows:
        return api_error('沒有可入庫的商品格式')
    table = 'master_orders' if customer else 'inventory'
    if customer:
        db.ensure_customer(customer, operator=current_user())
    for p in rows:
        add_product_to_table(table, customer, p, material, current_user())
        db.add_activity('入庫', customer or '庫存', p['product_text'], '入庫到總單' if customer else '入庫到庫存', current_user())
    return jsonify({'ok': True, 'count': len(rows), 'target': '總單' if customer else '庫存'})


@app.get('/api/customer-items')
@login_required
def api_customer_items():
    customer = (request.args.get('customer') or '').strip()
    rows = []
    if customer and customer != '庫存':
        rows += [serialize_item(r, 'master') for r in db.fetchall("SELECT * FROM master_orders WHERE customer_name=? ORDER BY updated_at DESC", [customer])]
        rows += [serialize_item(r, 'orders') for r in db.fetchall("SELECT * FROM orders WHERE customer_name=? AND status='open' ORDER BY updated_at DESC", [customer])]
    else:
        rows += [serialize_item(r, 'inventory') for r in db.fetchall("SELECT * FROM inventory ORDER BY updated_at DESC LIMIT 500")]
    return jsonify({'ok': True, 'items': rows})


@app.post('/api/shipping/preview')
@login_required
def api_shipping_preview():
    data = body_json()
    items = data.get('items') or []
    weight_unit = float(data.get('weight_unit') or 0)
    preview = []
    total_volume = 0.0
    for req_item in items:
        source = req_item.get('source')
        item_id = int(req_item.get('id') or 0)
        table = db.table_for_module(source)
        row = db.fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
        if not row:
            continue
        take_pieces = int(req_item.get('pieces') or row.get('pieces') or 0)
        volume, formula = calc_volume_for_item(row)
        # Scale simple volume by piece ratio when partial shipment.
        original_pieces = int(row.get('pieces') or take_pieces or 1)
        if original_pieces and take_pieces != original_pieces:
            volume = round(volume * take_pieces / original_pieces, 4)
        total_volume += volume
        preview.append({
            'id': item_id,
            'source': source,
            'customer_name': row.get('customer_name') or data.get('customer_name') or '庫存',
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
    return jsonify({'ok': True, 'items': preview, 'total_volume': round(total_volume,4), 'total_weight': round(total_volume * weight_unit,4)})


@app.post('/api/shipping/confirm')
@login_required
def api_shipping_confirm():
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    items = data.get('items') or []
    weight_unit = float(data.get('weight_unit') or 0)
    results = []
    for req_item in items:
        source = req_item.get('source')
        item_id = int(req_item.get('id') or 0)
        table = db.table_for_module(source)
        row = db.fetchone(f"SELECT * FROM {table} WHERE id=?", [item_id])
        if not row:
            continue
        take = int(req_item.get('pieces') or row.get('pieces') or 0)
        before = int(row.get('pieces') or 0)
        if take <= 0 or take > before:
            return api_error(f"{row.get('product_text')} 數量不足")
        volume, _ = calc_volume_for_item(row)
        if before:
            volume = round(volume * take / before, 4)
        after = before - take
        if after <= 0:
            db.execute(f"DELETE FROM {table} WHERE id=?", [item_id])
        else:
            db.execute(f"UPDATE {table} SET pieces=?, updated_at=? WHERE id=?", [after, db.now(), item_id])
        db.execute("""INSERT INTO shipping_records(customer_name, source_table, source_id, product_text, material, pieces,
            volume, weight_unit, total_weight, operator, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            [row.get('customer_name',''), source, item_id, row.get('product_text',''), row.get('material',''), take,
             volume, weight_unit, round(volume*weight_unit,4), current_user(), db.now()])
        label = {'master': '扣除總單', 'orders': '扣除訂單', 'inventory': '扣除庫存'}.get(source, '扣除資料')
        db.add_activity('出貨', row.get('customer_name',''), row.get('product_text',''), f'{label}：{before} → {after}', current_user())
        results.append({'source': source, 'id': item_id, 'before': before, 'after': after, 'pieces': take, 'label': label})
    return jsonify({'ok': True, 'results': results})


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
    for r in rows:
        try:
            r['items'] = json.loads(r.get('items_json') or '[]')
        except Exception:
            r['items'] = []
    return jsonify({'ok': True, 'cells': rows})


@app.post('/api/warehouse/cell')
@login_required
def api_warehouse_cell():
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    zone = data.get('zone') or 'A'
    band = int(data.get('band') or 1)
    row_name = data.get('row_name') or 'front'
    slot = int(data.get('slot') or 1)
    items = data.get('items') or []
    payload = json.dumps(items, ensure_ascii=False)
    existing = db.fetchone("SELECT id FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?", [zone, band, row_name, slot])
    if existing:
        db.execute("UPDATE warehouse_cells SET items_json=?, updated_at=? WHERE id=?", [payload, db.now(), existing['id']])
    else:
        db.execute("INSERT INTO warehouse_cells(zone, band, row_name, slot, items_json, updated_at) VALUES(?,?,?,?,?,?)", [zone, band, row_name, slot, payload, db.now()])
    db.add_activity('倉庫更新', '', f'{zone}-{band}-{row_name}-{slot}', '更新倉庫格子', current_user())
    return jsonify({'ok': True})


@app.post('/api/warehouse/insert-slot')
@login_required
def api_warehouse_insert_slot():
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    zone = data.get('zone') or 'A'; band = int(data.get('band') or 1); row_name = data.get('row_name') or 'front'; after_slot = int(data.get('slot') or 10)
    rows = db.fetchall("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot>? ORDER BY slot DESC", [zone, band, row_name, after_slot])
    for r in rows:
        db.execute("UPDATE warehouse_cells SET slot=? WHERE id=?", [int(r['slot'])+1, r['id']])
    db.execute("INSERT INTO warehouse_cells(zone, band, row_name, slot, items_json, updated_at) VALUES(?,?,?,?,?,?)", [zone, band, row_name, after_slot+1, '[]', db.now()])
    db.add_activity('倉庫插入格子', '', f'{zone}-{band}-{row_name}-{after_slot+1}', '長按插入格子', current_user())
    return jsonify({'ok': True})


@app.post('/api/warehouse/delete-slot')
@login_required
def api_warehouse_delete_slot():
    data = body_json()
    if db.check_request_key(data.get('request_key')):
        return jsonify({'ok': True, 'duplicate': True})
    zone = data.get('zone') or 'A'; band = int(data.get('band') or 1); row_name = data.get('row_name') or 'front'; slot = int(data.get('slot') or 1)
    db.execute("DELETE FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?", [zone, band, row_name, slot])
    rows = db.fetchall("SELECT * FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot>? ORDER BY slot", [zone, band, row_name, slot])
    for r in rows:
        db.execute("UPDATE warehouse_cells SET slot=? WHERE id=?", [int(r['slot'])-1, r['id']])
    db.add_activity('倉庫刪除格子', '', f'{zone}-{band}-{row_name}-{slot}', '長按刪除格子', current_user())
    return jsonify({'ok': True})


@app.get('/api/activity')
@login_required
def api_activity():
    rows = db.fetchall("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 200")
    unread = db.fetchone("SELECT COUNT(*) AS c FROM activity_logs WHERE unread=?", [db.flag(True)])
    return jsonify({'ok': True, 'items': rows, 'unread': int((unread or {}).get('c') or 0)})


@app.post('/api/activity/read')
@login_required
def api_activity_read():
    db.execute("UPDATE activity_logs SET unread=? WHERE unread=?", [db.flag(False), db.flag(True)])
    return jsonify({'ok': True})


@app.delete('/api/activity/<int:log_id>')
@login_required
def api_activity_delete(log_id):
    db.execute("DELETE FROM activity_logs WHERE id=?", [log_id])
    return jsonify({'ok': True})


@app.get('/api/activity/unlisted')
@login_required
def api_activity_unlisted():
    counts = {}
    for name, table in [('庫存', 'inventory'), ('訂單', 'orders'), ('總單', 'master_orders')]:
        row = db.fetchone(f"SELECT COALESCE(SUM(pieces),0) AS c FROM {table} WHERE COALESCE(warehouse_key,'')=''" + (" AND status='open'" if table=='orders' else ""))
        counts[name] = int((row or {}).get('c') or 0)
    return jsonify({'ok': True, 'counts': counts, 'total': sum(counts.values())})


@app.get('/api/settings/users')
@login_required
def api_settings_users():
    if not is_admin():
        return api_error('只有管理員可查看使用者', 403)
    users = db.fetchall("SELECT id, username, role, is_blocked, created_at FROM users ORDER BY created_at DESC")
    return jsonify({'ok': True, 'users': users})


@app.post('/api/settings/users/<int:user_id>/block')
@login_required
def api_block_user(user_id):
    if not is_admin():
        return api_error('只有管理員可封鎖使用者', 403)
    data = body_json()
    blocked = db.flag(data.get('blocked', True))
    db.execute("UPDATE users SET is_blocked=? WHERE id=?", [blocked, user_id])
    db.add_activity('帳號管理', '', '', '封鎖/解除封鎖使用者', current_user())
    return jsonify({'ok': True})


@app.post('/api/settings/password')
@login_required
def api_change_password():
    data = body_json()
    password = data.get('password') or ''
    if len(password) < 3:
        return api_error('密碼至少 3 碼')
    db.execute("UPDATE users SET password_hash=? WHERE username=?", [generate_password_hash(password), current_user()])
    return jsonify({'ok': True})


@app.get('/api/backup')
@login_required
def api_backup():
    # Simple JSON backup for all core tables.
    payload = {'created_at': db.now(), 'tables': {}}
    for table in ['users','customers','inventory','orders','master_orders','shipping_records','warehouse_cells','activity_logs']:
        payload['tables'][table] = db.fetchall(f"SELECT * FROM {table}")
    os.makedirs('backups', exist_ok=True)
    path = os.path.join('backups', 'yuanxing_backup.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return send_file(path, as_attachment=True, download_name=f"yuanxing_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")


@app.get('/api/health')
@login_required
def api_health():
    return jsonify({
        'ok': True,
        'version': 'YUANXING_CLEAN_V1_DBBOOT_FIX',
        'page_scripts': 'single-page-only',
        'old_fix_loaded': False,
        'shipping_records_page': False,
        'database': 'postgres' if db.IS_PG else 'sqlite',
    })


@app.errorhandler(Exception)
def handle_exception(e):
    detail = str(e)[:500]
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
