import py_compile
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
for rel in ["app.py", "db.py", "backup.py", "ocr.py"]:
    py_compile.compile(str(ROOT / rel), doraise=True)
required = {
    "static/app.js": ["FIX80_MASTER_FINAL_CONVERGENCE", "window.confirmSubmit = confirmSubmit80", "yx80ParseShipItems", "withShipTimeout", "window.__YX_SHIP_QTY_BY_PRODUCT__"],
    "templates/base.html": ["fix80-master-final-convergence", "app.js", "pwa.js"],
    "static/service-worker.js": ["fix80-master-final-convergence"],
    "static/pwa.js": ["fix80-master-final-convergence"],
    "static/manifest.webmanifest": ["fix80-master-final-convergence", '"url": "/inventory"', '"url": "/warehouse"'],
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
print("FIX80 smoke test OK")
