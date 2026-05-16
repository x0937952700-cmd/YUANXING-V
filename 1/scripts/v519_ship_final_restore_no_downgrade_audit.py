#!/usr/bin/env python3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
app=(root/'app.py').read_text(encoding='utf-8',errors='ignore')
ship=(root/'static/yx_pages/shipping_page.js').read_text(encoding='utf-8',errors='ignore')
diag=(root/'static/yx_pages/diagnostics_page.js').read_text(encoding='utf-8',errors='ignore')
css=(root/'static/css/base.css').read_text(encoding='utf-8',errors='ignore')
tpl=(root/'templates/module.html').read_text(encoding='utf-8',errors='ignore')
version='v520-final-ship-cache-align-pack30'
checks=[]
def ok(name, cond, detail):
    checks.append((name,bool(cond),detail))
ok('version bumped', 'V119-V520-FINAL-SHIP-CACHE-ALIGN-PACK30' in app and version in ship and version in diag, 'all active app/static/js versions must be V519')
ok('no stale ship v514 cache constant', 'v514-postdeploy-evidence-collector-pack24' not in ship and '119-v514_postdeploy_evidence_collector_pack24' not in ship, 'shipping page must not reuse stale V514 customer/item cache')
ok('ship fetches master/order/inventory separately', 'fetchSourceItemsForCustomer' in ship and 'source=master_order' in ship and 'source=orders' in ship and 'source=inventory' in ship, 'shipping customer item list must merge orders + master + inventory')
ok('ship merges item rows not downgrade', 'mergeShipItems' in ship and 'merged_sources' in ship, 'must merge current DB source rows without replacing current mainline with old page')
ok('selected section restored not hidden', '#ship-selected-section{display:block!important' in css and 'ship-selected-items-bottom' in tpl, 'previous satisfied selected section must be visible again')
ok('selected mirror both top bottom', 'ship-selected-items-bottom' in ship and 'selected-bottom-mirror' in ship, 'selected items must render in both restored and current sections')
ok('diagnostics ignores successful guard warnings', 'empty_response_rows_blocked is a successful guard event' in diag and "if(String(g.type||'').includes('empty_response_rows_blocked')) return" in diag, 'empty response guard should not become red/yellow')
ok('action audit diagnostic major anomaly no false fail', 'classifyEndpointRows' in app and 'current_version_issue_summary' in app, 'diagnostic major anomaly check must accept current implementation evidence')
failed=[c for c in checks if not c[1]]
print('V519 ship final restore no downgrade audit')
for n,o,d in checks:
    print(('OK ' if o else 'FAIL ')+n+' - '+d)
if failed:
    raise SystemExit(1)
