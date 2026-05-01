import ast
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]

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
    "static/app.js": ["window.YX_MASTER", "confirmSubmit", "saveWarehouseCell", "loadCustomerBlocks", "insertWarehouseCell", "deleteWarehouseCell"],
    "static/yx_modules/core_hardlock.js": ["YXHardLock", "register"],
    "static/yx_modules/html_direct_master_lock.js": ["YX_HTML_DIRECT_MASTER", "__YX_HTML_DIRECT_MASTER_LOCK__", "protectStaticShell", "safeInstall"],
    "static/yx_modules/product_actions_hardlock.js": ["loadSource", "renderSummary", "beginBatchEdit", "saveAllEdits", "qtyFromText"],
    "static/yx_modules/product_sort_hardlock.js": ["YX118ProductSort", "compareRows"],
    "static/yx_modules/product_source_bridge_hardlock.js": ["product_source_bridge", "loadSource"],
    "static/yx_modules/customer_regions_hardlock.js": ["customer_regions", "loadCustomerBlocks"],
    "static/yx_modules/warehouse_hardlock.js": ["normalizeSlot", "warehouse"],
    "static/yx_modules/today_changes_hardlock.js": ["today_changes", "loadTodayChanges"],
    "static/yx_modules/settings_audit_hardlock.js": ["settings_audit"],
    "static/yx_modules/ship_single_lock.js": ["YX_SHIP_SINGLE", "state.selected", "loadItems"],
    "static/yx_modules/ship_text_validate_hardlock.js": ["ship_text_validate"],
    "static/yx_modules/quantity_rule_hardlock.js": ["YX126Qty", "calcTotalQty"],
    "static/yx_modules/ornate_label_hardlock.js": ["YX124OrnateLabel"],
    "static/style.css": ["HTML_DIRECT_MASTER_V1", "yx-html-direct-toolbar", "yx-html-direct-summary"],
    "templates/base.html": ["html-direct-master-v1", "html_direct_master_lock.js", "__YX_DISABLE_LEGACY_LAYOUT_RENDER__", "yx_modules/product_actions_hardlock.js", "yx_modules/warehouse_hardlock.js"],
    "templates/module.html": ["data-html-direct-shell", "yx113-inventory-toolbar", "yx113-orders-toolbar", "yx113-master_order-toolbar", "warehouse-unplaced-pill", "yx-ship-single-html"],
    "static/service-worker.js": ["html-direct-master-v1", "html_direct_master_lock.js", "ship_single_lock.js"],
    "static/pwa.js": ["html-direct-master-v1"],
    "static/manifest.webmanifest": ['"url": "/inventory"', '"url": "/warehouse"', '"version": "html-direct-master-v1"'],
    ".python-version": ["3.11.11"],
    "runtime.txt": ["python-3.11.11"],
    "render.yaml": ["PYTHON_VERSION", "3.11.11", "gunicorn app:app --config gunicorn.conf.py", "pip install --upgrade pip && pip install -r requirements.txt"],
}

for rel, tokens in required.items():
    path = ROOT / rel
    text = path.read_text(encoding="utf-8", errors="ignore")
    miss = [t for t in tokens if t not in text]
    if miss:
        raise SystemExit(f"{rel} missing {miss}")

base = (ROOT / "templates/base.html").read_text(encoding="utf-8", errors="ignore")
sw = (ROOT / "static/service-worker.js").read_text(encoding="utf-8", errors="ignore")
for legacy in [
    "master_integrator.js",
    "fix135_master_final_hardlock.js",
    "fix136_label_text_repair.js",
    "fix137_undo_layout_warehouse_hardlock.js",
    "fix138_final_master_hardlock.js",
    "fix140_readme_master_hardlock.js",
    "fix142_speed_ship_hardlock.js",
    "ship_picker_hardlock.js",
    "inline_edit_full_list_hardlock.js",
    "legacy_isolation_hardlock.js",
    "apple_ui_hardlock.js",
]:
    if legacy in base or legacy in sw:
        raise SystemExit(f"legacy renderer still referenced: {legacy}")
    if (ROOT / "static/yx_modules" / legacy).exists():
        raise SystemExit(f"legacy renderer still active in yx_modules: {legacy}")

html = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in (ROOT / "templates").glob("*.html"))
js = (ROOT / "static/app.js").read_text(encoding="utf-8", errors="ignore")
for handler in ["confirmSubmit", "reverseLookup", "clearShipSelectedItems", "searchWarehouse", "renderWarehouse", "saveCustomer", "renderCustomers"]:
    if handler + "(" in html and handler not in js and f"window.{handler}" not in js:
        raise SystemExit(f"Missing inline handler: {handler}")

if "warehouse-plusminus" in html or "data-action=\"add-slot\"" in html:
    raise SystemExit("Old warehouse +/- controls still in templates")

print("HTML direct master smoke test OK")
