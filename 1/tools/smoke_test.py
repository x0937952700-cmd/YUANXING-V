from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'V134'
for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py','tools/render_db_init.py']:
    path = ROOT / rel
    if path.exists():
        compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')
required = {
    'templates/base.html': [VERSION, 'yx-mobile-bottom-nav', 'yx_final_ui_lock.css', 'page_inventory_master_v22.js'],
    'static/service-worker.js': [VERSION],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__', '__YX_V134_PERFORMANCE_CLEANUP__'],
    'app.py': ['/api/v134/capabilities', '/api/v134/render-readiness', '/api/v134/bug-audit'],
    'db.py': ['edit_locks', 'def warehouse_save_cell', '_yx_v51_ensure_warehouse_schema'],
    'render.yaml': ['YX_STARTUP_DB_INIT=skip', 'gunicorn wsgi:app', 'tools/render_db_init.py'],
    'wsgi.py': ['YX_STARTUP_DB_INIT', 'skip'],
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
for bad in ['V133 全面 Bug 檢查','V133 Render / DB','工作台總覽','智能搜尋助手','page_inventory_master_v21.js','page_orders_master_v21.js','full-master-v21','full-master-v20']:
    if bad in combined:
        raise SystemExit(f'stale loaded reference: {bad}')
print('v134 performance cleanup smoke test OK')
