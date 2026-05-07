#!/usr/bin/env python3
"""V132 Render release DB init helper.
Runs migrations in a release/background process, prints JSON diagnostics, and exits 0 by default
so the web process can still open its port. Use YX_RELEASE_INIT_STRICT=1 to fail deploy on DB init errors.
"""
import json, os, time, traceback
started=time.time()
out={"success": False, "version":"V132", "seconds": 0}
try:
    from db import init_db, table_counts, database_mode_info, get_db, USE_POSTGRES
    init_db()
    out={"success": True, "version":"V132", "seconds": round(time.time()-started,3), "db_info": database_mode_info(), "counts": table_counts()}
except Exception as e:
    out={"success": False, "version":"V132", "seconds": round(time.time()-started,3), "error": str(e), "traceback_tail": traceback.format_exc()[-3000:]}
print(json.dumps(out, ensure_ascii=False, indent=2), flush=True)
if not out.get('success') and os.getenv('YX_RELEASE_INIT_STRICT','0') in ('1','true','yes'):
    raise SystemExit(1)
raise SystemExit(0)
