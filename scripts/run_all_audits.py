#!/usr/bin/env python3
from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parents[1]
audits=[
 'scripts/predeploy_audit.py',
 'scripts/v517_full_checklist_alignment_audit.py',
 'scripts/diagnostics_report_audit.py',
 'scripts/button_event_mainline_audit.py',
 'scripts/customer_sync_archive_audit.py',
 'scripts/sync_cache_empty_guard_audit.py',
 'scripts/text_parser_volume_audit.py',
 'scripts/warehouse_persistence_audit.py',
 'scripts/warehouse_structure_slots_audit.py',
 'scripts/warehouse_modal_batch_unplaced_audit.py',
 'scripts/warehouse_drag_placement_audit.py',
 'scripts/warehouse_layout_unplaced_audit.py',
 'scripts/shipping_consistency_audit.py',
 'scripts/ship_location_sync_audit.py',
 'scripts/today_diagnostics_audit.py',
 'scripts/settings_sync_backup_audit.py',
 'scripts/final_release_readiness_audit.py',
 'scripts/operation_closed_loop_audit.py',
 'scripts/postdeploy_evidence_collector_audit.py',
]
failed=[]
for rel in audits:
    print('==>', rel)
    r=subprocess.run([sys.executable, str(root/rel)], cwd=root)
    if r.returncode: failed.append(rel)
if failed:
    print('FAILED AUDITS:', failed)
    sys.exit(1)
print('ALL AUDITS OK')
