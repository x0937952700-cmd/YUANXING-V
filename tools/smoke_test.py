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
        "FIX98_TRUE_MASTER_UPGRADE",
        "window.YX_MASTER",
        "confirmSubmit",
        "saveWarehouseCell",
        "loadCustomerBlocks",
        "ship-add-selected-item",
        "insertWarehouseCell",
        "deleteWarehouseCell",
    ],
    "static/style.css": ["yx95-final-master", "yx85-month-badge", "yx98-global-search"],
    "templates/base.html": ["FIX98_TRUE_MASTER_UPGRADE", "app.js", "pwa.js", "fix98-true-master-upgrade"],
    "static/service-worker.js": ["FIX98_TRUE_MASTER_UPGRADE", "fix98-true-master-upgrade"],
    "static/pwa.js": ["fix98-true-master-upgrade"],
    "static/manifest.webmanifest": ['"url": "/inventory"', '"url": "/warehouse"', '"version": "fix98-true-master-upgrade"'],
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

print("FIX98 smoke test OK")
