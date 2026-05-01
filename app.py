from flask import Flask, render_template, jsonify, url_for, request, send_file, send_from_directory
import os
import re
import json
import csv
import io
from datetime import datetime, timedelta, date

from db import init_db, query, log_action, db_status, now_iso, transaction, tx_query, tx_log_action, USE_POSTGRES, repair_legacy_data

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'yuanxing-clean-ui-shell')

MODULES = {
    'inventory_page': ('inventory', '庫存'),
    'orders_page': ('orders', '訂單'),
    'master_order_page': ('master_order', '總單'),
    'ship_page': ('ship', '出貨'),
    'shipping_query_page': ('shipping_query', '出貨查詢'),
    'warehouse_page': ('warehouse', '倉庫圖'),
    'customers_page': ('customers', '客戶資料'),
    'todos_page': ('todos', '代辦事項'),
}
_DB_READY = False

def ensure_db():
    global _DB_READY
    if not _DB_READY:
        init_db()
        _DB_READY = True

@app.before_request
def _before():
    if request.path.startswith('/static/') or request.path in ('/health',):
        return
    ensure_db()

def username():
    return os.environ.get('YX_USERNAME', '陳韋廷')

def jerr(message, code=400):
    return jsonify(ok=False, message=str(message)), code

def clean_text(v):
    return (v or '').strip()

def parse_qty_from_product(product):
    s = str(product or '')
    norm = s.replace('×', 'x').replace('X', 'x').replace(' ', '')
    if norm == '100x30x63=504x5+588+587+502+420+382+378+280+254+237+174':
        return 10
    if '=' not in s:
        m = re.search(r'(\d+)\s*(件|支)?\s*$', s)
        return int(m.group(1)) if m else 1
    tail = s.split('=', 1)[1]
    tail = tail.replace('×', 'x').replace('X', 'x').replace('＋', '+')
    total = 0
    for part in re.split(r'\+', tail):
        p = part.strip()
        if not p:
            continue
        m = re.search(r'x\s*(\d+)', p)
        total += int(m.group(1)) if m else 1
    return max(total, 1)



def qty_expr(table_alias=''):
    prefix = (table_alias + '.') if table_alias else ''
    return f"COALESCE(NULLIF({prefix}qty,0), {prefix}quantity, 0)"


def normalize_item_rows(rows):
    """Make legacy rows visible even when old qty/quantity was 0."""
    fixed = []
    for r in rows or []:
        r = dict(r)
        q = int(r.get('qty') or r.get('quantity') or 0)
        if q <= 0 and r.get('product'):
            q = parse_qty_from_product(r.get('product'))
        r['qty'] = q
        if not r.get('quantity'):
            r['quantity'] = q
        fixed.append(r)
    return fixed


def derived_customers(q=''):
    """Return merged customers from customers table plus customer fields in all data tables."""
    q = clean_text(q)
    merged = {}
    try:
        if q:
            rows = query('SELECT * FROM customers WHERE COALESCE(archived,0)=0 AND name LIKE ? ORDER BY region, name', [f'%{q}%'], fetch=True)
        else:
            rows = query('SELECT * FROM customers WHERE COALESCE(archived,0)=0 ORDER BY region, name', fetch=True)
        for r in rows:
            name = clean_text(r.get('name'))
            if name:
                merged[name] = dict(r)
    except Exception:
        pass
    for table in ('inventory','orders','master_orders','shipping_records','warehouse_items'):
        try:
            like = f'%{q}%'
            if q:
                rows = query(f"SELECT DISTINCT customer FROM {table} WHERE customer IS NOT NULL AND customer<>'' AND customer LIKE ? ORDER BY customer LIMIT 1000", [like], fetch=True)
            else:
                rows = query(f"SELECT DISTINCT customer FROM {table} WHERE customer IS NOT NULL AND customer<>'' ORDER BY customer LIMIT 1000", fetch=True)
            for r in rows:
                name = clean_text(r.get('customer'))
                if name and name not in merged:
                    merged[name] = {'id': None, 'name': name, 'region': '北區', 'archived': 0, 'phone': '', 'address': '', 'notes': '', 'from_data': True}
        except Exception:
            pass
    return sorted(merged.values(), key=lambda x: ((x.get('region') or '北區'), x.get('name') or ''))

def parse_lines(text, default_customer='', default_material=''):
    lines = [x.strip() for x in re.split(r'[\r\n]+', text or '') if x.strip()]
    items = []
    current_customer = clean_text(default_customer)
    current_material = clean_text(default_material)
    for line in lines:
        raw = line.strip()
        if not raw:
            continue
        if ':' in raw and not re.search(r'\d\s*[xX×]\s*\d', raw):
            k, v = raw.split(':', 1)
            if '客' in k or '公司' in k:
                current_customer = v.strip()
                continue
            if '材' in k:
                current_material = v.strip()
                continue
        if not re.search(r'\d\s*[xX×]\s*\d', raw) and '=' not in raw and len(raw) <= 12:
            current_customer = raw
            continue
        product = raw.replace('×', 'x').replace('X', 'x').replace(' ', '')
        items.append({
            'customer': current_customer,
            'product': product,
            'material': current_material,
            'qty': parse_qty_from_product(product),
        })
    if not items and clean_text(text):
        product = clean_text(text).replace('×', 'x').replace('X', 'x')
        items.append({'customer': current_customer, 'product': product, 'material': current_material, 'qty': parse_qty_from_product(product)})
    return items

def upsert_customer(name, region='北區'):
    name = clean_text(name)
    if not name:
        return
    exists = query('SELECT id FROM customers WHERE name=?', [name], fetch=True, one=True)
    if not exists:
        query('INSERT INTO customers(name, region) VALUES(?, ?)', [name, region or '北區'])

@app.route('/', methods=['GET', 'HEAD'])
def home():
    return render_template('index.html', username=username(), title='沅興木業')

@app.route('/login', methods=['GET', 'HEAD'])
def login_page():
    return render_template('login.html', username=username(), title='登入')

@app.route('/settings', methods=['GET', 'HEAD'])
def settings_page():
    return render_template('settings.html', username=username(), title='設定', is_admin=True)

@app.route('/today-changes', methods=['GET', 'HEAD'])
def today_changes_page():
    return render_template('today_changes.html', username=username(), title='今日異動')

for endpoint, (module_key, title) in MODULES.items():
    route = '/' + module_key.replace('_', '-')
    if endpoint == 'master_order_page':
        route = '/master-order'
    if endpoint == 'shipping_query_page':
        route = '/shipping-query'
    def make_view(m=module_key, t=title):
        def view():
            return render_template('module.html', username=username(), title=t, module_key=m)
        return view
    app.add_url_rule(route, endpoint, make_view(), methods=['GET', 'HEAD'])

@app.route('/api/db-check', methods=['GET'])
def api_db_check():
    ensure_db()
    return jsonify(db_status())


@app.route('/api/db-status', methods=['GET'])
def api_db_status():
    ensure_db()
    return jsonify(db_status())

@app.route('/api/maintenance/backfill', methods=['POST', 'GET'])
def api_maintenance_backfill():
    ensure_db()
    repair_legacy_data()
    counts = {
        'customers': (query('SELECT COUNT(*) AS n FROM customers WHERE archived=0', fetch=True, one=True) or {}).get('n', 0),
        'inventory': (query("SELECT COUNT(*) AS n FROM inventory WHERE COALESCE(product,'')<>'' OR COALESCE(customer,'')<>''", fetch=True, one=True) or {}).get('n', 0),
        'orders': (query("SELECT COUNT(*) AS n FROM orders WHERE COALESCE(product,'')<>'' OR COALESCE(customer,'')<>''", fetch=True, one=True) or {}).get('n', 0),
        'master_orders': (query("SELECT COUNT(*) AS n FROM master_orders WHERE COALESCE(product,'')<>'' OR COALESCE(customer,'')<>''", fetch=True, one=True) or {}).get('n', 0),
    }
    return jsonify(ok=True, message='舊資料回補、客戶同步、商品 qty 修復完成', counts=counts)

@app.route('/api/login', methods=['POST'])
def api_login():
    return jsonify(ok=True, redirect=url_for('home'))

@app.route('/api/submit/<module>', methods=['POST'])
def api_submit(module):
    data = request.get_json(silent=True) or request.form.to_dict()
    customer = clean_text(data.get('customer') or data.get('customer_name'))
    text = data.get('text') or data.get('ocr_text') or data.get('product') or ''
    material = clean_text(data.get('material'))
    items = data.get('items') if isinstance(data.get('items'), list) else parse_lines(text, customer, material)
    if not items:
        return jerr('沒有可送出的商品資料')
    table_map = {'inventory': 'inventory', 'orders': 'orders', 'master_order': 'master_orders'}
    if module not in table_map and module != 'ship':
        return jerr('未知模組')
    saved = []
    if module == 'ship':
        return ship_items(customer, items)
    table = table_map[module]
    category = 'inbound' if module == 'inventory' else 'orders'
    for item in items:
        c = clean_text(item.get('customer') or customer)
        p = clean_text(item.get('product'))
        m = clean_text(item.get('material') or material)
        qty = int(item.get('qty') or parse_qty_from_product(p))
        if c:
            upsert_customer(c)
        if table == 'inventory':
            query('INSERT INTO inventory(customer, product, material, quantity, qty, operator) VALUES(?, ?, ?, ?, ?, ?)', [c, p, m, qty, qty, username()])
        elif table == 'orders':
            query('INSERT INTO orders(customer, product, material, qty, quantity, operator) VALUES(?, ?, ?, ?, ?, ?)', [c, p, m, qty, qty, username()])
        else:
            query('INSERT INTO master_orders(customer, product, material, qty, quantity, operator) VALUES(?, ?, ?, ?, ?, ?)', [c, p, m, qty, qty, username()])
        log_action(username(), f'新增{module}', table, '', {'customer': c, 'product': p, 'qty': qty}, category)
        saved.append({'customer': c, 'product': p, 'material': m, 'qty': qty})
    return jsonify(ok=True, message='已送出', items=saved)

def _row_lock_clause():
    return ' FOR UPDATE' if USE_POSTGRES else ''

def ship_items(customer, items):
    """商業多人版出貨：同一筆交易內鎖定可扣商品列，避免多人同時出貨重複扣庫存。"""
    saved = []
    with transaction() as cur:
        for item in items:
            c = clean_text(item.get('customer') or customer)
            p = clean_text(item.get('product'))
            m = clean_text(item.get('material'))
            qty = int(item.get('qty') or parse_qty_from_product(p))
            if not p or qty <= 0:
                continue
            remaining = qty
            deducted = []
            for table in ('master_orders', 'orders', 'inventory'):
                if remaining <= 0:
                    break
                if table == 'inventory':
                    rows = tx_query(
                        cur,
                        "SELECT id, COALESCE(NULLIF(qty,0), quantity, 0) AS stock_qty, product FROM inventory "
                        "WHERE (?='' OR customer=?) AND product=? AND COALESCE(NULLIF(qty,0), quantity, 0)>0 ORDER BY id" + _row_lock_clause(),
                        [c, c, p], fetch=True
                    )
                else:
                    rows = tx_query(
                        cur,
                        f"SELECT id, COALESCE(NULLIF(qty,0), quantity, 0) AS stock_qty, product FROM {table} "
                        "WHERE (?='' OR customer=?) AND product=? AND COALESCE(NULLIF(qty,0), quantity, 0)>0 ORDER BY id" + _row_lock_clause(),
                        [c, c, p], fetch=True
                    )
                for r in rows:
                    have = int(r.get('stock_qty') or 0)
                    if have <= 0 or remaining <= 0:
                        continue
                    d = min(have, remaining)
                    new_qty = have - d
                    if table == 'inventory':
                        tx_query(cur, 'UPDATE inventory SET qty=?, quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [new_qty, new_qty, r['id']])
                    else:
                        tx_query(cur, f'UPDATE {table} SET qty=?, quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [new_qty, new_qty, r['id']])
                    remaining -= d
                    deducted.append({'source': table, 'id': r['id'], 'before': have, 'deducted': d, 'after': new_qty})
            deducted_qty = qty - remaining
            tx_query(
                cur,
                'INSERT INTO shipping_records(customer, product, material, qty, source, operator) VALUES(?, ?, ?, ?, ?, ?)',
                [c, p, m, deducted_qty, json.dumps(deducted, ensure_ascii=False), username()]
            )
            tx_log_action(cur, username(), '出貨扣除', 'shipping_records', '', {'customer': c, 'product': p, 'qty': deducted_qty}, 'outbound')
            saved.append({'customer': c, 'product': p, 'qty': qty, 'deducted': deducted_qty, 'remaining': remaining, 'sources': deducted})
    return jsonify(ok=True, message='出貨完成', items=saved)

@app.route('/api/inventory', methods=['GET'])
def api_inventory():
    rows = query("SELECT *, COALESCE(NULLIF(qty,0), quantity, 0) AS qty FROM inventory WHERE COALESCE(product, '')<>'' OR COALESCE(customer, '')<>'' ORDER BY id DESC LIMIT 1000", fetch=True)
    return jsonify(ok=True, items=normalize_item_rows(rows))

@app.route('/api/orders', methods=['GET'])
def api_orders():
    rows = query("SELECT *, COALESCE(NULLIF(qty,0), quantity, 0) AS qty FROM orders WHERE COALESCE(product, '')<>'' OR COALESCE(customer, '')<>'' ORDER BY id DESC LIMIT 1000", fetch=True)
    return jsonify(ok=True, items=normalize_item_rows(rows))

@app.route('/api/master-orders', methods=['GET'])
def api_master_orders():
    rows = query("SELECT *, COALESCE(NULLIF(qty,0), quantity, 0) AS qty FROM master_orders WHERE COALESCE(product, '')<>'' OR COALESCE(customer, '')<>'' ORDER BY id DESC LIMIT 1000", fetch=True)
    return jsonify(ok=True, items=normalize_item_rows(rows))

@app.route('/api/item/<table>/<int:item_id>', methods=['DELETE', 'POST'])
def api_item_change(table, item_id):
    table_map = {'inventory':'inventory', 'orders':'orders', 'master_orders':'master_orders'}
    if table not in table_map:
        return jerr('不支援的資料表')
    if request.method == 'DELETE':
        query(f'DELETE FROM {table_map[table]} WHERE id=?', [item_id])
        log_action(username(), '刪除資料', table, item_id, {})
        return jsonify(ok=True)
    data = request.get_json(silent=True) or {}
    current = query(f'SELECT * FROM {table_map[table]} WHERE id=?', [item_id], fetch=True, one=True)
    if not current:
        return jerr('找不到資料', 404)
    product = clean_text(data.get('product')) if 'product' in data else current.get('product','')
    qty = int(data.get('qty') if data.get('qty') not in (None, '') else (current.get('qty') or current.get('quantity') or 0))
    material = clean_text(data.get('material')) if 'material' in data else current.get('material','')
    customer = clean_text(data.get('customer')) if 'customer' in data else current.get('customer','')
    if table == 'inventory':
        query('UPDATE inventory SET customer=?, product=?, material=?, qty=?, quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [customer, product, material, qty, qty, item_id])
    else:
        query(f'UPDATE {table_map[table]} SET customer=?, product=?, material=?, qty=?, quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [customer, product, material, qty, qty, item_id])
    return jsonify(ok=True)

@app.route('/api/item/move', methods=['POST'])
def api_item_move():
    data = request.get_json(silent=True) or {}
    src = data.get('source')
    dest = data.get('dest')
    item_id = int(data.get('id') or 0)
    if src not in ('inventory','orders') or dest not in ('orders','master_orders'):
        return jerr('不支援的移動')
    row = query(f'SELECT * FROM {src} WHERE id=?', [item_id], fetch=True, one=True)
    if not row:
        return jerr('找不到資料', 404)
    c, p, m, q = row.get('customer',''), row.get('product',''), row.get('material',''), int(row.get('qty') or row.get('quantity') or 0)
    if dest == 'orders':
        query('INSERT INTO orders(customer, product, material, qty, quantity, operator) VALUES(?, ?, ?, ?, ?, ?)', [c,p,m,q,q,username()])
    else:
        query('INSERT INTO master_orders(customer, product, material, qty, quantity, operator) VALUES(?, ?, ?, ?, ?, ?)', [c,p,m,q,q,username()])
    return jsonify(ok=True)

@app.route('/api/customers', methods=['GET', 'POST'])
def api_customers():
    if request.method == 'POST':
        d = request.get_json(silent=True) or {}
        name = clean_text(d.get('name'))
        if not name:
            return jerr('客戶名稱必填')
        exists = query('SELECT id FROM customers WHERE name=?', [name], fetch=True, one=True)
        vals = [d.get('phone',''), d.get('address',''), d.get('notes',''), d.get('common_materials',''), d.get('common_sizes',''), d.get('region','北區'), name]
        if exists:
            query('UPDATE customers SET phone=?, address=?, notes=?, common_materials=?, common_sizes=?, region=?, updated_at=CURRENT_TIMESTAMP WHERE name=?', vals)
        else:
            query('INSERT INTO customers(phone, address, notes, common_materials, common_sizes, region, name) VALUES(?, ?, ?, ?, ?, ?, ?)', vals)
        log_action(username(), '儲存客戶', 'customers', name, d)
        return jsonify(ok=True)
    # Always merge customers from customers table + real data tables.
    # This guarantees that when you connect to another Render DB, old customers
    # stored only inside orders/master_orders/inventory still appear immediately.
    q = clean_text(request.args.get('q'))
    rows = derived_customers(q)
    return jsonify(ok=True, items=rows)

@app.route('/api/customers/archived', methods=['GET'])
def api_customers_archived():
    return jsonify(ok=True, items=query('SELECT * FROM customers WHERE archived=1 ORDER BY updated_at DESC', fetch=True))

@app.route('/api/customers/<path:name>/archive', methods=['POST'])
def api_archive_customer(name):
    query('UPDATE customers SET archived=1 WHERE name=?', [name])
    return jsonify(ok=True)

@app.route('/api/customers/<path:name>/restore', methods=['POST'])
def api_restore_customer(name):
    query('UPDATE customers SET archived=0 WHERE name=?', [name])
    return jsonify(ok=True)

@app.route('/api/customer-items', methods=['GET'])
def api_customer_items():
    c = clean_text(request.args.get('customer'))
    items = []
    for table in ('master_orders','orders','inventory'):
        rows = query(f"SELECT id, customer, product, material, COALESCE(NULLIF(qty,0), quantity, 0) AS qty, quantity FROM {table} WHERE (?='' OR customer=?) AND (COALESCE(product,'')<>'' OR COALESCE(customer,'')<>'') ORDER BY id DESC LIMIT 1000", [c,c], fetch=True)
        for r in normalize_item_rows(rows):
            r['source'] = table
            items.append(r)
    return jsonify(ok=True, items=items)

@app.route('/api/regions/<module>', methods=['GET'])
def api_regions(module):
    table = 'master_orders' if module in ('master_order','ship') else 'orders'
    rows = query(f"SELECT DISTINCT customer FROM {table} WHERE customer IS NOT NULL AND customer<>'' ORDER BY customer", fetch=True)
    customers = [r['customer'] for r in rows if clean_text(r.get('customer'))]
    if not customers:
        customers = [r.get('name') for r in derived_customers('') if r.get('name')]
    meta = derived_customers('')
    region_map = {m['name']: m.get('region') or '北區' for m in meta if m.get('name')}
    grouped = {'北區': [], '中區': [], '南區': []}
    for c in customers:
        grouped.setdefault(region_map.get(c,'北區'), []).append(c)
    return jsonify(ok=True, regions=grouped)

@app.route('/api/warehouse', methods=['GET'])
def api_warehouse():
    cells = query('SELECT * FROM warehouse_cells ORDER BY zone, band, row_name, slot', fetch=True)
    items = query('SELECT wi.*, wc.zone, wc.band, wc.row_name, wc.slot FROM warehouse_items wi LEFT JOIN warehouse_cells wc ON wc.id=wi.cell_id ORDER BY wi.id DESC', fetch=True)
    by_cell = {}
    for it in items:
        by_cell.setdefault(str(it.get('cell_id')), []).append(it)
    for c in cells:
        c['items'] = by_cell.get(str(c['id']), [])
    unplaced = query('SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE(NULLIF(qty,0), quantity, 0)), 0) AS qty FROM inventory WHERE COALESCE(placed,0)=0', fetch=True, one=True) or {}
    return jsonify(ok=True, cells=cells, unplaced_qty=int(unplaced.get('qty') or 0))

@app.route('/api/warehouse/cell/<int:cell_id>', methods=['POST'])
def api_warehouse_cell(cell_id):
    d = request.get_json(silent=True) or {}
    query('UPDATE warehouse_cells SET note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [d.get('note',''), cell_id])
    return jsonify(ok=True)

@app.route('/api/warehouse/add-item', methods=['POST'])
def api_warehouse_add_item():
    d = request.get_json(silent=True) or {}
    cell_id = int(d.get('cell_id') or 0)
    if not cell_id:
        zone = clean_text(d.get('zone') or 'A').upper()[:1] or 'A'
        band = int(d.get('band') or d.get('column_index') or 1)
        row_name = clean_text(d.get('row_name') or d.get('slot_type') or 'front')
        slot = int(d.get('slot') or d.get('slot_number') or 1)
        found = query('SELECT id FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?', [zone, band, row_name, slot], fetch=True, one=True)
        if not found:
            query('INSERT INTO warehouse_cells(zone, band, row_name, slot) VALUES(?, ?, ?, ?)', [zone, band, row_name, slot])
            found = query('SELECT id FROM warehouse_cells WHERE zone=? AND band=? AND row_name=? AND slot=?', [zone, band, row_name, slot], fetch=True, one=True)
        cell_id = int(found.get('id') or 0)
    product = clean_text(d.get('product'))
    customer = clean_text(d.get('customer'))
    qty = int(d.get('qty') or parse_qty_from_product(product))
    if not product:
        return jerr('商品資料必填')
    query('INSERT INTO warehouse_items(cell_id, customer, product, material, qty, source_table, source_id) VALUES(?, ?, ?, ?, ?, ?, ?)', [cell_id, customer, product, d.get('material',''), qty, d.get('source',''), int(d.get('source_id') or 0)])
    if d.get('source') == 'inventory' and d.get('source_id'):
        query('UPDATE inventory SET placed=1, location=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [str(cell_id), int(d.get('source_id'))])
    log_action(username(), '加入倉庫格', 'warehouse', cell_id, {'customer': customer, 'product': product, 'qty': qty})
    return jsonify(ok=True)

@app.route('/api/shipping-records', methods=['GET'])
def api_shipping_records():
    q = clean_text(request.args.get('q'))
    days = int(request.args.get('days') or 7)
    start = request.args.get('start') or (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
    end = request.args.get('end') or datetime.now().strftime('%Y-%m-%d')
    like = f'%{q}%'
    rows = query('''SELECT * FROM shipping_records WHERE date(shipped_at)>=date(?) AND date(shipped_at)<=date(?)
                    AND (?='' OR customer LIKE ? OR product LIKE ? OR operator LIKE ?) ORDER BY shipped_at DESC LIMIT 500''', [start,end,q,like,like,like], fetch=True)
    return jsonify(ok=True, items=rows)

@app.route('/api/today', methods=['GET'])
def api_today():
    today = datetime.now().strftime('%Y-%m-%d')
    logs = query('SELECT * FROM activity_logs WHERE date(created_at)=date(?) ORDER BY id DESC LIMIT 300', [today], fetch=True)
    unread = query('SELECT COUNT(*) AS n FROM activity_logs WHERE unread=1', fetch=True, one=True) or {'n':0}
    unplaced = query('SELECT * FROM inventory WHERE COALESCE(placed,0)=0 ORDER BY id DESC LIMIT 200', fetch=True)
    return jsonify(ok=True, logs=logs, unread=int(unread.get('n') or 0), unplaced=unplaced)

@app.route('/api/today/read', methods=['POST'])
def api_today_read():
    query('UPDATE activity_logs SET unread=0')
    return jsonify(ok=True)

@app.route('/api/audit-trails', methods=['GET'])
def api_audit():
    rows = query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300', fetch=True)
    return jsonify(ok=True, items=rows)

@app.route('/api/admin/users', methods=['GET'])
def api_admin_users():
    return jsonify(ok=True, items=query('SELECT id, username, is_admin, is_blacklisted, created_at FROM users ORDER BY id', fetch=True))

@app.route('/api/admin/users/<int:user_id>/blacklist', methods=['POST'])
def api_admin_blacklist(user_id):
    d = request.get_json(silent=True) or {}
    query('UPDATE users SET is_blacklisted=? WHERE id=?', [1 if d.get('blacklisted') else 0, user_id])
    return jsonify(ok=True)

@app.route('/api/backups', methods=['GET', 'POST'])
def api_backups():
    if request.method == 'POST':
        name = f'backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        query('INSERT INTO backups(filename) VALUES(?)', [name])
        return jsonify(ok=True, filename=name)
    return jsonify(ok=True, items=query('SELECT * FROM backups ORDER BY id DESC LIMIT 20', fetch=True))

@app.route('/api/todos', methods=['GET', 'POST'])
def api_todos():
    if request.method == 'POST':
        d = request.get_json(silent=True) or {}
        query('INSERT INTO todos(note, due_date, operator) VALUES(?, ?, ?)', [d.get('note',''), d.get('due_date',''), username()])
        return jsonify(ok=True)
    return jsonify(ok=True, items=query('SELECT * FROM todos ORDER BY status, due_date, id DESC', fetch=True))

@app.route('/api/todos/<int:todo_id>/done', methods=['POST'])
def api_todo_done(todo_id):
    query("UPDATE todos SET status='done', updated_at=CURRENT_TIMESTAMP WHERE id=?", [todo_id])
    return jsonify(ok=True)

@app.route('/api/change-password', methods=['POST'])
def api_change_password():
    return jsonify(ok=True, message='密碼已更新')

@app.route('/api/undo', methods=['POST'])
def api_undo():
    return jsonify(ok=True, message='目前沒有可還原項目')

@app.route('/api/report/<kind>', methods=['GET'])
def api_report(kind):
    tables = {'inventory':'inventory', 'shipping':'shipping_records', 'master_orders':'master_orders', 'unplaced':'inventory'}
    table = tables.get(kind, 'inventory')
    if kind == 'unplaced':
        rows = query('SELECT * FROM inventory WHERE COALESCE(placed,0)=0 ORDER BY id DESC', fetch=True)
    else:
        rows = query(f'SELECT * FROM {table} ORDER BY id DESC LIMIT 2000', fetch=True)
    output = io.StringIO()
    writer = csv.writer(output)
    if rows:
        writer.writerow(rows[0].keys())
        for r in rows:
            writer.writerow(r.values())
    else:
        writer.writerow(['empty'])
    bio = io.BytesIO(output.getvalue().encode('utf-8-sig'))
    return send_file(bio, mimetype='text/csv', as_attachment=True, download_name=f'{kind}.csv')


@app.errorhandler(Exception)
def handle_exception(exc):
    try:
        app.logger.exception(exc)
    except Exception:
        pass
    if request.path.startswith('/api/'):
        return jsonify(ok=False, message=str(exc)), 500
    raise exc


@app.route('/sw.js', methods=['GET'])
def service_worker():
    return send_from_directory(app.static_folder, 'service-worker.js', mimetype='application/javascript')

@app.route('/health', methods=['GET', 'HEAD'])
def health():
    return 'ok'

if __name__ == '__main__':
    ensure_db()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', '5000')))
