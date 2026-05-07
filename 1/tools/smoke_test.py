from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'V133'
for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py','tools/render_db_init.py']:
    path = ROOT / rel
    compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')
required = {
    'templates/base.html': [VERSION, 'yx-mobile-bottom-nav', 'yx_final_ui_lock.css', 'page_inventory_master_v22.js'],
    'static/service-worker.js': [VERSION, "cache:'reload"],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__', '__YX_V133_BUG_REPAIR_PANEL__', '/api/v133/bug-audit', '/api/v133/open-focus-target'],
    'app.py': ['BASE_DIR = os.path.dirname(os.path.abspath(__file__))', '/api/v133/capabilities', '/api/v133/render-readiness', '/api/v133/bug-audit', '_yx_v133_unhandled_error'],
    'db.py': ['edit_locks', 'def warehouse_save_cell', '_yx_v51_ensure_warehouse_schema', 'V133: if a pooled connection became stale'],
    'render.yaml': ['YX_STARTUP_DB_INIT=skip', 'gunicorn wsgi:app', 'tools/render_db_init.py'],
    'wsgi.py': ['YX_STARTUP_DB_INIT', 'skip', 'app.run(host="0.0.0.0"'],
    'tools/render_db_init.py': ['V132', 'init_db', 'table_counts', 'database_mode_info'],
    'static/style.css': ['V133 full bug repair diagnostics panel', 'yx-v133-bug-panel'],
}
for rel, toks in required.items():
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f'missing {rel}')
    txt = path.read_text(encoding='utf-8', errors='ignore')
    miss = [t for t in toks if t not in txt]
    if miss:
        raise SystemExit(f'{rel} missing {miss}')
combined = '
'.join(p.read_text(encoding='utf-8', errors='ignore') for p in [ROOT/'templates/base.html', ROOT/'static/pwa.js', ROOT/'static/service-worker.js'])
for bad in ['page_inventory_master_v21.js','page_orders_master_v21.js','full-master-v21','full-master-v20']:
    if bad in combined:
        raise SystemExit(f'stale loaded reference: {bad}')
print('v133 full bug repair smoke test OK')
