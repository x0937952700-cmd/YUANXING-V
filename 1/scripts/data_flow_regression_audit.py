#!/usr/bin/env python3
"""Yuanxing data-flow regression audit.
Checks that sync/data/mutation paths stay on the single data spine.
No network, no external dependencies, no DB writes.
"""
from pathlib import Path
import re, sys, ast
root = Path(__file__).resolve().parents[1]
fail=[]
warn=[]
VERSION_APP='V119-V486-DEEP-DIAG-REAL-ISSUE-DETECT'
VERSION_STATIC='119-v486_deep_diag_real_issue_detect'
VERSION_JS='v486-deep-diag-real-issue-detect'

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}')
        return ''
    return p.read_text(encoding='utf-8', errors='ignore')

def has(text, token, label):
    if token not in text:
        fail.append(f'missing {label}: {token}')

# Python compile check for deploy scripts and app files.
for rel in ['app.py','db.py','wsgi.py','backup.py','ocr.py','scripts/deploy_smoke_verify.py','scripts/static_data_spine_audit.py','scripts/predeploy_audit.py','scripts/data_flow_regression_audit.py']:
    text=read(rel)
    if text:
        try: ast.parse(text)
        except SyntaxError as e: fail.append(f'{rel} syntax error: {e}')

app=read('app.py')
has(app, VERSION_APP, 'APP_VERSION')
has(app, VERSION_STATIC, 'STATIC_VERSION')

base=read('templates/base.html')
order=['yx_cache.js','yx_core.js','yx_device_sync.js','yx_data_store.js','yx_mutation_bus.js']
positions=[]
for name in order:
    i=base.find(name)
    if i < 0: fail.append(f'base.html does not load {name}')
    positions.append(i)
if all(i>=0 for i in positions) and positions != sorted(positions):
    fail.append('base.html load order must be cache -> core -> device_sync -> data_store -> mutation_bus')
if 'yx_v452_max_repair.js' in base or (root/'static/yx_v452_max_repair.js').exists():
    fail.append('old yx_v452_max_repair bridge still present')

# Core spine modules.
data=read('static/yx_data_store.js')
for token in [
    VERSION_JS,
    'installApiBridge', 'installFetchBridge', 'localResponseForApi',
    'getRowsMeta', 'setRows', 'upsertRows', 'removeRows',
    'buildCustomerRows', 'buildCustomersFromSources', 'rowsForCustomer',
    'getTodayWithUnplaced', 'filterAvailableAgainstWarehouse', 'warehouseItemKey',
    'today-changes\\/(count|badge)', 'yxRawFetch', 'yxDbOnly'
]:
    has(data, token, 'yx_data_store.js data-spine token')
endpoint_markers = {
    '/api/inventory': r'\/api\/inventory',
    '/api/orders': r'\/api\/orders',
    '/api/master_orders': r'\/api\/master_orders',
    '/api/customers': r'\/api\/customers',
    '/api/customer-items': r'\/api\/customer-items',
    '/api/today-changes': r'\/api\/today-changes',
    '/api/warehouse': r'\/api\/warehouse',
    '/api/warehouse/available-items': r'\/api\/warehouse\/available-items',
}
for endpoint, marker in endpoint_markers.items():
    if marker not in data and endpoint not in data:
        fail.append(f'yx_data_store.js bridge does not cover {endpoint}')
for old in ['__yxDataSpineFetchV471','__yxDataSpineFetchV472','__yxDataSpineFetchV473','__yxDataSpineV471','__yxDataSpineV472','__yxDataSpineV473','__YX_V473_REFRESH_CLEANUP__']:
    if old in data:
        fail.append(f'yx_data_store.js still has stale bridge flag {old}')

mut=read('static/yx_mutation_bus.js')
for token in [VERSION_JS,'applyMutation','applyRespRows','installApi','installFetch','reduceAfterShip','appendTodayLocal','upsertRows','removeRows','setRows']:
    has(mut, token, 'yx_mutation_bus.js mutation token')
for old in ['__yxMutationBusV471','__yxMutationBusV472','__yxMutationBusV473']:
    if old in mut:
        fail.append(f'yx_mutation_bus.js still has stale flag {old}')

sync=read('static/yx_device_sync.js')
for token in [VERSION_JS, 'yxRawFetch:true', 'sync_full=1', 'readCachedPayload', 'writeCachedPayload', 'yx_warehouse_cache_v486-deep-diag-real-issue-detect', 'yx_warehouse_available_cache_v486-deep-diag-real-issue-detect']:
    has(sync, token, 'yx_device_sync.js sync token')
for key in ['inventory','orders','master_order','customers','warehouse','warehouse_available','shipping_records','today_changes','todos']:
    if f"key:'{key}'" not in sync and f'key:"{key}"' not in sync:
        fail.append(f'yx_device_sync.js missing sync task key {key}')

# Service worker API bypass must occur before cache respondWith.
sw=read('static/service-worker.js')
has(sw, 'yuanxing-v483-static-css-icons', 'service-worker cache version')
api_pos=max(sw.find("url.pathname.startsWith('/api/')"), sw.find('url.pathname.startsWith("/api/")'))
rw_pos=sw.find('event.respondWith')
if api_pos < 0:
    fail.append('service-worker missing /api bypass')
elif rw_pos >= 0 and api_pos > rw_pos:
    fail.append('service-worker /api bypass must be before respondWith')

manifest=read('static/manifest.webmanifest')
has(manifest, '119-v486-deep-diag-real-issue-detect', 'manifest version')

# Page-level regression checks: critical pages must either reference YXDataStore directly or be protected by bridges loaded before pages.
critical_pages=['inventory_page.js','product_page_core.js','shipping_page.js','today_changes_page.js','warehouse_page.js','home_page.js']
bridge_ok = all(tok in data for tok in ['installApiBridge','installFetchBridge','localResponseForApi'])
for name in critical_pages:
    rel=f'static/yx_pages/{name}'
    text=read(rel)
    if not text: continue
    if 'new MutationObserver' in text:
        fail.append(f'{rel} creates MutationObserver')
    if re.search(r'\bsetInterval\s*\(', text):
        fail.append(f'{rel} creates setInterval')
    if name in ['product_page_core.js','shipping_page.js','today_changes_page.js','warehouse_page.js'] and 'YXDataStore' not in text and not bridge_ok:
        fail.append(f'{rel} has no YXDataStore reference and no bridge protection')
    risky_force = len(re.findall(r'force\s*[:=]\s*true|force=1', text))
    direct_fetch = len(re.findall(r'\bfetch\s*\(', text))
    if risky_force:
        warn.append(f'{rel}: {risky_force} force refresh strings remain but must be local-first bridged')
    if direct_fetch:
        warn.append(f'{rel}: {direct_fetch} direct fetch calls remain but must be fetch-bridged')

# Ensure audit scripts are wired into predeploy audit.
pre=read('scripts/predeploy_audit.py')
has(pre, 'scripts/data_flow_regression_audit.py', 'predeploy audit includes data-flow regression script')
static_audit=read('scripts/static_data_spine_audit.py')
has(static_audit, VERSION_APP, 'static audit expected app version')
has(static_audit, VERSION_JS, 'static audit expected JS version')

if warn:
    print('DATA FLOW REGRESSION WARNINGS')
    for w in warn: print('-', w)

# V480: page modules must not call direct fetch(); all page network reads go through YXDataStore.requestResponse/requestJson.
for js_path in sorted((root/'static'/'yx_pages').glob('*.js')):
    txt = read(js_path)
    if 'fetch(' in txt:
        fail.append(f'page still has direct fetch(): {js_path.relative_to(root)}')
for js_path in sorted((root/'static'/'yx_pages').glob('*.js')):
    txt = read(js_path)
    if 'force=1' in txt or 'force=0' in txt:
        fail.append(f'page still has old force query flag: {js_path.relative_to(root)}')

if fail:
    print('DATA FLOW REGRESSION AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('DATA FLOW REGRESSION AUDIT OK')
