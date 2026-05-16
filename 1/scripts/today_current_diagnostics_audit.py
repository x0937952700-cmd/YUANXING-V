#!/usr/bin/env python3
from pathlib import Path
import sys, ast, re
root=Path(__file__).resolve().parents[1]
fail=[]
def read(rel):
    p=root/rel
    if not p.exists(): fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')
app=read('app.py')
today=read('static/yx_pages/today_changes_page.js')
diag=read('static/yx_pages/diagnostics_page.js')
pre=read('scripts/predeploy_audit.py')
checks={
 'version_v506': 'V119-V520-FINAL-SHIP-CACHE-ALIGN-PACK30' in app and 'v520-final-ship-cache-align-pack30' in app,
 'today_manual_refresh_frontend': 'manualRefresh' in today and 'manual_refresh=' in today and 'force:true' not in today and 'force=1' not in today and 'force=0' not in today,
 'today_no_idle_autorefresh': 'requestIdleCallback' not in today and 'setInterval(' not in today and 'MutationObserver' not in today,
 'today_cache_clear_manual': 'clearTodayLightCaches' in today and 'flagTodayStale' in today,
 'backend_manual_refresh': "request.args.get('manual_refresh')" in app and 'diagnostic_refresh_mode' in app,
 'action_audit_db_src_defined': "db_src = read_file('db.py')" in app and "today_js = read_file('static/yx_pages/today_changes_page.js')" in app,
 'current_issue_summary_backend': 'current_version_issue_summary' in app and '_diagnostics_filter_current_errors' in app,
 'diagnostics_current_only_ui': 'current_version_only' in diag and 'current_version_issue_summary' in diag and '只列 current-version' in diag,
 'predeploy_wired': 'scripts/today_current_diagnostics_audit.py' in pre,
}
for k,v in checks.items():
    if not v: fail.append(k)
for rel in ['app.py','scripts/today_current_diagnostics_audit.py']:
    try: ast.parse(read(rel))
    except SyntaxError as e: fail.append(f'{rel} syntax: {e}')
if fail:
    print('TODAY CURRENT DIAGNOSTICS AUDIT FAILED')
    for x in fail: print('-',x)
    sys.exit(1)
print('TODAY CURRENT DIAGNOSTICS AUDIT OK')
