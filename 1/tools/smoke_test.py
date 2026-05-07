from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'V127'
for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py']:
    path = ROOT / rel
    compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')
required = {
    'templates/base.html': [VERSION, 'yx-mobile-bottom-nav', 'yx_final_ui_lock.css', 'page_inventory_master_v22.js', 'page_orders_master_v22.js', 'page_master_order_master_v22.js', 'page_ship_master_v22.js', 'page_warehouse_master_v22.js'],
    'static/service-worker.js': [VERSION, "cache:'reload'"],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__', '__YX_V127_REAL_DEVICE_LOCK__', '/api/v127/smoke-report', '/api/v127/render-readiness'],
    'app.py': ['/api/v127/capabilities', '/api/v127/remaining-progress', '/api/v127/open-focus-target', '/api/v127/shipping-deduct-trace', '/api/v127/render-readiness', '/api/v127/smoke-report', '/api/v126/capabilities'],
    'db.py': ['edit_locks', 'def warehouse_save_cell', '_yx_v51_ensure_warehouse_schema'],
    'static/style.css': ['V127 real-device/render stability panel', 'yx-v127-ready-panel'],
    'docs/V127_REAL_DEVICE_RENDER_STABILITY_REPORT.md': ['V127 實機', '/api/v127/capabilities'],
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
print('v127 real-device/render stability smoke test OK')
