#!/usr/bin/env python3
"""Yuanxing functional path audit.
Static verification that the real user flows stay on one data spine:
- sync -> local cache -> page render
- add/delete/edit/ship/warehouse mutation -> YXMutationBus -> YXDataStore
- today/unplaced/warehouse/shipping paths do not fall back to old force refresh.
No network, no browser, no DB writes.
"""
from pathlib import Path
import ast, re, sys
root = Path(__file__).resolve().parents[1]
fail=[]
warn=[]
VERSION_APP='V119-V518-RESTORE-SATISFIED-SHIP-PREVIEW-DIAG-PACK28'
VERSION_STATIC='119-v518_restore_satisfied_ship_preview_diag_pack28'
VERSION_JS='v518-restore-satisfied-ship-preview-diag-pack28'

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}')
        return ''
    return p.read_text(encoding='utf-8', errors='ignore')

def must(text, token, rel, why=''):
    if token not in text:
        fail.append(f'{rel} missing {token}' + (f' ({why})' if why else ''))

def must_re(text, pattern, rel, why=''):
    if not re.search(pattern, text, re.S):
        fail.append(f'{rel} missing pattern {pattern}' + (f' ({why})' if why else ''))

# Compile Python files touched by deploy/test/audit path.
for rel in ['app.py','db.py','wsgi.py','backup.py','ocr.py','scripts/static_data_spine_audit.py','scripts/data_flow_regression_audit.py','scripts/predeploy_audit.py','scripts/deploy_smoke_verify.py','scripts/functional_path_audit.py']:
    txt=read(rel)
    if txt:
        try: ast.parse(txt)
        except SyntaxError as e: fail.append(f'{rel} syntax error: {e}')

app=read('app.py')
must(app, VERSION_APP, 'app.py', 'version must match package')
must(app, VERSION_STATIC, 'app.py', 'static version must match package')
for route in ['/api/inventory','/api/orders','/api/master_orders','/api/customers','/api/customer-items','/api/today-changes','/api/warehouse','/api/warehouse/available-items','/api/ship']:
    if route not in app:
        warn.append(f'app.py route/token not found for {route}; verify endpoint naming manually')

base=read('templates/base.html')
order=['yx_cache.js','yx_core.js','yx_device_sync.js','yx_data_store.js','yx_mutation_bus.js']
pos=[]
for name in order:
    i=base.find(name)
    if i<0: fail.append(f'base.html does not load {name}')
    pos.append(i)
if all(i>=0 for i in pos) and pos != sorted(pos):
    fail.append('base.html load order is not cache -> core -> sync -> data_store -> mutation_bus')
if 'yx_v452_max_repair.js' in base or (root/'static/yx_v452_max_repair.js').exists():
    fail.append('old yx_v452_max_repair bridge still present')

# Data spine must cover every read flow.
data=read('static/yx_data_store.js')
for token in [
    VERSION_JS,
    'installApiBridge','installFetchBridge','requestResponse','requestJson','localResponseForApi',
    'getRowsMeta','setRows','upsertRows','removeRows','applyResponseRows',
    'buildCustomerRows','buildCustomersFromSources','rowsForCustomer','rowsForCustomerSync',
    'getTodayWithUnplaced','filterAvailableAgainstWarehouse','warehouseItemKey',
    'getWarehouse','getWarehouseAvailable','today-changes\\/(count|badge)',
    'yxRawFetch','yxDbOnly','shouldLocalFirst'
]:
    must(data, token, 'static/yx_data_store.js')
for endpoint in ['/api/inventory','/api/orders','/api/master_orders','/api/customers','/api/customer-items','/api/today-changes','/api/warehouse','/api/warehouse/available-items']:
    if endpoint not in data and endpoint.replace('/','\\/') not in data:
        fail.append(f'static/yx_data_store.js bridge missing endpoint {endpoint}')
# Force must not bypass local first except explicit raw/db-only or sync markers.
must_re(data, r'if\(opt && \(opt\.yxRawFetch \|\| opt\.yxDbOnly \|\| opt\.yxDeviceLocalFirst===false\)\) return false;', 'static/yx_data_store.js', 'local-first bypass guard')
must(data, 'sync_full=1', 'static/yx_data_store.js', 'sync path must be allowed to hit DB')

# Mutation bus must cover write flows and update DataStore after writes.
mut=read('static/yx_mutation_bus.js')
for token in [
    VERSION_JS, 'applyMutation','installApi','installFetch','applyRespRows',
    'upsertRows','removeRows','setRows','reduceAfterShip','appendTodayLocal',
    'api\\/order','api\\/master_order','api\\/inventory','api\\/ship'
]:
    must(mut, token, 'static/yx_mutation_bus.js')
# Data mutation functions must not clear authority cache names.
for bad in ['localStorage.removeItem(\'today_changes', 'localStorage.removeItem("today_changes', 'localStorage.removeItem(\'warehouse_available', 'localStorage.removeItem("warehouse_available']:
    if bad in mut:
        fail.append(f'static/yx_mutation_bus.js clears authority cache: {bad}')

# Device sync must be authoritative full sync for tables where deletes matter.
sync=read('static/yx_device_sync.js')
for key in ['inventory','orders','master_order','customers','warehouse','warehouse_available','shipping_records','today_changes','todos']:
    must(sync, f"key:'{key}'", 'static/yx_device_sync.js', f'sync task {key}')
for token in [VERSION_JS,'yxRawFetch:true','sync_full=1','fullAlways:true','writeCachedPayload','readCachedPayload','yx_device_sync_last_success_at']:
    must(sync, token, 'static/yx_device_sync.js')

# Page-level functional path checks.
pages={p.name:p.read_text(encoding='utf-8', errors='ignore') for p in (root/'static/yx_pages').glob('*.js')}
critical=['inventory_page.js','orders_page.js','master_order_page.js','product_page_core.js','shipping_page.js','today_changes_page.js','warehouse_page.js']
for name in critical:
    if name not in pages:
        fail.append(f'missing static/yx_pages/{name}')
for name,text in pages.items():
    if re.search(r'\bsetInterval\s*\(', text): fail.append(f'{name} still creates setInterval')
    if 'new MutationObserver' in text: fail.append(f'{name} still creates MutationObserver')
    if re.search(r'\bfetch\s*\(', text): fail.append(f'{name} still uses direct fetch() instead of YXDataStore.request*')
    if re.search(r'force=[01]', text): fail.append(f'{name} still has force= query string')

product=pages.get('product_page_core.js','')
for token in ['YXDataStore','getRowsMeta','setRows','rowsStore','renderFromCurrentRows']:
    must(product, token, 'product_page_core.js', 'product pages must render from rows/data store')
for bad in ['/api/customers?fast=1']:
    if bad in product:
        fail.append(f'product_page_core.js still has old fast customer stats path: {bad}')
if 'relation_counts' in product and '只准由目前商品 rows 計算' not in product:
    fail.append('product_page_core.js uses relation_counts without row-authority guard comment')

shipping=pages.get('shipping_page.js','')
for token in ['YXDataStore','buildCustomersFromSources','rowsForCustomer','requestResponse','出貨預覽']:
    must(shipping, token, 'shipping_page.js', 'shipping must use local rows and show preview/error')
for bad in ['force:true','force: true','/api/customers?force','/api/customer-items?force']:
    if bad in shipping:
        fail.append(f'shipping_page.js still has old forced DB path: {bad}')

today=pages.get('today_changes_page.js','')
for token in ['YXDataStore','getTodayWithUnplaced','warehouse_available','unplaced']:
    must(today, token, 'today_changes_page.js', 'today must use same unplaced source as warehouse')

warehouse=pages.get('warehouse_page.js','')
for token in ['YXDataStore','warehouseItemKey','loadAvailable','updateAllSlots']:
    must(warehouse, token, 'warehouse_page.js', 'warehouse must dedupe with same item key')
for bad in ['renderWarehouse(true)','force:true','force: true']:
    if bad in warehouse:
        fail.append(f'warehouse_page.js still has old force reload path: {bad}')
if 'loadAvailable(true)' in warehouse and '長按刷新未錄入倉庫圖件數' not in warehouse:
    fail.append('warehouse_page.js uses loadAvailable(true) outside manual long-press unplaced refresh')

# Service worker/PWA: API must not be cached.
sw=read('static/service-worker.js')
must(sw, 'yuanxing-v518-static-css-icons', 'static/service-worker.js')
api_pos=max(sw.find("url.pathname.startsWith('/api/')"), sw.find('url.pathname.startsWith("/api/")'))
rw_pos=sw.find('event.respondWith')
if api_pos<0: fail.append('service-worker missing /api bypass')
elif rw_pos>=0 and api_pos>rw_pos: fail.append('service-worker /api bypass must appear before respondWith')

# No stale pass-specific flags that can prevent reinstalling the bridge.
for rel, text in [('static/yx_data_store.js',data),('static/yx_mutation_bus.js',mut)]:
    for stale in ['__yxDataSpineFetchV471','__yxDataSpineFetchV472','__yxDataSpineFetchV473','__yxDataSpineFetchV474','__yxDataSpineFetchV475','__yxMutationBusV471','__yxMutationBusV472','__yxMutationBusV473','__yxMutationBusV474','__yxMutationBusV475']:
        if stale in text:
            fail.append(f'{rel} has stale install flag {stale}')

if fail:
    print('FUNCTIONAL PATH AUDIT FAILED')
    for x in fail: print('-', x)
    if warn:
        print('WARNINGS')
        for x in warn: print('-', x)
    sys.exit(1)
print('FUNCTIONAL PATH AUDIT OK')
if warn:
    print('WARNINGS')
    for x in warn: print('-', x)
