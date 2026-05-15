#!/usr/bin/env python3
"""V498 text parser + volume regression audit. No OCR/photo path is exercised."""
from pathlib import Path
import ast, sys, re
root = Path(__file__).resolve().parents[1]
fail = []

def read(rel):
    p = root / rel
    if not p.exists():
        fail.append(f'missing {rel}')
        return ''
    return p.read_text(encoding='utf-8', errors='ignore')

# Syntax checks for touched python files.
for rel in ['db.py', 'ocr.py', 'app.py']:
    try:
        ast.parse(read(rel))
    except SyntaxError as e:
        fail.append(f'{rel} syntax error: {e}')

sys.path.insert(0, str(root))
# The audit must run in the repair container even when optional runtime packages are
# not installed. Stub only import-time modules; no DB/web/image work is performed.
try:
    import types
    if 'werkzeug.security' not in sys.modules:
        werkzeug = types.ModuleType('werkzeug')
        security = types.ModuleType('werkzeug.security')
        security.generate_password_hash = lambda v, *a, **k: 'hash-' + str(v)
        security.check_password_hash = lambda h, v: True
        sys.modules.setdefault('werkzeug', werkzeug)
        sys.modules.setdefault('werkzeug.security', security)
    if 'PIL' not in sys.modules:
        pil = types.ModuleType('PIL')
        for name in ['Image', 'ImageEnhance', 'ImageFilter', 'ImageOps']:
            mod = types.ModuleType('PIL.' + name)
            setattr(pil, name, mod)
            sys.modules.setdefault('PIL.' + name, mod)
        sys.modules.setdefault('PIL', pil)
except Exception:
    pass
try:
    import db
    from ocr import parse_ocr_text
except Exception as e:
    fail.append(f'import failed: {e}')
else:
    qty_cases = {
        '60+54+50': 3,
        '220x4+223x2+44+35+221': 9,
        '100x30x63=115': 1,
        '100x30x63=504x5+588+587+502+420+382+378+280+254+237+174': 15,
        '132×11*12=123*4 (-3揚玉)': 4,
        '132x11x12=123x4(-3揚玉)': 4,
    }
    for text, expected in qty_cases.items():
        got = int(db.effective_product_qty(text, 0) or 0)
        if got != expected:
            fail.append(f'effective_product_qty({text!r})={got}, expected {expected}')
    parsed = parse_ocr_text('132×11*12=123*4 (-3揚玉)')
    items = parsed.get('items') or []
    if not items or int(items[0].get('qty') or 0) != 4:
        fail.append(f'parse_ocr_text text-parser qty failed: {parsed}')
    calc = db.calc_product_volume('132×11*12=123*4 (-3揚玉)', 4)
    if int(calc.get('bundle_count') or 0) != 4:
        fail.append(f'calc bundle_count failed: {calc}')
    if int(calc.get('pieces_sum') or 0) != 492:
        fail.append(f'calc pieces_sum failed: {calc}')
    if float(calc.get('volume') or 0) <= 0:
        fail.append(f'calc volume should be positive: {calc}')
    if not any((seg.get('math_segment') == '123x4' and seg.get('segment')) for seg in calc.get('segments') or []):
        fail.append(f'calc segments should keep display segment and math_segment: {calc}')

shipping_js = read('static/yx_pages/shipping_page.js')
for token in ['stripSupportNotes', 'supportTotalPieces', 'supportSticksSum', 'v517-full-checklist-alignment-pack27']:
    if token not in shipping_js:
        fail.append(f'shipping_page.js missing {token}')
if re.search(r'function\s+supportSticksSum\([^)]*\)\{[^}]*stripSupportNotes', shipping_js, flags=re.S) is None:
    fail.append('supportSticksSum must strip bracket notes before math')

db_src = read('db.py')
for token in ['V498_TEXT_PARSER_VOLUME_RULE', 'math_segment', '132×11*12=123*4']:
    if token not in db_src:
        fail.append(f'db.py missing {token}')

if fail:
    print('TEXT PARSER VOLUME AUDIT FAILED')
    for x in fail:
        print('-', x)
    sys.exit(1)
print('TEXT PARSER VOLUME AUDIT OK')
sys.exit(0)
