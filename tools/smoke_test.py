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
    "static/yx_modules/core_hardlock.js": ["fix114-master-hardlock", "YXHardLock", "register"],
    "static/yx_modules/today_changes_hardlock.js": ["FIX114 今日異動硬鎖", "loadTodayChanges112", "yx112-today-label"],
    "static/yx_modules/warehouse_hardlock.js": ["FIX114 倉庫硬鎖", "normalizeSlot"],
    "static/yx_modules/product_actions_hardlock.js": ["FIX114 商品母版硬鎖", "yx112-product-card"],
    "static/yx_modules/master_integrator.js": ["FIX114 母版整合器", "install('today_changes'"],
    "static/style.css": ["yx112-today-locked", "yx112-product-card", "yx85-month-badge"],
    "templates/base.html": ["fix114-master-hardlock", "yx_modules/core_hardlock.js", "app.js", "pwa.js"],
    "templates/today_changes.html": ["yx112-refresh-today", "today-filter-bar", "today-summary-cards"],
    "static/service-worker.js": ["fix114-master-hardlock", "yx_modules/core_hardlock.js"],
    "static/pwa.js": ["fix114-master-hardlock"],
    "static/manifest.webmanifest": ['"url": "/inventory"', '"url": "/warehouse"', '"version": "fix114-master-hardlock"'],
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

print("FIX114 smoke test OK")
