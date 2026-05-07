from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'V119'
for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py']:
    path = ROOT / rel
    compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')
required = {
    'templates/base.html': [VERSION, 'yx-mobile-bottom-nav', 'yx_final_ui_lock.css', 'page_inventory_master_v22.js', 'page_orders_master_v22.js', 'page_master_order_master_v22.js', 'page_ship_master_v22.js', 'page_warehouse_master_v22.js'],
    'templates/module.html': ['warehouse-unplaced-pill', '未分區 0 件', 'yx121-save-cell', 'yx121-warehouse-undo'],
    'static/service-worker.js': [VERSION, "cache:'reload'"],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__', '__YX_V105_MOBILE_UI__', '__YX_V105_GENERIC_TARGET__', '__YX_V105_LOCK_SYNC_TARGET__', 'YXEditLock', 'edit-locks/status', '__YX_V109_TIMELINE_SHIP_LOCK__', '/api/v111/warehouse-action-timeline', '__YX_V112_UNIFIED_DEDUCT_LOCK__', '/api/v111/shipping-deduct-unified', '__YX_V113_TRACE_OPEN_LOCK__', '/api/v113/shipping-deduct-trace', '__YX_V119_STABLE_TRACE_LOCK__', '/api/v115/shipping-deduct-trace'],
    'app.py': ['/api/warehouse/cell', '/api/warehouse/available-items', '/api/today-changes/resolve-target', '/api/edit-locks/acquire', '/api/edit-locks/status', '/api/edit-locks/renew', '/api/ship/offline-validate', '/api/search-assistant/suggest', '/api/offline-conflicts/resolve-target', '/api/v105/capabilities', '/api/v113/capabilities', '/api/v115/capabilities', '/api/warehouse/refresh-cells', '/api/warehouse/open-cell', 'warehouse_item_exact_key', 'warehouse_split_support_components', 'zone_summary', '格位沒有確實寫入資料庫'],
    'db.py': ['edit_locks', 'def warehouse_save_cell', 'ON CONFLICT(zone, column_index, slot_type, slot_number)', '_yx_v51_ensure_warehouse_schema'],
    'static/yx_pages/page_warehouse_master_v22.js': ['未分區 ${unassigned} 件', 'optionLabel', 'source_id', 'exact_key', '__YX_V92_WAREHOUSE_URL_TARGET__', "sp.get('open')"],
    'static/style.css': ['V48 MAINFILE warehouse persistence', 'yx121-batch-row', 'yx-direct-current-item', 'yx-mobile-bottom-nav', 'yx-v91-locate-btn', 'V112 next package', 'V113 next package', 'V119 stable warehouse trace', 'yx97-col-stats', 'yx97-warehouse-deduct-chip', 'yx106-panel'],
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
print('v119 next package: unified open/trace/timeline smoke test OK')

# V119_EXTRA_CHECKS
extra_required = {
    'app.py': ['/api/v119/capabilities', '/api/v119/remaining-progress', '/api/v119/open-focus-target', '/api/v119/shipping-deduct-trace'],
    'static/pwa.js': ['__YX_V119_REMAINING_PROGRESS_LOCK__', '/api/v119/remaining-progress'],
    'static/style.css': ['yx-v119-progress-panel'],
}
for rel, toks in extra_required.items():
    txt2 = (ROOT / rel).read_text(encoding='utf-8', errors='ignore')
    miss = [t for t in toks if t not in txt2]
    if miss:
        raise SystemExit(f'{rel} missing V119 {miss}')
print('v119 extra checks OK')
