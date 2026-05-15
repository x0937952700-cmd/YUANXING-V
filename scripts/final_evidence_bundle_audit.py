#!/usr/bin/env python3
"""V513 write-test safety bundle static audit. No network, no DB writes."""
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
diag=read('static/yx_pages/diagnostics_page.js')
smoke=read('scripts/deploy_smoke_verify.py')
post=read('scripts/postdeploy_final_evidence_verify.py')
pre=read('scripts/predeploy_audit.py')
manifest=read('static/manifest.webmanifest')
sw=read('static/service-worker.js')
checks={
 'app version V511':'V119-V517-FULL-CHECKLIST-ALIGNMENT-PACK27' in app,
 'static version V511':'119-v517_full_checklist_alignment_pack27' in app,
 'schema version V511':'v517-full-checklist-alignment-pack27' in app,
 'final evidence route':"/api/health/final-evidence-bundle" in app and 'def api_health_final_evidence_bundle' in app,
 'final evidence audit helper':'def _diag_v511_final_evidence_bundle_audit' in app,
 'bundle aggregates readiness loop gap diagnostics':all(t in app for t in ['release_readiness','operation_closed_loop','final_gap_report','diagnostics_export']),
 'diagnostics client checks evidence':'/api/health/final-evidence-bundle' in diag,
 'deploy smoke checks evidence':'/api/health/final-evidence-bundle' in smoke,
 'postdeploy evidence script shipped':'V119-V517-FULL-CHECKLIST-ALIGNMENT-PACK27' in post and '/api/health/final-evidence-bundle' in post,
 'predeploy includes evidence audit':'scripts/final_evidence_bundle_audit.py' in pre,
 'manifest bumped':'119-v517_full_checklist_alignment_pack27' in manifest,
 'service worker bumped no API cache':'yuanxing-v517-static-css-icons' in sw and '/api/' in sw,
}
for name, ok in checks.items():
    if not ok: fail.append(name)
for rel in ['scripts/final_evidence_bundle_audit.py','scripts/postdeploy_final_evidence_verify.py']:
    try: ast.parse(read(rel))
    except SyntaxError as e: fail.append(f'{rel} syntax error: {e}')
if fail:
    print('FINAL EVIDENCE BUNDLE AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('FINAL EVIDENCE BUNDLE AUDIT OK')
