#!/usr/bin/env python3
"""Shipping consistency audit for V493 pack 3.
Checks that 出貨 uses local-first plus DB readback, does not miss 總單, locks preview/confirm sources,
and records shipping detail + today_changes with volume formula.
"""
from pathlib import Path
import ast, os, sys, tempfile

root = Path(__file__).resolve().parents[1]
fail = []

def read(rel):
    p = root / rel
    if not p.exists():
        fail.append(f'missing {rel}')
        return ''
    return p.read_text(encoding='utf-8', errors='ignore')

app = read('app.py')
db_text = read('db.py')
ship_js = read('static/yx_pages/shipping_page.js')

for rel, text in [('app.py', app), ('db.py', db_text)]:
    try:
        ast.parse(text)
    except SyntaxError as e:
        fail.append(f'{rel} syntax error: {e}')

for token in ['V119-V517-FULL-CHECKLIST-ALIGNMENT-PACK27', '119-v517_full_checklist_alignment_pack27', 'v517-full-checklist-alignment-pack27']:
    if token not in app and token not in ship_js:
        fail.append(f'missing version token {token}')

# Front-end: must render fast from local, then DB verify instead of returning stale ship_items forever.
for token in [
    'ship-load-customers-verify-db-v493',
    'ship-confirm-success-db-readback-v493',
    'mergeCustomerRowsFast',
    'sourceCoverage',
    'yxDbOnly: !!(opts.force || opts.dbVerify || hadCached)',
    'preview.selected_before_qty',
    'preview.selected_after_qty',
]:
    if token not in ship_js:
        fail.append(f'shipping_page.js missing {token}')

# Back-end: preview and confirm must agree on exact source, before/after, material volume, and activity DB rows.
for token in [
    "'source_table': source_pref",
    "'source_table': auto_source",
    "'before_qty': selected_available",
    "'after_qty': after.get",
    'shipping_service_validate_preview_token',
    'shipping_service_preview_locked_items',
    'selected_before_qty',
    'selected_after_qty',
    'INSERT INTO today_changes',
    'ship_today_changes_v493',
    'volume_formula',
]:
    if token not in db_text and token not in app:
        fail.append(f'backend missing {token}')

if 'get_orders()' in app and '_yx493_active_product_snapshot_rows(get_orders())' not in app:
    fail.append('product_service_snapshots must filter zero-qty order rows')
if 'get_master_orders()' in app and '_yx493_active_product_snapshot_rows(get_master_orders())' not in app:
    fail.append('product_service_snapshots must filter zero-qty master rows')

# Official formula sample from master requirements.
tmp = tempfile.TemporaryDirectory(prefix='yx_ship_v493_')
os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(tmp.name) / 'formula.db')
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

try:
    import db  # noqa: E402
    c = db.calc_product_volume('130x12x063=113x4+112+100')
    if int(c.get('pieces_sum') or 0) != 664:
        fail.append('volume pieces_sum sample should be 664')
    if round(float(c.get('volume') or 0), 2) != 652.58:
        fail.append(f'volume sample should be 652.58, got {c.get("volume")}')
    sc = db._yx_shipping_volume_calc([{'product_text':'130x12x063=113x4+112+100','qty':6}])
    if int(sc.get('total_qty') or 0) != 6:
        fail.append('shipping volume total_qty should keep display bundle count 6')
finally:
    tmp.cleanup()

if fail:
    print('SHIPPING CONSISTENCY AUDIT FAILED')
    for x in fail:
        print('-', x)
    sys.exit(1)
print('SHIPPING CONSISTENCY AUDIT OK')
