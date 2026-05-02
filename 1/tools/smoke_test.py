import ast
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]

# Python syntax and duplicate-def check
for rel in ["app.py", "db.py", "backup.py", "ocr.py"]:
    path = ROOT / rel
    text = path.read_text(encoding="utf-8", errors="ignore")
    compile(text, str(path), "exec")
    tree = ast.parse(text)
    defs = [n.name for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    dup = sorted([name for name, count in Counter(defs).items() if count > 1])
    if dup:
        raise SystemExit(f"{rel} duplicate Python functions: {dup}")

required = {
    "static/yx_modules/core_hardlock.js": ["YXHardLock", "register"],
    "static/yx_modules/quantity_rule_hardlock.js": ["YX126Qty", "calcTotalQty"],
    "static/yx_modules/product_sort_hardlock.js": ["YX118ProductSort", "compareRows"],
    "static/yx_pages/page_products_master.js": ["v25-one-table-master", "YX113ProductActions", "bulkMaterial", "bulkDelete", "batchMoveZone", "saveAllEdits", "confirmSubmit"],
    "static/yx_pages/page_customers_master.js": ["saveCustomer", "fillCustomerForm", "openArchivedCustomersModal"],
    "static/yx_pages/page_bootstrap_master.js": ["v25-one-table-master", "safeInstall", "customer_regions", "today_changes"],
    "static/yx_pages/page_todos_master.js": ["v25-one-table-master", "openTodoAlbumPicker", "openTodoCameraPicker", "saveTodoItem", "clearTodoForm", "/api/todos"],
    "static/yx_modules/customer_regions_hardlock.js": ["customer_regions", "loadCustomerBlocks", "yx:customer-selected"],
    "static/yx_modules/warehouse_hardlock.js": ["warehouse", "renderWarehouse", "saveWarehouseCell"],
    "static/yx_modules/ship_single_lock.js": ["YX_SHIP_SINGLE", "state.selected", "loadItems"],
    "static/yx_modules/today_changes_hardlock.js": ["today_changes", "loadTodayChanges"],
    "static/yx_modules/settings_manual.js": ["loadAuditTrails", "backup"],
    "templates/base.html": ["v25-one-table-master", "yx_pages/page_products_master.js", "yx_pages/page_bootstrap_master.js", "yx_pages/page_todos_master.js", "warehouse_hardlock.js", "ship_single_lock.js"],
    "templates/module.html": ["data-html-direct-shell", "yx113-inventory-toolbar", "yx113-orders-toolbar", "yx113-master_order-toolbar", "warehouse-unplaced-pill", "yx-ship-single-html"],
    "static/service-worker.js": ["v25-one-table-master", "no-store"],
    "static/pwa.js": ["v25-one-table-master"],
    "app.py": ["/api/customer-items/batch-material", "/api/customer-items/batch-zone", "/api/customer-items/batch-delete", "/api/customer-items/batch-update", "/api/items/batch-transfer"],
    ".python-version": ["3.11.11"],
    "runtime.txt": ["python-3.11.11"],
}

for rel, tokens in required.items():
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"missing required file: {rel}")
    text = path.read_text(encoding="utf-8", errors="ignore")
    miss = [t for t in tokens if t not in text]
    if miss:
        raise SystemExit(f"{rel} missing {miss}")

base = (ROOT / "templates/base.html").read_text(encoding="utf-8", errors="ignore")
sw = (ROOT / "static/service-worker.js").read_text(encoding="utf-8", errors="ignore")
# v9~v16 patch JS and old product renderers must not be loaded or present.
for legacy in [
    "button_repair_v9.js",
    "v12_html_submit_guard.js",
    "v13_final_submit_and_render.js",
    "v15_single_api_batch_guard.js",
    "v16_submit_true_render_lock.js",
    "product_actions_hardlock.js",
    "product_submit_manual.js",
    "html_direct_master_lock.js",
]:
    if legacy in base or legacy in sw:
        raise SystemExit(f"legacy/patch still referenced: {legacy}")
    if (ROOT / "static/yx_modules" / legacy).exists():
        raise SystemExit(f"legacy/patch still exists in yx_modules: {legacy}")

# Inline handlers in templates must have a loaded owner script.
html = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in (ROOT / "templates").glob("*.html"))
owners = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in list((ROOT / "static/yx_modules").glob("*.js")) + list((ROOT / "static/yx_pages").glob("*.js")) + list((ROOT / "templates").glob("*.html")))
for handler in ["confirmSubmit", "reverseLookup", "clearShipSelectedItems", "searchWarehouse", "renderWarehouse", "saveCustomer", "renderCustomers"]:
    if handler + "(" in html and (handler not in owners and f"window.{handler}" not in owners):
        raise SystemExit(f"Missing inline handler owner: {handler}")

print("v23 one render master smoke test OK")
