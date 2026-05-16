#!/usr/bin/env python3
"""Static audit for V509 operation closed-loop pack."""
from pathlib import Path
import ast, sys
root = Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append('missing '+rel); return ''
    return p.read_text(encoding='utf-8', errors='ignore')

app=read('app.py')
ship=read('static/yx_pages/shipping_page.js')
prod=read('static/yx_pages/product_page_core.js')
wh=read('static/yx_pages/warehouse_page.js')
today=read('static/yx_pages/today_changes_page.js')
diag=read('static/yx_pages/diagnostics_page.js')
closed=read('scripts/postdeploy_operation_closed_loop_verify.py')
deploy=read('scripts/deploy_smoke_verify.py')
pre=read('scripts/predeploy_audit.py')

for token in ['V119-V520-FINAL-SHIP-CACHE-ALIGN-PACK30','119-v520_final_ship_cache_align_pack30','v520-final-ship-cache-align-pack30']:
    if token not in app:
        fail.append('app.py missing version token '+token)
for token in ['/api/health/operation-closed-loop','closed_loop_routes','closed_loop_tables_readable','no_mutation=True']:
    if token not in app:
        fail.append('app.py missing operation-loop token '+token)
for route in ['/api/inventory','/api/orders','/api/master_orders','/api/ship/preview','/api/ship/confirm','/api/product-locations','/api/today-changes','/api/diagnostics/export']:
    if route not in app:
        fail.append('app.py missing required route '+route)
for token in ['shipping_records','today_changes','before_qty','after_qty','volume_formula']:
    if token not in app:
        fail.append('app.py ship commit missing '+token)
for token in ['showShipLocations','/api/product-locations']:
    if token not in ship:
        fail.append('shipping_page.js missing '+token)
if 'product-batch-write-success' not in prod:
    fail.append('product_page_core.js missing write success event')
if 'jumpProductToWarehouse' not in wh:
    fail.append('warehouse_page.js missing jumpProductToWarehouse')
if 'manual_refresh' not in today:
    fail.append('today_changes_page.js missing manual_refresh')
if '/api/health/operation-closed-loop' not in diag:
    fail.append('diagnostics_page.js missing operation-loop endpoint')
for token in ['V518_RESTORE_SATISFIED_SHIP_PREVIEW_DIAG_PACK25','--write-test','/api/health/operation-closed-loop','/api/ship/confirm']:
    if token not in closed:
        fail.append('postdeploy_operation_closed_loop_verify.py missing '+token)
if '/api/health/operation-closed-loop' not in deploy:
    fail.append('deploy_smoke_verify.py does not check operation-loop endpoint')
if 'scripts/operation_closed_loop_audit.py' not in pre:
    fail.append('predeploy audit does not include operation_closed_loop_audit')
try:
    ast.parse(closed)
except SyntaxError as e:
    fail.append('postdeploy_operation_closed_loop_verify syntax error: '+str(e))
if fail:
    print('OPERATION CLOSED LOOP AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('OPERATION CLOSED LOOP AUDIT OK')
