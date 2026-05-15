#!/usr/bin/env python3
"""Yuanxing V513 write-test safety bundle postdeploy verifier.

Read-only by default:
  python scripts/postdeploy_final_evidence_verify.py https://your-render-url --username USER --password PASS

This collects one compact JSON evidence file from /api/health/postdeploy-evidence-report plus /api/health/final-evidence-bundle.
For the last 100% proof, first create a backup, then run:
  python scripts/postdeploy_operation_closed_loop_verify.py https://your-render-url --username USER --password PASS --write-test
"""
from __future__ import annotations
import argparse, json, sys, time, urllib.error, urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

EXPECTED_APP_VERSION='V119-V514-POSTDEPLOY-EVIDENCE-COLLECTOR-PACK24'
EXPECTED_STATIC_VERSION='119-v514_postdeploy_evidence_collector_pack24'
EXPECTED_SCHEMA_VERSION='v514-postdeploy-evidence-collector-pack24'
PATHS=[
    '/api/health/postdeploy-evidence-report',
    '/api/health/final-evidence-bundle',
    '/api/health/local-write-loop-readiness',
    '/api/health/write-test-safety',
    '/api/health/final-gap-report',
    '/api/health/operation-closed-loop',
    '/api/health/release-readiness',
]

def make_opener():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

def request_json(op, base, path, method='GET', payload=None, timeout=45):
    data=None; headers={'User-Agent':'YuanxingFinalEvidenceVerify/1.0'}
    if payload is not None:
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'); headers['Content-Type']='application/json'
    req=urllib.request.Request(base.rstrip('/')+path, data=data, headers=headers, method=method)
    start=time.time()
    try:
        with op.open(req, timeout=timeout) as r:
            raw=r.read(4_000_000).decode('utf-8','ignore')
            try: js=json.loads(raw)
            except Exception: js=None
            return {'ok':True,'status':r.status,'elapsed_ms':round((time.time()-start)*1000,1),'json':js,'text':raw[:1200]}
    except urllib.error.HTTPError as e:
        raw=e.read(4000).decode('utf-8','ignore')
        return {'ok':False,'status':e.code,'elapsed_ms':round((time.time()-start)*1000,1),'text':raw[:1200]}
    except Exception as e:
        return {'ok':False,'status':None,'elapsed_ms':round((time.time()-start)*1000,1),'error':str(e)}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('base_url')
    ap.add_argument('--username', required=True)
    ap.add_argument('--password', required=True)
    ap.add_argument('--out', default='final_evidence_bundle_result.json')
    ap.add_argument('--strict-version', action='store_true')
    args=ap.parse_args()
    base=args.base_url.rstrip('/'); op=make_opener(); failures=[]; warnings=[]; evidence={}
    print('Final evidence target:', base)
    print('Expected:', EXPECTED_APP_VERSION, EXPECTED_STATIC_VERSION, EXPECTED_SCHEMA_VERSION)
    login=request_json(op, base, '/api/login', method='POST', payload={'username':args.username,'password':args.password}, timeout=25)
    print(f"LOGIN: status={login.get('status')} elapsed={login.get('elapsed_ms')}ms")
    if not login.get('ok') or not (isinstance(login.get('json'),dict) and login['json'].get('success')):
        failures.append('login failed: '+str(login.get('status'))+' '+str(login.get('error') or login.get('text')))
    else:
        for path in PATHS:
            res=request_json(op, base, path, timeout=60)
            print(f"READ {path}: status={res.get('status')} elapsed={res.get('elapsed_ms')}ms")
            evidence[path]=res.get('json') if isinstance(res.get('json'),dict) else {'raw':res.get('text'), 'error':res.get('error')}
            if not res.get('ok'):
                failures.append(f'{path} failed: {res.get("status")} {res.get("error") or res.get("text")}')
                continue
            js=res.get('json') if isinstance(res.get('json'),dict) else {}
            if js.get('no_mutation') is not True:
                failures.append(f'{path} is not marked no_mutation')
            if path == '/api/health/final-evidence-bundle':
                pct=js.get('ready_percent_estimate') or (js.get('summary') or {}).get('ready_percent_estimate')
                print('  final evidence ready_percent_estimate=', pct)
                if not js.get('endpoints'):
                    failures.append('final evidence bundle missing endpoints')
                if js.get('summary',{}).get('can_claim_100_percent') is True:
                    warnings.append('final evidence says 100%; confirm write-test proof is attached')
            if args.strict_version:
                app_v=js.get('version') or js.get('app_version'); static_v=js.get('static_version'); schema_v=js.get('api_schema_version') or js.get('schema_version')
                if app_v and app_v != EXPECTED_APP_VERSION: failures.append(f'{path} app version mismatch: {app_v}')
                if static_v and static_v != EXPECTED_STATIC_VERSION: failures.append(f'{path} static version mismatch: {static_v}')
                if schema_v and schema_v != EXPECTED_SCHEMA_VERSION: failures.append(f'{path} schema version mismatch: {schema_v}')
    out={'target':base,'generated_at':time.strftime('%Y-%m-%d %H:%M:%S'),'expected':{'app':EXPECTED_APP_VERSION,'static':EXPECTED_STATIC_VERSION,'schema':EXPECTED_SCHEMA_VERSION},'failures':failures,'warnings':warnings,'evidence':evidence}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Saved:', args.out)
    if failures:
        print('\nFINAL EVIDENCE VERIFY FAILED')
        for f in failures: print('-', f)
        if warnings:
            print('\nWARNINGS')
            for w in warnings: print('-', w)
        return 1
    if warnings:
        print('\nWARNINGS')
        for w in warnings: print('-', w)
    print('\nFINAL EVIDENCE VERIFY OK')
    return 0
if __name__=='__main__':
    raise SystemExit(main())
