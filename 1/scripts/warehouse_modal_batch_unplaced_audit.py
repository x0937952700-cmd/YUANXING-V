#!/usr/bin/env python3
from pathlib import Path
import re, sys
ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'static/yx_pages/warehouse_page.js').read_text(encoding='utf-8')
app=(ROOT/'app.py').read_text(encoding='utf-8')
checks={
 'v506 version app': "V119-V518-RESTORE-SATISFIED-SHIP-PREVIEW-DIAG-PACK28" in app,
 'warehouse cell GET enabled': '@app.route("/api/warehouse/cell", methods=["GET", "POST"])' in app and 'request.method == "GET"' in app,
 'fresh readback helper': 'fetchFreshWarehouseCellForModal' in js and '/api/warehouse/cell?zone=' in js,
 'draft protected': 'draftRestored' in js and 'modalUserTouchedAt' in js,
 'removed item returns dropdown': 'remove-current-item-return-unplaced' in js and 'mutateAvailableLocked([removedItem], +1' in js,
 'batch limits preserved': 'syncBatchSelectLimits?.(false)' in js,
 'no new interval observer': 'setInterval(' not in js and 'new MutationObserver' not in js,
}
failed=[k for k,v in checks.items() if not v]
if failed:
    print('warehouse_modal_batch_unplaced_audit FAILED:', ', '.join(failed))
    sys.exit(1)
print('warehouse_modal_batch_unplaced_audit OK')
