#!/usr/bin/env python3
"""Customer region/card consistency audit for V494 pack 4.
Checks the exact regressions repaired in this pack without launching a browser:
- customer card button is not blocked from pointer long-press/drag
- /api/customer-items cache is scoped by source
- selected-customer item cache is scoped by source
- active customer counts skip qty=0 rows in active relation tables
- long-press sheet is centered and has required actions
"""
from pathlib import Path
import ast, re, sys
root = Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}')
        return ''
    return p.read_text(encoding='utf-8', errors='ignore')

app=read('app.py')
db=read('db.py')
core=read('static/yx_pages/product_page_core.js')
css=read('static/css/base.css')

for rel, text in [('app.py', app), ('db.py', db)]:
    try:
        ast.parse(text)
    except SyntaxError as e:
        fail.append(f'{rel} syntax error: {e}')

for token in ['V119-V520-FINAL-SHIP-CACHE-ALIGN-PACK30','119-v520_final_ship_cache_align_pack30','v520-final-ship-cache-align-pack30']:
    if token not in app and token not in core and token not in css:
        fail.append(f'missing V494 token {token}')

if "source=source_filter" not in app or "customer_items', version=API_SCHEMA_VERSION" not in app:
    fail.append('/api/customer-items fast cache key is not scoped by source_filter')
if 'source_filter = (request.args.get(\'source\') or request.args.get(\'module\') or \'\').strip()' not in app:
    fail.append('/api/customer-items source_filter not computed before cache key')

for token in ['selectedPanelCacheKey', 'state.itemCache.set(selectedPanelCacheKey(name, pageSource)', 'renderCachedSelectedPanel(name, pageSource)']:
    if token not in core:
        fail.append(f'selected customer panel cache missing source scope token: {token}')

if "ev.target.closest('button,input,select,textarea,a,[data-yx113-customer-act]')" in core:
    fail.append('old customer pointerdown guard still blocks button cards')
for token in ["innerButton && innerButton !== card", "客戶卡本身就是 button", "yx121-dragging-customer", "regionFromPoint"]:
    if token not in core:
        fail.append(f'customer long-press/drag mainline missing {token}')

for token in ['data-yx113-customer-act="open"','data-yx113-customer-act="edit"','data-yx113-customer-act="move-north"','data-yx113-customer-act="move-center"','data-yx113-customer-act="move-south"','data-yx113-customer-act="archive"','data-yx113-customer-act="delete"']:
    if token not in core:
        fail.append(f'customer action sheet missing {token}')

if "if prefix in ('inventory', 'order', 'master') and row_qty <= 0" not in db:
    fail.append('get_customers active counts do not skip qty=0 active rows')
if 'customer_region_consistency_pack4_version' not in db:
    fail.append('db.py missing V494 customer region pack marker')

if '.yx113-customer-actions:not(.hidden)' not in css or 'align-items:center!important' not in css:
    fail.append('customer long-press sheet is not forced to center in CSS')
if 'touch-action:manipulation!important' not in css:
    fail.append('customer card gesture CSS missing')

if re.search(r'new\s+MutationObserver\s*\(', core) or re.search(r'\bsetInterval\s*\(', core):
    fail.append('product_page_core adds MutationObserver/setInterval')

if fail:
    print('CUSTOMER REGION CONSISTENCY AUDIT FAILED')
    for x in fail:
        print('-', x)
    sys.exit(1)
print('CUSTOMER REGION CONSISTENCY AUDIT OK')
