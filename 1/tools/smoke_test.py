from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'full-master-v81_from_v78_safe_warehouse_batch_header_fixed'
for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py']:
    path = ROOT / rel
    compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')
required = {
    'templates/base.html': [VERSION, 'yx_final_ui_lock.css', 'page_inventory_master_v22.js', 'page_orders_master_v22.js', 'page_master_order_master_v22.js', 'page_ship_master_v22.js', 'page_warehouse_master_v22.js'],
    'templates/module.html': ['id="yx113-orders-toolbar"', 'id="yx113-master_order-toolbar"', 'data-yx113-batch-material="orders"', 'data-yx113-batch-material="master_order"'],
    'static/service-worker.js': [VERSION, "cache:'no-store'"],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__'],
    'app.py': ['/api/warehouse/add-slot', '/api/warehouse/remove-slot', 'warehouse_add_slot_log', 'warehouse_remove_slot_log', 'yx_v35_safe_side_effect'],
    'db.py': ['def warehouse_add_slot', 'def warehouse_remove_slot', 'V81_FROM_V78_SAFE_WAREHOUSE_GRID_FIX', 'ensure_warehouse_default_20_once', 'ON CONFLICT'],
    'static/yx_pages/page_warehouse_master_v22.js': ['optimisticSlot', '交給後端先補缺格再刪除', '插入格子'],
    'static/yx_pages/page_orders_master_v22.js': ['data-yx132-batch-zone="A"', 'data-yx132-batch-transfer="master_order"', '加到總單'],
    'static/yx_pages/page_master_order_master_v22.js': ['data-yx132-batch-zone="A"', '移到A區', '移到B區'],
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
for bad in ['page_inventory_master_v21.js','page_orders_master_v21.js','page_master_order_master_v21.js','full-master-v21','full-master-v20','full-master-v19','full-master-v18','full-master-v17','full-master-v16','full-master-v15','full-master-v14','full-master-v13','full-master-v12','full-master-v11','full-master-v10','full-master-v9']:
    if bad in combined:
        raise SystemExit(f'stale loaded reference: {bad}')
print('v81 from-v78 warehouse slot/order-master header button smoke test OK')
