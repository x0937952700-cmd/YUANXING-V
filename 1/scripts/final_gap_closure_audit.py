#!/usr/bin/env python3
"""V513 write-test safety closure static audit. No network, no DB writes."""
from pathlib import Path
import ast, sys
root=Path(__file__).resolve().parents[1]
fail=[]
def read(rel):
    p=root/rel
    if not p.exists():
        fail.append('missing '+rel); return ''
    return p.read_text(encoding='utf-8', errors='ignore')
app=read('app.py')
smoke=read('scripts/deploy_smoke_verify.py')
post=read('scripts/postdeploy_final_gap_verify.py')
pre=read('scripts/predeploy_audit.py')
diag=read('static/yx_pages/diagnostics_page.js')
manifest=read('static/manifest.webmanifest')
sw=read('static/service-worker.js')
checks={
 'app version V510':'V119-V520-FINAL-SHIP-CACHE-ALIGN-PACK30' in app,
 'static version V510':'119-v520_final_ship_cache_align_pack30' in app,
 'schema version V510':'v520-final-ship-cache-align-pack30' in app,
 'final gap route':"/api/health/final-gap-report" in app and 'def api_health_final_gap_report' in app,
 'final gap report builder':'def _v510_build_final_gap_report' in app and 'remaining_to_100' in app,
 'diagnostics exports final gap':'final_gap_report' in app and 'ready_percent_estimate' in app,
 'deploy smoke checks final gap':'/api/health/final-gap-report' in smoke and 'readiness_payloads' in smoke,
 'postdeploy final gap script shipped':'EXPECTED_APP_VERSION' in post and '/api/health/final-gap-report' in post,
 'predeploy includes final gap audit':'scripts/final_gap_closure_audit.py' in pre and 'scripts/postdeploy_final_gap_verify.py' in pre,
 'manifest bumped':'119-v520_final_ship_cache_align_pack30' in manifest,
 'service worker bumped no API cache':'yuanxing-v518-static-css-icons' in sw and '/api/' in sw,
 'diagnostics client knows final gap':'/api/health/final-gap-report' in diag,
}
for name, ok in checks.items():
    if not ok: fail.append(name)
for rel in ['scripts/final_gap_closure_audit.py','scripts/postdeploy_final_gap_verify.py']:
    try: ast.parse(read(rel))
    except SyntaxError as e: fail.append(f'{rel} syntax error: {e}')
if fail:
    print('FINAL GAP CLOSURE AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('FINAL GAP CLOSURE AUDIT OK')
