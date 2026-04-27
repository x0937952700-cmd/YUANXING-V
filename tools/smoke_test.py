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
    "static/app.js": ["FIX143_CURRENT_UI_PRODUCT_CUSTOMER_STABLE", "FIX144_SHIP_WAREHOUSE_COMPACT_STABLE", 
        "FIX146_HARD_LOCK_FIX143_FIX144_COMBO",
        "window.YX_MASTER",
        "YX.modules",
        "YX.actions",
        "customerCards",
        "productTable",
        "productCards",
        "todayChanges",
        "warehouseGrid",
        "actionSheet",
        "dragRegion",
        "batchOps",
        "searchFilter",
        "homeBadge",
        "YX.guard",
        "DOM write lock",
        "confirmSubmit",
        "saveWarehouseCell",
        "loadCustomerBlocks",
        "lockWindowFunction",
        "yx145-slot",
        "ship-add-selected-item",
        "insertWarehouseCell",
        "deleteWarehouseCell",
        "FIX146_HARD_LOCK_FIX143_FIX144_COMBO",
        "editItem",
        "deleteItem",
        "shipItem",
        "batchAddMaterial",
        "batchDeleteItems",
    ],
    "static/style.css": ["yx88-hidden-legacy", "yx85-month-badge", "FIX139: module boundaries", "FIX140: DOM ownership"],
    "templates/base.html": ["FIX146_HARD_LOCK_FIX143_FIX144_COMBO", "app.js", "pwa.js", "fix146-hard-lock-fix143-fix144-combo"],
    "templates/module.html": ["data-yx-module=\"customerCards\"", "data-yx-module=\"productTable\"", "data-yx-module=\"warehouseGrid\"", "data-yx-module=\"searchFilter\""],
    "templates/index.html": ["data-yx-module=\"homeBadge\""],
    "templates/today_changes.html": ["data-yx-module=\"todayChanges\"", "data-yx-action=\"todayClearUnread\""],
    "static/service-worker.js": ["FIX146_HARD_LOCK_FIX143_FIX144_COMBO", "fix146-hard-lock-fix143-fix144-combo"],
    "static/pwa.js": ["fix146-hard-lock-fix143-fix144-combo"],
    "static/manifest.webmanifest": ['"url": "/inventory"', '"url": "/warehouse"', '"version": "fix146-hard-lock-fix143-fix144-combo"'],
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

print("FIX146 smoke test OK")
