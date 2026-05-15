#!/usr/bin/env python3
"""V504 button/event mainline audit.
Static read-only audit. It does not run the app and does not mutate data.
"""
from pathlib import Path
import sys, re
ROOT = Path(__file__).resolve().parents[1]

def read(rel):
    p = ROOT / rel
    return p.read_text(encoding='utf-8', errors='ignore') if p.exists() else ''

checks = []
def ok(name, cond, detail=''):
    checks.append((name, bool(cond), detail))

idx = read('templates/index.html')
settings = read('templates/settings.html') + read('static/yx_pages/settings_page.js')
diag = read('templates/diagnostics.html') + read('static/yx_pages/diagnostics_page.js')
today = read('templates/today_changes.html') + read('static/yx_pages/today_changes_page.js')
product = read('static/yx_pages/product_page_core.js')
shipping = read('templates/module.html') + read('static/yx_pages/shipping_page.js')
warehouse = read('templates/module.html') + read('static/yx_pages/warehouse_page.js')
base = read('templates/base.html')
core = read('static/yx_core.js')
all_page_js = product + shipping + warehouse + today + settings + diag

def has_all(src, arr): return all(x in src for x in arr)

ok('home has all entry buttons including logout', has_all(idx, ['庫存','訂單','總單','出貨','倉庫圖','今日異動','設定','登出']) and 'home-logout-btn' in idx)
ok('global logout mainline is available outside settings page', 'V504_GLOBAL_LOGOUT_MAINLINE' in core and '/api/logout' in core)
ok('diagnostics returns to settings and has required actions', has_all(diag, ['返回設定','立即檢查','匯出診斷報告','送出本機診斷','清除本機錯誤紀錄']))
ok('settings keeps fixed buttons', has_all(settings, ['修改密碼','儲存','快速還原','還原上一筆','報表匯出','庫存報表','出貨報表','總單報表','未錄入報表','差異紀錄','管理員功能','資料備份','立即備份','同步資料','自動同步','系統診斷','登出']))
ok('today changes manual refresh and labels', has_all(today, ['刷新','全部','新增庫存','新增訂單','新增總單','出貨','未錄入倉庫圖']) and 'manualRefresh' in today)
ok('product batch delete/edit/cancel are present', has_all(product, ['data-yx113-batch-delete','data-yx128-edit-all','data-yx128-cancel-all','批量刪除','批量編輯全部','取消編輯']))
ok('product row actions are present', has_all(product, ['rowActionsHTML','data-yx131-row-action="edit"','data-yx131-row-action="delete"','data-yx-product-location','操作']))
ok('inventory transfer buttons are present', has_all(product, ['data-yx131-row-action="to-orders"','data-yx131-row-action="to-master"','data-yx132-batch-transfer="orders"','data-yx132-batch-transfer="master_order"']))
ok('orders/master direct ship and order-to-master are present', has_all(product, ['data-yx131-row-action="ship"','data-yx131-row-action="to-master"','shipItem']))
ok('shipping preview/confirm routes present', has_all(shipping, ['ship-customer-item-list','ship-selected-items','確認送出','反查商品位置']) and (('/api/ship/preview' in shipping) or ('/api/ship-preview' in shipping)) and '/api/ship' in shipping)
ok('warehouse action sheet and persistence routes present', (('開啟 / 編輯格位' in warehouse) or ('開啟/編輯格位' in warehouse)) and (('批量新增' in warehouse) or ('批量增加格子' in warehouse)) and ('批量刪除' in warehouse) and ('標記' in warehouse and '問題格' in warehouse) and '/api/warehouse/cell' in warehouse and 'batch-add-slots' in warehouse)
ok('base only uses formal page js and no legacy hardlock', has_all(base, ['home_page.js','inventory_page.js','orders_page.js','master_order_page.js','shipping_page.js','warehouse_page.js','today_changes_page.js','settings_page.js','diagnostics_page.js']) and 'fix135' not in base and 'hardlock' not in base.lower())

def strip_comments(src):
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    src = re.sub(r'//.*', '', src)
    return src
code_only = strip_comments(all_page_js)
ok('no page setInterval or MutationObserver', 'setInterval(' not in code_only and 'MutationObserver' not in code_only)
ok('server diagnostics contains button event mainline audit', 'button_event_mainline_audit' in read('app.py') and 'V504_BUTTON_EVENT_MAINLINE_AUDIT' in diag)

failed = [c for c in checks if not c[1]]
for name, good, detail in checks:
    print(('OK  ' if good else 'FAIL') + name + ((' :: ' + detail) if detail else ''))
if failed:
    print(f'button_event_mainline_audit failed: {len(failed)} issue(s)', file=sys.stderr)
    sys.exit(1)
print(f'button_event_mainline_audit OK: {len(checks)} checks')
