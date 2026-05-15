#!/usr/bin/env python3
"""V501 audit: warehouse structure slot insert/delete/batch delete/readback safety.
No OCR/photo checks. No renderer/timer/MutationObserver additions.
"""
from pathlib import Path
import re, sys
ROOT = Path(__file__).resolve().parents[1]
warehouse_js = (ROOT/'static/yx_pages/warehouse_page.js').read_text(encoding='utf-8')
db_src = (ROOT/'db.py').read_text(encoding='utf-8')
app_src = (ROOT/'app.py').read_text(encoding='utf-8')
checks = []
def add(name, ok, msg): checks.append((name, bool(ok), msg))
add('no_ocr_photo_scope', 'upload_ocr' not in warehouse_js and 'camera' not in warehouse_js.lower(), 'This pack must not add OCR/photo code to warehouse page')
add('structure_readback_item_bag_guard', 'canTrustStructureColumnReadback' in warehouse_js and 'sameWarehouseColumnItemBag' in warehouse_js, 'DB readback must be verified by item bag before exact overwrite')
add('trusted_structure_exact_column_apply', 'trustStructure === true' in warehouse_js and 'structure-'+"'" in warehouse_js, 'Trusted structure readback must apply exact column slot list')
add('base_slot_deletion_meta_respected', '_yx_v501_explicit_warehouse_visible_count' in db_src and 'manual base-slot deletion' in db_src, 'DB reader must respect warehouse_column_meta.visible_count')
add('never_hide_product_slot', 'max_item_slot' in db_src and 'visible_count' in db_src, 'Visible count must never hide slots that still contain products')
add('version_bumped', 'v518-restore-satisfied-ship-preview-diag-pack28' in app_src and 'v518-restore-satisfied-ship-preview-diag-pack28' in warehouse_js, 'Static/API versions must be bumped')
add('diagnostics_has_check', 'V501 格號重排讀回安全檢查' in app_src or '倉庫插入刪除格號重排讀回安全' in app_src, 'Diagnostics should include the new guard')
failed=[c for c in checks if not c[1]]
for name, ok, msg in checks:
    print(('OK ' if ok else 'FAIL ') + name + ' - ' + msg)
if failed:
    sys.exit(1)
print('warehouse_structure_slots_audit OK')
