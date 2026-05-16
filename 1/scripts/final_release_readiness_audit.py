#!/usr/bin/env python3
"""V509 final release readiness static audit. No external deps, no DB mutation."""
from pathlib import Path
import ast, sys, re
root = Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')

def has(text, token, msg):
    if token not in text:
        fail.append(msg)

app=read('app.py')
try: ast.parse(app)
except SyntaxError as e: fail.append(f'app.py syntax error: {e}')
for token,msg in [
    ('V119-V520-FINAL-SHIP-CACHE-ALIGN-PACK30','app.py not bumped to V509'),
    ('119-v520_final_ship_cache_align_pack30','STATIC_VERSION not bumped to V509'),
    ('v520-final-ship-cache-align-pack30','API_SCHEMA_VERSION not bumped to V509'),
    ("@app.route('/api/health/release-readiness'", 'missing release readiness route'),
    ('no_mutation=True', 'release readiness route must be read-only/no_mutation'),
    ('/api/product-locations', 'product location route must remain present'),
    ('/api/sync/status', 'sync status route must remain present'),
]: has(app, token, msg)

for rel in ['scripts/deploy_smoke_verify.py','scripts/postdeploy_data_consistency_verify.py','scripts/smoke_test.py','scripts/postdeploy_operation_closed_loop_verify.py']:
    txt=read(rel)
    try: ast.parse(txt)
    except SyntaxError as e: fail.append(f'{rel} syntax error: {e}')
    has(txt, 'V119-V520-FINAL-SHIP-CACHE-ALIGN-PACK30', f'{rel} expected app version not V509')
    if rel not in ('scripts/smoke_test.py','scripts/postdeploy_operation_closed_loop_verify.py'):
        has(txt, '119-v520_final_ship_cache_align_pack30', f'{rel} expected static version not V509')
        has(txt, '/api/health/release-readiness', f'{rel} does not check release readiness endpoint')

pre=read('scripts/predeploy_audit.py')
has(pre, 'scripts/final_release_readiness_audit.py', 'predeploy_audit does not include final release audit')

sw=read('static/service-worker.js')
has(sw, 'yuanxing-v518-static-css-icons', 'service-worker cache version not V509')
has(sw, "url.pathname.startsWith('/api/')", 'service worker must bypass API cache')

manifest=read('static/manifest.webmanifest')
has(manifest, '119-v520_final_ship_cache_align_pack30', 'manifest version/start_url/id not V509')

pwa=read('static/pwa.js')
has(pwa, '119-v520_final_ship_cache_align_pack30', 'pwa.js fallback version not V509')

base=read('templates/base.html')
for old in ['yx_v452_max_repair.js','fix135_master_final_hardlock','fix138_final_master_hardlock','setInterval(function(){']:
    if old in base:
        fail.append(f'base.html contains old/unsafe loader token: {old}')

req=read('requirements.txt')
for token in ['Flask==','gunicorn==','psycopg2-binary==','openpyxl==']:
    has(req, token, f'requirements missing {token}')

for p in root.rglob('*'):
    if '__pycache__' in p.parts or p.suffix == '.pyc':
        fail.append(f'pycache artifact present: {p.relative_to(root)}')
        break

# V510 operation closed-loop readiness marker
has(app, '/api/health/operation-closed-loop', 'missing operation closed-loop route')
has(read('scripts/postdeploy_operation_closed_loop_verify.py'), 'V518_RESTORE_SATISFIED_SHIP_PREVIEW_DIAG_PACK25', 'missing V510 operation closed-loop verify script marker')

if fail:
    print('FINAL RELEASE READINESS AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('FINAL RELEASE READINESS AUDIT OK')
