#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.py').read_text(encoding='utf-8')
ship=(ROOT/'static/yx_pages/shipping_page.js').read_text(encoding='utf-8')
prod=(ROOT/'static/yx_pages/product_page_core.js').read_text(encoding='utf-8')
wh=(ROOT/'static/yx_pages/warehouse_page.js').read_text(encoding='utf-8')
fail=[]
def check(cond,msg):
    if not cond: fail.append(msg)
check('/api/product-locations' in app and '_v507_warehouse_location_hits' in app, 'missing canonical /api/product-locations')
check('/api/warehouse/search' in app and 'customer_name' in app and 'product_text' in app and 'source_id' in app, 'warehouse search missing source-aware params')
check('function reverseLookup' in ship and 'showShipLocations' in ship and '請使用倉庫圖搜尋商品位置' not in ship, 'shipping reverseLookup still legacy toast')
check('/api/product-locations' in ship and 'preserve_previous' in ship and 'yx-location-warning' in ship, 'shipping location lookup not cache-safe')
check('/api/product-locations' in prod, 'product pages not using product-locations endpoint')
check('applyWarehouseShipColumnSnapshots' in wh and 'applyWarehouseDeductFromShip' in wh, 'warehouse ship readback hooks missing')
check('setInterval(()=> ' not in ship and 'setInterval(function' not in ship, 'new setInterval found in shipping patch')
check('new MutationObserver' not in ship, 'new MutationObserver found in shipping patch')
if fail:
    print('SHIP_LOCATION_SYNC_AUDIT_FAIL')
    for x in fail: print('-',x)
    raise SystemExit(1)
print('SHIP_LOCATION_SYNC_AUDIT_OK')
