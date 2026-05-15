#!/usr/bin/env python3
"""Yuanxing V512 local SQLite write-loop verifier.

Runs the core write loop against a temporary SQLite database with Flask test_client.
It does NOT touch Render/PostgreSQL or the user's production warehouse.db.

Usage from repo root after installing requirements:
  python scripts/local_sqlite_write_loop_verify.py

The test creates a temp DATABASE_URL=sqlite:///... file, logs in with a sentinel
user, and verifies:
庫存 -> 訂單 -> 總單 -> 出貨預覽 -> 出貨確認 -> 位置查詢 -> 今日異動 -> 診斷匯出.
"""
from __future__ import annotations
import json, os, sys, tempfile, time, importlib
from pathlib import Path
from typing import Any

EXPECTED_APP_VERSION = 'V119-V515-DIAGNOSTIC-100-HOME-LOGOUT-REMOVAL-PACK25'
EXPECTED_STATIC_VERSION = '119-v515_diagnostic_100_home_logout_removal_pack25'
EXPECTED_SCHEMA_VERSION = 'v515-diagnostic-100-home-logout-removal-pack25'
PACK_MARKER = 'V515_DIAGNOSTIC_100_HOME_LOGOUT_REMOVAL_PACK25'
SENTINEL_PRODUCT = '132×11*12=123*4 (-3揚玉)'
SENTINEL_PRODUCT_NORMALIZED = '132x11x12=123x4 (-3揚玉)'
EXPECTED_SENTINEL_QTY = 4


def fail(msg: str) -> None:
    raise AssertionError(msg)


def extract_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ('items','rows','data','records','changes','results','exact_customer_items'):
        val = payload.get(key)
        if isinstance(val, list):
            return [x for x in val if isinstance(x, dict)]
    for key in ('payload','result','preview'):
        out = extract_items(payload.get(key))
        if out:
            return out
    return []


def post_json(client, path: str, payload: dict[str, Any], expect_success: bool = True) -> dict[str, Any]:
    rv = client.post(path, data=json.dumps(payload, ensure_ascii=False), content_type='application/json')
    try:
        js = rv.get_json(silent=True) or {}
    except Exception:
        js = {}
    print(f'POST {path}: {rv.status_code} success={js.get("success")}')
    if rv.status_code >= 400:
        fail(f'{path} HTTP {rv.status_code}: {rv.get_data(as_text=True)[:800]}')
    if expect_success and isinstance(js, dict) and js.get('success') is False:
        fail(f'{path} returned success=false: {json.dumps(js, ensure_ascii=False)[:900]}')
    return js


def get_json(client, path: str, expect_success: bool = True) -> dict[str, Any]:
    rv = client.get(path)
    js = rv.get_json(silent=True) or {}
    print(f'GET {path}: {rv.status_code} success={js.get("success")}')
    if rv.status_code >= 400:
        fail(f'{path} HTTP {rv.status_code}: {rv.get_data(as_text=True)[:800]}')
    if expect_success and isinstance(js, dict) and js.get('success') is False:
        fail(f'{path} returned success=false: {json.dumps(js, ensure_ascii=False)[:900]}')
    return js


def assert_qty_rule(app_module) -> None:
    qty = None
    for fn_name in ('effective_product_qty','normalize_item_quantity'):
        fn = getattr(app_module, fn_name, None)
        if callable(fn):
            try:
                qty = int(fn(SENTINEL_PRODUCT, 0 if fn_name == 'effective_product_qty' else 1))
                break
            except TypeError:
                try:
                    qty = int(fn(SENTINEL_PRODUCT))
                    break
                except Exception:
                    pass
            except Exception:
                pass
    if qty != EXPECTED_SENTINEL_QTY:
        fail(f'件數規則錯誤：{SENTINEL_PRODUCT} expected {EXPECTED_SENTINEL_QTY}, got {qty}')


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    temp_dir = tempfile.TemporaryDirectory(prefix='yuanxing_v512_sqlite_loop_')
    db_path = Path(temp_dir.name) / 'write_loop.db'
    os.environ['DATABASE_URL'] = 'sqlite:///' + str(db_path)
    os.environ['SECRET_KEY'] = 'local-write-loop-secret'
    os.environ['YX_DISABLE_SCHEDULERS'] = '1'
    os.environ['FLASK_ENV'] = 'testing'
    sys.path.insert(0, str(repo))

    # Import after DATABASE_URL is set so db.py chooses the temp SQLite file.
    db = importlib.import_module('db')
    app_module = importlib.import_module('app')
    db.init_db()
    assert_qty_rule(app_module)

    flask_app = getattr(app_module, 'app')
    flask_app.config.update(TESTING=True, WTF_CSRF_ENABLED=False, SECRET_KEY='local-write-loop-secret')

    customer = 'ZZZ_V512本機閉環_' + str(int(time.time()))
    item = {'product_text': SENTINEL_PRODUCT, 'material': 'DF', 'qty': EXPECTED_SENTINEL_QTY, 'area': 'A', 'location': 'A'}
    with flask_app.test_client() as client:
        login = post_json(client, '/api/login', {'username': 'v512_local_tester', 'password': 'v512_local_password'})
        if not login.get('success'):
            fail('login failed')
        inv = post_json(client, '/api/inventory', {'customer_name': customer, 'region': '北區', 'items': [item], 'duplicate_mode': 'new', 'operation_id': 'v512-local-inv'})
        orders = post_json(client, '/api/orders', {'customer_name': customer, 'region': '北區', 'items': [item], 'duplicate_mode': 'new', 'operation_id': 'v512-local-order'})
        master = post_json(client, '/api/master_orders', {'customer_name': customer, 'region': '北區', 'items': [item], 'duplicate_mode': 'new', 'operation_id': 'v512-local-master'})
        # Read back with force to avoid stale fast-cache masking DB write failure.
        inv_read = get_json(client, '/api/inventory?force=1&all=1')
        ord_read = get_json(client, '/api/orders?force=1&all=1')
        mst_read = get_json(client, '/api/master_orders?force=1&all=1')
        raw_three = json.dumps([inv_read, ord_read, mst_read], ensure_ascii=False)
        if customer not in raw_three:
            fail('readback missing sentinel customer after inventory/orders/master writes')
        if '123x4' not in raw_three and '123X4' not in raw_three:
            fail('readback missing normalized x4 product after writes')

        preview = post_json(client, '/api/ship/preview', {'customer_name': customer, 'items': [{'customer_name': customer, 'product_text': SENTINEL_PRODUCT, 'material': 'DF', 'qty': 1, 'source_table': 'orders'}], 'operation_id': 'v512-local-preview'})
        preview_raw = json.dumps(preview, ensure_ascii=False)
        for token in ('before_qty','after_qty','volume','volume_formula'):
            if token not in preview_raw:
                fail('ship preview missing ' + token)
        token = preview.get('preview_token') or preview.get('token') or ((preview.get('preview') or {}).get('preview_token') if isinstance(preview.get('preview'), dict) else '')
        confirm_payload = {'customer_name': customer, 'items': [{'customer_name': customer, 'product_text': SENTINEL_PRODUCT, 'material': 'DF', 'qty': 1, 'source_table': 'orders'}], 'operation_id': 'v512-local-confirm'}
        if token:
            confirm_payload['preview_token'] = token
        confirm = post_json(client, '/api/ship/confirm', confirm_payload)
        confirm_raw = json.dumps(confirm, ensure_ascii=False)
        if 'shipping_records' not in confirm_raw and 'after_qty' not in confirm_raw:
            fail('ship confirm did not expose shipping_records/after_qty evidence')

        loc = get_json(client, '/api/product-locations?customer_name=' + customer)
        today = get_json(client, '/api/today-changes?manual_refresh=1')
        diag = get_json(client, '/api/diagnostics/export')
        evidence = get_json(client, '/api/health/final-evidence-bundle')
        local_ready = get_json(client, '/api/health/local-write-loop-readiness')
        if not local_ready.get('ready'):
            fail('local write-loop readiness endpoint is not ready')
        if 'local_write_loop_readiness' not in json.dumps(evidence, ensure_ascii=False):
            fail('final evidence bundle missing local_write_loop_readiness')
        if 'operation_closed_loop_audit' not in json.dumps(diag, ensure_ascii=False):
            fail('diagnostics export missing operation closed loop audit')

    print('\nLOCAL SQLITE WRITE LOOP VERIFY OK')
    print('Temp DB used:', db_path)
    temp_dir.cleanup()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
