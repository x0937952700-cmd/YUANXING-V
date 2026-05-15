#!/usr/bin/env python3
"""Audit V496 Today Changes / diagnostics consistency. No external deps."""
from pathlib import Path
import ast, sys
root = Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}')
        return ''
    return p.read_text(encoding='utf-8', errors='ignore')

app=read('app.py')
today=read('static/yx_pages/today_changes_page.js')
home=read('static/yx_pages/home_page.js')
css=read('static/css/base.css')
try: ast.parse(app)
except SyntaxError as e: fail.append(f'app.py syntax error: {e}')
for token in ['V119-V518-RESTORE-SATISFIED-SHIP-PREVIEW-DIAG-PACK28','119-v518_restore_satisfied_ship_preview_diag_pack28','v518-restore-satisfied-ship-preview-diag-pack28']:
    if token not in app:
        fail.append(f'app.py missing version token {token}')
for token in ['_today_changes_table_detail','today_changes_table_total','today_changes_table_unread','UPDATE today_changes SET unread=0','DELETE FROM today_changes WHERE id']:
    if token not in app:
        fail.append(f'app.py missing today DB proof token {token}')
for token in ['today_changes_light_v496','markTodayRead','YXClearTodayLightCaches','flagTodayStale','yx:today-changes-read','手動刷新才重抓']:
    if token not in today:
        fail.append(f'today_changes_page.js missing V496 token {token}')
if 'requestIdleCallback' in today:
    fail.append('today_changes_page.js still schedules idle background reload')
if 'loadTodayChanges112({force:false, silent:true});\n      };' in today:
    fail.append('today event refresh still auto reloads instead of marking stale')
if 'setInterval(' in today or 'MutationObserver' in today:
    fail.append('today_changes_page.js must not add setInterval/MutationObserver')
if 'yx:today-changes-read' not in home:
    fail.append('home badge does not listen to today read event')
for token in ['body[data-module="today_changes"] #today-summary-cards','today-columns-vertical','yx112-today-row']:
    if token not in css:
        fail.append(f'base.css missing today vertical guard {token}')
pre=read('scripts/predeploy_audit.py')
if 'scripts/today_diagnostics_audit.py' not in pre:
    fail.append('predeploy audit does not run today_diagnostics_audit.py')
if fail:
    print('TODAY DIAGNOSTICS AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('TODAY DIAGNOSTICS AUDIT OK')
