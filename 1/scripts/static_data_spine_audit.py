#!/usr/bin/env python3
"""Static audit for Yuanxing data-spine package. No external deps."""
from pathlib import Path
import re, sys
root = Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f"missing {rel}"); return ""
    return p.read_text(encoding='utf-8', errors='ignore')

base=read('templates/base.html')
required_order=['yx_cache.js','yx_core.js','yx_device_sync.js','yx_data_store.js','yx_mutation_bus.js','yx_regression_guard.js','yx_diagnostics_client.js']
pos=[]
for name in required_order:
    i=base.find(name)
    if i<0: fail.append(f"base.html does not load {name}")
    pos.append(i)
if all(i>=0 for i in pos) and pos != sorted(pos):
    fail.append('base.html core script order is wrong')
if 'yx_pages/diagnostics_page.js' not in base:
    fail.append('base.html does not load diagnostics_page.js')
if 'yx_v452_max_repair.js' in base:
    fail.append('old yx_v452_max_repair.js is still loaded')
if (root/'static/yx_v452_max_repair.js').exists():
    fail.append('old static/yx_v452_max_repair.js still exists')

app=read('app.py')
if 'V119-V485-RESTORE-BUTTONS-REALTIME-SHIP-WH' not in app:
    fail.append('APP_VERSION is not v483')
if '119-v485_restore_buttons_realtime_ship_wh' not in app:
    fail.append('STATIC_VERSION is not v483')

# PWA / service worker must not cache API and must use current cache token.
sw=read('static/service-worker.js')
if 'yuanxing-v483-static-css-icons' not in sw:
    fail.append('service-worker cache version is not v483')
if "url.pathname.startsWith('/api/')" not in sw and 'pathname.startsWith("/api/")' not in sw:
    fail.append('service-worker does not explicitly bypass /api/')
if 'event.respondWith' in sw:
    # ensure API bypass occurs before respondWith block in the source
    api_pos=max(sw.find("url.pathname.startsWith('/api/')"), sw.find('pathname.startsWith("/api/")'))
    rw_pos=sw.find('event.respondWith')
    if api_pos < 0 or api_pos > rw_pos:
        fail.append('service-worker API bypass is after respondWith')
manifest=read('static/manifest.webmanifest')
if '119-v485-restore-buttons-realtime-ship-wh' not in manifest:
    fail.append('manifest start/id version is not v483')

data=read('static/yx_data_store.js')
for token in ['installApiBridge','installFetchBridge','localResponseForApi','getTodayWithUnplaced','today-changes\\/(count|badge)','filterAvailableAgainstWarehouse','v485-restore-buttons-realtime-ship-wh']:
    if token not in data:
        fail.append(f'yx_data_store.js missing {token}')
for old_flag in ['__yxDataSpineFetchV471','__yxDataSpineV471','__YX_V471_REFRESH_CLEANUP__','__yxDataSpineFetchV472','__yxDataSpineV472','__YX_V472_REFRESH_CLEANUP__']:
    if old_flag in data:
        fail.append(f'yx_data_store.js still has old flag {old_flag}')

mut=read('static/yx_mutation_bus.js')
for token in ['applyMutation','installApi','installFetch','reduceAfterShip','appendTodayLocal','v485-restore-buttons-realtime-ship-wh']:
    if token not in mut:
        fail.append(f'yx_mutation_bus.js missing {token}')
for old_flag in ['__yxMutationBusV471','__yxMutationBusV472']:
    if old_flag in mut:
        fail.append(f'yx_mutation_bus.js still has old flag {old_flag}')

sync=read('static/yx_device_sync.js')
for token in ['v485-restore-buttons-realtime-ship-wh','yx_warehouse_cache_v485-restore-buttons-realtime-ship-wh','yx_warehouse_available_cache_v485-restore-buttons-realtime-ship-wh']:
    if token not in sync:
        fail.append(f'yx_device_sync.js missing {token}')

pages=list((root/'static/yx_pages').glob('*.js'))
for p in pages+[root/'static/yx_data_store.js', root/'static/yx_mutation_bus.js']:
    text=p.read_text(encoding='utf-8', errors='ignore')
    rel=p.relative_to(root)
    if 'new MutationObserver' in text:
        fail.append(f'{rel} creates MutationObserver')
    if re.search(r'\bsetInterval\s*\(', text):
        fail.append(f'{rel} creates setInterval')

for rel in ['static/yx_pages/product_page_core.js','static/yx_pages/shipping_page.js','static/yx_pages/today_changes_page.js','static/yx_pages/warehouse_page.js','static/yx_pages/diagnostics_page.js','static/yx_regression_guard.js']:
    text=read(rel)
    if 'YXDataStore' not in text and rel not in ['static/yx_pages/today_changes_page.js']:
        fail.append(f'{rel} has no direct YXDataStore reference; bridge only')

if fail:
    print('STATIC DATA SPINE AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('STATIC DATA SPINE AUDIT OK')
