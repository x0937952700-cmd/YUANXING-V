#!/usr/bin/env python3
"""Yuanxing deploy smoke test.
Run after deploy:
  python scripts/smoke_test.py https://your-render-url
For protected endpoint checks use:
  python scripts/deploy_smoke_verify.py https://your-render-url --username USER --password PASS
This script only reads public endpoints and never mutates data.
"""
import json, sys, urllib.request, urllib.error, time
EXPECTED='V119-V518-RESTORE-SATISFIED-SHIP-PREVIEW-DIAG-PACK28'
base=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:10000').rstrip('/')
paths=['/health','/api/health']
failed=[]
for path in paths:
    url=base+path
    start=time.time()
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            raw=r.read(2000).decode('utf-8', errors='ignore')
            elapsed=round((time.time()-start)*1000,1)
            print(f'OK {path}: {r.status} {elapsed}ms {raw[:180]}')
            try:
                data=json.loads(raw)
                ver=data.get('app_version') or data.get('version')
                if ver and ver != EXPECTED:
                    print(f'WARN {path}: version is {ver}, expected {EXPECTED}')
            except Exception:
                pass
    except urllib.error.HTTPError as e:
        print(f'FAIL {path}: HTTP {e.code}')
        failed.append(path)
    except Exception as e:
        print(f'FAIL {path}: {e}')
        failed.append(path)
if failed:
    raise SystemExit(1)
print('Smoke test completed. Use deploy_smoke_verify.py with login credentials for full protected checks.')
