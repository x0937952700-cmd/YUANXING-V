#!/usr/bin/env python3
"""Static audit for V514 postdeploy evidence collector. No network, no DB writes."""
from pathlib import Path
import ast, sys
root=Path(__file__).resolve().parents[1]
fail=[]
def read(rel):
    p=root/rel
    if not p.exists(): fail.append('missing '+rel); return ''
    return p.read_text(encoding='utf-8', errors='ignore')
app=read('app.py')
diag=read('static/yx_pages/diagnostics_page.js')
smoke=read('scripts/deploy_smoke_verify.py')
collector=read('scripts/postdeploy_evidence_collect.py')
pre=read('scripts/predeploy_audit.py')
for rel in ['scripts/postdeploy_evidence_collect.py','scripts/postdeploy_evidence_collector_audit.py']:
    txt=read(rel)
    if txt:
        try: ast.parse(txt)
        except SyntaxError as e: fail.append(f'{rel} syntax error: {e}')
checks={
    'app version V514':'V119-V514-POSTDEPLOY-EVIDENCE-COLLECTOR-PACK24' in app,
    'static version V514':'119-v514_postdeploy_evidence_collector_pack24' in app,
    'schema version V514':'v514-postdeploy-evidence-collector-pack24' in app,
    'postdeploy evidence route':"/api/health/postdeploy-evidence-report" in app and 'def api_health_postdeploy_evidence_report' in app,
    'collector route read-only':'This does not write data' in app and 'no_mutation' in app,
    'collector aggregates evidence':all(t in app for t in ['final_evidence_bundle','release_readiness','operation_closed_loop','final_gap_report','write_test_safety','diagnostics_export']),
    'diagnostics checks collector':'/api/health/postdeploy-evidence-report' in diag,
    'deploy smoke checks collector':'/api/health/postdeploy-evidence-report' in smoke,
    'postdeploy collector script shipped':'postdeploy_evidence_collect' in collector and '/api/health/postdeploy-evidence-report' in collector and 'copy_paste_summary' in collector,
    'predeploy includes collector':'scripts/postdeploy_evidence_collector_audit.py' in pre and 'scripts/postdeploy_evidence_collect.py' in pre,
    'audit marker':'V514_POSTDEPLOY_EVIDENCE_COLLECTOR_PACK24' in Path(__file__).read_text(encoding='utf-8'),
}
for name, ok in checks.items():
    if not ok: fail.append(name)
if fail:
    print('POSTDEPLOY EVIDENCE COLLECTOR AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('POSTDEPLOY EVIDENCE COLLECTOR AUDIT OK')
