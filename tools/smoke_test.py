import re
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

for rel in ["app.py", "db.py", "backup.py", "ocr.py"]:
    text = (ROOT / rel).read_text(encoding="utf-8", errors="ignore")
    compile(text, str(ROOT / rel), "exec")
    tree = ast.parse(text)
    defs = [n.name for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    duplicates = sorted({name for name in defs if defs.count(name) > 1})
    if duplicates:
        raise SystemExit(f"{rel} duplicate Python functions: {duplicates}")

required = {
    "static/app.js": [
        "window.YX_MASTER",
        "confirmSubmit",
        "saveWarehouseCell",
        "loadCustomerBlocks",
        "ship-add-selected-item",
        "insertWarehouseCell",
        "deleteWarehouseCell",
    ],
    "static/yx_modules/core_hardlock.js": ["fix122-luxury-label-button-row-hardlock", "YXHardLock", "register"],
    "static/yx_modules/today_changes_hardlock.js": ["FIX121 今日異動硬鎖", "loadTodayChanges112", "yx112-today-label"],
    "static/yx_modules/warehouse_hardlock.js": ["FIX121 倉庫硬鎖", "normalizeSlot"],
    "static/yx_modules/product_actions_hardlock.js": ["FIX121 商品母版硬鎖", "yx112-product-card"],
    "static/yx_modules/product_sort_hardlock.js": ["FIX121 商品排序母版硬鎖", "YX118ProductSort", "compareRows"],
    "static/yx_modules/ship_picker_hardlock.js": ["FIX121 出貨客戶商品下拉母版硬鎖", "loadShipCustomerItems", "YX116ShipPicker"],
    "static/yx_modules/legacy_isolation_hardlock.js": ["FIX121 舊版渲染隔離", "legacy_isolation", "isolateAll"],
    "static/yx_modules/apple_ui_hardlock.js": ["FIX121 蘋果風按鈕介面母版硬鎖", "apple_ui", "yx117AppleUi"],
    "static/yx_modules/luxury_label_ui_hardlock.js": ["FIX121 華麗標籤介面母版硬鎖", "luxury_label_ui", "yx121LuxuryUi"],
    "static/yx_modules/luxury_label_ui_v122_hardlock.js": ["FIX122 華麗圓框標籤母版硬鎖", "luxury_label_ui_v122", "yx122LabelUi"],
    "static/yx_modules/customer_data_guard_hardlock.js": ["FIX121 客戶資料安全母版", "customer_data_guard", "yx121CustomerGuard"],
    "static/yx_modules/master_integrator.js": ["FIX122 母版整合器", "install(\'today_changes\'", "legacy_isolation", "ship_picker", "luxury_label_ui", "luxury_label_ui_v122", "customer_data_guard"],
    "static/style.css": ["yx112-today-locked", "yx112-product-card", "yx85-month-badge"],
    "templates/base.html": ["fix122-luxury-label-button-row-hardlock", "yx_modules/core_hardlock.js", "ship_picker_hardlock.js", "product_sort_hardlock.js", "luxury_label_ui_hardlock.js", "luxury_label_ui_v122_hardlock.js", "customer_data_guard_hardlock.js", "app.js", "pwa.js"],
    "templates/today_changes.html": ["yx112-refresh-today", "today-filter-bar", "today-summary-cards"],
    "static/service-worker.js": ["fix122-luxury-label-button-row-hardlock", "yx_modules/core_hardlock.js", "ship_picker_hardlock.js", "product_sort_hardlock.js", "luxury_label_ui_hardlock.js", "luxury_label_ui_v122_hardlock.js", "customer_data_guard_hardlock.js"],
    "static/pwa.js": ["fix122-luxury-label-button-row-hardlock"],
    "static/manifest.webmanifest": ['"url": "/inventory"', '"url": "/warehouse"', '"version": "fix122-luxury-label-button-row-hardlock"'],
}

for rel, tokens in required.items():
    text = (ROOT / rel).read_text(encoding="utf-8", errors="ignore")
    missing = [t for t in tokens if t not in text]
    if missing:
        raise SystemExit(f"{rel} missing {missing}")

js = (ROOT / "static/app.js").read_text(encoding="utf-8", errors="ignore")
html = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in (ROOT / "templates").glob("*.html"))

names = set(re.findall(r"function\s+([A-Za-z_$][\w$]*)\s*\(", js))
names.update(re.findall(r"window\.([A-Za-z_$][\w$]*)\s*=\s*(?:window\.[A-Za-z_$][\w$]*\s*\|\|\s*)?(?:async\s*)?function\b", js))
names.update(re.findall(r"window\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>", js))
names.update(re.findall(r"window\.([A-Za-z_$][\w$]*)\s*=", html))
names.update(["confirmSubmit", "saveWarehouseCell", "loadCustomerBlocks", "renderCustomers", "loadTodayChanges"])
called = set()
for attr in ["onclick", "onsubmit"]:
    for raw in re.findall(attr + r'="([^"]+)"', html):
        called.update(re.findall(r"(?:window\.)?\b([A-Za-z_$][\w$]*)\s*\(", raw))
exclude = {"return", "confirm", "alert", "setTimeout", "console", "Math", "Number", "String"}
missing_handlers = sorted(x for x in called if x not in names and x not in exclude)
if missing_handlers:
    raise SystemExit(f"Missing inline handlers: {missing_handlers}")

old_template_controls = re.findall(r"warehouse-plusminus|warehouse-add-slot|warehouse-remove-slot|data-action=\"(?:add|remove)-slot\"", html)
if old_template_controls:
    raise SystemExit(f"Old warehouse +/- controls still in templates: {old_template_controls}")

print("FIX122 smoke test OK")
