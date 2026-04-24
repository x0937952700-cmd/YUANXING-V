import py_compile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for rel in ["app.py", "db.py", "backup.py", "ocr.py"]:
    py_compile.compile(str(ROOT / rel), doraise=True)

required = {
    "static/app.js": ["fix60-stability-lock", "yx60RefreshSource", "window.confirmSubmit"],
    "templates/base.html": ["fix60-stability-lock", "app.js", "pwa.js"],
    "static/service-worker.js": ["fix60-stability-lock"],
}
for rel, tokens in required.items():
    text = (ROOT / rel).read_text(encoding="utf-8", errors="ignore")
    missing = [t for t in tokens if t not in text]
    if missing:
        raise SystemExit(f"{rel} missing {missing}")
print("FIX60 smoke test OK")
