#!/usr/bin/env python3
"""Predeploy audit for Render/PWA/startup config. No external deps."""
from pathlib import Path
import ast, re, sys, zipfile
root = Path(__file__).resolve().parents[1]
fail=[]

def read(rel):
    p=root/rel
    if not p.exists():
        fail.append(f'missing {rel}'); return ''
    return p.read_text(encoding='utf-8', errors='ignore')

# Python files compile.
for rel in ['app.py','db.py','wsgi.py','backup.py','ocr.py','scripts/postdeploy_data_consistency_verify.py','scripts/diagnostics_report_audit.py','scripts/regression_guard_audit.py','scripts/deploy_regression_verify_audit.py']:
    text=read(rel)
    if text:
        try: ast.parse(text)
        except SyntaxError as e: fail.append(f'{rel} syntax error: {e}')

proc=read('Procfile')
if 'gunicorn wsgi:app' not in proc or '--bind 0.0.0.0:$PORT' not in proc:
    fail.append('Procfile start command is not Render-safe wsgi:app bind $PORT')
render=read('render.yaml')
for token in ['pip install -r requirements.txt','gunicorn wsgi:app','healthCheckPath: /health','preDeployCommand: python -c "from db import init_db; init_db()"']:
    if token not in render:
        fail.append(f'render.yaml missing {token}')

for rel in ['scripts/static_data_spine_audit.py','scripts/predeploy_audit.py','scripts/deploy_smoke_verify.py','scripts/smoke_test.py','scripts/data_flow_regression_audit.py','scripts/functional_path_audit.py','scripts/postdeploy_data_consistency_verify.py','scripts/diagnostics_report_audit.py','scripts/regression_guard_audit.py','scripts/deploy_regression_verify_audit.py']:
    if not (root/rel).exists():
        fail.append(f'missing {rel}')

req=read('requirements.txt')
for token in ['Flask==','gunicorn==','psycopg2-binary==','openpyxl==']:
    if token not in req:
        fail.append(f'requirements.txt missing {token}')

app=read('app.py')
for route in ['@app.route("/health")','@app.route("/api/health")',"@app.route('/api/health/smoke'", "@app.route('/api/health/api-schema'", "@app.route('/api/health/event-flow'", '@app.route("/diagnostics")', "@app.route('/api/diagnostics/summary'", "@app.route('/api/diagnostics/client-log'", "@app.route('/api/diagnostics/export'"]:
    if route not in app:
        fail.append(f'app.py missing route marker {route}')
if 'V119-V484-SPEED-PERSIST-DIAG-FINAL-PATCH' not in app:
    fail.append('app.py version not v483')

base=read('templates/base.html')
if 'yx_v452_max_repair.js' in base:
    fail.append('base.html still loads yx_v452_max_repair.js')
if (root/'static/yx_v452_max_repair.js').exists():
    fail.append('static/yx_v452_max_repair.js still exists')
for rel in ['templates/diagnostics.html','static/yx_diagnostics_client.js','static/yx_pages/diagnostics_page.js']:
    if not (root/rel).exists():
        fail.append(f'missing {rel}')

sw=read('static/service-worker.js')
if 'url.pathname.startsWith(\'/api/\')' not in sw and 'url.pathname.startsWith("/api/")' not in sw:
    fail.append('service-worker does not bypass API')
if 'STATIC_ALLOW' not in sw or 'static\\/css' not in sw or 'static\\/icons' not in sw:
    fail.append('service-worker static allowlist missing css/icons')

# No pycache/pyc should be shipped in final zip/work tree.
for p in root.rglob('*'):
    if '__pycache__' in p.parts or p.suffix == '.pyc':
        fail.append(f'pycache artifact present: {p.relative_to(root)}')
        break

# Run static/data-flow audits as part of predeploy, but avoid recursive self-run.
import subprocess
for rel in ['scripts/static_data_spine_audit.py','scripts/data_flow_regression_audit.py','scripts/functional_path_audit.py','scripts/diagnostics_report_audit.py','scripts/regression_guard_audit.py','scripts/deploy_regression_verify_audit.py']:
    try:
        cp = subprocess.run([sys.executable, str(root/rel)], cwd=str(root), text=True, capture_output=True)
        if cp.returncode != 0:
            fail.append(f'{rel} failed: {cp.stdout}{cp.stderr}')
    except Exception as e:
        fail.append(f'{rel} could not run: {e}')

if fail:
    print('PREDEPLOY AUDIT FAILED')
    for x in fail: print('-', x)
    sys.exit(1)
print('PREDEPLOY AUDIT OK')
