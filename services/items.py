import os
from db import execute, fetch_all, fetch_one, now_iso
from services.products import normalize_product_text, total_qty_from_text, deduct_qty_from_product_text, merge_product_texts, product_dimension_key, product_sort_key

TABLES = {
    'inventory': 'inventory', 'stock': 'inventory', 'stocks': 'inventory',
    'orders': 'orders', 'order': 'orders',
    'master_orders': 'master_orders', 'master_order': 'master_orders', 'master': 'master_orders',
}


def normalize_table(source: str) -> str:
    table = TABLES.get(source)
    if not table:
        raise ValueError('未知資料來源')
    return table


def _repair_row_if_needed(table: str, row: dict | None) -> dict | None:
    """Normalize one item row for UI display.

    v8 change: do not write UPDATE during every list render by default.
    The old read-repair caused slow page opening and could trigger long PostgreSQL
    migrations/locks. We coalesce legacy columns in memory so old DB data still
    shows immediately.
    """
    if not row:
        return row
    row = dict(row)
    raw_text = (row.get('product_text') or row.get('product') or row.get('item') or row.get('item_name') or '').strip()
    normalized = normalize_product_text(raw_text)
    expected = total_qty_from_text(normalized) or int(row.get('qty') or row.get('quantity') or 0) or 1
    row['product_text'] = normalized
    row['qty'] = expected
    row['customer_name'] = (row.get('customer_name') or row.get('customer') or row.get('client') or row.get('name') or '').strip()
    row['material'] = (row.get('material') or '').strip()
    row['zone'] = (row.get('zone') or row.get('location') or '').strip()
    if os.environ.get('YX_REPAIR_ON_READ', '0') == '1':
        try:
            execute(f'UPDATE {table} SET product_text=?, qty=?, customer_name=?, updated_at=? WHERE id=?',
                    (row['product_text'], row['qty'], row['customer_name'], now_iso(), row['id']))
        except Exception:
            pass
    return row


def create_item(table: str, customer_uid='', customer_name='', product_text='', material='', zone='', operator='', note='') -> int:
    table = normalize_table(table)
    normalized = normalize_product_text(product_text)
    if not normalized:
        raise ValueError('商品資料不可空白')
    qty = total_qty_from_text(normalized) or 1
    t = now_iso()
    return execute(f'''INSERT INTO {table}(customer_uid,customer_name,product_text,material,qty,zone,operator,note,created_at,updated_at)
                       VALUES(?,?,?,?,?,?,?,?,?,?)''', (
        customer_uid or '', customer_name or '', normalized, material or '', qty, zone or '', operator or '', note or '', t, t
    ))


def list_items(table: str, customer_uid='', customer_name='', zone='', search='', limit=None, offset=0) -> list[dict]:
    table = normalize_table(table)
    where = []
    params = []
    if customer_uid:
        where.append('customer_uid=?')
        params.append(customer_uid)
    filter_customer_name = (customer_name or '').strip()
    # 不直接用 SQL customer_name=?，因舊資料可能在 customer/client/name 欄位。
    # 先讀出來用 _repair_row_if_needed 合併欄位後再篩選，避免總單客戶點了沒商品。
    if zone in ('A', 'B'):
        where.append('zone=?')
        params.append(zone)
    if search:
        where.append('(product_text LIKE ? OR material LIKE ? OR customer_name LIKE ? OR zone LIKE ?)')
        like = f'%{search}%'
        params += [like, like, like, like]
    sql = f'SELECT * FROM {table}' + ((' WHERE ' + ' AND '.join(where)) if where else '') + ' ORDER BY id DESC'
    try:
        limit_val = int(limit if limit is not None else os.environ.get('YX_FAST_LIST_LIMIT', '500'))
    except Exception:
        limit_val = 500
    try:
        offset_val = int(offset or 0)
    except Exception:
        offset_val = 0
    if limit_val > 0:
        sql += ' LIMIT ? OFFSET ?'
        params += [limit_val, offset_val]
    rows = [_repair_row_if_needed(table, row) for row in fetch_all(sql, params)]
    rows = [row for row in rows if row]
    if filter_customer_name:
        rows = [row for row in rows if (row.get('customer_name') or '').strip() == filter_customer_name]
    # UI/business sort: material -> month -> height -> width -> length.
    # This keeps inventory/order/master lists from jumping by updated_at only.
    return sorted(rows, key=lambda row: product_sort_key(row.get('product_text') or '', row.get('material') or '', row.get('qty') or 0))


def get_item(table: str, item_id: int) -> dict | None:
    table = normalize_table(table)
    return _repair_row_if_needed(table, fetch_one(f'SELECT * FROM {table} WHERE id=?', (item_id,)))


def update_item(table: str, item_id: int, **fields) -> dict | None:
    table = normalize_table(table)
    allowed = {'customer_uid','customer_name','product_text','material','qty','zone','location','operator','note'}
    data = {k:v for k,v in fields.items() if k in allowed}
    if 'product_text' in data:
        data['product_text'] = normalize_product_text(data['product_text'])
        data['qty'] = total_qty_from_text(data['product_text']) or int(data.get('qty') or 1)
    data['updated_at'] = now_iso()
    if not data:
        return get_item(table, item_id)
    sets = ','.join([f'{k}=?' for k in data])
    params = list(data.values()) + [item_id]
    execute(f'UPDATE {table} SET {sets} WHERE id=?', params)
    return get_item(table, item_id)


def delete_item(table: str, item_id: int):
    table = normalize_table(table)
    execute(f'DELETE FROM {table} WHERE id=?', (item_id,))


def deduct_item(table: str, item_id: int, qty: int) -> tuple[dict, int, int]:
    row = get_item(table, item_id)
    if not row:
        raise ValueError('找不到商品')
    qty = int(qty or 0)
    if qty <= 0:
        raise ValueError('出貨數量必須大於 0')
    split = deduct_qty_from_product_text(row.get('product_text') or '', qty)
    before = int(row.get('qty') or split['before_qty'] or 0)
    if before < qty:
        raise ValueError(f'數量不足：目前 {before} 件，要扣 {qty} 件')
    after = before - qty
    # Preserve the exact item row before mutation for shipping_records and audit.
    original = dict(row)
    original['deducted_product_text'] = split.get('deducted_text') or row.get('product_text')
    if after == 0 or not split.get('remaining_text'):
        delete_item(table, item_id)
        after = 0
    else:
        execute(f'UPDATE {table} SET qty=?, product_text=?, updated_at=? WHERE id=?', (after, split['remaining_text'], now_iso(), item_id))
    return original, before, after


def find_duplicate_items(table: str, customer_uid: str = '', customer_name: str = '', product_text: str = '', material: str = '') -> list[dict]:
    """Find duplicate items by same customer + same dimension-left + same material.

    Older builds only matched the full product_text exactly, so these two would
    not ask to merge:
      100x30x63=504x5
      100x30x63=588
    The business rule is same customer + same size + same material, so compare
    only the canonical dimension-left side while still returning normal rows.
    """
    table = normalize_table(table)
    key = product_dimension_key(product_text)
    where = []
    params = []
    if material:
        where.append('material=?')
        params.append(material)
    if customer_uid:
        where.append('customer_uid=?')
        params.append(customer_uid)
    elif customer_name:
        where.append('customer_name=?')
        params.append(customer_name)
    if key:
        # Pre-filter by text prefix for speed, then do the canonical comparison below.
        where.append('(product_text=? OR product_text LIKE ?)')
        params.extend([key, f'{key}=%'])
    clause = (' WHERE ' + ' AND '.join(where)) if where else ''
    rows = fetch_all(f'SELECT * FROM {table}{clause} ORDER BY updated_at DESC, id DESC', params)
    if not key:
        return [_repair_row_if_needed(table, row) for row in rows]
    out = []
    for row in rows:
        fixed = _repair_row_if_needed(table, row)
        if fixed and product_dimension_key(fixed.get('product_text') or '') == key:
            out.append(fixed)
    return out


def merge_item_qty(table: str, item_id: int, add_product_text: str, add_qty: int | None = None, operator: str = '') -> dict:
    table = normalize_table(table)
    row = get_item(table, item_id)
    if not row:
        raise ValueError('找不到要合併的商品')
    merged_text = merge_product_texts(row.get('product_text') or '', add_product_text or row.get('product_text') or '', add_qty)
    merged_qty = total_qty_from_text(merged_text) or (int(row.get('qty') or 0) + int(add_qty or 0) or 1)
    execute(f'UPDATE {table} SET product_text=?, qty=?, operator=?, updated_at=? WHERE id=?',
            (merged_text, merged_qty, operator or row.get('operator') or '', now_iso(), item_id))
    return get_item(table, item_id)
