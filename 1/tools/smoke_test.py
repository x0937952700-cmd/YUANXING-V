from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'full-master-v80_warehouse_data_rescue_batch_edit_fixed'
for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py']:
    path = ROOT / rel
    compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')
required = {
    'render.yaml': ['releaseCommand', 'init_db', 'gunicorn wsgi:app'],
    'templates/base.html': [VERSION, 'yx_final_ui_lock.css', 'page_inventory_master_v22.js', 'page_orders_master_v22.js', 'page_master_order_master_v22.js', 'page_ship_master_v22.js', 'page_warehouse_master_v22.js'],
    'templates/module.html': ['data-yx132-batch-zone="A" data-source="orders"', 'data-yx132-batch-zone="B" data-source="orders"', 'data-yx132-batch-zone="A" data-source="master_order"', 'data-yx132-batch-transfer="master_order" data-source="orders"'],
    'static/service-worker.js': [VERSION, "cache:'no-store'"],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__'],
    'app.py': ['/api/warehouse/add-slot', '/api/warehouse/remove-slot', 'warehouse_add_slot_log', 'warehouse_remove_slot_log', 'yx_v35_safe_side_effect'],
    'db.py': ['def warehouse_add_slot', 'def warehouse_remove_slot', 'warehouse_grid_v80_min20_rescued', 'def _warehouse_seed_minimum_20_once', 'ON CONFLICT'],
    'static/yx_pages/page_warehouse_master_v22.js': ['optimisticSlot', 'insertWarehouseCell', 'deleteWarehouseCell'],
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
print('v80 warehouse rescue/batch-edit smoke test OK')
