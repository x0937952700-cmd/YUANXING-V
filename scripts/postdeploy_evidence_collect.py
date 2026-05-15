#!/usr/bin/env python3
"""Yuanxing V515 postdeploy evidence collector.

Read-only. It logs in, fetches /api/health/postdeploy-evidence-report,
and writes two files you can paste back for the last repair pass:
  - JSON full evidence
  - TXT copy/paste summary

Example:
  python scripts/postdeploy_evidence_collect.py https://your-render-url --username USER --password PASS
"""
from __future__ import annotations
import argparse, json, sys, time, urllib.error, urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

EXPECTED_APP_VERSION='V119-V517-FULL-CHECKLIST-ALIGNMENT-PACK27'
EXPECTED_STATIC_VERSION='119-v517_full_checklist_alignment_pack27'
EXPECTED_SCHEMA_VERSION='v517-full-checklist-alignment-pack27'
EVIDENCE_PATH='/api/health/postdeploy-evidence-report'


def make_opener():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def request_json(op, base, path, method='GET', payload=None, timeout=60):
    data=None; headers={'User-Agent':'YuanxingPostdeployEvidenceCollect/1.0'}
    if payload is not None:
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8')
        headers['Content-Type']='application/json'
    req=urllib.request.Request(base.rstrip('/')+path, data=data, headers=headers, method=method)
    start=time.time()
    try:
        with op.open(req, timeout=timeout) as r:
            raw=r.read(8_000_000).decode('utf-8','ignore')
            try: js=json.loads(raw)
            except Exception: js=None
            return {'ok':True,'status':r.status,'elapsed_ms':round((time.time()-start)*1000,1),'json':js,'text':raw[:2000]}
    except urllib.error.HTTPError as e:
        raw=e.read(8000).decode('utf-8','ignore')
        return {'ok':False,'status':e.code,'elapsed_ms':round((time.time()-start)*1000,1),'text':raw[:2000]}
    except Exception as e:
        return {'ok':False,'status':None,'elapsed_ms':round((time.time()-start)*1000,1),'error':str(e)}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('base_url')
    ap.add_argument('--username', required=True)
    ap.add_argument('--password', required=True)
    ap.add_argument('--out-prefix', default='yuanxing_v515_postdeploy_evidence')
    ap.add_argument('--strict-version', action='store_true')
    args=ap.parse_args()
    base=args.base_url.rstrip('/'); op=make_opener(); failures=[]; warnings=[]
    print('Postdeploy evidence target:', base)
    login=request_json(op, base, '/api/login', method='POST', payload={'username':args.username,'password':args.password}, timeout=30)
    print(f"LOGIN: status={login.get('status')} elapsed={login.get('elapsed_ms')}ms")
    if not login.get('ok') or not (isinstance(login.get('json'),dict) and login['json'].get('success')):
        failures.append('login failed: '+str(login.get('status'))+' '+str(login.get('error') or login.get('text')))
        evidence={'success':False,'failures':failures,'login':login}
    else:
        res=request_json(op, base, EVIDENCE_PATH, timeout=90)
        print(f"READ {EVIDENCE_PATH}: status={res.get('status')} elapsed={res.get('elapsed_ms')}ms")
        evidence=res.get('json') if isinstance(res.get('json'),dict) else {'success':False,'error':res.get('error') or res.get('text'), 'status':res.get('status')}
        if not res.get('ok'):
            failures.append(f'{EVIDENCE_PATH} failed: {res.get("status")} {res.get("error") or res.get("text")}')
        if evidence.get('no_mutation') is not True:
            failures.append(EVIDENCE_PATH + ' is not marked no_mutation')
        if args.strict_version:
            if evidence.get('version') != EXPECTED_APP_VERSION: failures.append('app version mismatch: '+str(evidence.get('version')))
            if evidence.get('static_version') != EXPECTED_STATIC_VERSION: failures.append('static version mismatch: '+str(evidence.get('static_version')))
            if evidence.get('api_schema_version') != EXPECTED_SCHEMA_VERSION: failures.append('schema version mismatch: '+str(evidence.get('api_schema_version')))
        for row in evidence.get('warnings') or []:
            warnings.append(str((row or {}).get('detail') or (row or {}).get('title') or row)[:300])
    output={'target':base,'generated_at':time.strftime('%Y-%m-%d %H:%M:%S'),'expected':{'app':EXPECTED_APP_VERSION,'static':EXPECTED_STATIC_VERSION,'schema':EXPECTED_SCHEMA_VERSION},'failures':failures,'warnings':warnings,'evidence':evidence}
    json_path=Path(args.out_prefix + '.json')
    txt_path=Path(args.out_prefix + '.txt')
    json_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    summary=evidence.get('copy_paste_summary') if isinstance(evidence,dict) else ''
    if not summary:
        summary='沅興木業 V515 部署後證據摘要\n'+'failures='+json.dumps(failures, ensure_ascii=False)+'\nwarnings='+json.dumps(warnings[:8], ensure_ascii=False)
    txt_path.write_text(summary+'\n\nJSON file: '+str(json_path)+'\n', encoding='utf-8')
    print('Saved:', json_path)
    print('Saved:', txt_path)
    print('\nCOPY/PASTE SUMMARY')
    print(summary)
    if failures:
        print('\nPOSTDEPLOY EVIDENCE COLLECT FAILED')
        for f in failures: print('-', f)
        return 1
    print('\nPOSTDEPLOY EVIDENCE COLLECT OK')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
