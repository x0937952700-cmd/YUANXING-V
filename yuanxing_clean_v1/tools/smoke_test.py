import py_compile, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
py_compile.compile(str(root/'app.py'), doraise=True)
for p in (root/'static'/'js').glob('*.js'):
    txt=p.read_text(encoding='utf-8')
    assert 'fix151' not in txt.lower()
print('CLEAN_V1 smoke test passed')
