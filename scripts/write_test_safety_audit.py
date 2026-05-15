#!/usr/bin/env python3
"""Static audit for V513 write-test safety guard. No external deps."""
from pathlib import Path
import sys, ast
root=Path(__file__).resolve().parents[1]
fail=[]
def read(rel):
    p=root/rel
    if not p.exists(): fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')
app=read('app.py')
op=read('scripts/postdeploy_operation_closed_loop_verify.py')
deploy=read('scripts/deploy_smoke_verify.py')
diag=read('static/yx_pages/diagnostics_page.js')
evidence=read('scripts/postdeploy_final_evidence_verify.py')
for rel in ['scripts/postdeploy_operation_closed_loop_verify.py','scripts/write_test_safety_audit.py']:
    txt=read(rel)
    if txt:
        try: ast.parse(txt)
        except SyntaxError as e: fail.append(f'{rel} syntax error: {e}')
required_app=['V119-V517-FULL-CHECKLIST-ALIGNMENT-PACK27','119-v517_full_checklist_alignment_pack27','v517-full-checklist-alignment-pack27','/api/health/write-test-safety','def api_health_write_test_safety','_diag_v513_write_test_safety_audit']
for token in required_app:
    if token not in app: fail.append(f'app.py missing {token}')
for token in ['--write-test','--i-understand-this-writes-data','--backup-confirmed','--allow-without-backup','--keep-test-data','cleanup_sentinel_data','YX_WRITE_TEST_V515_','write-test refused']:
    if token not in op: fail.append(f'postdeploy_operation_closed_loop_verify.py missing safety token {token}')
for token in ['/api/health/write-test-safety','V119-V517-FULL-CHECKLIST-ALIGNMENT-PACK27']:
    if token not in deploy: fail.append(f'deploy_smoke_verify.py missing {token}')
if '/api/health/write-test-safety' not in diag: fail.append('diagnostics_page.js missing write-test safety endpoint')
if '/api/health/write-test-safety' not in evidence: fail.append('postdeploy_final_evidence_verify.py missing write-test safety endpoint')
if 'V517_FULL_CHECKLIST_ALIGNMENT_PACK25' not in Path(__file__).read_text(encoding='utf-8'): fail.append('audit marker missing')
if fail:
    print('WRITE TEST SAFETY AUDIT FAILED')
    for x in fail: print('-',x)
    sys.exit(1)
print('WRITE TEST SAFETY AUDIT OK')
