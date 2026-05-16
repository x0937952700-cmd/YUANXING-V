#!/usr/bin/env python3
from pathlib import Path
import re, sys, json
root=Path(__file__).resolve().parents[1]
fail=[]
def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')
def strip_comments(s):
    s=re.sub(r'/\*.*?\*/','',s,flags=re.S)
    s=re.sub(r'(?m)//.*$','',s)
    return s
app=read('app.py'); db=read('db.py'); base=read('templates/base.html'); index=read('templates/index.html'); settings=read('templates/settings.html')
product=read('static/yx_pages/product_page_core.js'); ship=read('static/yx_pages/shipping_page.js'); wh=read('static/yx_pages/warehouse_page.js'); today=read('static/yx_pages/today_changes_page.js'); customers=read('static/yx_pages/customers_page.js'); device=read('static/yx_device_sync.js'); store=read('static/yx_data_store.js'); sw=read('static/service-worker.js'); manifest=read('static/manifest.webmanifest')
code_only=strip_comments('\n'.join([product,ship,wh,today,customers,device,store,read('static/yx_pages/settings_page.js'),read('static/yx_pages/diagnostics_page.js')]))
def ok(cond,msg):
    if not cond: fail.append(msg)
# Versions
for tok in ['V119-V520-FINAL-SHIP-CACHE-ALIGN-PACK30','119-v520_final_ship_cache_align_pack30','v520-final-ship-cache-align-pack30']:
    ok(tok in app or tok in manifest or tok in sw, f'missing version token {tok}')
# Hard rules
ok('登出' not in index and 'logout' not in index.lower(), 'home page still contains logout')
ok('登出' in settings and 'logout' in settings, 'settings page logout missing')
ok('yx_v452_max_repair' not in base and 'fix135' not in base and 'hardlock' not in base.lower(), 'base loads old overlay/hardlock')
ok('setInterval(' not in code_only, 'page JS creates setInterval')
ok('new MutationObserver' not in code_only, 'page JS creates MutationObserver')
ok("url.pathname.startsWith('/api/')" in sw or 'url.pathname.startsWith("/api/")' in sw, 'service worker does not bypass API')
# Main file/direct implementation evidence
for rel in ['app.py','db.py','requirements.txt','wsgi.py','render.yaml','Procfile','migrations/000_yuanxing_all_in_one.sql']:
    ok((root/rel).exists(), f'missing main/deploy file {rel}')
# Product pages
for token in ['批量刪除','批量編輯全部','儲存批量編輯','套用材質','加到訂單','加到總單','移到A區','移到B區']:
    ok(token in product or token.replace('A',' A ') in product, f'product button/label missing {token}')
for mat in ['TD','MER','DF','SP','SPF','HF','RDT','LVL']:
    ok(mat in product, f'material missing {mat}')
ok('/api/inventory' in app and '/api/orders' in app and '/api/master_orders' in app, 'inventory/orders/master api routes missing')
# Customer cards and sync
for token in ['source=','customerSourceForModule','isSelfCustomerCardButton']:
    ok(token in customers, f'customer sync marker missing {token}')
# Shipping
for token in ['/api/ship/preview','/api/ship','shipping_records','today_changes','volume_formula','before_qty','after_qty']:
    ok(token in app+ship, f'shipping marker missing {token}')
# Warehouse
for token in ['warehouse_cells','visible_count','COALESCE(NULLIF(slot_type', 'batch-add-slots','canTrustStructureColumnReadback','placement_label','available-items']:
    ok(token in app+db+wh, f'warehouse marker missing {token}')
ok(not re.search(r'(?i)DELETE\s+FROM\s+warehouse_cells\s*(;|$)', app+db), 'dangerous delete all warehouse_cells found')
# Today changes
for token in ['today_changes','manualRefresh','flagTodayStale']:
    ok(token in app+today, f'today changes marker missing {token}')
# Parser rules
for token in ['supportTotalPieces','stripSupportNotes','132×11*12=123*4','504x5+588']:
    ok(token in app+ship+product+read('scripts/text_parser_volume_audit.py'), f'parser rule marker missing {token}')
# DB columns/index hints
for col in ['customer_name','customer_uid','product_text','product_code','material','month_tag','qty','area','location','source','note','operator','created_at','updated_at','placement_label','items_json','volume','weight','volume_formula','unread']:
    ok(col in app+db+read('migrations/000_yuanxing_all_in_one.sql'), f'DB column marker missing {col}')
# Diagnostics/report
for token in ['/api/diagnostics/action-audit','/api/diagnostics/master-requirements','/api/health/postdeploy-evidence-report','v518_static_audit_resolved']:
    ok(token in app+read('static/yx_pages/diagnostics_page.js'), f'diagnostics marker missing {token}')
# Checklist shipped
ok((root/'diagnostics_v518_restore_satisfied_checklist.txt').exists(), 'v517 checklist not shipped')
if fail:
    print('V518 RESTORE SATISFIED SHIP PREVIEW DIAG AUDIT FAILED')
    for x in fail: print('-',x)
    sys.exit(1)
print('V518 RESTORE SATISFIED SHIP PREVIEW DIAG AUDIT OK')
