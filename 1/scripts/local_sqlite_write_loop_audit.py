#!/usr/bin/env python3
"""Static audit for V512 local SQLite write-loop package."""
from pathlib import Path
import ast, sys
root = Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')

app = read('app.py')
script = read('scripts/local_sqlite_write_loop_verify.py')
diag = read('static/yx_pages/diagnostics_page.js')
pre = read('scripts/predeploy_audit.py')
for rel in ['scripts/local_sqlite_write_loop_verify.py','scripts/local_sqlite_write_loop_audit.py']:
    txt=read(rel)
    if txt:
        try: ast.parse(txt)
        except SyntaxError as e: fail.append(f'{rel} syntax error: {e}')
checks = {
    'version V512': 'V119-V515-DIAGNOSTIC-100-HOME-LOGOUT-REMOVAL-PACK25' in app and 'v515-diagnostic-100-home-logout-removal-pack25' in app,
    'readiness endpoint': '/api/health/local-write-loop-readiness' in app and 'api_health_local_write_loop_readiness' in app,
    'audit helper': '_diag_v512_local_write_loop_audit' in app,
    'final evidence collects local readiness': "collect('local_write_loop_readiness'" in app,
    'diagnostics page checks local readiness': '/api/health/local-write-loop-readiness' in diag,
    'local verifier temp sqlite': 'sqlite:///' in script and 'TemporaryDirectory' in script and 'DATABASE_URL' in script,
    'local verifier uses test_client': 'test_client' in script and '/api/login' in script,
    'local verifier full chain': all(t in script for t in ['/api/inventory','/api/orders','/api/master_orders','/api/ship/preview','/api/ship/confirm','/api/product-locations','/api/today-changes','/api/diagnostics/export','/api/health/final-evidence-bundle']),
    'sentinel x4 rule tested': '132×11*12=123*4 (-3揚玉)' in script and 'EXPECTED_SENTINEL_QTY = 4' in script,
    'predeploy includes local audit': 'local_sqlite_write_loop_audit.py' in pre and 'local_sqlite_write_loop_verify.py' in pre,
    'no auto production write': '--write-test' in read('scripts/postdeploy_operation_closed_loop_verify.py') and 'write-test skipped' in read('scripts/postdeploy_operation_closed_loop_verify.py'),
}
for name, ok in checks.items():
    if not ok: fail.append('failed: '+name)
if fail:
    print('LOCAL SQLITE WRITE LOOP AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('LOCAL SQLITE WRITE LOOP AUDIT OK')
