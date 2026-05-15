#!/usr/bin/env python3
"""Audit diagnostics export report wiring. No external deps."""
from pathlib import Path
import ast, sys
root=Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')

app=read('app.py')
try: ast.parse(app)
except SyntaxError as e: fail.append(f'app.py syntax error: {e}')
for token in ["@app.route('/api/diagnostics/export'", 'def api_diagnostics_export', 'yuanxing_server_diagnostics_export', 'Content-Disposition', 'Cache-Control', 'regression_guard_rules', 'today_count_badge_same_source', 'warehouse_timeout_must_not_clear_local_rows']:
    if token not in app:
        fail.append(f'app.py missing diagnostics export token: {token}')
page=read('static/yx_pages/diagnostics_page.js')
for token in ['diag-export', 'exportReport', 'downloadJson', '/api/diagnostics/export', 'yuanxing_full_frontend_backend_diagnostics_export', 'local_snapshot', 'server_export', 'endpoint_checks']:
    if token not in page:
        fail.append(f'diagnostics_page.js missing export token: {token}')
if 'setInterval(' in page or 'new MutationObserver' in page:
    fail.append('diagnostics_page.js added timer/observer')
pre=read('scripts/predeploy_audit.py')
if 'scripts/diagnostics_report_audit.py' not in pre:
    fail.append('predeploy audit does not run diagnostics_report_audit.py')
if fail:
    print('DIAGNOSTICS REPORT AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('DIAGNOSTICS REPORT AUDIT OK')
