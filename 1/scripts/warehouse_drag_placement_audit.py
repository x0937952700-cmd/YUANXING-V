#!/usr/bin/env python3
"""V500 warehouse drag/placement/readback audit. Static deterministic audit; no DB/network."""
from pathlib import Path
import re, sys
root = Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')

app=read('app.py')
js=read('static/yx_pages/warehouse_page.js')
css=read('static/css/warehouse.css')

checks = {
    'version_v506': 'V119-V515-DIAGNOSTIC-100-HOME-LOGOUT-REMOVAL-PACK25' in app and 'v515-diagnostic-100-home-logout-removal-pack25' in app,
    'frontend_cache_v506': "v515-diagnostic-100-home-logout-removal-pack25" in js,
    'placement_helper': 'function warehousePlacementLabel' in js,
    'placement_grouping': 'placement is part of the visual grouping' in js and 'placement_label:placement' in js,
    'placement_display_css': '.yx-slot-product-line .yx-slot-placement' in css,
    'drag_existing_to_back': "row.placement_label='後排'" in js and "normalizedItem(it,itemQty(it),placement)" in js,
    'drag_readback_guard': 'moveReadbackContainsTarget' in js and 'move-target-stale-readback' in js,
    'backend_move_snapshot': 'target_cell_snapshot' in app and 'move_item_total' in app and 'moved_items' in app,
    'drag_longpress_cancel': 'const MOVE_CANCEL=32;' in js and 'state.warehouseDragSuppressLongpressUntil' in js,
    'no_interval_observer': 'setInterval(' not in js and 'new MutationObserver' not in js,
}
for name, ok in checks.items():
    if not ok:
        fail.append(name)

if fail:
    print('WAREHOUSE DRAG PLACEMENT AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('WAREHOUSE DRAG PLACEMENT AUDIT OK')
sys.exit(0)
