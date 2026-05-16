#!/usr/bin/env python3
from pathlib import Path
import ast, sys
root = Path(__file__).resolve().parents[1]
fail=[]
def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')
app=read('app.py'); device=read('static/yx_device_sync.js'); store=read('static/yx_data_store.js'); settings=read('static/yx_pages/settings_page.js'); pre=read('scripts/predeploy_audit.py')
for rel, src in [('app.py',app),('scripts/sync_cache_empty_guard_audit.py',Path(__file__).read_text(encoding='utf-8'))]:
    try: ast.parse(src)
    except SyntaxError as e: fail.append(f'{rel} syntax error: {e}')
checks=[
    ('version bumped to V507', 'V119-V520-FINAL-SHIP-CACHE-ALIGN-PACK30' in app and 'v520-final-ship-cache-align-pack30' in device and 'v520-final-ship-cache-align-pack30' in store),
    ('empty overwrite guard exists', 'shouldPreserveOldPayload' in device and 'preserved_empty_overwrite' in device and 'explicitEmptyOk' in device),
    ('background queue drains before sync', 'drainBackgroundQueueBeforeSync' in device and 'queue-drain' in device and 'YXBackgroundSave' in device),
    ('sync meta includes queue status', 'queue_status' in device and 'pending_after' in settings),
    ('datastore local empty does not replace rows', 'newest === 0' in store and 'hasUsefulRows' in store),
    ('sync status route is read-only', "@app.route('/api/sync/status'" in app and 'no_mutation=True' in app),
    ('diagnostics exports v506 audit', '_diag_v506_sync_cache_guard_audit' in app and 'sync_cache_empty_guard_audit' in app),
    ('predeploy includes this audit', 'scripts/sync_cache_empty_guard_audit.py' in pre),
    ('no timers/observers added', 'setInterval(' not in device+store+settings and 'MutationObserver' not in device+store+settings),
]
for name, ok in checks:
    if not ok: fail.append(name)
if fail:
    print('SYNC CACHE EMPTY GUARD AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('SYNC CACHE EMPTY GUARD AUDIT OK')
