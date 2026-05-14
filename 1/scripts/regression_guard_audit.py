#!/usr/bin/env python3
"""Audit V480 regression guards for no-empty-overwrite and no-silent-preview protections."""
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
if 'V119-V481-DEPLOY-REGRESSION-VERIFY-PASS18' not in app:
    fail.append('app.py APP_VERSION is not v481')
if '119-v481_deploy_regression_verify_pass18' not in app:
    fail.append('app.py STATIC_VERSION is not v481')
try: ast.parse(app)
except SyntaxError as e: fail.append(f'app.py syntax error: {e}')

base=read('templates/base.html')
for token in ['yx_data_store.js','yx_mutation_bus.js','yx_regression_guard.js','yx_diagnostics_client.js']:
    if token not in base:
        fail.append(f'base.html missing {token}')
if base.find('yx_regression_guard.js') < base.find('yx_mutation_bus.js'):
    fail.append('yx_regression_guard.js must load after yx_mutation_bus.js')
if base.find('yx_regression_guard.js') > base.find('yx_diagnostics_client.js'):
    fail.append('yx_regression_guard.js should load before or near diagnostics client so diagnostics can see guard state')
if 'yx_v452_max_repair.js' in base:
    fail.append('base.html still loads old yx_v452_max_repair.js')

rg=read('static/yx_regression_guard.js')
for token in ['v481-deploy-regression-verify-pass18','patchDataStore','empty_overwrite_blocked','empty_response_rows_blocked','today_unplaced_guard','shipping_preview_guard','warehouse_timeout_guard','runSelfCheck','YXRegressionGuard']:
    if token not in rg:
        fail.append(f'yx_regression_guard.js missing {token}')
if 'setInterval(' in rg or 'new MutationObserver' in rg:
    fail.append('yx_regression_guard.js must not add setInterval/MutationObserver')
try:
    # Basic JS token sanity only; real syntax is checked with node in packaging.
    assert rg.count('{') >= 10 and rg.count('(') >= 10
except Exception:
    fail.append('yx_regression_guard.js looks malformed')

diag=read('static/yx_diagnostics_client.js')
for token in ['regression_guard_events','regression_guard_self_check','YXRegressionGuard']:
    if token not in diag:
        fail.append(f'yx_diagnostics_client.js missing regression guard snapshot token {token}')

page=read('static/yx_pages/diagnostics_page.js')
for token in ['防回歸事件','防回歸：','regression_guard_events']:
    if token not in page:
        fail.append(f'diagnostics_page.js missing guard display token {token}')

pre=read('scripts/predeploy_audit.py')
if 'scripts/regression_guard_audit.py' not in pre:
    fail.append('predeploy audit does not run regression_guard_audit.py')

if fail:
    print('REGRESSION GUARD AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('REGRESSION GUARD AUDIT OK')
