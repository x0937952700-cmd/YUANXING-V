#!/usr/bin/env python3
"""V500 warehouse layout + unplaced dropdown audit. No OCR/photo path is exercised."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}')
        return ''
    return p.read_text(encoding='utf-8', errors='ignore')

app=read('app.py')
wh=read('static/yx_pages/warehouse_page.js')
css=read('static/css/warehouse.css')
mobile=read('static/css/mobile.css')
base=read('static/css/base.css')

for token in ['V119-V518-RESTORE-SATISFIED-SHIP-PREVIEW-DIAG-PACK28','119-v518_restore_satisfied_ship_preview_diag_pack28','v518-restore-satisfied-ship-preview-diag-pack28']:
    if token not in app + wh:
        fail.append(f'missing version token {token}')

for token in ['warehouseSlotDisplayGroups','warehouseSlotQtySplit','slotProductLinesHTML','yx-v500-slot-head']:
    if token not in wh:
        fail.append(f'warehouse_page.js missing {token}')

# First row must be 格號 / 件數拆分 / 總件數, not 客戶名 in header.
if 'grid-template-columns:26px minmax(0,1fr) auto' not in css + mobile:
    fail.append('slot header does not use fixed 3-part grid')
if '.yx108-slot-customers{display:none!important;}' not in css.replace(' ',''):
    fail.append('legacy customer header is not hidden by final warehouse CSS')

# Product lines must be complete, not clipped/scrolled inside the cell.
for token in ['max-height:none!important','overflow:visible!important','white-space:normal!important','word-break:break-word!important']:
    if token not in css.replace(' ','') + mobile.replace(' ',''):
        fail.append(f'final warehouse product-line CSS missing {token}')

# Color semantics: customer red, material green, total blue.
for token in ['.yx-slot-customer','color:#dc2626', '.yx-slot-material','color:#16a34a', '.yx108-slot-total','color:#2563eb']:
    if token not in css.replace(' ',''):
        fail.append(f'warehouse color semantic missing {token}')

# Opening/searching cell should not recompute unplaced every time; manual long press force refresh is retained.
for token in ['availableLoadedAt','Date.now()-loadedAt>300000','await loadAvailable(true)','開格子與搜尋不重算未入倉']:
    if token not in wh:
        fail.append(f'unplaced dropdown cache/manual refresh guard missing {token}')

# Ensure no forbidden background timers/observers were introduced.
if 'new MutationObserver' in wh:
    fail.append('warehouse_page.js creates MutationObserver')
if 'setInterval(' in wh:
    fail.append('warehouse_page.js creates setInterval')

if fail:
    print('WAREHOUSE LAYOUT UNPLACED AUDIT FAILED')
    for x in fail:
        print('-', x)
    sys.exit(1)
print('WAREHOUSE LAYOUT UNPLACED AUDIT OK')
