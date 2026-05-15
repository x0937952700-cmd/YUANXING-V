#!/usr/bin/env python3
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
fail=[]
def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')
app=read('app.py'); db=read('db.py'); js=read('static/yx_pages/customers_page.js')
checks = [
    ('archive_customer helper exists', 'def archive_customer(name' in db and 'upsert_customer(name, region=region' in db),
    ('action sheet has archive and delete', 'data-yx113-customer-act="archive"' in js and 'data-yx113-customer-act="delete"' in js),
    ('pointerdown does not block button-card self', 'isSelfCustomerCardButton' in js and 'interactive && !isSelfCustomerCardButton' in js),
    ('customers request uses source filter', 'customerSourceForModule' in js and 'customerSourceQuery' in js and 'source=' in js),
    ('customer changes clear cross caches', '_v211_clear_cross_function_cache(name)' in app and '_v211_clear_cross_function_cache(new_name)' in app),
    ('diagnostics export includes customer audit', 'customer_sync_archive_audit' in app and '_diag_v506_customer_sync_audit' in app),
    ('no setInterval added in customers page', 'setInterval(' not in js),
    ('no MutationObserver added in customers page', 'MutationObserver' not in js),
]
for name, ok in checks:
    if not ok: fail.append(name)
if fail:
    print('CUSTOMER SYNC ARCHIVE AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('CUSTOMER SYNC ARCHIVE AUDIT OK')
