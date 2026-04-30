from db import fetch_all, fetch_one, execute, json_loads, json_dumps, now_iso
from services.products import total_qty_from_text, normalize_product_text
from services.customers import ensure_customer, find_customer_by_uid_or_name

ITEM_TABLES = ('inventory', 'orders', 'master_orders')


def _table_count(table):
    row = fetch_one(f'SELECT COUNT(*) AS c FROM {table}') or {}
    return int(row.get('c') or 0)


def integrity_report():
    """Read-only system health check used before/after deployment or large imports."""
    problems = []
    summary = {
        'inventory': _table_count('inventory'),
        'orders': _table_count('orders'),
        'master_orders': _table_count('master_orders'),
        'shipping_records': _table_count('shipping_records'),
        'warehouse_cells': _table_count('warehouse_cells'),
        'customers': _table_count('customer_profiles'),
        'today_changes_unread': int((fetch_one('SELECT COUNT(*) AS c FROM today_changes WHERE is_read=0') or {}).get('c') or 0),
    }

    for table in ITEM_TABLES:
        rows = fetch_all(f'SELECT id, customer_uid, customer_name, product_text, qty, material, zone FROM {table} ORDER BY id')
        for row in rows:
            expected = total_qty_from_text(row.get('product_text') or '')
            if expected != int(row.get('qty') or 0):
                problems.append({'type': 'qty_mismatch', 'table': table, 'id': row['id'], 'message': f"件數不一致：目前 {row.get('qty')}，應為 {expected}", 'row': row, 'suggested_qty': expected})
            if table != 'inventory' and not (row.get('customer_uid') or row.get('customer_name')):
                problems.append({'type': 'missing_customer', 'table': table, 'id': row['id'], 'message': '訂單/總單缺少客戶', 'row': row})
            if row.get('customer_uid') and row.get('customer_name'):
                c = find_customer_by_uid_or_name(uid=row.get('customer_uid'), name=row.get('customer_name'))
                if not c:
                    problems.append({'type': 'customer_not_found', 'table': table, 'id': row['id'], 'message': '商品關聯的客戶資料不存在', 'row': row})

    cells = fetch_all('SELECT * FROM warehouse_cells ORDER BY zone, column_index, slot_number')
    for cell in cells:
        items = json_loads(cell.get('items_json'), [])
        for idx, item in enumerate(items):
            src = item.get('source')
            source_id = int(item.get('id') or item.get('source_id') or 0)
            if src in ITEM_TABLES and source_id:
                exists = fetch_one(f'SELECT id FROM {src} WHERE id=?', (source_id,))
                if not exists:
                    problems.append({'type': 'warehouse_stale_item', 'table': 'warehouse_cells', 'id': cell['id'], 'message': f"倉庫格有已刪除來源：{src}#{source_id}", 'cell': {'zone': cell['zone'], 'column_index': cell['column_index'], 'slot_number': cell['slot_number']}, 'item_index': idx, 'item': item})

    return {'summary': summary, 'problem_count': len(problems), 'problems': problems[:500]}


def repair_integrity(operator='system', fix_qty=True, fix_customers=True, remove_stale_warehouse=True):
    before = integrity_report()
    actions = []

    if fix_qty:
        for table in ITEM_TABLES:
            rows = fetch_all(f'SELECT id, product_text, qty FROM {table}')
            for row in rows:
                expected = total_qty_from_text(row.get('product_text') or '')
                if expected != int(row.get('qty') or 0):
                    execute(f'UPDATE {table} SET product_text=?, qty=?, updated_at=? WHERE id=?', (normalize_product_text(row.get('product_text') or ''), expected, now_iso(), row['id']))
                    actions.append(f'{table}#{row["id"]} 件數修正為 {expected}')

    if fix_customers:
        for table in ('orders', 'master_orders'):
            rows = fetch_all(f"SELECT id, customer_uid, customer_name FROM {table} WHERE COALESCE(customer_name,'')!=''")
            for row in rows:
                c = find_customer_by_uid_or_name(uid=row.get('customer_uid'), name=row.get('customer_name')) or ensure_customer(row.get('customer_name') or '未指定客戶')
                if c and (row.get('customer_uid') != c.get('uid') or row.get('customer_name') != c.get('name')):
                    execute(f'UPDATE {table} SET customer_uid=?, customer_name=?, updated_at=? WHERE id=?', (c['uid'], c['name'], now_iso(), row['id']))
                    actions.append(f'{table}#{row["id"]} 客戶關聯修正')

    if remove_stale_warehouse:
        cells = fetch_all('SELECT * FROM warehouse_cells')
        for cell in cells:
            items = json_loads(cell.get('items_json'), [])
            cleaned = []
            changed = False
            for item in items:
                src = item.get('source')
                source_id = int(item.get('id') or item.get('source_id') or 0)
                if src in ITEM_TABLES and source_id and not fetch_one(f'SELECT id FROM {src} WHERE id=?', (source_id,)):
                    changed = True
                    continue
                cleaned.append(item)
            if changed:
                execute('UPDATE warehouse_cells SET items_json=?, updated_at=? WHERE id=?', (json_dumps(cleaned), now_iso(), cell['id']))
                actions.append(f"倉庫 {cell['zone']}-{cell['column_index']}-{cell['slot_number']} 移除失效項目")

    after = integrity_report()
    return {'before': before, 'after': after, 'actions': actions, 'operator': operator}
