from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'full-master-v52_final_verified_main_rewrite'
for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py']:
    path = ROOT / rel
    compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')
required = {
    'templates/base.html': [VERSION, 'yx_final_ui_lock.css', 'page_inventory_master_v22.js', 'page_orders_master_v22.js', 'page_master_order_master_v22.js', 'page_ship_master_v22.js', 'page_warehouse_master_v22.js'],
    'templates/module.html': ['warehouse-unplaced-pill', '未分區 0 件', 'yx121-save-cell', 'yx121-warehouse-undo'],
    'static/service-worker.js': [VERSION, "cache:'reload'"],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__'],
    'app.py': ['/api/warehouse/cell', '/api/warehouse/available-items', 'warehouse_item_exact_key', 'warehouse_split_support_components', 'zone_summary', '格位沒有確實寫入資料庫'],
    'db.py': ['def warehouse_save_cell', 'ON CONFLICT(zone, column_index, slot_type, slot_number)', '_yx_v51_ensure_warehouse_schema'],
    'static/yx_pages/page_warehouse_master_v22.js': ['未分區 ${unassigned} 件', 'optionLabel', 'source_id', 'exact_key'],
    'static/style.css': ['V48 MAINFILE warehouse persistence', 'yx121-batch-row', 'yx-direct-current-item'],
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
print('v51 warehouse persist split support smoke test OK')
