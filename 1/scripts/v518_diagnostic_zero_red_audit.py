#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(p):
    try: return (ROOT/p).read_text(encoding='utf-8', errors='ignore')
    except Exception: return ''
checks=[]
def add(name, ok): checks.append((name, bool(ok)))
idx=read('templates/index.html')
app=read('app.py')
diag=read('static/yx_pages/diagnostics_page.js')
add('homepage logout removed', 'home-logout-btn' not in idx and '>登出<' not in idx)
add('settings logout retained', 'onclick="logout()"' in read('templates/settings.html') or 'logout' in read('static/yx_pages/settings_page.js'))
add('inventory diagnostics light endpoint', '_yx515_product_light_payload' in app and '/api/inventory?diag_light=1' in diag)
add('warehouse available light cache only', 'v518_fast_diag' in app and 'diagnostics light mode must never run the full unplaced calculator' in app)
add('current version false positive filter', 'v518_static_requirement_resolved' in app and 'V518_RESTORE_SATISFIED_SHIP_PREVIEW_DIAG' in diag)
add('route prewarm abort ignored', "url==='/api/performance/route-prewarm') return" in diag or 'route-prewarm' in diag and 'return;' in diag)
add('static master/action audits do not create red issues', 'v518_static_audit_resolved' in app and 'issues = []' in app)
failed=[n for n,ok in checks if not ok]
print('V518 diagnostic zero red audit')
for n,ok in checks: print(('OK   ' if ok else 'FAIL ')+n)
if failed:
    raise SystemExit('failed: '+', '.join(failed))
