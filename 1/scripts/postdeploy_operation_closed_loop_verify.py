#!/usr/bin/env python3
"""Yuanxing V510 operation closed-loop verifier.

Default mode is read-only and safe:
  python scripts/postdeploy_operation_closed_loop_verify.py https://your-render-url --username USER --password PASS

Optional write test is intentionally hard to run by accident and creates sentinel test data:
  python scripts/postdeploy_operation_closed_loop_verify.py https://your-render-url --username USER --password PASS --write-test --i-understand-this-writes-data --backup-confirmed

The write test is best used on a staging DB or after a backup. It refuses to run without a second confirmation plus backup confirmation, uses a unique sentinel customer
name and checks the chain: inventory -> orders -> master_orders -> ship preview/confirm ->
product locations -> today changes -> diagnostics export.
"""
from __future__ import annotations
import argparse, json, sys, time, urllib.error, urllib.parse, urllib.request
from http.cookiejar import CookieJar
from typing import Any

EXPECTED_APP_VERSION = 'V119-V518-RESTORE-SATISFIED-SHIP-PREVIEW-DIAG-PACK28'
EXPECTED_STATIC_VERSION = '119-v518_restore_satisfied_ship_preview_diag_pack28'
EXPECTED_SCHEMA_VERSION = 'v518-restore-satisfied-ship-preview-diag-pack28'
PACK_MARKER = 'V518_RESTORE_SATISFIED_SHIP_PREVIEW_DIAG_PACK25'

READ_ONLY_PATHS = [
    '/api/health',
    '/api/health/release-readiness',
    '/api/health/operation-closed-loop',
    '/api/health/api-schema',
    '/api/inventory?limit=5&v=' + EXPECTED_STATIC_VERSION,
    '/api/orders?limit=5&v=' + EXPECTED_STATIC_VERSION,
    '/api/master_orders?limit=5&v=' + EXPECTED_STATIC_VERSION,
    '/api/warehouse/available-items?fast=1&v=' + EXPECTED_STATIC_VERSION,
    '/api/today-changes/count',
    '/api/diagnostics/export',
]


def make_opener():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def request_json(opener, base: str, path: str, method='GET', payload=None, timeout=25):
    url = base.rstrip('/') + path
    data = None
    headers = {'User-Agent': 'YuanxingV513WriteTestSafety/1.0'}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    start = time.time()
    try:
        with opener.open(req, timeout=timeout) as r:
            raw = r.read(1_500_000).decode('utf-8', errors='ignore')
            parsed = None
            if raw.strip().startswith(('{','[')):
                try: parsed = json.loads(raw)
                except Exception: parsed = None
            return {'ok': True, 'status': r.status, 'elapsed_ms': round((time.time()-start)*1000,1), 'json': parsed, 'text': raw[:1000]}
    except urllib.error.HTTPError as e:
        raw = e.read(6000).decode('utf-8', errors='ignore')
        return {'ok': False, 'status': e.code, 'elapsed_ms': round((time.time()-start)*1000,1), 'text': raw[:1200]}
    except Exception as e:
        return {'ok': False, 'status': None, 'elapsed_ms': round((time.time()-start)*1000,1), 'error': str(e)}


def items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list): return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict): return []
    for k in ('items','rows','data','records','changes','results'):
        v = payload.get(k)
        if isinstance(v, list): return [x for x in v if isinstance(x, dict)]
    for k in ('payload','result'):
        out = items(payload.get(k))
        if out: return out
    return []


def version_from(payload: Any) -> tuple[str,str,str]:
    if not isinstance(payload, dict): return '', '', ''
    return str(payload.get('app_version') or payload.get('version') or ''), str(payload.get('static_version') or ''), str(payload.get('api_schema_version') or payload.get('schema_version') or '')


def login(opener, base: str, username: str, password: str, failures: list[str]):
    res = request_json(opener, base, '/api/login', method='POST', payload={'username': username, 'password': password}, timeout=25)
    print(f"LOGIN status={res.get('status')} elapsed={res.get('elapsed_ms')}ms")
    if not res.get('ok') or not (isinstance(res.get('json'), dict) and res['json'].get('success')):
        failures.append('login failed: ' + str(res.get('status')) + ' ' + str(res.get('error') or res.get('text')))
    return res


def read_only_checks(opener, base: str, strict_version: bool) -> tuple[list[str], list[str]]:
    failures, warnings = [], []
    for path in READ_ONLY_PATHS:
        res = request_json(opener, base, path, timeout=35)
        print(f"READ {path}: status={res.get('status')} elapsed={res.get('elapsed_ms')}ms")
        if not res.get('ok') or res.get('status') not in (200,204):
            failures.append(f'{path} failed: {res.get("status")} {res.get("error") or res.get("text")}')
            continue
        js = res.get('json')
        app_v, static_v, schema_v = version_from(js)
        if strict_version:
            if app_v and app_v != EXPECTED_APP_VERSION: failures.append(f'{path} app version mismatch: {app_v}')
            if static_v and static_v != EXPECTED_STATIC_VERSION: failures.append(f'{path} static version mismatch: {static_v}')
            if schema_v and schema_v != EXPECTED_SCHEMA_VERSION: failures.append(f'{path} schema version mismatch: {schema_v}')
        if path == '/api/health/operation-closed-loop' and isinstance(js, dict):
            if js.get('no_mutation') is not True: failures.append('operation closed-loop endpoint must be read-only/no_mutation')
            if js.get('success') is False or js.get('ready') is False:
                failures.append('operation closed-loop endpoint reports not ready: ' + json.dumps(js.get('issues') or js.get('checks'), ensure_ascii=False)[:900])
        if path == '/api/diagnostics/export' and isinstance(js, dict):
            if 'operation_closed_loop_audit' not in js:
                warnings.append('diagnostics export missing operation_closed_loop_audit')
    return failures, warnings


def pick_id(payload: Any, customer: str) -> int | None:
    for row in items(payload):
        if customer and str(row.get('customer_name') or row.get('customer') or '') != customer:
            continue
        try:
            if row.get('id') is not None: return int(row.get('id'))
        except Exception:
            pass
    return None



def pre_write_safety_check(args, failures: list[str], warnings: list[str]) -> bool:
    """Never allow a production write-test to run by accidental paste/click."""
    if not args.i_understand_this_writes_data:
        failures.append('write-test refused: add --i-understand-this-writes-data to confirm you know this writes sentinel rows')
    if not args.backup_confirmed and not args.allow_without_backup:
        failures.append('write-test refused: create/verify a backup first, then add --backup-confirmed; use --allow-without-backup only for disposable staging DB')
    if args.allow_without_backup:
        warnings.append('backup confirmation bypassed by --allow-without-backup; only safe on disposable staging DB')
    return not failures


def collect_sentinel_rows(opener, base: str, customer: str) -> list[dict[str, Any]]:
    """Find sentinel rows created by this script so cleanup can remove only test data."""
    found: list[dict[str, Any]] = []
    endpoints = [('inventory','/api/inventory'), ('orders','/api/orders'), ('master_orders','/api/master_orders')]
    for source, path in endpoints:
        q = urllib.parse.urlencode({'q': customer, 'customer_name': customer, 'limit': 200, 'v': EXPECTED_STATIC_VERSION})
        res = request_json(opener, base, path + '?' + q, timeout=35)
        payload = res.get('json') if isinstance(res, dict) else None
        for row in items(payload):
            cname = str(row.get('customer_name') or row.get('customer') or '')
            if cname != customer:
                continue
            try:
                rid = int(row.get('id') or 0)
            except Exception:
                rid = 0
            if rid > 0:
                found.append({'source': source, 'id': rid, 'customer_name': customer})
    return found


def cleanup_sentinel_data(opener, base: str, customer: str) -> tuple[list[str], list[str]]:
    """Best-effort cleanup for rows created by --write-test. It only targets the sentinel customer."""
    failures: list[str] = []
    warnings: list[str] = []
    rows = collect_sentinel_rows(opener, base, customer)
    if not rows:
        warnings.append('cleanup found no inventory/order/master sentinel rows; shipping/today audit records may remain as evidence')
        return failures, warnings
    res = request_json(opener, base, '/api/customer-items/batch-delete', method='POST', payload={'items': rows, 'operation_id': 'v513-cleanup-' + str(int(time.time()))}, timeout=45)
    print(f"CLEANUP /api/customer-items/batch-delete: status={res.get('status')} elapsed={res.get('elapsed_ms')}ms rows={len(rows)}")
    if not res.get('ok') or not (isinstance(res.get('json'), dict) and res['json'].get('success') is not False):
        failures.append('sentinel cleanup failed: ' + str(res.get('status')) + ' ' + str(res.get('error') or res.get('text')))
    return failures, warnings

def explicit_write_test(opener, base: str, keep_test_data: bool=False) -> tuple[list[str], list[str]]:
    failures, warnings = [], []
    stamp = str(int(time.time()))
    customer = f'YX_WRITE_TEST_V515_{stamp}'
    product = '132x11x12=123x4 (-3揚玉)'
    common_item = {'product_text': product, 'material': 'DF', 'qty': 4, 'area': 'A', 'location': 'A'}
    def post(path, payload):
        res = request_json(opener, base, path, method='POST', payload=payload, timeout=40)
        print(f"WRITE {path}: status={res.get('status')} elapsed={res.get('elapsed_ms')}ms")
        if not res.get('ok') or not (isinstance(res.get('json'), dict) and res['json'].get('success') is not False):
            failures.append(f'{path} write failed: {res.get("status")} {res.get("error") or res.get("text")}')
        return res.get('json')

    inv = post('/api/inventory', {'customer_name': customer, 'region': '北區', 'items': [common_item], 'duplicate_mode': 'new', 'fast_write': True, 'operation_id': 'v513-inv-' + stamp})
    orders = post('/api/orders', {'customer_name': customer, 'region': '北區', 'items': [common_item], 'duplicate_mode': 'new', 'fast_write': True, 'operation_id': 'v513-order-' + stamp})
    master = post('/api/master_orders', {'customer_name': customer, 'region': '北區', 'items': [common_item], 'duplicate_mode': 'new', 'fast_write': True, 'operation_id': 'v513-master-' + stamp})
    preview = post('/api/ship/preview', {'customer_name': customer, 'items': [{'customer_name': customer, 'product_text': product, 'material': 'DF', 'qty': 1, 'source_table': 'orders'}], 'operation_id': 'v513-preview-' + stamp})
    if isinstance(preview, dict):
        raw = json.dumps(preview, ensure_ascii=False)
        for token in ('before_qty','after_qty','volume','volume_formula'):
            if token not in raw:
                warnings.append(f'ship preview did not expose {token}')
    confirm = post('/api/ship/confirm', {'customer_name': customer, 'items': [{'customer_name': customer, 'product_text': product, 'material': 'DF', 'qty': 1, 'source_table': 'orders'}], 'operation_id': 'v513-confirm-' + stamp})
    loc_q = urllib.parse.urlencode({'customer_name': customer, 'product_text': product})
    loc = request_json(opener, base, '/api/product-locations?' + loc_q, timeout=30)
    print(f"READ product locations: status={loc.get('status')} elapsed={loc.get('elapsed_ms')}ms")
    if not loc.get('ok'):
        failures.append('product-locations failed after write test')
    today = request_json(opener, base, '/api/today-changes?manual_refresh=1', timeout=30)
    print(f"READ today changes: status={today.get('status')} elapsed={today.get('elapsed_ms')}ms")
    if not today.get('ok'):
        failures.append('today changes failed after write test')
    else:
        raw = json.dumps(today.get('json'), ensure_ascii=False)
        if customer not in raw and '出貨' not in raw:
            warnings.append('today changes did not visibly include sentinel customer/shipping action; verify today_changes DB writes')
    diag = request_json(opener, base, '/api/diagnostics/export', timeout=35)
    if not diag.get('ok'):
        failures.append('diagnostics export failed after write test')
    if keep_test_data:
        warnings.append('sentinel test rows kept by --keep-test-data; remove customer ' + customer + ' after verification')
    else:
        cf, cw = cleanup_sentinel_data(opener, base, customer)
        failures.extend(cf); warnings.extend(cw)
    return failures, warnings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('base_url')
    ap.add_argument('--username', required=True)
    ap.add_argument('--password', required=True)
    ap.add_argument('--strict-version', action='store_true')
    ap.add_argument('--write-test', action='store_true', help='explicitly create sentinel test data; use staging or backup first')
    ap.add_argument('--i-understand-this-writes-data', action='store_true', help='required with --write-test; confirms this writes sentinel rows')
    ap.add_argument('--backup-confirmed', action='store_true', help='required with --write-test unless using disposable staging DB')
    ap.add_argument('--allow-without-backup', action='store_true', help='override backup confirmation only for disposable staging DB')
    ap.add_argument('--keep-test-data', action='store_true', help='do not cleanup sentinel inventory/order/master rows after write-test')
    args = ap.parse_args()
    base = args.base_url.rstrip('/')
    opener = make_opener()
    failures, warnings = [], []
    print('Operation closed-loop target:', base)
    print('Expected:', EXPECTED_APP_VERSION, EXPECTED_STATIC_VERSION, EXPECTED_SCHEMA_VERSION)
    login(opener, base, args.username, args.password, failures)
    if not failures:
        f, w = read_only_checks(opener, base, args.strict_version)
        failures.extend(f); warnings.extend(w)
    if args.write_test and not failures:
        print('WRITE TEST REQUESTED: verifying safety confirmations')
        if pre_write_safety_check(args, failures, warnings):
            print('WRITE TEST ENABLED: creating sentinel operation chain')
            f, w = explicit_write_test(opener, base, keep_test_data=args.keep_test_data)
        else:
            f, w = [], []
        failures.extend(f); warnings.extend(w)
    else:
        warnings.append('write-test skipped; use --write-test on staging/after backup for full DB mutation verification')
    if failures:
        print('\nOPERATION CLOSED LOOP VERIFY FAILED')
        for f in failures: print('-', f)
        if warnings:
            print('\nWARNINGS')
            for w in warnings: print('-', w)
        return 1
    if warnings:
        print('\nWARNINGS')
        for w in warnings: print('-', w)
    print('\nOPERATION CLOSED LOOP VERIFY OK')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
