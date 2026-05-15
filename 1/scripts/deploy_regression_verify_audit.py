#!/usr/bin/env python3
"""Audit that deployed smoke/postdeploy scripts include regression guard checks."""
from pathlib import Path
import ast, sys
root = Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')

app=read('app.py')
try: ast.parse(app)
except SyntaxError as e: fail.append(f'app.py syntax error: {e}')
for token in ['V119-V518-RESTORE-SATISFIED-SHIP-PREVIEW-DIAG-PACK28','/api/health/release-readiness','regression_guard_rules','today_count_badge_same_source','warehouse_timeout_must_not_clear_local_rows','shipping_preview_must_render_feedback','customer_counts_rows_authoritative']:
    if token not in app:
        fail.append(f'app.py missing regression export token: {token}')

smoke=read('scripts/deploy_smoke_verify.py')
try: ast.parse(smoke)
except SyntaxError as e: fail.append(f'deploy_smoke_verify.py syntax error: {e}')
for token in ['REGRESSION_REQUIRED_ROUTES','verify_regression_rules','--strict-regression','/api/today-changes/badge','/api/warehouse/available-items','/api/ship/preview','regression_guard_rules','/api/health/release-readiness','release readiness endpoint','DEPLOY REGRESSION VERIFY OK']:
    if token not in smoke:
        fail.append(f'deploy_smoke_verify.py missing token: {token}')

post=read('scripts/postdeploy_data_consistency_verify.py')
try: ast.parse(post)
except SyntaxError as e: fail.append(f'postdeploy_data_consistency_verify.py syntax error: {e}')
for token in ['--strict-regression','today_badge','regression_guard_rules','diagnostics_export','Today badge regression guard failed','diagnostics export missing regression routes']:
    if token not in post:
        fail.append(f'postdeploy_data_consistency_verify.py missing token: {token}')

pre=read('scripts/predeploy_audit.py')
if 'scripts/deploy_regression_verify_audit.py' not in pre:
    fail.append('predeploy audit does not run deploy_regression_verify_audit.py')

if fail:
    print('DEPLOY REGRESSION VERIFY AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('DEPLOY REGRESSION VERIFY AUDIT OK')

# V509 final_release_readiness_audit must be included in predeploy.
