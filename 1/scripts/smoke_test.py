#!/usr/bin/env python3
"""Yuanxing deploy smoke test.
Run after deploy locally or on Render shell:
  python scripts/smoke_test.py https://your-render-url
It only reads endpoints; it does not mutate business data.
"""
import json, sys, urllib.request, urllib.error

base = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:10000').rstrip('/')
paths = ['/health']
# authenticated endpoints may return 401/302 when not logged in; route existence is still checked by status not being 404.
paths += ['/api/health/extended', '/api/health/smoke', '/api/health/api-schema', '/api/health/event-flow', '/api/shipping', '/api/today', '/api/warehouse/cells', '/api/today-changes/badge']
failed = []
for path in paths:
    url = base + path
    try:
        with urllib.request.urlopen(url, timeout=12) as r:
            body = r.read(800).decode('utf-8', errors='ignore')
            print(f'OK {path}: {r.status} {body[:120]}')
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 302):
            print(f'PROTECTED {path}: {e.code}')
        else:
            print(f'FAIL {path}: HTTP {e.code}')
            failed.append(path)
    except Exception as e:
        print(f'FAIL {path}: {e}')
        failed.append(path)
if failed:
    raise SystemExit(1)
print('Smoke test completed.')
