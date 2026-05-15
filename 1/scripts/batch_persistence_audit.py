#!/usr/bin/env python3
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}')
        return ''
    return p.read_text(encoding='utf-8', errors='ignore')

app=read('app.py')
js=read('static/yx_pages/product_page_core.js')
for token in ['V119-V514-POSTDEPLOY-EVIDENCE-COLLECTOR-PACK24','119-v514_postdeploy_evidence_collector_pack24','v514-postdeploy-evidence-collector-pack24']:
    if token not in app:
        fail.append(f'missing version token {token}')
for token in ['_v495_batch_payload','_v495_reject_implicit_all_for_destructive','_v495_read_rows_by_ids','db_readback']:
    if token not in app:
        fail.append(f'app.py missing batch persistence helper {token}')
for token in ["'batch_delete'", "'batch_zone'", "'batch_transfer'"]:
    if token not in app:
        fail.append(f'app.py missing destructive guard token {token}')
if "for col in ('location', 'area', 'zone')" not in app:
    fail.append('batch-zone does not update location/area/zone together')
for token in ['selectedOnlyItems','批量刪除不會自動刪全部','批量轉入不會自動選全部','避免誤移全部']:
    if token not in js:
        fail.append(f'product JS missing safe selection token: {token}')
for token in ["backgroundRequest('/api/customer-items/batch-delete'", "backgroundRequest('/api/customer-items/batch-zone'", "backgroundRequest('/api/customer-items/batch-material'", "backgroundRequest('/api/items/batch-transfer'"]:
    if token not in js:
        fail.append(f'product JS missing background batch save {token}')
if 'selectedItems(source, true)' in js and 'async function bulkDelete' in js:
    fail.append('bulkDelete still contains selectedItems(source, true), which may delete all visible rows')
body = js.split('async function batchMoveZone(source, zone){',1)[1].split('function renderSummary(source){',1)[0] if 'async function batchMoveZone(source, zone){' in js else ''
if 'selectedOrAllIds' in body or 'selectedItems(source, true)' in body:
    fail.append('batchMoveZone still appears to use implicit-all selection')
if fail:
    print('BATCH PERSISTENCE AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('BATCH PERSISTENCE AUDIT OK')
