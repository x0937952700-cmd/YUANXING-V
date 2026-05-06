from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'full-master-v79_warehouse_slot_add_delete_gapless_buttons_fixed'
for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py']:
    path = ROOT / rel
    compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')
required = {
    'templates/base.html': [VERSION, 'yx_final_ui_lock.css', 'page_inventory_master_v22.js', 'page_orders_master_v22.js', 'page_master_order_master_v22.js', 'page_ship_master_v22.js', 'page_warehouse_master_v22.js'],
    'templates/module.html': ['data-dynamic-slots="true"', 'yx-warehouse-loading-slot', 'data-yx132-batch-transfer="master_order" data-source="orders"', 'data-yx132-batch-zone="A" data-source="orders"', 'data-yx132-batch-zone="B" data-source="orders"', 'data-yx132-batch-zone="A" data-source="master_order"', 'data-yx113-batch-delete="orders"', 'data-yx128-edit-all="master_order"'],
    'static/service-worker.js': [VERSION, "cache:'no-store'"],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__'],
    'app.py': ['/api/warehouse/add-slot', '/api/warehouse/remove-slot', 'warehouse_add_slot_log', 'warehouse_remove_slot_log', 'yx_v35_safe_side_effect'],
    'db.py': ['def warehouse_add_slot', 'def warehouse_remove_slot', 'def warehouse_normalize_slot_grid', 'already_absent', "COALESCE(NULLIF(slot_type,''), 'direct')"],
    'static/yx_pages/page_warehouse_master_v22.js': ['HTML 不再預畫 20 個假格', '已清除不存在的舊格', 'optimisticSlot'],
    'static/yx_pages/page_orders_master_v22.js': ['summaryBatchButtons', 'data-yx132-batch-transfer="master_order"', '批量刪除'],
    'static/yx_pages/page_master_order_master_v22.js': ['summaryBatchButtons', 'data-yx132-batch-zone="A"', '批量編輯全部'],
    'static/yx_final_ui_lock.css': ['V79: 訂單/總單主動作按鈕固定在清單表頭', '#orders-list-section .yx128-summary-controls'],
}
for rel, toks in required.items():
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f'missing {rel}')
    txt = path.read_text(encoding='utf-8', errors='ignore')
    miss = [t for t in toks if t not in txt]
    if miss:
        raise SystemExit(f'{rel} missing {miss}')
# Warehouse HTML may not pre-render fake data-slot buttons anymore.
module = (ROOT/'templates/module.html').read_text(encoding='utf-8', errors='ignore')
if '{% for slot in range(1, 21) %}' in module:
    raise SystemExit('warehouse template still pre-renders fake 20 slots')
combined = '\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in [ROOT/'templates/base.html', ROOT/'static/pwa.js', ROOT/'static/service-worker.js'])
for bad in ['full-master-v78','page_inventory_master_v21.js','page_orders_master_v21.js','page_master_order_master_v21.js','full-master-v21','full-master-v20','full-master-v19','full-master-v18','full-master-v17','full-master-v16','full-master-v15','full-master-v14','full-master-v13','full-master-v12','full-master-v11','full-master-v10','full-master-v9']:
    if bad in combined:
        raise SystemExit(f'stale loaded reference: {bad}')
print('v79 warehouse slot gapless/order-master header buttons smoke test OK')
