import re
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

for rel in ["app.py", "db.py", "backup.py", "ocr.py"]:
    text = (ROOT / rel).read_text(encoding="utf-8", errors="ignore")
    compile(text, str(ROOT / rel), "exec")
    tree = ast.parse(text)
    defs = [n.name for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    from collections import Counter
    duplicates = sorted([name for name, count in Counter(defs).items() if count > 1])
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
    "static/yx_modules/core_hardlock.js": ["fix135-master-final-hardlock", "YXHardLock", "register"],
    "static/yx_modules/today_changes_hardlock.js": ["FIX118 今日異動硬鎖", "loadTodayChanges112", "yx112-today-label"],
    "static/yx_modules/warehouse_hardlock.js": ["FIX118 倉庫硬鎖", "normalizeSlot"],
    "static/yx_modules/product_actions_hardlock.js": ["FIX135 商品母版最終硬鎖", "loadSource", "renderCards", "編輯全部", "data-yx128-card-save"],
    "static/yx_modules/product_sort_hardlock.js": ["FIX118 商品排序母版硬鎖", "YX118ProductSort", "compareRows"],
    "static/yx_modules/ship_picker_hardlock.js": ["FIX128 出貨客戶商品母版硬鎖", "loadShipCustomerItems", "YX116ShipPicker", "yx128-ship-index"],
    "static/yx_modules/legacy_isolation_hardlock.js": ["FIX118 舊版渲染隔離", "legacy_isolation", "isolateAll"],
    "static/yx_modules/apple_ui_hardlock.js": ["FIX118 蘋果風按鈕介面母版硬鎖", "apple_ui", "yx117AppleUi"],
    "static/yx_modules/ornate_label_hardlock.js": ["FIX127 淺灰外圈等寬標籤母版硬鎖", "ornate_label", "YX124OrnateLabel"],
    "static/yx_modules/ornate_label_hardlock.css": ["FIX127 淺灰外圈", "data-yx124-ornate-label", "yx124-ornate-label"],
    "static/yx_modules/home_background_hardlock.css": ["FIX133 主頁背景", "data-yx133-home-bg", "home_cloud_background"],
    "static/yx_modules/quantity_rule_hardlock.js": ["FIX126 數量規則硬鎖", "YX126Qty", "calcTotalQty"],
    "static/yx_modules/master_integrator.js": ["FIX124 母版整合器", "safeInstall('today_changes'", "legacy_isolation", "ship_picker", "product_source_bridge", "apple_ui", "ornate_label"],
    "static/yx_modules/inline_edit_full_list_hardlock.js": ["FIX128 母版接管器", "inline_edit_full_list", "yx128InlineEdit"],
    "static/yx_modules/product_source_bridge_hardlock.js": ["FIX135 商品來源橋接保險版", "product_source_bridge", "loadSource"],
    "static/style.css": ["yx112-today-locked", "yx112-product-card", "yx85-month-badge"],
    "templates/base.html": ["fix135-master-final-hardlock", "yx_modules/core_hardlock.js", "home_background_hardlock.css", "fix135_master_final_hardlock.css", "quantity_rule_hardlock.js", "ship_picker_hardlock.js", "ship_text_validate_hardlock.js", "inline_edit_full_list_hardlock.js", "product_sort_hardlock.js", "product_source_bridge_hardlock.js", "apple_ui_hardlock.js", "app.js", "ornate_label_hardlock.css", "ornate_label_hardlock.js", "pwa.js"],
    "templates/today_changes.html": ["yx112-refresh-today", "today-filter-bar", "today-summary-cards"],
    "static/service-worker.js": ["fix135-master-final-hardlock", "home_cloud_background.jpg", "yx_modules/core_hardlock.js", "ship_picker_hardlock.js", "ship_text_validate_hardlock.js", "inline_edit_full_list_hardlock.js", "product_sort_hardlock.js", "product_source_bridge_hardlock.js", "fix135_master_final_hardlock.js", "apple_ui_hardlock.js", "ornate_label_hardlock.css", "ornate_label_hardlock.js", "fix135_master_final_hardlock.css", "fix135_master_final_hardlock.js"],
    "static/pwa.js": ["fix135-master-final-hardlock"],
    "static/manifest.webmanifest": ['"url": "/inventory"', '"url": "/warehouse"', '"version": "fix135-master-final-hardlock"'],
}

for rel, tokens in required.items():
    text = (ROOT / rel).read_text(encoding="utf-8", errors="ignore")
    missing = [t for t in tokens if t not in text]
    if missing:
        raise SystemExit(f"{rel} missing {missing}")

js = (ROOT / "static/app.js").read_text(encoding="utf-8", errors="ignore")
html = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in (ROOT / "templates").glob("*.html"))

# Lightweight inline-handler check only: keep this test fast for Render/free plans.
for handler in ["confirmSubmit", "reverseLookup", "clearShipSelectedItems", "searchWarehouse", "renderWarehouse", "saveCustomer", "renderCustomers"]:
    if handler + "(" in html and handler not in js and f"window.{handler}" not in js:
        raise SystemExit(f"Missing inline handler: {handler}")

old_template_controls = re.findall(r"warehouse-plusminus|warehouse-add-slot|warehouse-remove-slot|data-action=\"(?:add|remove)-slot\"", html)
if old_template_controls:
    raise SystemExit(f"Old warehouse +/- controls still in templates: {old_template_controls}")

print("FIX135 smoke test OK")
