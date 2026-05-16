#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
fail=[]
def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')
app=read('app.py')
ship=read('static/yx_pages/shipping_page.js')
pwa=read('static/pwa.js')
sw=read('static/service-worker.js')
manifest=read('static/manifest.webmanifest')
for token in ['V119-V520-FINAL-SHIP-CACHE-ALIGN-PACK30','119-v520_final_ship_cache_align_pack30','v520-final-ship-cache-align-pack30']:
    if token not in app+ship+pwa:
        fail.append(f'missing V520 token {token}')
checks={
 'service worker v520 cache': 'yuanxing-v520-static-css-icons' in sw and 'yuanxing-v518-static-css-icons' not in sw,
 'manifest v520': 'v520-final-ship-cache-align-pack30' in manifest and '119-v520_final_ship_cache_align_pack30' in manifest,
 'pwa stale version cleanup': 'cleanupStaleVersionCaches' in pwa and 'ship_customers_' in pwa and 'ship_items_' in pwa,
 'shipping server verify': 'verifyShipCustomersFromServer' in ship and '/api/customers?source=ship' in ship,
 'shipping three source readback': all(x in ship for x in ["['orders','訂單']", "['master_order','總單']", "['inventory','庫存']"]),
 'shipping brief db wait': 'Promise.race([verifyPromise' in ship and '2200' in ship,
 'startup clears ship cache group once': 'yx_ship_cache_cleaned_' in ship and "clearGroup?.('ship_items_')" in ship,
 'no OCR photo scope': 'navigator.mediaDevices' not in ship and 'getUserMedia' not in ship,
}
for name,ok in checks.items():
    if not ok: fail.append(name)
if fail:
    print('V520 FINAL SHIP CACHE ALIGN AUDIT FAILED')
    for x in fail: print('-',x)
    sys.exit(1)
print('V520 FINAL SHIP CACHE ALIGN AUDIT OK')
