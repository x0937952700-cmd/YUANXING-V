#!/usr/bin/env python3
"""Warehouse persistence audit for V493 pack 3.
Runs against a disposable SQLite database and checks long-press/right-click DB paths:
cell save, insert, delete, batch add, batch delete, mark, readback.
"""
from pathlib import Path
import os, sys, tempfile

root = Path(__file__).resolve().parents[1]
tmpdir = tempfile.TemporaryDirectory(prefix='yx_wh_v493_')
db_path = Path(tmpdir.name) / 'warehouse_test.db'
os.environ['DATABASE_URL'] = 'sqlite:///' + str(db_path)
sys.path.insert(0, str(root))

# Repair-container import shim: runtime dependencies are installed on Render, but
# audits must also run in the ChatGPT repair container without pip install.
def _yx_stub_runtime_imports():
    import types, sys
    if 'werkzeug.security' not in sys.modules:
        werkzeug = types.ModuleType('werkzeug')
        security = types.ModuleType('werkzeug.security')
        security.generate_password_hash = lambda v, *a, **k: 'hash-' + str(v)
        security.check_password_hash = lambda h, v: True
        sys.modules.setdefault('werkzeug', werkzeug)
        sys.modules.setdefault('werkzeug.security', security)
_yx_stub_runtime_imports()


import db  # noqa: E402


def setup_minimal_schema():
    conn = db.get_db(); cur = conn.cursor()
    cur.execute('CREATE TABLE warehouse_cells (id INTEGER PRIMARY KEY AUTOINCREMENT, zone TEXT, column_index INTEGER, slot_type TEXT DEFAULT "direct", slot_number INTEGER, items_json TEXT DEFAULT "[]", note TEXT DEFAULT "", updated_at TEXT, is_deleted INTEGER DEFAULT 0, problem_flag TEXT DEFAULT "", operation_id TEXT, version INTEGER DEFAULT 1)')
    cur.execute('CREATE TABLE warehouse_column_meta (zone TEXT, column_index INTEGER, visible_count INTEGER, updated_at TEXT, PRIMARY KEY(zone,column_index))')
    cur.execute('CREATE TABLE warehouse_cell_items (id INTEGER PRIMARY KEY AUTOINCREMENT, cell_id INTEGER, zone TEXT, column_index INTEGER, slot_number INTEGER, source_table TEXT, source_id TEXT, customer_name TEXT, product_text TEXT, material TEXT, qty INTEGER DEFAULT 0, placement_label TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)')
    cur.execute('CREATE TABLE errors (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, created_at TEXT)')
    conn.commit(); conn.close()


def assert_true(ok, msg):
    if not ok:
        raise AssertionError(msg)


def main():
    setup_minimal_schema()
    all_cells = db.warehouse_get_cells()
    assert_true(len(all_cells) >= 240, 'A/B six columns x 20 slots readback missing')
    assert_true(len([c for c in all_cells if c.get('zone') == 'A' and int(c.get('column_index') or 0) == 1]) >= 20, 'A1 default 20 slots missing')

    item = {
        'customer_name': '永和', 'material': 'DF', 'product_text': '132x11x013=6',
        'product': '132x11x013=6', 'qty': 6, 'placement_label': '前排',
        'source_table': 'inventory', 'source_id': 'audit-1'
    }
    saved = db.warehouse_save_cell('A', 1, 'direct', 1, [item], '備註')
    assert_true(saved.get('success'), 'cell save failed')
    col = db.warehouse_get_column_cells('A', 1)
    assert_true(next(c for c in col if int(c.get('slot_number') or 0) == 1).get('items'), 'cell save did not read back')

    inserted = db.warehouse_add_slot('A', 1, 'direct', 1)
    assert_true(inserted == 2, 'insert slot returned wrong slot')
    col = db.warehouse_get_column_cells('A', 1)
    assert_true(next(c for c in col if int(c.get('slot_number') or 0) == 1).get('items'), 'insert lost existing item')
    assert_true(not next(c for c in col if int(c.get('slot_number') or 0) == 2).get('items'), 'inserted slot should be empty')

    removed = db.warehouse_remove_slot('A', 1, 'direct', 2)
    assert_true(removed.get('success'), 'remove empty slot failed')
    col = db.warehouse_get_column_cells('A', 1)
    assert_true(next(c for c in col if int(c.get('slot_number') or 0) == 1).get('items'), 'delete lost existing item')

    marked = db.warehouse_set_cell_mark('A', 1, 1, True)
    assert_true(marked.get('success'), 'mark failed')
    col = db.warehouse_get_column_cells('A', 1)
    flag = str(next(c for c in col if int(c.get('slot_number') or 0) == 1).get('problem_flag') or '')
    assert_true(flag in ('problem', '1', 'true'), 'mark did not read back')

    added = db.warehouse_batch_add_slots('A', 1, insert_after=1, count=3)
    assert_true(added.get('success') and int(added.get('visible_count') or 0) >= 23, 'batch add failed')
    removed_many = db.warehouse_batch_remove_empty_slots('A', 1, slot_number=2, count=2, requested_slots=[2, 3])
    assert_true(removed_many.get('success') and int(removed_many.get('removed') or 0) == 2, 'batch remove failed')
    col = db.warehouse_get_column_cells('A', 1)
    assert_true(next(c for c in col if int(c.get('slot_number') or 0) == 1).get('items'), 'batch remove lost existing item')
    print('WAREHOUSE PERSISTENCE AUDIT OK')


if __name__ == '__main__':
    try:
        main()
    finally:
        tmpdir.cleanup()
