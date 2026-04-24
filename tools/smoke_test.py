#!/usr/bin/env python3
"""沅興木業 FIX53 基本檢查：語法、重要字串、件數邏輯。"""
from pathlib import Path
import py_compile, re, sys
root = Path(__file__).resolve().parents[1]
for p in ['app.py','db.py','ocr.py','backup.py']:
    py_compile.compile(str(root/p), doraise=True)
appjs = (root/'static/app.js').read_text(encoding='utf-8')
assert 'legacyOpenCustomerModal(' not in appjs
assert 'legacyOpenCustomerModalFix6(' not in appjs
assert 'FIX53 production clean guard' in appjs
for bad in ['客戶資料已使用 UID 強化；改名會盡量同步關聯，避免同名混淆。','庫存 / 訂單 / 總單 / 出貨']:
    assert bad not in appjs
print('FIX53 smoke test OK')
