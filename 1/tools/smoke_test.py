from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'full-master-v40_fresh_product_order_warehouse_lock'
for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py']:
    path = ROOT / rel
    compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')
required = {
    'templates/base.html': [VERSION, 'yx_final_ui_lock.css', 'yx_v40_table_customer_warehouse_lock.css', 'yx_v40_submit_warehouse_lock.js', 'page_inventory_master_v22.js', 'page_orders_master_v22.js', 'page_master_order_master_v22.js', 'page_ship_master_v22.js', 'page_warehouse_master_v22.js'],
    'static/service-worker.js': [VERSION, "cache:'no-store'"],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__'],
    'static/yx_v40_submit_warehouse_lock.js': ['__YX_V40_SUBMIT_WAREHOUSE_LOCK__', 'window.confirmSubmit', 'submitNow', 'yx121-save-cell'],
    'static/yx_v40_table_customer_warehouse_lock.css': ['支數 x 件數', 'nth-child(4)', 'yx113-customer-left', 'yx116-customer-tag'],
    'app.py': ['/api/warehouse/cell', 'orders_main_save_v40', 'master_orders_main_save_v40', 'warehouse_cell_main_save_v40', 'duplicate_mode'],
    'db.py': ['V40 helper', 'def customer_uid(customer_name)', 'V40 FINAL WAREHOUSE SAVE OVERRIDE', 'ON CONFLICT'],
    'static/yx_pages/page_inventory_master_v22.js': ['YX113ProductActions', 'applySnapshotFromResponse', 'decideDuplicateMode', 'yx-month-tag'],
}
for rel, toks in required.items():
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f'missing {rel}')
    txt = path.read_text(encoding='utf-8', errors='ignore')
    miss = [t for t in toks if t not in txt]
    if miss:
        raise SystemExit(f'{rel} missing {miss}')
combined = '\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in [ROOT/'templates/base.html', ROOT/'static/pwa.js', ROOT/'static/service-worker.js'])
for bad in ['page_inventory_master_v21.js','page_orders_master_v21.js','page_master_order_master_v21.js','page_*_master_v2.js','full-master-v21','full-master-v20','full-master-v19','full-master-v18','full-master-v17','full-master-v16','full-master-v15','full-master-v14','full-master-v13','full-master-v12','full-master-v11','full-master-v10','full-master-v9']:
    if bad in combined:
        raise SystemExit(f'stale loaded reference: {bad}')
print('v40 fresh submit/table/warehouse smoke test OK')
