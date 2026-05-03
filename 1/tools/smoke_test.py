from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'full-master-v22-real-loaded-complete'
for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py']:
    path = ROOT / rel
    compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')
required = {
    'templates/base.html': [VERSION, 'page_inventory_master_v22.js', 'page_orders_master_v22.js', 'page_master_order_master_v22.js', 'page_ship_master_v22.js', 'page_warehouse_master_v22.js'],
    'static/service-worker.js': [VERSION, "cache:'no-store'"],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__'],
    'app.py': ['/api/customers/ensure', '/api/customers/move', 'yx_v22_product_snapshots', 'snapshots=yx_v22_product_snapshots()'],
    'static/yx_pages/page_orders_master_v22.js': ['YX113ProductActions', 'bulkDelete', 'refreshCustomerBoardsSafe', 'moveCustomer', 'applySnapshotFromResponse'],
    'static/yx_pages/page_master_order_master_v22.js': ['YX113ProductActions', 'bulkDelete', 'refreshCustomerBoardsSafe', 'moveCustomer', 'applySnapshotFromResponse'],
    'static/yx_pages/page_inventory_master_v22.js': ['YX113ProductActions', 'bulkDelete', 'applySnapshotFromResponse'],
}
for rel, toks in required.items():
    path = ROOT / rel
    if not path.exists(): raise SystemExit(f'missing {rel}')
    txt = path.read_text(encoding='utf-8', errors='ignore')
    miss = [t for t in toks if t not in txt]
    if miss: raise SystemExit(f'{rel} missing {miss}')
combined = '\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in [ROOT/'templates/base.html', ROOT/'static/pwa.js', ROOT/'static/service-worker.js'])
for bad in ['page_inventory_master_v21.js','page_orders_master_v21.js','page_master_order_master_v21.js','page_*_master_v2.js','full-master-v21','full-master-v20','full-master-v19','full-master-v18','full-master-v17','full-master-v16','full-master-v15','full-master-v14','full-master-v13','full-master-v12','full-master-v11','full-master-v10','full-master-v9']:
    if bad in combined: raise SystemExit(f'stale loaded reference: {bad}')
for js in (ROOT/'static/yx_pages').glob('*.js'):
    txt = js.read_text(encoding='utf-8', errors='ignore')
    if 'window.__YX_full-master' in txt:
        raise SystemExit(f'invalid window flag remains: {js}')
print('v22 real loaded complete smoke test OK')
