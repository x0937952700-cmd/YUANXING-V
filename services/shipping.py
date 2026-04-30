from db import execute, now_iso
from services.items import get_item, deduct_item
from services.products import volume_for_items, deduct_qty_from_product_text
from services.audit import today, audit
from services.warehouse import find_locations, deduct_placements

SOURCE_TABLE = {'inventory': 'inventory', 'orders': 'orders', 'master_orders': 'master_orders'}
SOURCE_LABEL = {'inventory': '庫存', 'orders': '訂單', 'master_orders': '總單'}


def _aggregate_entries(items: list[dict]) -> list[dict]:
    merged: dict[tuple[str, int], dict] = {}
    for entry in items or []:
        source = entry.get('source')
        source_id = int(entry.get('id') or entry.get('source_id') or 0)
        qty = int(entry.get('qty') or 1)
        key = (source, source_id)
        if key not in merged:
            merged[key] = {'source': source, 'id': source_id, 'qty': 0}
        merged[key]['qty'] += qty
    return list(merged.values())


def build_preview(customer_uid: str, customer_name: str, items: list[dict], weight_input: float = 0) -> dict:
    preview_rows = []
    product_texts = []
    total_qty = 0
    problems = []
    for entry in _aggregate_entries(items):
        source = entry.get('source')
        source_id = int(entry.get('id') or entry.get('source_id') or 0)
        qty = int(entry.get('qty') or 1)
        if source not in SOURCE_TABLE:
            problems.append(f'未知來源：{source}')
            continue
        row = get_item(source, source_id)
        if not row:
            problems.append(f'{SOURCE_LABEL[source]} #{source_id} 找不到')
            continue
        before = int(row.get('qty') or 0)
        after = before - qty
        deducted_text = row.get('product_text') or ''
        if qty <= 0:
            problems.append(f'{row.get("product_text")} 出貨數量必須大於 0')
        elif after < 0:
            problems.append(f'{row.get("product_text")} 數量不足，目前 {before} 件，要扣 {qty} 件')
        else:
            try:
                deducted_text = deduct_qty_from_product_text(row.get('product_text') or '', qty).get('deducted_text') or deducted_text
            except Exception as exc:
                problems.append(str(exc))
        borrowed_from = ''
        if customer_name and row.get('customer_name') and row.get('customer_name') != customer_name:
            borrowed_from = row.get('customer_name')
        product_texts.append(deducted_text)
        total_qty += max(qty, 0)
        preview_rows.append({
            'source': source,
            'source_label': SOURCE_LABEL[source],
            'source_id': source_id,
            'customer_name': row.get('customer_name') or customer_name or '庫存',
            'product_text': deducted_text,
            'original_product_text': row.get('product_text'),
            'material': row.get('material'),
            'qty': qty,
            'before_qty': before,
            'after_qty': after,
            'borrowed_from': borrowed_from,
            'location': row.get('location') or '',
            'warehouse_locations': find_locations(source, source_id, row.get('customer_name') or '', row.get('product_text') or ''),
        })
    parse_rows, volume_total, volume_formula = volume_for_items(product_texts)
    weight_input = float(weight_input or 0)
    return {
        'items': preview_rows,
        'product_parse': parse_rows,
        'total_qty': total_qty,
        'volume_formula': volume_formula,
        'volume_total': volume_total,
        'weight_input': weight_input,
        'total_weight': round(volume_total * weight_input, 4),
        'can_submit': len(problems) == 0 and len(preview_rows) > 0,
        'problems': problems,
    }


def confirm_shipping(username: str, customer_uid: str, customer_name: str, items: list[dict], weight_input: float = 0, note: str = '') -> dict:
    preview = build_preview(customer_uid, customer_name, items, weight_input)
    if not preview['can_submit']:
        raise ValueError('；'.join(preview['problems']) or '出貨預覽不完整')
    shipped = []
    for row in preview['items']:
        original, before, after = deduct_item(row['source'], row['source_id'], row['qty'])
        record_id = execute('''INSERT INTO shipping_records(customer_uid,customer_name,product_text,material,qty,source,source_id,before_qty,after_qty,borrowed_from,volume_formula,volume_total,weight_input,total_weight,operator,shipped_at,note)
                               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', (
            customer_uid or original.get('customer_uid') or '', customer_name or original.get('customer_name') or '',
            original.get('deducted_product_text') or original.get('product_text') or '', original.get('material') or '', row['qty'], row['source'], row['source_id'],
            before, after, row.get('borrowed_from') or '', preview['volume_formula'], preview['volume_total'],
            float(weight_input or 0), preview['total_weight'], username or '', now_iso(), note or ''
        ))
        warehouse_sync = deduct_placements(row['source'], row['source_id'], row['qty'])
        shipped_row = dict(row)
        shipped_row['record_id'] = record_id
        shipped_row['warehouse_sync'] = warehouse_sync
        shipped.append(shipped_row)
        today('出貨', '確認出貨', customer_name or original.get('customer_name') or '', original.get('product_text') or '', row['qty'], original.get('location') or '', row['source_label'], username, shipped_row)
        audit(username, 'ship', row['source'], str(row['source_id']), before=original, after={'qty': after, 'record_id': record_id, 'warehouse_sync': warehouse_sync})
    return {'preview': preview, 'shipped': shipped}
