from services.products import parse_product_line, normalize_product_text, total_qty_from_text, volume_for_items


def test_count_rules():
    cases = {
        '132x23x05=249x3': 3,
        '132x23x05=249': 1,
        '60+54+50': 3,
        '220x4+223x2+44+35+221': 9,
        '100x30x63': 1,
        '100x30x63=115': 1,
        '100x30x63=220x4+223x2+44+35+221': 9,
        '100x30x63=504x5+588+587+502+420+382+378+280+254+237+174': 15,
    }
    for text, qty in cases.items():
        assert total_qty_from_text(text) == qty


def test_underscore_carry_width_height():
    text = '120x33x33=70x4\n159x33x165=131x5\n179x___=131x4'
    assert normalize_product_text(text).splitlines()[-1] == '179x33x165=131x4'


def test_height_normalization():
    assert normalize_product_text('100x30x0.83=19') == '100x30x083=19'
    assert normalize_product_text('100x30x.83=19') == '100x30x083=19'
    assert normalize_product_text('100x30x5=19') == '100x30x05=19'
    assert normalize_product_text('100x30x063=560x2') == '100x30x063=560x2'


def test_volume_formula():
    rows, total, formula = volume_for_items(['80x30x125=111+132x3', '140x30x12=294x2+10', '363x25x05=100'])
    assert len(rows) == 3
    assert '0.8' in formula
    assert '0.363' in formula
    assert total > 0


def test_deduct_qty_from_product_text():
    from services.products import deduct_qty_from_product_text
    assert deduct_qty_from_product_text('132x23x05=249x3', 1)['remaining_text'] == '132x23x05=249x2'
    assert deduct_qty_from_product_text('60+54+50', 1)['remaining_text'] == '60+54'
    assert deduct_qty_from_product_text('220x4+223x2+44+35+221', 3)['remaining_text'] == '220x4+223x2'
    assert deduct_qty_from_product_text('100x30x63=504x5+588+587+502+420+382+378+280+254+237+174', 1)['before_qty'] == 15


def test_height_factor_fixed():
    from services.products import height_factor
    assert height_factor('083') == 0.83
    assert height_factor('063') == 0.63
    assert height_factor('05') == 0.5
    assert height_factor('12') == 1.2
    assert height_factor('125') == 1.25


def test_merge_product_texts_qty_stays_locked():
    from services.products import merge_product_texts, total_qty_from_text
    text = '100x30x63=504x5+588+587+502+420+382+378+280+254+237+174'
    merged = merge_product_texts(text, text)
    assert total_qty_from_text(text) == 15
    assert total_qty_from_text(merged) == 30


def test_shipping_preview_uses_selected_qty_volume():
    import os, sys
    os.environ['SQLITE_PATH'] = '/tmp/yuanxing_test_shipping_preview.db'
    try:
        os.remove(os.environ['SQLITE_PATH'])
    except FileNotFoundError:
        pass
    import db
    db.init_db()
    from services.items import create_item
    from services.shipping import build_preview
    item_id = create_item('inventory', '', '', '132x23x05=249x3', '', '', 'tester', '')
    preview = build_preview('', '', [{'source': 'inventory', 'id': item_id, 'qty': 1}], 1)
    assert preview['can_submit'] is True
    assert preview['total_qty'] == 1
    assert preview['items'][0]['product_text'] == '132x23x05=249'
