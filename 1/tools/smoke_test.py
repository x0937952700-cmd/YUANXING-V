from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
VERSION = 'full-master-v52-products-ship-warehouse-real-loaded-html-js-css-app-writeback'

for rel in ['app.py','db.py','backup.py','ocr.py','wsgi.py']:
    path = ROOT / rel
    compile(path.read_text(encoding='utf-8', errors='ignore'), str(path), 'exec')

required = {
    'requirements.txt': ['Flask==3.0.3', 'gunicorn==22.0.0', 'psycopg2-binary==2.9.9', 'Pillow==10.4.0', 'openpyxl==3.1.5'],
    'templates/base.html': [VERSION, '__YX_MASTER_VERSION__', 'yxV28LoadedAudit', 'yxV32RealWriteback', 'yxV42ShipWarehouseWriteback', 'yxV44ProductSubmitWriteback', 'yxV48ProductsWriteback', 'yxV51ProductsWriteback', 'yx-asset-error-banner', 'page_inventory_master_v52.js', 'page_orders_master_v52.js', 'page_master_order_master_v52.js', 'page_login_master_v52.js', 'page_ship_master_v52.js', 'page_warehouse_master_v52.js'],
    'templates/index.html': ['today-changes-btn', 'yx-v52-home-centered-actions'],
    'templates/settings.html': ['loadBackupsManual()', '載入備份清單', "downloadReport('orders')", "downloadReport('warehouse')", 'data-yx28-backup-actions'],
    'templates/today_changes.html': ['today-unplaced-list', 'yx26-unplaced-panel', 'data-today-panel="unplaced"', 'today-filter-unplaced'],
    'templates/module.html': ['warehouse-unplaced-list-inline', 'data-html-locked="warehouse-unplaced-inline-list"', 'ship-preview-panel', 'data-yx42-html-shell="ship-preview-real-loaded"', 'data-yx42-warehouse-html="real-loaded"', 'data-yx-v44-submit="real-loaded"', 'data-yx-v48-submit="real-loaded"', 'data-yx-v52-submit="real-loaded"', 'data-yx-v52-products="real-loaded"', 'data-yx-v48-duplicate-panel="real-loaded"', 'data-yx-v52-duplicate-panel="real-loaded"'],
    'static/style.css': ['V26 REAL LOADED HTML / JS / CSS AUDIT LOCK', 'V27 REAL LOADED HTML / JS / CSS AUDIT LOCK', 'V28 REAL LOADED HTML / JS / CSS AUDIT LOCK', 'V32 REAL LOADED HTML / JS / CSS WRITEBACK LOCK', 'V40 WAREHOUSE REAL LOADED HTML / JS / CSS WRITEBACK LOCK', 'V42 SHIP + WAREHOUSE REAL LOADED HTML / JS / CSS WRITEBACK LOCK', 'V44 PRODUCT SUBMIT REAL LOADED WRITEBACK', 'V48 products real-loaded HTML/JS/CSS writeback', 'V51 PRODUCTS REAL LOADED', 'V52 PRODUCTS / SHIP / WAREHOUSE REAL LOADED', 'V32 asset-load failure banner', 'yx27-shipping-query-bar', 'yx28-warehouse-unplaced-inline', '#ship-preview-panel', '#yx113-customer-actions', 'home-logout-btn{display:none'],
    'static/pwa.js': [VERSION, '__YX_PWA_VERSION__', 'yx-pwa-cache-cleared-version', 'yx113-customer-action-close'],
    'static/service-worker.js': [VERSION, 'STATIC_CACHE', "cache: 'no-store'", "url.pathname.startsWith('/static/')"],
    'app.py': ['/api/customers/ensure', '/api/customers/move', '/api/reports/export', '/api/report', '/api/undo-last', '/api/undo', 'public, max-age=31536000, immutable', 'range_days', "request.args.get('start_date') or request.args.get('start')"],
    'static/yx_pages/page_home_master_v52.js': ['V52 HOME WRITEBACK', 'old logout binding removed'],
    'static/yx_pages/page_settings_master_v32.js': ['/api/undo-last', '/api/reports/export', 'confirm_password', 'start_date', 'entity_type', 'data-backup-download', 'data-backup-restore', 'restoreBackup', 'd.files', 'data-block-next', 'V26 SETTINGS ENDPOINT LOCK'],
    'static/yx_pages/page_shipping_query_master_v32.js': ['V27 REAL LOADED SHIPPING QUERY LOCK', 'start_date', 'end_date', 'effectiveRange', 'yx27-custom-date'],
    'static/yx_pages/page_inventory_master_v52.js': ['YX113ProductActions', 'bulkDelete', 'rowActionsHTML', 'confirmDuplicateMerge', 'applySnapshotFromResponse', 'window.YX = window.YXHardLock', 'window.__YX_V51_PRODUCTS_FINAL_CAPTURE__', 'YX_V51_REMOVE_INVENTORY_ROW_ACTIONS', 'forceSelectedCustomerProductPanel', 'yx-v51-inventory-no-actions'],
    'static/yx_pages/page_warehouse_master_v52.js': ['data-yx28-close-unplaced', 'clearWarehouseSearchAndReload', 'syncBatchSelectLimits', 'jumpProductToWarehouse'],
    'static/yx_pages/page_orders_master_v52.js': ['YX113ProductActions', 'bulkDelete', 'rowActionsHTML', 'confirmDuplicateMerge', 'refreshCustomerBoardsSafe', 'moveCustomer', 'applySnapshotFromResponse', 'window.YX = window.YXHardLock', 'window.__YX_V51_PRODUCTS_FINAL_CAPTURE__', 'ensureCustomerAndRefresh'],
    'static/yx_pages/page_master_order_master_v52.js': ['YX113ProductActions', 'bulkDelete', 'rowActionsHTML', 'confirmDuplicateMerge', 'refreshCustomerBoardsSafe', 'moveCustomer', 'applySnapshotFromResponse', 'window.YX = window.YXHardLock', 'window.__YX_V51_PRODUCTS_FINAL_CAPTURE__', 'ensureCustomerAndRefresh'],
}
for rel, toks in required.items():
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f'missing {rel}')
    txt = path.read_text(encoding='utf-8', errors='ignore')
    miss = [t for t in toks if t not in txt]
    if miss:
        raise SystemExit(f'{rel} missing {miss}')

base = (ROOT/'templates/base.html').read_text(encoding='utf-8', errors='ignore')
loaded = re.findall(r"yx_pages/([^'\"]+\.js)", base)
if len(loaded) != len(set(loaded)):
    raise SystemExit(f'duplicate loaded page script reference: {loaded}')
for bad in ['page_inventory_master_v23.js','page_orders_master_v23.js','page_master_order_master_v23.js','full-master-v23','full-master-v22','full-master-v21','full-master-v20','full-master-v19','full-master-v18','full-master-v17','full-master-v16','full-master-v15','full-master-v14','full-master-v13','full-master-v12','full-master-v11','full-master-v10','full-master-v9']:
    if bad in base:
        raise SystemExit(f'stale loaded reference in base: {bad}')
for js in (ROOT/'static/yx_pages').glob('*.js'):
    txt = js.read_text(encoding='utf-8', errors='ignore')
    if 'window.__YX_full-master' in txt:
        raise SystemExit(f'invalid window flag remains: {js}')
print('v51 products real loaded html/js/css writeback smoke test OK')

for rel in ['static/yx_pages/page_inventory_master_v52.js','static/yx_pages/page_orders_master_v52.js','static/yx_pages/page_master_order_master_v52.js']:
    txt = (ROOT/rel).read_text(encoding='utf-8', errors='ignore')
    if "YX.toast('送出中" in txt or "YX.toast('客戶已先顯示" in txt:
        raise SystemExit(f'bare YX.toast remains in final submit: {rel}')
