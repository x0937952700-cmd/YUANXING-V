#!/usr/bin/env python3
"""Yuanxing V513 write-test-safety postdeploy verifier.

Read-only by default:
  python scripts/postdeploy_final_gap_verify.py https://your-render-url --username USER --password PASS

For the last mile, first create a backup, then run the existing closed-loop write test explicitly:
  python scripts/postdeploy_operation_closed_loop_verify.py https://your-render-url --username USER --password PASS --write-test
"""
from __future__ import annotations
import argparse, json, sys, time, urllib.error, urllib.request
from http.cookiejar import CookieJar

EXPECTED_APP_VERSION='V119-V517-FULL-CHECKLIST-ALIGNMENT-PACK27'
EXPECTED_STATIC_VERSION='119-v517_full_checklist_alignment_pack27'
EXPECTED_SCHEMA_VERSION='v517-full-checklist-alignment-pack27'
PATHS=[
    '/api/health/release-readiness',
    '/api/health/operation-closed-loop',
    '/api/health/final-gap-report',
    '/api/health/final-evidence-bundle',
    '/api/health/local-write-loop-readiness',
    '/api/diagnostics/export',
]

def opener():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

def request_json(op, base, path, method='GET', payload=None, timeout=30):
    data=None; headers={'User-Agent':'YuanxingFinalGapVerify/1.0'}
    if payload is not None:
        data=json.dumps(payload,ensure_ascii=False).encode('utf-8'); headers['Content-Type']='application/json'
    req=urllib.request.Request(base.rstrip('/')+path, data=data, headers=headers, method=method)
    start=time.time()
    try:
        with op.open(req, timeout=timeout) as r:
            raw=r.read(2_000_000).decode('utf-8','ignore')
            try: js=json.loads(raw)
            except Exception: js=None
            return {'ok':True,'status':r.status,'elapsed_ms':round((time.time()-start)*1000,1),'json':js,'text':raw[:1000]}
    except urllib.error.HTTPError as e:
        raw=e.read(4000).decode('utf-8','ignore')
        return {'ok':False,'status':e.code,'elapsed_ms':round((time.time()-start)*1000,1),'text':raw[:1200]}
    except Exception as e:
        return {'ok':False,'status':None,'elapsed_ms':round((time.time()-start)*1000,1),'error':str(e)}

def login(op, base, username, password, failures):
    res=request_json(op, base, '/api/login', method='POST', payload={'username':username,'password':password}, timeout=25)
    print(f"LOGIN: status={res.get('status')} elapsed={res.get('elapsed_ms')}ms")
    if not res.get('ok') or not (isinstance(res.get('json'),dict) and res['json'].get('success')):
        failures.append('login failed: '+str(res.get('status'))+' '+str(res.get('error') or res.get('text')))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('base_url')
    ap.add_argument('--username', required=True)
    ap.add_argument('--password', required=True)
    ap.add_argument('--strict-version', action='store_true')
    args=ap.parse_args()
    base=args.base_url.rstrip('/'); op=opener(); failures=[]; warnings=[]
    print('Final gap target:', base)
    print('Expected:', EXPECTED_APP_VERSION, EXPECTED_STATIC_VERSION, EXPECTED_SCHEMA_VERSION)
    login(op, base, args.username, args.password, failures)
    if not failures:
        for path in PATHS:
            res=request_json(op, base, path, timeout=45)
            print(f"READ {path}: status={res.get('status')} elapsed={res.get('elapsed_ms')}ms")
            if not res.get('ok'):
                failures.append(f'{path} failed: {res.get("status")} {res.get("error") or res.get("text")}')
                continue
            js=res.get('json') if isinstance(res.get('json'),dict) else {}
            if path != '/api/diagnostics/export':
                if js.get('no_mutation') is not True:
                    failures.append(f'{path} is not marked no_mutation')
                if js.get('success') is False or js.get('ready') is False:
                    warnings.append(f'{path} reports not fully ready: '+json.dumps(js.get('issues') or js.get('warnings') or [], ensure_ascii=False)[:900])
            if args.strict_version:
                app_v=js.get('version') or js.get('app_version'); static_v=js.get('static_version'); schema_v=js.get('api_schema_version')
                if app_v and app_v != EXPECTED_APP_VERSION: failures.append(f'{path} app version mismatch: {app_v}')
                if static_v and static_v != EXPECTED_STATIC_VERSION: failures.append(f'{path} static version mismatch: {static_v}')
                if schema_v and schema_v != EXPECTED_SCHEMA_VERSION: failures.append(f'{path} schema version mismatch: {schema_v}')
            if path in ('/api/health/final-gap-report','/api/health/final-evidence-bundle',
    '/api/health/local-write-loop-readiness') and isinstance(js, dict):
                pct=js.get('ready_percent_estimate') or (js.get('summary') or {}).get('ready_percent_estimate')
                print('  ready_percent_estimate=', pct)
                if js.get('summary',{}).get('can_claim_100_percent') is True:
                    warnings.append('final-gap endpoint says 100% claimable; verify write-test proof is attached')
                remaining=js.get('remaining_to_100') or []
                if remaining:
                    print('  remaining_to_100:', '; '.join(str(x) for x in remaining[:5]))
            if path == '/api/diagnostics/export' and isinstance(js, dict):
                if 'final_gap_report' not in js:
                    warnings.append('diagnostics export missing final_gap_report')
    if failures:
        print('\nFINAL GAP VERIFY FAILED')
        for f in failures: print('-', f)
        if warnings:
            print('\nWARNINGS')
            for w in warnings: print('-', w)
        return 1
    if warnings:
        print('\nWARNINGS')
        for w in warnings: print('-', w)
    print('\nFINAL GAP VERIFY OK')
    return 0
if __name__=='__main__':
    raise SystemExit(main())
