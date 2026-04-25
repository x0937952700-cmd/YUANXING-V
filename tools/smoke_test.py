import py_compile
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

for rel in ["app.py", "db.py", "backup.py", "ocr.py"]:
    py_compile.compile(str(ROOT / rel), doraise=True)

required = {
    "static/app.js": [
        "fix75-card-warehouse-support-return",
        "window.__YX70_FINAL_CONFLICT_CONVERGENCE__",
        "yx70SmokeCheck",
        "ship-add-selected-item",
        "insertWarehouseCell",
        "deleteWarehouseCell",
    ],
    "static/style.css": ["FIX70 final conflict convergence", "yx70-busy", "warehouse-plusminus-btn"],
    "templates/base.html": ["fix75-card-warehouse-support-return", "app.js", "pwa.js"],
    "static/service-worker.js": ["fix75-card-warehouse-support-return"],
    "static/pwa.js": ["fix75-card-warehouse-support-return"],
    "static/manifest.webmanifest": ['"url": "/inventory"', '"url": "/warehouse"'],
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

print("FIX75 smoke test OK")
