from db import execute, fetch_all, fetch_one, json_dumps, json_loads, now_iso
from services.products import total_qty_from_text, normalize_product_text, LOCKED_QTY_RULES


def _key(item: dict) -> tuple[str, int]:
    return (item.get('source') or '', int(item.get('id') or item.get('source_id') or 0))


def _normalize_items(items: list[dict]) -> list[dict]:
    out = []
    for idx, item in enumerate(items or []):
        item = dict(item)
        item['source'] = item.get('source') or item.get('source_table') or ''
        item['id'] = int(item.get('id') or item.get('source_id') or 0)
        item['product_text'] = normalize_product_text(item.get('product_text') or '')
        qty = int(item.get('qty') or 0)
        normalized_text = item.get('product_text') or ''
        expected_qty = total_qty_from_text(normalized_text)
        # 商品本身的總件數會鎖死，但倉庫格允許「部分放入」。
        # 因此只修正空值、超過總件數、或舊版沒有 placement_uid 且曾被算錯的鎖死商品。
        if expected_qty and (qty <= 0 or qty > expected_qty):
            qty = expected_qty
        elif normalized_text in LOCKED_QTY_RULES and not item.get('placement_uid') and qty in (10,):
            qty = expected_qty
        item['qty'] = qty
        item['placement_label'] = item.get('placement_label') or '前排'
        item['placement_uid'] = item.get('placement_uid') or f"{item.get('source','')}-{item.get('id',0)}-{now_iso()}-{idx}"
        out.append(item)
    return out


def list_cells(zone: str = '') -> list[dict]:
    params = []
    where = ''
    if zone in ('A', 'B'):
        where = 'WHERE zone=?'
        params.append(zone)
    rows = fetch_all(f'SELECT * FROM warehouse_cells {where} ORDER BY zone, column_index, slot_number', params)
    for row in rows:
        row['items'] = _normalize_items(json_loads(row.pop('items_json', '[]'), []))
        row['summary'] = summarize_cell(row['items'])
    return rows


def summarize_cell(items: list[dict]) -> dict:
    names = []
    qtys = []
    for item in items or []:
        name = item.get('customer_name') or '庫存'
        if name not in names:
            names.append(name)
        qtys.append(int(item.get('qty') or 0))
    total = sum(qtys)
    return {
        'names': '/'.join(names) if names else '',
        'qty_expr': '+'.join(str(q) for q in qtys if q) if qtys else '',
        'total_qty': total,
    }


def get_cell(zone: str, column_index: int, slot_number: int) -> dict | None:
    row = fetch_one('SELECT * FROM warehouse_cells WHERE zone=? AND column_index=? AND slot_number=?', (zone, column_index, slot_number))
    if not row:
        return None
    row['items'] = _normalize_items(json_loads(row.pop('items_json', '[]'), []))
    row['summary'] = summarize_cell(row['items'])
    return row


def update_cell(zone: str, column_index: int, slot_number: int, items: list[dict], note: str = '') -> dict:
    items = _normalize_items(items or [])
    row = fetch_one('SELECT * FROM warehouse_cells WHERE zone=? AND column_index=? AND slot_number=?', (zone, column_index, slot_number))
    if not row:
        execute('''INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at) VALUES(?,?,?,?,?,?,?)''',
                (zone, column_index, 'direct', slot_number, json_dumps(items), note or '', now_iso()))
    else:
        execute('''UPDATE warehouse_cells SET items_json=?, note=?, updated_at=? WHERE zone=? AND column_index=? AND slot_number=?''',
                (json_dumps(items), note or '', now_iso(), zone, column_index, slot_number))
    return get_cell(zone, column_index, slot_number)


def add_slot(zone: str, column_index: int, after_slot: int | None = None) -> None:
    rows = fetch_all('SELECT slot_number FROM warehouse_cells WHERE zone=? AND column_index=? ORDER BY slot_number DESC', (zone, column_index))
    max_slot = rows[0]['slot_number'] if rows else 0
    if after_slot is None or after_slot >= max_slot:
        execute('''INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at) VALUES(?,?,?,?,?,?,?)''',
                (zone, column_index, 'direct', max_slot + 1, '[]', '', now_iso()))
        return
    for row in rows:
        slot = row['slot_number']
        if slot > after_slot:
            execute('UPDATE warehouse_cells SET slot_number=? WHERE zone=? AND column_index=? AND slot_number=?', (slot + 1, zone, column_index, slot))
    execute('''INSERT INTO warehouse_cells(zone,column_index,slot_type,slot_number,items_json,note,updated_at) VALUES(?,?,?,?,?,?,?)''',
            (zone, column_index, 'direct', after_slot + 1, '[]', '', now_iso()))


def remove_slot(zone: str, column_index: int, slot_number: int) -> None:
    row = fetch_one('SELECT * FROM warehouse_cells WHERE zone=? AND column_index=? AND slot_number=?', (zone, column_index, slot_number))
    if not row:
        raise ValueError('找不到格位')
    if json_loads(row.get('items_json'), []):
        raise ValueError('格子內有商品，請先移除商品再刪除')
    execute('DELETE FROM warehouse_cells WHERE zone=? AND column_index=? AND slot_number=?', (zone, column_index, slot_number))
    rows = fetch_all('SELECT slot_number FROM warehouse_cells WHERE zone=? AND column_index=? AND slot_number>? ORDER BY slot_number', (zone, column_index, slot_number))
    for row in rows:
        execute('UPDATE warehouse_cells SET slot_number=? WHERE zone=? AND column_index=? AND slot_number=?', (row['slot_number'] - 1, zone, column_index, row['slot_number']))


def placed_qty_map(zone: str = '') -> dict[tuple[str, int], int]:
    placed: dict[tuple[str, int], int] = {}
    for cell in list_cells(zone):
        for item in cell.get('items') or []:
            key = _key(item)
            if key[0] and key[1]:
                placed[key] = placed.get(key, 0) + int(item.get('qty') or 0)
    return placed


def available_items_from_rows(rows: list[dict], source: str, source_label: str, placed: dict[tuple[str, int], int]) -> list[dict]:
    out = []
    for row in rows:
        row = dict(row)
        qty = int(row.get('qty') or 0)
        remaining = qty - placed.get((source, int(row['id'])), 0)
        if remaining <= 0:
            continue
        row['qty'] = remaining
        row['source'] = source
        row['source_label'] = source_label
        out.append(row)
    return out


def move_front(source_cell: dict, target_cell: dict, item_index: int = 0) -> dict:
    src = get_cell(source_cell['zone'], int(source_cell['column_index']), int(source_cell['slot_number']))
    dst = get_cell(target_cell['zone'], int(target_cell['column_index']), int(target_cell['slot_number']))
    if not src or not dst:
        raise ValueError('找不到來源或目標格位')
    src_items = src.get('items') or []
    dst_items = dst.get('items') or []
    if not src_items:
        raise ValueError('來源格位沒有商品')
    if item_index < 0 or item_index >= len(src_items):
        item_index = 0
    moving = src_items.pop(item_index)
    moving['placement_label'] = '前排'
    dst_items.insert(0, moving)
    update_cell(src['zone'], src['column_index'], src['slot_number'], src_items, src.get('note') or '')
    updated_dst = update_cell(dst['zone'], dst['column_index'], dst['slot_number'], dst_items, dst.get('note') or '')
    return {'from': get_cell(src['zone'], src['column_index'], src['slot_number']), 'to': updated_dst, 'moved_item': moving}



def deduct_placements(source: str, source_id: int, qty: int) -> dict:
    """Deduct shipped quantity from warehouse placements for the same source item.

    Shipping must keep the warehouse map in sync. If an item is fully shipped,
    remove it from cells; if partially shipped, reduce only the placed quantity.
    The function is best-effort but deterministic and returns what changed.
    """
    source = source or ''
    source_id = int(source_id or 0)
    todo = int(qty or 0)
    if not source or not source_id or todo <= 0:
        return {'changed_cells': [], 'remaining_to_deduct': max(todo, 0)}
    changed_cells = []
    rows = fetch_all('SELECT * FROM warehouse_cells ORDER BY zone, column_index, slot_number')
    for cell in rows:
        if todo <= 0:
            break
        items = json_loads(cell.get('items_json'), [])
        changed = False
        new_items = []
        for item in items:
            if todo > 0 and (item.get('source') or '') == source and int(item.get('id') or item.get('source_id') or 0) == source_id:
                current = int(item.get('qty') or 0)
                take = min(current, todo)
                current -= take
                todo -= take
                changed = True
                if current > 0:
                    item = dict(item)
                    item['qty'] = current
                    new_items.append(item)
                # if current becomes 0, this placement is removed
            else:
                new_items.append(item)
        if changed:
            execute('UPDATE warehouse_cells SET items_json=?, updated_at=? WHERE id=?', (json_dumps(_normalize_items(new_items)), now_iso(), cell['id']))
            changed_cells.append({
                'id': cell['id'],
                'zone': cell.get('zone'),
                'column_index': cell.get('column_index'),
                'slot_number': cell.get('slot_number'),
            })
    return {'changed_cells': changed_cells, 'remaining_to_deduct': todo}


def save_undo(username: str, action_type: str, entity_type: str, entity_key: str, undo_data: dict):
    execute('''INSERT INTO undo_events(username,action_type,entity_type,entity_key,undo_json,is_used,created_at)
               VALUES(?,?,?,?,?,?,?)''', (username or '', action_type, entity_type, entity_key or '', json_dumps(undo_data), 0, now_iso()))


def undo_last(username: str = '') -> dict:
    params = []
    where = 'WHERE is_used=0'
    if username:
        where += ' AND username=?'
        params.append(username)
    event = fetch_one(f'SELECT * FROM undo_events {where} ORDER BY id DESC LIMIT 1', params)
    if not event:
        raise ValueError('沒有可還原的動作')
    data = json_loads(event.get('undo_json'), {})
    for cell in data.get('cells', []):
        update_cell(cell['zone'], int(cell['column_index']), int(cell['slot_number']), cell.get('items') or [], cell.get('note') or '')
    execute('UPDATE undo_events SET is_used=1 WHERE id=?', (event['id'],))
    return {'event': event, 'restored_cells': data.get('cells', [])}


def find_locations(source: str = '', source_id: int = 0, customer_name: str = '', product_text: str = '') -> list[dict]:
    """Find warehouse cells containing a source item or matching customer/product text."""
    out: list[dict] = []
    for cell in list_cells(''):
        for idx, item in enumerate(cell.get('items') or []):
            match = False
            if source and source_id:
                match = (item.get('source') == source and int(item.get('id') or 0) == int(source_id))
            if not match and customer_name:
                match = customer_name in (item.get('customer_name') or '')
            if match and product_text:
                match = product_text in (item.get('product_text') or '')
            if match:
                out.append({
                    'zone': cell.get('zone'),
                    'column_index': cell.get('column_index'),
                    'slot_number': cell.get('slot_number'),
                    'item_index': idx,
                    'label': f"{cell.get('zone')}-{cell.get('column_index')}-{cell.get('slot_number')}",
                    'customer_name': item.get('customer_name') or '庫存',
                    'product_text': item.get('product_text') or '',
                    'qty': int(item.get('qty') or 0),
                    'source': item.get('source') or '',
                    'id': int(item.get('id') or 0),
                })
    return out
