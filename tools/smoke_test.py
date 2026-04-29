from pathlib import Path
root = Path(__file__).resolve().parents[1]
required = [
    'app.py','db.py','templates/base.html','templates/home.html','templates/page.html',
    'static/css/app.css','static/js/core.js','static/js/inventory.js','static/js/orders.js',
    'static/js/master.js','static/js/inbound.js','static/js/shipping.js','static/js/warehouse.js',
    'static/js/customers.js','static/js/activity.js','static/js/settings.js'
]
missing = [p for p in required if not (root / p).exists()]
if missing:
    raise SystemExit('Missing: ' + ', '.join(missing))
for p in ['static/js/core.js','templates/base.html']:
    text = (root / p).read_text(encoding='utf-8')
    if 'fix151' in text.lower() or 'fix150' in text.lower() or 'fix149' in text.lower():
        raise SystemExit(f'Old FIX reference found in {p}')
print('CLEAN V1 smoke test passed')
