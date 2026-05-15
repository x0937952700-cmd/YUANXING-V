#!/usr/bin/env python3
"""V497 settings/sync/backup/admin consistency audit.
Read-only static audit: no server, no DB mutation.
"""
from pathlib import Path
import re, sys
ROOT = Path(__file__).resolve().parents[1]
checks = []
def ok(name, cond, detail=''):
    checks.append((name, bool(cond), detail))

def text(rel):
    return (ROOT/rel).read_text(encoding='utf-8')

app = text('app.py')
settings = text('static/yx_pages/settings_page.js')
tmpl = text('templates/settings.html')
backup = text('backup.py')
sync = text('static/yx_device_sync.js')

ok('version bumped to V509', 'V119-V518-RESTORE-SATISFIED-SHIP-PREVIEW-DIAG-PACK28' in app and '119-v518_restore_satisfied_ship_preview_diag_pack28' in app)
ok('GET /api/backup manual-only no create', "created_by_get" in app and "if request.method == 'GET'" in app and "run_daily_backup()" in app.split('@app.route("/api/backup"')[1].split('@app.route("/api/backups"')[0])
ok('settings has sync panel', 'id="settings-sync-panel"' in tmpl and 'settings-sync-btn' in tmpl and 'settings-auto-sync-btn' in tmpl)
ok('settings sync uses YXDeviceSync.syncAll', 'YXDeviceSync.syncAll' in settings and '上次同步：' in settings)
ok('audit filters use backend parameter names', 'username:' in settings and 'entity_type:' in settings and 'start_date:' in settings and 'end_date:' in settings)
ok('audit single restore button and route', 'data-audit-restore' in settings and "/api/audit-trails/<int:audit_id>/restore" in app)
ok('admin block sends explicit blocked status', 'data-blocked' in settings and "blocked:b.dataset.blocked==='1'" in settings and "'blocked' in data" in app)
ok('admin list checks is_blocked not bstable typo', 'bstable' not in settings and 'is_blocked' in settings)
ok('backup list does not auto-create and exposes items', '"items": files' in backup and 'skipped_tables' in backup and 'today_changes' in backup)
ok('device sync exposes status helpers', 'readAuto, writeAuto, formatTime:fmtTime' in sync)
failed = [c for c in checks if not c[1]]
for name, passed, detail in checks:
    print(('OK' if passed else 'FAIL') + ' - ' + name + ((' :: ' + detail) if detail else ''))
if failed:
    sys.exit(1)
