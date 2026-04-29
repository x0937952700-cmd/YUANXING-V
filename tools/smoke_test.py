import ast
import py_compile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory() as td:
    for rel in ["app.py", "db.py", "backup.py", "ocr.py"]:
        src = ROOT / rel
        py_compile.compile(str(src), cfile=str(Path(td) / (rel + ".pyc")), doraise=True)
        ast.parse(src.read_text(encoding="utf-8", errors="ignore"))

required = {
    "static/app.js": [
        "window.YX_MASTER", "confirmSubmit", "saveWarehouseCell", "loadCustomerBlocks",
        "ship-add-selected-item", "insertWarehouseCell", "deleteWarehouseCell",
    ],
    "static/yx_modules/fix146_speed_ship_product_home.js": [
        "fix146-speed-ship-product-home-hardlock", "shipSubmit", "loadCustomerItemsFast",
    ],
    "static/yx_modules/fix147_safe_converge_speed.js": [
        "fix147-safe-converge-speed", "installShipBridge", "singleFlight", "loadShipCustomerItems83",
    ],
    "static/yx_modules/fix148_final_safe_speed.js": [
        "fix148-safe-page-converge", "installSettingsLite", "installClickDedupe", "installFetchTimeout", "YX148HealthCheck",
    ],
    "static/yx_modules/fix148_final_safe_speed.css": ["content-visibility", "yx148-home-badge"],
    "static/yx_modules/fix149_safe_guard.js": ["fix149-safe-guard", "installFetchGuard", "installPageInitGate", "YX149HealthCheck"],
    "static/yx_modules/fix149_safe_guard.css": ["yx149-error-card"],
    "static/yx_modules/fix150_label_text_visible.js": ["fix151-nav-background-unstick", "YX150LabelTextVisible", "SAFE_NOOP"],
    "static/yx_modules/fix151_home_nav_background_guard.js": ["fix151-nav-background-unstick", "removeMasks", "YX151HomeNavBackgroundGuard"],
    "static/yx_modules/fix151_home_nav_background_guard.css": ["FIX151", "yx151-home-bg", "yx151-fast-nav-mask"],
    "static/yx_modules/fix150_label_text_visible.css": ["FIX150", "yx150-label-text", "z-index:20"],
    "static/yx_modules/core_hardlock.js": ["YXHardLock", "register", "cancelLegacyTimers"],
    "static/yx_modules/master_integrator.js": ["FIX124 母版整合器", "legacy_isolation", "ship_picker", "product_source_bridge"],
    "static/yx_modules/settings_audit_hardlock.js": ["loadAuditTrails", "loadAdminUsers"],
    "static/yx_modules/today_changes_hardlock.js": ["fastDeleteToday112", "loadTodayChanges112"],
    "static/yx_modules/ship_picker_hardlock.js": ["loadShipCustomerItems", "YX116ShipPicker"],
    "static/yx_modules/product_actions_hardlock.js": ["loadSource", "renderCards", "data-yx128-card-save"],
    "templates/base.html": [
        "fix151-nav-background-unstick", "FIX151_NAV_BACKGROUND_UNSTICK", "fix148_final_safe_speed.js", "fix149_safe_guard.js", "fix149_safe_guard.css", "fix150_label_text_visible.js", "fix150_label_text_visible.css", "fix151_home_nav_background_guard.js", "fix151_home_nav_background_guard.css",
        "ep == 'settings_page'", "ep == 'today_changes_page'", "ep not in ['home','login_page']",
    ],
    "templates/module.html": [
        "submit-btn", "ship-customer-item-select", "selected-customer-items", "zone-A-grid", "zone-B-grid",
    ],
    "static/service-worker.js": [
        "fix151-nav-background-unstick", "fix149_safe_guard.js", "fix148_final_safe_speed.js", "fix150_label_text_visible.js", "fix151_home_nav_background_guard.js", "fix151_home_nav_background_guard.css", "PRECACHE_ASSETS",
    ],
    "static/pwa.js": ["fix151-nav-background-unstick"],
    "static/manifest.webmanifest": ['"url": "/inventory"', '"url": "/warehouse"', '"version": "fix151-nav-background-unstick"'],
    "db.py": ["idx_logs_created_at", "idx_audit_trails_created_at", "SELECT * FROM audit_trails ORDER BY id DESC LIMIT ?"],
    "app.py": ["deleted_id=log_id", "刪除單筆今日異動只回傳結果"],
    ".python-version": ["3.11.11"],
    "runtime.txt": ["python-3.11.11"],
    "render.yaml": ["PYTHON_VERSION", "3.11.11", "gunicorn app:app --config gunicorn.conf.py"],
}

for rel, tokens in required.items():
    text = (ROOT / rel).read_text(encoding="utf-8", errors="ignore")
    missing = [t for t in tokens if t not in text]
    if missing:
        raise SystemExit(f"{rel} missing {missing}")

html = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in (ROOT / "templates").glob("*.html"))
js = "\n".join([
    (ROOT / "static/app.js").read_text(encoding="utf-8", errors="ignore"),
    (ROOT / "static/yx_modules/fix147_safe_converge_speed.js").read_text(encoding="utf-8", errors="ignore"),
    (ROOT / "static/yx_modules/fix148_final_safe_speed.js").read_text(encoding="utf-8", errors="ignore"),
])
for handler in ["confirmSubmit", "reverseLookup", "clearShipSelectedItems", "searchWarehouse", "renderWarehouse", "saveCustomer", "renderCustomers", "changePassword", "createBackup", "logout"]:
    if handler + "(" in html and handler not in js and f"window.{handler}" not in js:
        raise SystemExit(f"Missing inline handler: {handler}")

base = (ROOT / "templates/base.html").read_text(encoding="utf-8", errors="ignore")
settings_block = base.split("{% if ep == 'settings_page' %}", 1)[1].split("{% elif ep == 'today_changes_page' %}", 1)[0]
if "app.js" in settings_block or "warehouse_hardlock.js" in settings_block or "ship_picker_hardlock.js" in settings_block:
    raise SystemExit("Settings lightweight block loads heavy module scripts")
home_block = base.split("{% elif ep not in ['home','login_page'] %}", 1)[0]
if "app.js" in home_block:
    raise SystemExit("Home/today/settings lightweight area should not load app.js")

print("FIX151 smoke test OK")
